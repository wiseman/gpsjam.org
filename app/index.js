const fs = require('fs');
const path = require('path')

const Mutex = require('async-mutex').Mutex;
const express = require("express");
const LRU = require('lru-cache');
const puppeteer = require("puppeteer");

const PORT = process.env.PORT || 3000;

app = express();

//setting view engine to ejs
app.set("view engine", "ejs");

app.use(express.static('public'));

//route for index page
app.get("/", function (req, res) {
    let urlStr = 'https://gpsjam.org';
    urlStr += req.url;
    const previewUrl = 'https://gpsjam.org/preview?u=' + encodeURIComponent(urlStr);
    const previewDesc = "Map showing potential GPS interference.";
    res.render("index", { url: urlStr, previewUrl, previewDesc });
});


//route for magic page
app.get("/magic", function (req, res) {
    res.render("magic");
});


app.listen(PORT, function () {
    console.log(`Server is running on port ${PORT}`);
});


// This preview screenshot generator does 3 things:
// 1. Uses puppeteer to render the page at a given URL and return a PNG.
// 2. Serializes puppeteer usage so we only screenshot one page at a time, to
//    keep memory usage down.
// 3. Caches screenshots (in memory) so we don't have to re-render a particular
//    URL every time.
class Previewer {
    constructor() {
        this.browser = null;
        this.browserUseCount = 0;
        this.cache = new LRU({ max: 100 });
        this.browserMutex = new Mutex();
        this.urlsInProgress = {};
    }

    async getPreview(url) {
        const urlStr = url.toString();
        return new Promise(async (resolve, reject) => {
            const cachedImage = this.cache.get(urlStr);
            if (cachedImage) {
                // If the url is already in the cache, we're done.
                console.log(`Cache hit for screenshot of url ${url}`);
                resolve(cachedImage);
            } else {
                if (this.urlsInProgress[urlStr]) {
                    // If someone else is already rendering this url, wait for
                    // them to finish then get it from the cache.
                    this.urlsInProgress[urlStr].push({ resolve, reject });
                    console.log(`Waiting for screenshot of ${url}, already in progress.`);
                } else {
                    // OK, fine, it's up to us to render this url.
                    console.log(`Getting screenshot of ${url}`);
                    this.urlsInProgress[urlStr] = [{ resolve, reject }];
                    const image = await this.getPreviewInternal(url);
                    this.cache.set(urlStr, image);
                    console.log(`Cache now has ${this.cache.size} entries`);
                    // Notify anyone else who was waiting for this url (since
                    // we've put the image in the cache, no more requests will
                    // be added to the queue for this url so urlsInProgress
                    // won't be changed under our noses).
                    this.urlsInProgress[urlStr].forEach(({ resolve, reject }) => {
                        resolve(image);
                    });
                    delete this.urlsInProgress[urlStr];
                }
            }
        });
    }

    async getPreviewInternal(url) {
        // Use the browserMutex to ensure we only ever screenshot one url at a
        // time.
        return await this.browserMutex.runExclusive(async () => {
            if (!this.browser || this.browserUseCount > 10) {
                // Not sure if this is necessary, but just in case let's create
                // a fresh browser after every 10 screenshots.
                console.log('Creating new browser');
                if (this.browser) {
                    console.log('Closing old browser');
                    await this.browser.close();
                }
                this.browser = await puppeteer.launch({
                    headless: true,
                    // Seems like we need to disable the sandbox to get this to
                    // work with most cloud providers (Vercel, bitnami).
                    args: ['--no-sandbox', '--disable-setuid-sandbox'],
                });
                this.browserUseCount = 0;
            }
            const page = await this.browser.newPage();
            this.browserUseCount += 1;

            // set the viewport size
            await page.setViewport({
                width: 800,
                height: 418,
                deviceScaleFactor: 1,
            });

            // tell the page to visit the url
            await page.goto(url.toString());
            const startTime = Date.now();
            await this.waitForScreenshotReady(page);
            console.log('Screenshot ready in ' + (Date.now() - startTime) + 'ms');
            // take a screenshot and save it in the screenshots directory
            const imageBuf = await page.screenshot();
            // close the browser
            await page.close();
            return imageBuf;
        });
    }

    // Waits for the custom event the page triggers to indicate that the map
    // layers are fully loaded and displayed and it's a good time to take a
    // screenshot.
    async waitForScreenshotReady(page, seconds) {
        seconds = seconds || 30;
        // Use race to implement a timeout.
        return Promise.race([
            page.evaluate(() => {
                return new Promise((resolve, reject) => {
                    map.on('screenshot-ready', () => {
                        resolve();
                    });
                });
            }),
            new Promise(resolve => setTimeout(resolve, seconds * 1000))
        ]);
    }

}


const previewer = new Previewer();

app.get("/preview", async (req, res) => {
    const startTime = Date.now();
    // Get the "u" query param.
    const urlStr = req.query.u;
    console.log('Screenshotting ' + urlStr);
    const url = new URL(urlStr);
    const params = url.searchParams;
    // Since we're rendering using a (virtual) browser window that's much
    // smaller than the size most people are looking at (800x418), as a hack we
    // zoom out a bit to still kinda show the same general region.
    const zoom = parseFloat(params.get('z')) - 1.0;
    const lat = parseFloat(params.get('lat'));
    const lon = parseFloat(params.get('lon'));
    if ((lat && !lon) || (!lat && lon)) {
        // Return a 404 if the query params are incomplete. The slackbot agent
        // always makes additional requests for mangled versions of the URL and
        // I don't know why, and we don't want to spend the resources to render
        // broken versions of the map.
        console.log('Incomplete query params.');
        res.status(404).send('Incomplete query params');
        return;
    }
    params.set('z', zoom.toString());
    params.set('screenshot', '');
    const imageBuf = await previewer.getPreview(url);
    console.log('Screenshot took ' + (Date.now() - startTime) + 'ms');
    res.setHeader('Content-Type', 'image/png');
    res.send(imageBuf);
});

