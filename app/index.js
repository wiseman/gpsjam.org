const fs = require('fs');
const path = require('path')

const express = require("express");
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
    res.render("index", { url });
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

app.get("/preview", async (req, res) => {
    // Get the "u" query param.
    const urlStr = req.query.u;
    console.log('Screenshotting ' + urlStr);
    const url = new URL(urlStr);
    const params = url.searchParams;
    const zoom = parseFloat(params.get('z')) - 1.0;
    params.set('z', zoom.toString());
    params.set('screenshot', '');
    console.log(url);

    // launch a new headless browser
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    // set the viewport size
    await page.setViewport({
        width: 800,
        height: 418,
        deviceScaleFactor: 1,
    });

    // tell the page to visit the url
    await page.goto(url.toString());
    await delay(5000);
    // take a screenshot and save it in the screenshots directory
    const imageBuf = await page.screenshot();
    // Return the imageBuf in the response. Set the mime-type too.
    // close the browser
    await browser.close();
    res.setHeader('Content-Type', 'image/png');
    res.send(imageBuf);
});
