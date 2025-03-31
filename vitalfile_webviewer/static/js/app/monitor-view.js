/**
 * monitor-view.js
 * Monitor view module for VitalFile viewer
 */

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

    // Drawing functions
    function montypeGroup() {
        // Initialize groupings
        montype_groupids = {};
        montype_trks = {};
        groupid_trks = {};

        // Map monitor types to group IDs
        for (let groupid in CONSTANTS.GROUPS) {
            const group = CONSTANTS.GROUPS[groupid];
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

    function getPlaytime() {
        const date = new Date((vf.dtstart + dtplayer) * 1000);
        return ("0" + date.getHours()).substr(-2) + ":" +
            ("0" + date.getMinutes()).substr(-2) + ":" +
            ("0" + date.getSeconds()).substr(-2);
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
            Utils.roundedRect(ctx, px, 36 * scale, 12 * scale, 12 * scale, 3);
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

        const layout = CONSTANTS.PARAM_LAYOUTS[group.paramLayout];
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
                    value = Utils.formatValue(value, track.type);
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
        Utils.roundedRect(ctx, rcx, rcy, CONSTANTS.PAR_WIDTH * scale, CONSTANTS.PAR_HEIGHT * scale);
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
        for (let groupid in CONSTANTS.GROUPS) {
            const group = CONSTANTS.GROUPS[groupid];
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
        for (let groupid in CONSTANTS.GROUPS) {
            const group = CONSTANTS.GROUPS[groupid];

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
        Utils.updateFrame(redraw);

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
            $("#casetime").html(Utils.formatTime(Math.floor(dtplayer)) + " / " + Utils.formatTime(Math.floor(caselen)));
            draw();
        }
    }

    // Event handlers
    function onResizeWindow() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight - 28;
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = (window.innerHeight - 28) + 'px';
        canvas_width = canvas.width;
        draw();
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
        $("#casetime").html(Utils.formatTime(Math.floor(seconds)) + " / " + Utils.formatTime(Math.floor(caselen)));
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
            Utils.updateFrame(redraw);
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

// Export to global scope
window.MonitorView = MonitorView;