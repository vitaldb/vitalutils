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
        const dropdown = document.getElementById('file_history_dropdown');
        if (dropdown.style.display == 'none') {
            updateFileHistoryDropdown();
            dropdown.style.display = 'block';
            // Add click outside listener
            setTimeout(() => {
                document.addEventListener('click', closeFileHistoryOnClickOutside);
            }, 0);
        } else {
            dropdown.style.display = 'none';
            document.removeEventListener('click', closeFileHistoryOnClickOutside);
        }
    }

    /**
     * Close dropdown when clicking outside
     * @param {Event} event - Click event
     */
    function closeFileHistoryOnClickOutside(event) {
        const dropdown = document.getElementById('file_history_dropdown');
        const button = document.getElementById('current_file_btn');

        if (!dropdown.contains(event.target) && !button.contains(event.target)) {
            dropdown.style.display = 'none';
            document.removeEventListener('click', closeFileHistoryOnClickOutside);
        }
    }

    /**
     * Update the file history dropdown with loaded files
     */
    function updateFileHistoryDropdown() {
        const historyContainer = document.getElementById('file_history_items');
        historyContainer.innerHTML = '';

        // Check if files exist in window object
        if (window.files && Object.keys(window.files).length > 0) {
            // Add each file to the dropdown
            Object.keys(window.files).forEach(filename => {
                const item = document.createElement('div');
                item.className = 'file-history-item';
                item.style.padding = '8px 10px';
                item.style.borderBottom = '1px solid #444';
                item.style.cursor = 'pointer';
                item.style.whiteSpace = 'nowrap';
                item.style.overflow = 'hidden';
                item.style.textOverflow = 'ellipsis';

                // Highlight current file
                if (window.vf && window.vf.filename === filename) {
                    item.style.backgroundColor = '#444';
                }

                // Hover effect
                item.onmouseover = function () {
                    if (window.vf && window.vf.filename !== filename) {
                        this.style.backgroundColor = '#3a3a3a';
                    }
                };
                item.onmouseout = function () {
                    if (window.vf && window.vf.filename !== filename) {
                        this.style.backgroundColor = '';
                    }
                };

                // Switch to this file when clicked
                item.onclick = function () {
                    switchToFile(filename);
                    document.getElementById('file_history_dropdown').style.display = 'none';
                };

                // Create item with filename and delete button
                const fileText = document.createElement('span');
                fileText.textContent = filename;
                fileText.style.color = '#fff';
                item.appendChild(fileText);

                // Add delete button
                const deleteBtn = document.createElement('i');
                deleteBtn.className = 'fa fa-times';
                deleteBtn.style.float = 'right';
                deleteBtn.style.color = '#aaa';
                deleteBtn.style.marginLeft = '10px';
                deleteBtn.style.padding = '3px 0';
                deleteBtn.title = 'Remove from history';

                deleteBtn.onmouseover = function (e) {
                    this.style.color = '#ff6b6b';
                    e.stopPropagation();
                };
                deleteBtn.onmouseout = function (e) {
                    this.style.color = '#aaa';
                    e.stopPropagation();
                };

                deleteBtn.onclick = function (e) {
                    removeFileFromHistory(filename);
                    e.stopPropagation();
                };

                item.appendChild(deleteBtn);
                historyContainer.appendChild(item);
            });
        } else {
            // No files in history
            const noFiles = document.createElement('div');
            noFiles.style.padding = '10px';
            noFiles.style.color = '#aaa';
            noFiles.style.fontStyle = 'italic';
            noFiles.style.textAlign = 'center';
            noFiles.textContent = 'No files in history';
            historyContainer.appendChild(noFiles);
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
                window.vf.draw_moniview();
            } else {
                window.vf.draw_trackview();
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
     * @param {HTMLElement} statusElement - Element to display status
     * @returns {Promise} - Resolves when all files are processed
     */
    async function processFileBatch(files, index, statusElement) {
        // All files processed
        if (index >= files.length) {
            if (statusElement) {
                // Update complete message and fade out
                statusElement.innerHTML = `Completed processing ${files.length} files`;
                setTimeout(() => {
                    $(statusElement).fadeOut(1000);
                }, 2000);
            }
            return;
        }

        const file = files[index];

        // Update status for multiple files
        if (statusElement && files.length > 1) {
            statusElement.innerHTML = `Processing ${index + 1}/${files.length}: ${file.name}`;
        }

        try {
            // Process current file
            const filename = await processFile(file);

            // Show the first file or if only one file
            if (index === files.length - 1) {
                switchToFile(filename);
            }

            // Process next file
            await processFileBatch(files, index + 1, statusElement);

        } catch (error) {
            console.error(`Error processing file ${file.name}:`, error);

            // Show alert only for single file loads
            if (files.length === 1) {
                alert(`⚠️ Failed to load file: ${file.name}`);
            }

            // Continue with next file after error
            await processFileBatch(files, index + 1, statusElement);
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
        const processingContainer = document.getElementById('processing_status');
        if (vitalFiles.length > 1 && processingContainer) {
            processingContainer.innerHTML = `Processing 0/${vitalFiles.length} files...`;
            processingContainer.style.display = 'block';
        }

        // Make sure playback is paused
        MonitorView.pauseResume(true);

        // Initialize files container
        if (!window.files) {
            window.files = {};
        }

        // Process files
        processFileBatch(vitalFiles, 0, processingContainer);

        // Hide drop message
        $("#drop_message").hide();
    }

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

        // Initialize files container
        if (!window.files) {
            window.files = {};
        }

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
        const fileNameElement = document.getElementById('span_preview_caseid');
        if (fileNameElement) {
            observer.observe(fileNameElement, { childList: true });
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
        },

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