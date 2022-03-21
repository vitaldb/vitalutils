/**
 * @author Eunsun Rachel Lee <eunsun.lee93@gmail.com>
 */

const path = require("path");
const fs = require("fs");
const zlib = require("zlib");

const montypes = {
    1:"ECG_WAV",
    2:"ECG_HR",
    3:"ECG_PVC",
    4:"IABP_WAV",
    5:"IABP_SBP",
    6:"IABP_DBP",
    7:"IABP_MBP",
    8:"PLETH_WAV",
    9:"PLETH_HR",
    10:"PLETH_SPO2",
    11:"RESP_WAV",
    12:"RESP_RR",
    13:"CO2_WAV",
    14:"CO2_RR",
    15:"CO2_CONC",
    16:"NIBP_SBP",
    17:"NIBP_DBP",
    18:"NIBP_MBP",
    19:"BT",
    20:"CVP_WAV",
    21:"CVP_CVP",
	22:"EEG_BIS",
	23:"TV",
	24:"MV",
	25:"PIP",
	26:"AGENT1_NAME",
	27:"AGENT1_CONC",
	28:"AGENT2_NAME",
	29:"AGENT2_CONC",
	30:"DRUG1_NAME",
	31:"DRUG1_CE",
	32:"DRUG2_NAME",
	33:"DRUG2_CE",
	34:"CO",
	36:"EEG_SEF",
	38:"PEEP",
	39:"ECG_ST",
	40:"AGENT3_NAME",
	41:"AGENT3_CONC",
	42:"STO2_L",
	43:"STO2_R",
	44:"EEG_WAV",
	45:"FLUID_RATE",
	46:"FLUID_TOTAL",
	47:"SVV",
	49:"DRUG3_NAME",
	50:"DRUG3_CE",
	52:"FILT1_1",
	53:"FILT1_2",
	54:"FILT2_1",
	55:"FILT2_2",
	56:"FILT3_1",
	57:"FILT3_2",
	58:"FILT4_1",
	59:"FILT4_2",
	60:"FILT5_1",
	61:"FILT5_2",
	62:"FILT6_1",
	63:"FILT6_2",
	64:"FILT7_1",
	65:"FILT7_2",
	66:"FILT8_1",
	67:"FILT8_2",
	70:"PSI",
	71:"PVI",
	72:"SPHB",
	73:"ORI",
	75:"ASKNA",
	76:"PAP_SBP",
	77:"PAP_MBP",
	78:"PAP_DBP",
	79:"FEM_SBP",
	80:"FEM_MBP",
	81:"FEM_DBP",
	82:"EEG_SEFL",
	83:"EEG_SEFR",
	84:"EEG_SR",
	85:"TOF_RATIO",
	86:"TOF_CNT",
	87:"SKNA_WAV",
	88:"ICP",
	89:"CPP",
	90:"ICP_WAV",
	91:"PAP_WAV",
	92:"FEM_WAV",
	93:"ALARM_LEVEL",
	95:"EEGL_WAV",
	96:"EEGR_WAV",
	97:"ANII",
	98:"ANIM",
	99:"PTC_CNT",
};

function VitalFile(client, filepath, track_names=[], track_names_only=false, exclude=[]){
    this.devs = {0:{}};
    this.trks = {};
    this.dtstart = 0;
    this.dtend = 0;
    this.dgmt = 0;

    var ext = path.extname(filepath);
    if(ext == ".vital") this.load_vital(client, filepath, track_names, track_names_only, exclude);
}

function buf2str(buf, pos){
    var strlen = buf.readUIntLE(pos, 4);
    pos += 4;
    var str = buf.toString("utf8", pos, pos + strlen);
    pos += strlen;
    return [str, pos];
}

function parse_fmt(fmt){
    if(fmt == 1) return ["f", 4];
    else if(fmt == 2) return ["d", 8];
    else if(fmt == 3) return ["b", 1];
    else if(fmt == 4) return ["B", 1];
    else if(fmt == 5) return ["h", 2];
    else if(fmt == 6) return ["H", 2];
    else if(fmt == 7) return ["l", 4];
    else if(fmt == 8) return ["L", 4];
    return ["", 0];
}

