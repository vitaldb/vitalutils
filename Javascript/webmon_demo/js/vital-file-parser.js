/**
 * vital-file-parser.js
 * Browser-side .vital file parser
 * - Only loads tracks with known montype (in MONTYPES)
 * - Downsamples all waveforms to 100Hz
 * - Uses gain/offset with mindisp/maxdisp for correct scaling
 */

class VitalFileParser {
    constructor() {
        this.devs = { 0: {} };
        this.trks = {};
        this.dtstart = 0;
        this.dtend = 0;
        this.dgmt = 0;
        this.montypeTrackMap = {};
    }

    async parse(arrayBuffer) {
        const compressed = new Uint8Array(arrayBuffer);
        // Decompress with onData callback to handle truncated gzip (partial downloads)
        const outputChunks = [];
        const inflator = new pako.Inflate();
        inflator.onData = (chunk) => outputChunks.push(chunk);
        inflator.push(compressed, true);

        let totalLen = 0;
        for (const c of outputChunks) totalLen += c.length;
        if (totalLen === 0) throw new Error('Failed to decompress vital file');

        const decompressed = new Uint8Array(totalLen);
        let off = 0;
        for (const c of outputChunks) { decompressed.set(c, off); off += c.length; }

        const data = decompressed.buffer.slice(decompressed.byteOffset, decompressed.byteOffset + decompressed.byteLength);

        const sig = this._readString(data, 0, 4);
        if (sig !== 'VITA') throw new Error('Invalid vital file');

        let pos = 4 + 4;
        const headerLen = new Uint16Array(data.slice(pos, pos + 2))[0]; pos += 2;
        const headerStart = pos;
        this.dgmt = new Int16Array(data.slice(pos, pos + 2))[0]; pos += 2;
        pos += 4 + 4; // inst_id + prog_ver

        if (headerLen >= 27) {
            this.dtstart = new Float64Array(data.slice(pos, pos + 8))[0]; pos += 8;
            this.dtend = new Float64Array(data.slice(pos, pos + 8))[0]; pos += 8;
            pos += 1;
        }
        pos = headerStart + headerLen;

        while (pos + 5 < data.byteLength) {
            const packetType = new Int8Array(data.slice(pos, pos + 1))[0]; pos += 1;
            const packetLen = new Uint32Array(data.slice(pos, pos + 4))[0]; pos += 4;
            if (pos + packetLen > data.byteLength) break;

            const pktStart = pos;
            switch (packetType) {
                case 9: this._parseDevInfo(data, pos); break;
                case 0: this._parseTrkInfo(data, pos); break;
                case 1: this._parseRec(data, pos); break;
            }
            pos = pktStart + packetLen;
        }

        this._processData();
        return this;
    }

    _readString(buf, offset, len) {
        return String.fromCharCode(...new Uint8Array(buf.slice(offset, offset + len)));
    }

    _bufToStr(buf, pos) {
        const len = new Uint32Array(buf.slice(pos, pos + 4))[0]; pos += 4;
        const str = String.fromCharCode(...new Uint8Array(buf.slice(pos, pos + len)));
        return [str, pos + len];
    }

    _parseFmt(fmt) {
        const map = { 1: ['f', 4], 2: ['d', 8], 3: ['b', 1], 4: ['B', 1], 5: ['h', 2], 6: ['H', 2], 7: ['l', 4], 8: ['L', 4] };
        return map[fmt] || ['', 0];
    }

    _parseDevInfo(buf, pos) {
        const devId = new Uint32Array(buf.slice(pos, pos + 4))[0]; pos += 4;
        let type, name, port;
        [type, pos] = this._bufToStr(buf, pos);
        [name, pos] = this._bufToStr(buf, pos);
        [port, pos] = this._bufToStr(buf, pos);
        this.devs[devId] = { name, type, port };
    }

