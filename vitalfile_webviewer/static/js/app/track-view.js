/**
 * track-view.js
 * Track view module for VitalFile viewer
 */

const TrackView = (function () {
    // Private state
    let canvas;
    let ctx;
    let vitalFile;
    let trackWidth = 640;
    let trackXOffset = CONSTANTS.HEADER_WIDTH;
    let isZooming = false;
    let fitMode = 0;
    let dragStartX = -1;
    let dragStartY = -1;
    let dragTrackY, dragTrackX;
    let offset = 0;

    /**
     * Formats seconds into HH:MM:SS time string
     * @param {number} seconds - Seconds to format
     * @returns {string} - Formatted time string
     */
    function formatTimeString(seconds) {
        const date = new Date((seconds + vitalFile.dtstart) * 1000);
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const seconds_ = date.getSeconds();

        return [
            String(hours).padStart(2, '0'),
            String(minutes).padStart(2, '0'),
            String(seconds_).padStart(2, '0')
        ].join(':');
    }

    /**
     * Draws the time ruler at the top of the view
     */
    function drawTimeRuler() {
        const caseLength = vitalFile.dtend - vitalFile.dtstart;

        // Calculate track width if not zooming
        if (!isZooming) {
            trackWidth = (fitMode === 1)
                ? (caseLength * 100)
                : (canvas.width - CONSTANTS.HEADER_WIDTH);
        }

        let posY = 0;

        // Time ruler background
        ctx.fillStyle = '#464646';
        ctx.fillRect(0, posY, canvas.width, CONSTANTS.DEVICE_HEIGHT);

        // Draw "TIME" label
        ctx.font = '100 12px arial';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.fillText("TIME", 8, posY + CONSTANTS.DEVICE_HEIGHT - 7);

        posY += 5;

        // Draw time scale markers
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#ffffff";
        ctx.textBaseline = 'top';
        const markerDistance = (canvas.width - CONSTANTS.HEADER_WIDTH) / 5;

        // Draw 6 markers at equal distances
        for (let i = 0; i <= 5; i++) {
            const xPos = CONSTANTS.HEADER_WIDTH + i * markerDistance;
            const timeOffset = (xPos - trackXOffset) * caseLength / trackWidth;
            const timeString = formatTimeString(timeOffset);

            // Text alignment adjustments for edge markers
            if (i === 0) {
                ctx.textAlign = "left";
            } else if (i === 5) {
                ctx.textAlign = "right";
            } else {
                ctx.textAlign = "center";
            }

            // Draw time text
            ctx.fillText(timeString, xPos, posY);

            // Draw vertical grid line
            ctx.beginPath();
            ctx.moveTo(xPos, 17);
            ctx.lineTo(xPos, CONSTANTS.DEVICE_HEIGHT);
            ctx.stroke();
        }
    }

    /**
     * Draws a single track of data
     * @param {string} trackId - ID of the track to draw
     * @returns {boolean} - Success status
     */
    function drawTrack(trackId) {
        const track = vitalFile.trks[trackId];
        if (!track) return false;

        const posY = track.ty;
        const height = track.th;
        const caseLength = vitalFile.dtend - vitalFile.dtstart;

        // Update track width if not zooming
        if (!isZooming) {
            trackWidth = (fitMode === 1)
                ? (caseLength * 100)
                : (canvas.width - CONSTANTS.HEADER_WIDTH);
        }

        // Clear background
        ctx.fillStyle = '#181818';
        ctx.fillRect(CONSTANTS.HEADER_WIDTH - 1, posY, canvas.width - CONSTANTS.HEADER_WIDTH, height);
        ctx.beginPath();
        ctx.lineWidth = 1;

        // Choose drawing method based on track type
        if (track.type === 1) {
            drawWaveTrack(track, posY, height, caseLength);
        } else if (track.type === 2) {
            drawNumericTrack(track, posY, height, caseLength);
        }

        // Draw track color
        ctx.strokeStyle = vitalFile.get_color(trackId);
        ctx.stroke();

        // Draw horizontal divider line
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = '#808080';
        ctx.beginPath();
        ctx.moveTo(CONSTANTS.HEADER_WIDTH, posY + height);
        ctx.lineTo(canvas.width, posY + height);
        ctx.stroke();

        return true;
    }

    /**
     * Draws waveform track data
     * @param {Object} track - Track object
     * @param {number} posY - Y-position for drawing
     * @param {number} height - Height of the track
     * @param {number} caseLength - Length of the case in seconds
     */
    function drawWaveTrack(track, posY, height, caseLength) {
        if (!track.prev || !track.prev.length) return;

        let isFirstPoint = true;

        // Calculate optimal sampling increment for performance
        const increment = Math.max(1, Math.floor(track.prev.length / trackWidth / 100));

        // Calculate starting index based on current view position
        const startIndex = Math.max(0, Math.floor((CONSTANTS.HEADER_WIDTH - trackXOffset) * track.prev.length / trackWidth));

        // Draw waveform points
        for (let idx = startIndex; idx < track.prev.length; idx += increment) {
            // Skip gaps in data
            if (track.prev[idx] === 0) continue;

            // Calculate x position
            const posX = trackXOffset + ((idx * trackWidth) / track.prev.length);

            // Skip points outside the visible area
            if (posX <= CONSTANTS.HEADER_WIDTH) continue;
            if (posX >= canvas.width) break;

            // Calculate y position (normalize to 0-255 range)
            const positionY = posY + height * (255 - track.prev[idx]) / 254;

            // Start or continue the path
            if (isFirstPoint) {
                isFirstPoint = false;
                ctx.moveTo(posX, positionY);
            } else {
                ctx.lineTo(posX, positionY);
            }
        }
    }

    /**
     * Draws numeric track data
     * @param {Object} track - Track object
     * @param {number} posY - Y-position for drawing
     * @param {number} height - Height of the track
     * @param {number} caseLength - Length of the case in seconds
     */
    function drawNumericTrack(track, posY, height, caseLength) {
        if (!track.data || !track.data.length) return;

        // Draw each data point
        for (let idx = 0; idx < track.data.length; idx++) {
            const [time, rawValue] = track.data[idx];

            // Calculate x position
            const posX = trackXOffset + time / caseLength * trackWidth;

            // Skip points outside the visible area
            if (posX <= CONSTANTS.HEADER_WIDTH) continue;
            if (posX >= canvas.width) break;

            // Handle values outside display range
            const value = parseFloat(rawValue);
            if (value <= track.mindisp) continue;

            // Normalize value to display range
            let displayValue = Math.min(value, track.maxdisp);

            // Calculate y position (scaled to track height)
            let pointY = posY + height - (displayValue - track.mindisp) * height / (track.maxdisp - track.mindisp);

            // Clamp to track boundaries
            pointY = Math.max(posY, Math.min(posY + height, pointY));

            // Draw vertical line from point to bottom of track
            ctx.moveTo(posX, pointY);
            ctx.lineTo(posX, posY + height);
        }
    }

    /**
     * Sets up the canvas with track headers and backgrounds
     */
    function initCanvas() {
        // Update canvas height to accommodate all tracks
        canvas.height = vitalFile.trackViewHeight;
        canvas.style.height = vitalFile.trackViewHeight + 'px';

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#181818';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Set text style
        ctx.font = '100 12px arial';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';

        let posY = CONSTANTS.DEVICE_HEIGHT;
        let lastDeviceName = '';

        // Draw track headers
        for (let i = 0; i < vitalFile.sortedTids.length; i++) {
            const trackId = vitalFile.sortedTids[i];
            const track = vitalFile.trks[trackId];
            const deviceName = track.dname;

            // Add device header if new device
            if (deviceName !== lastDeviceName) {
                // Device header background
                ctx.fillStyle = '#505050';
                ctx.fillRect(0, posY, canvas.width, CONSTANTS.DEVICE_HEIGHT);

                // Device name
                ctx.fillStyle = '#ffffff';
                ctx.fillText(deviceName, 8, posY + CONSTANTS.DEVICE_HEIGHT - 7);

                posY += CONSTANTS.DEVICE_HEIGHT;
                lastDeviceName = deviceName;
            }

            // Track name background
            ctx.fillStyle = '#464646';
            ctx.fillRect(0, posY, CONSTANTS.HEADER_WIDTH, track.th);

            // Track name
            ctx.fillStyle = vitalFile.get_color(trackId);
            ctx.fillText(track.name, 8, posY + 20);

            // Loading indicator
            ctx.textAlign = 'left';
            ctx.fillStyle = '#808080';
            ctx.fillText('LOADING...', CONSTANTS.HEADER_WIDTH + 10, posY + CONSTANTS.DEVICE_HEIGHT - 7);

            posY += track.th;
        }
    }

    /**
     * Draws all tracks in the view
     */
    function drawAllTracks() {
        drawTimeRuler();
        vitalFile.sortedTids.forEach(trackId => drawTrack(trackId));
    }

    /**
     * Handles mouse down event
     * @param {Event} event - Mouse event
     */
    function handleMouseDown(event) {
        if (!$(canvas).is(":visible")) return;

        dragStartX = event.x;
        dragStartY = event.y;
        dragTrackY = canvas.parentNode.scrollTop;
        dragTrackX = trackXOffset;
    }

    /**
     * Handles mouse up event
     * @param {Event} event - Mouse event
     */
    function handleMouseUp(event) {
        if (!$(canvas).is(":visible")) return;

        dragStartX = -1;
        dragStartY = -1;
    }

    /**
     * Handles mouse wheel (zoom) event
     * @param {Event} event - Mouse wheel event
     */
    function handleMouseWheel(event) {
        if (!$(canvas).is(":visible")) return;
        if (event.altKey) return;
        if (event.x < CONSTANTS.HEADER_WIDTH) return;

        isZooming = true;
        const wheelDirection = Math.sign(event.wheelDelta);
        const zoomRatio = 1.5;

        // Calculate zoom centered at mouse position
        if (wheelDirection >= 1) {
            // Zoom in
            trackWidth *= zoomRatio;
            trackXOffset = event.x - (event.x - trackXOffset) * zoomRatio;
        } else {
            // Zoom out
            trackWidth /= zoomRatio;
            trackXOffset = event.x - (event.x - trackXOffset) / zoomRatio;
        }

        // Redraw at new zoom level
        initCanvas();
        drawAllTracks();
        event.preventDefault();
    }

    /**
     * Handles mouse move (drag) event
     * @param {Event} event - Mouse move event
     */
    function handleMouseMove(event) {
        if (!$(canvas).is(":visible") || dragStartX === -1) return;

        // Update vertical scroll position
        canvas.parentNode.scrollTop = dragTrackY + (dragStartY - event.y);
        offset = canvas.parentNode.scrollTop - 35;

        // Update horizontal position
        trackXOffset = dragTrackX + (event.x - dragStartX);

        // Redraw with new position
        drawAllTracks();
    }

    /**
     * Sets up all event handlers
     */
    function setupEventHandlers() {
        $(canvas).on('mouseup', function (e) {
            handleMouseUp(e.originalEvent);
        });

        $(canvas).on('mousedown', function (e) {
            handleMouseDown(e.originalEvent);
        });

        $(canvas).on('mousewheel', function (e) {
            handleMouseWheel(e.originalEvent);
        });

        $(canvas).on('mousemove', function (e) {
            handleMouseMove(e.originalEvent);
        });
    }

    /**
     * Handles window resize event
     */
    function onResizeWindow() {
        if (!$(canvas).is(":visible")) return;

        canvas.width = parseInt(canvas.parentNode.parentNode.clientWidth);
        canvas.style.width = canvas.width + 'px';

        $("#div_preview").css("width", canvas.width + "px");

        initCanvas();
        drawAllTracks();
    }

    /**
     * Sets track view fitting mode
     * @param {number} mode - 0: fit width, 1: 100px/s
     * @returns {boolean} - Success status
     */
    function fitTrackview(mode) {
        isZooming = false;
        trackXOffset = CONSTANTS.HEADER_WIDTH;
        fitMode = mode;
        drawAllTracks();
        return true;
    }

    // Public API
    return {
        /**
         * Initialize the track view module
         * @param {Object} vitalFileObj - VitalFile object containing data
         * @param {HTMLElement} canvasElement - Canvas for drawing
         */
        initialize: function (vitalFileObj, canvasElement) {
            vitalFile = vitalFileObj;
            canvas = canvasElement;
            ctx = canvas.getContext('2d');

            // Reset state
            isZooming = false;
            trackXOffset = CONSTANTS.HEADER_WIDTH;

            // Setup canvas
            canvas.width = parseInt(canvas.parentNode.parentNode.clientWidth);
            setupEventHandlers();

            // Draw initial view
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