/**
 * VitalDB-compatible API Server using Fastify
 * 
 * Loads .vital files at startup, then serves data via REST API.
 * File data loops infinitely based on wall-clock time.
 * 
 * Compatible endpoints:
 *   GET  /api/filelist   - list loaded files
 *   GET  /api/tracklist  - get tracks of a file  
 *   GET  /api/receive    - get vital data (VitalDB receive API compatible)
 *   GET  /api/status     - server status and time mapping info
 */

const Fastify = require("fastify");
const cors = require("@fastify/cors");
const VitalStore = require("./vital-store.js");

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
];

// ─── Initialize ──────────────────────────────────────────────
const app = Fastify({ logger: true });

const store = new VitalStore();

// ─── Plugins ─────────────────────────────────────────────────
app.register(cors, { origin: true });

// ─── Routes ──────────────────────────────────────────────────

/**
 * GET /api/status
 * Server status and time mapping info for debugging
 */
app.get("/api/status", async (request, reply) => {
    const now = Date.now() / 1000;
    const files = {};

    for (const [filename, file] of store.files) {
        const elapsed = now - store.serverStartTime;
        const loopedElapsed = ((elapsed % file.duration) + file.duration) % file.duration;
        const mappedTime = file.dtstart + loopedElapsed;
        const loopCount = Math.floor(elapsed / file.duration);

        files[filename] = {
            duration: file.duration,
            duration_formatted: formatDuration(file.duration),
            original_start: new Date(file.dtstart * 1000).toISOString(),
            original_end: new Date(file.dtend * 1000).toISOString(),
            current_mapped_time: new Date(mappedTime * 1000).toISOString(),
            current_position_pct: ((loopedElapsed / file.duration) * 100).toFixed(1) + "%",
            loop_count: loopCount,
            track_count: Object.keys(file.tracks).length,
        };
    }

    return {
        server_start: new Date(store.serverStartTime * 1000).toISOString(),
        uptime: formatDuration(now - store.serverStartTime),
        now: new Date(now * 1000).toISOString(),
        files_loaded: store.files.size,
        files,
    };
});

/**
 * GET /api/filelist
 * List all loaded vital files
 * Compatible with VitalDB filelist API response format
 */
app.get("/api/filelist", async (request, reply) => {
    return store.getFileList();
});

/**
 * GET /api/tracklist
 * Get track list for a specific file
 * 
 * Query params:
 *   filename (required) - vital file name (e.g., "1.vital")
 */
app.get("/api/tracklist", async (request, reply) => {
    const { filename } = request.query;

    if (!filename) {
        reply.code(400);
        return { error: "filename parameter is required" };
    }

    const result = store.getTrackList(filename);
    if (!result) {
        reply.code(404);
        return { error: `File '${filename}' not found` };
    }

    return result;
});

/**
 * GET /api/receive
 * Get vital sign data for a time range (VitalDB receive API compatible)
 * Time is mapped to file data with infinite looping.
 * 
 * Query params:
 *   filename  (required) - vital file name
 *   dtstart   (optional) - start time as unix timestamp (default: now - 10s)
 *   dtend     (optional) - end time as unix timestamp (default: dtstart + 10)
 *   track     (optional) - filter by track name
 * 
 * The response contains real-time mapped data:
 *   - timestamps in the response correspond to wall-clock time
 *   - file data repeats infinitely from server start time
 */
app.get("/api/receive", async (request, reply) => {
    const { filename, track } = request.query;
    let { dtstart, dtend } = request.query;

    if (!filename) {
        reply.code(400);
        return { error: "filename parameter is required" };
    }

    const now = Date.now() / 1000;

    // Default: last 10 seconds
    if (!dtstart) {
        dtstart = now - 10;
    } else {
        dtstart = parseFloat(dtstart);
    }

    if (!dtend) {
        dtend = dtstart + 10;
    } else {
        dtend = parseFloat(dtend);
    }

    if (isNaN(dtstart) || isNaN(dtend)) {
        reply.code(400);
        return { error: "dtstart and dtend must be valid numbers" };
    }

    if (dtend <= dtstart) {
        reply.code(400);
        return { error: "dtend must be greater than dtstart" };
    }

    const result = store.receive(filename, dtstart, dtend, track || null);
    if (!result) {
        reply.code(404);
        return { error: `File '${filename}' not found` };
    }

    return result;
});

/**
 * GET /api/receive_current
 * Convenience endpoint: get the latest N seconds of data
 * 
 * Query params:
 *   filename  (required)
 *   seconds   (optional, default: 5) - how many seconds of recent data
 *   track     (optional) - filter by track name
 */
app.get("/api/receive_current", async (request, reply) => {
    const { filename, track } = request.query;
    let { seconds } = request.query;

    if (!filename) {
        reply.code(400);
        return { error: "filename parameter is required" };
    }

    seconds = parseFloat(seconds || "5");
    const now = Date.now() / 1000;

    const result = store.receive(filename, now - seconds, now, track || null);
    if (!result) {
        reply.code(404);
        return { error: `File '${filename}' not found` };
    }

    return result;
});

// ─── Startup ─────────────────────────────────────────────────

async function start() {
    try {
        // Load vital files
        console.log("=== VitalDB API Server ===");
        console.log(`Loading ${VITAL_URLS.length} vital files...\n`);

        await store.loadFromUrls(VITAL_URLS);

        if (store.files.size === 0) {
            console.error("No files loaded. Exiting.");
            process.exit(1);
        }

        // Start server
        await app.listen({ port: PORT, host: HOST });
        console.log(`\nServer listening on http://${HOST}:${PORT}`);
        console.log("\nAvailable endpoints:");
        console.log(`  GET /api/status                          - Server status`);
        console.log(`  GET /api/filelist                        - List loaded files`);
        console.log(`  GET /api/tracklist?filename=1.vital      - Track list`);
        console.log(`  GET /api/receive?filename=1.vital        - Receive data (last 10s)`);
        console.log(`  GET /api/receive?filename=1.vital&dtstart=...&dtend=...&track=ECG`);
        console.log(`  GET /api/receive_current?filename=1.vital&seconds=5`);
    } catch (err) {
        console.error("Startup error:", err);
        process.exit(1);
    }
}

// ─── Helpers ─────────────────────────────────────────────────

function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

start();
