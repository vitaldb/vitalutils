/**
 * VitalFile Module
 * Responsible for parsing and displaying vital file data
 */
import { MONTYPES, DEVICE_ORDERS, DEVICE_HEIGHT, HEADER_WIDTH } from './constants.js';
import { MonitorView } from './monitor-view.js';
import { TrackView } from './track-view.js';
import { updateLoadingProgress } from './utils.js';

/**
 * VitalFile class
 * Represents a single vital file, handles parsing and display
 */
export class VitalFile {
    /**
     * Create a new VitalFile instance
     * @param {Blob} file - The file blob
     * @param {string} filename - The name of the file
     * @param {Function} progressCallback - Callback for progress updates
     */
    constructor(file, filename, progressCallback) {
        this.filename = filename;
        this.bedname = filename.substr(0, filename.length - 20);
        this.devs = { 0: {} };
        this.trks = {};
        this.dtstart = 0;
        this.dtend = 0;
        this.dgmt = 0;
        this.sorted_tids = [];
        this.canvas_height = 0;

        // View controllers
        this.monitorView = new MonitorView(this);
        this.trackView = new TrackView(this);

        // Current view mode
        this.currentView = null;

        // Load and parse the file
        this.load_vital(file, progressCallback);
    }

    /**
     * Load and parse a vital file
     * @param {Blob} file - The file blob to parse
     * @param {Function} progressCallback - Callback for progress updates
     */
    load_vital(file, progressCallback) {
        const fileReader = new FileReader();

        fileReader.readAsArrayBuffer(file);
        fileReader.onloadend = async (e) => {
            if (e.target.error) {
                throw new Error("Failed to read file");
            }

            try {
                // Decompress the file using pako
                const data = pako.inflate(e.target.result);
                const buffer = this.typedArrayToBuffer(data);

                let pos = 0;

                // Validate file signature
                const signature = this.arrayBufferToString(buffer.slice(0, 4));
                pos += 4;

                if (signature !== "VITA") {
                    throw new Error("Invalid vital file signature");
                }

                // Skip 4 bytes
                pos += 4;

                // Read header length
                let headerLen;
                [headerLen, pos] = this.buf2data(buffer, pos, 2, 1);
                pos += headerLen;

                console.time("parsing");
                console.log("Unzipped size:", buffer.byteLength);

                // Update progress
                await this.updateProgress(progressCallback, this.filename, pos, buffer.byteLength);

                // Parse in chunks to avoid UI freezing
                let flag = buffer.byteLength / 15.0;

                while (pos + 5 < buffer.byteLength) {
                    let packet_type, packet_len;
                    [packet_type, pos] = this.buf2data(buffer, pos, 1, 1, true);
                    [packet_len, pos] = this.buf2data(buffer, pos, 4, 1);

                    const packet = buffer.slice(pos - 5, pos + packet_len);

                    if (buffer.byteLength < pos + packet_len) {
                        break;
                    }

                    const data_pos = pos;
                    let ppos = 5;

                    // Process different packet types
                    if (packet_type === 9) {
                        // Device info packet
                        this.parseDeviceInfoPacket(packet, ppos);
                    } else if (packet_type === 0) {
                        // Track info packet
                        this.parseTrackInfoPacket(packet, ppos);
                    } else if (packet_type === 1) {
                        // Record packet
                        this.parseRecordPacket(packet, ppos);
                    } else if (packet_type === 6) {
                        // Command packet
                        this.parseCommandPacket(packet, ppos);
                    }

                    pos = data_pos + packet_len;

                    // Update progress periodically for large files
                    if (pos >= flag && buffer.byteLength > 31457280) { // file larger than 30MB
                        await this.updateProgress(progressCallback, this.filename, pos, buffer.byteLength);
                        flag += buffer.byteLength / 15.0;
                    }
                }

                console.timeEnd("parsing");

                // Final progress update
                await this.updateProgress(progressCallback, this.filename, pos, buffer.byteLength)
                    .then(() => this.justify_recs())
                    .then(() => this.sort_tracks());

            } catch (error) {
                console.error("Error parsing vital file:", error);
                throw error;
            }
        };
    }

