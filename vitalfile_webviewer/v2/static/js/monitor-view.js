/**
 * MonitorView Module
 * Responsible for the monitor view rendering and controls
 */
import { MONTYPES, MONITOR_GROUPS, PARAM_LAYOUTS, PAR_WIDTH, PAR_HEIGHT } from './constants.js';
import { formatTime, formatValue } from './utils.js';

/**
 * MonitorView class
 * Handles rendering and interaction with the monitor view
 */
export class MonitorView {
    /**
     * Create a new MonitorView
     * @param {Object} vitalFile - The VitalFile instance to visualize
     */
    constructor(vitalFile) {
        this.vitalFile = vitalFile;

        // Canvas setup
        this.canvas = document.getElementById('moni_preview');
        this.ctx = this.canvas.getContext('2d');

        // Viewport dimensions
        this.canvas_width = 800;

        // Monitor view state
        this.fast_forward = 1.0;
        this.montype_groupids = {};
        this.montype_trks = {};
        this.groupid_trks = {};
        this.dtplayer = 0;
        this.isPaused = true;
        this.isSliding = false;
        this.scale = 1;
        this.caselen = 0;
        this.lastRender = 0;

        // Sizing constants taken from global constants

        // Bind event handlers
        this.bindEventHandlers();
    }

    /**
     * Draw the monitor view
     */
    drawMonitorView() {
        console.log('moniview')
        // Set up view
        document.getElementById('file_preview').style.display = 'none';
        document.getElementById('moni_preview').style.display = 'block';
        document.getElementById('moni_control').style.display = 'block';
        document.getElementById('fit_width').style.display = 'none';
        document.getElementById('fit_100px').style.display = 'none';

        // Toggle view button
        const convertViewBtn = document.getElementById('convert_view');
        convertViewBtn.setAttribute('onclick', 'app.vitalFileManager.switchView("track")');
        convertViewBtn.textContent = 'Track View';

        // Initialize view
        this.fast_forward = 1.0;
        this.montype_groupids = {};
        this.montype_trks = {};
        this.groupid_trks = {};
        this.dtplayer = 0;
        this.isPaused = true;
        this.caselen = this.vitalFile.dtend - this.vitalFile.dtstart;

        // Set up slider
        const slider = document.getElementById('moni_slider');
        slider.setAttribute('max', this.caselen);
        slider.setAttribute('min', 0);
        slider.value = 0;

        // Set up monitor display
        this.montype_group();
        this.resizeMonitorView();
        this.draw();

        // Start animation frame
        this.updateFrame(this.redraw.bind(this));
    }

    /**
     * Resize the monitor view
     */
    resizeMonitorView() {
        const containerWidth = window.innerWidth;
        this.canvas_width = containerWidth;
        this.canvas.width = containerWidth;
        this.canvas.height = window.innerHeight - 28;

        this.scale = 1;
        if (this.vitalFile.canvas_height && this.canvas.height < this.vitalFile.canvas_height) {
            this.scale = this.canvas.height / this.vitalFile.canvas_height;
        }

        // Set container width
        document.getElementById('div_preview').style.width = containerWidth + "px";
        document.getElementById('moni_control').style.width = containerWidth + "px";

        // Redraw
        this.draw();
    }

    /**
     * Group monitor types
     */
    montype_group() {
        // Create montype_groupids mapping
        for (const groupid in MONITOR_GROUPS) {
            const group = MONITOR_GROUPS[groupid];
            for (let i in group.param) {
                let montype = group.param[i];
                this.montype_groupids[montype] = groupid;
            }
            if (group.wav) {
                this.montype_groupids[group.wav] = groupid;
            }
        }

        // Collect tracks by montype and groupid
        for (const tid in this.vitalFile.trks) {
            const trk = this.vitalFile.trks[tid];
            const montype = this.vitalFile.get_montype(tid);
            if (montype !== "" && !this.montype_trks[montype]) {
                this.montype_trks[montype] = trk;
            }

            const groupid = this.montype_groupids[montype];
            if (groupid) {
                if (!this.groupid_trks[groupid]) {
                    this.groupid_trks[groupid] = [];
                }
                this.groupid_trks[groupid].push(trk);
            }
        }
    }

