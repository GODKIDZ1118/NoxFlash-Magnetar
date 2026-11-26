(() => {
    'use strict';

    // Spring Dropdown reference, in stiffness / damping pairs.
    const spring = {
        reveal: [300, 23], fade: [400, 34], offset: [260, 24],
        arrow: [300, 18], press: [500, 18], label: [340, 26],
        row: [300, 24], check: [260, 26],
        lead: [620, 36], trail: [200, 20], highlight: [400, 32]
    };
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const curves = new Map();
    const menus = new WeakMap();
    const pills = new WeakMap();
    const custom = [
        '[role="listbox"]:not(select):not(.nd-menu)',
        '.cl-pop:has([role="menuitemradio"]),#addProviderMenu,#platformSwitcher.open',
        '.hp-mpanel-vendors,.hp-mpanel-models',
        '#pop:is(.model-pop,.param-pop,.chfilter-pop,.combo-pop,.think-pop,.chgen-vendor-pop,.chgen-model-pop)',
        '#pop:has(.model-menu,.opt-grid,.crop-ratios,.tle-srcpop,.tle-subpop,[role="menuitemradio"],> .mi[data-t])',
        '.model-flyout-portal'
    ].join(',');
    const choices = [
        '[role="option"]', '[role="menuitemradio"]', '[role="checkbox"]',
        '[data-combo-item]', '.opt-grid button', '.crop-ratios button',
        '.tle-srcpop button', '.tle-subpop button', '.mi', '.hp-mv',
        '.hp-mpanel-models .hp-it', '.add-provider-option', '.provider-card:not(.is-filtered-out)'
    ].map(selector => selector + ':not(:disabled):not([aria-disabled="true"])').join(',');
    let lastTrigger;
    let lastTriggerTime = 0;

    function curve(pair) {
        if (curves.has(pair)) return curves.get(pair);
        const [stiffness, damping] = pair;
        const values = [0];
        let position = 0;
        let velocity = 0;
        for (let frame = 0; frame < 60; frame++) {
            for (let step = 0; step < 4; step++) {
                velocity += ((1 - position) * stiffness - velocity * damping) / 240;
                position += velocity / 240;
            }
            values.push(position);
            if (Math.abs(velocity) < .008 && Math.abs(1 - position) < .001) break;
        }
        values[values.length - 1] = 1;
        const result = { values, duration: (values.length - 1) * 1000 / 60 };
        result.easing = 'linear(' + values.map(value => value.toFixed(5)).join(',') + ')';
        curves.set(pair, result);
        return result;
    }

    function animate(element, frames, pair, options) {
        if (!element || reduced.matches) return;
        const { duration, easing } = curve(pair);
        return element.animate(frames, { duration, easing, ...options });
    }

    function movePill(pill, box, jump) {
        const end = [box.left, box.top, box.left + box.width, box.top + box.height];
        const previous = pills.get(pill);
        if (previous && end.every((value, i) => Math.abs(value - previous.end[i]) < .25)) return;
        const style = getComputedStyle(pill);
        const left = parseFloat(style.left);
        const top = parseFloat(style.top);
        const start = [left, top, left + parseFloat(style.width), top + parseFloat(style.height)];
        previous?.animation?.cancel();
        const frame = ([x, y, right, bottom]) => ({
            left: x + 'px', top: y + 'px',
            width: Math.max(0, right - x) + 'px', height: Math.max(0, bottom - y) + 'px'
        });
        Object.assign(pill.style, frame(end));
        let animation;
        if (previous && !jump && !reduced.matches) {
            const lead = curve(spring.lead).values;
            const trail = curve(spring.trail).values;
            const edges = [end[0] <= start[0], end[1] <= start[1], end[2] >= start[2], end[3] >= start[3]];
            const count = Math.max(lead.length, trail.length);
            const frames = Array.from({ length: count }, (_, frameIndex) => frame(end.map((value, i) => {
                const samples = edges[i] ? lead : trail;
                return start[i] + (value - start[i]) * (samples[frameIndex] ?? 1);
            })));
            animation = pill.animate(frames, { duration: (count - 1) * 1000 / 60 });
        } else if (!previous) {
            animate(pill, { opacity: [0, 1] }, spring.highlight);
        }
        pills.set(pill, { end, animation });
    }

    function roll(trigger) {
        const label = trigger?.querySelector('.t,.gen-model-text,.ks-v,.amodel-name,span') || trigger;
        animate(label, { translate: ['0 12px', '0 0'], opacity: [.25, 1] }, spring.label);
    }

    function pick(menu, row, trigger) {
        menu.querySelector('[aria-selected="true"]')?.setAttribute('aria-selected', 'false');
        row.setAttribute('aria-selected', 'true');
        animate(row, { scale: [.2, 1], opacity: [0, 1] }, spring.check, { pseudoElement: '::after' });
        roll(trigger);
    }

    function open(menu, item, trigger) {
        const rect = menu.getBoundingClientRect();
        if (menus.has(menu) || !rect.width || !rect.height || getComputedStyle(menu).visibility === 'hidden') return;
        const triggerRect = trigger?.getBoundingClientRect();
        const up = menu.dataset.springUp === 'true' || menu.classList.contains('up')
            || Boolean(triggerRect && rect.bottom <= triggerRect.top + 4);
        const hidden = up ? 'inset(100% -28px -16px -28px)' : 'inset(-16px -28px 100% -28px)';
        const state = { hidden, animations: [], handlers: new AbortController() };
        menus.set(menu, state);
        menu.dataset.springDropdown = '';
        if (trigger) trigger.dataset.springTrigger = '';
        const combo = menu.querySelector('.combo-list');
        const host = combo?.querySelector(item) ? combo : menu;
        const native = menu.classList.contains('nd-menu');
        const belongs = row => native || row.closest(custom) === menu;
        const rows = Array.from(host.querySelectorAll(item)).filter(belongs);
        const options = native
            ? { activeClass: 'active', cursorClass: 'is-active', animateCursor: true }
            : { activeClass: rows.some(row => row.classList.contains('is-on')) ? 'is-on' : 'on', cursorClass: 'cur', animateCursor: true };
        const selected = row => row.matches('.active,[aria-selected="true"],[role="menuitemradio"][aria-checked="true"]');
        const inList = row => belongs(row) && !row.closest('.opt-grid');
        if (rows.some(inList)) state.glide = window.NovaGlide?.attach(host, { ...options, item, selected, movePill, filter: inList });
        state.animations.push(
            animate(menu, { clipPath: [hidden, 'inset(-16px -28px -16px -28px)'] }, spring.reveal),
            animate(menu, { opacity: [0, 1] }, spring.fade),
            animate(menu, { translate: [up ? '0 4px' : '0 -4px', '0 0'] }, spring.offset)
        );
        const view = host.getBoundingClientRect();
        rows.filter(row => {
            const box = row.getBoundingClientRect();
            return box.height && box.bottom > view.top && box.top < view.bottom;
        }).slice(0, 12).forEach((row, index) => {
            animate(row, { opacity: [0, 1], translate: [up ? '0 14px' : '0 -14px', '0 0'] },
                spring.row, { delay: 50 + index * 45, fill: 'backwards' });
        });
        const arrow = trigger?.querySelector([
            'svg.lucide-chevron-down', 'svg.lucide-chevrons-up-down', 'svg[data-icon="down"]',
            '.ks-c', '.am-sel > .cv', '.wsel > svg', '.pr-btn > svg', '.hp-model-chip > svg:last-child'
        ].join(','));
        state.arrowElement = arrow;
        state.arrow = animate(arrow, { rotate: ['0deg', '180deg'] }, spring.arrow, { fill: 'forwards' });
        if (state.arrow) arrow.dataset.springArrow = '';
        animate(trigger, { scale: [.97, 1] }, spring.press);
        menu.addEventListener('click', event => {
            const row = event.target.closest(item);
            if (row && trigger && row.closest(custom) === menu) {
                const tick = row.querySelector('svg.lucide-check,.check,.nv-tick,.tick,.chk');
                animate(tick, { scale: [.55, 1] }, spring.check);
                roll(trigger);
            }
        }, { capture: true, signal: state.handlers.signal });
    }

    function exit(menu, state) {
        const style = getComputedStyle(menu);
        const start = { opacity: style.opacity, clipPath: style.clipPath === 'none' ? 'inset(-16px -28px -16px -28px)' : style.clipPath };
        state.animations.forEach(animation => animation?.cancel());
        resetArrow(state);
        return animate(menu, [start, { opacity: 0, clipPath: state.hidden }],
            spring.reveal, { duration: 125, fill: 'forwards' });
    }

    function resetArrow(state) {
        if (!state.arrow) return;
        const arrow = state.arrowElement;
        const from = getComputedStyle(arrow).rotate;
        state.arrow.cancel();
        state.arrow = null;
        if (arrow.isConnected && from !== 'none') animate(arrow, { rotate: [from, '0deg'] }, spring.arrow);
    }

    function close(menu) {
        const state = menus.get(menu);
        if (!state || reduced.matches) { menu.remove(); return; }
        menu.inert = true;
        menu.removeAttribute('id');
        menu.setAttribute('aria-hidden', 'true');
        const animation = exit(menu, state);
        animation.finished.then(() => menu.remove(), () => menu.remove());
    }

    function inspect(menu) {
        if (!menu.isConnected || menu.inert) return;
        const state = menus.get(menu);
        if (menu.hidden) {
            if (state) release(menu, state);
            return;
        }
        if (state) {
            if ((menu.classList.contains('closing') || Array.from(menu.classList).some(name => name.endsWith('-leave-active'))) && !state.closing) {
                state.closing = true;
                exit(menu, state);
            }
            return;
        }
        const trigger = performance.now() - lastTriggerTime < 350 ? lastTrigger : null;
        open(menu, choices, trigger);
        if (!menus.has(menu)) requestAnimationFrame(() => {
            if (menu.isConnected && !menu.hidden) open(menu, choices, trigger);
        });
    }

    function release(menu, state) {
        state.animations.forEach(animation => animation?.cancel());
        resetArrow(state);
        state.handlers.abort();
        state.glide?.destroy();
        menu.removeAttribute('data-spring-dropdown');
        menus.delete(menu);
    }

    function rememberTrigger(event) {
        if (event.type === 'keydown' && !['Enter', ' ', 'ArrowDown'].includes(event.key)) return;
        if (!(event.target instanceof Element)) return;
        const trigger = event.target.closest('button,[role="combobox"],input,select');
        if (trigger && !trigger.closest('[data-spring-dropdown]')) {
            lastTrigger = trigger;
            lastTriggerTime = performance.now();
        }
    }

    document.addEventListener('pointerdown', rememberTrigger, true);
    document.addEventListener('keydown', rememberTrigger, true);
    new MutationObserver(records => {
        const candidates = new Set();
        for (const record of records) {
            const target = record.target;
            if (target instanceof Element) {
                if (target.matches(custom)) candidates.add(target);
                else if (!target.classList.contains('nd-menu') && menus.has(target)) release(target, menus.get(target));
            }
            for (const node of record.addedNodes) {
                if (!(node instanceof Element)) continue;
                if (node.matches(custom)) candidates.add(node);
                node.querySelectorAll(custom).forEach(menu => candidates.add(menu));
            }
            for (const node of record.removedNodes) {
                if (!(node instanceof Element) || node.isConnected) continue;
                const state = menus.get(node);
                if (state) release(node, state);
                node.querySelectorAll('[data-spring-dropdown]').forEach(menu => {
                    const childState = menus.get(menu);
                    if (childState && !menu.isConnected) release(menu, childState);
                });
            }
        }
        candidates.forEach(inspect);
    }).observe(document.documentElement, {
        subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'role', 'hidden']
    });
    document.querySelectorAll(custom).forEach(inspect);
    window.NovaSpringDropdown = { open, close, pick, movePill };
})();
