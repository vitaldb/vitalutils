/**
 * track-view.js
 * Track view module for VitalFile viewer
 */

const TrackView = (function () {
    // Private state
    let canvas;
    let ctx;
    let vf;
    let tw = 640;
    let tx = CONSTANTS.HEADER_WIDTH;
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

// Export to global scope
window.TrackView = TrackView;