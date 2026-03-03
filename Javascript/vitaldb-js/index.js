/**
 * VitalFile - Parser for Vital Recorder .vital file format
 * @author Eunsun Rachel Lee <eunsun.lee93@gmail.com>
 * @author Hyung-Chul Lee <vital@snu.ac.kr>
 *
 * File format spec:
 *   - Gzip compressed binary (magic: 1F 8B 08 00)
 *   - Header: "VITA" signature + metadata
 *   - Body: sequence of packets (DEVINFO=9, TRKINFO=0, REC=1, CMD=6)
 *   - Little-endian, 1-byte aligned, UTF-8 strings
 *   - Time: Unix timestamp as IEEE 754 double (UTC)
 */

const path = require("path");
const fs = require("fs");
const zlib = require("zlib");

/** Monitor type code → name mapping */
const MONTYPES = {
    1: "ECG_WAV",
    2: "ECG_HR",
    3: "ECG_PVC",
    4: "IABP_WAV",
    5: "IABP_SBP",
    6: "IABP_DBP",
    7: "IABP_MBP",
    8: "PLETH_WAV",
    9: "PLETH_HR",
    10: "PLETH_SPO2",
    11: "RESP_WAV",
    12: "RESP_RR",
    13: "CO2_WAV",
    14: "CO2_RR",
    15: "CO2_CONC",
    16: "NIBP_SBP",
    17: "NIBP_DBP",
    18: "NIBP_MBP",
    19: "BT",
    20: "CVP_WAV",
    21: "CVP_CVP",
    22: "EEG_BIS",
    23: "TV",
    24: "MV",
    25: "PIP",
    26: "AGENT1_NAME",
    27: "AGENT1_CONC",
    28: "AGENT2_NAME",
    29: "AGENT2_CONC",
    30: "DRUG1_NAME",
    31: "DRUG1_CE",
    32: "DRUG2_NAME",
    33: "DRUG2_CE",
    34: "CO",
    36: "EEG_SEF",
    38: "PEEP",
    39: "ECG_ST",
    40: "AGENT3_NAME",
    41: "AGENT3_CONC",
    42: "STO2_L",
    43: "STO2_R",
    44: "EEG_WAV",
    45: "FLUID_RATE",
    46: "FLUID_TOTAL",
    47: "SVV",
    49: "DRUG3_NAME",
    50: "DRUG3_CE",
    52: "FILT1_1",
    53: "FILT1_2",
    54: "FILT2_1",
    55: "FILT2_2",
    56: "FILT3_1",
    57: "FILT3_2",
    58: "FILT4_1",
    59: "FILT4_2",
    60: "FILT5_1",
    61: "FILT5_2",
    62: "FILT6_1",
    63: "FILT6_2",
    64: "FILT7_1",
    65: "FILT7_2",
    66: "FILT8_1",
    67: "FILT8_2",
    70: "PSI",
    71: "PVI",
    72: "SPHB",
    73: "ORI",
    75: "ASKNA",
    76: "PAP_SBP",
    77: "PAP_MBP",
    78: "PAP_DBP",
    79: "FEM_SBP",
    80: "FEM_MBP",
    81: "FEM_DBP",
    82: "EEG_SEFL",
    83: "EEG_SEFR",
    84: "EEG_SR",
    85: "TOF_RATIO",
    86: "TOF_CNT",
    87: "SKNA_WAV",
    88: "ICP",
    89: "CPP",
    90: "ICP_WAV",
    91: "PAP_WAV",
    92: "FEM_WAV",
    93: "ALARM_LEVEL",
    95: "EEGL_WAV",
    96: "EEGR_WAV",
    97: "ANII",
    98: "ANIM",
    99: "PTC_CNT",
};

/** Packet type constants */
const PKT_TRKINFO = 0;
const PKT_REC = 1;
const PKT_CMD = 6;
const PKT_DEVINFO = 9;

/** Record type constants */
const TYPE_WAV = 1;
const TYPE_NUM = 2;
const TYPE_STR = 5;

/** Command constants */
const CMD_ORDER = 5;
const CMD_RESET_EVENTS = 6;

