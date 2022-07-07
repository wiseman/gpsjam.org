const fs = require('fs');
const path = require('path')

const express = require("express");
const puppeteer = require("puppeteer");

const PORT = process.env.PORT || 3000;

app = express();

//setting view engine to ejs
app.set("view engine", "ejs");

// Make css a static folder
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/fonts', express.static(path.join(__dirname, 'fonts')));
app.use('/data', express.static(path.join(__dirname, 'data')));

// This line is nonsense, but without it Vercel doesn't include the views
// directory and so the app throws an error because it can't find the templates.
// There's probably a better way to do this, but I don't know it. Vercel
// apparently does some magic inspection of the code and thinks we need this
// directory if we reference it here.
app.use('/views', express.static(path.join(__dirname, 'views')));

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
    const browser = await puppeteer.launch();
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

