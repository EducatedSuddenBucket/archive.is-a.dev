const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const url = require('url');

const GITHUB_API_URL = 'https://api.github.com/repos/is-a-dev/register/contents/domains';
const TIMEOUT_MS = 15000; // 15 seconds
const visitedUrls = new Set();

const getCurrentDate = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${day}-${month}-${year}`;
};

const createDir = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

const downloadFile = async (fileUrl, savePath) => {
    try {
        const response = await axios({
            method: 'GET',
            url: fileUrl,
            responseType: 'arraybuffer',
            timeout: TIMEOUT_MS
        });
        fs.writeFileSync(savePath, response.data);
    } catch (err) {
        console.error(`Failed to download ${fileUrl}:`, err.message);
    }
};

const scrapePage = async (siteUrl, baseDir, siteDomain) => {
    if (visitedUrls.has(siteUrl)) {
        console.log(`Already visited ${siteUrl}. Skipping.`);
        return;
    }

    visitedUrls.add(siteUrl);

    try {
        const { data: html } = await axios.get(siteUrl, { timeout: TIMEOUT_MS });
        const $ = cheerio.load(html);

        const indexFilePath = path.join(baseDir, 'index.html');
        createDir(baseDir);
        fs.writeFileSync(indexFilePath, html);

        const resources = [];

        $('img, script, link').each((_, elem) => {
            const srcAttr = $(elem).attr('src') || $(elem).attr('href');
            if (
                srcAttr && 
                (srcAttr.startsWith('/') || 
                srcAttr.startsWith(siteDomain) || 
                !srcAttr.startsWith('http'))
            ) {
                const resourceUrl = url.resolve(siteUrl, srcAttr);
                if (resourceUrl.includes(siteDomain)) {
                    const resourcePath = path.join(baseDir, url.parse(srcAttr).pathname);
                    resources.push({ resourceUrl, resourcePath });
                }
            }
        });

        for (const { resourceUrl, resourcePath } of resources) {
            const resourceDir = path.dirname(resourcePath);
            createDir(resourceDir);
            await downloadFile(resourceUrl, resourcePath);
        }

        $('a').each(async (_, elem) => {
            const link = $(elem).attr('href');
            if (link && (link.startsWith('/') || link.includes(siteDomain))) {
                const linkedPageUrl = url.resolve(siteUrl, link);
                const linkedPageDir = path.join(baseDir, link);
                await scrapePage(linkedPageUrl, linkedPageDir, siteDomain);
            }
        });

    } catch (err) {
        if (err.code === 'ENOTFOUND') {
            console.warn(`Site ${siteUrl} not found. Skipping.`);
        } else if (err.code === 'ECONNABORTED') {
            console.warn(`Site ${siteUrl} took too long to respond. Skipping.`);
        } else {
            console.error(`Failed to scrape ${siteUrl}:`, err.message);
        }
    }
};

const main = async () => {
    try {
        const { data: files } = await axios.get(GITHUB_API_URL);

        for (const file of files) {
            if (file.name.endsWith('.json')) {
                const domain = file.name.replace('.json', '');
                const siteUrl = `https://${domain}.is-a.dev`;
                const dateDir = path.join(__dirname, `${domain}.is-a.dev`, getCurrentDate());
                await scrapePage(siteUrl, dateDir, siteUrl);
            }
        }
    } catch (err) {
        console.error('Failed to fetch JSON files:', err.message);
    }
};

main();