/** Packet header size: 1 byte type + 4 bytes datalen */
const PKT_HEADER_SIZE = 5;

/**
 * Read a length-prefixed UTF-8 string from buffer
 * @param {Buffer} buf
 * @param {number} pos - current read position
 * @returns {[string, number]} - [parsed string, new position]
 */
function buf2str(buf, pos) {
    if (pos + 4 > buf.length) {
        throw new RangeError(`buf2str: not enough data for string length at pos ${pos}`);
    }
    const strlen = buf.readUInt32LE(pos);
    pos += 4;
    if (pos + strlen > buf.length) {
        throw new RangeError(`buf2str: string length ${strlen} exceeds buffer at pos ${pos}`);
    }
    const str = buf.toString("utf8", pos, pos + strlen);
    pos += strlen;
    return [str, pos];
}

/**
 * Parse record format code to [format char, byte size]
 * @param {number} fmt - format code from TRKINFO
 * @returns {[string, number]} - [format code string, byte size per element]
 */
function parse_fmt(fmt) {
    switch (fmt) {
        case 1: return ["f", 4];   // FMT_FLOAT
        case 2: return ["d", 8];   // FMT_DOUBLE
        case 3: return ["b", 1];   // FMT_CHAR (signed)
        case 4: return ["B", 1];   // FMT_BYTE (unsigned)
        case 5: return ["h", 2];   // FMT_SHORT
        case 6: return ["H", 2];   // FMT_WORD
        case 7: return ["l", 4];   // FMT_LONG
        case 8: return ["L", 4];   // FMT_DWORD
        default: return ["", 0];   // FMT_NULL or unknown
    }
}

/**
 * Create a typed array from a Buffer region with proper byte copy
 * Buffer.slice() shares memory, so we need to copy for correct TypedArray alignment
 * @param {string} fmtcode
 * @param {Buffer} buf
 * @param {number} offset
 * @param {number} length - byte length
 * @returns {TypedArray|null}
 */
function bufferToTypedArray(fmtcode, buf, offset, length) {
    // Copy to ensure proper alignment (Buffer.slice shares memory with potential offset issues)
    const copied = Buffer.from(buf.slice(offset, offset + length));
    const ab = copied.buffer.slice(copied.byteOffset, copied.byteOffset + copied.byteLength);

    switch (fmtcode) {
        case "f": return new Float32Array(ab);
        case "d": return new Float64Array(ab);
        case "b": return new Int8Array(ab);
        case "B": return new Uint8Array(ab);
        case "h": return new Int16Array(ab);
        case "H": return new Uint16Array(ab);
        case "l": return new Int32Array(ab);
        case "L": return new Uint32Array(ab);
        default: return null;
    }
}

/**
 * VitalFile constructor
 * @param {object|null} client - Redis client (or null)
 * @param {string} filepath - path to .vital file
 * @param {string[]} track_names - filter: only load these tracks (empty = all)
 * @param {boolean} track_names_only - if true, only parse track metadata, skip records
 * @param {string[]} exclude - track names to exclude
 */
function VitalFile(client, filepath, track_names = [], track_names_only = false, exclude = []) {
    this.devs = { 0: {} };   // device id → {name, type, port}
    this.trks = {};           // track id → track info object
    this.dtstart = 0;         // earliest timestamp
    this.dtend = 0;           // latest timestamp
    this.dgmt = 0;            // timezone bias in minutes
    this.trkorder = null;     // track display order

    // Normalize filter sets for O(1) lookup
    this._trackNameSet = new Set(track_names);
    this._excludeSet = new Set(exclude);

    const ext = path.extname(filepath).toLowerCase();
    if (ext === ".vital") {
        return this.load_vital(client, filepath, track_names_only);
    }
}

/**
 * Check if a track should be loaded based on filter settings
 * @param {string} dtname - device/track name
 * @param {string} tname - track name only
 * @returns {boolean}
 */
