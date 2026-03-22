#!/usr/bin/env node
'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ioClient = require('socket.io-client');
const { parseVitalFile, MONTYPE_NAMES } = require('./vital-parser');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function printUsage() {
  console.log(`
Usage: vitaldb-streaming-sender [options] [file1.vital file2.vital ...]

Connects to a VitalServer and streams .vital file data as if it were
a VitalRecorder with multiple tabs (rooms).

Options:
  -s, --server <url>   VitalServer URL (default: http://vitalserver.net)
  -c, --count <n>      Number of VitalDB files to download (1-10, default: 10)
  -h, --help           Show this help message
  -v, --version        Show version number

Examples:
  vitaldb-streaming-sender                                # 10 files -> vitalserver.net
  vitaldb-streaming-sender -s http://localhost:8153        # Use local VitalServer
  vitaldb-streaming-sender -c 3                            # Download only 3 files
  vitaldb-streaming-sender ./my-case.vital                 # Stream a local .vital file
  vitaldb-streaming-sender -s http://my-server:8153 *.vital
`);
}

const args = process.argv.slice(2);
let SERVER_URL = 'http://vitalserver.net';
let FILE_COUNT = 10;
const LOCAL_FILES = [];

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '-h': case '--help':
      printUsage();
      process.exit(0);
    case '-v': case '--version':
      console.log(require('./package.json').version);
      process.exit(0);
    case '-s': case '--server':
      SERVER_URL = args[++i];
      if (!SERVER_URL) {
        console.error('Error: missing server URL');
        process.exit(1);
      }
      break;
    case '-c': case '--count':
      FILE_COUNT = parseInt(args[++i], 10);
      if (isNaN(FILE_COUNT) || FILE_COUNT < 1 || FILE_COUNT > 10) {
        console.error('Error: count must be between 1 and 10');
        process.exit(1);
      }
      break;
    default:
      if (args[i].startsWith('-')) {
        console.error(`Unknown option: ${args[i]}`);
        printUsage();
        process.exit(1);
      }
      LOCAL_FILES.push(args[i]);
      break;
  }
}

const BASE_URL = 'https://api.vitaldb.net';
const SEND_INTERVAL_MS = 1000;
const LOOKBACK_MAX_SEC = 15;

// ---------------------------------------------------------------------------
// Download helpers
// ---------------------------------------------------------------------------

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function loadLocalFiles(filePaths) {
  console.log(`Loading ${filePaths.length} local vital file(s)...`);
  const rooms = [];

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
    try {
      const buf = fs.readFileSync(filePath);
      const name = path.basename(filePath, path.extname(filePath));
      console.log(`  Loaded ${filePath} (${(buf.length / 1024).toFixed(0)} KB)`);
      const room = parseVitalFile(buf, name);
      room.fileIndex = i + 1;
      rooms.push(room);
      console.log(`  Parsed ${name}: ${room.tracks.length} tracks, ` +
        `${room.devices.length} devices, duration ${room.duration.toFixed(1)}s`);
    } catch (e) {
      console.error(`  Failed to load ${filePath}: ${e.message}`);
    }
  }

  return rooms;
}

async function downloadAllFiles() {
  console.log(`Downloading ${FILE_COUNT} vital file(s) from VitalDB...`);
  const rooms = [];

  const promises = [];
  for (let i = 1; i <= FILE_COUNT; i++) {
    promises.push(
      downloadFile(`${BASE_URL}/${i}.vital`)
        .then((buf) => {
          console.log(`  Downloaded ${i}.vital (${(buf.length / 1024).toFixed(0)} KB)`);
          return { index: i, buf };
        })
    );
  }

  const results = await Promise.all(promises);
  results.sort((a, b) => a.index - b.index);

  for (const { index, buf } of results) {
    try {
      const room = parseVitalFile(buf, `Case ${index}`);
      room.fileIndex = index;
      rooms.push(room);
      console.log(`  Parsed Case ${index}: ${room.tracks.length} tracks, ` +
        `${room.devices.length} devices, duration ${room.duration.toFixed(1)}s`);
    } catch (e) {
      console.error(`  Failed to parse ${index}.vital: ${e.message}`);
    }
  }

  return rooms;
}

// ---------------------------------------------------------------------------
// WAV resampling (TRACK.cpp:259~266)
// ---------------------------------------------------------------------------

function getTargetSrate(track) {
  if (track.type !== 'wav' || track.srate <= 0) return track.srate;

  const name = track.name.toLowerCase();
  if (name.includes('co2') || name.includes('awp')) {
    return Math.min(track.srate, 25);
  }
  if (track.srate > 100) {
    return 100;
  }
  return track.srate;
}