    /**
     * Draw the file in the specified view
     * @param {string} viewType - The view type ('track' or 'moni')
     */
    draw(viewType) {
        this.currentView = viewType;

        if (viewType === 'track') {
            this.trackView.drawTrackView();
        } else if (viewType === 'moni') {
            this.monitorView.drawMonitorView();
        }
    }

    /**
     * Parse device info packet
     * @param {ArrayBuffer} packet - The packet data
     * @param {number} ppos - Current position in the packet
     * @returns {number} - New position after parsing
     */
    parseDeviceInfoPacket(packet, ppos) {
        let did, type, name, port;

        [did, ppos] = this.buf2data(packet, ppos, 4, 1);
        port = "";
        [type, ppos] = this.buf2str(packet, ppos);
        [name, ppos] = this.buf2str(packet, ppos);
        [port, ppos] = this.buf2str(packet, ppos);

        this.devs[did] = { "name": name, "type": type, "port": port };

        return ppos;
    }

    /**
     * Parse track info packet
     * @param {ArrayBuffer} packet - The packet data
     * @param {number} ppos - Current position in the packet
     * @returns {number} - New position after parsing
     */
    parseTrackInfoPacket(packet, ppos) {
        let tid, trktype, fmt, did, col, montype, unit, gain, offset, srate, mindisp, maxdisp, tname;

        did = col = 0;
        montype = unit = "";
        gain = offset = srate = mindisp = maxdisp = 0.0;

        [tid, ppos] = this.buf2data(packet, ppos, 2, 1);
        [trktype, ppos] = this.buf2data(packet, ppos, 1, 1, true);
        [fmt, ppos] = this.buf2data(packet, ppos, 1, 1, true);
        [tname, ppos] = this.buf2str(packet, ppos);
        [unit, ppos] = this.buf2str(packet, ppos);
        [mindisp, ppos] = this.buf2data(packet, ppos, 4, 1, true, "float");
        [maxdisp, ppos] = this.buf2data(packet, ppos, 4, 1, true, "float");
        [col, ppos] = this.buf2data(packet, ppos, 4, 1);
        [srate, ppos] = this.buf2data(packet, ppos, 4, 1, true, "float");
        [gain, ppos] = this.buf2data(packet, ppos, 8, 1);
        [offset, ppos] = this.buf2data(packet, ppos, 8, 1);
        [montype, ppos] = this.buf2data(packet, ppos, 1, 1, true);
        [did, ppos] = this.buf2data(packet, ppos, 4, 1);

        let dname = "";
        let dtname = "";

        if (did && did in this.devs) {
            dname = this.devs[did].name;
            dtname = dname + "/" + tname;
        } else {
            dtname = tname;
        }

        this.trks[tid] = {
            "name": tname,
            "dtname": dtname,
            "type": trktype,
            "fmt": fmt,
            "unit": unit,
            "srate": srate,
            "mindisp": mindisp,
            "maxdisp": maxdisp,
            "col": col,
            "montype": montype,
            "gain": gain,
            "offset": offset,
            "did": did,
            "recs": []
        };

        return ppos;
    }