VitalFile.prototype._shouldLoadTrack = function (dtname, tname) {
    // Exclude filter takes priority
    if (this._excludeSet.size > 0) {
        if (this._excludeSet.has(dtname) || this._excludeSet.has(tname)) {
            return false;
        }
    }
    // If track_names filter is specified, only include matching tracks
    if (this._trackNameSet.size > 0) {
        return this._trackNameSet.has(dtname) || this._trackNameSet.has(tname);
    }
    return true;
};

/**
 * Load and parse a .vital file
 * @param {object|null} client - Redis client
 * @param {string} filepath
 * @param {boolean} track_names_only
 * @returns {Promise<void>}
 */
VitalFile.prototype.load_vital = function (client, filepath, track_names_only) {
    const rs = fs.createReadStream(filepath);
    const gunzip = zlib.createGunzip();
    let headerParsed = false;
    let remainder = null; // leftover bytes from previous chunk

    const vfs = rs.pipe(gunzip);

    return new Promise((resolve, reject) => {
        vfs.on("data", (chunk) => {
            // Prepend any leftover bytes from previous chunk
            let data;
            if (remainder) {
                data = Buffer.concat([remainder, chunk]);
                remainder = null;
            } else {
                data = chunk;
            }

            let pos = 0;

            // Parse header on first chunk
            if (!headerParsed) {
                if (data.length < 20) {
                    // Header incomplete, wait for more data
                    remainder = data;
                    return;
                }
                headerParsed = true;

                const sign = data.toString("utf8", pos, pos + 4); pos += 4;
                if (sign !== "VITA") {
                    reject(new Error("Invalid vital file: signature mismatch"));
                    rs.destroy();
                    return;
                }

                /* const format_ver = */ data.readUInt32LE(pos); pos += 4;
                /* const headerlen = */ data.readUInt16LE(pos); pos += 2;
                this.dgmt = data.readInt16LE(pos); pos += 2;
                /* const inst_id = */ data.readUInt32LE(pos); pos += 4;

                // prog_ver: 4 bytes
                pos += 4;
            }

            // Parse packets
            while (pos + PKT_HEADER_SIZE <= data.length) {
                const packet_type = data.readInt8(pos);
                const datalen = data.readUInt32LE(pos + 1);

                // Check if full packet is available
                if (pos + PKT_HEADER_SIZE + datalen > data.length) {
                    break; // incomplete packet, save remainder
                }

                const pkt_data_start = pos + PKT_HEADER_SIZE;
                let ppos = pkt_data_start;

                if (packet_type === PKT_DEVINFO) {
                    this._parseDevInfo(data, ppos);
                } else if (packet_type === PKT_TRKINFO) {
                    this._parseTrkInfo(data, ppos);
                } else if (packet_type === PKT_REC) {
                    this._parseRec(data, ppos, datalen, track_names_only);
                } else if (packet_type === PKT_CMD) {
                    this._parseCmd(data, ppos, datalen, track_names_only);
                }
                // Unknown packet types are silently skipped (per spec)

                pos = pkt_data_start + datalen;
            }

            // Save any remaining incomplete data for next chunk
            if (pos < data.length) {
                remainder = data.slice(pos);
            }
        });

        const finalize = () => {
            if (client) {
                this.toRedis(client, filepath);
            }
            resolve(this);
        };

        vfs.on("end", finalize);

        vfs.on("error", (err) => {
            // Z_BUF_ERROR at end of stream is common for truncated gzip — treat as normal end
            if (err.code === "Z_BUF_ERROR" && err.errno === -5) {
                gunzip.close();
                rs.close();
                finalize();
            } else {
                reject(err);
            }
        });
    });
};

/**
 * Parse DEVINFO packet (type=9)
 */
VitalFile.prototype._parseDevInfo = function (buf, pos) {
    const devid = buf.readUInt32LE(pos); pos += 4;
    let type, name, port;
    [type, pos] = buf2str(buf, pos);
    [name, pos] = buf2str(buf, pos);
    [port, pos] = buf2str(buf, pos);
    this.devs[devid] = { name, type, port };
};

/**
 * Parse TRKINFO packet (type=0)
 */
