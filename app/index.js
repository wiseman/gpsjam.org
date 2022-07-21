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


function delay(t, val) {
    return new Promise(function (resolve) {
        setTimeout(function () {
            resolve(val);
        }, t);
    });
}

class Previewer {
    constructor() {
        this.browser = null;
        this.browserUseCount = 0;
        this.cache = new LRU({ max: 100 });
        this.browserMutex = new Mutex();
        this.urlsInProgress = {};
    }

    async getPreview(url) {
        return new Promise(async (resolve, reject) => {
            const cachedImage = this.cache.get(url.toString());
            if (cachedImage) {
                console.log(`Cache hit for screenshot of url ${url}`);
                resolve(cachedImage);
            } else {
                if (this.urlsInProgress[url]) {
                    this.urlsInProgress[url].push({ resolve, reject });
                    console.log(`Waiting for screenshot of ${url}, already in progress.`);
                } else {
                    console.log(`Getting screenshot of ${url}`);
                    this.urlsInProgress[url] = [{ resolve, reject }];
                    const image = await this.getPreviewInternal(url);
                    this.cache.set(url.toString(), image);
                    // Since we've put the image in the cache, no more requests will
                    // be added to the queue for this url.
                    const promises = [...this.urlsInProgress[url]];
                    this.urlsInProgress[url].forEach(({ resolve, reject }) => {
                        resolve(image);
                    });
                    delete this.urlsInProgress[url];
                }
            }
        });
    }

    async getPreviewInternal(url) {
        // Use the browserMutex to serialize this.
        return await this.browserMutex.runExclusive(async () => {
            if (!this.browser || this.browserUseCount > 10) {
                console.log('Creating new browser');
                if (this.browser) {
                    console.log('Closing old browser');
                    await this.browser.close();
                }
                this.browser = await puppeteer.launch({
                    headless: true,
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

    async waitForScreenshotReady(page, seconds) {
        seconds = seconds || 30;
        // use race to implement a timeout
        return Promise.race([
            // add event listener and wait for event to fire before returning
            page.evaluate(() => {
                return new Promise((resolve, reject) => {
                    map.on('screenshot-ready', () => {
                        resolve(); // resolves when the event fires
                    });
                });
            }),

            // if the event does not fire fast enough then exit.
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
    const zoom = parseFloat(params.get('z')) - 1.0;
    const lat = parseFloat(params.get('lat'));
    const lon = parseFloat(params.get('lon'));
    if ((lat && !lon) || (!lat && lon)) {
        // Return a 404 if the query params are incomplete.
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

