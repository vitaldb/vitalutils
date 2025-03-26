/**
 * utils.js
 * Utility functions for the VitalFile viewer
 */

const Utils = (function () {
    // Helper functions for parsing binary data
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

    // Formatting functions
    function formatTime(seconds) {
        const ss = seconds % 60;
        const mm = Math.floor(seconds / 60) % 60;
        const hh = Math.floor(seconds / 3600) % 24;

        return [hh, mm, ss]
            .map(v => v < 10 ? "0" + v : v)
            .filter((v, i) => v !== "00" || i > 0)
            .join(":");
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

    // Browser animation frame helper
    function updateFrame(callback) {
        // Properly call the browser's requestAnimationFrame with window as context
        return window.requestAnimationFrame(callback) ||
            window.webkitRequestAnimationFrame(callback) ||
            window.mozRequestAnimationFrame(callback) ||
            window.oRequestAnimationFrame(callback) ||
            window.setTimeout(callback, 1000 / 60);
    }

    // Loading progress utility
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
                    $("#convert_view").attr("onclick", "window.vf.draw_trackview()").html("Track View");
                    canvas = document.getElementById('moni_preview');
                    ctx = canvas.getContext('2d');
                } else {
                    $("#moni_preview").hide();
                    $("#moni_control").hide();
                    $("#file_preview").show();
                    $("#fit_width").show();
                    $("#fit_100px").show();
                    $("#convert_view").attr("onclick", "window.vf.draw_moniview()").html("Monitor View");
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

    // Public API
    return {
        typedArrayToBuffer,
        arrayBufferToString,
        buf2str,
        parse_fmt,
        buf2data,
        formatTime,
        formatValue,
        roundedRect,
        updateFrame,
        _progress,
        preloader
    };
})();

// Export to global scope
window.Utils = Utils;