VitalFile.prototype.load_vital = function(client, filepath, track_names, track_names_only, exclude){
    var rs = fs.createReadStream(filepath);
    var gunzip = zlib.createGunzip();
    var header = false;
    var packet = null; // packet_len, packet_type을 포함한 packet 데이터

    //console.time("parsing");
    var vfs = rs.pipe(gunzip);
    
    return new Promise((resolve) => {
        vfs.on("data", data => {
            var pos = 0;
            if(!header){
                header = true;
                var sign = data.toString("utf8", pos, pos + 4); pos += 4;
                //console.log("sign : " + sign);
                if(sign != "VITA") throw new Error("invalid vital file");
                //console.log("format_ver : " + data.readUIntLE(pos, 4));
                pos += 4;
                //console.log("headerlen : " + data.readUIntLE(pos, 2));
                pos += 2;
                this.dgmt = data.readIntLE(pos, 2); pos += 2;
                //console.log("tzbias : " + this.dgmt);
                //console.log("inst_id : " + data.readUIntLE(pos, 4)); 
                pos += 4;
                var prog_ver = "";
                for(var i = 0; i < 4; i ++){
                    prog_ver += (data.readUIntLE(pos, 1)); 
                    pos += 1;
                    if(i != 3) prog_ver += ".";
                }
                //console.log("prog_ver : " + prog_ver);
            }

            // 패킷 파싱이 끝나지 않았을 경우 다음 읽혀지는 버프와 이어붙혀서 다시 파싱
            if(packet){
                var buflen = packet.length + data.length;
                data = Buffer.concat([packet, data], buflen);
            }

            while(pos + 5 < data.length){
                //console.log(data.length, pos);
                var packet_type = data.readIntLE(pos, 1);
                var packet_len = data.readUIntLE(pos + 1, 4);
                // console.log("dlen:" + data.length, "pos:" + pos, "plen:" + packet_len, "ptype:" + packet_type);
                // fs.appendFileSync("test.txt", "\ndlen:" + data.length + " pos:" + pos + " plen:" + packet_len + " ptype:" + packet_type);
                packet = data.slice(pos, pos + 5 + packet_len);
                if(data.length < pos + 5 + packet_len){
                    return;
                }
                pos += 5;
                var data_pos = pos;
                var ppos = 5;
                if(packet_type == 9){ // devinfo
                    var did = packet.readUIntLE(ppos, 4); ppos += 4;
                    var type, name, port;
                    port = "";
                    [type, ppos] = buf2str(packet, ppos);
                    [name, ppos] = buf2str(packet, ppos);
                    [port, ppos] = buf2str(packet, ppos);
                    this.devs[did] = {"name":name, "type":type, "port":port};
                    //console.log(this.devs[did]);
                    // fs.appendFileSync("test.txt", "\n" + this.devs[did]);
                } else if(packet_type == 0){ // trkinfo
                    var did, col, montype, unit, gain, offset, srate, mindisp, maxdisp, tname;
                    did = col = 0;
                    montype = unit = "";
                    gain = offset = srate = mindisp = maxdisp = 0.0;
                    //console.log(packet_len, ppos);
                    var tid = packet.readUIntLE(ppos, 2); ppos += 2;
                    var trktype = packet.readIntLE(ppos, 1); ppos += 1;
                    var fmt = packet.readIntLE(ppos, 1); ppos += 1;
                    [tname, ppos] = buf2str(packet, ppos);
                    [unit, ppos] = buf2str(packet, ppos);
                    mindisp = packet.readFloatLE(ppos); ppos += 4;
                    maxdisp = packet.readFloatLE(ppos); ppos += 4;
                    col = packet.readUIntLE(ppos, 4); ppos += 4;
                    srate = packet.readFloatLE(ppos); ppos += 4;
                    gain = packet.readDoubleLE(ppos); ppos += 8;
                    offset = packet.readDoubleLE(ppos); ppos += 8;
                    montype = packet.readIntLE(ppos, 1); ppos += 1;
                    did = packet.readUIntLE(ppos, 4); ppos += 4;

                    var dname = "";
                    var dtname = "";
                    if(did && did in this.devs){
                        dname = this.devs[did]["name"];
                        dtname = dname + "/" + tname;
                    } else dtname = tname;
                    
                    this.trks[tid] = {"name":tname, "dtname":dtname, "type":trktype, "fmt":fmt, "unit":unit, "srate":srate,
                                    "mindisp":mindisp, "maxdisp":maxdisp, "col":col, "montype":montype,
                                    "gain":gain, "offset":offset, "did":did, "recs":[]};
                    //console.log(tid, this.trks[tid]);
                    // fs.appendFileSync("test.txt", "\n" + this.trks[tid]);
                } else if(packet_type == 1){ // rec
                    var infolen = packet.readUIntLE(ppos, 2); ppos += 2;
                    var dt = packet.readDoubleLE(ppos); ppos += 8;
                    var tid = packet.readUIntLE(ppos, 2); ppos += 2;

                    //console.log(dt);
                    // fs.appendFileSync("test.txt", "\n" + dt);
                    if(this.dtstart == 0 || (dt > 0 && dt < this.dtstart)) this.dtstart = dt;
                    if(dt > this.dtend) this.dtend = dt;
                    if(track_names_only){
                        packet = null;
                        pos = data_pos + packet_len;
                        continue;
                    }

                    var trk = this.trks[tid];
                    var fmtlen = 4;
                    if(trk.type == 1){ // wav
                        var [fmtcode, fmtlen] = parse_fmt(trk.fmt);
                        var nsamp = packet.readUIntLE(ppos, 4); ppos += 4;
                        if(dt + (nsamp / this.trks[tid].srate) > this.dtend) this.dtend = dt + (nsamp / this.trks[tid].srate);
                        var samps;
                        if(fmtcode == "f") samps = new Float32Array(packet.slice(ppos, ppos + nsamp * fmtlen));
                        else if(fmtcode == "d") samps = new Float64Array(packet.slice(ppos, ppos + nsamp * fmtlen));
                        else if(fmtcode == "b") samps = new Int8Array(packet.slice(ppos, ppos + nsamp * fmtlen));
                        else if(fmtcode == "B") samps = new Uint8Array(packet.slice(ppos, ppos + nsamp * fmtlen));
                        else if(fmtcode == "h") samps = new Int16Array(packet.slice(ppos, ppos + nsamp * fmtlen));
                        else if(fmtcode == "H") samps = new Uint16Array(packet.slice(ppos, ppos + nsamp * fmtlen));
                        else if(fmtcode == "l") samps = new Int32Array(packet.slice(ppos, ppos + nsamp * fmtlen));
                        else if(fmtcode == "L") samps = new Uint32Array(packet.slice(ppos, ppos + nsamp * fmtlen));
                        trk.recs.push({"dt":dt, "val":samps});
                    } else if(trk.type == 2){ // num
                        var [fmtcode, fmtlen] = parse_fmt(trk.fmt);
                        var val;
                        if(fmtcode == "f"){
                            val = packet.readFloatLE(ppos); ppos += fmtlen;
                        } else if(fmtcode == "d"){
                            val = packet.readDoubleLE(ppos); ppos += fmtlen;
                        } else if(fmtcode == "b" || fmtcode == "h" || fmtcode == "l"){
                            val = packet.readIntLE(ppos, fmtlen); ppos += fmtlen;
                        } else if(fmtcode == "B" || fmtcode == "H" || fmtcode == "L"){
                            val = packet.readUIntLE(ppos, fmtlen); ppos += fmtlen;
                        }
                        trk.recs.push({"dt":dt, "val":val});
                    } else if(trk.type == 5){ // str
                        ppos += 4;
                        var s;
                        [s, ppos] = buf2str(packet, ppos);
                        trk.recs.push({"dt":dt, "val":s});
                    }
                } else if(packet_type == 6){ // cmd
                    if(track_names_only){
                        packet = null;
                        pos = data_pos + packet_len;
                        continue;
                    }
                    var cmd = packet.readIntLE(ppos, 1); ppos += 1;
                    if(cmd == 6){ // reset events
                        var evt_trk = this.find_track("/EVENT");
                        if(evt_trk){
                            evt_trk.recs = [];
                            console.log(this.trks[evt_trk.id]);
                        } 
                    } else if(cmd == 5){ // trk order
                        var cnt = packet.readUIntLE(ppos, 2); ppos += 2;
                        this.trkorder = new Uint16Array(packet.slice(ppos, ppos + cnt * 2));
                    }
                }
                pos = data_pos + packet_len;
            }
            if(pos + 5 >= data.length) packet = data.slice(pos);
            // console.log(packet);
            // fs.appendFileSync("test.txt", "\n" + packet);
        });
        vfs.on("end", () => {
            //console.timeEnd("parsing");
            console.log(this.toString());
            this.toRedis(client, filepath);
            resolve();
        });
        vfs.on("close", () => {
            //console.timeEnd("parsing");
            console.log(this.toString());
            this.toRedis(client, filepath);
            resolve();
        });
        vfs.on("error", (err) => {
            if(err.code == "Z_BUF_ERROR" && err.errno == -5){
                gunzip.close();
                rs.close();
            } else {
                resolve(err);
            }
        });
    });
}

