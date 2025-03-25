/**
 * TrackView Module
 * Responsible for the track view rendering and controls
 */
import { DEVICE_HEIGHT, HEADER_WIDTH } from './constants.js';

/**
 * TrackView class
 * Handles rendering and interaction with the track view
 */
export class TrackView {
    /**
     * Create a new TrackView
     * @param {Object} vitalFile - The VitalFile instance to visualize
     */
    constructor(vitalFile) {
        this.vitalFile = vitalFile;

        // Canvas setup
        this.canvas = document.getElementById('file_preview');
        this.ctx = this.canvas.getContext('2d');

        // Viewport state
        this.tw = 640;             // Track width
        this.tx = HEADER_WIDTH;    // Track x-position
        this.dragx = -1;           // Drag start x
        this.dragy = -1;           // Drag start y
        this.dragty = 0;           // Drag start scroll y
        this.dragtx = 0;           // Drag start track x
        this.offset = -35;         // Vertical offset
        this.is_zooming = false;   // Zoom state
        this.fit = 0;              // Fit mode (0: width, 1: 100px)

        // Bind event handlers
        this.bindEventHandlers();
    }

    /**
     * Draw the track view
     */
    drawTrackView() {
        console.log('trackview')
        // Set up view
        document.getElementById('moni_preview').style.display = 'none';
        document.getElementById('moni_control').style.display = 'none';
        document.getElementById('file_preview').style.display = 'block';
        document.getElementById('fit_width').style.display = 'block';
        document.getElementById('fit_100px').style.display = 'block';

        // Toggle view button
        const convertViewBtn = document.getElementById('convert_view');
        convertViewBtn.setAttribute('onclick', 'app.vitalFileManager.switchView("moni")');
        convertViewBtn.textContent = 'Monitor View';

        // Reset view properties
        this.is_zooming = false;
        this.vitalFile.caselen = this.vitalFile.dtend - this.vitalFile.dtstart;

        // Set canvas dimensions
        const containerWidth = parseInt(this.canvas.parentNode.parentNode.clientWidth);
        this.canvas.width = containerWidth; // Set the canvas property
        this.canvas.style.width = containerWidth + 'px'; // Set the CSS width

        // Initialize and draw
        this.initCanvas();
        this.drawAllTracks();

        // Show preview controls
        if (this.vitalFile.sorted_tids.length > 0) {
            document.getElementById('span_preview_caseid').textContent = this.vitalFile.filename;
            document.getElementById('div_preview').style.display = '';
            document.getElementById('btn_preview').style.display = '';
        }
    }

    /**
     * Resize the track view
     */
    resizeTrackView() {
        if (document.getElementById('file_preview').style.display === 'none') return;

        // Don't set clientWidth directly
        const containerWidth = this.canvas.parentNode.parentNode.clientWidth;
        this.canvas.width = containerWidth;
        this.canvas.style.width = containerWidth + "px";

        document.getElementById('div_preview').style.width = containerWidth + "px";

        this.initCanvas();
        this.drawAllTracks();
    }
    /**
     * Initialize canvas for drawing
     */
    initCanvas() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#181818';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.font = '100 12px arial';
        this.ctx.textBaseline = 'middle';
        this.ctx.textAlign = 'left';

        let ty = DEVICE_HEIGHT;
        let lastdname = '';