    _parseTrkInfo(buf, pos) {
        const tid = new Uint16Array(buf.slice(pos, pos + 2))[0]; pos += 2;
        const type = new Int8Array(buf.slice(pos, pos + 1))[0]; pos += 1;
        const fmt = new Int8Array(buf.slice(pos, pos + 1))[0]; pos += 1;

        let name, unit;
        [name, pos] = this._bufToStr(buf, pos);
        [unit, pos] = this._bufToStr(buf, pos);

        const mindisp = new Float32Array(buf.slice(pos, pos + 4))[0]; pos += 4;
        const maxdisp = new Float32Array(buf.slice(pos, pos + 4))[0]; pos += 4;
        const col = new Uint32Array(buf.slice(pos, pos + 4))[0]; pos += 4;
        const srate = new Float32Array(buf.slice(pos, pos + 4))[0]; pos += 4;
        const gain = new Float64Array(buf.slice(pos, pos + 8))[0]; pos += 8;
        const offset = new Float64Array(buf.slice(pos, pos + 8))[0]; pos += 8;
        const montype = new Uint8Array(buf.slice(pos, pos + 1))[0]; pos += 1;
        const devId = new Uint32Array(buf.slice(pos, pos + 4))[0]; pos += 4;

        // Skip tracks without a known montype
        const montypeName = MONTYPES[montype];
        if (!montypeName) {
            this.trks[tid] = { _excluded: true };
            return;
        }

        // Skip if we already have a track for this montype
        if (this._hasMontypeTrack(montypeName)) {
            this.trks[tid] = { _excluded: true };
            return;
        }

        let deviceName = '';
        let dtname = name;
        if (devId && this.devs[devId]) {
            deviceName = this.devs[devId].name;
            dtname = deviceName + '/' + name;
        }

        this.trks[tid] = {
            name, dtname, type, fmt, unit, srate,
            mindisp, maxdisp, col, montype, gain, offset,
            did: devId, recs: [], tid
        };
    }

    _hasMontypeTrack(montypeName) {
        for (const tid in this.trks) {
            const trk = this.trks[tid];
            if (!trk._excluded && MONTYPES[trk.montype] === montypeName) return true;
        }
        return false;
    }

    _parseRec(buf, pos) {
        pos += 2; // infolen reserved
        const dt = new Float64Array(buf.slice(pos, pos + 8))[0]; pos += 8;
        const tid = new Uint16Array(buf.slice(pos, pos + 2))[0]; pos += 2;

        if (dt > 0) {
            if (this.dtstart === 0 || dt < this.dtstart) this.dtstart = dt;
            if (dt > this.dtend) this.dtend = dt;
        }

        const trk = this.trks[tid];
        if (!trk || trk._excluded) return;

        if (trk.type === 1) {
            const [fmtCode, fmtLen] = this._parseFmt(trk.fmt);
            if (!fmtLen) return;
            const nsamp = new Uint32Array(buf.slice(pos, pos + 4))[0]; pos += 4;
            const wavEnd = dt + nsamp / trk.srate;
            if (wavEnd > this.dtend) this.dtend = wavEnd;

            const slice = buf.slice(pos, pos + nsamp * fmtLen);
            let samples;
            switch (fmtCode) {
                case 'f': samples = new Float32Array(slice); break;
                case 'd': samples = new Float64Array(slice); break;
                case 'b': samples = new Int8Array(slice); break;
                case 'B': samples = new Uint8Array(slice); break;
                case 'h': samples = new Int16Array(slice); break;
                case 'H': samples = new Uint16Array(slice); break;
                case 'l': samples = new Int32Array(slice); break;
                case 'L': samples = new Uint32Array(slice); break;
            }
            if (samples) trk.recs.push({ dt, val: samples });
        } else if (trk.type === 2) {
            const [fmtCode, fmtLen] = this._parseFmt(trk.fmt);
            if (!fmtLen) return;
            let val;
            switch (fmtCode) {
                case 'f': val = new Float32Array(buf.slice(pos, pos + 4))[0]; break;
                case 'd': val = new Float64Array(buf.slice(pos, pos + 8))[0]; break;
                default:
                    const arr = fmtCode === fmtCode.toLowerCase()
                        ? new Int32Array(buf.slice(pos, pos + 4))
                        : new Uint32Array(buf.slice(pos, pos + 4));
                    val = arr[0];
            }
            trk.recs.push({ dt, val });
        } else if (trk.type === 5) {
            pos += 4;
            let s;
            [s, pos] = this._bufToStr(buf, pos);
            trk.recs.push({ dt, val: s });
        }
    }

