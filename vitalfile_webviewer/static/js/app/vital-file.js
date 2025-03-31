/**
 * vital-file.js
 * VitalFile class that handles loading and parsing vital files
 */

/**
 * VitalFile constructor
 * Creates and initializes a new vital file parser
 * 
 * @param {File|Blob} file - The vital file to parse
 * @param {string} filename - The name of the file
 */
function VitalFile(file, filename) {
    // Initialize properties
    this.loadPromise = null;
    this.filename = filename;
    this.bedname = filename.substr(0, filename.length - 20);
    this.devs = { 0: {} };
    this.trks = {};
    this.dtstart = 0;
    this.dtend = 0;
    this.dgmt = 0;

    // Begin loading the file
    this.load_vital(file);
}

// VitalFile prototype methods
VitalFile.prototype = {
    /**
     * Loads and parses a vital file
     * @param {File|Blob} file - The vital file to parse
     * @returns {Promise} - Resolves when parsing is complete
     */
    load_vital: async function (file) {
        const self = this;
        const fileReader = new FileReader();

        // Create a Promise that will resolve when loading is complete
        this.loadPromise = new Promise((resolve, reject) => {
            fileReader.onloadend = async function (e) {
                if (e.target.error) {
                    reject(e.target.error);
                    return;
                }

                try {
                    // Decompress file contents
                    let data = pako.inflate(e.target.result);
                    data = Utils.typedArrayToBuffer(data);

                    // Validate file signature
                    const signature = Utils.arrayBufferToString(data.slice(0, 4));
                    if (signature !== "VITA") {
                        throw new Error("Invalid vital file");
                    }

                    // Skip signature and reserved bytes
                    let pos = 4 + 4;

                    // Read header length and skip header
                    let headerLength;
                    [headerLength, pos] = Utils.buf2data(data, pos, 2, 1);
                    pos += headerLength;

                    await Utils._progress(self.filename, pos, data.byteLength);

                    // Parse packets
                    await self.parsePackets(data, pos);

                    // Process parsed data
                    await Utils._progress(self.filename, data.byteLength, data.byteLength);
                    await self.justify_recs();
                    await self.sort_tracks();

                    resolve();
                } catch (error) {
                    console.error("Error parsing vital file:", error);
                    reject(error);
                }
            };

            // Start reading the file
            fileReader.readAsArrayBuffer(file);

            // Return the Promise so callers can await it
            return this.loadPromise;
        });
    },

    /**
     * Parse packets from the vital file
     * @param {ArrayBuffer} data - The file data
     * @param {number} startPos - The starting position for parsing
     * @returns {Promise} - Resolves when parsing is complete
     */
    parsePackets: async function (data, startPos) {
        let pos = startPos;
        let progressFlag = data.byteLength / 15.0;
        const isLargeFile = data.byteLength > 31457280; // 30MB

        // Process packets until end of file
        while (pos + 5 < data.byteLength) {
            // Read packet header
            let packetType, packetLength;
            [packetType, pos] = Utils.buf2data(data, pos, 1, 1, true);
            [packetLength, pos] = Utils.buf2data(data, pos, 4, 1);

            // Extract packet data
            const packet = data.slice(pos - 5, pos + packetLength);
            if (data.byteLength < pos + packetLength) {
                break;
            }

            // Save position to restore after packet processing
            const dataPos = pos;

            // Process packet based on type
            await this.processPacket(packet, packetType);

            // Move to next packet
            pos = dataPos + packetLength;

            // Update progress for large files
            if (isLargeFile && pos >= progressFlag) {
                await Utils._progress(this.filename, pos, data.byteLength);
                progressFlag += data.byteLength / 15.0;
            }
        }
    },

    /**
     * Process a single packet
     * @param {ArrayBuffer} packet - The packet data
     * @param {number} packetType - The type of packet
     */
    processPacket: async function (packet, packetType) {
        let ppos = 5; // Skip packet header

        switch (packetType) {
            case 9: // Device info
                this.processDeviceInfo(packet, ppos);
                break;

            case 0: // Track info
                this.processTrackInfo(packet, ppos);
                break;

            case 1: // Record data
                this.processRecord(packet, ppos);
                break;

            case 6: // Command
                this.processCommand(packet, ppos);
                break;
        }
    },

    /**
     * Process a device info packet
     * @param {ArrayBuffer} packet - The packet data
     * @param {number} startPos - The starting position in the packet
     */
    processDeviceInfo: function (packet, startPos) {
        let ppos = startPos;
        let deviceId, deviceType, deviceName, devicePort;

        // Read device ID
        [deviceId, ppos] = Utils.buf2data(packet, ppos, 4, 1);

        // Read device info strings
        devicePort = "";
        [deviceType, ppos] = Utils.buf2str(packet, ppos);
        [deviceName, ppos] = Utils.buf2str(packet, ppos);
        [devicePort, ppos] = Utils.buf2str(packet, ppos);

        // Store device info
        this.devs[deviceId] = {
            "name": deviceName,
            "type": deviceType,
            "port": devicePort
        };
    },

    /**
     * Process a track info packet
     * @param {ArrayBuffer} packet - The packet data
     * @param {number} startPos - The starting position in the packet
     */
    processTrackInfo: function (packet, startPos) {
        let ppos = startPos;

        // Read track ID and type information
        let trackId, trackType, formatType;
        [trackId, ppos] = Utils.buf2data(packet, ppos, 2, 1);
        [trackType, ppos] = Utils.buf2data(packet, ppos, 1, 1, true);
        [formatType, ppos] = Utils.buf2data(packet, ppos, 1, 1, true);

        // Read track name and unit
        let trackName, unit;
        [trackName, ppos] = Utils.buf2str(packet, ppos);
        [unit, ppos] = Utils.buf2str(packet, ppos);

        // Read track display parameters
        let minDisplay, maxDisplay, color, sampleRate;
        [minDisplay, ppos] = Utils.buf2data(packet, ppos, 4, 1, true, "float");
        [maxDisplay, ppos] = Utils.buf2data(packet, ppos, 4, 1, true, "float");
        [color, ppos] = Utils.buf2data(packet, ppos, 4, 1);
        [sampleRate, ppos] = Utils.buf2data(packet, ppos, 4, 1, true, "float");

        // Read scaling parameters
        let gain, offset;
        [gain, ppos] = Utils.buf2data(packet, ppos, 8, 1);
        [offset, ppos] = Utils.buf2data(packet, ppos, 8, 1);

        // Read monitor type and device ID
        let monitorType, deviceId;
        [monitorType, ppos] = Utils.buf2data(packet, ppos, 1, 1, true);
        [deviceId, ppos] = Utils.buf2data(packet, ppos, 4, 1);

        // Create fully qualified track name
        let deviceName = "";
        let fullTrackName = "";

        if (deviceId && deviceId in this.devs) {
            deviceName = this.devs[deviceId]["name"];
            fullTrackName = deviceName + "/" + trackName;
        } else {
            fullTrackName = trackName;
        }

        // Store track info
        this.trks[trackId] = {
            "name": trackName,
            "dtname": fullTrackName,
            "type": trackType,
            "fmt": formatType,
            "unit": unit,
            "srate": sampleRate,
            "mindisp": minDisplay,
            "maxdisp": maxDisplay,
            "col": color,
            "montype": monitorType,
            "gain": gain,
            "offset": offset,
            "did": deviceId,
            "recs": [],
            "tid": trackId
        };
    },

    /**
     * Process a record data packet
     * @param {ArrayBuffer} packet - The packet data
     * @param {number} startPos - The starting position in the packet
     */
    processRecord: function (packet, startPos) {
        let ppos = startPos + 2; // Skip reserved field

        // Read timestamp and track ID
        let timestamp, trackId;
        [timestamp, ppos] = Utils.buf2data(packet, ppos, 8, 1);
        [trackId, ppos] = Utils.buf2data(packet, ppos, 2, 1);

        // Update time boundaries
        if (this.dtstart === 0 || (timestamp > 0 && timestamp < this.dtstart)) {
            this.dtstart = timestamp;
        }
        if (timestamp > this.dtend) {
            this.dtend = timestamp;
        }

        // Get the track
        const track = this.trks[trackId];
        if (!track) return;

        // Process based on track type
        if (track.type === 1) { // Waveform data
            this.processWaveformRecord(packet, ppos, timestamp, track);
        } else if (track.type === 2) { // Numeric data
            this.processNumericRecord(packet, ppos, timestamp, track);
        } else if (track.type === 5) { // String data
            this.processStringRecord(packet, ppos, timestamp, track);
        }
    },

    /**
     * Process a waveform record
     * @param {ArrayBuffer} packet - The packet data
     * @param {number} startPos - The starting position in the packet
     * @param {number} timestamp - The record timestamp
     * @param {Object} track - The track object
     */
    processWaveformRecord: function (packet, startPos, timestamp, track) {
        let ppos = startPos;

        // Get format information
        const [formatCode, formatLength] = Utils.parse_fmt(track.fmt);

        // Read sample count
        let sampleCount;
        [sampleCount, ppos] = Utils.buf2data(packet, ppos, 4, 1);

        // Update end time if needed
        if (timestamp + (sampleCount / track.srate) > this.dtend) {
            this.dtend = timestamp + (sampleCount / track.srate);
        }

        // Read samples based on format
        let samples;
        const dataSlice = packet.slice(ppos, ppos + sampleCount * formatLength);

        if (formatCode === "f") {
            samples = new Float32Array(dataSlice);
        } else if (formatCode === "d") {
            samples = new Float64Array(dataSlice);
        } else if (formatCode === "b") {
            samples = new Int8Array(dataSlice);
        } else if (formatCode === "B") {
            samples = new Uint8Array(dataSlice);
        } else if (formatCode === "h") {
            samples = new Int16Array(dataSlice);
        } else if (formatCode === "H") {
            samples = new Uint16Array(dataSlice);
        } else if (formatCode === "l") {
            samples = new Int32Array(dataSlice);
        } else if (formatCode === "L") {
            samples = new Uint32Array(dataSlice);
        }

        // Store the record
        track.recs.push({ "dt": timestamp, "val": samples });
    },

    /**
     * Process a numeric record
     * @param {ArrayBuffer} packet - The packet data
     * @param {number} startPos - The starting position in the packet
     * @param {number} timestamp - The record timestamp
     * @param {Object} track - The track object
     */
    processNumericRecord: function (packet, startPos, timestamp, track) {
        let ppos = startPos;

        // Get format information
        const [formatCode, formatLength] = Utils.parse_fmt(track.fmt);

        // Read value based on format
        let value;

        if (formatCode === "f") {
            [value, ppos] = Utils.buf2data(packet, ppos, formatLength, 1, true, "float");
        } else if (formatCode === "d") {
            [value, ppos] = Utils.buf2data(packet, ppos, formatLength, 1);
        } else if (formatCode === "b" || formatCode === "h" || formatCode === "l") {
            [value, ppos] = Utils.buf2data(packet, ppos, formatLength, 1, true);
        } else if (formatCode === "B" || formatCode === "H" || formatCode === "L") {
            [value, ppos] = Utils.buf2data(packet, ppos, formatLength, 1);
        }

        // Store the record
        track.recs.push({ "dt": timestamp, "val": value });
    },

    /**
     * Process a string record
     * @param {ArrayBuffer} packet - The packet data
     * @param {number} startPos - The starting position in the packet
     * @param {number} timestamp - The record timestamp
     * @param {Object} track - The track object
     */
    processStringRecord: function (packet, startPos, timestamp, track) {
        let ppos = startPos + 4; // Skip length field

        // Read string value
        let value;
        [value, ppos] = Utils.buf2str(packet, ppos);

        // Store the record
        track.recs.push({ "dt": timestamp, "val": value });
    },

    /**
     * Process a command packet
     * @param {ArrayBuffer} packet - The packet data
     * @param {number} startPos - The starting position in the packet
     */
    processCommand: function (packet, startPos) {
        let ppos = startPos;

        // Read command type
        let commandType;
        [commandType, ppos] = Utils.buf2data(packet, ppos, 1, 1, true);

        if (commandType === 6) { // Reset events
            const eventTrack = this.find_track("/EVENT");
            if (eventTrack) {
                eventTrack.recs = [];
            }
        } else if (commandType === 5) { // Track order
            let count;
            [count, ppos] = Utils.buf2data(packet, ppos, 2, 1);
            this.trkorder = new Uint16Array(packet.slice(ppos, ppos + count * 2));
        }
    },

    /**
     * Get the color for a track
     * @param {string} trackId - The track ID
     * @returns {string} - The color as a hex string
     */
    get_color: function (trackId) {
        if (trackId in this.trks) {
            // Convert numeric color to hex string
            return "#" + ("0" + (Number(this.trks[trackId].col).toString(16))).slice(3).toUpperCase();
        }
        throw new Error(trackId + " does not exist in track list");
    },

    /**
     * Get the monitor type for a track
     * @param {string} trackId - The track ID
     * @returns {string} - The monitor type string
     */
    get_montype: function (trackId) {
        if (trackId in this.trks) {
            const monitorType = this.trks[trackId].montype;
            if (monitorType in CONSTANTS.MONTYPES) {
                return CONSTANTS.MONTYPES[monitorType];
            }
            return "";
        }
        throw new Error(trackId + " does not exist in track list");
    },

    /**
     * Get all track names
     * @returns {Array} - Array of track names
     */
    get_track_names: function () {
        return Object.values(this.trks)
            .filter(track => track.dtname)
            .map(track => track.dtname);
    },

    /**
     * Find a track by name
     * @param {string} fullTrackName - The track name (optionally with device prefix)
     * @returns {Object|null} - The track object or null if not found
     */
    find_track: function (fullTrackName) {
        // Split device and track name if provided
        let deviceName = "";
        let trackName = fullTrackName;

        if (fullTrackName.includes("/")) {
            [deviceName, trackName] = fullTrackName.split("/");
        }

        // Search through all tracks
        for (const trackId in this.trks) {
            const track = this.trks[trackId];

            if (track.name === trackName) {
                const deviceId = track.did;

                // Match if either no device is specified or the device matches
                if (deviceId === 0 || deviceName === "") {
                    return track;
                }

                if (deviceId in this.devs) {
                    const device = this.devs[deviceId];
                    if (device.name && deviceName === device.name) {
                        return track;
                    }
                }
            }
        }

        return null;
    },

    /**
     * Process raw records into display-ready data
     */
    justify_recs: function () {
        const fileLength = this.dtend - this.dtstart;

        for (const trackId in this.trks) {
            const track = this.trks[trackId];
            if (track.recs.length <= 0) continue;

            // Sort records by time
            track.recs.sort((a, b) => a.dt - b.dt);

            // Handle different track types
            if (track.type === 1) {
                this.processWaveformData(track, fileLength, trackId);
            } else {
                this.processNonWaveformData(track, trackId);
            }
        }
    },

    /**
     * Process waveform data for display
     * @param {Object} track - The track object
     * @param {number} fileLength - The file length in seconds
     * @param {string} trackId - The track ID
     */
    processWaveformData: function (track, fileLength, trackId) {
        // Calculate the number of samples needed
        const totalSamples = Math.ceil(track.srate * fileLength);
        const samples = new Uint8Array(totalSamples);

        // Calculate display scaling factors
        const minCount = (track.mindisp - track.offset) / track.gain;
        const maxCount = (track.maxdisp - track.offset) / track.gain;
        const range = maxCount - minCount;

        // Process each record
        for (const rec of track.recs) {
            if (!rec.val || typeof rec.val !== "object") {
                continue;
            }

            // Calculate starting index for this record
            let index = Math.floor((rec.dt - this.dtstart) * track.srate);

            // Process each sample in the record
            for (let i = 0; i < rec.val.length; i++) {
                const value = rec.val[i];

                if (value === 0) {
                    samples[index] = 0; // Gap marker
                } else {
                    // Scale value to 1-255 range (0 reserved for gaps)
                    let scaledValue = (value - minCount) / range * 254 + 1;
                    samples[index] = Math.max(1, Math.min(255, scaledValue));
                }

                index++;
            }
        }

        // Store processed data
        this.trks[trackId].prev = samples;
    },

    /**
     * Process non-waveform (numeric or string) data for display
     * @param {Object} track - The track object
     * @param {string} trackId - The track ID
     */
    processNonWaveformData: function (track, trackId) {
        // Convert records to [time, value] pairs
        const data = track.recs.map(rec => [
            rec.dt - this.dtstart, // Relative time
            rec.val                // Value
        ]);

        // Store processed data
        this.trks[trackId].data = data;
    },

    /**
     * Sort tracks into a consistent display order
     */
    sort_tracks: function () {
        const orderedTracks = {};

        // Group tracks by device first
        for (const trackId in this.trks) {
            const track = this.trks[trackId];
            const deviceName = track.dtname.split("/")[0];

            // Store device name for later use
            this.trks[trackId].dname = deviceName;

            // Calculate sorting order based on device priority
            let orderKey;
            const deviceOrder = CONSTANTS.DEVICE_ORDERS.indexOf(deviceName);

            if (deviceOrder === -1) {
                orderKey = '99' + deviceName; // Unknown devices at the end
            } else if (deviceOrder < 10) {
                orderKey = '0' + deviceOrder + deviceName; // Pad single digits
            } else {
                orderKey = deviceOrder + deviceName;
            }

            // Initialize device grouping if needed
            if (!orderedTracks[orderKey]) {
                orderedTracks[orderKey] = {};
            }

            // Group tracks by device, sorted by name
            orderedTracks[orderKey][track.name] = trackId;
        }

        // Create flat sorted list of tracks
        const sortedTracks = [];
        const orderedDeviceKeys = Object.keys(orderedTracks).sort();

        // For each device, add its tracks in alphabetical order
        for (const deviceKey of orderedDeviceKeys) {
            const trackNames = Object.keys(orderedTracks[deviceKey]).sort();

            for (const trackName of trackNames) {
                sortedTracks.push(orderedTracks[deviceKey][trackName]);
            }
        }

        // Calculate track positions for rendering
        let positionY = CONSTANTS.DEVICE_HEIGHT;
        let lastDeviceName = "";

        for (let i = 0; i < sortedTracks.length; i++) {
            const trackId = sortedTracks[i];
            const track = this.trks[trackId];
            const deviceName = track.dname;

            // Add spacing between devices
            if (deviceName !== lastDeviceName) {
                lastDeviceName = deviceName;
                positionY += CONSTANTS.DEVICE_HEIGHT;
            }

            // Store track position
            track.ty = positionY;

            // Set track height based on type
            track.th = (track.ttype === 'W') ? 40 : 24;

            // Move to next track position
            positionY += track.th;
        }

        // Store the sorted track IDs
        this.sortedTids = sortedTracks;
        this.trackViewHeight = positionY;
    },

    /**
     * Draw a specific track
     * @param {string} trackId - The track ID to draw
     * @returns {boolean} - Success status
     */
    draw_track: function (trackId) {
        return TrackView.drawTrack(trackId);
    },

    /**
     * Switch to track view mode
     */
    draw_trackview: function () {
        // Set global state
        window.view = "track";
        window.vf = this;

        // Show track view elements
        $("#moni_preview").hide();
        $("#moni_control").hide();
        $("#file_preview").show();
        $("#fit_width").show();
        $("#fit_100px").show();
        $("#convert_view")
            .attr("onclick", "window.vf.draw_moniview()")
            .html("Monitor View");

        // Initialize track view
        const canvas = document.getElementById('file_preview');
        TrackView.initialize(this, canvas);

        // Update UI if tracks were found
        if (this.sortedTids.length > 0) {
            $("#span_preview_caseid").html(this.filename);
            $("#div_preview").css('display', '');
            $("#btn_preview").css('display', '');
        }
    },

    /**
     * Switch to monitor view mode
     */
    draw_moniview: function () {
        // Set global state
        window.view = "moni";
        window.vf = this;

        // Get canvas and initialize monitor view
        const canvas = document.getElementById('moni_preview');
        MonitorView.initialize(this, canvas);

        // Show monitor view elements
        $("#span_preview_caseid").html(this.filename);
        $("#file_preview").hide();
        $("#moni_preview").show();
        $("#moni_control").show();
        $("#fit_width").hide();
        $("#fit_100px").hide();
        $("#btn_preview").show();
        $("#convert_view")
            .attr("onclick", "window.vf.draw_trackview()")
            .html("Track View");
    }
};

// Export to global scope
window.VitalFile = VitalFile;