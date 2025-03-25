/**
 * Utils Module
 * General utility functions used across the application
 */

/**
 * Format seconds to time string (HH:MM:SS)
 * @param {number} seconds - Seconds to format
 * @returns {string} - Formatted time string
 */
export function formatTime(seconds) {
    const ss = seconds % 60;
    const mm = Math.floor(seconds / 60) % 60;
    const hh = Math.floor(seconds / 3600) % 24;

    return [hh, mm, ss]
        .map(v => v < 10 ? "0" + v : v)
        .filter((v, i) => v !== "00" || i > 0)
        .join(":");
}

/**
 * Convert seconds to time string with date
 * @param {number} seconds - Seconds value
 * @param {number} startTime - Start time reference
 * @returns {string} - Formatted time string
 */
export function stotime(seconds, startTime) {
    const date = new Date((seconds + startTime) * 1000);
    const hh = date.getHours();
    const mm = date.getMinutes();
    const ss = date.getSeconds();

    return ("0" + hh).slice(-2) + ":" + ("0" + mm).slice(-2) + ":" + ("0" + ss).slice(-2);
}

/**
 * Format a parameter value for display
 * @param {*} value - Value to format
 * @param {number} type - Type of value
 * @returns {string} - Formatted value
 */
export function formatValue(value, type) {
    if (type === 5) {
        if (value.length > 4) {
            value = value.slice(0, 4);
        }
        return value;
    }

    if (typeof value === 'string') {
        value = parseFloat(value);
    }

    if (Math.abs(value) >= 100) {
        return value.toFixed(0);
    } else if (value - Math.floor(value) < 0.05) {
        return value.toFixed(0);
    } else {
        return value.toFixed(1);
    }
}

/**
 * Show loading indicator
 * @param {string} filename - Name of file being loaded
 */
export function showLoading(filename) {
    const loadingIndicator = document.getElementById('loading-indicator');
    const loadingFilename = document.getElementById('loading-filename');

    if (loadingFilename) {
        loadingFilename.textContent = filename;
    }

    if (loadingIndicator) {
        loadingIndicator.style.display = 'flex';
    }
}

/**
 * Update loading progress
 * @param {number} percentage - Progress percentage (0-100)
 */
export function updateLoadingProgress(percentage) {
    const loadingPercentage = document.getElementById('loading-percentage');

    if (loadingPercentage) {
        loadingPercentage.textContent = percentage + '%';
    }

    // If we have a progress bar element, update it
    const progressBar = document.querySelector('.progress-bar-fill');
    if (progressBar) {
        progressBar.style.width = percentage + '%';
    }
}

/**
 * Hide loading indicator
 */
export function hideLoading() {
    const loadingIndicator = document.getElementById('loading-indicator');

    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }
}

/**
 * Show error message
 * @param {string} message - Error message to display
 */
export function showError(message) {
    const errorMessage = document.getElementById('error-message');
    const errorText = document.querySelector('.error-text');

    if (errorText) {
        errorText.textContent = message;
    }

    if (errorMessage) {
        errorMessage.classList.remove('hidden');
    }

    // Also log to console
    console.error(message);
}

/**
 * Hide error message
 */
export function hideError() {
    const errorMessage = document.getElementById('error-message');

    if (errorMessage) {
        errorMessage.classList.add('hidden');
    }
}

/**
 * Throttle function to limit how often a function runs
 * @param {Function} func - The function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} - Throttled function
 */
export function throttle(func, limit) {
    let lastFunc;
    let lastRan;

    return function (...args) {
        const context = this;

        if (!lastRan) {
            func.apply(context, args);
            lastRan = Date.now();
        } else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(function () {
                if ((Date.now() - lastRan) >= limit) {
                    func.apply(context, args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    };
}

/**
 * Debounce function to prevent a function from being called
 * too frequently
 * @param {Function} func - The function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} - Debounced function
 */
export function debounce(func, wait) {
    let timeout;

    return function (...args) {
        const context = this;
        clearTimeout(timeout);

        timeout = setTimeout(() => {
            func.apply(context, args);
        }, wait);
    };
}

/**
 * Create a timestamp string from Date object
 * @param {Date} date - Date object
 * @returns {string} - Formatted timestamp
 */
export function formatTimestamp(date) {
    if (!date) date = new Date();

    return (
        date.getFullYear() + '-' +
        pad(date.getMonth() + 1) + '-' +
        pad(date.getDate()) + ' ' +
        pad(date.getHours()) + ':' +
        pad(date.getMinutes()) + ':' +
        pad(date.getSeconds())
    );
}

/**
 * Pad a number with leading zero if needed
 * @param {number} num - Number to pad
 * @returns {string} - Padded number
 */
function pad(num) {
    return num < 10 ? '0' + num : num;
}

/**
 * Calculate the optimal color contrast (black or white)
 * for text on a background of the given color
 * @param {string} hexColor - Hex color (e.g. "#FF0000")
 * @returns {string} - Either "#FFFFFF" or "#000000"
 */
export function getContrastColor(hexColor) {
    // Remove the hash if present
    hexColor = hexColor.replace('#', '');

    // Parse the color components
    const r = parseInt(hexColor.substr(0, 2), 16);
    const g = parseInt(hexColor.substr(2, 2), 16);
    const b = parseInt(hexColor.substr(4, 2), 16);

    // Calculate luminance using the sRGB color space
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // Return white for dark colors, black for light colors
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

/**
 * Safe parsing of JSON with error handling
 * @param {string} jsonString - JSON string to parse
 * @param {*} fallback - Fallback value if parsing fails
 * @returns {*} - Parsed object or fallback
 */
export function safeJSONParse(jsonString, fallback = {}) {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        console.error('JSON parsing error:', e);
        return fallback;
    }
}