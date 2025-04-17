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
    let currentMouseX = -1;
    let currentMouseY = -1;
    let isHovering = false;
    let tooltipTimeout = null;

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
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText("TIME", 8, posY + CONSTANTS.DEVICE_HEIGHT - 7);

        posY += 5;

        // Draw time scale markers
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#FFFFFF";
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
     * Draws track headers for each device
     */
    function DrawTrackHeaders() {
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
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(deviceName, 8, posY + CONSTANTS.DEVICE_HEIGHT - 7);

                posY += CONSTANTS.DEVICE_HEIGHT;
                lastDeviceName = deviceName;
            }

            // Track name background
            ctx.fillStyle = '#464646';
            ctx.fillRect(0, posY, CONSTANTS.HEADER_WIDTH, track.th);

            // Track name
            ctx.fillStyle = vitalFile.getColor(trackId);
            ctx.fillText(track.name, 8, posY + 20);

            posY += track.th;
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
            ctx.strokeStyle = vitalFile.getColor(trackId);
            ctx.stroke();
        } else if (track.type === 2) {
            drawNumericTrack(track, posY, height, caseLength);
            ctx.strokeStyle = vitalFile.getColor(trackId);
            ctx.stroke();
        } else if (track.type === 5) {
            // String track doesn't need path drawing so close the current path
            ctx.stroke(); // Close any previous path
            drawStringTrack(track, posY, caseLength, vitalFile.getColor(trackId));
        }

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
 * Draw overlay with values for all tracks at current mouse position
 */
    function drawValueOverlay() {
        if (!isHovering || currentMouseX <= CONSTANTS.HEADER_WIDTH) return;

        const caseLength = vitalFile.dtend - vitalFile.dtstart;
        const timeOffset = (currentMouseX - trackXOffset) * caseLength / trackWidth;
        const timeString = formatTimeString(timeOffset);

        // Draw vertical line through all tracks
        ctx.beginPath();
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = '#FFFFFF';
        ctx.moveTo(currentMouseX, CONSTANTS.DEVICE_HEIGHT);
        ctx.lineTo(currentMouseX, canvas.height);
        ctx.stroke();

        // Update the time overlay HTML element
        updateTimeOverlay(timeString);

        // Display value for each track directly on the track
        for (let i = 0; i < vitalFile.sortedTids.length; i++) {
            const trackId = vitalFile.sortedTids[i];
            const track = vitalFile.trks[trackId];
            const value = getValueAtPosition(track, currentMouseX, caseLength);

            // Only display if we have a valid value
            if (value !== null) {
                // Format the value appropriately
                let displayValue;
                if (track.type === 5) {
                    // For string tracks, just show the text value
                    displayValue = value;
                } else {
                    // For numeric tracks, include units if available
                    displayValue = value.toFixed(2) + (track.unit ? ' ' + track.unit : '');
                }

                // Calculate position for the value display
                // Position it vertically in the middle of the track
                const posY = track.ty + (track.th / 2);

                // Create a background for better readability
                ctx.font = '12px arial';
                const valueWidth = ctx.measureText(displayValue).width;
                const padding = 5;

                // Background box for text
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.fillRect(
                    currentMouseX + 5,
                    posY - 10,
                    valueWidth + (padding * 2),
                    20
                );

                // Draw the value text with the track's color
                ctx.fillStyle = vitalFile.getColor(trackId);
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(displayValue, currentMouseX + padding + 5, posY);
            }
        }
    }

    /**
     * Updates the time overlay position and content
     * @param {string} timeString - Formatted time string
     */
    function updateTimeOverlay(timeString) {
        const $timeOverlay = $('#time-overlay');
        if ($timeOverlay.length === 0) return;

        // Set the content
        $timeOverlay.text(`Time ${timeString}`);

        // Calculate position for the time overlay
        const canvasRect = canvas.getBoundingClientRect();

        // Position horizontally to the LEFT of the vertical line
        // First measure the width of the time overlay
        const timeWidth = $timeOverlay.outerWidth() || 150; // Fallback if not rendered yet

        // Position to the left of the mouse cursor
        let timeX = canvasRect.left + currentMouseX - timeWidth - 5;
        let timeY = 10;

        // If positioning to the left would go off-screen, position to the right
        if (timeX < canvasRect.left) {
            timeX = canvasRect.left + currentMouseX + 5;
        }

        if (timeY < canvasRect.top) {
            timeY = canvasRect.top + CONSTANTS.DEVICE_HEIGHT;
        }

        // Use jQuery's css method to set styles
        $timeOverlay.css({
            'left': `${timeX}px`,
            'top': `${timeY}px`, // Fixed position at top with margin
            'display': 'block',
        });
    }

    /**
     * Hides the time overlay
     */
    function hideTimeOverlay() {
        const $timeOverlay = $('#time-overlay');
        if ($timeOverlay) {
            $timeOverlay.hide();
        }
    }

    /**
     * Gets the value at the specified x position for a track
     * @param {Object} track - Track object
     * @param {number} xPos - X position on canvas
     * @param {number} caseLength - Length of the case in seconds
     * @returns {number|string|null} - Value at position or null if not available
     */
    function getValueAtPosition(track, xPos, caseLength) {
        // Convert x position to time
        const timeOffset = (xPos - trackXOffset) * caseLength / trackWidth;

        if (track.type === 1) {
            // Waveform track
            if (!track.prev || !track.prev.length) return null;

            // Find index in waveform data
            const dataIndex = Math.floor(timeOffset * track.prev.length / caseLength);
            if (dataIndex >= 0 && dataIndex < track.prev.length) {
                return track.prev[dataIndex];
            }
        } else if (track.type === 2 || track.type === 5) {
            // Numeric or string track
            if (!track.data || !track.data.length) return null;

            // Find closest data point
            let closestIndex = -1;
            let minTimeDiff = Infinity;

            for (let i = 0; i < track.data.length; i++) {
                const [time, _] = track.data[i];
                const timeDiff = Math.abs(time - timeOffset);

                if (timeDiff < minTimeDiff) {
                    minTimeDiff = timeDiff;
                    closestIndex = i;
                }
            }

            // Only return if point is reasonably close (within 5% of case length)
            if (closestIndex !== -1 && minTimeDiff < caseLength * 0.05) {
                // For string tracks, return the text value directly
                if (track.type === 5) {
                    return track.data[closestIndex][1];
                } else {
                    return parseFloat(track.data[closestIndex][1]);
                }
            }
        }

        return null;
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
     * Draws string track data
     * @param {Object} track - Track object
     * @param {number} posY - Y-position for drawing
     * @param {number} caseLength - Length of the case in seconds
     * @param {string} color - Color for the track
     */
    function drawStringTrack(track, posY, caseLength, color) {
        if (!track.data || !track.data.length) return;

        // Set up text style
        ctx.font = '11px arial';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';

        const trackTopY = posY;

        // Keep track of values we've already seen and their display positions
        const seenValues = new Set();
        const occupiedRanges = [];

        // Sort data by time to ensure chronological processing
        const sortedData = [...track.data].sort((a, b) => a[0] - b[0]);

        // Draw vertical lines for each event and show text for first occurrence
        for (let idx = 0; idx < sortedData.length; idx++) {
            const [time, text] = sortedData[idx];

            // Calculate x position
            const posX = trackXOffset + time / caseLength * trackWidth;

            // Skip points outside the visible area
            if (posX <= CONSTANTS.HEADER_WIDTH - 5) continue;
            if (posX >= canvas.width + 5) break;

            // Only show text for first occurrence of each unique value
            if (!seenValues.has(text)) {
                // Mark this value as seen
                seenValues.add(text);

                // Check if we can place text here without overlapping
                const textWidth = ctx.measureText(text).width;
                const textPadding = 5;
                const textLeft = posX + textPadding;
                const textRight = textLeft + textWidth + textPadding;

                // Check for overlap with existing texts
                let overlaps = false;
                for (const range of occupiedRanges) {
                    if (textLeft < range.right && textRight > range.left) {
                        overlaps = true;
                        break;
                    }
                }

                // If no overlap and there's enough space on canvas, show the text
                if (!overlaps && textRight < canvas.width) {
                    // Background for text
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                    ctx.fillRect(textLeft - textPadding, trackTopY, textWidth + (textPadding * 2), 20);

                    // Draw text
                    ctx.fillStyle = color;
                    ctx.fillText(text, textLeft, trackTopY + 10);

                    // Remember this space is occupied
                    occupiedRanges.push({
                        left: textLeft - textPadding,
                        right: textRight
                    });
                }
            }
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
    }

    /**
     * Draws all tracks in the view
     */
    function drawAllTracks() {
        drawTimeRuler();
        DrawTrackHeaders();
        vitalFile.sortedTids.forEach(trackId => drawTrack(trackId));

        // Draw the value overlay after all tracks are drawn
        if (isHovering) {
            drawValueOverlay();
        }
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
        if (!$(canvas).is(":visible")) return;

        // Update current mouse position
        currentMouseX = event.x;
        currentMouseY = event.y;

        if (dragStartX === -1) {
            // Not dragging, show hover values
            isHovering = (currentMouseX > CONSTANTS.HEADER_WIDTH);

            // Use a small timeout to prevent excessive redrawing during rapid mouse movement
            if (tooltipTimeout) {
                clearTimeout(tooltipTimeout);
            }

            tooltipTimeout = setTimeout(() => {
                if (!isHovering) {
                    hideTimeOverlay();
                }
                drawAllTracks();
            }, 10);
        } else {
            // Dragging, update view position
            isHovering = false;
            hideTimeOverlay();
            canvas.parentNode.scrollTop = dragTrackY + (dragStartY - event.y);
            trackXOffset = dragTrackX + (event.x - dragStartX);
            drawAllTracks();
        }
    }

    /**
     * Handles mouse leave event
     */
    function handleMouseLeave() {
        isHovering = false;
        currentMouseX = -1;
        currentMouseY = -1;

        if (tooltipTimeout) {
            clearTimeout(tooltipTimeout);
        }

        // Hide the time overlay
        hideTimeOverlay();

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

        $(canvas).on('mouseleave', function () {
            handleMouseLeave();
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

        // Hide the time overlay during resize
        hideTimeOverlay();

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
            isHovering = false;
            currentMouseX = -1;
            currentMouseY = -1;

            // Setup canvas
            canvas.width = parseInt(canvas.parentNode.parentNode.clientWidth);
            setupEventHandlers();

            // Draw initial view
            initCanvas();
            drawAllTracks();
        },
        drawTrack: drawTrack,
        hideTimeOverlay: hideTimeOverlay,
        fitTrackview: fitTrackview,
        onResize: onResizeWindow
    };
})();

// Export to global scope
window.TrackView = TrackView;