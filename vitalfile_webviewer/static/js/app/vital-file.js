/**
 * vital-file.js
 * VitalFile class that handles loading and parsing vital files
 */

// VitalFile class constructor
function VitalFile(file, filename) {
    this.filename = filename;
    this.bedname = filename.substr(0, filename.length - 20);
    this.devs = { 0: {} };
    this.trks = {};
    this.dtstart = 0;
    this.dtend = 0;
    this.dgmt = 0;

    this.load_vital(file);
}

// VitalFile prototype methods
VitalFile.prototype = {
    load_vital: async function (file) {
        const self = this;
        const fileReader = new FileReader();

        fileReader.readAsArrayBuffer(file);
        fileReader.onloadend = async function (e) {
            if (e.target.error) return;

            let data = pako.inflate(e.target.result);
            data = Utils.typedArrayToBuffer(data);
            let pos = 0;

            const sign = Utils.arrayBufferToString(data.slice(0, 4));
            pos += 4;

            if (sign !== "VITA") throw new Error("invalid vital file");

            pos += 4;
            let headerlen;
            [headerlen, pos] = Utils.buf2data(data, pos, 2, 1);
            pos += headerlen;

            console.time("parsing");
            console.log("Unzipped: " + data.byteLength);
            await Utils._progress(self.filename, pos, data.byteLength);

            let flag = data.byteLength / 15.0;

            while (pos + 5 < data.byteLength) {
                let packet_type, packet_len;
                [packet_type, pos] = Utils.buf2data(data, pos, 1, 1, true);
                [packet_len, pos] = Utils.buf2data(data, pos, 4, 1);

                const packet = data.slice(pos - 5, pos + packet_len);
                if (data.byteLength < pos + packet_len) {
                    break;
                }

                const data_pos = pos;
                let ppos = 5;

                if (packet_type === 9) { // devinfo
                    let did, type, name, port;
                    [did, ppos] = Utils.buf2data(packet, ppos, 4, 1);
                    port = "";
                    [type, ppos] = Utils.buf2str(packet, ppos);
                    [name, ppos] = Utils.buf2str(packet, ppos);
                    [port, ppos] = Utils.buf2str(packet, ppos);
                    self.devs[did] = { "name": name, "type": type, "port": port };
                } else if (packet_type === 0) { // trkinfo
                    let tid, trktype, fmt, did, col, montype, unit, gain, offset, srate, mindisp, maxdisp, tname;
                    did = col = 0;
                    montype = unit = "";
                    gain = offset = srate = mindisp = maxdisp = 0.0;

                    [tid, ppos] = Utils.buf2data(packet, ppos, 2, 1);
                    [trktype, ppos] = Utils.buf2data(packet, ppos, 1, 1, true);
                    [fmt, ppos] = Utils.buf2data(packet, ppos, 1, 1, true);
                    [tname, ppos] = Utils.buf2str(packet, ppos);
                    [unit, ppos] = Utils.buf2str(packet, ppos);
                    [mindisp, ppos] = Utils.buf2data(packet, ppos, 4, 1, true, "float");
                    [maxdisp, ppos] = Utils.buf2data(packet, ppos, 4, 1, true, "float");
                    [col, ppos] = Utils.buf2data(packet, ppos, 4, 1);
                    [srate, ppos] = Utils.buf2data(packet, ppos, 4, 1, true, "float");
                    [gain, ppos] = Utils.buf2data(packet, ppos, 8, 1);
                    [offset, ppos] = Utils.buf2data(packet, ppos, 8, 1);
                    [montype, ppos] = Utils.buf2data(packet, ppos, 1, 1, true);
                    [did, ppos] = Utils.buf2data(packet, ppos, 4, 1);

                    let dname = "";
                    let dtname = "";

                    if (did && did in self.devs) {
                        dname = self.devs[did]["name"];
                        dtname = dname + "/" + tname;
                    } else {
                        dtname = tname;
                    }

                    self.trks[tid] = {
                        "name": tname, "dtname": dtname, "type": trktype, "fmt": fmt, "unit": unit, "srate": srate,
                        "mindisp": mindisp, "maxdisp": maxdisp, "col": col, "montype": montype,
                        "gain": gain, "offset": offset, "did": did, "recs": [], "tid": tid
                    };
                } else if (packet_type === 1) { // rec
                    ppos += 2;
                    let dt, tid;
                    [dt, ppos] = Utils.buf2data(packet, ppos, 8, 1);
                    [tid, ppos] = Utils.buf2data(packet, ppos, 2, 1);

                    if (self.dtstart === 0 || (dt > 0 && dt < self.dtstart)) self.dtstart = dt;
                    if (dt > self.dtend) self.dtend = dt;

                    const trk = self.trks[tid];
                    const fmtlen = 4;

                    if (trk.type === 1) { // wav
                        const [fmtcode, fmtlen] = Utils.parse_fmt(trk.fmt);
                        let nsamp;
                        [nsamp, ppos] = Utils.buf2data(packet, ppos, 4, 1);

                        if (dt + (nsamp / self.trks[tid].srate) > self.dtend) {
                            self.dtend = dt + (nsamp / self.trks[tid].srate);
                        }

                        let samps;
                        if (fmtcode === "f") samps = new Float32Array(packet.slice(ppos, ppos + nsamp * fmtlen));
                        else if (fmtcode === "d") samps = new Float64Array(packet.slice(ppos, ppos + nsamp * fmtlen));
                        else if (fmtcode === "b") samps = new Int8Array(packet.slice(ppos, ppos + nsamp * fmtlen));
                        else if (fmtcode === "B") samps = new Uint8Array(packet.slice(ppos, ppos + nsamp * fmtlen));
                        else if (fmtcode === "h") samps = new Int16Array(packet.slice(ppos, ppos + nsamp * fmtlen));
                        else if (fmtcode === "H") samps = new Uint16Array(packet.slice(ppos, ppos + nsamp * fmtlen));
                        else if (fmtcode === "l") samps = new Int32Array(packet.slice(ppos, ppos + nsamp * fmtlen));
                        else if (fmtcode === "L") samps = new Uint32Array(packet.slice(ppos, ppos + nsamp * fmtlen));

                        trk.recs.push({ "dt": dt, "val": samps });
                    } else if (trk.type === 2) { // num
                        const [fmtcode, fmtlen] = Utils.parse_fmt(trk.fmt);
                        let val;

                        if (fmtcode === "f") {
                            [val, ppos] = Utils.buf2data(packet, ppos, fmtlen, 1, true, "float");
                        } else if (fmtcode === "d") {
                            [val, ppos] = Utils.buf2data(packet, ppos, fmtlen, 1);
                        } else if (fmtcode === "b" || fmtcode === "h" || fmtcode === "l") {
                            [val, ppos] = Utils.buf2data(packet, ppos, fmtlen, 1, true);
                        } else if (fmtcode === "B" || fmtcode === "H" || fmtcode === "L") {
                            [val, ppos] = Utils.buf2data(packet, ppos, fmtlen, 1);
                        }

                        trk.recs.push({ "dt": dt, "val": val });
                    } else if (trk.type === 5) { // str
                        ppos += 4;
                        let s;
                        [s, ppos] = Utils.buf2str(packet, ppos);
                        trk.recs.push({ "dt": dt, "val": s });
                    }
                } else if (packet_type === 6) { // cmd
                    let cmd;
                    [cmd, ppos] = Utils.buf2data(packet, ppos, 1, 1, true);

                    if (cmd === 6) { // reset events
                        const evt_trk = self.find_track("/EVENT");
                        if (evt_trk) evt_trk.recs = [];
                    } else if (cmd === 5) { // trk order
                        let cnt;
                        [cnt, ppos] = Utils.buf2data(packet, ppos, 2, 1);
                        self.trkorder = new Uint16Array(packet.slice(ppos, ppos + cnt * 2));
                    }
                }

                pos = data_pos + packet_len;

                if (pos >= flag && data.byteLength > 31457280) { // file larger than 30mb
                    await Utils._progress(self.filename, pos, data.byteLength)
                        .then(async function () {
                            flag += data.byteLength / 15.0;
                        });
                }
            }

            console.timeEnd("parsing");
            await Utils._progress(self.filename, pos, data.byteLength)
                .then(function () { self.justify_recs(); })
                .then(function () { self.sort_tracks(); })
                .then(function () {
                    if (window.view === 'moni') {
                        self.draw_moniview();
                    } else {
                        self.draw_trackview();
                    }
                });
        };
    },

    get_color: function (tid) {
        if (tid in this.trks) {
            return "#" + ("0" + (Number(this.trks[tid].col).toString(16))).slice(3).toUpperCase();
        }
        throw new Error(tid + " does not exist in track list");
    },

    get_montype: function (tid) {
        if (tid in this.trks) {
            const montype = this.trks[tid].montype;
            if (montype in CONSTANTS.MONTYPES) return CONSTANTS.MONTYPES[montype];
            return "";
        }
        throw new Error(tid + " does not exist in track list");
    },

    get_track_names: function () {
        const dtnames = [];
        for (let tid in this.trks) {
            const trk = this.trks[tid];
            if (trk.dtname) dtnames.push(trk.dtname);
        }
        return dtnames;
    },

    find_track: function (dtname) {
        let dname = "";
        let tname = dtname;

        if (dtname.indexOf("/") > -1) {
            [dname, tname] = dtname.split("/");
        }

        for (let tid in this.trks) {
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
    },

    justify_recs: function () {
        const file_len = this.dtend - this.dtstart;

        for (let tid in this.trks) {
            const trk = this.trks[tid];
            if (trk.recs.length <= 0) continue;

            trk.recs.sort(function (a, b) {
                return a.dt - b.dt;
            });

            // Handle wave data
            if (trk.type === 1) {
                const tlen = Math.ceil(trk.srate * file_len);
                const val = new Uint8Array(tlen);
                const mincnt = (trk.mindisp - trk.offset) / trk.gain;
                const maxcnt = (trk.maxdisp - trk.offset) / trk.gain;

                for (let idx in trk.recs) {
                    const rec = trk.recs[idx];
                    if (!rec.val || (typeof rec.val) !== "object") {
                        continue;
                    }

                    let i = parseInt((rec.dt - this.dtstart) * trk.srate);
                    rec.val.forEach(function (v) {
                        if (v === 0) {
                            val[i] = 0;
                        } else {
                            let scaledV = (v - mincnt) / (maxcnt - mincnt) * 254 + 1;
                            if (scaledV < 1) scaledV = 1;
                            else if (scaledV > 255) scaledV = 255;
                            val[i] = scaledV;
                        }
                        i++;
                    });
                }

                this.trks[tid].prev = val;
            } else { // Numeric or string data
                const val = [];
                for (let idx in trk.recs) {
                    const rec = trk.recs[idx];
                    val.push([rec.dt - this.dtstart, rec.val]);
                }

                this.trks[tid].data = val;
            }
        }
    },

    sort_tracks: function () {
        const ordered_trks = {};

        for (let tid in this.trks) {
            const trk = this.trks[tid];
            const dname = trk.dtname.split("/")[0];
            this.trks[tid].dname = dname;

            let order = CONSTANTS.DEVICE_ORDERS.indexOf(dname);
            if (order === -1) {
                order = '99' + dname;
            } else if (order < 10) {
                order = '0' + order + dname;
            } else {
                order = order + dname;
            }

            if (!ordered_trks[order]) ordered_trks[order] = {};
            ordered_trks[order][trk.name] = tid;
        }

        const tracks = [];
        const ordered_tkeys = Object.keys(ordered_trks).sort();

        for (let i in ordered_tkeys) {
            const order = ordered_tkeys[i];
            const tnames = Object.keys(ordered_trks[order]).sort();

            for (let j in tnames) {
                const tname = tnames[j];
                tracks.push(ordered_trks[order][tname]);
            }
        }

        // Calculate track heights and positions
        let ty = CONSTANTS.DEVICE_HEIGHT;
        let lastdname = "";

        for (let i in tracks) {
            const tid = tracks[i];
            const dname = this.trks[tid].dname;

            if (dname !== lastdname) {
                lastdname = dname;
                ty += CONSTANTS.DEVICE_HEIGHT;
            }

            this.trks[tid].ty = ty;
            this.trks[tid].th = (this.trks[tid].ttype === 'W') ? 40 : 24;
            ty += this.trks[tid].th;
        }

        this.sorted_tids = tracks;
        const canvas = document.getElementById('file_preview');
        canvas.height = ty;
        canvas.style.height = ty + 'px';
    },

    draw_track: function (tid) {
        return TrackView.drawTrack(tid);
    },

    draw_trackview: function () {
        window.view = "track";
        window.vf = this;

        $("#moni_preview").hide();
        $("#moni_control").hide();
        $("#file_preview").show();
        $("#fit_width").show();
        $("#fit_100px").show();
        $("#convert_view").attr("onclick", "window.vf.draw_moniview()").html("Monitor View");

        const canvas = document.getElementById('file_preview');
        TrackView.initialize(this, canvas);

        if (this.sorted_tids.length > 0) {
            $("#span_preview_caseid").html(this.filename);
            $("#div_preview").css('display', '');
            $("#btn_preview").css('display', '');
        }
    },

    draw_moniview: function () {
        window.view = "moni";
        window.vf = this;

        const canvas = document.getElementById('moni_preview');
        MonitorView.initialize(this, canvas);

        $("#file_preview").hide();
        $("#moni_preview").show();
        $("#moni_control").show();
        $("#fit_width").hide();
        $("#fit_100px").hide();
        $("#btn_preview").show();
        $("#convert_view").attr("onclick", "window.vf.draw_trackview()").html("Track View");
    }
};

// Export to global scope
window.VitalFile = VitalFile;