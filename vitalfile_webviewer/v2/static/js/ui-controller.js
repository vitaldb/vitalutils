/**
 * UI Controller Module
 * Manages global UI interactions
 */

/**
 * Initialize the UI controller
 * @param {Object} app - The main application object
 */
export function initUIController(app) {
    // View switching
    document.getElementById('convert_view').addEventListener('click', (e) => {
        e.preventDefault();

        if (!app.vitalFileManager.currentFile) return;

        const newViewMode = app.currentView === 'track' ? 'moni' : 'track';
        app.vitalFileManager.switchView(newViewMode);
        app.currentView = newViewMode;
    });

    // Error dismiss button
    document.getElementById('error-dismiss')?.addEventListener('click', () => {
        document.getElementById('error-message').classList.add('hidden');
    });

    // Window resize handler
    window.addEventListener('resize', () => {
        if (!app.vitalFileManager.currentFile) return;
        app.vitalFileManager.currentFile.resize();
    });

    // Touch gesture support for mobile
    addTouchSupport(app);
}

/**
 * Add touch support for mobile devices
 * @param {Object} app - The main application object
 */
function addTouchSupport(app) {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartDistance = 0;

    // Touch start
    document.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            // Single touch - track position
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            // Pinch zoom
            touchStartDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        }
    });

    // Touch move
    document.addEventListener('touchmove', (e) => {
        if (!app.vitalFileManager.currentFile) return;

        if (app.currentView === 'track') {
            handleTrackViewTouchMove(e, app);
        } else if (app.currentView === 'moni') {
            handleMonitorViewTouchMove(e, app);
        }
    });

    /**
     * Handle touch move in track view
     * @param {TouchEvent} e - Touch event
     * @param {Object} app - The main application object
     */
    function handleTrackViewTouchMove(e, app) {
        const trackView = app.vitalFileManager.currentFile.trackView;

        if (e.touches.length === 1) {
            // Pan the view
            const deltaX = e.touches[0].clientX - touchStartX;
            const deltaY = e.touches[0].clientY - touchStartY;

            // Update scroll position
            const container = document.getElementById('div_preview');
            container.scrollTop -= deltaY;

            // Move tracks horizontally
            trackView.tx += deltaX;

            // Update for next move
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;

            // Redraw
            trackView.drawAllTracks();

        } else if (e.touches.length === 2) {
            // Pinch to zoom
            const currentDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );

            const ratio = currentDistance / touchStartDistance;

            // Center of the pinch
            const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;

            if (Math.abs(ratio - 1) > 0.05) {
                // Adjust track width
                trackView.is_zooming = true;
                trackView.tw *= ratio;
                trackView.tx = centerX - (centerX - trackView.tx) * ratio;

                // Update for next move
                touchStartDistance = currentDistance;

                // Redraw
                trackView.initCanvas();
                trackView.drawAllTracks();
            }
        }

        e.preventDefault();
    }

    /**
     * Handle touch move in monitor view
     * @param {TouchEvent} e - Touch event
     * @param {Object} app - The main application object
     */
    function handleMonitorViewTouchMove(e, app) {
        const monitorView = app.vitalFileManager.currentFile.monitorView;

        if (e.touches.length === 1) {
            // Single touch - scrub through time
            const deltaX = e.touches[0].clientX - touchStartX;

            // Convert delta to time
            const timeChange = deltaX / monitorView.canvas_width * monitorView.caselen * 0.1;
            monitorView.dtplayer -= timeChange;

            // Ensure within bounds
            if (monitorView.dtplayer < 0) monitorView.dtplayer = 0;
            if (monitorView.dtplayer > monitorView.caselen) {
                monitorView.dtplayer = monitorView.caselen;
            }

            // Update slider
            document.getElementById('moni_slider').value = monitorView.dtplayer;

            // Update time display
            document.getElementById('casetime').textContent =
                formatTime(Math.floor(monitorView.dtplayer)) + " / " +
                formatTime(Math.floor(monitorView.caselen));

            // Update for next move
            touchStartX = e.touches[0].clientX;

            // Redraw
            monitorView.draw();
        }

        e.preventDefault();
    }
}

/**
 * Format time in seconds to HH:MM:SS
 * @param {number} seconds - Seconds to format
 * @returns {string} - Formatted time string
 */
function formatTime(seconds) {
    const ss = seconds % 60;
    const mm = Math.floor(seconds / 60) % 60;
    const hh = Math.floor(seconds / 3600) % 24;

    return [hh, mm, ss]
        .map(v => v < 10 ? "0" + v : v)
        .filter((v, i) => v !== "00" || i > 0)
        .join(":");
}