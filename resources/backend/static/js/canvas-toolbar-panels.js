/* Bottom-toolbar panels share their button's center and stay above the toolbar. */
(function () {
    'use strict';

    var panels = [
        ['#pop.add-menu-pop.bottom-toolbar-menu', '#addBtn'],
        ['#modal.search > .modal', '#lb [data-drawer="search"]'],
        ['#drawer.asset-library-drawer', '#lb [data-drawer="assets"]'],
        ['#modal.chlib > .modal', '#aiCharacterMenu'],
        ['#modal.chgen-standalone > .modal', '#aiCharacterMenu'],
        ['#modal.tpl-panel .tpl-wrap', '#lb [data-drawer="templates"]'],
        ['#drawer[data-history-scope]', '#lb [data-drawer="history"]'],
        ['.lan-panel', '#avatar'],
        ['#pop.toolbar-account-pop', '#avatar'],
        ['#modal.bottom-account-settings > .modal', '#avatar'],
        ['#modal.bottom-account-shortcuts > .modal', '#avatar']
    ];
    var frame = 0;
    var observed = new Set();
    var resize = new ResizeObserver(schedule);

    function schedule() {
        if (!frame) frame = requestAnimationFrame(place);
    }

    function place() {
        frame = 0;
        var toolbar = document.getElementById('lb');
        if (!toolbar) return;
        var toolbarTop = toolbar.getBoundingClientRect().top;
        var active = new Set([toolbar]);

        panels.forEach(function (pair) {
            var panel = document.querySelector(pair[0]);
            var button = document.querySelector(pair[1]);
            if (!panel || !button || !panel.offsetWidth || getComputedStyle(panel).visibility === 'hidden') return;
            var anchor = button.getBoundingClientRect();
            if (!anchor.width || !anchor.height) return;

            panel.classList.add('cn-toolbar-panel');
            var tip = panel.querySelector('.tpl-tip');
            var reserve = tip ? tip.offsetHeight + 10 : 0;
            var top = Math.min(anchor.top, toolbarTop);
            panel.style.setProperty('--toolbar-panel-max-height', Math.max(0, top - 16 - reserve) + 'px');
            var width = Math.min(panel.offsetWidth, innerWidth - 16);
            var left = Math.max(8, Math.min(anchor.left + anchor.width / 2 - width / 2, innerWidth - width - 8));
            panel.style.setProperty('--toolbar-panel-left', Math.round(left) + 'px');
            panel.style.setProperty('--toolbar-panel-bottom', Math.round(innerHeight - top + 8) + 'px');
            if (panel.parentElement?.id === 'modal') {
                panel.parentElement.style.setProperty('--toolbar-overlay-bottom', Math.round(innerHeight - top) + 'px');
            }
            active.add(panel);
        });

        observed.forEach(function (element) {
            if (!active.has(element)) resize.unobserve(element);
        });
        active.forEach(function (element) {
            if (!observed.has(element)) resize.observe(element);
        });
        observed = active;
    }

    new MutationObserver(schedule).observe(document.body, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['class']
    });
    addEventListener('resize', schedule);
    document.addEventListener('transitionend', schedule, true);
    schedule();
})();
