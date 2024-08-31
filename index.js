const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const url = require('url');

const GITHUB_API_URL = 'https://api.github.com/repos/is-a-dev/register/contents/domains';

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
            responseType: 'arraybuffer'
        });
        fs.writeFileSync(savePath, response.data);
    } catch (err) {
        console.error(`Failed to download ${fileUrl}:`, err.message);
    }
};

const scrapePage = async (siteUrl, baseDir) => {
    try {
        const { data: html } = await axios.get(siteUrl);
        const $ = cheerio.load(html);

        const indexFilePath = path.join(baseDir, 'index.html');
        createDir(baseDir);
        fs.writeFileSync(indexFilePath, html);

        const resources = [];

        $('img, script, link').each((_, elem) => {
            const srcAttr = $(elem).attr('src') || $(elem).attr('href');
            if (srcAttr && (srcAttr.startsWith('/') || srcAttr.startsWith(siteUrl) || !srcAttr.startsWith('http'))) {
                const resourceUrl = url.resolve(siteUrl, srcAttr);
                const resourcePath = path.join(baseDir, url.parse(srcAttr).pathname);
                resources.push({ resourceUrl, resourcePath });
            }
        });

        for (const { resourceUrl, resourcePath } of resources) {
            const resourceDir = path.dirname(resourcePath);
            createDir(resourceDir);
            await downloadFile(resourceUrl, resourcePath);
        }

        $('a').each(async (_, elem) => {
            const link = $(elem).attr('href');
            if (link && (link.startsWith('/') || link.startsWith(siteUrl))) {
                const linkedPageUrl = url.resolve(siteUrl, link);
                const linkedPageDir = path.join(baseDir, link);
                await scrapePage(linkedPageUrl, linkedPageDir);
            }
        });

    } catch (err) {
        console.error(`Failed to scrape ${siteUrl}:`, err.message);
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
                await scrapePage(siteUrl, dateDir);
            }
        }
    } catch (err) {
        console.error('Failed to fetch JSON files:', err.message);
    }
};

main();
