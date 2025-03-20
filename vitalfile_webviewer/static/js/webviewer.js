/**
 * @author Eunsun Rachel Lee <eunsun.lee93@gmail.com>
 */
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

var files = {};
var vf;
var view = "track";

function get_filename(url){
	var filename = null;
	var params = url.split(";");
	if(params.length > 1){
		params = params[1].split("&");
		for(var i in params){
			var param = params[i];
			if(param.indexOf("filename") > -1){
				filename = param.split("=")[1];
			}
		}
	} else {
		filename = url.split("/");
		filename = filename[filename.length - 1];
	}

	filename = filename.split("?");
	filename = filename[0];
	
	return filename;
}

function VitalFile(file, filename){
    this.filename = filename;
    this.bedname = filename.substr(0, filename.length - 20);
    this.devs = {0:{}};
    this.trks = {};
    this.dtstart = 0;
    this.dtend = 0;
    this.dgmt = 0;

    this.load_vital(file);
}

function typedArrayToBuffer(array) {
    return array.buffer.slice(0, array.byteLength)
}

function arrayBufferToString(buffer){
    var arr = new Uint8Array(buffer);
    var str = String.fromCharCode.apply(String, arr);
    return str;
}

function buf2str(buf, pos){
    var strlen = new Uint32Array(buf.slice(pos, pos + 4))[0];
    var npos = pos + 4;
    var arr = new Uint8Array(buf.slice(npos, npos + strlen));
    var str = String.fromCharCode.apply(String, arr);
    npos += strlen;
    return [str, npos];
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

function buf2data(buf, pos, size, len, signed=false, type=""){
    var res;
    var slice = buf.slice(pos, pos + size * len);
    switch(size){
        case 1:
            if(signed) res = new Int8Array(slice);
            else res = new Uint8Array(slice);
            break;
        case 2:
            if(signed) res = new Int16Array(slice);
            else res = new Uint16Array(slice);
            break;
        case 4:
            if(type == "float") res = new Float32Array(slice);
            else {
                if(signed) res = new Int32Array(slice);
                else res = new Uint32Array(slice);
            }
            break;
        case 8:
            res = new Float64Array(slice);
            break;
    }
    var npos = pos + (size * len);
    if(len == 1) res = res[0];
    return [res, npos];
}

VitalFile.prototype.load_vital = function(file){
    var self = this;
    var fileReader = new FileReader();
	progress = 0;
    fileReader.readAsArrayBuffer(file);
    fileReader.onloadend = async function(e){
        if(e.target.error) return;
        var data = pako.inflate(e.target.result);
        data = typedArrayToBuffer(data);
        var pos = 0;
        header = true;
        var sign = arrayBufferToString(data.slice(0,4)); pos += 4;
        if(sign != "VITA") throw new Error("invalid vital file");
        pos += 4;
		var headerlen;
		[headerlen, pos] = buf2data(data, pos, 2, 1);
		pos += headerlen;
		console.time("parsing")
		console.log("Unzipped:" + data.byteLength);
		await _progress(self.filename, pos, data.byteLength);
		var flag = data.byteLength / 15.0;
        while(pos + 5 < data.byteLength){
            var packet_type, packet_len;
            [packet_type, pos] = buf2data(data, pos, 1, 1, true);
            [packet_len, pos] = buf2data(data, pos, 4, 1);
            var packet = data.slice(pos - 5, pos + packet_len);
            if(data.byteLength < pos + packet_len){
                break;
            }
            var data_pos = pos;
            var ppos = 5;
            if(packet_type == 9){ // devinfo
                var did, type, name, port;
                [did, ppos] = buf2data(packet, ppos, 4, 1);
                port = "";
                [type, ppos] = buf2str(packet, ppos);
                [name, ppos] = buf2str(packet, ppos);
                [port, ppos] = buf2str(packet, ppos);
                self.devs[did] = {"name":name, "type":type, "port":port};
            } else if(packet_type == 0){ // trkinfo
                var tid, trktype, fmt, did, col, montype, unit, gain, offset, srate, mindisp, maxdisp, tname;
                did = col = 0;
                montype = unit = "";
                gain = offset = srate = mindisp = maxdisp = 0.0;
                [tid, ppos] = buf2data(packet, ppos, 2, 1);
                [trktype, ppos] = buf2data(packet, ppos, 1, 1, true);
                [fmt, ppos] = buf2data(packet, ppos, 1, 1, true);
                [tname, ppos] = buf2str(packet, ppos);
                [unit, ppos] = buf2str(packet, ppos);
                [mindisp, ppos] = buf2data(packet, ppos, 4, 1, true, "float");
                [maxdisp, ppos] = buf2data(packet, ppos, 4, 1, true, "float");
                [col, ppos] = buf2data(packet, ppos, 4, 1);
                [srate, ppos] = buf2data(packet, ppos, 4, 1, true, "float");
                [gain, ppos] = buf2data(packet, ppos, 8, 1);
                [offset, ppos] = buf2data(packet, ppos, 8, 1);
                [montype, ppos] = buf2data(packet, ppos, 1, 1, true);
                [did, ppos] = buf2data(packet, ppos, 4, 1);

                var dname = "";
                var dtname = "";
                if(did && did in self.devs){
                    dname = self.devs[did]["name"];
                    dtname = dname + "/" + tname;
                } else dtname = tname;
                self.trks[tid] = {"name":tname, "dtname":dtname, "type":trktype, "fmt":fmt, "unit":unit, "srate":srate,
                                "mindisp":mindisp, "maxdisp":maxdisp, "col":col, "montype":montype,
                                "gain":gain, "offset":offset, "did":did, "recs":[]};
            } else if(packet_type == 1){ // rec
                ppos += 2;
                var dt, tid;
                [dt, ppos] = buf2data(packet, ppos, 8, 1) ;
                [tid, ppos] = buf2data(packet, ppos, 2, 1);
                if(self.dtstart == 0 || (dt > 0 && dt < self.dtstart)) self.dtstart = dt;
                if(dt > self.dtend) self.dtend = dt;

                var trk = self.trks[tid];
                var fmtlen = 4;
                if(trk.type == 1){ // wav
                    var [fmtcode, fmtlen] = parse_fmt(trk.fmt);
                    var nsamp;
                    [nsamp, ppos] = buf2data(packet, ppos, 4, 1);
                    if(dt + (nsamp / self.trks[tid].srate) > self.dtend) self.dtend = dt + (nsamp / self.trks[tid].srate);
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
                        [val, ppos] = buf2data(packet, ppos, fmtlen, 1, true, "float");
                    } else if(fmtcode == "d"){
                        [val, ppos] = buf2data(packet, ppos, fmtlen, 1);
                    } else if(fmtcode == "b" || fmtcode == "h" || fmtcode == "l"){
                        [val, ppos] = buf2data(packet, ppos, fmtlen, 1, true);
                    } else if(fmtcode == "B" || fmtcode == "H" || fmtcode == "L"){
                        [val, ppos] = buf2data(packet, ppos, fmtlen, 1);
                    }
                    trk.recs.push({"dt":dt, "val":val});
                } else if(trk.type == 5){ // str
                    ppos += 4;
                    var s;
                    [s, ppos] = buf2str(packet, ppos);
                    trk.recs.push({"dt":dt, "val":s});
                }
            } else if(packet_type == 6){ // cmd
                var cmd;
                [cmd, ppos] = buf2data(packet, ppos, 1, 1, true);
                if(cmd == 6){ // reset events
                    var evt_trk = self.find_track("/EVENT");
                    if(evt_trk) evt_trk.recs = [];
                } else if(cmd == 5){ // trk order
                    var cnt
                    [cnt, ppos] = buf2data(packet, ppos, 2, 1);
                    self.trkorder = new Uint16Array(packet.slice(ppos, ppos + cnt * 2));
                }
            }
            pos = data_pos + packet_len;
			if(pos >= flag && data.byteLength > 31457280){ // file larger than 30mb
				await _progress(self.filename, pos, data.byteLength)
				.then(async function(){
					flag += data.byteLength / 15.0;
				});
			}
        }
		console.timeEnd("parsing")
		await _progress(self.filename, pos, data.byteLength)
		.then(function(){self.justify_recs();})
		.then(function(){self.sort_tracks();})
		.then(function(){
			if(view == 'moni') self.draw_moniview();
			else self.draw_trackview();
		});
    }
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

VitalFile.prototype.justify_recs = function(){
    var file_len = this.dtend - this.dtstart;
    for(var tid in this.trks){
        var trk = this.trks[tid];
        if(trk.recs.length <= 0) continue;
        trk.recs.sort(function(a,b){
            return a.dt - b.dt;
        });
        // wav
        if(trk.type == 1){
            var tlen = Math.ceil(trk.srate * file_len);
            var val = new Uint8Array(tlen);
            var mincnt = (trk.mindisp - trk.offset) / trk.gain;
            var maxcnt = (trk.maxdisp - trk.offset) / trk.gain;
            for(let idx in trk.recs){
                var rec = trk.recs[idx];
                if(!rec.val || (typeof rec.val) != "object"){
                    //console.log(idx, rec, trk.name);
                    continue;
                }
                var i = parseInt((rec.dt - this.dtstart) * trk.srate);
                rec.val.forEach(function(v){
                    if(v == 0) val[i] = 0;
                    else{
                        v = (v - mincnt) / (maxcnt - mincnt) * 254 + 1;
                        if(v < 1) v = 1;
                        else if(v > 255) v = 255;
                        val[i] = v;
                    }
                    i++;
                });
            }
            this.trks[tid].prev = val;
        } else { // num or str
            var val = [];
            for(let idx in trk.recs){
                var rec = trk.recs[idx];
                val.push([rec.dt - this.dtstart, rec.val]);
            }
            this.trks[tid].data = val;
        }
    }
}

/****************************************************************** Monitor View ******************************************************************/

const PAR_WIDTH = 160;
const PAR_HEIGHT = 80;

var canvas_moni = document.getElementById('moni_preview');
var ctx_moni = canvas_moni.getContext('2d');
var canvas_width = 800;

var fast_forward = 1.0;
var montype_groupids = {};
var montype_trks = {};
var groupid_trks = {};
var dtplayer = 0;
var isPaused = true; // 첫화면 정지
var isSliding = false;
var scale = 1;
var caselen;

var groups = [
	{'fgColor': '#00FF00','wav': 'ECG_WAV', 'paramLayout': 'TWO', 'param': ['ECG_HR', 'ECG_PVC'], 'name': 'ECG'}, // ECG_ST => ECG_PVC
	{'fgColor': '#FF0000','wav': 'IABP_WAV', 'paramLayout': 'BP','param': ['IABP_SBP','IABP_DBP','IABP_MBP'], 'name': 'ART'},
	{'fgColor': '#82CEFC','wav': 'PLETH_WAV', 'paramLayout': 'TWO', 'param': ['PLETH_SPO2', 'PLETH_HR'],'name': 'PLETH' },
	{'fgColor': '#FAA804','wav': 'CVP_WAV', 'paramLayout': 'ONE', 'param': ['CVP_CVP'], 'name': 'CVP'},
	{'fgColor': '#DAA2DC','wav': 'EEG_WAV','paramLayout': 'TWO','param': ['EEG_BIS','EEG_SEF'], 'name': 'EEG'},
	{'fgColor': '#FAA804','paramLayout': 'TWO','param': ['AGENT_CONC','AGENT_NAME'],'name': 'AGENT'},
	{'fgColor': '#FAA804','paramLayout': 'TWO','param': ['AGENT1_CONC','AGENT1_NAME'],'name': 'AGENT1'},
	{'fgColor': '#FAA804','paramLayout': 'TWO','param': ['AGENT2_CONC','AGENT2_NAME'],'name': 'AGENT2'},
	{'fgColor': '#FAA804','paramLayout': 'TWO','param': ['AGENT3_CONC','AGENT3_NAME'],'name': 'AGENT3'},
	{'fgColor': '#FAA804','paramLayout': 'TWO','param': ['AGENT4_CONC','AGENT4_NAME'],'name': 'AGENT4'},
	{'fgColor': '#FAA804','paramLayout': 'TWO','param': ['AGENT5_CONC','AGENT5_NAME'],'name': 'AGENT5'},
	{'fgColor': '#9ACE34','paramLayout': 'TWO','param': ['DRUG_CE','DRUG_NAME'],'name': 'DRUG'},
	{'fgColor': '#9ACE34','paramLayout': 'TWO','param': ['DRUG1_CE','DRUG1_NAME'],'name': 'DRUG1'},
	{'fgColor': '#9ACE34','paramLayout': 'TWO','param': ['DRUG2_CE','DRUG2_NAME'],'name': 'DRUG2'},
	{'fgColor': '#9ACE34','paramLayout': 'TWO','param': ['DRUG3_CE','DRUG3_NAME'],'name': 'DRUG3'},
	{'fgColor': '#9ACE34','paramLayout': 'TWO','param': ['DRUG4_CE','DRUG4_NAME'],'name': 'DRUG4'},
	{'fgColor': '#9ACE34','paramLayout': 'TWO','param': ['DRUG5_CE','DRUG5_NAME'],'name': 'DRUG5'},
	{'fgColor': '#FFFF00','wav': 'RESP_WAV', 'paramLayout': 'ONE', 'param': ['RESP_RR'], 'name': 'RESP'},
	{'fgColor': '#FFFF00','wav': 'CO2_WAV','paramLayout': 'TWO','param': ['CO2_CONC','CO2_RR'],'name': 'CO2'},
	{'fgColor': '#FFFFFF','paramLayout': 'VNT','name':'VNT','param': ['TV','RESP_RR','PIP','PEEP'],},
	{'fgColor': '#F08080','paramLayout': 'VNT','name':'NMT', 'param': ['TOF_RATIO','TOF_CNT','PTC_CNT'],},
	{'fgColor': '#FFFFFF','paramLayout': 'BP','param': ['NIBP_SBP','NIBP_DBP','NIBP_MBP'],'name': 'NIBP'},
	{'fgColor': '#DAA2DC','wav':'EEGL_WAV','paramLayout': 'TWO','param': ['PSI','EEG_SEFL', 'EEG_SEFR'],'name': 'MASIMO'},
	{'fgColor': '#FF0000','paramLayout': 'TWO','param': ['SPHB','PVI'],},
	{'fgColor': '#FFC0CB','paramLayout': 'TWO','param': ['CO','SVV'],'name': 'CARTIC'},
	{'fgColor': '#FFFFFF','paramLayout': 'LR','param': ['STO2_L','STO2_R'],'name': 'STO2'},
	{'fgColor': '#828284','paramLayout': 'TWO','param': ['FLUID_RATE','FLUID_TOTAL'],'name': 'FLUID'},
	{'fgColor': '#D2B48C','paramLayout': 'ONE','param': ['BT']},
	{'fgColor': '#FF0000','wav': 'PAP_WAV','paramLayout': 'BP','param': ['PAP_SBP','PAP_DBP', 'PAP_MBP'],'name': 'PAP'},
	{'fgColor': '#FF0000','wav': 'FEM_WAV','paramLayout': 'BP','param': ['FEM_SBP', 'FEM_DBP', 'FEM_MBP'],'name': 'FEM'},
	{'fgColor': '#00FF00','wav': 'SKNA_WAV','paramLayout': 'ONE',	'param': ['ASKNA'],	'name': 'SKNA'	},
	{'fgColor': '#FFFFFF','wav': 'ICP_WAV','paramLayout': 'TWO','param': ['ICP','CPP']},
	{'fgColor': '#FF7F51','paramLayout': 'TWO','param': ['ANIM','ANII']},
	{'fgColor': '#99d9ea','paramLayout': 'TWO','param': ['FILT1_1','FILT1_2']},
	{'fgColor': '#C8BFE7','paramLayout': 'TWO','param': ['FILT2_1','FILT2_2']},
	{'fgColor': '#EFE4B0','paramLayout': 'TWO','param': ['FILT3_1','FILT3_2']},
	{'fgColor': '#FFAEC9','paramLayout': 'TWO','param': ['FILT4_1','FILT4_2']},
];

var paramLayouts = {	
	'ONE': [{name: {baseline: 'top',x: 5, y: 5}, value: {fontsize: 40, align: 'right', x: PAR_WIDTH - 5, y: (PAR_HEIGHT - 10)}}],
	'TWO': [
		{name: {baseline: 'top',x: 5, y: 5}, value: {fontsize: 40, align: 'right', x: PAR_WIDTH - 5, y: 42}},
		{name: {baseline: 'bottom', x: 5, y: (PAR_HEIGHT - 4)}, value: {fontsize: 24, align: 'right', x: PAR_WIDTH - 5, y: (PAR_HEIGHT - 8)}}
	],
	'LR': [
		{name: {baseline: 'top', x: 5, y: 5}, value: {fontsize: 40, align: 'left', x: 5, y: (PAR_HEIGHT - 10),}},
		{name: {align: 'right', baseline: 'top', x: PAR_WIDTH - 3, y: 4},value: {fontsize: 40, align: 'right', x: PAR_WIDTH - 5, y: (PAR_HEIGHT - 10)}}
	],
	'BP': [
		{name: {baseline: 'top', x: 5, y: 5}, value: {fontsize: 38, align: 'right', x: PAR_WIDTH - 5, y: 37}},
		{value: {fontsize: 38, align: 'right', x: PAR_WIDTH - 5, y: (PAR_HEIGHT - 8)}}
	],
	'VNT': [
		{name: {baseline: 'top',x: 5, y: 5}, value: {fontsize: 38, align: 'right', x: PAR_WIDTH - 45, y: 37}},// top-left
		{value: {fontsize: 30, align: 'right', x: PAR_WIDTH - 5, y: 37}}, // top-right
		{value: {fontsize: 24, align: 'right', x: PAR_WIDTH - 5, y: (PAR_HEIGHT - 8)}}// bot-left
	]
};

function _progress(filename, offset, datalen){
    return new Promise(async resolve => {
        var percentage = (offset / datalen * 100).toFixed(2);
        await preloader(filename, "PARSING...", percentage)
        .then(resolve);
    });
}

function preloader(filename, msg='LOADING...', percentage=0){
	return new Promise(resolve => {
		setTimeout(function(){
			if(view && view == "moni"){
				$("#file_preview").hide();
				$("#fit_width").hide();
				$("#fit_100px").hide();
				$("#moni_preview").show();
				$("#moni_control").show();
				$("#convert_view").attr("onclick", "vf.draw_trackview()").html("Track View");
				canvas = canvas_moni;
				ctx = ctx_moni;
			} else {
				$("#moni_preview").hide();
				$("#moni_control").hide();
				$("#file_preview").show();
				$("#fit_width").show();
				$("#fit_100px").show();
				$("#convert_view").attr("onclick", "vf.draw_moniview()").html("Monitor View");
				canvas = canvas_file;
				ctx = ctx_file;
			}
			canvas.width = canvas.clientWidth = canvas.style.width = parseInt(canvas.parentNode.parentNode.clientWidth);
			canvas.height = window.innerHeight - 33;
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.fillStyle = '#181818';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.font = '100 30px arial';
			ctx.fillStyle = '#ffffff';
			var mtext = ctx.measureText(msg);
			ctx.fillText(msg, (canvas.width-mtext.width)/2, (canvas.height-50)/2);
			if(percentage > 0){
				ctx.fillStyle = '#595959';
				ctx.fillRect((canvas.width-300)/2, (canvas.height)/2, 300, 3);
				var pw = percentage * 3;
				ctx.fillStyle = '#ffffff';
				ctx.fillRect((canvas.width-300)/2, (canvas.height)/2, pw, 3);
			} 
			$("#span_preview_caseid").html(filename);
			$("#div_preview").css('display','');
			resolve();
		}, 100);		
	});
}

VitalFile.prototype.draw_moniview = function() {
	view = "moni";
	fast_forward = 1.0;
	montype_groupids = {};
	montype_trks = {};
	groupid_trks = {};
	dtplayer = 0;
	pause_resume(true);
	vf = this;
	caselen = this.dtend - this.dtstart;

	$("#file_preview").hide();
	$("#moni_preview").show();
	$("#moni_control").show();
	$("#fit_width").hide();
	$("#fit_100px").hide();
	$("#btn_preview").show();
	$("#convert_view").attr("onclick", "vf.draw_trackview()").html("Track View");
	$("#moni_slider").attr("max", caselen).attr("min", 0).val(0);
	
	montype_group();
	onResizeWindow();
	draw();
	update_frame(redraw);
}

function format_time(seconds){
	var ss = seconds % 60;
	var mm = Math.floor(seconds / 60) % 60;
	var hh = Math.floor(seconds / 3600) % 24;
	//var dd = Math.floor(seconds / 86400);
	
	return [hh, mm, ss]
        .map(v => v < 10 ? "0" + v : v)
        .filter((v,i) => v !== "00" || i > 0)
        .join(":")
}

function get_playtime(){
	var date = new Date((vf.dtstart + dtplayer) * 1000);
	return ("0" + date.getHours()).substr(-2) + ":" + ("0" + date.getMinutes()).substr(-2) + ":" + ("0" + date.getSeconds()).substr(-2);
}

function formatValue(value, type) {
	if (type == 5) {
		if (value.length > 4) {
			value = value.slice(0, 4);
		}
		return value;
	}

	if (typeof value === 'str') {
		value = parseFloat(value);
	}
	
	if (Math.abs(value) >= 100) {
		return value.toFixed(0);
	} else if (value - Math.floor(value) < 0.05) {
		return value.toFixed(0);
	} else {
		return value.toFixed(1);
	}
}

function roundedRect(ctx, x, y, width, height, radius=0) {
	ctx.beginPath();
	ctx.moveTo(x, y + radius);
	ctx.lineTo(x, y + height - radius);
	ctx.arcTo(x, y + height, x + radius, y + height, radius);
	ctx.lineTo(x + width - radius, y + height);
	ctx.arcTo(x + width, y + height, x + width, y + height-radius, radius);
	ctx.lineTo(x + width, y + radius);
	ctx.arcTo(x + width, y, x + width - radius, y, radius);
	ctx.lineTo(x + radius, y);
	ctx.arcTo(x, y, x, y + radius, radius);
}

function montype_group(){
	// montype_groupids 값을 만듬
	for (var groupid in groups) {
		var group = groups[groupid];
		for (let i in group.param) {
			let montype = group.param[i];
			montype_groupids[montype] = groupid;
		}
		if (group.wav) {
			montype_groupids[group.wav] = groupid;
		}
	}

	// montype별 트랙 및 groupid 별 트랙을 모음
	for (var tid in vf.trks){
		var trk = vf.trks[tid];
        var montype = vf.get_montype(tid);
        if (montype != "" && !montype_trks[montype]) montype_trks[montype] = trk;
        var groupid = montype_groupids[montype];
		//console.log(groupid);
        if (groupid) {
            if (!groupid_trks[groupid]) {
                groupid_trks[groupid] = [];
            }
            groupid_trks[groupid].push(trk);
			//console.log(groupid_trks[groupid]);
		}
	}
}

function draw_title(rcx){
	ctx_moni.font = (40 * scale) + 'px arial';
	ctx_moni.fillStyle = '#ffffff';
	ctx_moni.textAlign = 'left';
	ctx_moni.textBaseline = 'alphabetic';

	ctx_moni.fillText(vf.bedname, rcx + 4, 45 * scale);
	var px = rcx + ctx_moni.measureText(vf.bedname).width + 22;

	// 현재 재생 시간 -> 파일 dt 기준으로 해야함
	var casetime = get_playtime(); //format_time(Math.floor(dtplayer));
	ctx_moni.font = 'bold ' + (24 * scale) + 'px arial';
	ctx_moni.fillStyle = '#FFFFFF';
	ctx_moni.textAlign = 'left';
	ctx_moni.textBaseline = 'alphabetic';
	ctx_moni.fillText(casetime, (rcx + canvas_width) / 2 - 50, 29 * scale);

	// 장비 목록
	ctx_moni.font = (15 * scale) + 'px arial';
	ctx_moni.textAlign = 'left';
	ctx_moni.textBaseline = 'alphabetic';
	for(var did in vf.devs){
		var dev = vf.devs[did];
		if(!dev.name) continue;
		ctx_moni.fillStyle = '#348EC7';
		roundedRect(ctx_moni, px, 36 * scale, 12 * scale, 12 * scale, 3);
		ctx_moni.fill();

		px += 17 * scale;

		ctx_moni.fillStyle = '#FFFFFF';
		ctx_moni.fillText(dev.name.substr(0,7), px, 48 * scale);
		px += ctx_moni.measureText(dev.name.substr(0,7)).width + 13 * scale;
	}
}

function draw_wave(track, rcx, rcy, wav_width, rch){
	if (track && track.srate && track.prev && track.prev.length) {
		ctx_moni.beginPath();

		// 7초 혹은 28초
		let lastx = rcx; //0;
		let py = 0;
		let is_first = true;

		// 픽셀값을 정수로 해야 anti-aliasing이 안먹으면서 속도가 빨라진다.
		// anti-aliasing을 안쓸거면 비트맵 drawing에서 1픽셀 미만은 무의미

		// dtPlayer 는 서버 시각 기준
		// rec.dt 는 vr 시간 기준
		let idx = parseInt(dtplayer * track.srate);//0; 
		let inc = track.srate / 100;
		let px = 0; // rcx + wav_width - parseInt(dtplayer * track.srate); // 레코드 시간 (br 시간)을 서버 시간으로 변경 -> 픽셀로 변환
		/* if (px < rcx) {
			idx = -parseInt(px - rcx);
			px = rcx;
		} */

		for(var l = idx; l < idx + (rcx + wav_width) * inc && l < track.prev.length; l ++, px += (1.0 / inc)){
		//for (let l = track.prev.length; idx < l; px ++, idx ++) { // 모든 prev 데이터는 자신의 srate 로 되어있다.
			let value = track.prev[l];
			if (value == 0) continue;
			//value = (value - track.mindisp) / (track.maxdisp - track.mindisp);
			if (px > rcx + wav_width) break; // 우측 끝을 넘어가면 그리기 종료

			py = rcy + rch * (255 - value) / 254; // rcy + rch - value * rch; // y높이가 아주 정확하지는 않지만 이정도면 충분하다.
			//if(track.tname == "ECG_II") console.log(px, py, value);
			if(py < rcy) py = rcy;
			if(py > rcy + rch) py = rcy + rch;
			if (is_first) {
				if (px < rcx + 10) {
					ctx_moni.moveTo(rcx, py);
					ctx_moni.lineTo(px, py);
				} else {
					ctx_moni.moveTo(px, py);
				}
				is_first = false;
			} else {
				if (px - lastx > rcx + 10) {
					ctx_moni.stroke();

					ctx_moni.beginPath();
					ctx_moni.moveTo(px, py);
				} else {
					ctx_moni.lineTo(px, py);
				}
			}

			lastx = px;
		}

		if (!is_first && px > rcx + wav_width - 10) {
			ctx_moni.lineTo(rcx + wav_width, py);
		}

		ctx_moni.stroke();

		// 맨 우측에서 뛰어다니는 흰 사각형을 그림
		if (!is_first) {
			if (px > rcx + wav_width - 4) {
				ctx_moni.fillStyle = 'white';
				ctx_moni.fillRect(rcx + wav_width - 4, py - 2, 4, 4);
			}
		}
	}
}

function draw_param(group, isTrackDrawn, rcx, rcy){
	var valueExists = false;
	
	if (!group) return false;
	if (!group.param) return false;

	var layout = paramLayouts[group.paramLayout];
	var nameValueArray = [];
	if (!layout) return false;

	// 해당 그룹의 파라미터값들을 모음
	for (let i in group.param) {
		let montype = group.param[i];
		var track = montype_trks[montype];
		if (track && track.data) {
			isTrackDrawn.add(track.tid);
			var value = null;
			for (var idx = 0; idx < track.data.length; idx ++) {
				var rec = track.data[idx];
				var dt = rec[0];
				if (dt > dtplayer){
					if(idx > 0 && track.data[idx - 1][0] > dtplayer - 300) value = track.data[idx - 1][1];
					break;
				}
			}
			if (value) {
				value = formatValue(value, track.type);
				nameValueArray.push({ name: track.name, value: value });
				valueExists = true;
			} else {
				nameValueArray.push({ name: track.name, value: '' });
			}
		}
	}

	if (!valueExists) return false;
	
	if (group.name){
		var name = group.name;
		if(name.substring(0, 5) === 'AGENT' && nameValueArray.length > 1){
			if(nameValueArray[1].value.toUpperCase() === 'DESF'){
				nameValueArray[1].value = 'DES';
			} else if(nameValueArray[1].value.toUpperCase() === 'ISOF'){
				nameValueArray[1].value = 'ISO';
			} else if(nameValueArray[1].value.toUpperCase() === 'ENFL'){
				nameValueArray[1].value = 'ENF';
			}
		}
	}

	if (group.paramLayout === 'BP' && nameValueArray.length > 2) {
		nameValueArray[0].name = group.name || '';
		nameValueArray[0].value = (nameValueArray[0].value ? Math.round(nameValueArray[0].value) : ' ') + (nameValueArray[1].value ? ('/' + Math.round(nameValueArray[1].value)) : ' ');
		nameValueArray[2].value = nameValueArray[2].value ? Math.round(nameValueArray[2].value) : '';
		nameValueArray[1] = nameValueArray[2];
		nameValueArray.pop();
	} else if (nameValueArray.length > 0 && !nameValueArray[0].name) {
		nameValueArray[0].name = group.name || '';
	}

	for (var idx = 0; idx < layout.length && idx < nameValueArray.length; idx ++) {
		var layoutElem = layout[idx];
		if (layoutElem.value && layoutElem) {
			ctx_moni.font = (layoutElem.value.fontsize * scale) + 'px arial';
			ctx_moni.fillStyle = group.fgColor;
			if(nameValueArray[0].name == "HPI") ctx_moni.fillStyle = "#00FFFF"
			if(group.name && group.name.substring(0, 5) === 'AGENT' && nameValueArray.length > 1){
				if(nameValueArray[1].value === 'DES'){
					ctx_moni.fillStyle = '#2296E6';
				} else if(nameValueArray[1].value === 'ISO'){
					ctx_moni.fillStyle = '#DDA0DD';
				} else if(nameValueArray[1].value === 'ENF'){
					ctx_moni.fillStyle = '#FF0000';
				}
			}
			ctx_moni.textAlign = layoutElem.value.align || 'left';
			ctx_moni.textBaseline = layoutElem.value.baseline || 'alphabetic';
			ctx_moni.fillText(nameValueArray[idx].value, rcx + layoutElem.value.x * scale, rcy + layoutElem.value.y * scale);
		}

		if (layoutElem.name) {
			ctx_moni.font = (14 * scale) + 'px arial';
			ctx_moni.fillStyle = 'white';
			ctx_moni.textAlign = layoutElem.name.align || 'left';
			ctx_moni.textBaseline = layoutElem.name.baseline || 'alphabetic';
			var str = nameValueArray[idx].name;
			var measuredWidth = ctx_moni.measureText(str).width;
			var maxWidth = 75;
			if (measuredWidth > maxWidth) {
				ctx_moni.save();
				ctx_moni.scale(maxWidth / measuredWidth, 1);
				ctx_moni.fillText(str, (rcx + layoutElem.name.x * scale) * measuredWidth / maxWidth, rcy + layoutElem.name.y * scale);
				ctx_moni.restore();
			} else {
				ctx_moni.fillText(str, rcx + layoutElem.name.x * scale, rcy + layoutElem.name.y * scale);
			}
		}
	}

	// draw border
	ctx_moni.strokeStyle = '#808080';
	ctx_moni.lineWidth = 0.5;
	roundedRect(ctx_moni, rcx, rcy, PAR_WIDTH * scale, PAR_HEIGHT * scale);
	ctx_moni.stroke();

	return true;
}

function draw(){
	canvas_width = window.innerWidth;
	canvas_moni.width = window.innerWidth;
	canvas_moni.height = window.innerHeight - 28;

	ctx_moni.clearRect(0, 0, canvas_moni.width, canvas_moni.height);
	ctx_moni.fillStyle = '#181818';
	ctx_moni.fillRect(0, 0, canvas_moni.width, canvas_moni.height);
	ctx_moni.save();

	scale = 1;
	if(vf.canvas_height && canvas_moni.height < vf.canvas_height) scale = canvas_moni.height / vf.canvas_height;
	//ctx_moni.scale(1, scale);
	
	$("#div_preview").css("width", canvas_moni.width + "px");
	$("#moni_control").css("width", canvas_moni.width + "px");
	
	var rcx = 0;
	var rcy = 60 * scale;
	const wav_width = canvas_width - PAR_WIDTH * scale;

	draw_title(rcx)

	// draw waves groups
	var isTrackDrawn = new Set();
	for (var groupid in groups){
		var group = groups[groupid];
		if (!group.wav) continue;
		//console.log(group);
		var wavname = group.name;
		var wavtrack = montype_trks[group.wav];
		if (!wavtrack) continue;
		//console.log(wavtrack);
		if (wavtrack && wavtrack.srate && wavtrack.prev && wavtrack.prev.length) {
			//console.log(wavtrack)
			isTrackDrawn.add(wavtrack.tid);
			wavname = wavtrack.name;
		}

		draw_param(group, isTrackDrawn, rcx + wav_width, rcy);
		ctx_moni.lineWidth = 2.5;
		ctx_moni.strokeStyle = group.fgColor;
		draw_wave(wavtrack, rcx, rcy, wav_width, PAR_HEIGHT * scale);

		ctx_moni.lineWidth = 0.5;
		ctx_moni.strokeStyle = '#808080';
		ctx_moni.beginPath();
		ctx_moni.moveTo(rcx, rcy + PAR_HEIGHT * scale);
		ctx_moni.lineTo(rcx + wav_width, rcy + PAR_HEIGHT * scale);
		ctx_moni.stroke();

		ctx_moni.font = (14 * scale) + 'px Arial';
		ctx_moni.fillStyle = 'white';
		ctx_moni.textAlign = 'left';
		ctx_moni.textBaseline = 'top';
		ctx_moni.fillText(wavname, rcx + 3, rcy + 4);

		rcy += PAR_HEIGHT * scale;
	}

	// draw events
	var evttrk = vf.find_track("/EVENT");
	if (evttrk) {
		draw_param(null, null, wav_width, rcy);
		var cnt = 0;
		ctx_moni.font = (14 * scale) + 'px arial';
		ctx_moni.textAlign = 'left';
		ctx_moni.textBaseline = 'alphabetic';
		evts = evttrk.data;
		for (let eventIdx = 0; eventIdx < evts.length; eventIdx ++) {
			var rec = evts[eventIdx];
			var dt = rec[0];
			var value = rec[1];
			ctx_moni.fillStyle = '#4EB8C9';
			if(dt > dtplayer){
				break;
			}
			var date = new Date((dt + vf.dtstart) * 1000);
			var hours = date.getHours();
			var minutes = ("0" + date.getMinutes()).substr(-2);
			ctx_moni.fillText(hours + ':' + minutes, rcx + wav_width + 3, rcy + (20 + cnt * 20) * scale);
			ctx_moni.fillStyle = 'white';
			ctx_moni.fillText(value, rcx + wav_width + 45, rcy + (20 + cnt * 20) * scale);
			cnt += 1;
		}
	}

	// draw non-wave groups
	rcx = 0;
	var is_first_line = true;
	for (var groupid in groups){
		var group = groups[groupid];
		
		var wavtrack = montype_trks[group.wav];
		if (wavtrack && wavtrack.prev && wavtrack.prev.length) continue;
		
		if(!draw_param(group, isTrackDrawn, rcx, rcy)) continue;
		rcx += PAR_WIDTH * scale;
		if (rcx > canvas_width - PAR_WIDTH * scale * 2){
			rcx = 0;
			rcy += PAR_HEIGHT * scale;
			if(!is_first_line) break;
			is_first_line = false;
		}
	}
	
	ctx_moni.restore();
	if(!vf.canvas_height) vf.canvas_height = rcy + 3 * PAR_HEIGHT * scale;
	if(rcy + PAR_HEIGHT * scale > vf.canvas_height) vf.canvas_height = rcy + 3 * PAR_HEIGHT * scale;
}

var last_render = 0;
function redraw(){
	if(!$("#moni_preview").is(":visible")) return;
	update_frame(redraw);

	let now = Date.now();
	let diff = now - last_render;

	// 30 FPS
	if (diff > 30) last_render = now;
	else return;

	// 시간을 진행 시킴
	if (!isPaused && !isSliding && dtplayer < caselen){
		dtplayer += (fast_forward / 30); // 재생되고 있는 시간 + fast_forward
		$("#moni_slider").val(dtplayer);
		$("#casetime").html(format_time(Math.floor(dtplayer)) + " / " + format_time(Math.floor(caselen)));
		draw();
	} 
}

// 브라우저에서 지원하는 반복적 호출 함수
var update_frame = (function () {
	return window.requestAnimationFrame ||
		window.webkitRequestAnimationFrame ||
		window.mozRequestAnimationFrame ||
		window.oRequestAnimationFrame ||
		function (callback) {
			return window.setTimeout(callback, 1000 / 60); // shoot for 60 fps
		};
})();

// 브라우저 창 크기 바뀔 때마다 실행됨	
function onResizeWindow() {	
	var ratio = vf.canvas_height / canvas_width;
	canvas_moni.width = window.innerWidth;
	canvas_moni.height = window.innerHeight - 28;
	canvas_moni.style.width = window.innerWidth;
	canvas_moni.style.height = window.innerHeight - 28;
	canvas_width = canvas_moni.width;
}

function pause_resume(pause=null){
	if(pause) isPaused = pause;
	else isPaused = !isPaused;
	if (isPaused) {
		$("#moni_pause").hide();
		$("#moni_resume").show();
	} else {
		$("#moni_resume").hide();
		$("#moni_pause").show();
	}
}

function rewind(seconds = null){
	if(!seconds) seconds = (canvas_width - PAR_WIDTH) / 100;
	dtplayer -= seconds;
	if (dtplayer < 0) dtplayer = 0;
}

function proceed(seconds = null){
	if(!seconds) seconds = (canvas_width - PAR_WIDTH) / 100;
	dtplayer += seconds;
	if (dtplayer > caselen) dtplayer = caselen - (canvas_width - PAR_WIDTH) / 100;
}

function slide_to(seconds){
	dtplayer = parseInt(seconds);
	isSliding = false;
}

function slide_on(seconds){
	$("#casetime").html(format_time(Math.floor(seconds)) + " / " + format_time(Math.floor(caselen)));
	isSliding = true;
}

function set_playspeed(val){
	fast_forward = parseInt(val);
}

function get_caselen(){
	return caselen;
}

/****************************************************************** Track View ******************************************************************/

const DEVICE_ORDERS = ['SNUADC', 'SNUADCW', 'SNUADCM', 'Solar8000', 'Primus', 'Datex-Ohmeda', 'Orchestra', 'BIS', 'Invos', 'FMS', 'Vigilance', 'EV1000', 'Vigileo', 'CardioQ'];

const DEVICE_HEIGHT = 25;
const HEADER_WIDTH = 140;

var tracks = [];
var tw = 640;
var tx = HEADER_WIDTH;
var canvas_file = document.getElementById('file_preview');
var ctx_file = canvas_file.getContext('2d');

var undefined;
var progress = 0;

var dragx = -1;
var dragy = -1;
var offset = -35;
var is_zooming = false;
var fit = 0;

$('#file_preview').bind('mouseup', function(e) {
	if(!$("#file_preview").is(":visible")) return;
	e = e.originalEvent;
	dragx = -1;
	dragy = -1;
});

$('#file_preview').bind('mousedown', function(e) {
	if(!$("#file_preview").is(":visible")) return;
	e = e.originalEvent;
	dragx = e.x;
	dragy = e.y;
	dragty = canvas_file.parentNode.scrollTop;
	dragtx = tx;
});

$('#file_preview').bind('mousewheel', function(e) {
	if(!$("#file_preview").is(":visible")) return;
	is_zooming = true;
	e = e.originalEvent;
	var wheel = Math.sign(e.wheelDelta);
	if (e.altKey) return; 
	if (e.x < HEADER_WIDTH) return;
	
	var ratio = 1.5;
	if (wheel >= 1) {
		tw *= ratio;
		tx = e.x - (e.x - tx) * ratio;
	} else if (wheel < 1) { // ZOOM OUT
		tw /= ratio;
		tx = e.x - (e.x - tx) / ratio;
	}
	init_canvas()
	draw_all_tracks();
	e.preventDefault();
});

$('#file_preview').bind('mousemove', function(e) {
	if(!$("#file_preview").is(":visible")) return;
	e = e.originalEvent;
	if (dragx == -1){ // without mousedown, control buttons
		return;
	} 
	// width mousedown
	canvas_file.parentNode.scrollTop = dragty + (dragy - e.y);
	offset = canvas_file.parentNode.scrollTop - 35;
	tx = dragtx + (e.x - dragx);
	draw_all_tracks();
});


function stotime(seconds){
	var date = new Date((seconds + vf.dtstart) * 1000);
	var hh = date.getHours();
	var mm = date.getMinutes();
	var ss = date.getSeconds();

	return ("0" + hh).slice(-2) + ":" + ("0" + mm).slice(-2) + ":" + ("0" + ss).slice(-2);
}

function draw_time(){
	var caselen = get_caselen();
	if(!is_zooming) tw = (fit == 1)? (caselen * 100):(canvas_file.width - HEADER_WIDTH);
	var ty = 0;

	// Time ruler 배경 및 제목
	ctx_file.fillStyle = '#464646';
	ctx_file.fillRect(0, ty, canvas_file.width, DEVICE_HEIGHT);
	ctx_file.font = '100 12px arial';
	ctx_file.textBaseline = 'middle';
	ctx_file.textAlign = 'left'
	ctx_file.fillStyle = '#ffffff';
	ctx_file.fillText("TIME", 8, ty + DEVICE_HEIGHT - 7);

	ty += 5;
	
	// 시간 및 스케일 표시
	ctx_file.lineWidth = 1;
	ctx_file.strokeStyle = "#ffffff"
	ctx_file.textBaseline = 'top';
	var dist = (canvas_file.width - HEADER_WIDTH) / 5;
	for(var i = HEADER_WIDTH; i <= canvas_file.width; i += dist){
		var time = stotime((i - tx) * caselen / tw);
		ctx_file.textAlign = "center";
		if(i == HEADER_WIDTH) ctx_file.textAlign = "left";
		if(i == canvas_file.width){
			ctx_file.textAlign = "right";
			i -= 5;
		}
		ctx_file.fillText(time, i, ty)

		ctx_file.beginPath();
		ctx_file.moveTo(i, 17);
		ctx_file.lineTo(i, DEVICE_HEIGHT);
		ctx_file.stroke();
	}
}

VitalFile.prototype.draw_track = function(tid) {
	var t = this.trks[tid];
	// 아직 데이터가 로딩되지 않았으면 그리지 못함
	/* if (!t.hasOwnProperty('data')) {
		return;
	} */
	
	var ty = t.ty;
    var th = t.th;

	var caselen = get_caselen();
	if(!is_zooming) tw = (fit == 1)? (caselen * 100):(canvas_file.width - HEADER_WIDTH);

	// 배경을 지움
	ctx_file.fillStyle='#181818';
	ctx_file.fillRect(HEADER_WIDTH - 1, ty, canvas_file.width - HEADER_WIDTH, th);
	ctx_file.beginPath();
	ctx_file.lineWidth = 1;
	if (t.type == 1) {
		var isfirst = true;
		// 1 pixel 당 최소 100개의 샘플이 들어가게 함
		var inc = parseInt(t.prev.length / tw / 100);
        if (inc < 1) inc = 1;

		// 시작 idx를 구한다
		var sidx = parseInt((HEADER_WIDTH - tx) * t.prev.length / tw);
        if (sidx < 0) sidx = 0;
        //console.log(t.prev);
		for (var idx = sidx, l = t.prev.length; idx < l; idx += inc) {
			// 0인 픽셀은 그리지 않는다
			if (t.prev[idx] == 0) continue;

            var px = tx + ((idx * tw) / (t.prev.length));
			if (px <= HEADER_WIDTH) {
                continue;
            }
			if (px >= canvas_file.width){
                break;
            } 

			// 1-255 인 경우만 그린다
            var py = ty + th * (255 - t.prev[idx]) / 254;
			if (isfirst) {
				isfirst = false;
				ctx_file.moveTo(px, py);
			}
			ctx_file.lineTo(px, py);
		}
	} else if (t.type == 2) {
		for (let idx in t.data) {
			var dtval = t.data[idx];
			var dt = parseFloat(dtval[0]);
			var px = tx + dt / caselen * tw;
			if (px <= HEADER_WIDTH) continue;
			if (px >= canvas_file.width) break;

			var val = parseFloat(dtval[1]);
			if (val <= t.mindisp) continue;
			if (val >= t.maxdisp) val = t.maxdisp;

			var py = ty + th - (val - t.mindisp) * th / (t.maxdisp - t.mindisp);
			if (py < ty) py = ty;
			else if (py > ty + th) py = ty + th;

			ctx_file.moveTo(px, py);
			ctx_file.lineTo(px, ty + th);
		}
	}

	ctx_file.strokeStyle = this.get_color(tid);
	ctx_file.stroke();
	
	ctx_file.lineWidth = 0.5;
	ctx_file.strokeStyle = '#808080';
	ctx_file.beginPath();
	ctx_file.moveTo(HEADER_WIDTH, ty + th);
	ctx_file.lineTo(canvas_file.width, ty + th);
	ctx_file.stroke();
}

function init_canvas() {
	var canvas = canvas_file;
	var ctx = ctx_file;
	if(view == "moni") {
		canvas = canvas_moni;
		ctx = ctx_moni;
	}
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#181818';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	
	if(view == "track"){
		ctx.font = '100 12px arial';
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'left'
		var ty = DEVICE_HEIGHT;
		var lastdname = '';
		for (let i in vf.sorted_tids) {
			var tid = vf.sorted_tids[i];
			var t = vf.trks[tid];
			dname = t.dname;
	
			// 장치명을 그림
			if (dname != lastdname) { 
				ctx.fillStyle = '#505050';
				ctx.fillRect(0, ty, canvas.width, DEVICE_HEIGHT);
	
				// devices name text
				ctx.fillStyle = '#ffffff';
				ctx.fillText(dname, 8, ty + DEVICE_HEIGHT - 7);
	
				ty += DEVICE_HEIGHT;
				lastdname = dname;
			}
	
			// 트랙을 그림
			// track name field
			ctx.fillStyle = '#464646';
			ctx.fillRect(0, ty, HEADER_WIDTH, t.th);
			// track name text
			ctx.fillStyle = vf.get_color(tid);
			tname = t.name;
			ctx.fillText(tname, 8, ty + 20);
			
			// loading
			ctx.textAlign = 'left';
			ctx.fillStyle = '#808080';
			ctx.fillText('LOADING...', HEADER_WIDTH + 10, ty + DEVICE_HEIGHT - 7);
	
			ty += t.th;
		}
	}
}

function get_ctx_height(){
	return canvas_file.clientHeight;
}

function draw_all_tracks() {
	draw_time();
	for (let i in vf.sorted_tids){
		var tid = vf.sorted_tids[i];
		vf.draw_track(tid);
	}
}

function fit_trackview(i) {
	// fit width: i = 0
	// fit 100px: i = 1
	is_zooming = false;
	tx = HEADER_WIDTH;
	fit = i;
	draw_all_tracks();
	return true;
}

// 브라우저 창 크기 바뀔 때마다 실행됨	
function onResizeWindowT() {	
	if(!$("#file_preview").is(":visible")) return;
	canvas_file.width = canvas_file.clientWidth = canvas_file.style.width = parseInt(canvas_file.parentNode.parentNode.clientWidth);
	$("#div_preview").css("width", canvas_file.width + "px");
	init_canvas()
	draw_all_tracks();
}

$(document).ready(function() {
	window.addEventListener('resize', onResizeWindowT);
	let dropOverlay = $("#drop_overlay");
	let dropMessage = $("#drop_message");
	let fileInput = $("#file_input");

	dropMessage.show();
	dropOverlay.show();

	dropMessage.on("click", function() {
		fileInput.click();
	});

	fileInput.on("change", function(event) {
		handleFileInput(event.target.files);
	});

	$(document).on("dragenter", function(event) {
		event.preventDefault();
		event.stopPropagation();
		dropOverlay.addClass("active");
		dropMessage.addClass("d-none");
	});

	$(document).on("dragover", function(event) {
		event.preventDefault();
		event.stopPropagation();
	});

	$(document).on("dragleave", function(event) {
		event.preventDefault();
		event.stopPropagation();
		if (event.originalEvent.clientX === 0 && event.originalEvent.clientY === 0) {
			dropOverlay.removeClass("active");
			dropMessage.removeClass("d-none");
		}
	});

	$(document).on("drop", function(event) {
		event.preventDefault();
		event.stopPropagation();
		dropOverlay.removeClass("active");
		dropMessage.removeClass("d-none");

		let files = event.originalEvent.dataTransfer.files;
		if (files.length > 0) {
			handleFileInput(files);
		}
	});

	function handleFileInput(files) {
		const file = files[0];
		if (!file) return;

		if (!file.name.toLowerCase().endsWith(".vital")) {
			alert("⚠️ Only .vital files are allowed!");
			return;
		}

		const reader = new FileReader();
		reader.onload = function (event) {
			const arrayBuffer = event.target.result;
			const filename = file.name;

			if (!window.files) {
				window.files = {};
			}

			if (!files.hasOwnProperty(filename)) {
				try {
					isPaused = true;

					const blob = new Blob([arrayBuffer]);
					files[filename] = new VitalFile(blob, filename);
					console.log(`✅ Successfully loaded: ${filename}`);
				} catch (e) {
					console.error(`❌ Failed to parse file: ${filename}`, e);
					alert("⚠️ Failed to load the selected file.");
				}
			} else {
				files[filename].draw_trackview();
			}
		};
		reader.readAsArrayBuffer(file);
		dropMessage.hide();
	}
});

VitalFile.prototype.draw_trackview = function(){
	view = "track";
	$("#moni_preview").hide();
	$("#moni_control").hide();
	$("#file_preview").show();
	$("#fit_width").show();
	$("#fit_100px").show();
	$("#convert_view").attr("onclick", "vf.draw_moniview()").html("Monitor View");
	vf = this;
	caselen = this.dtend - this.dtstart;
	
	canvas_file.width = canvas_file.clientWidth = canvas_file.style.width = parseInt(canvas_file.parentNode.parentNode.clientWidth);
	//canvas_file.height = 800;

	is_zooming = false;
	init_canvas()
	draw_all_tracks();

	if (this.sorted_tids.length > 0) {
		$("#span_preview_caseid").html(this.filename);
		$("#div_preview").css('display','');
		$("#btn_preview").css('display','');
	}
}

VitalFile.prototype.sort_tracks = function(){
	var ordered_trks = {};
	for(var tid in this.trks){
		var trk = this.trks[tid];
		var dname = trk.dtname.split("/")[0];
		this.trks[tid].dname = dname;
		var order = DEVICE_ORDERS.indexOf(dname);
        if (order == -1) order = '99' + dname;
		else if (order < 10) order = '0' + order + dname;
        else order += dname;
		if(!ordered_trks[order]) ordered_trks[order] = {};
		ordered_trks[order][trk.name] = tid;
	}

	tracks = [];
	var ordered_tkeys = Object.keys(ordered_trks).sort();
	for (let i in ordered_tkeys) {
		var order = ordered_tkeys[i];
		var tnames = Object.keys(ordered_trks[order]).sort();
		for (let j in tnames) {
			var tname = tnames[j];
			tracks.push(ordered_trks[order][tname]);
		}
	}
	// 트랙 높이를 계산하여 ty를 정한다
	var ty = DEVICE_HEIGHT;
	var lastdname = "";
	for (var i in tracks) {
		var tid = tracks[i];
		var dname = this.trks[tid].dname;
		if (dname !== lastdname) {
			lastdname = dname;
			ty += DEVICE_HEIGHT;
		}
		this.trks[tid].ty = ty;
		if (this.trks[tid].ttype == 'W') this.trks[tid].th = 40;
		else this.trks[tid].th = 24;
		ty += this.trks[tid].th;
	}

	this.sorted_tids = tracks;
	canvas_file.height = canvas_file.clientHeight = ty;
}