VitalFile.prototype.get_color = function(tid){
    if(tid in this.trks){
        return "#" + ("0"+(Number(this.trks[tid].col).toString(16))).slice(3).toUpperCase();
    }
    throw new Error(tid + " does not exist in track list");
}

VitalFile.prototype.get_montype = function(tid){
    if(tid in this.trks){
        var montype = this.trks[tid].montype;
        if(montype in montypes) return montypes[montype];
        return "";
    }
    throw new Error(tid + " does not exist in track list");
}

VitalFile.prototype.get_track_names = function(){
    var dtnames = [];
    for(var tid in this.trks){
        var trk = this.trks[tid];
        if(trk.dtname) dtnames.push(trk.dtname);
    }
    return dtnames;
}

VitalFile.prototype.find_track = function(dtname){
    var dname = "";
    var tname = dtname;

    if(dtname.indexOf("/") > -1) {
        [dname, tname] = dtname.split("/");
    }

    for(var tid in this.trks){
        var trk = this.trks[tid];
        if(trk.name == tname){
            did = trk.did;
            if(did == 0 || dname == "") return trk;
            if(did in this.devs){
                var dev = this.devs[did];
                if("name" in dev && dname == dev.name) return trk;
            }
        }
    }

    return null;
}

VitalFile.prototype.toString = function(){
    var res = {};
    res.dtstart = this.dtstart;
    res.dtend = this.dtend;
    res.dgmt = this.dtmt;
    res.devices = this.devs;
    res.tracklist = this.get_track_names();

    return JSON.stringify(res);
}

VitalFile.prototype.toRedis = function(client, filepath){
    var fname_noext = path.parse(filepath).name;
    var fstat = fs.statSync(filepath);
    var dtupload = Math.floor(fstat.mtimeMs / 1000);
    var filesize = fstat.size;
    console.log(fname_noext,filesize);
    client.zadd("api:filelist:dtupload", dtupload, fname_noext);
    client.zadd("api:filelist:dtstart", this.dtstart, fname_noext);
    client.zadd("api:filelist:dtend", this.dtend, fname_noext);
    client.set("api:filelist:fileinfo:" + fname_noext, JSON.stringify({"dtstart":this.dtstart, "dtend":this.dtend, "dtupload":dtupload, "filesize":filesize}));
    var track_names = JSON.stringify(this.get_track_names());
    client.set("api:tracklist:" + fname_noext, track_names);
    //client.quit();
}

module.exports = VitalFile;