function resampleWav(values, srcRate, dstRate) {
  if (srcRate <= 0 || dstRate <= 0 || srcRate === dstRate) return values;
  const ratio = srcRate / dstRate;
  const outLen = Math.floor(values.length / ratio);
  const out = new Array(outLen);
  for (let i = 0; i < outLen; i++) {
    out[i] = values[Math.floor(i * ratio)];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Streaming state & payload builder
// ---------------------------------------------------------------------------

function createStreamState(rooms) {
  return rooms.map(() => ({
    startWallTime: Date.now() / 1000,
    seqid: 0,
    trackLastSent: {},
  }));
}

function buildRoomPayload(room, state) {
  const now = Date.now() / 1000;
  const elapsed = now - state.startWallTime;

  // Loop: wrap around if past file duration
  const fileOffset = elapsed % room.duration;
  const currentDt = room.dtMin + fileOffset;
  const windowStart = currentDt;
  const windowEnd = currentDt + 1.0;

  state.seqid++;

  // Time remapping: adjust dt so VitalServer sees current wall-clock time
  const dtAdjust = now - currentDt;

  const trks = [];
  for (const track of room.tracks) {
    const recs = [];
    const targetSrate = getTargetSrate(track);

    for (const rec of track.records) {
      if (rec.dt < windowStart || rec.dt >= windowEnd) continue;

      // 15-second lookback check
      const lastSent = state.trackLastSent[track.tid] || 0;
      if (lastSent > 0 && rec.dt - lastSent > LOOKBACK_MAX_SEC) {
        state.trackLastSent[track.tid] = rec.dt;
        continue;
      }
      state.trackLastSent[track.tid] = rec.dt;

      const adjustedDt = Math.round((rec.dt + dtAdjust) * 1000) / 1000;

      if (track.type === 'wav' && rec.values) {
        let vals = rec.values;
        if (targetSrate !== track.srate) {
          vals = resampleWav(vals, track.srate, targetSrate);
        }
        recs.push({ dt: adjustedDt, val: vals });
      } else if (track.type === 'num' && rec.value !== undefined) {
        recs.push({ dt: adjustedDt, val: rec.value });
      } else if (track.type === 'str' && rec.value !== undefined) {
        recs.push({ dt: adjustedDt, val: rec.value });
      }
    }

    if (recs.length === 0) continue;

    const trkObj = {
      id: track.tid,
      name: track.name,
      type: track.type,
      unit: track.unit,
      recs,
    };

    if (track.type === 'wav') {
      trkObj.srate = targetSrate;
      trkObj.mindisp = track.mindisp;
      trkObj.maxdisp = track.maxdisp;
    }

    if (track.montype > 0 && MONTYPE_NAMES[track.montype]) {
      trkObj.montype = MONTYPE_NAMES[track.montype];
    }

    if (track.type === 'num') {
      trkObj.mindisp = track.mindisp;
      trkObj.maxdisp = track.maxdisp;
    }

    trks.push(trkObj);
  }

  const devs = room.devices.map((d) => ({
    type: d.type,
    name: d.name,
    status: d.status,
    ycable: '0',
    port: d.port || '',
  }));

  const adjustedStart = Math.round((windowStart + dtAdjust) * 1000) / 1000;
  const adjustedEnd = Math.round((windowEnd + dtAdjust) * 1000) / 1000;

  return {
    roomname: room.roomname,
    seqid: state.seqid,
    dtstart: adjustedStart,
    dtend: adjustedEnd,
    dtcase: Math.round((room.dtMin + dtAdjust) * 1000) / 1000,
    ptcon: 1,
    dtapp: Math.round(state.startWallTime * 1000) / 1000,
    recording: 0,
    dgmt: room.dgmt,
    devs,
    trks,
    evts: [],
    filts: [],
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const rooms = LOCAL_FILES.length > 0
    ? await loadLocalFiles(LOCAL_FILES)
    : await downloadAllFiles();
  if (rooms.length === 0) {
    console.error('No vital files loaded. Exiting.');
    process.exit(1);
  }

  const streamStates = createStreamState(rooms);

  console.log(`\nConnecting to VitalServer: ${SERVER_URL}`);

  const socket = ioClient(SERVER_URL, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: Infinity,
  });

  let sendInterval = null;

  socket.on('connect', () => {
    console.log(`Connected to VitalServer (id: ${socket.id})`);
    console.log(`Streaming ${rooms.length} room(s):`);
    for (const room of rooms) {
      console.log(`  ${room.roomname} (${room.tracks.length} tracks, ${room.duration.toFixed(1)}s)`);
    }

    // Start 1-second streaming interval
    if (sendInterval) clearInterval(sendInterval);
    sendInterval = setInterval(() => {
      const roomPayloads = [];
      for (let i = 0; i < rooms.length; i++) {
        roomPayloads.push(buildRoomPayload(rooms[i], streamStates[i]));
      }

      const fullPayload = JSON.stringify({
        ver: '1.0.0',
        vrcode: 'vitaldb-replay',
        os: 'nodejs',
        rooms: roomPayloads,
      });

      const compressed = zlib.deflateSync(Buffer.from(fullPayload), { level: 1 });
      socket.emit('send_data', compressed);
    }, SEND_INTERVAL_MS);
  });

  socket.on('disconnect', (reason) => {
    console.log(`Disconnected from VitalServer: ${reason}`);
    if (sendInterval) {
      clearInterval(sendInterval);
      sendInterval = null;
    }
  });

  socket.on('reconnect', (attempt) => {
    console.log(`Reconnected to VitalServer (attempt ${attempt})`);
  });

  socket.on('connect_error', (err) => {
    console.error(`Connection error: ${err.message}`);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