    /**
     * Draw the monitor view
     */
    draw() {
        // Set canvas dimensions
        this.canvas_width = window.innerWidth;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight - 28;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#181818';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();

        // Set scale
        this.scale = 1;
        if (this.vitalFile.canvas_height && this.canvas.height < this.vitalFile.canvas_height) {
            this.scale = this.canvas.height / this.vitalFile.canvas_height;
        }

        // Update container dimensions
        document.getElementById('div_preview').style.width = this.canvas.width + "px";
        document.getElementById('moni_control').style.width = this.canvas.width + "px";

        // Draw content
        let rcx = 0;
        let rcy = 60 * this.scale;
        const wav_width = this.canvas_width - PAR_WIDTH * this.scale;

        // Draw title and header info
        this.draw_title(rcx);

        // Draw waveform groups
        const isTrackDrawn = new Set();
        for (const groupid in MONITOR_GROUPS) {
            const group = MONITOR_GROUPS[groupid];
            if (!group.wav) continue;

            const wavname = group.name;
            const wavtrack = this.montype_trks[group.wav];
            if (!wavtrack) continue;

            if (wavtrack && wavtrack.srate && wavtrack.prev && wavtrack.prev.length) {
                isTrackDrawn.add(wavtrack.tid);
            }

            // Draw parameter panel
            this.draw_param(group, isTrackDrawn, rcx + wav_width, rcy);

            // Draw waveform
            this.ctx.lineWidth = 2.5;
            this.ctx.strokeStyle = group.fgColor;
            this.draw_wave(wavtrack, rcx, rcy, wav_width, PAR_HEIGHT * this.scale);

            // Draw bottom separator line
            this.ctx.lineWidth = 0.5;
            this.ctx.strokeStyle = '#808080';
            this.ctx.beginPath();
            this.ctx.moveTo(rcx, rcy + PAR_HEIGHT * this.scale);
            this.ctx.lineTo(rcx + wav_width, rcy + PAR_HEIGHT * this.scale);
            this.ctx.stroke();

            // Draw wave name
            this.ctx.font = (14 * this.scale) + 'px Arial';
            this.ctx.fillStyle = 'white';
            this.ctx.textAlign = 'left';
            this.ctx.textBaseline = 'top';
            this.ctx.fillText(wavname || wavtrack.name, rcx + 3, rcy + 4);

            rcy += PAR_HEIGHT * this.scale;
        }

        // Draw events
        const evttrk = this.vitalFile.find_track("/EVENT");
        if (evttrk) {
            let cnt = 0;
            this.ctx.font = (14 * this.scale) + 'px arial';
            this.ctx.textAlign = 'left';
            this.ctx.textBaseline = 'alphabetic';

            const evts = evttrk.data;
            for (let eventIdx = 0; eventIdx < evts.length; eventIdx++) {
                const rec = evts[eventIdx];
                const dt = rec[0];
                const value = rec[1];

                if (dt > this.dtplayer) {
                    break;
                }

                // Format event time
                const date = new Date((dt + this.vitalFile.dtstart) * 1000);
                const hours = date.getHours();
                const minutes = ("0" + date.getMinutes()).substr(-2);

                // Draw event time
                this.ctx.fillStyle = '#4EB8C9';
                this.ctx.fillText(hours + ':' + minutes, rcx + wav_width + 3, rcy + (20 + cnt * 20) * this.scale);

                // Draw event value
                this.ctx.fillStyle = 'white';
                this.ctx.fillText(value, rcx + wav_width + 45, rcy + (20 + cnt * 20) * this.scale);

                cnt += 1;
            }
        }

        // Draw non-wave groups
        rcx = 0;
        let is_first_line = true;
        for (const groupid in MONITOR_GROUPS) {
            const group = MONITOR_GROUPS[groupid];

            // Skip groups with waveforms (already processed)
            const wavtrack = this.montype_trks[group.wav];
            if (wavtrack && wavtrack.prev && wavtrack.prev.length) continue;

            // Draw parameter panel
            if (!this.draw_param(group, isTrackDrawn, rcx, rcy)) continue;

            // Move to next position
            rcx += PAR_WIDTH * this.scale;
            if (rcx > this.canvas_width - PAR_WIDTH * this.scale * 2) {
                rcx = 0;
                rcy += PAR_HEIGHT * this.scale;
                if (!is_first_line) break;
                is_first_line = false;
            }
        }

        this.ctx.restore();

        // Update canvas height if needed
        if (!this.vitalFile.canvas_height) {
            this.vitalFile.canvas_height = rcy + 3 * PAR_HEIGHT * this.scale;
        }
        if (rcy + PAR_HEIGHT * this.scale > this.vitalFile.canvas_height) {
            this.vitalFile.canvas_height = rcy + 3 * PAR_HEIGHT * this.scale;
        }
    }

