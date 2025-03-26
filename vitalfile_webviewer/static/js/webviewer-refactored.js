/**
 * refactored-webviewer.js
 * A modular implementation of the VitalFile viewer
 * @author Original: Eunsun Rachel Lee <eunsun.lee93@gmail.com>
 * @author Refactored: AI Assistant
 */

// Immediately Invoked Function Expression (IIFE) to create a module
const VitalFileViewer = (function () {
    // Constants
    const CONSTANTS = {
        // Monitor type codes
        MONTYPES: {
            1: "ECG_WAV", 2: "ECG_HR", 3: "ECG_PVC", 4: "IABP_WAV", 5: "IABP_SBP",
            6: "IABP_DBP", 7: "IABP_MBP", 8: "PLETH_WAV", 9: "PLETH_HR", 10: "PLETH_SPO2",
            11: "RESP_WAV", 12: "RESP_RR", 13: "CO2_WAV", 14: "CO2_RR", 15: "CO2_CONC",
            16: "NIBP_SBP", 17: "NIBP_DBP", 18: "NIBP_MBP", 19: "BT", 20: "CVP_WAV",
            21: "CVP_CVP", 22: "EEG_BIS", 23: "TV", 24: "MV", 25: "PIP", 26: "AGENT1_NAME",
            27: "AGENT1_CONC", 28: "AGENT2_NAME", 29: "AGENT2_CONC", 30: "DRUG1_NAME",
            31: "DRUG1_CE", 32: "DRUG2_NAME", 33: "DRUG2_CE", 34: "CO", 36: "EEG_SEF",
            38: "PEEP", 39: "ECG_ST", 40: "AGENT3_NAME", 41: "AGENT3_CONC", 42: "STO2_L",
            43: "STO2_R", 44: "EEG_WAV", 45: "FLUID_RATE", 46: "FLUID_TOTAL", 47: "SVV",
            49: "DRUG3_NAME", 50: "DRUG3_CE", 52: "FILT1_1", 53: "FILT1_2", 54: "FILT2_1",
            55: "FILT2_2", 56: "FILT3_1", 57: "FILT3_2", 58: "FILT4_1", 59: "FILT4_2",
            60: "FILT5_1", 61: "FILT5_2", 62: "FILT6_1", 63: "FILT6_2", 64: "FILT7_1",
            65: "FILT7_2", 66: "FILT8_1", 67: "FILT8_2", 70: "PSI", 71: "PVI", 72: "SPHB",
            73: "ORI", 75: "ASKNA", 76: "PAP_SBP", 77: "PAP_MBP", 78: "PAP_DBP", 79: "FEM_SBP",
            80: "FEM_MBP", 81: "FEM_DBP", 82: "EEG_SEFL", 83: "EEG_SEFR", 84: "EEG_SR",
            85: "TOF_RATIO", 86: "TOF_CNT", 87: "SKNA_WAV", 88: "ICP", 89: "CPP", 90: "ICP_WAV",
            91: "PAP_WAV", 92: "FEM_WAV", 93: "ALARM_LEVEL", 95: "EEGL_WAV", 96: "EEGR_WAV",
            97: "ANII", 98: "ANIM", 99: "PTC_CNT"
        },

        // Monitor view constants
        PAR_WIDTH: 160,
        PAR_HEIGHT: 80,

        // Track view constants
        DEVICE_ORDERS: ['SNUADC', 'SNUADCW', 'SNUADCM', 'Solar8000', 'Primus', 'Datex-Ohmeda',
            'Orchestra', 'BIS', 'Invos', 'FMS', 'Vigilance', 'EV1000', 'Vigileo', 'CardioQ'],
        DEVICE_HEIGHT: 25,
        HEADER_WIDTH: 140
    };

    // Monitor view module
    const MonitorView = (function () {
        // Private state
        let canvas;
        let ctx;
        let vf;
        let montype_groupids = {};
        let montype_trks = {};
        let groupid_trks = {};
        let dtplayer = 0;
        let isPaused = true;
        let isSliding = false;
        let scale = 1;
        let caselen;
        let fast_forward = 1.0;
        let canvas_width;
        let last_render = 0;

        // Monitor group definitions
        const groups = [
            { 'fgColor': '#00FF00', 'wav': 'ECG_WAV', 'paramLayout': 'TWO', 'param': ['ECG_HR', 'ECG_PVC'], 'name': 'ECG' },
            { 'fgColor': '#FF0000', 'wav': 'IABP_WAV', 'paramLayout': 'BP', 'param': ['IABP_SBP', 'IABP_DBP', 'IABP_MBP'], 'name': 'ART' },
            { 'fgColor': '#82CEFC', 'wav': 'PLETH_WAV', 'paramLayout': 'TWO', 'param': ['PLETH_SPO2', 'PLETH_HR'], 'name': 'PLETH' },
            { 'fgColor': '#FAA804', 'wav': 'CVP_WAV', 'paramLayout': 'ONE', 'param': ['CVP_CVP'], 'name': 'CVP' },
            { 'fgColor': '#DAA2DC', 'wav': 'EEG_WAV', 'paramLayout': 'TWO', 'param': ['EEG_BIS', 'EEG_SEF'], 'name': 'EEG' },
            { 'fgColor': '#FAA804', 'paramLayout': 'TWO', 'param': ['AGENT_CONC', 'AGENT_NAME'], 'name': 'AGENT' },
            { 'fgColor': '#FAA804', 'paramLayout': 'TWO', 'param': ['AGENT1_CONC', 'AGENT1_NAME'], 'name': 'AGENT1' },
            { 'fgColor': '#FAA804', 'paramLayout': 'TWO', 'param': ['AGENT2_CONC', 'AGENT2_NAME'], 'name': 'AGENT2' },
            { 'fgColor': '#FAA804', 'paramLayout': 'TWO', 'param': ['AGENT3_CONC', 'AGENT3_NAME'], 'name': 'AGENT3' },
            { 'fgColor': '#FAA804', 'paramLayout': 'TWO', 'param': ['AGENT4_CONC', 'AGENT4_NAME'], 'name': 'AGENT4' },
            { 'fgColor': '#FAA804', 'paramLayout': 'TWO', 'param': ['AGENT5_CONC', 'AGENT5_NAME'], 'name': 'AGENT5' },
            { 'fgColor': '#9ACE34', 'paramLayout': 'TWO', 'param': ['DRUG_CE', 'DRUG_NAME'], 'name': 'DRUG' },
            { 'fgColor': '#9ACE34', 'paramLayout': 'TWO', 'param': ['DRUG1_CE', 'DRUG1_NAME'], 'name': 'DRUG1' },
            { 'fgColor': '#9ACE34', 'paramLayout': 'TWO', 'param': ['DRUG2_CE', 'DRUG2_NAME'], 'name': 'DRUG2' },
            { 'fgColor': '#9ACE34', 'paramLayout': 'TWO', 'param': ['DRUG3_CE', 'DRUG3_NAME'], 'name': 'DRUG3' },
            { 'fgColor': '#9ACE34', 'paramLayout': 'TWO', 'param': ['DRUG4_CE', 'DRUG4_NAME'], 'name': 'DRUG4' },
            { 'fgColor': '#9ACE34', 'paramLayout': 'TWO', 'param': ['DRUG5_CE', 'DRUG5_NAME'], 'name': 'DRUG5' },
            { 'fgColor': '#FFFF00', 'wav': 'RESP_WAV', 'paramLayout': 'ONE', 'param': ['RESP_RR'], 'name': 'RESP' },
            { 'fgColor': '#FFFF00', 'wav': 'CO2_WAV', 'paramLayout': 'TWO', 'param': ['CO2_CONC', 'CO2_RR'], 'name': 'CO2' },
            { 'fgColor': '#FFFFFF', 'paramLayout': 'VNT', 'name': 'VNT', 'param': ['TV', 'RESP_RR', 'PIP', 'PEEP'], },
            { 'fgColor': '#F08080', 'paramLayout': 'VNT', 'name': 'NMT', 'param': ['TOF_RATIO', 'TOF_CNT', 'PTC_CNT'], },
            { 'fgColor': '#FFFFFF', 'paramLayout': 'BP', 'param': ['NIBP_SBP', 'NIBP_DBP', 'NIBP_MBP'], 'name': 'NIBP' },
            { 'fgColor': '#DAA2DC', 'wav': 'EEGL_WAV', 'paramLayout': 'TWO', 'param': ['PSI', 'EEG_SEFL', 'EEG_SEFR'], 'name': 'MASIMO' },
            { 'fgColor': '#FF0000', 'paramLayout': 'TWO', 'param': ['SPHB', 'PVI'], },
            { 'fgColor': '#FFC0CB', 'paramLayout': 'TWO', 'param': ['CO', 'SVV'], 'name': 'CARTIC' },
            { 'fgColor': '#FFFFFF', 'paramLayout': 'LR', 'param': ['STO2_L', 'STO2_R'], 'name': 'STO2' },
            { 'fgColor': '#828284', 'paramLayout': 'TWO', 'param': ['FLUID_RATE', 'FLUID_TOTAL'], 'name': 'FLUID' },
            { 'fgColor': '#D2B48C', 'paramLayout': 'ONE', 'param': ['BT'] },
            { 'fgColor': '#FF0000', 'wav': 'PAP_WAV', 'paramLayout': 'BP', 'param': ['PAP_SBP', 'PAP_DBP', 'PAP_MBP'], 'name': 'PAP' },
            { 'fgColor': '#FF0000', 'wav': 'FEM_WAV', 'paramLayout': 'BP', 'param': ['FEM_SBP', 'FEM_DBP', 'FEM_MBP'], 'name': 'FEM' },
            { 'fgColor': '#00FF00', 'wav': 'SKNA_WAV', 'paramLayout': 'ONE', 'param': ['ASKNA'], 'name': 'SKNA' },
            { 'fgColor': '#FFFFFF', 'wav': 'ICP_WAV', 'paramLayout': 'TWO', 'param': ['ICP', 'CPP'] },
            { 'fgColor': '#FF7F51', 'paramLayout': 'TWO', 'param': ['ANIM', 'ANII'] },
            { 'fgColor': '#99d9ea', 'paramLayout': 'TWO', 'param': ['FILT1_1', 'FILT1_2'] },
            { 'fgColor': '#C8BFE7', 'paramLayout': 'TWO', 'param': ['FILT2_1', 'FILT2_2'] },
            { 'fgColor': '#EFE4B0', 'paramLayout': 'TWO', 'param': ['FILT3_1', 'FILT3_2'] },
            { 'fgColor': '#FFAEC9', 'paramLayout': 'TWO', 'param': ['FILT4_1', 'FILT4_2'] },
        ];

        const paramLayouts = {
            'ONE': [{ name: { baseline: 'top', x: 5, y: 5 }, value: { fontsize: 40, align: 'right', x: CONSTANTS.PAR_WIDTH - 5, y: (CONSTANTS.PAR_HEIGHT - 10) } }],
            'TWO': [
                { name: { baseline: 'top', x: 5, y: 5 }, value: { fontsize: 40, align: 'right', x: CONSTANTS.PAR_WIDTH - 5, y: 42 } },
                { name: { baseline: 'bottom', x: 5, y: (CONSTANTS.PAR_HEIGHT - 4) }, value: { fontsize: 24, align: 'right', x: CONSTANTS.PAR_WIDTH - 5, y: (CONSTANTS.PAR_HEIGHT - 8) } }
            ],
            'LR': [
                { name: { baseline: 'top', x: 5, y: 5 }, value: { fontsize: 40, align: 'left', x: 5, y: (CONSTANTS.PAR_HEIGHT - 10), } },
                { name: { align: 'right', baseline: 'top', x: CONSTANTS.PAR_WIDTH - 3, y: 4 }, value: { fontsize: 40, align: 'right', x: CONSTANTS.PAR_WIDTH - 5, y: (CONSTANTS.PAR_HEIGHT - 10) } }
            ],
            'BP': [
                { name: { baseline: 'top', x: 5, y: 5 }, value: { fontsize: 38, align: 'right', x: CONSTANTS.PAR_WIDTH - 5, y: 37 } },
                { value: { fontsize: 38, align: 'right', x: CONSTANTS.PAR_WIDTH - 5, y: (CONSTANTS.PAR_HEIGHT - 8) } }
            ],
            'VNT': [
                { name: { baseline: 'top', x: 5, y: 5 }, value: { fontsize: 38, align: 'right', x: CONSTANTS.PAR_WIDTH - 45, y: 37 } },
                { value: { fontsize: 30, align: 'right', x: CONSTANTS.PAR_WIDTH - 5, y: 37 } },
                { value: { fontsize: 24, align: 'right', x: CONSTANTS.PAR_WIDTH - 5, y: (CONSTANTS.PAR_HEIGHT - 8) } }
            ]
        };

        // Helper functions
        function formatTime(seconds) {
            const ss = seconds % 60;
            const mm = Math.floor(seconds / 60) % 60;
            const hh = Math.floor(seconds / 3600) % 24;

            return [hh, mm, ss]
                .map(v => v < 10 ? "0" + v : v)
                .filter((v, i) => v !== "00" || i > 0)
                .join(":");
        }

        function getPlaytime() {
            const date = new Date((vf.dtstart + dtplayer) * 1000);
            return ("0" + date.getHours()).substr(-2) + ":" +
                ("0" + date.getMinutes()).substr(-2) + ":" +
                ("0" + date.getSeconds()).substr(-2);
        }

        function formatValue(value, type) {
            if (type === 5) {
                return value.length > 4 ? value.slice(0, 4) : value;
            }

            if (typeof value === 'string') {
                value = parseFloat(value);
            }

            if (Math.abs(value) >= 100 || value - Math.floor(value) < 0.05) {
                return value.toFixed(0);
            } else {
                return value.toFixed(1);
            }
        }

        function roundedRect(ctx, x, y, width, height, radius = 0) {
            ctx.beginPath();
            ctx.moveTo(x, y + radius);
            ctx.lineTo(x, y + height - radius);
            ctx.arcTo(x, y + height, x + radius, y + height, radius);
            ctx.lineTo(x + width - radius, y + height);
            ctx.arcTo(x + width, y + height, x + width, y + height - radius, radius);
            ctx.lineTo(x + width, y + radius);
            ctx.arcTo(x + width, y, x + width - radius, y, radius);
            ctx.lineTo(x + radius, y);
            ctx.arcTo(x, y, x, y + radius, radius);
        }

        // Drawing functions
        function montypeGroup() {
            // Initialize groupings
            montype_groupids = {};
            montype_trks = {};
            groupid_trks = {};

            // Map monitor types to group IDs
            for (let groupid in groups) {
                const group = groups[groupid];
                for (let i in group.param) {
                    const montype = group.param[i];
                    montype_groupids[montype] = groupid;
                }
                if (group.wav) {
                    montype_groupids[group.wav] = groupid;
                }
            }

            // Organize tracks by monitor type and group
            for (let tid in vf.trks) {
                const trk = vf.trks[tid];
                const montype = vf.get_montype(tid);
                if (montype !== "" && !montype_trks[montype]) montype_trks[montype] = trk;

                const groupid = montype_groupids[montype];
                if (groupid) {
                    if (!groupid_trks[groupid]) {
                        groupid_trks[groupid] = [];
                    }
                    groupid_trks[groupid].push(trk);
                }
            }
        }

        function drawTitle(rcx) {
            ctx.font = (40 * scale) + 'px arial';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';

            ctx.fillText(vf.bedname, rcx + 4, 45 * scale);
            let px = rcx + ctx.measureText(vf.bedname).width + 22;

            // Current playback time
            const casetime = getPlaytime();
            ctx.font = 'bold ' + (24 * scale) + 'px arial';
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(casetime, (rcx + canvas_width) / 2 - 50, 29 * scale);

            // Device list
            ctx.font = (15 * scale) + 'px arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            for (let did in vf.devs) {
                const dev = vf.devs[did];
                if (!dev.name) continue;

                ctx.fillStyle = '#348EC7';
                roundedRect(ctx, px, 36 * scale, 12 * scale, 12 * scale, 3);
                ctx.fill();

                px += 17 * scale;

                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(dev.name.substr(0, 7), px, 48 * scale);
                px += ctx.measureText(dev.name.substr(0, 7)).width + 13 * scale;
            }
        }

        function drawWave(track, rcx, rcy, wav_width, rch) {
            if (!track || !track.srate || !track.prev || !track.prev.length) {
                return;
            }

            ctx.beginPath();

            let lastx = rcx;
            let py = 0;
            let is_first = true;

            let idx = parseInt(dtplayer * track.srate);
            let inc = track.srate / 100;
            let px = 0;

            for (let l = idx; l < idx + (rcx + wav_width) * inc && l < track.prev.length; l++, px += (1.0 / inc)) {
                let value = track.prev[l];
                if (value === 0) continue;

                if (px > rcx + wav_width) break;

                py = rcy + rch * (255 - value) / 254;

                if (py < rcy) py = rcy;
                if (py > rcy + rch) py = rcy + rch;

                if (is_first) {
                    if (px < rcx + 10) {
                        ctx.moveTo(rcx, py);
                        ctx.lineTo(px, py);
                    } else {
                        ctx.moveTo(px, py);
                    }
                    is_first = false;
                } else {
                    if (px - lastx > rcx + 10) {
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.moveTo(px, py);
                    } else {
                        ctx.lineTo(px, py);
                    }
                }

                lastx = px;
            }

            if (!is_first && px > rcx + wav_width - 10) {
                ctx.lineTo(rcx + wav_width, py);
            }

            ctx.stroke();

            // Draw white rectangle at the rightmost position
            if (!is_first && px > rcx + wav_width - 4) {
                ctx.fillStyle = 'white';
                ctx.fillRect(rcx + wav_width - 4, py - 2, 4, 4);
            }
        }

        function drawParam(group, isTrackDrawn, rcx, rcy) {
            if (!group || !group.param) return false;

            const layout = paramLayouts[group.paramLayout];
            const nameValueArray = [];
            if (!layout) return false;

            let valueExists = false;

            // Collect parameter values for this group
            for (let i in group.param) {
                const montype = group.param[i];
                const track = montype_trks[montype];

                if (track && track.data) {
                    isTrackDrawn.add(track.tid);
                    let value = null;

                    for (let idx = 0; idx < track.data.length; idx++) {
                        const rec = track.data[idx];
                        const dt = rec[0];

                        if (dt > dtplayer) {
                            if (idx > 0 && track.data[idx - 1][0] > dtplayer - 300) {
                                value = track.data[idx - 1][1];
                            }
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

            // Handle special formatting for different types of groups
            if (group.name) {
                const name = group.name;
                if (name.substring(0, 5) === 'AGENT' && nameValueArray.length > 1) {
                    const agentValue = nameValueArray[1].value.toUpperCase();
                    if (agentValue === 'DESF') {
                        nameValueArray[1].value = 'DES';
                    } else if (agentValue === 'ISOF') {
                        nameValueArray[1].value = 'ISO';
                    } else if (agentValue === 'ENFL') {
                        nameValueArray[1].value = 'ENF';
                    }
                }
            }

            if (group.paramLayout === 'BP' && nameValueArray.length > 2) {
                nameValueArray[0].name = group.name || '';
                nameValueArray[0].value = (nameValueArray[0].value ? Math.round(nameValueArray[0].value) : ' ') +
                    (nameValueArray[1].value ? ('/' + Math.round(nameValueArray[1].value)) : ' ');
                nameValueArray[2].value = nameValueArray[2].value ? Math.round(nameValueArray[2].value) : '';
                nameValueArray[1] = nameValueArray[2];
                nameValueArray.pop();
            } else if (nameValueArray.length > 0 && !nameValueArray[0].name) {
                nameValueArray[0].name = group.name || '';
            }

            // Draw parameter values according to layout
            for (let idx = 0; idx < layout.length && idx < nameValueArray.length; idx++) {
                const layoutElem = layout[idx];

                if (layoutElem.value) {
                    ctx.font = (layoutElem.value.fontsize * scale) + 'px arial';
                    ctx.fillStyle = group.fgColor;

                    // Handle special colors for specific parameters
                    if (nameValueArray[0].name === "HPI") ctx.fillStyle = "#00FFFF";
                    if (group.name && group.name.substring(0, 5) === 'AGENT' && nameValueArray.length > 1) {
                        if (nameValueArray[1].value === 'DES') {
                            ctx.fillStyle = '#2296E6';
                        } else if (nameValueArray[1].value === 'ISO') {
                            ctx.fillStyle = '#DDA0DD';
                        } else if (nameValueArray[1].value === 'ENF') {
                            ctx.fillStyle = '#FF0000';
                        }
                    }

                    ctx.textAlign = layoutElem.value.align || 'left';
                    ctx.textBaseline = layoutElem.value.baseline || 'alphabetic';
                    ctx.fillText(nameValueArray[idx].value, rcx + layoutElem.value.x * scale, rcy + layoutElem.value.y * scale);
                }

                if (layoutElem.name) {
                    ctx.font = (14 * scale) + 'px arial';
                    ctx.fillStyle = 'white';
                    ctx.textAlign = layoutElem.name.align || 'left';
                    ctx.textBaseline = layoutElem.name.baseline || 'alphabetic';

                    const str = nameValueArray[idx].name;
                    const measuredWidth = ctx.measureText(str).width;
                    const maxWidth = 75;

                    if (measuredWidth > maxWidth) {
                        ctx.save();
                        ctx.scale(maxWidth / measuredWidth, 1);
                        ctx.fillText(str, (rcx + layoutElem.name.x * scale) * measuredWidth / maxWidth, rcy + layoutElem.name.y * scale);
                        ctx.restore();
                    } else {
                        ctx.fillText(str, rcx + layoutElem.name.x * scale, rcy + layoutElem.name.y * scale);
                    }
                }
            }

            // Draw border
            ctx.strokeStyle = '#808080';
            ctx.lineWidth = 0.5;
            roundedRect(ctx, rcx, rcy, CONSTANTS.PAR_WIDTH * scale, CONSTANTS.PAR_HEIGHT * scale);
            ctx.stroke();

            return true;
        }

        function draw() {
            canvas_width = window.innerWidth;
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight - 28;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#181818';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.save();

            scale = 1;
            if (vf.canvas_height && canvas.height < vf.canvas_height) {
                scale = canvas.height / vf.canvas_height;
            }

            $("#div_preview").css("width", canvas.width + "px");
            $("#moni_control").css("width", canvas.width + "px");

            let rcx = 0;
            let rcy = 60 * scale;
            const wav_width = canvas_width - CONSTANTS.PAR_WIDTH * scale;

            drawTitle(rcx);

            // Draw wave groups
            const isTrackDrawn = new Set();
            for (let groupid in groups) {
                const group = groups[groupid];
                if (!group.wav) continue;

                let wavname = group.name;
                const wavtrack = montype_trks[group.wav];
                if (!wavtrack) continue;

                if (wavtrack && wavtrack.srate && wavtrack.prev && wavtrack.prev.length) {
                    isTrackDrawn.add(wavtrack.tid);
                    wavname = wavtrack.name;
                }

                drawParam(group, isTrackDrawn, rcx + wav_width, rcy);
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = group.fgColor;
                drawWave(wavtrack, rcx, rcy, wav_width, CONSTANTS.PAR_HEIGHT * scale);

                ctx.lineWidth = 0.5;
                ctx.strokeStyle = '#808080';
                ctx.beginPath();
                ctx.moveTo(rcx, rcy + CONSTANTS.PAR_HEIGHT * scale);
                ctx.lineTo(rcx + wav_width, rcy + CONSTANTS.PAR_HEIGHT * scale);
                ctx.stroke();

                ctx.font = (14 * scale) + 'px Arial';
                ctx.fillStyle = 'white';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(wavname, rcx + 3, rcy + 4);

                rcy += CONSTANTS.PAR_HEIGHT * scale;
            }

            // Draw events
            const evttrk = vf.find_track("/EVENT");
            if (evttrk) {
                drawParam(null, null, wav_width, rcy);
                let cnt = 0;
                ctx.font = (14 * scale) + 'px arial';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';
                const evts = evttrk.data;

                for (let eventIdx = 0; eventIdx < evts.length; eventIdx++) {
                    const rec = evts[eventIdx];
                    const dt = rec[0];
                    const value = rec[1];

                    if (dt > dtplayer) {
                        break;
                    }

                    const date = new Date((dt + vf.dtstart) * 1000);
                    const hours = date.getHours();
                    const minutes = ("0" + date.getMinutes()).substr(-2);

                    ctx.fillStyle = '#4EB8C9';
                    ctx.fillText(hours + ':' + minutes, rcx + wav_width + 3, rcy + (20 + cnt * 20) * scale);

                    ctx.fillStyle = 'white';
                    ctx.fillText(value, rcx + wav_width + 45, rcy + (20 + cnt * 20) * scale);

                    cnt += 1;
                }
            }

            // Draw non-wave groups
            rcx = 0;
            let is_first_line = true;
            for (let groupid in groups) {
                const group = groups[groupid];

                const wavtrack = montype_trks[group.wav];
                if (wavtrack && wavtrack.prev && wavtrack.prev.length) continue;

                if (!drawParam(group, isTrackDrawn, rcx, rcy)) continue;

                rcx += CONSTANTS.PAR_WIDTH * scale;
                if (rcx > canvas_width - CONSTANTS.PAR_WIDTH * scale * 2) {
                    rcx = 0;
                    rcy += CONSTANTS.PAR_HEIGHT * scale;
                    if (!is_first_line) break;
                    is_first_line = false;
                }
            }

            ctx.restore();
            if (!vf.canvas_height) vf.canvas_height = rcy + 3 * CONSTANTS.PAR_HEIGHT * scale;
            if (rcy + CONSTANTS.PAR_HEIGHT * scale > vf.canvas_height) vf.canvas_height = rcy + 3 * CONSTANTS.PAR_HEIGHT * scale;
        }

        function redraw() {
            if (!$("#moni_preview").is(":visible")) return;
            updateFrame(redraw);

            const now = Date.now();
            const diff = now - last_render;

            // Limit to 30 FPS
            if (diff > 30) {
                last_render = now;
            } else {
                return;
            }

            // Advance playback time
            if (!isPaused && !isSliding && dtplayer < caselen) {
                dtplayer += (fast_forward / 30); // Add time based on playback speed
                $("#moni_slider").val(dtplayer);
                $("#casetime").html(formatTime(Math.floor(dtplayer)) + " / " + formatTime(Math.floor(caselen)));
                draw();
            }
        }

        // Browser animation frame helper
        const updateFrame = (function () {
            return window.requestAnimationFrame ||
                window.webkitRequestAnimationFrame ||
                window.mozRequestAnimationFrame ||
                window.oRequestAnimationFrame ||
                function (callback) {
                    return window.setTimeout(callback, 1000 / 60); // target 60 fps
                };
        })();

        // Event handlers
        function onResizeWindow() {
            const ratio = vf.canvas_height / canvas_width;
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight - 28;
            canvas.style.width = window.innerWidth + 'px';
            canvas.style.height = (window.innerHeight - 28) + 'px';
            canvas_width = canvas.width;
        }

        function pauseResume(pause = null) {
            if (pause !== null) {
                isPaused = pause;
            } else {
                isPaused = !isPaused;
            }

            if (isPaused) {
                $("#moni_pause").hide();
                $("#moni_resume").show();
            } else {
                $("#moni_resume").hide();
                $("#moni_pause").show();
            }
        }

        function rewind(seconds = null) {
            if (!seconds) seconds = (canvas_width - CONSTANTS.PAR_WIDTH) / 100;
            dtplayer -= seconds;
            if (dtplayer < 0) dtplayer = 0;
        }

        function proceed(seconds = null) {
            if (!seconds) seconds = (canvas_width - CONSTANTS.PAR_WIDTH) / 100;
            dtplayer += seconds;
            if (dtplayer > caselen) dtplayer = caselen - (canvas_width - CONSTANTS.PAR_WIDTH) / 100;
        }

        function slideTo(seconds) {
            dtplayer = parseInt(seconds);
            isSliding = false;
            draw();
        }

        function slideOn(seconds) {
            $("#casetime").html(formatTime(Math.floor(seconds)) + " / " + formatTime(Math.floor(caselen)));
            isSliding = true;
        }

        function setPlayspeed(val) {
            fast_forward = parseInt(val);
        }

        function getCaselen() {
            return caselen;
        }

        // Public API
        return {
            initialize: function (vitalFile, canvasElement) {
                vf = vitalFile;
                canvas = canvasElement;
                ctx = canvas.getContext('2d');
                caselen = vf.dtend - vf.dtstart;

                // Reset state
                fast_forward = 1.0;
                montype_groupids = {};
                montype_trks = {};
                groupid_trks = {};
                dtplayer = 0;

                // Initialize UI
                pauseResume(true);
                $("#moni_slider").attr("max", caselen).attr("min", 0).val(0);

                montypeGroup();
                onResizeWindow();
                draw();
                updateFrame(redraw);
            },
            pauseResume: pauseResume,
            rewind: rewind,
            proceed: proceed,
            slideTo: slideTo,
            slideOn: slideOn,
            setPlayspeed: setPlayspeed,
            getCaselen: getCaselen,
            onResize: onResizeWindow
        };
    })();

    // Track View module
    const TrackView = (function () {
        // Private state
        let canvas;
        let ctx;
        let vf;
        let tracks = [];
        let tw = 640;
        let tx = CONSTANTS.HEADER_WIDTH;
        let offset = -35;
        let is_zooming = false;
        let fit = 0;
        let dragx = -1;
        let dragy = -1;
        let dragty, dragtx;

        // Helper functions
        function stotime(seconds) {
            const date = new Date((seconds + vf.dtstart) * 1000);
            const hh = date.getHours();
            const mm = date.getMinutes();
            const ss = date.getSeconds();

            return ("0" + hh).slice(-2) + ":" + ("0" + mm).slice(-2) + ":" + ("0" + ss).slice(-2);
        }

        // Drawing functions
        function drawTime() {
            const caselen = vf.dtend - vf.dtstart;
            if (!is_zooming) {
                tw = (fit === 1) ? (caselen * 100) : (canvas.width - CONSTANTS.HEADER_WIDTH);
            }
            let ty = 0;

            // Time ruler background and title
            ctx.fillStyle = '#464646';
            ctx.fillRect(0, ty, canvas.width, CONSTANTS.DEVICE_HEIGHT);
            ctx.font = '100 12px arial';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.fillStyle = '#ffffff';
            ctx.fillText("TIME", 8, ty + CONSTANTS.DEVICE_HEIGHT - 7);

            ty += 5;

            // Draw time scale
            ctx.lineWidth = 1;
            ctx.strokeStyle = "#ffffff";
            ctx.textBaseline = 'top';
            const dist = (canvas.width - CONSTANTS.HEADER_WIDTH) / 5;

            for (let i = CONSTANTS.HEADER_WIDTH; i <= canvas.width; i += dist) {
                const time = stotime((i - tx) * caselen / tw);
                ctx.textAlign = "center";

                if (i === CONSTANTS.HEADER_WIDTH) ctx.textAlign = "left";
                if (i === canvas.width) {
                    ctx.textAlign = "right";
                    i -= 5;
                }

                ctx.fillText(time, i, ty);

                ctx.beginPath();
                ctx.moveTo(i, 17);
                ctx.lineTo(i, CONSTANTS.DEVICE_HEIGHT);
                ctx.stroke();
            }
        }

        function drawTrack(tid) {
            const t = vf.trks[tid];
            const ty = t.ty;
            const th = t.th;

            const caselen = vf.dtend - vf.dtstart;
            if (!is_zooming) {
                tw = (fit === 1) ? (caselen * 100) : (canvas.width - CONSTANTS.HEADER_WIDTH);
            }

            // Clear background
            ctx.fillStyle = '#181818';
            ctx.fillRect(CONSTANTS.HEADER_WIDTH - 1, ty, canvas.width - CONSTANTS.HEADER_WIDTH, th);
            ctx.beginPath();
            ctx.lineWidth = 1;

            if (t.type === 1) { // Wave type
                let isfirst = true;
                // Ensure at least 100 samples per pixel
                let inc = parseInt(t.prev.length / tw / 100);
                if (inc < 1) inc = 1;

                // Calculate starting index
                let sidx = parseInt((CONSTANTS.HEADER_WIDTH - tx) * t.prev.length / tw);
                if (sidx < 0) sidx = 0;

                for (let idx = sidx, l = t.prev.length; idx < l; idx += inc) {
                    // Skip zeros
                    if (t.prev[idx] === 0) continue;

                    const px = tx + ((idx * tw) / (t.prev.length));
                    if (px <= CONSTANTS.HEADER_WIDTH) {
                        continue;
                    }
                    if (px >= canvas.width) {
                        break;
                    }

                    // Draw points with values 1-255
                    const py = ty + th * (255 - t.prev[idx]) / 254;
                    if (isfirst) {
                        isfirst = false;
                        ctx.moveTo(px, py);
                    }
                    ctx.lineTo(px, py);
                }
            } else if (t.type === 2) { // Numeric type
                for (let idx in t.data) {
                    const dtval = t.data[idx];
                    const dt = parseFloat(dtval[0]);
                    const px = tx + dt / caselen * tw;

                    if (px <= CONSTANTS.HEADER_WIDTH) continue;
                    if (px >= canvas.width) break;

                    const val = parseFloat(dtval[1]);
                    if (val <= t.mindisp) continue;

                    let displayVal = val;
                    if (displayVal >= t.maxdisp) displayVal = t.maxdisp;

                    let py = ty + th - (displayVal - t.mindisp) * th / (t.maxdisp - t.mindisp);
                    if (py < ty) py = ty;
                    else if (py > ty + th) py = ty + th;

                    ctx.moveTo(px, py);
                    ctx.lineTo(px, ty + th);
                }
            }

            ctx.strokeStyle = vf.get_color(tid);
            ctx.stroke();

            // Draw bottom line
            ctx.lineWidth = 0.5;
            ctx.strokeStyle = '#808080';
            ctx.beginPath();
            ctx.moveTo(CONSTANTS.HEADER_WIDTH, ty + th);
            ctx.lineTo(canvas.width, ty + th);
            ctx.stroke();
        }

        function initCanvas() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#181818';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.font = '100 12px arial';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';

            let ty = CONSTANTS.DEVICE_HEIGHT;
            let lastdname = '';

            for (let i in vf.sorted_tids) {
                const tid = vf.sorted_tids[i];
                const t = vf.trks[tid];
                const dname = t.dname;

                // Draw device name
                if (dname !== lastdname) {
                    ctx.fillStyle = '#505050';
                    ctx.fillRect(0, ty, canvas.width, CONSTANTS.DEVICE_HEIGHT);

                    // Device name text
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(dname, 8, ty + CONSTANTS.DEVICE_HEIGHT - 7);

                    ty += CONSTANTS.DEVICE_HEIGHT;
                    lastdname = dname;
                }

                // Draw track name field
                ctx.fillStyle = '#464646';
                ctx.fillRect(0, ty, CONSTANTS.HEADER_WIDTH, t.th);

                // Track name text
                ctx.fillStyle = vf.get_color(tid);
                const tname = t.name;
                ctx.fillText(tname, 8, ty + 20);

                // Loading text
                ctx.textAlign = 'left';
                ctx.fillStyle = '#808080';
                ctx.fillText('LOADING...', CONSTANTS.HEADER_WIDTH + 10, ty + CONSTANTS.DEVICE_HEIGHT - 7);

                ty += t.th;
            }
        }

        function drawAllTracks() {
            drawTime();
            for (let i in vf.sorted_tids) {
                const tid = vf.sorted_tids[i];
                drawTrack(tid);
            }
        }

        // Event handlers
        function setupEventHandlers() {
            $(canvas).bind('mouseup', function (e) {
                if (!$(canvas).is(":visible")) return;
                e = e.originalEvent;
                dragx = -1;
                dragy = -1;
            });

            $(canvas).bind('mousedown', function (e) {
                if (!$(canvas).is(":visible")) return;
                e = e.originalEvent;
                dragx = e.x;
                dragy = e.y;
                dragty = canvas.parentNode.scrollTop;
                dragtx = tx;
            });

            $(canvas).bind('mousewheel', function (e) {
                if (!$(canvas).is(":visible")) return;
                is_zooming = true;
                e = e.originalEvent;
                const wheel = Math.sign(e.wheelDelta);
                if (e.altKey) return;
                if (e.x < CONSTANTS.HEADER_WIDTH) return;

                const ratio = 1.5;
                if (wheel >= 1) {
                    tw *= ratio;
                    tx = e.x - (e.x - tx) * ratio;
                } else if (wheel < 1) { // ZOOM OUT
                    tw /= ratio;
                    tx = e.x - (e.x - tx) / ratio;
                }

                initCanvas();
                drawAllTracks();
                e.preventDefault();
            });

            $(canvas).bind('mousemove', function (e) {
                if (!$(canvas).is(":visible")) return;
                e = e.originalEvent;
                if (dragx === -1) { // No active drag
                    return;
                }

                // Handle dragging
                canvas.parentNode.scrollTop = dragty + (dragy - e.y);
                offset = canvas.parentNode.scrollTop - 35;
                tx = dragtx + (e.x - dragx);
                drawAllTracks();
            });
        }

        function onResizeWindow() {
            if (!$(canvas).is(":visible")) return;

            canvas.width = parseInt(canvas.parentNode.parentNode.clientWidth);
            canvas.style.width = canvas.width + 'px';

            $("#div_preview").css("width", canvas.width + "px");

            initCanvas();
            drawAllTracks();
        }

        function fitTrackview(fitType) {
            // fit width: fitType = 0
            // fit 100px: fitType = 1
            is_zooming = false;
            tx = CONSTANTS.HEADER_WIDTH;
            fit = fitType;
            drawAllTracks();
            return true;
        }

        // Public API
        return {
            initialize: function (vitalFile, canvasElement) {
                vf = vitalFile;
                canvas = canvasElement;
                ctx = canvas.getContext('2d');

                // Reset state
                is_zooming = false;
                tx = CONSTANTS.HEADER_WIDTH;

                // Setup
                canvas.width = parseInt(canvas.parentNode.parentNode.clientWidth);
                setupEventHandlers();

                initCanvas();
                drawAllTracks();
            },
            drawTrack: drawTrack,
            fitTrackview: fitTrackview,
            onResize: onResizeWindow
        };
    })();

    // VitalFile class - handles loading and parsing vital files
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

    // Helper functions for file parsing
    function typedArrayToBuffer(array) {
        return array.buffer.slice(0, array.byteLength);
    }

    function arrayBufferToString(buffer) {
        const arr = new Uint8Array(buffer);
        return String.fromCharCode.apply(String, arr);
    }

    function buf2str(buf, pos) {
        const strlen = new Uint32Array(buf.slice(pos, pos + 4))[0];
        let npos = pos + 4;
        const arr = new Uint8Array(buf.slice(npos, npos + strlen));
        const str = String.fromCharCode.apply(String, arr);
        npos += strlen;
        return [str, npos];
    }

    function parse_fmt(fmt) {
        if (fmt === 1) return ["f", 4];
        else if (fmt === 2) return ["d", 8];
        else if (fmt === 3) return ["b", 1];
        else if (fmt === 4) return ["B", 1];
        else if (fmt === 5) return ["h", 2];
        else if (fmt === 6) return ["H", 2];
        else if (fmt === 7) return ["l", 4];
        else if (fmt === 8) return ["L", 4];
        return ["", 0];
    }

    function buf2data(buf, pos, size, len, signed = false, type = "") {
        let res;
        const slice = buf.slice(pos, pos + size * len);

        switch (size) {
            case 1:
                res = signed ? new Int8Array(slice) : new Uint8Array(slice);
                break;
            case 2:
                res = signed ? new Int16Array(slice) : new Uint16Array(slice);
                break;
            case 4:
                if (type === "float") {
                    res = new Float32Array(slice);
                } else {
                    res = signed ? new Int32Array(slice) : new Uint32Array(slice);
                }
                break;
            case 8:
                res = new Float64Array(slice);
                break;
        }

        const npos = pos + (size * len);
        if (len === 1) res = res[0];
        return [res, npos];
    }

    // Utility function for displaying progress
    function _progress(filename, offset, datalen) {
        return new Promise(async resolve => {
            const percentage = (offset / datalen * 100).toFixed(2);
            await preloader(filename, "PARSING...", percentage)
                .then(resolve);
        });
    }

    function preloader(filename, msg = 'LOADING...', percentage = 0) {
        return new Promise(resolve => {
            setTimeout(function () {
                let canvas, ctx;

                if (window.view === "moni") {
                    $("#file_preview").hide();
                    $("#fit_width").hide();
                    $("#fit_100px").hide();
                    $("#moni_preview").show();
                    $("#moni_control").show();
                    $("#convert_view").attr("onclick", "vf.draw_trackview()").html("Track View");
                    canvas = document.getElementById('moni_preview');
                    ctx = canvas.getContext('2d');
                } else {
                    $("#moni_preview").hide();
                    $("#moni_control").hide();
                    $("#file_preview").show();
                    $("#fit_width").show();
                    $("#fit_100px").show();
                    $("#convert_view").attr("onclick", "vf.draw_moniview()").html("Monitor View");
                    canvas = document.getElementById('file_preview');
                    ctx = canvas.getContext('2d');
                }

                canvas.width = parseInt(canvas.parentNode.parentNode.clientWidth);
                canvas.height = window.innerHeight - 33;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#181818';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.font = '100 30px arial';
                ctx.fillStyle = '#ffffff';
                const mtext = ctx.measureText(msg);
                ctx.fillText(msg, (canvas.width - mtext.width) / 2, (canvas.height - 50) / 2);

                if (percentage > 0) {
                    ctx.fillStyle = '#595959';
                    ctx.fillRect((canvas.width - 300) / 2, (canvas.height) / 2, 300, 3);
                    const pw = percentage * 3;
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect((canvas.width - 300) / 2, (canvas.height) / 2, pw, 3);
                }

                $("#span_preview_caseid").html(filename);
                $("#div_preview").css('display', '');
                resolve();
            }, 100);
        });
    }

    // VitalFile prototype methods
    VitalFile.prototype = {
        load_vital: async function (file) {
            const self = this;
            const fileReader = new FileReader();
            const progress = 0;

            fileReader.readAsArrayBuffer(file);
            fileReader.onloadend = async function (e) {
                if (e.target.error) return;

                let data = pako.inflate(e.target.result);
                data = typedArrayToBuffer(data);
                let pos = 0;
                const header = true;

                const sign = arrayBufferToString(data.slice(0, 4));
                pos += 4;

                if (sign !== "VITA") throw new Error("invalid vital file");

                pos += 4;
                let headerlen;
                [headerlen, pos] = buf2data(data, pos, 2, 1);
                pos += headerlen;

                console.time("parsing");
                console.log("Unzipped: " + data.byteLength);
                await _progress(self.filename, pos, data.byteLength);

                let flag = data.byteLength / 15.0;

                while (pos + 5 < data.byteLength) {
                    let packet_type, packet_len;
                    [packet_type, pos] = buf2data(data, pos, 1, 1, true);
                    [packet_len, pos] = buf2data(data, pos, 4, 1);

                    const packet = data.slice(pos - 5, pos + packet_len);
                    if (data.byteLength < pos + packet_len) {
                        break;
                    }

                    const data_pos = pos;
                    let ppos = 5;

                    if (packet_type === 9) { // devinfo
                        let did, type, name, port;
                        [did, ppos] = buf2data(packet, ppos, 4, 1);
                        port = "";
                        [type, ppos] = buf2str(packet, ppos);
                        [name, ppos] = buf2str(packet, ppos);
                        [port, ppos] = buf2str(packet, ppos);
                        self.devs[did] = { "name": name, "type": type, "port": port };
                    } else if (packet_type === 0) { // trkinfo
                        let tid, trktype, fmt, did, col, montype, unit, gain, offset, srate, mindisp, maxdisp, tname;
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
                            "gain": gain, "offset": offset, "did": did, "recs": []
                        };
                    } else if (packet_type === 1) { // rec
                        ppos += 2;
                        let dt, tid;
                        [dt, ppos] = buf2data(packet, ppos, 8, 1);
                        [tid, ppos] = buf2data(packet, ppos, 2, 1);

                        if (self.dtstart === 0 || (dt > 0 && dt < self.dtstart)) self.dtstart = dt;
                        if (dt > self.dtend) self.dtend = dt;

                        const trk = self.trks[tid];
                        const fmtlen = 4;

                        if (trk.type === 1) { // wav
                            const [fmtcode, fmtlen] = parse_fmt(trk.fmt);
                            let nsamp;
                            [nsamp, ppos] = buf2data(packet, ppos, 4, 1);

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
                            const [fmtcode, fmtlen] = parse_fmt(trk.fmt);
                            let val;

                            if (fmtcode === "f") {
                                [val, ppos] = buf2data(packet, ppos, fmtlen, 1, true, "float");
                            } else if (fmtcode === "d") {
                                [val, ppos] = buf2data(packet, ppos, fmtlen, 1);
                            } else if (fmtcode === "b" || fmtcode === "h" || fmtcode === "l") {
                                [val, ppos] = buf2data(packet, ppos, fmtlen, 1, true);
                            } else if (fmtcode === "B" || fmtcode === "H" || fmtcode === "L") {
                                [val, ppos] = buf2data(packet, ppos, fmtlen, 1);
                            }

                            trk.recs.push({ "dt": dt, "val": val });
                        } else if (trk.type === 5) { // str
                            ppos += 4;
                            let s;
                            [s, ppos] = buf2str(packet, ppos);
                            trk.recs.push({ "dt": dt, "val": s });
                        }
                    } else if (packet_type === 6) { // cmd
                        let cmd;
                        [cmd, ppos] = buf2data(packet, ppos, 1, 1, true);

                        if (cmd === 6) { // reset events
                            const evt_trk = self.find_track("/EVENT");
                            if (evt_trk) evt_trk.recs = [];
                        } else if (cmd === 5) { // trk order
                            let cnt;
                            [cnt, ppos] = buf2data(packet, ppos, 2, 1);
                            self.trkorder = new Uint16Array(packet.slice(ppos, ppos + cnt * 2));
                        }
                    }

                    pos = data_pos + packet_len;

                    if (pos >= flag && data.byteLength > 31457280) { // file larger than 30mb
                        await _progress(self.filename, pos, data.byteLength)
                            .then(async function () {
                                flag += data.byteLength / 15.0;
                            });
                    }
                }

                console.timeEnd("parsing");
                await _progress(self.filename, pos, data.byteLength)
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
            $("#convert_view").attr("onclick", "vf.draw_moniview()").html("Monitor View");

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
            $("#convert_view").attr("onclick", "vf.draw_trackview()").html("Track View");
        }
    };

    // Main initialization
    function initializeApp() {
        // Set up window resize event handlers
        window.addEventListener('resize', function () {
            if (window.view === "moni") {
                MonitorView.onResize();
            } else {
                TrackView.onResize();
            }
        });

        // Set up drag and drop file handling
        const dropOverlay = $("#drop_overlay");
        const dropMessage = $("#drop_message");
        const fileInput = $("#file_input");

        dropMessage.show();
        dropOverlay.show();

        dropMessage.on("click", function () {
            fileInput.click();
        });

        fileInput.on("change", function (event) {
            handleFileInput(event.target.files);
        });

        $(document).on("dragenter", function (event) {
            event.preventDefault();
            event.stopPropagation();
            dropOverlay.addClass("active");
            dropMessage.addClass("d-none");
        });

        $(document).on("dragover", function (event) {
            event.preventDefault();
            event.stopPropagation();
        });

        $(document).on("dragleave", function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (event.originalEvent.clientX === 0 && event.originalEvent.clientY === 0) {
                dropOverlay.removeClass("active");
                dropMessage.removeClass("d-none");
            }
        });

        $(document).on("drop", function (event) {
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

                if (!window.files.hasOwnProperty(filename)) {
                    try {
                        window.isPaused = true;

                        const blob = new Blob([arrayBuffer]);
                        window.files[filename] = new VitalFile(blob, filename);
                        console.log(`✅ Successfully loaded: ${filename}`);
                    } catch (e) {
                        console.error(`❌ Failed to parse file: ${filename}`, e);
                        alert("⚠️ Failed to load the selected file.");
                    }
                } else {
                    window.files[filename].draw_trackview();
                }
            };

            reader.readAsArrayBuffer(file);
            dropMessage.hide();
        }
    }

    // Initialize the app when document is ready
    $(document).ready(function () {
        initializeApp();
    });

    // Public API for external interaction
    return {
        // Monitor view controls
        pauseResume: function (pause) {
            return MonitorView.pauseResume(pause);
        },
        rewind: function (seconds) {
            return MonitorView.rewind(seconds);
        },
        proceed: function (seconds) {
            return MonitorView.proceed(seconds);
        },
        slideTo: function (seconds) {
            return MonitorView.slideTo(seconds);
        },
        slideOn: function (seconds) {
            return MonitorView.slideOn(seconds);
        },
        setPlayspeed: function (val) {
            return MonitorView.setPlayspeed(val);
        },
        getCaselen: function () {
            return MonitorView.getCaselen();
        },

        // Track view controls
        fitTrackview: function (type) {
            return TrackView.fitTrackview(type);
        },

        // Export VitalFile class for use outside module
        VitalFile: VitalFile
    };
})();

// Expose the module to the global scope
window.VitalFileViewer = VitalFileViewer;