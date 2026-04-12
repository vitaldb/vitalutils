/**
 * room-manager.js
 * Manages room cards grid, filtering, and the global animation loop
 */

class RoomManager {
    constructor(gridEl, filterListEl) {
        this.gridEl = gridEl;
        this.filterListEl = filterListEl;
        this.rooms = new Map();
        this.columns = 3;
        this._rafId = null;
        this._lastRender = 0;
    }

    addRoom(vf) {
        const el = document.createElement('div');
        el.className = 'room-card';
        el.dataset.caseId = vf.caseId;

        const canvas = document.createElement('canvas');
        canvas.className = 'room-canvas';
        el.appendChild(canvas);

        // Insert in caseId order
        let inserted = false;
        for (const child of this.gridEl.children) {
            if (parseInt(child.dataset.caseId) > vf.caseId) {
                this.gridEl.insertBefore(el, child);
                inserted = true;
                break;
            }
        }
        if (!inserted) this.gridEl.appendChild(el);

        const renderer = new MonitorRenderer(canvas, vf);
        const engine = new PlaybackEngine(vf.duration);
        engine.playerTime = Math.random() * vf.duration;

        this.rooms.set(vf.caseId, { vf, engine, renderer, canvas, card: el });
        this._addFilterItem(vf.caseId, vf.label);
    }

    _addFilterItem(caseId, label) {
        const div = document.createElement('div');
        div.className = 'filter-item';
        div.dataset.caseId = caseId;

        const lbl = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.dataset.caseId = caseId;
        cb.addEventListener('change', () => this._applyFilter());

        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(' ' + label));
        div.appendChild(lbl);

        // Insert in caseId order
        let inserted = false;
        for (const child of this.filterListEl.children) {
            if (parseInt(child.dataset.caseId) > caseId) {
                this.filterListEl.insertBefore(div, child);
                inserted = true;
                break;
            }
        }
        if (!inserted) this.filterListEl.appendChild(div);
    }

    _applyFilter() {
        const checked = new Set();
        this.filterListEl.querySelectorAll('input[type=checkbox]:checked').forEach(cb => {
            checked.add(parseInt(cb.dataset.caseId));
        });
        for (const [caseId, room] of this.rooms) {
            room.card.style.display = checked.has(caseId) ? '' : 'none';
        }
    }

    setColumns(n) {
        this.columns = n;
        this.gridEl.style.setProperty('--cols', n);
    }

    start() {
        const loop = (now) => {
            this._rafId = requestAnimationFrame(loop);
            if (now - this._lastRender < 100) return; // ~10fps
            this._lastRender = now;

            for (const [, room] of this.rooms) {
                if (room.card.style.display === 'none') continue;
                const rect = room.card.getBoundingClientRect();
                if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
                const t = room.engine.tick(now);
                room.renderer.draw(t);
            }
        };
        this._rafId = requestAnimationFrame(loop);
    }

    stop() {
        if (this._rafId) cancelAnimationFrame(this._rafId);
    }
}
