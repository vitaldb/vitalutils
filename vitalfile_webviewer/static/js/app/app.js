/**
 * app.js
 * Main application module for VitalFile viewer
 */

// Main application module
const VitalFileViewer = (function () {
    // Initialize the app when document is ready
    function initializeApp() {
        // Set up window resize event handlers
        window.addEventListener('resize', function () {
            if (window.view === "moni") {
                MonitorView.onResize();
            } else {
                TrackView.onResize();
            }
        });

        // Set up drag and drop file handling
        const dropOverlay = $("#drop_overlay");
        const dropMessage = $("#drop_message");
        const fileInput = $("#file_input");

        dropMessage.show();
        dropOverlay.show();

        dropMessage.on("click", function () {
            fileInput.click();
        });

        fileInput.on("change", function (event) {
            handleFileInput(event.target.files);
        });

        $(document).on("dragenter", function (event) {
            event.preventDefault();
            event.stopPropagation();
            dropOverlay.addClass("active");
            dropMessage.addClass("d-none");
        });

        $(document).on("dragover", function (event) {
            event.preventDefault();
            event.stopPropagation();
        });

        $(document).on("dragleave", function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (event.originalEvent.clientX === 0 && event.originalEvent.clientY === 0) {
                dropOverlay.removeClass("active");
                dropMessage.removeClass("d-none");
            }
        });

        $(document).on("drop", function (event) {
            event.preventDefault();
            event.stopPropagation();
            dropOverlay.removeClass("active");
            dropMessage.removeClass("d-none");

            let files = event.originalEvent.dataTransfer.files;
            if (files.length > 0) {
                handleFileInput(files);
            }
        });

        function handleFileInput(files) {
            const file = files[0];
            if (!file) return;

            if (!file.name.toLowerCase().endsWith(".vital")) {
                alert("⚠️ Only .vital files are allowed!");
                return;
            }

            const reader = new FileReader();
            reader.onload = function (event) {
                const arrayBuffer = event.target.result;
                const filename = file.name;

                if (!window.files) {
                    window.files = {};
                }

                if (!window.files.hasOwnProperty(filename)) {
                    try {
                        window.isPaused = true;

                        const blob = new Blob([arrayBuffer]);
                        window.files[filename] = new VitalFile(blob, filename);
                        console.log(`✅ Successfully loaded: ${filename}`);
                    } catch (e) {
                        console.error(`❌ Failed to parse file: ${filename}`, e);
                        alert("⚠️ Failed to load the selected file.");
                    }
                } else {
                    if (window.view === "moni") {
                        window.files[filename].draw_moniview();
                    } else {
                        window.files[filename].draw_trackview();
                    }
                }
            };

            reader.readAsArrayBuffer(file);
            dropMessage.hide();
        }
    }

    // Initialize the app
    $(document).ready(function () {
        // Set default view
        window.view = "track";

        // Initialize the application
        initializeApp();
    });

    // Public API for external interaction
    return {
        // Monitor view controls
        pauseResume: function (pause) {
            return MonitorView.pauseResume(pause);
        },
        rewind: function (seconds) {
            return MonitorView.rewind(seconds);
        },
        proceed: function (seconds) {
            return MonitorView.proceed(seconds);
        },
        slideTo: function (seconds) {
            return MonitorView.slideTo(seconds);
        },
        slideOn: function (seconds) {
            return MonitorView.slideOn(seconds);
        },
        setPlayspeed: function (val) {
            return MonitorView.setPlayspeed(val);
        },
        getCaselen: function () {
            return MonitorView.getCaselen();
        },

        // Track view controls
        fitTrackview: function (type) {
            return TrackView.fitTrackview(type);
        }
    };
})();

// Expose the module to the global scope
window.VitalFileViewer = VitalFileViewer;