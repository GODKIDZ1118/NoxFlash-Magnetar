/* Move and resize the floating Agent independently of the canvas. */
(function () {
    'use strict';

    const widthKey = 'noxflash.agent.width';
    const heightKey = 'noxflash.agent.height';
    const margin = 12;
    const minWidth = 320;
    const minHeight = 300;
    const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

    function start() {
        const agent = document.getElementById('agent');
        const titlebar = agent?.querySelector('.agent-window-titlebar');
        const workspace = agent?.closest('#app');
        if (!agent || !titlebar || !workspace) {
            window.setTimeout(start, 300);
            return;
        }
        const root = workspace.closest('.cn-root');
        let position = null;
        let drag = null;
        let frame = 0;
        let moveFrame = 0;

        const floating = () => !agent.matches('.closed, .full');

        function moveTo(x, y) {
            position = {x, y};
            agent.style.setProperty('--agent-window-x', x + 'px');
            agent.style.setProperty('--agent-window-y', y + 'px');
            agent.style.setProperty('--agent-window-right', 'auto');
        }

        const maxY = () => Math.max(margin, workspace.clientHeight - agent.offsetHeight - margin);

        function place(x, y) {
            const maxX = Math.max(margin, workspace.clientWidth - agent.offsetWidth - margin);
            moveTo(clamp(x, margin, maxX), clamp(y, margin, maxY()));
        }

        function previewMove() {
            moveFrame = 0;
            if (!floating()) return;
            agent.style.translate = drag.move.x + 'px ' + drag.move.y + 'px';
        }

        function placeWithinWorkspace() {
            frame = 0;
            if (position && floating() && drag?.target !== titlebar) place(position.x, position.y);
        }

        const schedule = () => { if (!frame) frame = requestAnimationFrame(placeWithinWorkspace); };

        function resize(edge, dx, dy) {
            const rightLimit = workspace.clientWidth - margin;
            const bottomLimit = workspace.clientHeight - margin;
            const width = Math.min(minWidth, rightLimit - margin);
            const height = Math.min(minHeight, bottomLimit - margin);
            let {left, top, right, bottom} = drag;
            if (edge.includes('w')) left = clamp(left + dx, margin, right - width);
            if (edge.includes('e')) right = clamp(right + dx, left + width, rightLimit);
            if (edge.includes('n')) top = clamp(top + dy, margin, bottom - height);
            if (edge.includes('s')) bottom = clamp(bottom + dy, top + height, bottomLimit);
            if (edge.includes('w') || edge.includes('e')) root.style.setProperty('--agent-w', right - left + 'px');
            if (edge.includes('n') || edge.includes('s')) root.style.setProperty('--agent-window-height', bottom - top + 'px');
            place(left, top);
        }

        function bindPointer(target, edge = '') {
            target.addEventListener('pointerdown', event => {
                if (drag || event.button !== 0 || !floating()) return;
                if (!edge && event.target.closest('button, input, a, [role="button"], [contenteditable]')) return;
                const bounds = workspace.getBoundingClientRect();
                const rect = agent.getBoundingClientRect();
                event.preventDefault();
                event.stopPropagation();
                target.setPointerCapture(event.pointerId);
                drag = {target, id:event.pointerId, x:event.clientX, y:event.clientY,
                    left:rect.left - bounds.left, top:rect.top - bounds.top,
                    right:rect.right - bounds.left, bottom:rect.bottom - bounds.top};
                if (!edge) drag.maxY = maxY();
                document.body.classList.add(edge ? 'agent-resizing' : 'agent-window-moving');
            });
            target.addEventListener('pointermove', event => {
                if (drag?.target !== target || event.pointerId !== drag.id || !floating()) return;
                const dx = event.clientX - drag.x;
                const dy = event.clientY - drag.y;
                if (edge) {
                    resize(edge, dx, dy);
                } else {
                    drag.move = {x:dx, y:clamp(drag.top + dy, margin, drag.maxY) - drag.top};
                    if (!moveFrame) moveFrame = requestAnimationFrame(previewMove);
                }
            });
            const finish = event => {
                if (drag?.target !== target || event.pointerId !== drag.id) return;
                if (!edge) {
                    if (moveFrame) cancelAnimationFrame(moveFrame);
                    moveFrame = 0;
                    agent.style.removeProperty('translate');
                    if (drag.move && floating()) place(drag.left + drag.move.x, drag.top + drag.move.y);
                } else if (floating()) {
                    try {
                        if (edge.includes('w') || edge.includes('e')) localStorage.setItem(widthKey, String(agent.offsetWidth));
                        if (edge.includes('n') || edge.includes('s')) localStorage.setItem(heightKey, String(agent.offsetHeight));
                    } catch {}
                }
                drag = null;
                document.body.classList.remove('agent-resizing', 'agent-window-moving');
                schedule();
            };
            for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) target.addEventListener(event, finish);
        }

        bindPointer(titlebar);
        for (const edge of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) {
            const handle = document.createElement('span');
            handle.className = 'agent-resize-handle';
            handle.dataset.edge = edge;
            handle.setAttribute('aria-hidden', 'true');
            agent.appendChild(handle);
            bindPointer(handle, edge);
            if (edge === 'w') handle.addEventListener('dblclick', () => {
                if (!floating()) return;
                const right = agent.getBoundingClientRect().right - workspace.getBoundingClientRect().left;
                root.style.removeProperty('--agent-w');
                if (position) place(right - agent.offsetWidth, position.y);
                try { localStorage.removeItem(widthKey); } catch {}
            });
        }

        try {
            const savedWidth = Number(localStorage.getItem(widthKey));
            const savedHeight = Number(localStorage.getItem(heightKey));
            if (savedWidth > 0) root.style.setProperty('--agent-w', Math.max(minWidth, savedWidth) + 'px');
            if (savedHeight > 0) root.style.setProperty('--agent-window-height', Math.max(minHeight, savedHeight) + 'px');
        } catch {}
        const observer = new ResizeObserver(schedule);
        observer.observe(agent);
        observer.observe(workspace);
        new MutationObserver(schedule).observe(agent, {attributes:true, attributeFilter:['class']});
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
    else start();
})();
