/**
 * utils.js
 * Utility functions for the VitalFile viewer
 */

const Utils = (function () {
    /**
     * Converts typed array to ArrayBuffer
     * @param {TypedArray} array - The typed array to convert
     * @returns {ArrayBuffer} - The resulting ArrayBuffer
     */
    function typedArrayToBuffer(array) {
        return array.buffer.slice(0, array.byteLength);
    }

    /**
     * Converts ArrayBuffer to string
     * @param {ArrayBuffer} buffer - The buffer to convert
     * @returns {string} - The resulting string
     */
    function arrayBufferToString(buffer) {
        const arr = new Uint8Array(buffer);
        return String.fromCharCode.apply(String, arr);
    }

    /**
     * Reads a string from a buffer
     * @param {ArrayBuffer} buffer - The buffer to read from
     * @param {number} position - The starting position
     * @returns {Array} - [string, newPosition]
     */
    function bufToStr(buffer, position) {
        // Read string length
        const stringLength = new Uint32Array(buffer.slice(position, position + 4))[0];
        let newPosition = position + 4;

        // Read string data
        const arr = new Uint8Array(buffer.slice(newPosition, newPosition + stringLength));
        const str = String.fromCharCode.apply(String, arr);

        newPosition += stringLength;
        return [str, newPosition];
    }

    /**
     * Maps format codes to type information
     * @param {number} format - The format code
     * @returns {Array} - [formatString, byteSize]
     */
    function parseFmt(format) {
        const formatMap = {
            1: ["f", 4],  // float
            2: ["d", 8],  // double
            3: ["b", 1],  // signed byte
            4: ["B", 1],  // unsigned byte
            5: ["h", 2],  // signed short
            6: ["H", 2],  // unsigned short
            7: ["l", 4],  // signed long
            8: ["L", 4]   // unsigned long
        };

        return formatMap[format] || ["", 0];
    }

    /**
     * Reads data from a buffer
     * @param {ArrayBuffer} buffer - The buffer to read from
     * @param {number} position - The starting position
     * @param {number} size - The size of each element in bytes
     * @param {number} length - The number of elements to read
     * @param {boolean} signed - Whether to read as signed values
     * @param {string} type - Optional type specifier (e.g., "float")
     * @returns {Array} - [data, newPosition]
     */
    function bufToData(buffer, position, size, length, signed = false, type = "") {
        let result;
        const slice = buffer.slice(position, position + size * length);

        // Choose appropriate typed array based on size and signed flag
        switch (size) {
            case 1:
                result = signed ? new Int8Array(slice) : new Uint8Array(slice);
                break;
            case 2:
                result = signed ? new Int16Array(slice) : new Uint16Array(slice);
                break;
            case 4:
                if (type === "float") {
                    result = new Float32Array(slice);
                } else {
                    result = signed ? new Int32Array(slice) : new Uint32Array(slice);
                }
                break;
            case 8:
                result = new Float64Array(slice);
                break;
        }

        const newPosition = position + (size * length);

        // Return first element if only one requested
        if (length === 1) {
            result = result[0];
        }

        return [result, newPosition];
    }

    /**
     * Formats seconds into HH:MM:SS time string
     * @param {number} seconds - Seconds to format
     * @returns {string} - Formatted time string
     */
    function formatTime(seconds) {
        const hours = Math.floor(seconds / 3600) % 24;
        const minutes = Math.floor(seconds / 60) % 60;
        const secs = seconds % 60;

        // Create formatted string with leading zeros
        return [hours, minutes, secs]
            .map(v => v < 10 ? "0" + v : v)
            .filter((v, i) => v !== "00" || i > 0)
            .join(":");
    }

    /**
     * Formats a value for display based on its type
     * @param {*} value - The value to format
     * @param {number} type - The data type
     * @returns {string|number} - Formatted value
     */
    function formatValue(value, type) {
        // Handle strings
        if (type === 5) {
            return value.length > 4 ? value.slice(0, 4) : value;
        }

        // Handle numeric values
        if (typeof value === 'string') {
            value = parseFloat(value);
        }

        // Format with appropriate precision
        if (Math.abs(value) >= 100 || value - Math.floor(value) < 0.05) {
            return value.toFixed(0); // Whole numbers
        } else {
            return value.toFixed(1); // One decimal place
        }
    }

    /**
     * Draws a rounded rectangle
     * @param {CanvasRenderingContext2D} ctx - The canvas context
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} width - Rectangle width
     * @param {number} height - Rectangle height
     * @param {number} radius - Corner radius
     */
    function roundedRect(ctx, x, y, width, height, radius = 0) {
        ctx.beginPath();

        // Draw rounded corners
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
     * Request an animation frame correctly
     * @param {Function} callback - Function to call on next frame
     * @returns {number} - Request ID
     */
    function updateFrame(callback) {
        // Properly call the browser's requestAnimationFrame with window as context
        return window.requestAnimationFrame(callback) ||
            window.webkitRequestAnimationFrame(callback) ||
            window.mozRequestAnimationFrame(callback) ||
            window.oRequestAnimationFrame(callback) ||
            window.setTimeout(callback, 1000 / 60);
    }

    /**
     * Update loading progress
     * @param {string} filename - Name of file being loaded
     * @param {number} offset - Current progress
     * @param {number} dataLength - Total length
     * @returns {Promise} - Resolves when update is complete
     */
    function updateProgress(filename, offset, dataLength) {
        return new Promise(async resolve => {
            const percentage = (offset / dataLength * 100).toFixed(2);
            await preloader(filename, "PARSING...", percentage)
                .then(resolve);
        });
    }

    /**
     * Displays loading screen
     * @param {string} filename - Name of file being loaded
     * @param {string} message - Message to display
     * @param {number} percentage - Progress percentage
     * @returns {Promise} - Resolves when rendering is complete
     */
    function preloader(filename, message = 'LOADING...', percentage = 0) {
        return new Promise(resolve => {
            setTimeout(function () {
                let $canvas, ctx;

                // Select the appropriate canvas based on view mode
                if (window.view === "moni") {
                    $("#file_preview").hide();
                    $("#fit_width").hide();
                    $("#fit_100px").hide();
                    $("#moni_preview").show();
                    $("#moni_control").show();
                    $("#convert_view")
                        .attr("onclick", "window.vf.drawTrackview()")
                        .html("Track View");
                    $canvas = $('#moni_preview');
                } else {
                    $("#moni_preview").hide();
                    $("#moni_control").hide();
                    $("#file_preview").show();
                    $("#fit_width").show();
                    $("#fit_100px").show();
                    $("#convert_view")
                        .attr("onclick", "window.vf.drawMoniview()")
                        .html("Monitor View");
                    $canvas = $('#file_preview');
                }

                const canvas = $canvas[0];
                ctx = canvas.getContext('2d');

                // Set canvas size
                $canvas.css({
                    width: '100%',
                    height: '100%'
                });

                canvas.width = parseInt($canvas.parent().parent().width());
                canvas.height = $(window).height() - 33;

                // Clear and draw background
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#181818';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Draw message text
                ctx.font = '100 30px arial';
                ctx.fillStyle = '#ffffff';
                const textWidth = ctx.measureText(message).width;
                ctx.fillText(message, (canvas.width - textWidth) / 2, (canvas.height - 50) / 2);

                // Draw progress bar
                if (percentage > 0) {
                    const barWidth = 300;
                    const barHeight = 3;
                    const barX = (canvas.width - barWidth) / 2;
                    const barY = canvas.height / 2;

                    // Background bar
                    ctx.fillStyle = '#595959';
                    ctx.fillRect(barX, barY, barWidth, barHeight);

                    // Progress indicator
                    const progressWidth = percentage * 3;
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(barX, barY, progressWidth, barHeight);
                }

                // Update UI elements
                $("#span_preview_caseid").html(filename);
                $("#div_preview").css('display', '');

                resolve();
            }, 100);
        });
    }

    // Public API
    return {
        typedArrayToBuffer,
        arrayBufferToString,
        bufToStr,
        parseFmt,
        bufToData,
        formatTime,
        formatValue,
        roundedRect,
        updateFrame,
        updateProgress,
        preloader
    };
})();

// Export to global scope
window.Utils = Utils;