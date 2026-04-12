/**
 * utils.js
 * Utility functions for the Vital Monitor Demo
 * Source: vitalfile_webviewer/static/js/app/utils.js (subset)
 */

const Utils = {
    /**
     * Format seconds into HH:MM:SS
     */
    formatTime(seconds) {
        const h = Math.floor(seconds / 3600) % 24;
        const m = Math.floor(seconds / 60) % 60;
        const s = Math.floor(seconds) % 60;
        return [h, m, s].map(v => v < 10 ? '0' + v : v).join(':');
    },

    /**
     * Format a value for display based on its type
     */
    formatValue(value, type) {
        if (type === 5) return typeof value === 'string' ? (value.length > 4 ? value.slice(0, 4) : value) : '';
        if (typeof value === 'string') value = parseFloat(value);
        if (!Number.isFinite(value)) return '';
        if (Math.abs(value) >= 100 || value - Math.floor(value) < 0.05) return value.toFixed(0);
        return value.toFixed(1);
    },

    /**
     * Draw a rounded rectangle path
     */
    roundedRect(ctx, x, y, w, h, r) {
        r = r || 0;
        ctx.beginPath();
        ctx.moveTo(x, y + r);
        ctx.lineTo(x, y + h - r);
        ctx.arcTo(x, y + h, x + r, y + h, r);
        ctx.lineTo(x + w - r, y + h);
        ctx.arcTo(x + w, y + h, x + w, y + h - r, r);
        ctx.lineTo(x + w, y + r);
        ctx.arcTo(x + w, y, x + w - r, y, r);
        ctx.lineTo(x + r, y);
        ctx.arcTo(x, y, x, y + r, r);
    }
};
