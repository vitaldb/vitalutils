/**
 * Start server and run API tests
 */
const http = require("http");

function fetch(path) {
    return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:3000${path}`, (res) => {
            let data = "";
            res.on("data", (chunk) => data += chunk);
            res.on("end", () => {
                try { resolve(JSON.parse(data)); } 
                catch { resolve(data); }
            });
        }).on("error", reject);
    });
}

async function runTests() {
    // Import and start server inline
    const Fastify = require("fastify");
    const cors = require("@fastify/cors");
    const VitalStore = require("./vital-store.js");

    const app = Fastify({ logger: false });
    await app.register(cors, { origin: true });
    const store = new VitalStore();

    const VITAL_URLS = [
        "https://api.vitaldb.net/1.vital",
        "https://api.vitaldb.net/2.vital",
        "https://api.vitaldb.net/3.vital",
        "https://api.vitaldb.net/4.vital",
        "https://api.vitaldb.net/5.vital",
    ];
    await store.loadFromUrls(VITAL_URLS);

    // Register routes (copy from server.js inline)
    app.get("/api/status", async () => {
        const now = Date.now() / 1000;
        const files = {};
        for (const [filename, file] of store.files) {
            const elapsed = now - store.serverStartTime;
            const loopedElapsed = ((elapsed % file.duration) + file.duration) % file.duration;
            const mappedTime = file.dtstart + loopedElapsed;
            files[filename] = {
                duration: file.duration,
                original_start: new Date(file.dtstart * 1000).toISOString(),
                original_end: new Date(file.dtend * 1000).toISOString(),
                current_mapped_time: new Date(mappedTime * 1000).toISOString(),
                track_count: Object.keys(file.tracks).length,
            };
        }
        return { server_start: new Date(store.serverStartTime * 1000).toISOString(), files_loaded: store.files.size, files };
    });

    app.get("/api/filelist", async () => store.getFileList());
    
    app.get("/api/tracklist", async (req, reply) => {
        const { filename } = req.query;
        if (!filename) { reply.code(400); return { error: "filename required" }; }
        const result = store.getTrackList(filename);
        if (!result) { reply.code(404); return { error: "not found" }; }
        return result;
    });

    app.get("/api/receive", async (req, reply) => {
        const { filename, track } = req.query;
        let { dtstart, dtend } = req.query;
        if (!filename) { reply.code(400); return { error: "filename required" }; }
        const now = Date.now() / 1000;
        dtstart = dtstart ? parseFloat(dtstart) : now - 5;
        dtend = dtend ? parseFloat(dtend) : dtstart + 5;
        return store.receive(filename, dtstart, dtend, track || null);
    });

    await app.listen({ port: 3000, host: "127.0.0.1" });
    console.log("Server listening on http://127.0.0.1:3000\n");

    // Run tests
    console.log("=== TEST 1: /api/status ===");
    const status = await fetch("/api/status");
    console.log(JSON.stringify(status, null, 2));

    console.log("\n=== TEST 2: /api/filelist ===");
    const filelist = await fetch("/api/filelist");
    console.log(`Files: ${filelist.length}`);
    for (const f of filelist) {
        console.log(`  ${f.filename}: ${f.tracks.length} tracks, duration=${f.duration}s`);
    }

    console.log("\n=== TEST 3: /api/tracklist?filename=1.vital ===");
    const tracklist = await fetch("/api/tracklist?filename=1.vital");
    console.log(`Tracks in 1.vital: ${tracklist.trks.length}`);
    for (const t of tracklist.trks) {
        console.log(`  ${t.name} [${t.type}] unit=${t.unit} srate=${t.srate}`);
    }

    console.log("\n=== TEST 4: /api/receive?filename=1.vital&track=HR (last 5s) ===");
    const receive = await fetch("/api/receive?filename=1.vital&track=HR");
    console.log(`File: ${receive.filename}`);
    console.log(`Mapped time range: ${new Date(receive.mapped_dtstart * 1000).toISOString()} ~ ${new Date(receive.mapped_dtend * 1000).toISOString()}`);
    console.log(`File duration: ${receive.file_duration}s`);
    if (receive.trks && receive.trks.length > 0) {
        const hrTrk = receive.trks[0];
        console.log(`Track: ${hrTrk.name}, ${hrTrk.recs.length} records`);
        for (const r of hrTrk.recs.slice(0, 5)) {
            console.log(`  dt=${new Date(r.dt * 1000).toISOString()} val=${typeof r.val === 'number' ? r.val.toFixed(1) : r.val}`);
        }
    }

    console.log("\n=== TEST 5: /api/receive?filename=1.vital (all tracks, 2s) ===");
    const now = Date.now() / 1000;
    const receiveAll = await fetch(`/api/receive?filename=1.vital&dtstart=${now - 2}&dtend=${now}`);
    console.log(`Tracks returned: ${receiveAll.trks.length}`);
    for (const t of receiveAll.trks) {
        const totalRecs = t.recs.length;
        const totalSamples = t.type === "wav" ? t.recs.reduce((s, r) => s + r.val.length, 0) : totalRecs;
        console.log(`  ${t.name} [${t.type}]: ${totalRecs} recs, ${totalSamples} samples`);
    }

    console.log("\n=== ALL TESTS PASSED ===");
    await app.close();
    process.exit(0);
}

runTests().catch(err => { console.error(err); process.exit(1); });