        for (let i in this.vitalFile.sorted_tids) {
            const tid = this.vitalFile.sorted_tids[i];
            const t = this.vitalFile.trks[tid];
            const dname = t.dname;

            // Draw device header if this is a new device
            if (dname !== lastdname) {
                this.ctx.fillStyle = '#505050';
                this.ctx.fillRect(0, ty, this.canvas.width, DEVICE_HEIGHT);

                // Device name
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fillText(dname, 8, ty + DEVICE_HEIGHT - 7);

                ty += DEVICE_HEIGHT;
                lastdname = dname;
            }

            // Draw track header
            this.ctx.fillStyle = '#464646';
            this.ctx.fillRect(0, ty, HEADER_WIDTH, t.th);

            // Track name
            this.ctx.fillStyle = this.vitalFile.get_color(tid);
            this.ctx.fillText(t.name, 8, ty + 20);

            // Loading indicator
            this.ctx.textAlign = 'left';
            this.ctx.fillStyle = '#808080';
            this.ctx.fillText('LOADING...', HEADER_WIDTH + 10, ty + DEVICE_HEIGHT - 7);

            ty += t.th;
        }
    }

    /**
     * Draw time ruler at the top of the view
     */
    drawTime() {
        const caselen = this.vitalFile.dtend - this.vitalFile.dtstart;

        // Set track width based on fit mode
        if (!this.is_zooming) {
            this.tw = (this.fit === 1) ? (caselen * 100) : (this.canvas.width - HEADER_WIDTH);
        }

        let ty = 0;

        // Time ruler background and title
        this.ctx.fillStyle = '#464646';
        this.ctx.fillRect(0, ty, this.canvas.width, DEVICE_HEIGHT);
        this.ctx.font = '100 12px arial';
        this.ctx.textBaseline = 'middle';
        this.ctx.textAlign = 'left';
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillText("TIME", 8, ty + DEVICE_HEIGHT - 7);

        ty += 5;

        // Draw time markers and scale
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = "#ffffff";
        this.ctx.textBaseline = 'top';

        const dist = (this.canvas.width - HEADER_WIDTH) / 5;
        for (let i = HEADER_WIDTH; i <= this.canvas.width; i += dist) {
            // Calculate and format time
            const time = this.stotime((i - this.tx) * caselen / this.tw);

            // Align text
            this.ctx.textAlign = "center";
            if (i === HEADER_WIDTH) this.ctx.textAlign = "left";
            if (i === this.canvas.width) {
                this.ctx.textAlign = "right";
                i -= 5;
            }

            // Draw time label
            this.ctx.fillText(time, i, ty);

            // Draw time marker line
            this.ctx.beginPath();
            this.ctx.moveTo(i, 17);
            this.ctx.lineTo(i, DEVICE_HEIGHT);
            this.ctx.stroke();
        }
    }

    /**
     * Draw a single track
     * @param {string} tid - Track ID to draw
     */
    drawTrack(tid) {
        const t = this.vitalFile.trks[tid];

        // Skip if data not available
        if (!t) return;

        const ty = t.ty;
        const th = t.th;
        const caselen = this.vitalFile.dtend - this.vitalFile.dtstart;

        // Set track width based on fit mode
        if (!this.is_zooming) {
            this.tw = (this.fit === 1) ? (caselen * 100) : (this.canvas.width - HEADER_WIDTH);
        }

        // Clear track area
        this.ctx.fillStyle = '#181818';
        this.ctx.fillRect(HEADER_WIDTH - 1, ty, this.canvas.width - HEADER_WIDTH, th);
        this.ctx.beginPath();
        this.ctx.lineWidth = 1;

        if (t.type === 1) {
            // Waveform track
            let isfirst = true;

            // Determine sampling increment for performance
            let inc = parseInt(t.prev.length / this.tw / 100);
            if (inc < 1) inc = 1;

            // Calculate starting index
            let sidx = parseInt((HEADER_WIDTH - this.tx) * t.prev.length / this.tw);
            if (sidx < 0) sidx = 0;

            // Draw waveform points
            for (let idx = sidx, l = t.prev.length; idx < l; idx += inc) {
                // Skip zero points
                if (t.prev[idx] === 0) continue;

                // Calculate pixel coordinates
                const px = this.tx + ((idx * this.tw) / (t.prev.length));
                if (px <= HEADER_WIDTH) continue;
                if (px >= this.canvas.width) break;

                // Calculate y position (normalized to 1-255 range)
                const py = ty + th * (255 - t.prev[idx]) / 254;

                // Handle first point
                if (isfirst) {
                    isfirst = false;
                    this.ctx.moveTo(px, py);
                } else {
                    this.ctx.lineTo(px, py);
                }
            }

        } else if (t.type === 2) {
            // Numeric track
            for (let idx in t.data) {
                const dtval = t.data[idx];
                const dt = parseFloat(dtval[0]);
                const px = this.tx + dt / caselen * this.tw;

                // Skip if outside visible area
                if (px <= HEADER_WIDTH) continue;
                if (px >= this.canvas.width) break;

                // Calculate value and position
                const val = parseFloat(dtval[1]);
                if (val <= t.mindisp) continue;

                let displayVal = val;
                if (displayVal >= t.maxdisp) displayVal = t.maxdisp;

                let py = ty + th - (displayVal - t.mindisp) * th / (t.maxdisp - t.mindisp);

                // Ensure point is within bounds
                if (py < ty) py = ty;
                else if (py > ty + th) py = ty + th;

                // Draw vertical line
                this.ctx.moveTo(px, py);
                this.ctx.lineTo(px, ty + th);
            }
        }

        // Set track color and draw path
        this.ctx.strokeStyle = this.vitalFile.get_color(tid);
        this.ctx.stroke();

        // Draw bottom border line
        this.ctx.lineWidth = 0.5;
        this.ctx.strokeStyle = '#808080';
        this.ctx.beginPath();
        this.ctx.moveTo(HEADER_WIDTH, ty + th);
        this.ctx.lineTo(this.canvas.width, ty + th);
        this.ctx.stroke();
    }

    /**
     * Draw all tracks
     */
    drawAllTracks() {
        this.drawTime();

        for (let i in this.vitalFile.sorted_tids) {
            const tid = this.vitalFile.sorted_tids[i];
            this.drawTrack(tid);
        }
    }

    /**
     * Change fit mode
     * @param {number} mode - Fit mode (0: width, 1: 100px)
     */
    fitTrackView(mode) {
        this.is_zooming = false;
        this.tx = HEADER_WIDTH;
        this.fit = mode;
        this.drawAllTracks();
    }

    /**
     * Convert seconds to time string
     * @param {number} seconds - Seconds value
     * @returns {string} - Formatted time string
     */
    stotime(seconds) {
        const date = new Date((seconds + this.vitalFile.dtstart) * 1000);
        const hh = date.getHours();
        const mm = date.getMinutes();
        const ss = date.getSeconds();

        return ("0" + hh).slice(-2) + ":" + ("0" + mm).slice(-2) + ":" + ("0" + ss).slice(-2);
    }

    /**
     * Handle mouse events for dragging and zooming
     */
    bindEventHandlers() {
        // Mouse up - end drag
        this.canvas.addEventListener('mouseup', (e) => {
            if (document.getElementById('file_preview').style.display === 'none') return;

            this.dragx = -1;
            this.dragy = -1;
        });

        // Mouse down - start drag
        this.canvas.addEventListener('mousedown', (e) => {
            if (document.getElementById('file_preview').style.display === 'none') return;

            this.dragx = e.clientX;
            this.dragy = e.clientY;
            this.dragty = this.canvas.parentNode.scrollTop;
            this.dragtx = this.tx;
        });

        // Mouse wheel - zoom
        this.canvas.addEventListener('wheel', (e) => {
            if (document.getElementById('file_preview').style.display === 'none') return;

            this.is_zooming = true;

            // Skip if Alt key pressed or not in track area
            if (e.altKey) return;
            if (e.clientX < HEADER_WIDTH) return;

            const wheel = Math.sign(e.deltaY) * -1; // Invert direction
            const ratio = 1.5;

            if (wheel >= 1) {
                // Zoom in
                this.tw *= ratio;
                this.tx = e.clientX - (e.clientX - this.tx) * ratio;
            } else if (wheel < 0) {
                // Zoom out
                this.tw /= ratio;
                this.tx = e.clientX - (e.clientX - this.tx) / ratio;
            }

            this.initCanvas();
            this.drawAllTracks();
            e.preventDefault();
        });

        // Mouse move - handle drag
        this.canvas.addEventListener('mousemove', (e) => {
            if (document.getElementById('file_preview').style.display === 'none') return;

            // Skip if not dragging
            if (this.dragx === -1) return;

            // Update scroll position and track offset
            this.canvas.parentNode.scrollTop = this.dragty + (this.dragy - e.clientY);
            this.offset = this.canvas.parentNode.scrollTop - 35;
            this.tx = this.dragtx + (e.clientX - this.dragx);

            // Redraw
            this.drawAllTracks();
        });

        // Connect fit buttons
        document.getElementById('fit_width').addEventListener('click', () => this.fitTrackView(0));
        document.getElementById('fit_100px').addEventListener('click', () => this.fitTrackView(1));
    }
}