    /**
     * Draw title section
     * @param {number} rcx - X coordinate
     */
    draw_title(rcx) {
        // Draw bed name
        this.ctx.font = (40 * this.scale) + 'px arial';
        this.ctx.fillStyle = '#ffffff';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'alphabetic';
        this.ctx.fillText(this.vitalFile.bedname, rcx + 4, 45 * this.scale);

        let px = rcx + this.ctx.measureText(this.vitalFile.bedname).width + 22;

        // Draw current play time
        const casetime = this.get_playtime();
        this.ctx.font = 'bold ' + (24 * this.scale) + 'px arial';
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'alphabetic';
        this.ctx.fillText(casetime, (rcx + this.canvas_width) / 2 - 50, 29 * this.scale);

        // Draw device list
        this.ctx.font = (15 * this.scale) + 'px arial';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'alphabetic';

        for (const did in this.vitalFile.devs) {
            const dev = this.vitalFile.devs[did];
            if (!dev.name) continue;

            // Draw device indicator box
            this.ctx.fillStyle = '#348EC7';
            this.roundedRect(this.ctx, px, 36 * this.scale, 12 * this.scale, 12 * this.scale, 3);
            this.ctx.fill();

            px += 17 * this.scale;

            // Draw device name
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.fillText(dev.name.substr(0, 7), px, 48 * this.scale);
            px += this.ctx.measureText(dev.name.substr(0, 7)).width + 13 * this.scale;
        }
    }

    /**
     * Draw waveform
     * @param {Object} track - Track to draw
     * @param {number} rcx - X coordinate
     * @param {number} rcy - Y coordinate
     * @param {number} wav_width - Waveform width
     * @param {number} rch - Waveform height
     */
    draw_wave(track, rcx, rcy, wav_width, rch) {
        if (track && track.srate && track.prev && track.prev.length) {
            this.ctx.beginPath();

            let lastx = rcx;
            let py = 0;
            let is_first = true;

            // Calculate starting index and increments
            let idx = parseInt(this.dtplayer * track.srate);
            let inc = track.srate / 100;
            let px = 0;

            // Draw waveform points
            for (let l = idx; l < idx + (rcx + wav_width) * inc && l < track.prev.length; l++, px += (1.0 / inc)) {
                let value = track.prev[l];
                if (value == 0) continue;

                if (px > rcx + wav_width) break;

                py = rcy + rch * (255 - value) / 254;

                // Ensure point is within bounds
                if (py < rcy) py = rcy;
                if (py > rcy + rch) py = rcy + rch;

                // Handle first point or gaps
                if (is_first) {
                    if (px < rcx + 10) {
                        this.ctx.moveTo(rcx, py);
                        this.ctx.lineTo(px, py);
                    } else {
                        this.ctx.moveTo(px, py);
                    }
                    is_first = false;
                } else {
                    if (px - lastx > rcx + 10) {
                        // Handle gaps in data
                        this.ctx.stroke();
                        this.ctx.beginPath();
                        this.ctx.moveTo(px, py);
                    } else {
                        this.ctx.lineTo(px, py);
                    }
                }

                lastx = px;
            }

            // Add final point to the right edge if needed
            if (!is_first && px > rcx + wav_width - 10) {
                this.ctx.lineTo(rcx + wav_width, py);
            }

            this.ctx.stroke();

            // Draw cursor indicator
            if (!is_first) {
                if (px > rcx + wav_width - 4) {
                    this.ctx.fillStyle = 'white';
                    this.ctx.fillRect(rcx + wav_width - 4, py - 2, 4, 4);
                }
            }
        }
    }

