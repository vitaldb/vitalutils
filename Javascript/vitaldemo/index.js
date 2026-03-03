/**
 * VitalDB-compatible API Server using Fastify
 *
 * Loads .vital files at startup, then serves data via REST API.
 * File data loops infinitely based on wall-clock time.
 *
 * Time mapping formula:
 *   elapsed = (now - serverStartTime) % fileDuration
 *   mappedTime = file.dtstart + elapsed
 *
 * Compatible endpoints:
 *   GET  /api/status     - server status and time mapping info
 *   GET  /api/filelist   - list loaded vrcodes
 *   GET  /api/receive    - get vital data (VitalDB receive API compatible)
 */

const Fastify = require("fastify");
const cors = require("@fastify/cors");
const VitalFile = require("vitaldb-js");
const path = require("path");
const fs = require("fs");
const os = require("os");
const https = require("https");

// ─── Configuration ───────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "3000");
const HOST = process.env.HOST || "0.0.0.0";

// Open VitalDB dataset files (case 1~5)
const VITAL_URLS = [
    "https://api.vitaldb.net/1.vital",
    "https://api.vitaldb.net/2.vital",
    "https://api.vitaldb.net/3.vital",
    "https://api.vitaldb.net/4.vital",
    "https://api.vitaldb.net/5.vital",
    "https://api.vitaldb.net/6.vital",
    "https://api.vitaldb.net/7.vital",
    "https://api.vitaldb.net/8.vital",
    "https://api.vitaldb.net/9.vital",
    "https://api.vitaldb.net/10.vital",
];

// ─── VitalStore ─────────────────────────────────────────────

/** @type {Map<number, object>} vrcode -> { vf, duration, tracks, dtstart, dtend, dgmt } */
const files = new Map();
const serverStartTime = Date.now() / 1000;

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
                reject(new Error(`Download failed: ${res.statusCode} for ${url}`));
                return;
            }
            res.pipe(file);
            file.on("finish", () => { file.close(); resolve(); });
            file.on("error", (err) => { fs.unlinkSync(destPath); reject(err); });
        }).on("error", (err) => {
            fs.unlinkSync(destPath);
            reject(err);
        });
    });
}

async function loadFromUrls(urls) {
    for (const url of urls) {
        const basename = path.basename(url);
        const vrcode = parseInt(basename);
        const tmpPath = path.join(os.tmpdir(), `vital_${basename}`);

        console.log(`Downloading ${url} ...`);
        try {
            await download(url, tmpPath);
        } catch (err) {
            console.error(`  -> Failed to download ${url}: ${err.message}`);
            continue;
        }

        try {
            console.log(`Parsing vrcode=${vrcode} ...`);
            const vf = await new VitalFile(null, tmpPath);
            const duration = vf.dtend - vf.dtstart;

            if (duration <= 0) {
                console.warn(`  -> Skipping vrcode=${vrcode}: invalid duration (${duration}s)`);
                continue;
            }

            const tracks = {};
            for (const tid in vf.trks) {
                const trk = vf.trks[tid];
                if (trk._excluded || trk.recs.length === 0) continue;
                trk.recs.sort((a, b) => a.dt - b.dt);
                tracks[trk.dtname] = trk;
            }

            files.set(vrcode, {
                vf, duration, tracks,
                dtstart: vf.dtstart,
                dtend: vf.dtend,
                dgmt: vf.dgmt,
            });

            const trackCount = Object.keys(tracks).length;
            const recCount = Object.values(tracks).reduce((s, t) => s + t.recs.length, 0);
            console.log(`  -> Loaded: ${trackCount} tracks, ${recCount} records, duration=${duration.toFixed(1)}s`);
        } catch (err) {
            console.error(`  -> Failed to parse vrcode=${vrcode}: ${err.message}`);
        } finally {
            try { fs.unlinkSync(tmpPath); } catch (_) {}
        }
    }

    console.log(`\nTotal ${files.size} files loaded. Server start time: ${new Date(serverStartTime * 1000).toISOString()}`);
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
                const offsetInFile = rec.dt - mappedStart;
                const wallDt = currentWall + offsetInFile;
                if (trk.type === 1) {
                    results.push({ dt: wallDt, val: Array.from(rec.val) });
                } else {
                    results.push({ dt: wallDt, val: rec.val });
                }
            }
        }

        currentWall = chunkEnd;
    }

    return results;
}

