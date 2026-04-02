#!/usr/bin/env node
/**
 * vitaldemo - VitalRecorder simulator
 *
 * Downloads sample .vital files from VitalDB and streams HL7 v2.6 data
 * to a VitalServer via Socket.IO, acting as a VitalRecorder client.
 *
 * Usage:
 *   npx vitaldemo [server_url]
 *   npx vitaldemo https://vitaldb.net
 *   npx vitaldemo https://my-server.com --vrcode MY_DEMO
 */

const { io } = require("socket.io-client");
const VitalFile = require("vitaldb-js");
const path = require("path");
const fs = require("fs");
const os = require("os");
const https = require("https");
const zlib = require("zlib");

// ─── CLI Arguments ──────────────────────────────────────────

const args = process.argv.slice(2);
let serverUrl = "https://vitaldb.net";
let vrcode = "VITALDEMO";

for (let i = 0; i < args.length; i++) {
    if (args[i] === "--vrcode" && args[i + 1]) {
        vrcode = args[++i];
    } else if (args[i] === "--help" || args[i] === "-h") {
        console.log("Usage: vitaldemo [server_url] [--vrcode CODE]");
        console.log("");
        console.log("  server_url   VitalServer URL (default: https://vitaldb.net)");
        console.log("  --vrcode     VitalRecorder code (default: VITALDEMO)");
        process.exit(0);
    } else if (!args[i].startsWith("-")) {
        serverUrl = args[i];
    }
}

// ─── Configuration ──────────────────────────────────────────

const SEND_INTERVAL_MS = 1000;
const VITAL_URLS = [
    "https://api.vitaldb.net/1.vital",
    "https://api.vitaldb.net/2.vital",
    "https://api.vitaldb.net/3.vital",
    "https://api.vitaldb.net/4.vital",
    "https://api.vitaldb.net/5.vital",
];

// ─── File Loading ───────────────────────────────────────────

/** @type {Map<number, object>} vrcode -> { vf, duration, tracks, dtstart, dtend } */
const files = new Map();
const serverStartTime = Date.now() / 1000;
let seqId = 1;

function download(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                file.close();
                fs.unlinkSync(destPath);
                download(res.headers.location, destPath).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                file.close();
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            res.pipe(file);
            file.on("finish", () => { file.close(); resolve(); });
            file.on("error", (err) => { fs.unlinkSync(destPath); reject(err); });
        }).on("error", (err) => {
            try { fs.unlinkSync(destPath); } catch (_) {}
            reject(err);
        });
    });
}

async function loadFromUrls(urls) {
    for (const url of urls) {
        const basename = path.basename(url);
        const bedId = parseInt(basename);
        const tmpPath = path.join(os.tmpdir(), `vital_${basename}`);

        process.stdout.write(`Downloading ${url} ... `);
        try {
            await download(url, tmpPath);
        } catch (err) {
            console.log(`FAILED: ${err.message}`);
            continue;
        }

        try {
            const vf = await new VitalFile(null, tmpPath);
            const duration = vf.dtend - vf.dtstart;

            if (duration <= 0) {
                console.log(`skipped (invalid duration)`);
                continue;
            }

            const tracks = {};
            for (const tid in vf.trks) {
                const trk = vf.trks[tid];
                if (trk._excluded || trk.recs.length === 0) continue;
                trk.recs.sort((a, b) => a.dt - b.dt);
                tracks[trk.dtname] = trk;
            }

            files.set(bedId, { vf, duration, tracks, dtstart: vf.dtstart, dtend: vf.dtend });
            console.log(`OK (${Object.keys(tracks).length} tracks, ${duration.toFixed(0)}s)`);
        } catch (err) {
            console.log(`FAILED: ${err.message}`);
        } finally {
            try { fs.unlinkSync(tmpPath); } catch (_) {}
        }
    }
}

// ─── HL7 Generation ─────────────────────────────────────────

function utToHl7(ut) {
    const d = new Date(ut * 1000);
    return d.getFullYear().toString()
        + String(d.getMonth() + 1).padStart(2, "0")
        + String(d.getDate()).padStart(2, "0")
        + String(d.getHours()).padStart(2, "0")
        + String(d.getMinutes()).padStart(2, "0")
        + String(d.getSeconds()).padStart(2, "0");
}

function fvalStr(f) {
    if (!Number.isFinite(f)) return "";
    return String(Number(f.toPrecision(6)));
}

function getMontype(trk, vf) {
    if (trk.montype && vf.get_montype) {
        try {
            const name = vf.get_montype(trk.tid);
            if (name) return name;
        } catch (_) {}
    }
    return "";
}

function getRecordsInRange(file, trk, wallStart, wallEnd) {
    const results = [];
    let currentWall = wallStart;

    while (currentWall < wallEnd) {
        const elapsed = ((currentWall - serverStartTime) % file.duration + file.duration) % file.duration;
        const mappedStart = file.dtstart + elapsed;
        const timeToLoopEnd = file.duration - elapsed;
        const chunkEnd = Math.min(currentWall + timeToLoopEnd, wallEnd);
        const mappedEnd = file.dtstart + (elapsed + (chunkEnd - currentWall));

        for (const rec of trk.recs) {
            if (rec.dt >= mappedStart && rec.dt < mappedEnd) {
                results.push(rec);
            }
        }
        currentWall = chunkEnd;
    }
    return results;
}