    /**
     * Draw parameter panel
     * @param {Object} group - Parameter group
     * @param {Set} isTrackDrawn - Set of tracks already drawn
     * @param {number} rcx - X coordinate
     * @param {number} rcy - Y coordinate
     * @returns {boolean} - True if panel was drawn
     */
    draw_param(group, isTrackDrawn, rcx, rcy) {
        let valueExists = false;

        if (!group || !group.param) return false;

        const layout = PARAM_LAYOUTS[group.paramLayout];
        const nameValueArray = [];

        if (!layout) return false;

        // Collect parameter values
        for (let i in group.param) {
            let montype = group.param[i];
            const track = this.montype_trks[montype];

            if (track && track.data) {
                if (isTrackDrawn) isTrackDrawn.add(track.tid);

                let value = null;
                for (let idx = 0; idx < track.data.length; idx++) {
                    const rec = track.data[idx];
                    const dt = rec[0];

                    if (dt > this.dtplayer) {
                        if (idx > 0 && track.data[idx - 1][0] > this.dtplayer - 300) {
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

        // If no values exist, don't draw the panel
        if (!valueExists) return false;

        // Handle group name
        if (group.name) {
            const name = group.name;
            if (name.substring(0, 5) === 'AGENT' && nameValueArray.length > 1) {
                if (nameValueArray[1].value.toUpperCase() === 'DESF') {
                    nameValueArray[1].value = 'DES';
                } else if (nameValueArray[1].value.toUpperCase() === 'ISOF') {
                    nameValueArray[1].value = 'ISO';
                } else if (nameValueArray[1].value.toUpperCase() === 'ENFL') {
                    nameValueArray[1].value = 'ENF';
                }
            }
        }

        // Handle BP layout
        if (group.paramLayout === 'BP' && nameValueArray.length > 2) {
            nameValueArray[0].name = group.name || '';
            nameValueArray[0].value =
                (nameValueArray[0].value ? Math.round(nameValueArray[0].value) : ' ') +
                (nameValueArray[1].value ? ('/' + Math.round(nameValueArray[1].value)) : ' ');
            nameValueArray[2].value = nameValueArray[2].value ? Math.round(nameValueArray[2].value) : '';
            nameValueArray[1] = nameValueArray[2];
            nameValueArray.pop();
        } else if (nameValueArray.length > 0 && !nameValueArray[0].name) {
            nameValueArray[0].name = group.name || '';
        }

        // Draw each parameter value according to layout
        for (let idx = 0; idx < layout.length && idx < nameValueArray.length; idx++) {
            const layoutElem = layout[idx];

            // Draw value
            if (layoutElem.value) {
                this.ctx.font = (layoutElem.value.fontsize * this.scale) + 'px arial';
                this.ctx.fillStyle = group.fgColor;

                // Set special colors
                if (nameValueArray[0].name == "HPI") this.ctx.fillStyle = "#00FFFF";
                if (group.name && group.name.substring(0, 5) === 'AGENT' && nameValueArray.length > 1) {
                    if (nameValueArray[1].value === 'DES') {
                        this.ctx.fillStyle = '#2296E6';
                    } else if (nameValueArray[1].value === 'ISO') {
                        this.ctx.fillStyle = '#DDA0DD';
                    } else if (nameValueArray[1].value === 'ENF') {
                        this.ctx.fillStyle = '#FF0000';
                    }
                }

                this.ctx.textAlign = layoutElem.value.align || 'left';
                this.ctx.textBaseline = layoutElem.value.baseline || 'alphabetic';
                this.ctx.fillText(
                    nameValueArray[idx].value,
                    rcx + layoutElem.value.x * this.scale,
                    rcy + layoutElem.value.y * this.scale
                );
            }

            // Draw name
            if (layoutElem.name) {
                this.ctx.font = (14 * this.scale) + 'px arial';
                this.ctx.fillStyle = 'white';
                this.ctx.textAlign = layoutElem.name.align || 'left';
                this.ctx.textBaseline = layoutElem.name.baseline || 'alphabetic';

                const str = nameValueArray[idx].name;
                const measuredWidth = this.ctx.measureText(str).width;
                const maxWidth = 75;

                // Scale text if it's too wide
                if (measuredWidth > maxWidth) {
                    this.ctx.save();
                    this.ctx.scale(maxWidth / measuredWidth, 1);
                    this.ctx.fillText(
                        str,
                        (rcx + layoutElem.name.x * this.scale) * measuredWidth / maxWidth,
                        rcy + layoutElem.name.y * this.scale
                    );
                    this.ctx.restore();
                } else {
                    this.ctx.fillText(
                        str,
                        rcx + layoutElem.name.x * this.scale,
                        rcy + layoutElem.name.y * this.scale
                    );
                }
            }
        }

        // Draw border
        this.ctx.strokeStyle = '#808080';
        this.ctx.lineWidth = 0.5;
        this.roundedRect(this.ctx, rcx, rcy, PAR_WIDTH * this.scale, PAR_HEIGHT * this.scale);
        this.ctx.stroke();

        return true;
    }

    /**
     * Get current playback time as formatted string
     * @returns {string} - Formatted time
     */
    get_playtime() {
        const date = new Date((this.vitalFile.dtstart + this.dtplayer) * 1000);
        return (
            ("0" + date.getHours()).substr(-2) + ":" +
            ("0" + date.getMinutes()).substr(-2) + ":" +
            ("0" + date.getSeconds()).substr(-2)
        );
    }

    /**
     * Draw rounded rectangle
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} width - Width
     * @param {number} height - Height
     * @param {number} radius - Corner radius
     */
    roundedRect(ctx, x, y, width, height, radius = 0) {
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

    /**
     * Animation frame callback for redrawing
     */
    redraw() {
        // Only proceed if monitor view is visible
        if (document.getElementById('moni_preview').style.display === 'none') return;

        // Schedule next frame
        this.updateFrame(this.redraw.bind(this));

        // Throttle to 30 FPS
        const now = Date.now();
        const diff = now - this.lastRender;

        if (diff > 30) {
            this.lastRender = now;
        } else {
            return;
        }

        // Update playback time
        if (!this.isPaused && !this.isSliding && this.dtplayer < this.caselen) {
            this.dtplayer += (this.fast_forward / 30);
            document.getElementById('moni_slider').value = this.dtplayer;
            document.getElementById('casetime').textContent =
                formatTime(Math.floor(this.dtplayer)) + " / " + formatTime(Math.floor(this.caselen));
            this.draw();
        }
    }

    /**
     * Browser-agnostic animation frame request
     */
    updateFrame(callback) {
        return (window.requestAnimationFrame ||
            window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame ||
            window.oRequestAnimationFrame ||
            function (cb) {
                return window.setTimeout(cb, 1000 / 60);
            })(callback);
    }

    /**
     * Pause or resume playback
     * @param {boolean} pause - Force pause state
     */
    pause_resume(pause = null) {
        if (pause !== null) {
            this.isPaused = pause;
        } else {
            this.isPaused = !this.isPaused;
        }

        // Update UI
        if (this.isPaused) {
            document.getElementById('moni_pause').style.display = 'none';
            document.getElementById('moni_resume').style.display = 'block';
        } else {
            document.getElementById('moni_resume').style.display = 'none';
            document.getElementById('moni_pause').style.display = 'block';
        }
    }

    /**
     * Rewind playback
     * @param {number} seconds - Seconds to rewind (or auto-calculate if null)
     */
    rewind(seconds = null) {
        if (!seconds) {
            seconds = (this.canvas_width - PAR_WIDTH) / 100;
        }

        this.dtplayer -= seconds;
        if (this.dtplayer < 0) this.dtplayer = 0;

        // Update display
        this.draw();
    }

    /**
     * Advance playback
     * @param {number} seconds - Seconds to advance (or auto-calculate if null)
     */
    proceed(seconds = null) {
        if (!seconds) {
            seconds = (this.canvas_width - PAR_WIDTH) / 100;
        }

        this.dtplayer += seconds;
        if (this.dtplayer > this.caselen) {
            this.dtplayer = this.caselen - (this.canvas_width - PAR_WIDTH) / 100;
        }

        // Update display
        this.draw();
    }

    /**
     * Slide to specific time
     * @param {number} seconds - Seconds to move to
     */
    slide_to(seconds) {
        this.dtplayer = parseInt(seconds);
        this.isSliding = false;
        this.draw();
    }

    /**
     * Handle slider drag
     * @param {number} seconds - Current slider position
     */
    slide_on(seconds) {
        document.getElementById('casetime').textContent =
            formatTime(Math.floor(seconds)) + " / " + formatTime(Math.floor(this.caselen));
        this.isSliding = true;
    }

    /**
     * Set playback speed
     * @param {number} val - Speed multiplier
     */
    set_playspeed(val) {
        this.fast_forward = parseInt(val);
    }

    /**
     * Bind event handlers for monitor view controls
     */
    bindEventHandlers() {
        // Slider controls
        document.getElementById('moni_slider').addEventListener('change', (e) => {
            this.slide_to(e.target.value);
        });

        document.getElementById('moni_slider').addEventListener('input', (e) => {
            this.slide_on(e.target.value);
        });

        // Playback controls
        document.getElementById('moni_pause').addEventListener('click', () => {
            this.pause_resume();
        });

        document.getElementById('moni_resume').addEventListener('click', () => {
            this.pause_resume();
        });

        document.getElementById('btn_fast_backward').addEventListener('click', () => {
            this.rewind(this.caselen);
        });

        document.getElementById('btn_step_backward').addEventListener('click', () => {
            this.rewind();
        });

        document.getElementById('btn_step_forward').addEventListener('click', () => {
            this.proceed();
        });

        document.getElementById('btn_fast_forward').addEventListener('click', () => {
            this.proceed(this.caselen);
        });

        // Playback speed
        document.getElementById('play-speed').addEventListener('change', (e) => {
            this.set_playspeed(e.target.value);
        });
    }
}