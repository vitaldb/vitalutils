'use strict';

const zlib = require('zlib');

// Packet types (REC.h:328~341)
const SAVE_TRK = 0;
const SAVE_REC = 1;
const SAVE_CMD = 6;
const SAVE_DEV = 9;

// Record types
const REC_WAV = 1;
const REC_NUM = 2;
const REC_STR = 5;

// Data formats (REC.h:63~72)
const FMT_SIZES = {
  1: 4,  // FMT_FLOAT
  2: 8,  // FMT_DOUBLE
  3: 1,  // FMT_CHAR
  4: 1,  // FMT_BYTE
  5: 2,  // FMT_SHORT
  6: 2,  // FMT_WORD
  7: 4,  // FMT_LONG
  8: 4,  // FMT_DWORD
};

function readString(buf, offset) {
  const len = buf.readUInt32LE(offset);
  offset += 4;
  const str = buf.toString('utf8', offset, offset + len);
  return { value: str, bytesRead: 4 + len };
}

function readSample(buf, offset, fmt) {
  switch (fmt) {
    case 1: return buf.readFloatLE(offset);
    case 2: return buf.readDoubleLE(offset);
    case 3: return buf.readInt8(offset);
    case 4: return buf.readUInt8(offset);
    case 5: return buf.readInt16LE(offset);
    case 6: return buf.readUInt16LE(offset);
    case 7: return buf.readInt32LE(offset);
    case 8: return buf.readUInt32LE(offset);
    default: return buf.readFloatLE(offset);
  }
}

// Montype names for JSON output
const MONTYPE_NAMES = {
  0: '',
  1: 'ECG_WAV', 2: 'ECG_HR', 3: 'ECG_PVC',
  4: 'IABP_WAV', 5: 'IABP_SBP', 6: 'IABP_DBP', 7: 'IABP_MBP',
  8: 'PLETH_WAV', 9: 'PLETH_HR', 10: 'PLETH_SPO2',
  11: 'ABP_WAV', 12: 'ABP_SBP', 13: 'ABP_DBP', 14: 'ABP_MBP',
  15: 'CVP_WAV', 16: 'CVP_CVP',
  17: 'CO2_WAV', 18: 'CO2_ETCO2', 19: 'CO2_INCO2', 20: 'CO2_RR',
  21: 'NMT_WAV',
  24: 'EEG_WAV', 25: 'EEG_BIS', 26: 'EEG_SEF',
  27: 'AWP_WAV',
  30: 'AGENT_WAV', 31: 'AGENT_ETAG', 32: 'AGENT_INAG',
  33: 'PA_WAV', 34: 'PA_SBP', 35: 'PA_DBP', 36: 'PA_MBP',
  37: 'FEM_WAV', 38: 'FEM_SBP', 39: 'FEM_DBP', 40: 'FEM_MBP',
  60: 'BT',
  70: 'VENT_WAV', 71: 'VENT_PIP', 72: 'VENT_PEEP', 73: 'VENT_TV',
  74: 'VENT_MV', 75: 'VENT_RR', 76: 'VENT_FIO2',
};

/**
 * Parse a .vital file buffer (may be gzipped).
 * Returns a room object with devices, tracks, and records.
 */
