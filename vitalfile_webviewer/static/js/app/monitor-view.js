/**
 * monitor-view.js
 * Monitor view module for VitalFile viewer
 */

const MonitorView = (function () {
    // Private state
    let canvas;
    let ctx;
    let vf;
    let montypeGroupids = {};
    let montypeTrackMap = {};
    let groupidTrackMap = {};
    let playerTime = 0;
    let isPaused = true;
    let isSliding = false;
    let scale = 1;
    let caseLength;
    let playbackSpeed = 1.0;
    let canvasWidth;
    let lastRenderTime = 0;

    /**
     * Format a number with leading zeros
     * @param {number} value - The number to format
     * @returns {string} - The formatted string with leading zeros
     */
    function formatTimeComponent(value) {
        return `0${value}`.substr(-2);
    }

    /**
     * Get the current playback time in HH:MM:SS format
     * @returns {string} - Formatted time string
     */
    function getPlaytime() {
        const date = new Date((vf.dtstart + playerTime) * 1000);
        return [
            formatTimeComponent(date.getHours()),
            formatTimeComponent(date.getMinutes()),
            formatTimeComponent(date.getSeconds())
        ].join(":");
    }

    /**
     * Organize tracks by monitor type and group
     */
    function organizeMonitorGroups() {
        // Reset state
        montypeGroupids = {};
        montypeTrackMap = {};
        groupidTrackMap = {};

        // Map monitor types to group IDs
        Object.entries(CONSTANTS.GROUPS).forEach(([groupId, group]) => {
            // Process parameters
            if (group.param) {
                group.param.forEach(montype => {
                    montypeGroupids[montype] = groupId;
                });
            }

            // Process waveform monitor type
            if (group.wav) {
                montypeGroupids[group.wav] = groupId;
            }
        });

        // Organize tracks by monitor type and group
        Object.entries(vf.trks).forEach(([trackId, track]) => {
            const monitorType = vf.getMontype(trackId);

            // Associate first track with each monitor type
            if (monitorType && !montypeTrackMap[monitorType]) {
                montypeTrackMap[monitorType] = track;
            }

            // Group tracks by group ID
            const groupId = montypeGroupids[monitorType];
            if (groupId) {
                if (!groupidTrackMap[groupId]) {
                    groupidTrackMap[groupId] = [];
                }
                groupidTrackMap[groupId].push(track);
            }
        });
    }

    /**
     * Find the latest value for a track at current play time
     * @param {Object} track - The track to search
     * @returns {*} - The latest value or null if not found
     */
    function findLatestValue(track) {
        if (!track.data) return null;

        for (let idx = 0; idx < track.data.length; idx++) {
            const record = track.data[idx];
            const time = record[0];

            if (time > playerTime) {
                // Return previous value if it's recent enough (within 5 minutes)
                if (idx > 0 && track.data[idx - 1][0] > playerTime - 300) {
                    return track.data[idx - 1][1];
                }
                break;
            }
        }
        return null;
    }

    /**
     * Collect parameter values for a group
     * @param {Object} group - The parameter group
     * @returns {Object} - Object containing values and existence flag
     */
    function collectParameterValues(group) {
        if (!group || !group.param) return { values: [], hasValues: false };

        const layout = CONSTANTS.PARAM_LAYOUTS[group.paramLayout];
        if (!layout) return { values: [], hasValues: false };

        const nameValueArray = [];
        let valueExists = false;

        // Collect values for each parameter in the group
        for (let i in group.param) {
            const monitorType = group.param[i];
            const track = montypeTrackMap[monitorType];

            if (track && track.data) {
                let value = findLatestValue(track);

                if (value !== null) {
                    value = Utils.formatValue(value, track.type);
                    nameValueArray.push({ name: track.name, value: value });
                    valueExists = true;
                } else {
                    nameValueArray.push({ name: track.name, value: '' });
                }
            }
        }

        return { values: nameValueArray, hasValues: valueExists };
    }

    /**
     * Process special formatting for parameter values
     * @param {Object} group - The parameter group
     * @param {Array} values - Array of name/value pairs
     * @returns {Array} - Processed values
     */
    function processSpecialFormats(group, values) {
        if (values.length === 0) return values;

        // Handle agent-specific abbreviations
        if (group.name && group.name.substring(0, 5) === 'AGENT' && values.length > 1) {
            const agentValue = values[1].value.toUpperCase();
            const agentMap = {
                'DESF': 'DES',
                'ISOF': 'ISO',
                'ENFL': 'ENF'
            };

            if (agentMap[agentValue]) {
                values[1].value = agentMap[agentValue];
            }
        }

        // Handle blood pressure formatting
        if (group.paramLayout === 'BP' && values.length > 2) {
            values[0].name = group.name || '';
            values[0].value = (values[0].value ? Math.round(values[0].value) : ' ') +
                (values[1].value ? ('/' + Math.round(values[1].value)) : ' ');
            values[2].value = values[2].value ? Math.round(values[2].value) : '';
            values[1] = values[2];
            values.pop();
        } else if (!values[0].name) {
            values[0].name = group.name || '';
        }

        return values;
    }

    /**
     * Get the appropriate text color for a parameter
     * @param {Object} group - The parameter group
     * @param {Array} values - Parameter values
     * @returns {string} - Color hex code
     */
    function getParameterColor(group, values) {
        // Default to group color
        let color = group.fgColor;

        // Handle special cases
        if (values[0].name === "HPI") {
            return "#00FFFF";
        }

        if (group.name && group.name.indexOf('AGENT') > -1 && values.length > 1) {
            const colorMap = {
                'DES': '#2296E6',
                'ISO': '#DDA0DD',
                'ENF': '#FF0000'
            };

            if (colorMap[values[1].value]) {
                return colorMap[values[1].value];
            }
        }

        return color;
    }

    /**
     * Draw the title bar with bed name and current time
     * @param {number} x - X-coordinate to start drawing 
     */
    function drawTitle(x) {
        // Bed name
        ctx.font = `${40 * scale}px arial`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(vf.bedname, x + 4, 45 * scale);

        let posX = x + ctx.measureText(vf.bedname).width + 22;

        // Current playback time
        const caseTime = getPlaytime();
        ctx.font = `bold ${24 * scale}px arial`;
        ctx.fillText(caseTime, (x + canvasWidth) / 2 - 50, 29 * scale);

        // Device indicators
        ctx.font = `${15 * scale}px arial`;
        Object.entries(vf.devs).forEach(([deviceId, device]) => {
            if (!device.name) return;

            // Draw device indicator box
            ctx.fillStyle = '#348EC7';
            Utils.roundedRect(ctx, posX, 36 * scale, 12 * scale, 12 * scale, 3);
            ctx.fill();

            posX += 17 * scale;

            // Draw device name
            ctx.fillStyle = '#FFFFFF';
            const deviceName = device.name.substr(0, 7);
            ctx.fillText(deviceName, posX, 48 * scale);
            posX += ctx.measureText(deviceName).width + 13 * scale;
        });
    }

    /**
     * Draw value text according to layout specifications
     * @param {Object} layoutElement - Layout specification
     * @param {string} value - Text to draw
     * @param {number} x - X-coordinate
     * @param {number} y - Y-coordinate
     * @param {string} color - Text color
     */
    function drawValueText(layoutElement, value, x, y, color) {
        if (!layoutElement) return;

        // Set text properties
        ctx.font = `${layoutElement.fontsize * scale}px arial`;
        ctx.fillStyle = color;
        ctx.textAlign = layoutElement.align || 'left';
        ctx.textBaseline = layoutElement.baseline || 'alphabetic';

        // Calculate position
        const posX = x + layoutElement.x * scale;
        const posY = y + layoutElement.y * scale;

        // Draw text
        ctx.fillText(value, posX, posY);
    }

    /**
     * Draw parameter name text according to layout
     * @param {Object} layoutElement - Layout specification
     * @param {string} name - Text to draw
     * @param {number} x - X-coordinate
     * @param {number} y - Y-coordinate
     */
    function drawNameText(layoutElement, name, x, y) {
        if (!layoutElement) return;

        // Set text properties
        ctx.font = `${14 * scale}px arial`;
        ctx.fillStyle = 'white';
        ctx.textAlign = layoutElement.align || 'left';
        ctx.textBaseline = layoutElement.baseline || 'alphabetic';

        // Calculate position
        const posX = x + layoutElement.x * scale;
        const posY = y + layoutElement.y * scale;

        // Handle text that's too wide
        const measuredWidth = ctx.measureText(name).width;
        const maxWidth = 75;

        if (measuredWidth > maxWidth) {
            // Scale down text that's too wide
            ctx.save();
            ctx.scale(maxWidth / measuredWidth, 1);
            ctx.fillText(name, posX * measuredWidth / maxWidth, posY);
            ctx.restore();
        } else {
            ctx.fillText(name, posX, posY);
        }
    }

    /**
     * Draw a parameter box with values
     * @param {Object} group - Parameter group
     * @param {Set} drawnTracks - Set of track IDs that have been drawn
     * @param {number} x - X-coordinate
     * @param {number} y - Y-coordinate
     * @returns {boolean} - True if parameters were drawn
     */
    function drawParameterBox(group, drawnTracks, x, y) {
        // Collect parameter values
        const { values, hasValues } = collectParameterValues(group);
        if (!hasValues) return false;

        // Process special formatting
        const processedValues = processSpecialFormats(group, values);
        const layout = CONSTANTS.PARAM_LAYOUTS[group.paramLayout];

        // Track which parameters have been drawn
        if (drawnTracks) {
            for (let i in group.param) {
                const monitorType = group.param[i];
                const track = montypeTrackMap[monitorType];
                if (track) {
                    drawnTracks.add(track.tid);
                }
            }
        }

        // Draw each parameter according to layout
        for (let idx = 0; idx < layout.length && idx < processedValues.length; idx++) {
            const layoutElement = layout[idx];
            const { name, value } = processedValues[idx];
            const color = getParameterColor(group, processedValues);

            // Draw value
            if (layoutElement.value) {
                drawValueText(layoutElement.value, value, x, y, color);
            }

            // Draw parameter name
            if (layoutElement.name) {
                drawNameText(layoutElement.name, name, x, y);
            }
        }

        // Draw box border
        ctx.strokeStyle = '#808080';
        ctx.lineWidth = 0.5;
        Utils.roundedRect(ctx, x, y, CONSTANTS.PAR_WIDTH * scale, CONSTANTS.PAR_HEIGHT * scale);
        ctx.stroke();

        return true;
    }

    /**
     * Draw waveform data
     * @param {Object} track - Track containing waveform data
     * @param {number} x - X-coordinate
     * @param {number} y - Y-coordinate
     * @param {number} width - Width of the waveform area
     * @param {number} height - Height of the waveform area
     */
    function drawWaveform(track, x, y, width, height) {
        // Skip if no valid data
        if (!track || !track.srate || !track.prev || !track.prev.length) {
            return;
        }

        ctx.beginPath();

        let lastX = x;
        let pointY = 0;
        let isFirstPoint = true;

        // Calculate starting index and increment
        const startIndex = Math.floor(playerTime * track.srate);
        const increment = track.srate / 100; // 100 points per second
        let pointX = 0;

        // Loop through visible portion of waveform
        for (let i = startIndex; i < startIndex + (x + width) * increment && i < track.prev.length; i++, pointX += (1.0 / increment)) {
            const value = track.prev[i];
            if (value === 0) continue; // Skip gaps

            if (pointX > x + width) break; // Past visible area

            // Calculate Y position (inverted scale)
            pointY = y + height * (255 - value) / 254;

            // Clamp to boundaries
            pointY = Math.max(y, Math.min(y + height, pointY));

            if (isFirstPoint) {
                // Handle start of line
                if (pointX < x + 10) {
                    ctx.moveTo(x, pointY);
                    ctx.lineTo(pointX, pointY);
                } else {
                    ctx.moveTo(pointX, pointY);
                }
                isFirstPoint = false;
            } else {
                // Handle large gaps
                if (pointX - lastX > x + 10) {
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(pointX, pointY);
                } else {
                    ctx.lineTo(pointX, pointY);
                }
            }

            lastX = pointX;
        }

        // Complete the line to the edge
        if (!isFirstPoint && pointX > x + width - 10) {
            ctx.lineTo(x + width, pointY);
        }

        ctx.stroke();

        // Draw current position indicator
        if (!isFirstPoint && pointX > x + width - 4) {
            ctx.fillStyle = 'white';
            ctx.fillRect(x + width - 4, pointY - 2, 4, 4);
        }
    }

    /**
     * Draw event list
     * @param {number} x - X-coordinate
     * @param {number} y - Y-coordinate
     * @param {number} width - Width of the area
     */
    function drawEvents(x, y, width) {
        const eventTrack = vf.findTrack("/EVENT");
        if (!eventTrack) return;

        let count = 0;
        ctx.font = `${14 * scale}px arial`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        // Draw visible events
        for (let eventIdx = 0; eventIdx < eventTrack.data.length; eventIdx++) {
            const [time, value] = eventTrack.data[eventIdx];

            // Only show events up to current playback time
            if (time > playerTime) {
                break;
            }

            // Format timestamp
            const date = new Date((time + vf.dtstart) * 1000);
            const hours = date.getHours();
            const minutes = formatTimeComponent(date.getMinutes());
            const timeString = `${hours}:${minutes}`;

            // Draw time
            ctx.fillStyle = '#4EB8C9';
            ctx.fillText(timeString, x + width + 3, y + (20 + count * 20) * scale);

            // Draw event text
            ctx.fillStyle = 'white';
            ctx.fillText(value, x + width + 45, y + (20 + count * 20) * scale);

            count++;
        }
    }

    /**
     * Prepare canvas for drawing
     */
    function prepareCanvas() {
        canvasWidth = window.innerWidth;
        canvas.width = canvasWidth;
        canvas.height = window.innerHeight - 28;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#181818';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();

        // Calculate scale for responsive layout
        scale = 1;
        if (vf.monitorViewHeight && canvas.height < vf.monitorViewHeight) {
            scale = canvas.height / vf.monitorViewHeight;
        }

        // Update container sizes
        $("#div_preview").css("width", canvas.width + "px");
        $("#moni_control").css("width", canvas.width + "px");
    }

    /**
     * Draw all monitor view elements
     */
    function draw() {
        prepareCanvas();

        // Start layout
        let posX = 0;
        let posY = 60 * scale;
        const waveformWidth = canvasWidth - CONSTANTS.PAR_WIDTH * scale;

        // Draw title bar
        drawTitle(posX);

        // Track which parameters have been drawn
        const drawnTracks = new Set();

        // Draw waveform groups
        Object.entries(CONSTANTS.GROUPS).forEach(([groupId, group]) => {
            if (!group.wav) return; // Skip non-waveform groups

            // Find waveform track for this group
            const waveTrack = montypeTrackMap[group.wav];
            if (!waveTrack) return;

            let waveName = group.name;

            // Use track name if available
            if (waveTrack && waveTrack.srate && waveTrack.prev && waveTrack.prev.length) {
                drawnTracks.add(waveTrack.tid);
                waveName = waveTrack.name;
            }

            // Draw parameter values
            drawParameterBox(group, drawnTracks, posX + waveformWidth, posY);

            // Draw waveform
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = group.fgColor;
            drawWaveform(waveTrack, posX, posY, waveformWidth, CONSTANTS.PAR_HEIGHT * scale);

            // Draw separator line
            ctx.lineWidth = 0.5;
            ctx.strokeStyle = '#808080';
            ctx.beginPath();
            ctx.moveTo(posX, posY + CONSTANTS.PAR_HEIGHT * scale);
            ctx.lineTo(posX + waveformWidth, posY + CONSTANTS.PAR_HEIGHT * scale);
            ctx.stroke();

            // Draw waveform name
            ctx.font = `${14 * scale}px Arial`;
            ctx.fillStyle = 'white';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(waveName, posX + 3, posY + 4);

            // Move to next row
            posY += CONSTANTS.PAR_HEIGHT * scale;
        });

        // Draw events
        drawEvents(posX, posY, waveformWidth);

        // Draw non-waveform groups (parameter boxes)
        posX = 0;
        let isFirstLine = true;

        Object.entries(CONSTANTS.GROUPS).forEach(([groupId, group]) => {
            // Skip if this group has already been drawn as a waveform
            const waveTrack = montypeTrackMap[group.wav];
            if (waveTrack && waveTrack.prev && waveTrack.prev.length) return;

            // Draw parameter box
            if (!drawParameterBox(group, drawnTracks, posX, posY)) return;

            // Move to next position
            posX += CONSTANTS.PAR_WIDTH * scale;

            // Handle wrapping
            if (posX > canvasWidth - CONSTANTS.PAR_WIDTH * scale * 2) {
                posX = 0;
                posY += CONSTANTS.PAR_HEIGHT * scale;

                // Limit parameter boxes to two rows
                if (!isFirstLine) return;
                isFirstLine = false;
            }
        });

        ctx.restore();

        // Update canvas height
        const newHeight = posY + 3 * CONSTANTS.PAR_HEIGHT * scale;
        if (!vf.monitorViewHeight || newHeight > vf.monitorViewHeight) {
            vf.monitorViewHeight = newHeight;
        }
    }

    /**
     * Handle animation frame updates
     */
    function redraw() {
        // Exit if monitor view isn't visible
        if (!$("#moni_preview").is(":visible")) return;

        // Schedule next frame
        Utils.updateFrame(redraw);

        // Limit to 30 FPS
        const now = Date.now();
        const timeSinceLastRender = now - lastRenderTime;
        if (timeSinceLastRender < 30) return;

        lastRenderTime = now;

        // Advance playback time if playing
        if (!isPaused && !isSliding && playerTime < caseLength) {
            // Add time based on playback speed
            playerTime += (playbackSpeed / 30);

            // Update UI
            $("#moni_slider").val(playerTime);
            $("#casetime").html(
                `${Utils.formatTime(Math.floor(playerTime))} / ${Utils.formatTime(Math.floor(caseLength))}`
            );

            // Redraw with new time
            draw();
        }
    }

    /**
     * Handle window resize
     */
    function onResizeWindow() {
        // Update canvas dimensions
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight - 28;
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = (window.innerHeight - 28) + 'px';
        canvasWidth = canvas.width;

        // Redraw with new dimensions
        draw();
    }

    /**
     * Toggle or set play/pause state
     * @param {boolean|null} pause - State to set, or toggle if null
     */
    function pauseResume(pause = null) {
        // Update state
        if (pause !== null) {
            isPaused = pause;
        } else {
            isPaused = !isPaused;
        }

        // Update UI
        if (isPaused) {
            $("#moni_pause").hide();
            $("#moni_resume").show();
        } else {
            $("#moni_resume").hide();
            $("#moni_pause").show();
        }
    }

    /**
     * Rewind playback
     * @param {number|null} seconds - Seconds to rewind, or auto-calculate if null
     */
    function rewind(seconds = null) {
        // Calculate default rewind amount based on visible area
        if (!seconds) {
            seconds = (canvasWidth - CONSTANTS.PAR_WIDTH) / 100;
        }

        // Update time
        playerTime -= seconds;

        // Ensure we don't go before the start
        if (playerTime < 0) playerTime = 0;

        // Update UI
        $("#moni_slider").val(playerTime);
        $("#casetime").html(
            `${Utils.formatTime(Math.floor(playerTime))} / ${Utils.formatTime(Math.floor(caseLength))}`
        );

        // Redraw
        draw();
    }

    /**
     * Advance playback
     * @param {number|null} seconds - Seconds to advance, or auto-calculate if null
     */
    function proceed(seconds = null) {
        // Calculate default proceed amount based on visible area
        if (!seconds) {
            seconds = (canvasWidth - CONSTANTS.PAR_WIDTH) / 100;
        }

        // Update time
        playerTime += seconds;

        // Ensure we don't go past the end
        if (playerTime > caseLength) {
            playerTime = caseLength - (canvasWidth - CONSTANTS.PAR_WIDTH) / 100;
        }

        // Update UI
        $("#moni_slider").val(playerTime);
        $("#casetime").html(
            `${Utils.formatTime(Math.floor(playerTime))} / ${Utils.formatTime(Math.floor(caseLength))}`
        );

        // Redraw
        draw();
    }

    /**
     * Jump to specific time
     * @param {number} seconds - Target time in seconds
     */
    function slideTo(seconds) {
        playerTime = parseInt(seconds);
        isSliding = false;

        // Update UI
        $("#casetime").html(
            `${Utils.formatTime(Math.floor(playerTime))} / ${Utils.formatTime(Math.floor(caseLength))}`
        );

        // Redraw
        draw();
    }

    /**
     * Update UI during slider movement
     * @param {number} seconds - Current slider position in seconds
     */
    function slideOn(seconds) {
        // Update time display
        $("#casetime").html(
            `${Utils.formatTime(Math.floor(seconds))} / ${Utils.formatTime(Math.floor(caseLength))}`
        );

        // Set sliding state
        isSliding = true;
    }

    /**
     * Set playback speed
     * @param {number|string} value - Playback speed multiplier
     */
    function setPlayspeed(value) {
        playbackSpeed = parseInt(value);
    }

    /**
     * Get the case length
     * @returns {number} - Case length in seconds
     */
    function getCaselen() {
        return caseLength;
    }

    // Public API
    return {
        initialize: function (vitalFile, canvasElement) {
            // Store references
            vf = vitalFile;
            canvas = canvasElement;
            ctx = canvas.getContext('2d');
            caseLength = vf.dtend - vf.dtstart;

            // Reset state
            playbackSpeed = 1.0;
            montypeGroupids = {};
            montypeTrackMap = {};
            groupidTrackMap = {};
            playerTime = 0;

            // Initialize UI
            pauseResume(true);
            $("#moni_slider")
                .attr("max", caseLength)
                .attr("min", 0)
                .val(0);

            // Setup monitor view
            organizeMonitorGroups();
            onResizeWindow();
            draw();

            // Start animation loop
            Utils.updateFrame(redraw);
        },
        pauseResume,
        rewind,
        proceed,
        slideTo,
        slideOn,
        setPlayspeed,
        getCaselen,
        onResize: onResizeWindow
    };
})();

// Export to global scope
window.MonitorView = MonitorView;