function formatColor(col) {
    const r = (col >> 16) & 0xFF;
    const g = (col >> 8) & 0xFF;
    const b = col & 0xFF;
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase();
}

function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

// ─── Initialize ──────────────────────────────────────────────
const app = Fastify({ logger: true });
app.register(cors, { origin: true });

// ─── Routes ──────────────────────────────────────────────────

app.get("/api/status", async () => {
    const now = Date.now() / 1000;
    const result = {};

    for (const [vrcode, file] of files) {
        const elapsed = now - serverStartTime;
        const loopedElapsed = ((elapsed % file.duration) + file.duration) % file.duration;
        const mappedTime = file.dtstart + loopedElapsed;

        result[vrcode] = {
            duration: file.duration,
            duration_formatted: formatDuration(file.duration),
            original_start: new Date(file.dtstart * 1000).toISOString(),
            original_end: new Date(file.dtend * 1000).toISOString(),
            current_mapped_time: new Date(mappedTime * 1000).toISOString(),
            current_position_pct: ((loopedElapsed / file.duration) * 100).toFixed(1) + "%",
            loop_count: Math.floor(elapsed / file.duration),
            track_count: Object.keys(file.tracks).length,
        };
    }

    return {
        server_start: new Date(serverStartTime * 1000).toISOString(),
        uptime: formatDuration(now - serverStartTime),
        now: new Date(now * 1000).toISOString(),
        files_loaded: files.size,
        files: result,
    };
});

app.get("/api/filelist", async () => {
    return [...files.keys()];
});

app.get("/api/receive", async (request, reply) => {
    const vrcode = parseInt(request.query.vrcode);
    let { dtstart, dtend } = request.query;

    if (isNaN(vrcode)) {
        reply.code(400);
        return { error: "vrcode parameter is required" };
    }

    const file = files.get(vrcode);
    if (!file) {
        reply.code(404);
        return { error: `vrcode ${vrcode} not found` };
    }

    const now = Date.now() / 1000;

    if (!dtend) {
        dtend = now;
    } else {
        dtend = parseFloat(dtend);
    }

    if (!dtstart) {
        dtstart = dtend - 20;
    } else {
        dtstart = parseFloat(dtstart);
    }

    if (isNaN(dtstart) || isNaN(dtend)) {
        reply.code(400);
        return { error: "dtstart and dtend must be valid numbers" };
    }

    if (dtend <= dtstart) {
        reply.code(400);
        return { error: "dtend must be greater than dtstart" };
    }

    if ((dtend - dtstart) > file.duration * 10) {
        reply.code(400);
        return { error: "Requested time range too large" };
    }

    const trks = [];
    for (const [dtname, trk] of Object.entries(file.tracks)) {
        const recs = getRecordsInRange(file, trk, dtstart, dtend);
        if (recs.length === 0) continue;
        trks.push({
            name: dtname,
            type: trk.type === 1 ? "wav" : trk.type === 2 ? "num" : "str",
            srate: trk.srate || 0,
            unit: trk.unit || "",
            color: formatColor(trk.col),
            recs,
        });
    }

    return { vrcode, dtstart, dtend, trks };
});

// ─── Startup ─────────────────────────────────────────────────

async function start() {
    try {
        console.log("=== VitalDB API Server ===");
        console.log(`Loading ${VITAL_URLS.length} vital files...\n`);

        await loadFromUrls(VITAL_URLS);

        if (files.size === 0) {
            console.error("No files loaded. Exiting.");
            process.exit(1);
        }

        await app.listen({ port: PORT, host: HOST });
        console.log(`\nServer listening on http://${HOST}:${PORT}`);
        console.log("\nAvailable endpoints:");
        console.log(`  GET /api/status                          - Server status`);
        console.log(`  GET /api/filelist                        - List loaded vrcodes`);
        console.log(`  GET /api/receive?vrcode=1                - Receive data (last 20s)`);
        console.log(`  GET /api/receive?vrcode=1&dtstart=...&dtend=...`);
    } catch (err) {
        console.error("Startup error:", err);
        process.exit(1);
    }
}

start();