function getTrackHL7(file, trk, vf, wallFrom, wallTo) {
    const montype = getMontype(trk, vf);
    const identifier = trk.dtname;

    if (trk.type === 1) {
        let srate = trk.srate || 100;
        if (montype === "AWP_WAV" || montype === "CO2_WAV") srate = 25;
        else if (srate > 100) srate = 100;

        const recs = getRecordsInRange(file, trk, wallFrom, wallTo);
        if (recs.length === 0) return "";

        const allSamples = [];
        const origSrate = trk.srate || 100;
        for (const rec of recs) {
            if (!rec.val || !rec.val.length) continue;
            if (origSrate > srate) {
                const ratio = origSrate / srate;
                for (let i = 0; i < rec.val.length; i += ratio) {
                    allSamples.push(rec.val[Math.floor(i)]);
                }
            } else {
                for (const v of rec.val) allSamples.push(v);
            }
        }
        if (allSamples.length === 0) return "";

        const vals = allSamples.map(v => Number.isFinite(v) ? fvalStr(v) : "").join("^");
        let refrange = "";
        if (trk.mindisp !== undefined && trk.maxdisp !== undefined && trk.mindisp !== trk.maxdisp)
            refrange = fvalStr(trk.mindisp) + "^" + fvalStr(trk.maxdisp);
        return `NA|${montype}^${identifier}@${srate}||${vals}|${trk.unit || ""}|${refrange}`;
    }

    if (trk.type === 2) {
        const recs = getRecordsInRange(file, trk, wallFrom, wallTo);
        let lastVal = NaN;
        for (const rec of recs) {
            if (Number.isFinite(rec.val)) lastVal = rec.val;
        }
        if (!Number.isFinite(lastVal)) return "";

        let refrange = "";
        if (trk.mindisp !== undefined && trk.maxdisp !== undefined && trk.mindisp !== trk.maxdisp)
            refrange = fvalStr(trk.mindisp) + "^" + fvalStr(trk.maxdisp);
        return `NM|${montype}^${identifier}||${fvalStr(lastVal)}|${trk.unit || ""}|${refrange}`;
    }

    if (trk.type === 5) {
        const recs = getRecordsInRange(file, trk, wallFrom, wallTo);
        if (recs.length === 0) return "";
        return `ST|EVENT^^||${recs[recs.length - 1].val || ""}||`;
    }

    return "";
}

/**
 * Build HL7 payload for all beds (concatenated, like VitalRecorder)
 */
function buildHL7Payload(wallFrom, wallTo) {
    let payload = "";

    for (const [bedId, file] of files) {
        let obxLines = "";
        let obxIdx = 1;

        for (const [, trk] of Object.entries(file.tracks)) {
            const obxContent = getTrackHL7(file, trk, file.vf, wallFrom, wallTo);
            if (!obxContent) continue;
            obxLines += `OBX|${obxIdx++}|${obxContent}||||R\r`;
        }

        if (obxIdx === 1) continue;

        payload += `MSH|^~\\&|VitalRecorder|${vrcode}|||${utToHl7(wallTo)}||ORU^R01|${seqId++}|P|2.6\r`;
        payload += `PID|||\r`;
        payload += `PV1||I|BED-${bedId}\r`;
        payload += `OBR|1|||VITAL_SIGNS|||${utToHl7(wallFrom)}|${utToHl7(wallTo)}\r`;
        payload += obxLines;
    }

    return payload;
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
    console.log("=== vitaldemo - VitalRecorder Simulator ===\n");
    console.log(`Loading ${VITAL_URLS.length} vital files...\n`);

    await loadFromUrls(VITAL_URLS);

    if (files.size === 0) {
        console.error("\nNo files loaded. Exiting.");
        process.exit(1);
    }

    console.log(`\nConnecting to ${serverUrl} as vrcode=${vrcode} ...`);

    const socket = io(serverUrl, {
        transports: ["websocket"],
        reconnection: true,
        reconnectionDelay: 3000,
    });

    let sendTimer = null;
    let lastSendTime = Date.now() / 1000;

    socket.on("connect", () => {
        console.log(`Connected (id=${socket.id})`);
        socket.emit("join_vr", vrcode);
        console.log(`Joined room as ${vrcode}`);
        console.log(`Streaming HL7 data for ${files.size} beds every ${SEND_INTERVAL_MS}ms ...\n`);

        lastSendTime = Date.now() / 1000;

        if (sendTimer) clearInterval(sendTimer);
        sendTimer = setInterval(() => {
            const now = Date.now() / 1000;
            const wallFrom = lastSendTime;
            const wallTo = now;
            lastSendTime = now;

            const hl7 = buildHL7Payload(wallFrom, wallTo);
            if (!hl7) return;

            const compressed = zlib.gzipSync(Buffer.from(hl7, "utf-8"), { level: 1 });
            socket.emit("send_data", compressed);
        }, SEND_INTERVAL_MS);
    });

    socket.on("disconnect", (reason) => {
        console.log(`Disconnected: ${reason}`);
        if (sendTimer) { clearInterval(sendTimer); sendTimer = null; }
    });

    socket.on("connect_error", (err) => {
        console.error(`Connection error: ${err.message}`);
    });

    // Handle server commands
    socket.onAny((event, ...args) => {
        if (event === "send_data" || event === "connect" || event === "disconnect") return;
        console.log(`Server event: ${event}`, args.length > 0 ? args[0] : "");
    });

    // Graceful shutdown
    process.on("SIGINT", () => {
        console.log("\nShutting down...");
        if (sendTimer) clearInterval(sendTimer);
        socket.close();
        process.exit(0);
    });
}

main();