    /**
     * Parse record packet
     * @param {ArrayBuffer} packet - The packet data
     * @param {number} ppos - Current position in the packet
     * @returns {number} - New position after parsing
     */
    parseRecordPacket(packet, ppos) {
        ppos += 2;

        let dt, tid;
        [dt, ppos] = this.buf2data(packet, ppos, 8, 1);
        [tid, ppos] = this.buf2data(packet, ppos, 2, 1);

        if (this.dtstart === 0 || (dt > 0 && dt < this.dtstart)) {
            this.dtstart = dt;
        }

        if (dt > this.dtend) {
            this.dtend = dt;
        }

        const trk = this.trks[tid];
        if (!trk) return ppos;

        if (trk.type === 1) { // wav
            const [fmtcode, fmtlen] = this.parse_fmt(trk.fmt);
            let nsamp;
            [nsamp, ppos] = this.buf2data(packet, ppos, 4, 1);

            if (dt + (nsamp / trk.srate) > this.dtend) {
                this.dtend = dt + (nsamp / trk.srate);
            }

            let samps;
            if (fmtcode === "f") {
                samps = new Float32Array(packet.slice(ppos, ppos + nsamp * fmtlen));
            } else if (fmtcode === "d") {
                samps = new Float64Array(packet.slice(ppos, ppos + nsamp * fmtlen));
            } else if (fmtcode === "b") {
                samps = new Int8Array(packet.slice(ppos, ppos + nsamp * fmtlen));
            } else if (fmtcode === "B") {
                samps = new Uint8Array(packet.slice(ppos, ppos + nsamp * fmtlen));
            } else if (fmtcode === "h") {
                samps = new Int16Array(packet.slice(ppos, ppos + nsamp * fmtlen));
            } else if (fmtcode === "H") {
                samps = new Uint16Array(packet.slice(ppos, ppos + nsamp * fmtlen));
            } else if (fmtcode === "l") {
                samps = new Int32Array(packet.slice(ppos, ppos + nsamp * fmtlen));
            } else if (fmtcode === "L") {
                samps = new Uint32Array(packet.slice(ppos, ppos + nsamp * fmtlen));
            }

            trk.recs.push({ "dt": dt, "val": samps });

        } else if (trk.type === 2) { // num
            const [fmtcode, fmtlen] = this.parse_fmt(trk.fmt);
            let val;

            if (fmtcode === "f") {
                [val, ppos] = this.buf2data(packet, ppos, fmtlen, 1, true, "float");
            } else if (fmtcode === "d") {
                [val, ppos] = this.buf2data(packet, ppos, fmtlen, 1);
            } else if (fmtcode === "b" || fmtcode === "h" || fmtcode === "l") {
                [val, ppos] = this.buf2data(packet, ppos, fmtlen, 1, true);
            } else if (fmtcode === "B" || fmtcode === "H" || fmtcode === "L") {
                [val, ppos] = this.buf2data(packet, ppos, fmtlen, 1);
            }

            trk.recs.push({ "dt": dt, "val": val });

        } else if (trk.type === 5) { // str
            ppos += 4;
            let s;
            [s, ppos] = this.buf2str(packet, ppos);
            trk.recs.push({ "dt": dt, "val": s });
        }

        return ppos;
    }

    /**
     * Parse command packet
     * @param {ArrayBuffer} packet - The packet data
     * @param {number} ppos - Current position in the packet
     * @returns {number} - New position after parsing
     */
    parseCommandPacket(packet, ppos) {
        let cmd;
        [cmd, ppos] = this.buf2data(packet, ppos, 1, 1, true);

        if (cmd === 6) { // reset events
            const evt_trk = this.find_track("/EVENT");
            if (evt_trk) evt_trk.recs = [];
        } else if (cmd === 5) { // trk order
            let cnt;
            [cnt, ppos] = this.buf2data(packet, ppos, 2, 1);
            this.trkorder = new Uint16Array(packet.slice(ppos, ppos + cnt * 2));
        }

        return ppos;
    }

    /**
     * Update progress indicator
     * @param {Function} progressCallback - The progress callback function
     * @param {string} filename - The filename being processed
     * @param {number} offset - Current processing position
     * @param {number} datalen - Total data length
     * @returns {Promise} - Promise that resolves when progress is updated
     */
    updateProgress(progressCallback, filename, offset, datalen) {
        return new Promise(resolve => {
            const percentage = (offset / datalen * 100).toFixed(2);
            if (progressCallback) {
                progressCallback(percentage);
            }
            // Small delay to allow UI updates
            setTimeout(resolve, 0);
        });
    }