VitalFile.prototype._parseTrkInfo = function (buf, pos) {
    const tid = buf.readUInt16LE(pos); pos += 2;
    const rec_type = buf.readInt8(pos); pos += 1;
    const fmt = buf.readInt8(pos); pos += 1;

    let tname, unit;
    [tname, pos] = buf2str(buf, pos);
    [unit, pos] = buf2str(buf, pos);

    const mindisp = buf.readFloatLE(pos); pos += 4;
    const maxdisp = buf.readFloatLE(pos); pos += 4;
    const col = buf.readUInt32LE(pos); pos += 4;
    const srate = buf.readFloatLE(pos); pos += 4;
    const gain = buf.readDoubleLE(pos); pos += 8;
    const offset = buf.readDoubleLE(pos); pos += 8;
    const montype = buf.readUInt8(pos); pos += 1;
    const devid = buf.readUInt32LE(pos); pos += 4;

    // Build device/track name
    let dname = "";
    let dtname = tname;
    if (devid && devid in this.devs) {
        dname = this.devs[devid].name;
        dtname = dname + "/" + tname;
    }

    // Track info is always stored (even if filtered) for metadata access
    this.trks[tid] = {
        name: tname,
        dtname,
        type: rec_type,
        fmt,
        unit,
        srate,
        mindisp,
        maxdisp,
        col,
        montype,
        gain,
        offset,
        did: devid,
        recs: [],
        _excluded: !this._shouldLoadTrack(dtname, tname),
    };
};

/**
 * Parse REC packet (type=1)
 */
VitalFile.prototype._parseRec = function (buf, pos, datalen, track_names_only) {
    const infolen = buf.readUInt16LE(pos); pos += 2;
    const dt = buf.readDoubleLE(pos); pos += 8;
    const tid = buf.readUInt16LE(pos); pos += 2;

    // Update time range
    if (dt > 0) {
        if (this.dtstart === 0 || dt < this.dtstart) this.dtstart = dt;
        if (dt > this.dtend) this.dtend = dt;
    }

    // Skip record data if only collecting track names
    if (track_names_only) return;

    const trk = this.trks[tid];
    if (!trk) return; // Track info not yet seen — ignore per spec

    // Skip if track is filtered out
    if (trk._excluded) return;

    // Skip past any extra info header bytes (future-proofing based on infolen)
    // infolen includes dt(8) + trkid(2) = 10 bytes; if infolen > 10, skip extra
    const extra = infolen - 10;
    if (extra > 0) pos += extra;

    if (trk.type === TYPE_WAV) {
        const [fmtcode, fmtlen] = parse_fmt(trk.fmt);
        if (fmtlen === 0) return;

        const nsamp = buf.readUInt32LE(pos); pos += 4;

        // Update dtend based on waveform duration
        const wavEnd = dt + (nsamp / trk.srate);
        if (wavEnd > this.dtend) this.dtend = wavEnd;

        const samps = bufferToTypedArray(fmtcode, buf, pos, nsamp * fmtlen);
        if (samps) {
            trk.recs.push({ dt, val: samps });
        }
    } else if (trk.type === TYPE_NUM) {
        const [fmtcode, fmtlen] = parse_fmt(trk.fmt);
        if (fmtlen === 0) return;

        let val;
        if (fmtcode === "f") {
            val = buf.readFloatLE(pos);
        } else if (fmtcode === "d") {
            val = buf.readDoubleLE(pos);
        } else if (fmtcode === "b" || fmtcode === "h" || fmtcode === "l") {
            val = buf.readIntLE(pos, fmtlen);
        } else if (fmtcode === "B" || fmtcode === "H" || fmtcode === "L") {
            val = buf.readUIntLE(pos, fmtlen);
        }
        trk.recs.push({ dt, val });
    } else if (trk.type === TYPE_STR) {
        pos += 4; // skip unused DWORD
        let s;
        [s, pos] = buf2str(buf, pos);
        trk.recs.push({ dt, val: s });
    }
};

/**
 * Parse CMD packet (type=6)
 */
