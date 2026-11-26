/* Morph Tooltip springs from DesignBookmark. */
(function () {
    'use strict';

    function mount(bar, edge, buttons) {
        const local = edge === 'local', side = edge === 'right';
        const nodeBar = bar.matches('#ntb, .cn-fm');
        const listeners = new AbortController();
        const { signal } = listeners;
        const make = (className, parent) => {
            const node = document.createElement('span');
            node.className = className;
            parent.appendChild(node);
            return node;
        };
        const layer = make(local ? 'mt-layer' : 'mt-layer mt-portal mt-' + edge, local ? bar : document.body);
        layer.setAttribute('aria-hidden', 'true');
        if (bar.id === 'tr') layer.classList.add('mt-canvas-top');
        const tail = make('mt-tail', layer);
        const tip = make('mt-tip', layer);
        const glow = make('mt-glow', layer);
        const reduced = matchMedia('(prefers-reduced-motion: reduce)');
        const spring = (x, k, damping) => ({ x, target: x, v: 0, k, damping });
        const tabs = Array.from(buttons, button => {
            const label = make('mt-label', tip);
            const name = () => button.getAttribute('aria-label') || button.dataset.tip || button.title || button.textContent.trim();
            label.textContent = name();
            const shortcut = button.dataset.drawer === 'search' &&
                button.dataset.tip.slice(label.textContent.length).trim();
            if (shortcut) label.appendChild(document.createElement('kbd')).textContent = shortcut;
            return { button, label, name, icon: button.querySelector('.mt-icon, svg'),
                fade: spring(0, 420, 32), pop: spring(1, 520, 16), direction: 0 };
        });
        const lead = [620, 36], trail = [190, 19];
        const tipL = spring(0, ...lead), tipR = spring(0, ...lead), tailX = spring(0, 300, 22);
        const glowL = spring(0, ...lead), glowR = spring(0, ...lead), shown = spring(0, 420, 24);
        const springs = [tipL, tipR, tailX, glowL, glowR, shown];
        tabs.forEach(tab => springs.push(tab.fade, tab.pop));
        const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
        const settle = s => { s.x = s.target; s.v = 0; };
        let current = -1, timer = 0, raf = 0, last = 0, min = 0, max = 0;
        bar.classList.add('morph-ready');

        function retarget(i, snap) {
            const tab = tabs[i];
            const bounds = bar.getBoundingClientRect();
            const rect = tab.button.getBoundingClientRect();
            const start = side ? rect.top - bounds.top : rect.left - bounds.left;
            const end = start + (side ? rect.height : rect.width);
            const center = (start + end) / 2;
            glow.hidden = tab.button.id === 'orb' || tab.button.classList.contains('nf-winctl-close');
            if (!local) {
                tab.label.textContent = tab.name();
                if (nodeBar) layer.classList.toggle('mt-below', bounds.top < 54);
                const css = getComputedStyle(bar);
                layer.style.setProperty('--mt-bubble', css.getPropertyValue('--cn-control-bubble'));
                layer.style.setProperty('--mt-text', css.getPropertyValue('--cn-control-text'));
                layer.style.setProperty('--mt-highlight', css.getPropertyValue('--cn-control-highlight'));
                layer.style.left = bounds.left + 'px';
                layer.style.top = bounds.top + 'px';
                layer.style.width = bounds.width + 'px';
                layer.style.height = bounds.height + 'px';
                glow.style.left = (side ? rect.left - bounds.left : 0) + 'px';
                glow.style.top = (side ? 0 : rect.top - bounds.top) + 'px';
                glow.style[side ? 'width' : 'height'] = (side ? rect.width : rect.height) + 'px';
            }
            min = side ? 0 : 8 - bounds.left;
            max = side ? Math.max(30, innerWidth - bounds.right - 20) : innerWidth - 8 - bounds.left;
            const half = Math.min(tab.label.offsetWidth, max - min) / 2;
            const targets = [[tipL, side ? 0 : center - half], [tipR, side ? 2 * half : center + half],
                [tailX, center], [glowL, start], [glowR, end]];
            for (const [s, target] of targets) {
                if (s.target !== target && s.v * (target - s.x) < 0) s.v = 0;
                s.target = target;
                if (snap) settle(s);
            }
        }

        function paint() {
            const opacity = clamp(shown.x, 0, 1), a = clamp(shown.x, 0, 1.15);
            const motion = reduced.matches ? 0 : 1;
            layer.style.visibility = opacity > .001 ? 'visible' : 'hidden';
            layer.style.opacity = opacity;
            const rawLeft = Math.min(tipL.x, tipR.x - 30);
            const width = Math.min(tipR.x - rawLeft, max - min);
            const left = clamp(rawLeft, min, max - width);
            tip.style.width = width + 'px';
            const flip = layer.classList.contains('mt-below') ? -1 : 1;
            const y = side ? tailX.x - 17 : motion * (1 - a) * 6 * flip;
            tip.style.transform = `translate3d(${left}px,${y}px,0) scale(${1 - motion * .28 * (1 - a)})`;
            const tailLeft = clamp(tailX.x, left + 12, left + width - 12) - 6;
            tail.style.transform = `translate3d(${side ? 0 : tailLeft}px,${side ? tailX.x - 6 : motion * (1 - a) * 8 * flip}px,0) rotate(45deg) scale(${motion ? a : 1})`;
            const glowLeft = Math.min(glowL.x, glowR.x - 20);
            glow.style[side ? 'height' : 'width'] = (glowR.x - glowLeft) + 'px';
            glow.style.transform = `translate3d(${side ? 0 : glowLeft}px,${side ? glowLeft : 0}px,0)`;
            for (const tab of tabs) {
                const o = clamp(tab.fade.x, 0, 1);
                if (o || tab.opacity) {
                    tab.label.style.opacity = o;
                    tab.label.style.transform = `translateX(calc(-50% + ${motion * tab.direction * (1 - o) * 14}px))`;
                    tab.label.style.filter = motion && o > .02 && o < .98 ? `blur(${(1 - o) * 3}px)` : '';
                    tab.opacity = o;
                }
                if (tab.icon) {
                    const property = local ? 'transform' : 'scale';
                    if (motion && tab.pop.x !== 1) tab.icon.style[property] = local ? `scale(${tab.pop.x})` : tab.pop.x;
                    else if (tab.icon.style[property]) tab.icon.style[property] = '';
                }
            }
        }

        function frame(now) {
            const dt = Math.min((now - last) / 1000, 1 / 30) / 4;
            last = now;
            let moving = false;
            for (const s of springs) {
                const damping = reduced.matches ? 2 * Math.sqrt(s.k) : s.damping;
                for (let i = 0; i < 4; i++) {
                    s.v += (s.k * (s.target - s.x) - damping * s.v) * dt;
                    s.x += s.v * dt;
                }
                if (Math.abs(s.x - s.target) > .005 || Math.abs(s.v) > .02) moving = true;
                else settle(s);
            }
            paint();
            raf = moving ? requestAnimationFrame(frame) : 0;
        }

        function start() {
            if (!raf) {
                last = performance.now();
                raf = requestAnimationFrame(frame);
            }
        }

        function point(i) {
            clearTimeout(timer);
            if (i !== current) {
                const dir = current < 0 ? 0 : Math.sign(i - current);
                const snap = current < 0 && shown.x < .3;
                for (const s of [tipR, glowR]) [s.k, s.damping] = reduced.matches || dir >= 0 ? lead : trail;
                for (const s of [tipL, glowL]) [s.k, s.damping] = reduced.matches || dir < 0 ? lead : trail;
                retarget(i, snap);
                tabs.forEach((tab, k) => {
                    if (k === i) tab.direction = dir;
                    else if (tab.fade.target === 1) tab.direction = -dir;
                    tab.fade.target = k === i ? 1 : 0;
                    if (snap) settle(tab.fade);
                });
                current = i;
            } else if (!local) {
                retarget(i, false);
            }
            shown.target = 1;
            start();
        }

        function leave() {
            clearTimeout(timer);
            timer = setTimeout(() => {
                current = -1;
                shown.target = 0;
                start();
            }, 140);
        }

        tabs.forEach(({ button, pop }, i) => {
            button.addEventListener('pointerenter', () => point(i), { signal });
            button.addEventListener('focus', () => point(i), { signal });
            button.addEventListener('blur', leave, { signal });
            button.addEventListener('click', () => {
                if (!reduced.matches) {
                    pop.x = .78;
                    shown.x = Math.min(shown.x, .9);
                }
                point(i);
            }, { signal });
        });
        bar.addEventListener('pointerleave', leave, { signal });
        bar.addEventListener('keydown', event => { if (event.key === 'Escape') leave(); }, { signal });
        const resize = () => { if (!signal.aborted && current >= 0) { retarget(current, false); start(); } };
        addEventListener('resize', resize, { signal });
        if (nodeBar) bar.addEventListener('scroll', resize, { signal });
        document.fonts.ready.then(resize);
        return () => {
            listeners.abort();
            clearTimeout(timer);
            cancelAnimationFrame(raf);
            for (const { icon } of tabs) if (icon) icon.style[local ? 'transform' : 'scale'] = '';
            layer.remove();
            bar.classList.remove('morph-ready');
        };
    }

    const groups = [
        ['.canvas-bottom-dock', 'local', ':scope > #lb > button, :scope > #orb'],
        ['#tl', 'below', ':scope > button'],
        ['#tr', 'below', ':scope > .cn-top-group > button'],
        ['#zb', 'above', 'button'],
        ['#ntb, .cn-fm.on', 'above', ':scope > button:not(:disabled)'],
        ['.nf-rail-fallback', 'right', '.tb-nav-item'],
        ['.nf-rail-right', 'right', '.tb-btn'],
        ['.nfb-nav-controls', 'below', ':scope > button'],
        ['.nf-brandbar', 'below', '.nf-collapse, .nf-winctl']
    ];
    const root = document.getElementById('root') || document.body;
    const mounted = new Map();
    function ready() {
        const visible = new Set();
        for (const [selector, edge, buttons] of groups) {
            for (const bar of root.querySelectorAll(selector)) {
                const items = Array.from(bar.querySelectorAll(buttons));
                if (!items.length) continue;
                visible.add(bar);
                const old = mounted.get(bar);
                if (old?.items.length === items.length && items.every((item, i) => item === old.items[i])) continue;
                old?.destroy();
                mounted.set(bar, { items, destroy: mount(bar, edge, items) });
            }
        }
        for (const [bar, { destroy }] of mounted) {
            if (visible.has(bar)) continue;
            mounted.delete(bar);
            destroy();
        }
    }
    const observer = new MutationObserver(records => {
        if (records.some(record => record.type === 'childList' || record.target.matches('#ntb, .cn-fm, .cn-fm button'))) ready();
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'disabled'] });
    ready();
})();
