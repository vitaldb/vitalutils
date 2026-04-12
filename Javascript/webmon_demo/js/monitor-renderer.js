/**
 * monitor-renderer.js
 * Canvas-based vital signs monitor renderer
 * Height is dynamic based on content (like VitalServer websocket.js room_height)
 */

class MonitorRenderer {
    constructor(canvas, vitalFile) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.vf = vitalFile;
        this.montypeTrackMap = vitalFile.montypeTrackMap;
        this.roomHeight = 270; // logical height in 800px coordinate system, will be recalculated
    }

    /**
     * Main draw entry point
     * @param {number} playerTime - relative time in seconds from case start
     */
    draw(playerTime) {
        const canvas = this.canvas;
        const ctx = this.ctx;
        const clientWidth = canvas.clientWidth;
        if (clientWidth <= 0) return;

        const LOGICAL_WIDTH = 800;

        // Calculate desired pixel height from logical room_height
        const desiredHeight = Math.round(clientWidth * this.roomHeight / LOGICAL_WIDTH);
        if (canvas.clientHeight !== desiredHeight) {
            canvas.style.height = desiredHeight + 'px';
        }

        // Set canvas resolution to match display
        const dpr = window.devicePixelRatio || 1;
        canvas.width = clientWidth * dpr;
        canvas.height = desiredHeight * dpr;

        // Clear
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Scale so we draw in logical 800px coordinate space
        ctx.save();
        const scaleFactor = clientWidth / LOGICAL_WIDTH * dpr;
        ctx.scale(scaleFactor, scaleFactor);

        // Now draw in 800px logical coordinates
        let rcx = 0;
        let rcy = 65;
        const wavWidth = LOGICAL_WIDTH - PAR_WIDTH;

        // Draw title bar
        this._drawTitle(ctx, rcx, LOGICAL_WIDTH, playerTime);

        // Draw waveform groups
        const drawnMontypes = new Set();

        for (const group of GROUPS) {
            if (!group.wav) continue;

            const wavTrack = this.montypeTrackMap[group.wav];
            if (!wavTrack || !wavTrack.prev || !wavTrack.prev.length) continue;

            drawnMontypes.add(group.wav);
            if (group.param) group.param.forEach(m => drawnMontypes.add(m));

            const isART = (group.name === 'ART');
            const rch = isART ? PAR_HEIGHT * 1.5 : PAR_HEIGHT;

            // Draw waveform
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = group.fgColor;
            this._drawWaveform(ctx, wavTrack, rcx, rcy + 5, wavWidth, rch - 10, playerTime);

            // Separator line
            ctx.lineWidth = 0.5;
            ctx.strokeStyle = '#808080';
            ctx.beginPath();
            ctx.moveTo(rcx, rcy + rch);
            ctx.lineTo(rcx + wavWidth, rcy + rch);
            ctx.stroke();

            // ART pressure gridlines
            if (isART) {
                ctx.beginPath();
                ctx.strokeStyle = '#c8c8c8';
                ctx.setLineDash([5, 15]);
                ctx.lineWidth = 2.5;
                ctx.font = '12px Arial';
                ctx.fillStyle = 'white';
                ctx.textAlign = 'right';

                ctx.textBaseline = 'top';
                ctx.fillText('160', LOGICAL_WIDTH - PAR_WIDTH - 3, rcy + 8);

                let ly = rcy + rch / 3 + 5;
                ctx.moveTo(rcx, ly);
                ctx.lineTo(LOGICAL_WIDTH - PAR_WIDTH - 40, ly);
                ctx.textBaseline = 'middle';
                ctx.fillText('120', LOGICAL_WIDTH - PAR_WIDTH - 3, ly);

                ly = rcy + rch * 2 / 3 - 5;
                ctx.moveTo(rcx, ly);
                ctx.lineTo(LOGICAL_WIDTH - PAR_WIDTH - 40, ly);
                ctx.fillText('80', LOGICAL_WIDTH - PAR_WIDTH - 3, ly);

                ctx.textBaseline = 'bottom';
                ctx.fillText('40', LOGICAL_WIDTH - PAR_WIDTH - 3, rcy + rch - 8);

                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Waveform name label
            ctx.font = '14px Arial';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(wavTrack.name, rcx + 3, rcy + 9);

            // Draw parameter box next to waveform
            this._drawParameterBox(ctx, group, rcx + wavWidth, rcy, PAR_WIDTH, PAR_HEIGHT, playerTime);

            rcy += rch;
        }

        // Draw non-waveform parameter groups
        let paramX = rcx;
        let isFirstLine = true;

        for (const group of GROUPS) {
            // Skip groups already drawn as waveforms
            if (group.wav) {
                const wavTrack = this.montypeTrackMap[group.wav];
                if (wavTrack && wavTrack.prev && wavTrack.prev.length) continue;
            }

            if (!this._groupHasData(group, playerTime)) continue;
            if (group.param) group.param.forEach(m => drawnMontypes.add(m));

            this._drawParameterBox(ctx, group, paramX, rcy, PAR_WIDTH, PAR_HEIGHT, playerTime);

            paramX += PAR_WIDTH;
            if (paramX > LOGICAL_WIDTH - PAR_WIDTH * 2) {
                paramX = rcx;
                rcy += PAR_HEIGHT;
                if (!isFirstLine) break;
                isFirstLine = false;
            }
        }

        // Finalize dynamic height
        if (paramX > rcx) rcy += PAR_HEIGHT;
        if (this.roomHeight !== rcy) {
            this.roomHeight = rcy;
        }

        ctx.restore();
    }

    /**
     * Draw the title bar (case label + elapsed time + devices)
     */
    _drawTitle(ctx, x, canvasWidth, playerTime) {
        // Case label
        ctx.font = 'bold 36px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        const label = this.vf.label || 'Case ' + this.vf.caseId;
        ctx.fillText(label, x + 4, 45);

        let devX = x + ctx.measureText(label).width + 15;

        // Device indicators
        ctx.font = '15px Arial';
        for (const devId in this.vf.devs) {
            const dev = this.vf.devs[devId];
            if (!dev.name) continue;

            ctx.fillStyle = '#348EC7';
            Utils.roundedRect(ctx, devX, 36, 12, 12, 3);
            ctx.fill();
            devX += 17;

            ctx.fillStyle = '#FFFFFF';
            const name = dev.name.substr(0, 7);
            ctx.fillText(name, devX, 48);
            devX += ctx.measureText(name).width + 13;
        }

        // Elapsed time (right side)
        const timeStr = Utils.formatTime(Math.floor(playerTime));
        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = '#AAAAAA';
        ctx.textAlign = 'right';
        ctx.fillText(timeStr, canvasWidth - 5, 48);

        // Divider
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 58);
        ctx.lineTo(canvasWidth, 58);
        ctx.stroke();
    }

    /**
     * Draw a scrolling waveform track
     * All waveforms are pre-downsampled to 100Hz: 1 sample = 1 pixel.
     * Display time = width / 100 seconds (e.g. 640px = 6.4 seconds).
     */
    _drawWaveform(ctx, track, x, y, width, height, playerTime) {
        if (!track.prev || !track.srate) return;

        const data = track.prev;
        const srate = track.srate; // always 100 after downsampling

        const endIdx = Math.floor(playerTime * srate);
        const startIdx = endIdx - Math.floor(width);

        ctx.beginPath();
        let isFirst = true;
        let lastPx = x;
        let py = 0;
        let px = 0;

        for (let idx = Math.max(0, startIdx); idx <= endIdx && idx < data.length; idx++) {
            const val = data[idx];
            if (val === 0) continue;

            px = x + width - (endIdx - idx);
            py = y + height * (255 - val) / 254;
            py = Math.max(y, Math.min(y + height, py));

            if (isFirst) {
                if (px < x + 10) {
                    ctx.moveTo(x, py);
                    ctx.lineTo(px, py);
                } else {
                    ctx.moveTo(px, py);
                }
                isFirst = false;
            } else if (px - lastPx > 10) {
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(px, py);
            } else {
                ctx.lineTo(px, py);
            }
            lastPx = px;
        }

        if (!isFirst && px > x + width - 10) {
            ctx.lineTo(x + width, py);
        }
        ctx.stroke();

        if (!isFirst && px > x + width - 4) {
            ctx.fillStyle = 'white';
            ctx.fillRect(x + width - 4, py - 2, 4, 4);
        }
    }

    /**
     * Draw a parameter box for a group
     */
    _drawParameterBox(ctx, group, x, y, w, h, playerTime) {
        const values = this._collectValues(group, playerTime);
        if (!values.length) return false;

        const processed = this._processSpecialFormats(group, values);
        const layout = PARAM_LAYOUTS[group.paramLayout];
        if (!layout) return false;

        const color = this._getColor(group, processed);

        // Box border
        ctx.strokeStyle = '#808080';
        ctx.lineWidth = 0.5;
        Utils.roundedRect(ctx, x, y, w, h, 0);
        ctx.stroke();

        // Draw each layout element
        for (let i = 0; i < layout.length && i < processed.length; i++) {
            const el = layout[i];
            const { name, value } = processed[i];

            if (el.value && value !== '' && value !== undefined) {
                ctx.font = `${el.value.fontsize}px Arial`;
                ctx.fillStyle = color;
                ctx.textAlign = el.value.align || 'left';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(value, x + el.value.x, y + el.value.y);
            }

            if (el.name && name) {
                ctx.font = '14px Arial';
                ctx.fillStyle = 'white';
                ctx.textAlign = el.name.align || 'left';
                ctx.textBaseline = el.name.baseline || 'alphabetic';

                const measured = ctx.measureText(name).width;
                if (measured > 75) {
                    ctx.save();
                    ctx.scale(75 / measured, 1);
                    ctx.fillText(name, (x + el.name.x) * measured / 75, y + el.name.y);
                    ctx.restore();
                } else {
                    ctx.fillText(name, x + el.name.x, y + el.name.y);
                }
            }
        }
        return true;
    }

    _collectValues(group, playerTime) {
        if (!group.param) return [];
        const result = [];
        let hasAny = false;

        for (const montype of group.param) {
            const trk = this.montypeTrackMap[montype];
            if (trk && trk.data) {
                const val = this._findLatestValue(trk, playerTime);
                if (val !== null) {
                    result.push({ name: trk.name, value: Utils.formatValue(val, trk.type) });
                    hasAny = true;
                } else {
                    result.push({ name: trk.name, value: '' });
                }
            } else {
                result.push({ name: montype, value: '' });
            }
        }
        return hasAny ? result : [];
    }

    _findLatestValue(track, playerTime) {
        if (!track.data || !track.data.length) return null;
        for (let i = 0; i < track.data.length; i++) {
            if (track.data[i][0] > playerTime) {
                if (i > 0 && track.data[i - 1][0] > playerTime - 300) return track.data[i - 1][1];
                return null;
            }
        }
        const last = track.data[track.data.length - 1];
        if (last[0] > playerTime - 300) return last[1];
        return null;
    }

    _processSpecialFormats(group, values) {
        if (!values.length) return values;
        const v = values.map(x => ({ ...x }));

        if (group.name && group.name.startsWith('AGENT') && v.length > 1) {
            const agentVal = (v[1].value || '').toUpperCase();
            const abbr = { DESF: 'DES', ISOF: 'ISO', ENFL: 'ENF' };
            if (abbr[agentVal]) v[1].value = abbr[agentVal];
        }

        if (group.paramLayout === 'BP' && v.length > 2) {
            v[0].name = group.name || '';
            v[0].value = (v[0].value ? Math.round(v[0].value) : ' ') +
                (v[1].value ? '/' + Math.round(v[1].value) : ' ');
            v[1] = v[2];
            v[1].value = v[1].value ? Math.round(v[1].value) : '';
            v.pop();
        } else if (!v[0].name || v[0].name === group.param[0]) {
            v[0].name = group.name || v[0].name;
        }

        return v;
    }

    _getColor(group, values) {
        if (values[0] && values[0].name === 'HPI') return '#00FFFF';
        if (group.name && group.name.startsWith('AGENT') && values.length > 1) {
            const colorMap = { DES: '#2296E6', ISO: '#DDA0DD', ENF: '#FF0000' };
            if (colorMap[values[1].value]) return colorMap[values[1].value];
        }
        return group.fgColor;
    }

    _groupHasData(group, playerTime) {
        if (!group.param) return false;
        for (const montype of group.param) {
            const trk = this.montypeTrackMap[montype];
            if (trk && trk.data && this._findLatestValue(trk, playerTime) !== null) return true;
        }
        return false;
    }
}