function parseVitalFile(buffer, roomname) {
  // Check for gzip magic bytes
  if (buffer[0] === 0x1F && buffer[1] === 0x8B) {
    buffer = zlib.gunzipSync(buffer);
  }

  let offset = 0;

  // Parse header (DISPLAY.cpp:3226~3240)
  const magic = buffer.toString('ascii', offset, offset + 4);
  offset += 4;
  if (magic !== 'VITA') {
    throw new Error('Invalid vital file: bad magic ' + magic);
  }

  const version = buffer.readUInt32LE(offset); offset += 4;
  const headerLen = buffer.readUInt16LE(offset); offset += 2;

  // Read remaining header fields
  const headerStart = offset;
  let dgmt = 0, instanceId = 0, programVer = 0;

  if (headerLen >= 2) {
    dgmt = buffer.readInt16LE(offset); offset += 2;
  }
  if (headerLen >= 6) {
    instanceId = buffer.readUInt32LE(offset); offset += 4;
  }
  if (headerLen >= 10) {
    programVer = buffer.readUInt32LE(offset); offset += 4;
  }

  // Skip to end of header
  offset = headerStart + headerLen;

  const devices = new Map();  // devid -> device info
  const tracks = new Map();   // tid -> track info

  // Parse packet stream
  while (offset + 5 <= buffer.length) {
    const packetType = buffer.readUInt8(offset); offset += 1;
    const packetLen = buffer.readUInt32LE(offset); offset += 4;

    if (offset + packetLen > buffer.length) break;

    const pktStart = offset;

    try {
      switch (packetType) {
        case SAVE_DEV: {
          const devid = buffer.readUInt32LE(offset); offset += 4;
          const typeName = readString(buffer, offset);
          offset += typeName.bytesRead;
          const devName = readString(buffer, offset);
          offset += devName.bytesRead;
          let portName = { value: '' };
          if (offset - pktStart < packetLen) {
            portName = readString(buffer, offset);
          }
          devices.set(devid, {
            type: typeName.value,
            name: devName.value,
            port: portName.value,
            status: 'connected',
          });
          break;
        }

        case SAVE_TRK: {
          const tid = buffer.readUInt32LE(offset); offset += 4;
          const recType = buffer.readUInt8(offset); offset += 1;
          const recFmt = buffer.readUInt8(offset); offset += 1;
          const name = readString(buffer, offset); offset += name.bytesRead;
          const unit = readString(buffer, offset); offset += unit.bytesRead;
          const mindisp = buffer.readFloatLE(offset); offset += 4;
          const maxdisp = buffer.readFloatLE(offset); offset += 4;
          const color = buffer.readUInt32LE(offset); offset += 4;
          const srate = buffer.readFloatLE(offset); offset += 4;
          const gain = buffer.readDoubleLE(offset); offset += 8;
          const offsetVal = buffer.readDoubleLE(offset); offset += 8;
          const montype = buffer.readUInt8(offset); offset += 1;

          let devid = 0;
          if (offset - pktStart < packetLen) {
            devid = buffer.readUInt32LE(offset); offset += 4;
          }

          let typeStr;
          switch (recType) {
            case REC_WAV: typeStr = 'wav'; break;
            case REC_NUM: typeStr = 'num'; break;
            case REC_STR: typeStr = 'str'; break;
            default: typeStr = 'num'; break;
          }

          tracks.set(tid, {
            tid,
            name: name.value,
            type: typeStr,
            recType,
            recFmt,
            srate: recType === REC_WAV ? srate : 0,
            unit: unit.value,
            mindisp,
            maxdisp,
            color,
            gain,
            offset: offsetVal,
            montype,
            devid,
            records: [],
          });
          break;
        }

        case SAVE_REC: {
          const infoLen = buffer.readUInt16LE(offset); offset += 2;
          const infoVer = buffer.readUInt16LE(offset); offset += 2;
          const dt = buffer.readDoubleLE(offset); offset += 8;
          const tid = buffer.readUInt32LE(offset); offset += 4;

          const track = tracks.get(tid);
          if (!track) break;

          const dataLen = packetLen - (offset - pktStart);
          if (dataLen <= 0) break;

          if (track.recType === REC_WAV) {
            // WAV data
            const sampleCount = buffer.readUInt32LE(offset); offset += 4;
            const sampleSize = FMT_SIZES[track.recFmt] || 4;
            const values = [];
            for (let i = 0; i < sampleCount && (offset + sampleSize <= pktStart + packetLen); i++) {
              const raw = readSample(buffer, offset, track.recFmt);
              offset += sampleSize;
              // Physical value conversion: physical = offset + raw * gain
              const phys = track.offset + raw * track.gain;
              values.push(Math.round(phys * 10000) / 10000); // round to avoid floating point noise
            }
            track.records.push({ dt, values });
          } else if (track.recType === REC_NUM) {
            // NUM data - single value
            const raw = readSample(buffer, offset, track.recFmt);
            const phys = track.offset + raw * track.gain;
            track.records.push({ dt, value: Math.round(phys * 10000) / 10000 });
          } else if (track.recType === REC_STR) {
            // STR data
            const reserved = buffer.readUInt32LE(offset); offset += 4;
            if (offset - pktStart < packetLen) {
              const strVal = readString(buffer, offset);
              track.records.push({ dt, value: strVal.value });
            }
          }
          break;
        }

        case SAVE_CMD: {
          // Skip command packets
          break;
        }

        default:
          break;
      }
    } catch (e) {
      // Skip malformed packets
    }

    // Always advance to next packet
    offset = pktStart + packetLen;
  }

  // Sort records by time for each track
  for (const track of tracks.values()) {
    track.records.sort((a, b) => a.dt - b.dt);
  }

  // Build room object
  const trackList = Array.from(tracks.values());
  const devList = Array.from(devices.entries()).map(([id, dev]) => ({
    devid: id,
    ...dev,
  }));

  // Compute file time range
  let dtMin = Infinity, dtMax = -Infinity;
  for (const track of trackList) {
    for (const rec of track.records) {
      if (rec.dt < dtMin) dtMin = rec.dt;
      if (rec.dt > dtMax) dtMax = rec.dt;
    }
  }

  return {
    roomname,
    dgmt,
    devices: devList,
    tracks: trackList,
    dtMin: dtMin === Infinity ? 0 : dtMin,
    dtMax: dtMax === -Infinity ? 0 : dtMax,
    duration: dtMax - dtMin,
  };
}

module.exports = { parseVitalFile, MONTYPE_NAMES };
