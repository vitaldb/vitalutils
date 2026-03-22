#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const socketIO = require('socket.io');
const { parseVitalFile, MONTYPE_NAMES } = require('./vital-parser');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function printUsage() {
  console.log(`
Usage: vitaldb-streaming-server [options] [file1.vital file2.vital ...]

Options:
  -p, --port <port>    Port to listen on (default: 8153)
  -c, --count <n>      Number of VitalDB files to download (1-10, default: 10)
  -h, --help           Show this help message
  -v, --version        Show version number

Examples:
  vitaldb-streaming-server                       # Download 10 files, port 8153
  vitaldb-streaming-server -p 3000               # Use port 3000
  vitaldb-streaming-server -c 3                  # Download only 3 files
  vitaldb-streaming-server ./my-case.vital       # Stream a local .vital file
  vitaldb-streaming-server *.vital               # Stream all local .vital files
`);
}

const args = process.argv.slice(2);
let PORT = 8153;
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
    case '-p': case '--port':
      PORT = parseInt(args[++i], 10);
      if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
        console.error('Error: invalid port number');
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
      room.vrcode = `case-${i + 1}`;
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

  // Download in parallel
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
      room.vrcode = `case-${index}`;
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
  // CO2, AWP waveforms -> 25 Hz
  if (name.includes('co2') || name.includes('awp')) {
    return Math.min(track.srate, 25);
  }
  // >100 Hz -> downsample to 100 Hz
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
    const srcIdx = Math.floor(i * ratio);
    out[i] = values[srcIdx];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Streaming state & payload builder
// ---------------------------------------------------------------------------

function createStreamState(rooms) {
  return rooms.map((room) => ({
    startWallTime: Date.now() / 1000,  // wall clock when streaming started
    fileOffset: 0,                      // current offset into file timeline
    seqid: 0,
    trackLastSent: {},                  // tid -> last dt sent
  }));
}

function buildPayload(room, state) {
  const now = Date.now() / 1000;
  const elapsed = now - state.startWallTime;

  // Loop: wrap around if past file duration
  let fileOffset = elapsed % room.duration;
  const currentDt = room.dtMin + fileOffset;
  const windowStart = currentDt;
  const windowEnd = currentDt + 1.0;

  state.seqid++;

  // Time remapping: adjust dt so client sees current wall-clock time
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

  const server = http.createServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(`VitalDB Streaming Server\n${rooms.length} rooms available\n` +
        rooms.map((r) => `  ${r.vrcode}: ${r.roomname} (${r.tracks.length} tracks)`).join('\n') + '\n');
    } else {
      res.writeHead(404);
      res.end('Not found\n');
    }
  });

  const io = socketIO(server, {
    pingInterval: 25000,
    pingTimeout: 60000,
  });

  // Track which rooms each socket has joined
  const socketRooms = new Map();

  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('join_vr', (vrcode) => {
      // Find matching room
      const room = rooms.find((r) => r.vrcode === vrcode);
      if (room) {
        socket.join(vrcode);
        if (!socketRooms.has(socket.id)) {
          socketRooms.set(socket.id, new Set());
        }
        socketRooms.get(socket.id).add(vrcode);
        console.log(`  ${socket.id} joined room ${vrcode} (${room.roomname})`);
      } else {
        // If no specific room, join all rooms
        for (const r of rooms) {
          socket.join(r.vrcode);
        }
        if (!socketRooms.has(socket.id)) {
          socketRooms.set(socket.id, new Set());
        }
        rooms.forEach((r) => socketRooms.get(socket.id).add(r.vrcode));
        console.log(`  ${socket.id} joined all rooms (vrcode "${vrcode}" not found)`);
      }
    });

    socket.on('disconnect', () => {
      socketRooms.delete(socket.id);
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  // 1-second streaming interval
  setInterval(() => {
    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i];
      const state = streamStates[i];

      // Only send if someone is in this room
      const roomSockets = io.sockets.adapter.rooms[room.vrcode];
      if (!roomSockets || roomSockets.length === 0) continue;

      const roomPayload = buildPayload(room, state);

      const fullPayload = JSON.stringify({
        ver: '1.0.0',
        vrcode: 'vitaldb-replay',
        os: 'nodejs',
        rooms: [roomPayload],
      });

      const compressed = zlib.deflateSync(Buffer.from(fullPayload), { level: 1 });
      io.to(room.vrcode).emit('send_data', compressed);
    }
  }, SEND_INTERVAL_MS);

  server.listen(PORT, () => {
    console.log(`\nVitalDB Streaming Server listening on port ${PORT}`);
    console.log(`Available rooms:`);
    for (const room of rooms) {
      console.log(`  ${room.vrcode} -> ${room.roomname}`);
    }
    console.log(`\nConnect with Socket.IO client and emit 'join_vr' with a room code.`);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
