/**
 * Generate test .vital files for development/testing
 * Creates gzip-compressed binary files matching the Vital File Format spec
 */
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

function writeString(parts, str) {
    const buf = Buffer.alloc(4 + Buffer.byteLength(str, "utf8"));
    buf.writeUInt32LE(Buffer.byteLength(str, "utf8"), 0);
    buf.write(str, 4, "utf8");
    parts.push(buf);
}

function createVitalFile(filename, opts = {}) {
    const {
        duration = 60,          // seconds
        srate = 100,            // sample rate for waveforms
        numInterval = 2,        // seconds between numeric records
    } = opts;

    const parts = [];
    const dtstart = 1700000000; // 2023-11-14
    const dtend = dtstart + duration;
    const tzbias = -540; // Korea

    // ── Header ──
    const header = Buffer.alloc(20);
    header.write("VITA", 0, 4, "utf8");     // sign
    header.writeUInt32LE(3, 4);              // format_ver
    header.writeUInt16LE(10, 8);             // headerlen
    header.writeInt16LE(tzbias, 10);         // tzbias
    header.writeUInt32LE(12345, 12);         // inst_id
    header.writeUInt32LE(0x01080803, 16);    // prog_ver
    parts.push(header);

    // ── DEVINFO for device 1 (Patient Monitor) ──
    {
        const devParts = [];
        const devid = Buffer.alloc(4); devid.writeUInt32LE(1, 0); devParts.push(devid);
        writeString(devParts, "Philips");     // type
        writeString(devParts, "IntelliVue");  // name
        writeString(devParts, "ETH1");        // port

        const devData = Buffer.concat(devParts);
        const pktHeader = Buffer.alloc(5);
        pktHeader.writeInt8(9, 0);  // PKT_DEVINFO
        pktHeader.writeUInt32LE(devData.length, 1);
        parts.push(pktHeader, devData);
    }

    // ── DEVINFO for device 2 (Ventilator) ──
    {
        const devParts = [];
        const devid = Buffer.alloc(4); devid.writeUInt32LE(2, 0); devParts.push(devid);
        writeString(devParts, "Drager");
        writeString(devParts, "Primus");
        writeString(devParts, "COM1");

        const devData = Buffer.concat(devParts);
        const pktHeader = Buffer.alloc(5);
        pktHeader.writeInt8(9, 0);
        pktHeader.writeUInt32LE(devData.length, 1);
        parts.push(pktHeader, devData);
    }

    // Track definitions
    const tracks = [
        { tid: 1, name: "ECG_II", type: 1, fmt: 1, unit: "mV",   srate, mindisp: -1.5, maxdisp: 1.5,  montype: 1, devid: 1 },
        { tid: 2, name: "PLETH", type: 1, fmt: 1, unit: "",      srate, mindisp: 0, maxdisp: 100,      montype: 8, devid: 1 },
        { tid: 3, name: "HR",    type: 2, fmt: 1, unit: "bpm",   srate: 0, mindisp: 30, maxdisp: 200,  montype: 2, devid: 1 },
        { tid: 4, name: "SPO2",  type: 2, fmt: 1, unit: "%",     srate: 0, mindisp: 80, maxdisp: 100,  montype: 10, devid: 1 },
        { tid: 5, name: "NIBP_SBP", type: 2, fmt: 1, unit: "mmHg", srate: 0, mindisp: 60, maxdisp: 200, montype: 16, devid: 1 },
        { tid: 6, name: "NIBP_DBP", type: 2, fmt: 1, unit: "mmHg", srate: 0, mindisp: 30, maxdisp: 120, montype: 17, devid: 1 },
        { tid: 7, name: "BT",    type: 2, fmt: 1, unit: "°C",    srate: 0, mindisp: 34, maxdisp: 40,   montype: 19, devid: 1 },
        { tid: 8, name: "RR",    type: 2, fmt: 1, unit: "/min",   srate: 0, mindisp: 5, maxdisp: 40,   montype: 12, devid: 2 },
        { tid: 9, name: "CO2",   type: 1, fmt: 1, unit: "mmHg",   srate: 25, mindisp: 0, maxdisp: 50,  montype: 13, devid: 2 },
        { tid: 10, name: "EVENT", type: 5, fmt: 0, unit: "",      srate: 0, mindisp: 0, maxdisp: 0,    montype: 0, devid: 0 },
    ];

    // ── TRKINFO packets ──
    for (const t of tracks) {
        const trkParts = [];
        const trkid = Buffer.alloc(2); trkid.writeUInt16LE(t.tid, 0); trkParts.push(trkid);
        const recType = Buffer.alloc(1); recType.writeInt8(t.type, 0); trkParts.push(recType);
        const fmtBuf = Buffer.alloc(1); fmtBuf.writeInt8(t.fmt, 0); trkParts.push(fmtBuf);
        writeString(trkParts, t.name);
        writeString(trkParts, t.unit);
        const floats = Buffer.alloc(4 * 4);
        floats.writeFloatLE(t.mindisp, 0);
        floats.writeFloatLE(t.maxdisp, 4);
        floats.writeUInt32LE(0xFFFFFF00, 8); // color: yellow
        floats.writeFloatLE(t.srate, 12);
        trkParts.push(floats);
        const doubles = Buffer.alloc(16);
        doubles.writeDoubleLE(1.0, 0);  // gain
        doubles.writeDoubleLE(0.0, 8);  // offset
        trkParts.push(doubles);
        const monBuf = Buffer.alloc(1); monBuf.writeUInt8(t.montype, 0); trkParts.push(monBuf);
        const devBuf = Buffer.alloc(4); devBuf.writeUInt32LE(t.devid, 0); trkParts.push(devBuf);

        const trkData = Buffer.concat(trkParts);
        const pktHeader = Buffer.alloc(5);
        pktHeader.writeInt8(0, 0);  // PKT_TRKINFO
        pktHeader.writeUInt32LE(trkData.length, 1);
        parts.push(pktHeader, trkData);
    }

    // ── REC packets (data) ──

    // Generate ECG-like waveform
    function generateECG(t, hr = 72) {
        const period = 60 / hr;
        const phase = (t % period) / period;
        // Simple ECG-like shape
        if (phase < 0.1) return 0.1 * Math.sin(phase * Math.PI / 0.1);
        if (phase < 0.15) return -0.2;
        if (phase < 0.2) return 1.0 * Math.sin((phase - 0.15) * Math.PI / 0.05);
        if (phase < 0.25) return -0.3;
        if (phase < 0.4) return 0.2 * Math.sin((phase - 0.25) * Math.PI / 0.15);
        return 0;
    }

    // Generate SpO2 pleth waveform
    function generatePleth(t, hr = 72) {
        const period = 60 / hr;
        const phase = (t % period) / period;
        return 50 + 40 * Math.pow(Math.sin(phase * Math.PI), 2);
    }

    // Generate CO2 capnography waveform
    function generateCO2(t, rr = 14) {
        const period = 60 / rr;
        const phase = (t % period) / period;
        if (phase < 0.3) return 0;
        if (phase < 0.35) return 35 * (phase - 0.3) / 0.05;
        if (phase < 0.65) return 35;
        if (phase < 0.7) return 35 * (0.7 - phase) / 0.05;
        return 0;
    }

    function writeRecPacket(tid, dt, valBuf) {
        const infolen = 10; // dt(8) + trkid(2)
        const recHeader = Buffer.alloc(2 + 8 + 2);
        recHeader.writeUInt16LE(infolen, 0);
        recHeader.writeDoubleLE(dt, 2);
        recHeader.writeUInt16LE(tid, 10);

        const recData = Buffer.concat([recHeader, valBuf]);
        const pktHeader = Buffer.alloc(5);
        pktHeader.writeInt8(1, 0); // PKT_REC
        pktHeader.writeUInt32LE(recData.length, 1);
        parts.push(pktHeader, recData);
    }

    // WAV records: write 1-second chunks
    for (let sec = 0; sec < duration; sec++) {
        const dt = dtstart + sec;

        // ECG waveform (100 Hz, 1 second chunk)
        {
            const nsamp = srate;
            const numBuf = Buffer.alloc(4);
            numBuf.writeUInt32LE(nsamp, 0);
            const vals = Buffer.alloc(nsamp * 4);
            for (let i = 0; i < nsamp; i++) {
                const t = sec + i / srate;
                vals.writeFloatLE(generateECG(t, 72 + 5 * Math.sin(sec / 30)), i * 4);
            }
            writeRecPacket(1, dt, Buffer.concat([numBuf, vals]));
        }

        // PLETH waveform
        {
            const nsamp = srate;
            const numBuf = Buffer.alloc(4);
            numBuf.writeUInt32LE(nsamp, 0);
            const vals = Buffer.alloc(nsamp * 4);
            for (let i = 0; i < nsamp; i++) {
                const t = sec + i / srate;
                vals.writeFloatLE(generatePleth(t, 72 + 5 * Math.sin(sec / 30)), i * 4);
            }
            writeRecPacket(2, dt, Buffer.concat([numBuf, vals]));
        }

        // CO2 waveform (25 Hz)
        {
            const co2srate = 25;
            const nsamp = co2srate;
            const numBuf = Buffer.alloc(4);
            numBuf.writeUInt32LE(nsamp, 0);
            const vals = Buffer.alloc(nsamp * 4);
            for (let i = 0; i < nsamp; i++) {
                const t = sec + i / co2srate;
                vals.writeFloatLE(generateCO2(t, 14), i * 4);
            }
            writeRecPacket(9, dt, Buffer.concat([numBuf, vals]));
        }
    }

    // NUM records
    for (let sec = 0; sec < duration; sec += numInterval) {
        const dt = dtstart + sec;
        const hr = 72 + 5 * Math.sin(sec / 30) + (Math.random() - 0.5) * 2;
        const spo2 = 97 + Math.sin(sec / 60) + (Math.random() - 0.5) * 0.5;
        const rr = 14 + 2 * Math.sin(sec / 45) + (Math.random() - 0.5);
        const bt = 36.5 + 0.3 * Math.sin(sec / 120);

        for (const [tid, val] of [[3, hr], [4, spo2], [8, rr], [7, bt]]) {
            const valBuf = Buffer.alloc(4);
            valBuf.writeFloatLE(val, 0);
            writeRecPacket(tid, dt, valBuf);
        }

        // NIBP every 5 minutes
        if (sec % 300 === 0) {
            const sbp = 120 + 10 * Math.sin(sec / 600) + (Math.random() - 0.5) * 5;
            const dbp = 70 + 5 * Math.sin(sec / 600) + (Math.random() - 0.5) * 3;
            const sbpBuf = Buffer.alloc(4); sbpBuf.writeFloatLE(sbp, 0);
            const dbpBuf = Buffer.alloc(4); dbpBuf.writeFloatLE(dbp, 0);
            writeRecPacket(5, dt, sbpBuf);
            writeRecPacket(6, dt, dbpBuf);
        }
    }

    // STR records (events)
    const events = [
        [dtstart + 0, "Case Start"],
        [dtstart + 10, "Intubation"],
        [dtstart + Math.floor(duration * 0.3), "Incision"],
        [dtstart + Math.floor(duration * 0.8), "Skin Close"],
    ];
    for (const [dt, text] of events) {
        const unusedBuf = Buffer.alloc(4); unusedBuf.writeUInt32LE(0, 0);
        const strParts = [];
        strParts.push(unusedBuf);
        const strLen = Buffer.alloc(4); strLen.writeUInt32LE(Buffer.byteLength(text, "utf8"), 0);
        strParts.push(strLen);
        strParts.push(Buffer.from(text, "utf8"));
        writeRecPacket(10, dt, Buffer.concat(strParts));
    }

    // Combine and gzip
    const raw = Buffer.concat(parts);
    const gzipped = zlib.gzipSync(raw);

    fs.writeFileSync(filename, gzipped);
    console.log(`Created ${filename}: ${(gzipped.length / 1024).toFixed(1)} KB, duration=${duration}s`);
}

// Generate 5 test files with varying durations
const cacheDir = path.join(__dirname, "cache");
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);

const configs = [
    { name: "1.vital", duration: 300 },    // 5 min
    { name: "2.vital", duration: 600 },    // 10 min
    { name: "3.vital", duration: 180 },    // 3 min
    { name: "4.vital", duration: 900 },    // 15 min
    { name: "5.vital", duration: 120 },    // 2 min
];

for (const c of configs) {
    createVitalFile(path.join(cacheDir, c.name), { duration: c.duration });
}

console.log("\nDone! Test files created in ./cache/");
