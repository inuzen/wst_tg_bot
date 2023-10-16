import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';

function findValueAndTimeParts(inputString: string, value: string) {
    const regex = /(\d{2}:\d{2})/g;
    const matches = inputString.match(regex);

    const containsValue = inputString.includes(value);
    if (containsValue) {
        if (matches && matches.length >= 2) {
            const startTime = matches[0];
            const endTime = matches[1];
            return `${value} water shortage today from ${startTime} til ${endTime} ${
                matches.length > 2 ? `. There are more times mentioned for ${value}` : ''
            }`;
        } else {
            return `${value} is mentioned but no time is given`;
        }
    } else {
        return null;
    }
}

export const scrap = async (searchString: string) => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    const url = 'https://www.gwp.ge/ka/gadaudebeli';
    await page.goto(url);
    const bodyHTML = await page.content();

    const selector = cheerio.load(bodyHTML);
    //
    const body = selector('body');
    const mostRecentLink = body.find('.table > tbody:nth-child(1) a').attr('href');
    const waterShortageUrl = `https://www.gwp.ge/${mostRecentLink}`;
    await page.goto(waterShortageUrl);
    const waterPageContent = await page.content();
    const waterPageSelector = cheerio.load(waterPageContent);
    await page.close();
    await browser.close();

    const waterBody = waterPageSelector('body');
    const districtList = waterBody.find('.initial > ul > li').toArray();

    const parseResultFormatted = districtList.reduce((acc, el) => {
        const checkedString = findValueAndTimeParts(waterPageSelector(el).text(), searchString);
        if (checkedString) {
            return checkedString;
        }
        return acc;
    }, `There is no mention of ${searchString} today`);

    const res = {
        waterShortageUrl,
        parseResultFormatted,
    };
    return res;
};
