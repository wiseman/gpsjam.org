const fs = require('fs');
const path = require('path')

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
    let urlStr = req.protocol + '://' + req.hostname;
    if (PORT != 80) {
        urlStr += ':' + PORT;
    }
    urlStr += req.url;
    const url = encodeURIComponent(urlStr);
    const previewDesc = "Map showing potential GPS interference.";
    res.render("index", { url, previewDesc });
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

const PREVIEW_CACHE = new LRU({
    max: 100,
});
let PREVIEW_BROWSER;
let PREVIEW_BROWSER_USE_COUNT = 0;

app.get("/preview", async (req, res) => {
    // Get the "u" query param.
    const urlStr = req.query.u;
    console.log('Screenshotting ' + urlStr);
    let imageBuf;
    if (PREVIEW_CACHE.has(urlStr)) {
        console.log('Getting preview image from cache');
        imageBuf = PREVIEW_CACHE.get(urlStr);
    } else {
        const url = new URL(urlStr);
        console.log(url);
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

        if (!PREVIEW_BROWSER || PREVIEW_BROWSER_USE_COUNT > 10) {
            console.log('Creating new browser');
            if (PREVIEW_BROWSER) {
                console.log('Closing old browser');
                await PREVIEW_BROWSER.close();
            }
            PREVIEW_BROWSER = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });
            PREVIEW_BROWSER_USE_COUNT = 0;
        }
        const page = await PREVIEW_BROWSER.newPage();
        PREVIEW_BROWSER_USE_COUNT += 1;

        // set the viewport size
        await page.setViewport({
            width: 800,
            height: 418,
            deviceScaleFactor: 1,
        });

        // tell the page to visit the url
        await page.goto(url.toString());
        await delay(18000);
        // take a screenshot and save it in the screenshots directory
        imageBuf = await page.screenshot();
        PREVIEW_CACHE.set(urlStr, imageBuf);
        // Return the imageBuf in the response. Set the mime-type too.
        // close the browser
        await page.close();
    }
    res.setHeader('Content-Type', 'image/png');
    res.send(imageBuf);
});