VitalFile.prototype._parseCmd = function (buf, pos, datalen, track_names_only) {
    if (track_names_only) return;

    const cmd = buf.readInt8(pos); pos += 1;

    if (cmd === CMD_RESET_EVENTS) {
        const evt_trk = this.find_track("/EVENT");
        if (evt_trk) {
            evt_trk.recs = [];
        }
    } else if (cmd === CMD_ORDER) {
        const cnt = buf.readUInt16LE(pos); pos += 2;
        const copied = Buffer.from(buf.slice(pos, pos + cnt * 2));
        const ab = copied.buffer.slice(copied.byteOffset, copied.byteOffset + copied.byteLength);
        this.trkorder = new Uint16Array(ab);
    }
};

/**
 * Get display color for a track as hex string (#RRGGBB)
 * Color is stored as 4-byte ARGB in the file
 * @param {number} tid - track id
 * @returns {string} hex color string
 */
VitalFile.prototype.get_color = function (tid) {
    if (!(tid in this.trks)) {
        throw new Error(`Track ${tid} does not exist`);
    }
    const col = this.trks[tid].col;
    // col is stored as ARGB (4 bytes), extract RGB portion
    const r = (col >> 16) & 0xFF;
    const g = (col >> 8) & 0xFF;
    const b = col & 0xFF;
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase();
};

/**
 * Get monitor type name for a track
 * @param {number} tid - track id
 * @returns {string} monitor type name or empty string
 */
VitalFile.prototype.get_montype = function (tid) {
    if (!(tid in this.trks)) {
        throw new Error(`Track ${tid} does not exist`);
    }
    const montype = this.trks[tid].montype;
    return MONTYPES[montype] || "";
};

/**
 * Get all track display names (device/track format)
 * @returns {string[]}
 */
VitalFile.prototype.get_track_names = function () {
    const dtnames = [];
    for (const tid in this.trks) {
        const trk = this.trks[tid];
        if (trk.dtname) dtnames.push(trk.dtname);
    }
    return dtnames;
};

/**
 * Find a track by device/track name
 * @param {string} dtname - "DeviceName/TrackName" or just "TrackName"
 * @returns {object|null} track info object or null
 */
VitalFile.prototype.find_track = function (dtname) {
    let dname = "";
    let tname = dtname;

    const slashIdx = dtname.indexOf("/");
    if (slashIdx > -1) {
        dname = dtname.substring(0, slashIdx);
        tname = dtname.substring(slashIdx + 1);
    }

    for (const tid in this.trks) {
        const trk = this.trks[tid];
        if (trk.name === tname) {
            const did = trk.did;
            if (did === 0 || dname === "") return trk;
            if (did in this.devs) {
                const dev = this.devs[did];
                if (dev.name === dname) return trk;
            }
        }
    }

    return null;
};

/**
 * Convert to JSON summary string
 * @returns {string}
 */
VitalFile.prototype.toString = function () {
    return JSON.stringify({
        dtstart: this.dtstart,
        dtend: this.dtend,
        dgmt: this.dgmt,  // BUG FIX: was this.dtmt (typo)
        devices: this.devs,
        tracklist: this.get_track_names(),
    });
};

/**
 * Save file metadata and track list to Redis
 * @param {object} client - Redis client
 * @param {string} filepath
 */
VitalFile.prototype.toRedis = function (client, filepath) {
    if (!client) return;

    const fname_noext = path.parse(filepath).name;
    const fstat = fs.statSync(filepath);
    const dtupload = Math.floor(fstat.mtimeMs / 1000);
    const filesize = fstat.size;

    client.zadd("api:filelist:dtupload", dtupload, fname_noext);
    client.zadd("api:filelist:dtstart", this.dtstart, fname_noext);
    client.zadd("api:filelist:dtend", this.dtend, fname_noext);
    client.set(
        "api:filelist:fileinfo:" + fname_noext,
        JSON.stringify({ dtstart: this.dtstart, dtend: this.dtend, dtupload, filesize })
    );
    client.set("api:tracklist:" + fname_noext, JSON.stringify(this.get_track_names()));
};

module.exports = VitalFile;