    /**
     * Process tracks data after loading
     * Normalizes and prepares track data for display
     */
    justify_recs() {
        const file_len = this.dtend - this.dtstart;

        for (const tid in this.trks) {
            const trk = this.trks[tid];
            if (trk.recs.length <= 0) continue;

            // Sort records by timestamp
            trk.recs.sort((a, b) => a.dt - b.dt);

            // Process waveform tracks
            if (trk.type === 1) {
                const tlen = Math.ceil(trk.srate * file_len);
                const val = new Uint8Array(tlen);
                const mincnt = (trk.mindisp - trk.offset) / trk.gain;
                const maxcnt = (trk.maxdisp - trk.offset) / trk.gain;

                for (const idx in trk.recs) {
                    const rec = trk.recs[idx];
                    if (!rec.val || (typeof rec.val) !== "object") {
                        continue;
                    }

                    let i = parseInt((rec.dt - this.dtstart) * trk.srate);
                    rec.val.forEach(v => {
                        if (v === 0) {
                            val[i] = 0;
                        } else {
                            v = (v - mincnt) / (maxcnt - mincnt) * 254 + 1;
                            if (v < 1) v = 1;
                            else if (v > 255) v = 255;
                            val[i] = v;
                        }
                        i++;
                    });
                }

                this.trks[tid].prev = val;

            } else { // Numeric or string tracks
                const val = [];
                for (const idx in trk.recs) {
                    const rec = trk.recs[idx];
                    val.push([rec.dt - this.dtstart, rec.val]);
                }
                this.trks[tid].data = val;
            }
        }
    }

    /**
     * Sort tracks for display
     */
    sort_tracks() {
        const ordered_trks = {};

        // Group tracks by device
        for (const tid in this.trks) {
            const trk = this.trks[tid];
            const dname = trk.dtname.split("/")[0];
            this.trks[tid].dname = dname;

            let order = DEVICE_ORDERS.indexOf(dname);
            if (order === -1) {
                order = '99' + dname;
            } else if (order < 10) {
                order = '0' + order + dname;
            } else {
                order = order + dname;
            }

            if (!ordered_trks[order]) {
                ordered_trks[order] = {};
            }

            ordered_trks[order][trk.name] = tid;
        }

        // Create sorted track list
        const tracks = [];
        const ordered_tkeys = Object.keys(ordered_trks).sort();

        for (const i in ordered_tkeys) {
            const order = ordered_tkeys[i];
            const tnames = Object.keys(ordered_trks[order]).sort();

            for (const j in tnames) {
                const tname = tnames[j];
                tracks.push(ordered_trks[order][tname]);
            }
        }

        // Calculate track heights and positions
        let ty = DEVICE_HEIGHT;
        let lastdname = "";

        for (const i in tracks) {
            const tid = tracks[i];
            const dname = this.trks[tid].dname;

            if (dname !== lastdname) {
                lastdname = dname;
                ty += DEVICE_HEIGHT;
            }

            this.trks[tid].ty = ty;
            this.trks[tid].th = (this.trks[tid].type === 1) ? 40 : 24;
            ty += this.trks[tid].th;
        }

        this.sorted_tids = tracks;
        this.canvas_height = ty;
    }

    /**
     * Find a track by name
     * @param {string} dtname - Track name to find
     * @returns {Object|null} - The track object or null if not found
     */
    find_track(dtname) {
        let dname = "";
        let tname = dtname;

        if (dtname.indexOf("/") > -1) {
            [dname, tname] = dtname.split("/");
        }

        for (const tid in this.trks) {
            const trk = this.trks[tid];
            if (trk.name === tname) {
                const did = trk.did;
                if (did === 0 || dname === "") return trk;

                if (did in this.devs) {
                    const dev = this.devs[did];
                    if ("name" in dev && dname === dev.name) return trk;
                }
            }
        }

        return null;
    }

