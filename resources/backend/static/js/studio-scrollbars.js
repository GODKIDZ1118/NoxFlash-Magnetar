(() => {
    const scrollTimers = new WeakMap();
    const fadeDelay = 720;
    const hoverInset = 9;
    let hoverTarget;
    let hoverFrame = 0;
    let pointer;

    document.addEventListener('scroll', event => {
        const element = event.target === document ? document.scrollingElement : event.target;
        if (!(element instanceof HTMLElement)) return;
        element.setAttribute('data-studio-scrolling', '');
        clearTimeout(scrollTimers.get(element));
        scrollTimers.set(element, setTimeout(() => {
            element.removeAttribute('data-studio-scrolling');
            scrollTimers.delete(element);
        }, fadeDelay));
    }, { capture: true, passive: true });

    function setHover(element) {
        if (hoverTarget === element) return;
        hoverTarget?.removeAttribute('data-studio-scroll-hover');
        hoverTarget = element;
        hoverTarget?.setAttribute('data-studio-scroll-hover', '');
    }

    function atScrollbar(element, x, y) {
        const root = element === document.scrollingElement;
        const vertical = element.scrollHeight > element.clientHeight;
        const horizontal = element.scrollWidth > element.clientWidth;
        if (!vertical && !horizontal) return false;
        const style = getComputedStyle(element);
        if (style.scrollbarWidth === 'none' ||
            getComputedStyle(element, '::-webkit-scrollbar').display === 'none') return false;
        const mayScroll = overflow => root ? !['hidden', 'clip'].includes(overflow) : /^(auto|scroll|overlay)$/.test(overflow);
        const rect = root ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight } : element.getBoundingClientRect();
        if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) return false;
        const verticalEdge = style.direction === 'rtl' && !root ? x - rect.left : rect.right - x;
        return (vertical && mayScroll(style.overflowY) && verticalEdge <= hoverInset) ||
            (horizontal && mayScroll(style.overflowX) && rect.bottom - y <= hoverInset);
    }

    document.addEventListener('pointermove', event => {
        if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
        pointer = { x: event.clientX, y: event.clientY, path: event.composedPath() };
        if (hoverFrame) return;
        hoverFrame = requestAnimationFrame(() => {
            hoverFrame = 0;
            if (!pointer) return;
            const { x, y, path } = pointer;
            setHover(path.find(element => element instanceof HTMLElement && atScrollbar(element, x, y)));
        });
    }, { capture: true, passive: true });

    function leaveScrollbar() {
        pointer = null;
        setHover();
    }
    document.addEventListener('pointerout', event => {
        if (!event.relatedTarget) leaveScrollbar();
    }, { capture: true, passive: true });
    window.addEventListener('blur', leaveScrollbar);
})();
