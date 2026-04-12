/**
 * app.js
 * Loads cases in parallel; each case appears in the grid as soon as it's ready
 */

(function () {
    let roomManager;

    document.addEventListener('DOMContentLoaded', () => {
        const gridEl = document.getElementById('room-grid');
        const filterListEl = document.getElementById('room-checkboxes');
        const colSelect = document.getElementById('col-select');
        const selectAllCb = document.getElementById('select-all');

        roomManager = new RoomManager(gridEl, filterListEl);

        colSelect.addEventListener('change', (e) => {
            roomManager.setColumns(parseInt(e.target.value));
        });
        roomManager.setColumns(parseInt(colSelect.value));

        selectAllCb.addEventListener('change', (e) => {
            filterListEl.querySelectorAll('input[type=checkbox]').forEach(cb => {
                cb.checked = e.target.checked;
            });
            roomManager._applyFilter();
        });

        // Start render loop immediately
        roomManager.start();

        // Load all cases in parallel — each appears as soon as it's ready
        DEFAULT_CASE_IDS.forEach((id, idx) => {
            DataLoader.loadCase(id).then(vf => {
                vf.label = 'R' + (idx + 1);
                roomManager.addRoom(vf);
            }).catch(e => {
                console.error(`Failed to load case ${id}:`, e);
            });
        });
    });
})();