    /**
     * Get color for a track
     * @param {number} tid - Track ID
     * @returns {string} - Color as hex string
     */
    get_color(tid) {
        if (tid in this.trks) {
            return "#" + ("0" + (Number(this.trks[tid].col).toString(16))).slice(3).toUpperCase();
        }
        throw new Error(tid + " does not exist in track list");
    }

    /**
     * Get monitor type name for a track
     * @param {number} tid - Track ID
     * @returns {string} - Monitor type name
     */
    get_montype(tid) {
        if (tid in this.trks) {
            const montype = this.trks[tid].montype;
            if (montype in MONTYPES) return MONTYPES[montype];
            return "";
        }
        throw new Error(tid + " does not exist in track list");
    }

    /**
     * Get all track names
     * @returns {Array<string>} - Array of track names
     */
    get_track_names() {
        const dtnames = [];
        for (const tid in this.trks) {
            const trk = this.trks[tid];
            if (trk.dtname) dtnames.push(trk.dtname);
        }
        return dtnames;
    }

    /**
     * Handle resize for the current view
     */
    resize() {
        if (this.currentView === 'track') {
            this.trackView.resizeTrackView();
        } else if (this.currentView === 'moni') {
            this.monitorView.resizeMonitorView();
        }
    }

    // Utility functions

    /**
     * Convert typed array to buffer
     * @param {TypedArray} array - The typed array to convert
     * @returns {ArrayBuffer} - The resulting buffer
     */
    typedArrayToBuffer(array) {
        return array.buffer.slice(0, array.byteLength);
    }

    /**
     * Convert array buffer to string
     * @param {ArrayBuffer} buffer - The buffer to convert
     * @returns {string} - The resulting string
     */
    arrayBufferToString(buffer) {
        const arr = new Uint8Array(buffer);
        return String.fromCharCode.apply(String, arr);
    }

    /**
     * Read string from buffer
     * @param {ArrayBuffer} buf - The buffer to read from
     * @param {number} pos - Position to start reading
     * @returns {Array} - The string and the new position
     */
    buf2str(buf, pos) {
        const strlen = new Uint32Array(buf.slice(pos, pos + 4))[0];
        let npos = pos + 4;
        const arr = new Uint8Array(buf.slice(npos, npos + strlen));
        const str = String.fromCharCode.apply(String, arr);
        npos += strlen;
        return [str, npos];
    }

    /**
     * Parse format code
     * @param {number} fmt - Format code
     * @returns {Array} - Format character and size
     */
    parse_fmt(fmt) {
        if (fmt == 1) return ["f", 4];
        else if (fmt == 2) return ["d", 8];
        else if (fmt == 3) return ["b", 1];
        else if (fmt == 4) return ["B", 1];
        else if (fmt == 5) return ["h", 2];
        else if (fmt == 6) return ["H", 2];
        else if (fmt == 7) return ["l", 4];
        else if (fmt == 8) return ["L", 4];
        return ["", 0];
    }

    /**
     * Read data from buffer
     * @param {ArrayBuffer} buf - The buffer to read from
     * @param {number} pos - Position to start reading
     * @param {number} size - Size of each element
     * @param {number} len - Number of elements to read
     * @param {boolean} signed - Whether to use signed types
     * @param {string} type - Special type handling
     * @returns {Array} - The data and the new position
     */
    buf2data(buf, pos, size, len, signed = false, type = "") {
        let res;
        const slice = buf.slice(pos, pos + size * len);

        switch (size) {
            case 1:
                if (signed) res = new Int8Array(slice);
                else res = new Uint8Array(slice);
                break;
            case 2:
                if (signed) res = new Int16Array(slice);
                else res = new Uint16Array(slice);
                break;
            case 4:
                if (type == "float") res = new Float32Array(slice);
                else {
                    if (signed) res = new Int32Array(slice);
                    else res = new Uint32Array(slice);
                }
                break;
            case 8:
                res = new Float64Array(slice);
                break;
        }

        const npos = pos + (size * len);
        if (len == 1) res = res[0];
        return [res, npos];
    }
}