    /**
     * Process parsed data:
     * - Waveforms: downsample to 100Hz, scale using gain/offset + mindisp/maxdisp → Uint8Array
     * - Numerics/strings: convert to [relativeTime, value] arrays
     */
    _processData() {
        // Compute actual data time range from waveform records
        let wavStart = Infinity, wavEnd = 0;
        for (const tid in this.trks) {
            const trk = this.trks[tid];
            if (trk._excluded || !trk.recs || trk.recs.length === 0) continue;
            if (trk.type === 1) {
                for (const rec of trk.recs) {
                    if (rec.dt < wavStart) wavStart = rec.dt;
                    const end = rec.dt + rec.val.length / trk.srate;
                    if (end > wavEnd) wavEnd = end;
                }
            }
        }

        // Use waveform time range as effective duration
        if (wavStart === Infinity) wavStart = this.dtstart;
        if (wavEnd === 0) wavEnd = this.dtend;
        const effectiveStart = wavStart;
        const effectiveDuration = wavEnd - wavStart;
        if (effectiveDuration <= 0) return;

        // Override dtstart/dtend to match actual data range
        this.dtstart = effectiveStart;
        this.dtend = wavEnd;

        const targetSrate = STANDARD_SRATE;

        for (const tid in this.trks) {
            const trk = this.trks[tid];
            if (trk._excluded || !trk.recs || trk.recs.length === 0) continue;

            trk.recs.sort((a, b) => a.dt - b.dt);

            if (trk.type === 1) {
                // Convert mindisp/maxdisp from display units to raw count units
                // display_value = raw_value * gain + offset
                // raw_value = (display_value - offset) / gain
                const g = (trk.gain && trk.gain !== 0) ? trk.gain : 1;
                const o = trk.offset || 0;
                const minCount = (trk.mindisp - o) / g;
                const maxCount = (trk.maxdisp - o) / g;
                const range = maxCount - minCount;

                if (range === 0) continue;

                // CO2/RESP waveforms: 25Hz (4x slower scroll), others: 100Hz
                const montypeName = MONTYPES[trk.montype] || '';
                const isSlowWav = (montypeName === 'CO2_WAV' || montypeName === 'RESP_WAV');
                const trkTargetSrate = isSlowWav ? 25 : targetSrate;

                const totalSamples = Math.ceil(trkTargetSrate * effectiveDuration);
                const samples = new Uint8Array(totalSamples);
                const ratio = trk.srate / trkTargetSrate;

                for (const rec of trk.recs) {
                    if (!rec.val || typeof rec.val !== 'object') continue;

                    const recStartIdx = Math.floor((rec.dt - effectiveStart) * trkTargetSrate);

                    for (let i = 0; i < rec.val.length; i += ratio) {
                        const outIdx = recStartIdx + Math.floor(i / ratio);
                        if (outIdx < 0 || outIdx >= totalSamples) continue;

                        const v = rec.val[Math.floor(i)];
                        if (v === 0) {
                            samples[outIdx] = 0;
                        } else {
                            let scaled = (v - minCount) / range * 254 + 1;
                            samples[outIdx] = Math.max(1, Math.min(255, Math.round(scaled)));
                        }
                    }
                }

                trk.prev = samples;
                trk.srate = trkTargetSrate;
                delete trk.recs;
            } else {
                // Numeric/string: filter to effective time range
                trk.data = trk.recs
                    .filter(r => {
                        if (trk.type === 5) return r.dt >= effectiveStart && r.dt <= wavEnd;
                        return Number.isFinite(r.val) && r.dt >= effectiveStart && r.dt <= wavEnd;
                    })
                    .map(r => [r.dt - effectiveStart, r.val]);
                delete trk.recs;
            }
        }

        // Build montype → track map
        for (const tid in this.trks) {
            const trk = this.trks[tid];
            if (trk._excluded) continue;
            const montypeName = MONTYPES[trk.montype];
            if (montypeName && !this.montypeTrackMap[montypeName]) {
                this.montypeTrackMap[montypeName] = trk;
            }
        }
    }

    get duration() {
        return this.dtend - this.dtstart;
    }
}
