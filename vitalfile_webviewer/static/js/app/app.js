/**
 * app.js
 * Main application module for VitalFile viewer
 */

// Main application module
const VitalFileViewer = (function () {
    /**
     * Toggle file history dropdown visibility
     */
    function toggleFileHistory() {
        const $dropdown = $('#file_history_dropdown');
        if ($dropdown.css('display') === 'none') {
            updateFileHistoryDropdown();
            $dropdown.show();
            // Add click outside listener
            setTimeout(() => {
                $(document).on('click', closeFileHistoryOnClickOutside);
            }, 0);
        } else {
            $dropdown.hide();
            $(document).off('click', closeFileHistoryOnClickOutside);
        }
    }

    /**
     * Close dropdown when clicking outside
     * @param {Event} event - Click event
     */
    function closeFileHistoryOnClickOutside(event) {
        const $dropdown = $('#file_history_dropdown');
        const $button = $('#current_file_btn');

        if (!$dropdown[0].contains(event.target) && !$button[0].contains(event.target)) {
            $dropdown.hide();
            $(document).off('click', closeFileHistoryOnClickOutside);
        }
    }

    /**
     * Update the file history dropdown with loaded files
     */
    function updateFileHistoryDropdown() {
        const $historyContainer = $('#file_history_items');
        $historyContainer.empty();

        // Check if files exist in window object
        if (window.files && Object.keys(window.files).length > 0) {
            // Add each file to the dropdown
            Object.keys(window.files).forEach(filename => {
                const $item = $('<div>')
                    .addClass('file-history-item')
                    .css({
                        padding: '8px 10px',
                        borderBottom: '1px solid #444',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    });

                // Highlight current file
                if (window.vf && window.vf.filename === filename) {
                    $item.css('backgroundColor', '#444');
                }

                // Hover effect
                $item.hover(
                    function () {
                        if (window.vf && window.vf.filename !== filename) {
                            $(this).css('backgroundColor', '#3a3a3a');
                        }
                    },
                    function () {
                        if (window.vf && window.vf.filename !== filename) {
                            $(this).css('backgroundColor', '');
                        }
                    }
                );

                // Switch to this file when clicked
                $item.on('click', function () {
                    switchToFile(filename);
                    $('#file_history_dropdown').hide();
                });

                // Create item with filename and delete button
                const $fileText = $('<span>')
                    .text(filename)
                    .css('color', '#fff');

                $item.append($fileText);

                // Add delete button
                const $deleteBtn = $('<i>')
                    .addClass('fa fa-times')
                    .css({
                        float: 'right',
                        color: '#aaa',
                        marginLeft: '10px',
                        padding: '3px 0'
                    })
                    .attr('title', 'Remove from history');

                $deleteBtn.hover(
                    function (e) {
                        $(this).css('color', '#ff6b6b');
                        e.stopPropagation();
                    },
                    function (e) {
                        $(this).css('color', '#aaa');
                        e.stopPropagation();
                    }
                );

                $deleteBtn.on('click', function (e) {
                    removeFileFromHistory(filename);
                    e.stopPropagation();
                });

                $item.append($deleteBtn);
                $historyContainer.append($item);
            });
        } else {
            // No files in history
            const $noFiles = $('<div>')
                .css({
                    padding: '10px',
                    color: '#aaa',
                    fontStyle: 'italic',
                    textAlign: 'center'
                })
                .text('No files in history');

            $historyContainer.append($noFiles);
        }
    }

    /**
     * Switch to a file from history
     * @param {string} filename - Name of the file to switch to
     */
    function switchToFile(filename) {
        if (window.files && window.files[filename]) {
            // Set as current file
            window.vf = window.files[filename];

            // Render in current view mode
            if (window.view === 'moni') {
                window.vf.drawMoniview();
            } else {
                window.vf.drawTrackview();
            }
        }
    }

    /**
     * Remove a file from history
     * @param {string} filename - Name of the file to remove
     */
    function removeFileFromHistory(filename) {
        if (window.files && window.files[filename]) {
            // If removing the current file, switch to another if available
            const isCurrentFile = window.vf && window.vf.filename === filename;

            // Delete the file
            delete window.files[filename];

            // If removing current file, switch to another or clear the view
            if (isCurrentFile) {
                const remainingFiles = Object.keys(window.files);
                if (remainingFiles.length > 0) {
                    switchToFile(remainingFiles[0]);
                } else {
                    // No files left, clear the view
                    window.vf = null;
                    $("#div_preview").hide();
                    $("#drop_message").show();
                }
            }

            // Update the dropdown
            updateFileHistoryDropdown();
        }
    }

    /**
     * Process a file and add it to the collection
     * @param {File} file - The file to process
     * @returns {Promise} - Resolves with the filename if successful, rejects with error if not
     */
    function processFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async function (event) {
                try {
                    const arrayBuffer = event.target.result;
                    const filename = file.name;

                    // Skip if already loaded
                    if (!window.files.hasOwnProperty(filename)) {
                        const blob = new Blob([arrayBuffer]);

                        // Use VitalFile constructor with a custom callback
                        const vitalFile = new VitalFile(blob, filename);

                        // Wait for file to be fully loaded
                        if (vitalFile.loadPromise) {
                            await vitalFile.loadPromise;
                        }

                        // Store the file
                        window.files[filename] = vitalFile;
                        console.log(`✅ Successfully loaded: ${filename}`);

                        // Update the file history dropdown
                        updateFileHistoryDropdown();

                        resolve(filename);
                    } else {
                        // File already loaded
                        resolve(filename);
                    }
                } catch (e) {
                    console.error(`❌ Failed to parse file: ${file.name}`, e);
                    reject(e);
                }
            };

            reader.onerror = function (error) {
                console.error(`❌ Error reading file: ${file.name}`, error);
                reject(error);
            };

            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Process a batch of files sequentially
     * @param {Array} files - Array of files to process
     * @param {number} index - Current file index
     * @param {jQuery} $statusElement - Element to display status
     * @returns {Promise} - Resolves when all files are processed
     */
    async function processFileBatch(files, index, $statusElement) {
        // All files processed
        if (index >= files.length) {
            if ($statusElement && $statusElement.length) {
                // Update complete message and fade out
                $statusElement.html(`Completed processing ${files.length} files`);
                setTimeout(() => {
                    $statusElement.fadeOut(1000);
                }, 2000);
            }
            return;
        }

        const file = files[index];

        // Update status for multiple files
        if ($statusElement && $statusElement.length && files.length > 1) {
            $statusElement.html(`Processing ${index + 1}/${files.length}: ${file.name}`);
        }

        try {
            // Process current file
            const filename = await processFile(file);

            // Show the first file or if only one file
            if (index === files.length - 1) {
                switchToFile(filename);
            }

            // Process next file
            await processFileBatch(files, index + 1, $statusElement);

        } catch (error) {
            console.error(`Error processing file ${file.name}:`, error);

            // Show alert only for single file loads
            if (files.length === 1) {
                alert(`⚠️ Failed to load file: ${file.name}`);
            }

            // Continue with next file after error
            await processFileBatch(files, index + 1, $statusElement);
        }
    }

    /**
     * Handle file input from browse dialog or drop
     * @param {FileList} files - Files to process
     */
    function handleFileInput(files) {
        if (!files || files.length === 0) return;

        // Filter out non-vital files
        const vitalFiles = Array.from(files).filter(file => file.name.toLowerCase().endsWith(".vital"));

        if (vitalFiles.length === 0) {
            alert("⚠️ Only .vital files are allowed!");
            return;
        }

        // Display processing status if multiple files
        const $processingContainer = $('#processing_status');
        if (vitalFiles.length > 1 && $processingContainer.length) {
            $processingContainer.html(`Processing 0/${vitalFiles.length} files...`);
            $processingContainer.show();
        }

        // Hide time overlay
        TrackView.hideTimeOverlay();

        // Make sure playback is paused
        MonitorView.pauseResume(true);

        // Disable mouse event handlers
        disableMouseHandlers();

        // Initialize files container
        if (!window.files) {
            window.files = {};
        }

        // Process files
        processFileBatch(vitalFiles, 0, $processingContainer);

        // Hide drop message
        $("#drop_message").hide();
    }


    /**
     * Disable mouse event handlers during file processing
     */
    function disableMouseHandlers() {
        // Store original event handlers for TrackView
        if (window.TrackView) {
            window._storedMouseHandlers = {
                mouseup: null,
                mousedown: null,
                mousewheel: null,
                mousemove: null,
                mouseleave: null
            };

            // Store and remove event handlers
            const $canvas = $('#file_preview, #moni_preview');

            // For each event type, store and then unbind
            for (const eventType in window._storedMouseHandlers) {
                // Use jQuery's data to store event handlers
                const handlers = $._data($canvas[0], 'events');
                if (handlers && handlers[eventType]) {
                    window._storedMouseHandlers[eventType] = [...handlers[eventType]];
                    $canvas.off(eventType);
                }
            }
        }
    }

    // Initialize the app when document is ready
    function initializeApp() {
        // Set up window resize event handlers
        $(window).on('resize', function () {
            if (window.view === "moni") {
                MonitorView.onResize();
            } else {
                TrackView.onResize();
            }
        });

        // Initialize files container
        if (!window.files) {
            window.files = {};
        }

        // Set up drag and drop file handling
        const $dropOverlay = $("#drop_overlay");
        const $dropMessage = $("#drop_message");
        const $fileInput = $("#file_input");

        $dropMessage.show();
        $dropOverlay.show();

        $dropMessage.on("click", function () {
            $fileInput.click();
        });

        $fileInput.on("change", function (event) {
            handleFileInput(event.target.files);
        });

        $(document).on("dragenter", function (event) {
            event.preventDefault();
            event.stopPropagation();
            $dropOverlay.addClass("active");
            $dropMessage.addClass("d-none");
        });

        $(document).on("dragover", function (event) {
            event.preventDefault();
            event.stopPropagation();
        });

        $(document).on("dragleave", function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (event.originalEvent.clientX === 0 && event.originalEvent.clientY === 0) {
                $dropOverlay.removeClass("active");
                $dropMessage.removeClass("d-none");
            }
        });

        $(document).on("drop", function (event) {
            event.preventDefault();
            event.stopPropagation();
            $dropOverlay.removeClass("active");
            $dropMessage.removeClass("d-none");

            let files = event.originalEvent.dataTransfer.files;
            if (files.length > 0) {
                handleFileInput(files);
            }
        });

        // Set up file history dropdown button
        $("#current_file_btn").on("click", function () {
            toggleFileHistory();
        });

        // Set up observer for file name changes
        const observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                if (mutation.type === 'childList' && mutation.target.id === 'span_preview_caseid') {
                    updateFileHistoryDropdown();
                }
            });
        });

        // Start observing span_preview_caseid for changes
        const $fileNameElement = $('#span_preview_caseid');
        if ($fileNameElement.length) {
            observer.observe($fileNameElement[0], { childList: true });
        }
    }

    // Initialize the app
    $(document).ready(function () {
        // Add batch processing status
        const $originalStatus = $('#span_status');

        if ($originalStatus.length) {
            // Create processing status container
            const $processingContainer = $('<div>')
                .attr('id', 'processing_status')
                .css({
                    'display': 'none',
                    'margin-top': '10px',
                    'padding': '8px 12px',
                    'background-color': 'rgba(0,0,0,0.5)',
                    'color': '#fff'
                });

            $originalStatus.parent().append($processingContainer);
        }

        // Set up button click handlers
        $('#select_file').on('click', function () {
            $('#file_input').click();
        });

        $('#fit_width').on('click', function () {
            TrackView.fitTrackview(0);
        });

        $('#fit_100px').on('click', function () {
            TrackView.fitTrackview(1);
        });

        // Monitor view controls
        $('#moni_slider').on('change', function () {
            MonitorView.slideTo(this.value);
        }).on('input', function () {
            MonitorView.slideOn(this.value);
        });

        $('#btn_rewind_start').on('click', function () {
            MonitorView.rewind(MonitorView.getCaselen());
        });

        $('#btn_rewind').on('click', function () {
            MonitorView.rewind();
        });

        $('#moni_pause, #moni_resume').on('click', function () {
            MonitorView.pauseResume();
        });

        $('#btn_proceed').on('click', function () {
            MonitorView.proceed();
        });

        $('#btn_proceed_end').on('click', function () {
            MonitorView.proceed(MonitorView.getCaselen());
        });

        $('#play-speed').on('change', function () {
            MonitorView.setPlayspeed(this.value);
        });

        // Set default view
        window.view = "track";

        // Initialize the application
        initializeApp();
    });

    // Public API for external interaction
    return {
        // File history controls
        toggleFileHistory: toggleFileHistory,
        updateFileHistoryDropdown: updateFileHistoryDropdown,
        switchToFile: switchToFile,
        removeFileFromHistory: removeFileFromHistory,

        // Expose file handling for testing/debugging
        handleFileInput: handleFileInput
    };
})();

// Expose the module to the global scope
window.VitalFileViewer = VitalFileViewer;