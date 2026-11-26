/* ==========================================================================
   NoxFlash 外壳增强（配合 noxflash-shell.css）
   1) 侧栏顶部注入 40x40 加号，点击 = 新建项目
   2) 标题栏品牌标记换成新 logo，随深浅主题切换
   3) 侧栏图标加悬停提示（文字被隐藏后仍能认出功能）
   ========================================================================== */
(function () {
  'use strict';

  var NOXFLASH_VERSION = 'NoxFlash_Magnetar V1.0.1';

  var MARK_LIGHT = '/static/images/logo_mark_light.png'; // 浅色主题用黑色版
  var MARK_DARK = '/static/images/logo_mark_dark.png';   // 深色主题用白色版
  var RAIL_LIGHT = '/static/images/logo.png';            // 侧栏方形图标（浅色）
  var RAIL_DARK = '/static/images/logo_light_256.png';   // 侧栏方形图标（深色）

  function isDark() {
    var el = document.documentElement;
    return el.classList.contains('theme-dark') ||
      el.getAttribute('data-theme') === 'dark';
  }

  function markSrc() {
    return isDark() ? MARK_DARK : MARK_LIGHT;
  }

  function railSrc() {
    return isDark() ? RAIL_DARK : RAIL_LIGHT;
  }

  /* ---------------------------------------------------------- 品牌标记 */
  var brandImg = null;

  function syncBrand() {
    var want = markSrc();
    if (brandImg && brandImg.getAttribute('src') !== want) brandImg.setAttribute('src', want);
    var extras = document.querySelectorAll('.nf-brandbar .nf-brand-mark');
    Array.prototype.forEach.call(extras, function (el) {
      if (el.getAttribute('src') !== want) el.setAttribute('src', want);
    });
    var railWant = railSrc();
    Array.prototype.forEach.call(document.querySelectorAll('.nf-rail-logo img'), function (el) {
      if (el.getAttribute('src') !== railWant) el.setAttribute('src', railWant);
    });
  }

  /* ============================================================ 标题栏
     与「轻画」同一个架构：窗口是无边框的，标题栏和最小化/最大化/关闭都由网页自己画，
     左边品牌、右边三颗按钮；空白处整条可以拖窗口，双击标题栏最大化/还原。 */
  var brandbarEl = null;
  var maxBtnEl = null;

  function winCtl(action, label, svg) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'nf-winctl nf-winctl-' + action;
    b.setAttribute('aria-label', label);
    b.innerHTML = svg;
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var api = window.noxflashWin;
      if (!api) return;
      if (action === 'min') api.minimize();
      else if (action === 'max') api.toggleMaximize();
      else if (action === 'close') api.close();
    });
    return b;
  }

  var railOpen = false;
  var railMotion = null;

  function createRailMotion(nav, tools, toggle) {
    var root = document.documentElement;
    var reduced = matchMedia('(prefers-reduced-motion: reduce)');
    var collapsed = parseFloat(getComputedStyle(root).getPropertyValue('--nf-rail'));
    var expanded = parseFloat(getComputedStyle(root).getPropertyValue('--nf-rail-open'));
    var highlight = nav.querySelector('.nf-rail-highlight');
    var arrow = toggle.querySelector('svg');
    var labels = Array.from(nav.querySelectorAll('.nf-rail-name, .nf-rail-label'))
      .concat(Array.from(tools.querySelectorAll('.nf-rail-label')))
      .map(function (el) { return { el: el, spring: spring(0, 300, 26) }; });
    var width = spring(collapsed, 260, 24);
    var rotation = spring(1, 300, 22);
    var springs = [width, rotation].concat(labels.map(function (label) { return label.spring; }));
    var open = null, labelTime = 0, id = 0, last = 0;

    function spring(x, k, c) { return { x: x, v: 0, target: x, k: k, c: c }; }
    function render() {
      root.style.setProperty('--nf-rail-live', width.x.toFixed(2) + 'px');
      arrow.style.transform = 'rotate(' + (180 * rotation.x).toFixed(2) + 'deg)';
      labels.forEach(function (label) {
        var opacity = Math.min(1, Math.max(0, label.spring.x));
        label.el.style.opacity = opacity.toFixed(3);
        label.el.style.setProperty('--nf-label-x', ((opacity - 1) * 10).toFixed(2) + 'px');
      });
    }
    function settle(s) { s.x = s.target; s.v = 0; }
    function frame(now) {
      var dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      labelTime += dt;
      var pending = false;
      labels.forEach(function (label, i) {
        if (open && labelTime >= .06 + i * .04) label.spring.target = 1;
        else if (open) pending = true;
      });
      springs.forEach(function (s) {
        for (var i = 0; i < 4; i++) {
          s.v += (-s.k * (s.x - s.target) - s.c * s.v) * dt / 4;
          s.x += s.v * dt / 4;
        }
        if (Math.abs(s.x - s.target) < .005 && Math.abs(s.v) < .02) settle(s);
        else pending = true;
      });
      render();
      id = pending ? requestAnimationFrame(frame) : 0;
    }
    function start(immediate) {
      if (immediate || reduced.matches) {
        cancelAnimationFrame(id);
        id = 0;
        labels.forEach(function (label) { label.spring.target = open ? 1 : 0; });
        springs.forEach(settle);
        render();
      } else if (!id) {
        last = performance.now();
        id = requestAnimationFrame(frame);
      }
    }
    return {
      setOpen: function (next) {
        if (open === next) return;
        var initial = open === null;
        open = next;
        width.target = next ? expanded : collapsed;
        rotation.target = next ? 0 : 1;
        labelTime = 0;
        if (!next) labels.forEach(function (label) { label.spring.target = 0; });
        start(initial);
      },
      select: function (button) {
        if (!button) { highlight.hidden = true; return; }
        var top = button.offsetTop + 'px';
        if (highlight.style.getPropertyValue('--nf-rail-highlight-y') !== top) {
          highlight.style.setProperty('--nf-rail-highlight-y', top);
        }
        highlight.hidden = false;
      }
    };
  }

  function applyRailState() {
    document.documentElement.classList.toggle('nf-rail-open', railOpen);
    if (railMotion) railMotion.setOpen(railOpen);
    var t = document.querySelector('.nf-collapse');
    if (t) {
      t.setAttribute('aria-label', railOpen ? '收起侧栏' : '展开侧栏');
      t.setAttribute('aria-expanded', String(railOpen));
    }
  }

  var SVG_MIN = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M2 6h8"/></svg>';
  var SVG_MAX = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1"><rect x="2.2" y="2.2" width="7.6" height="7.6" rx="1"/></svg>';
  var SVG_RESTORE = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1"><rect x="2.2" y="3.6" width="6.2" height="6.2" rx="1"/><path d="M4.4 3.6V2.7a.5.5 0 0 1 .5-.5h4.4a.5.5 0 0 1 .5.5v4.4a.5.5 0 0 1-.5.5h-.9"/></svg>';
  var SVG_CLOSE = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M2.6 2.6l6.8 6.8M9.4 2.6l-6.8 6.8"/></svg>';

  function buildTitlebar() {
    var bar = document.createElement('div');
    bar.className = 'nf-brandbar';

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'nf-collapse';
    toggle.setAttribute('aria-label', '收起侧栏');
    toggle.setAttribute('aria-controls', 'nf-main-navigation');
    toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="m14 6-6 6 6 6"/></svg>';
    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      railOpen = !railOpen;
      try { localStorage.setItem('nf_rail_open', railOpen ? '1' : '0'); } catch (err) {}
      applyRailState();
    });
    try {
      railOpen = localStorage.getItem('nf_rail_open') === '1';
    } catch (err) {}
    bar.appendChild(toggle);

    var brand = document.createElement('div');
    brand.className = 'nf-brand nf-ver';
    var name = document.createElement('span');
    name.textContent = NOXFLASH_VERSION;
    brand.appendChild(name);
    bar.appendChild(brand);

    var controls = document.createElement('div');
    controls.className = 'nf-wincontrols';
    controls.appendChild(winCtl('min', '最小化', SVG_MIN));
    maxBtnEl = winCtl('max', '最大化', SVG_MAX);
    controls.appendChild(maxBtnEl);
    controls.appendChild(winCtl('close', '关闭', SVG_CLOSE));
    bar.appendChild(controls);

    bar.addEventListener('dblclick', function (e) {
      if (e.target.closest('.nf-wincontrols')) return;
      if (window.noxflashWin) window.noxflashWin.toggleMaximize();
    });

    if (window.noxflashWin && typeof window.noxflashWin.onState === 'function') {
      window.noxflashWin.onState(function (st) {
        if (!maxBtnEl) return;
        var isMax = !!(st && st.maximized);
        maxBtnEl.innerHTML = isMax ? SVG_RESTORE : SVG_MAX;
        maxBtnEl.setAttribute('aria-label', isMax ? '还原' : '最大化');
      });
      try {
        var p = window.noxflashWin.getState();
        if (p && typeof p.then === 'function') p.then(function (st) {
          if (maxBtnEl && st && st.maximized) { maxBtnEl.innerHTML = SVG_RESTORE; maxBtnEl.setAttribute('aria-label', '还原'); }
        }).catch(function () {});
      } catch (e) {}
    }

    return bar;
  }

  function patchBrand() {
    var brand = document.querySelector('.tb-brand');
    if (!brand) return false;
    if (brand.querySelector('.nf-brand-mark')) {
      brandImg = brand.querySelector('.nf-brand-mark');
      return true;
    }
    var svg = brand.querySelector('svg');
    var img = document.createElement('img');
    img.className = 'nf-brand-mark';
    img.alt = 'NoxFlash';
    img.src = markSrc();
    img.draggable = false;
    if (svg && svg.parentNode) svg.parentNode.replaceChild(img, svg);
    else brand.insertBefore(img, brand.firstChild);
    brandImg = img;
    return true;
  }

  /* -------------------------------------------------- 侧栏加号 + 提示 */
  var plusWired = false;

  function navItems() {
    return Array.prototype.slice.call(document.querySelectorAll('header.tb .tb-nav .tb-nav-item'));
  }

  function itemLabel(btn) {
    var span = btn.querySelector('span');
    return (span ? span.textContent : btn.textContent || '').trim();
  }

  function clickHome() {
    var home = navItems().filter(function (b) {
      var t = itemLabel(b);
      return t === '首页' || /home/i.test(t) || b.classList.contains('on');
    })[0];
    if (home) home.click();
    return !!home;
  }

  function newProject() {
    clickHome();
    var tries = 0;
    (function poke() {
      var btn = document.querySelector('.hp-new') ||
        document.querySelector('.hp-recent .hp-new') ||
        document.querySelector('[class*="hp-new"]');
      if (btn) { btn.click(); return; }
      if (tries++ < 20) setTimeout(poke, 60);
    })();
  }

  function buildRailLogo() {
    var wrap = document.createElement('div');
    wrap.className = 'nf-rail-logo';
    var img = document.createElement('img');
    img.className = 'nf-rail-mark';
    img.alt = '';
    img.src = railSrc();
    img.draggable = false;
    wrap.appendChild(img);
    var name = document.createElement('span');
    name.className = 'nf-rail-name';
    name.textContent = 'NoxFlash';
    wrap.appendChild(name);
    return wrap;
  }

  function patchRail() {
    var nav = document.querySelector('.tb-nav');
    if (!nav) return false;

    var items = navItems();
    if (!items.length) return false;

    items.forEach(function (b) {
      if (b.dataset.nfTip) return;
      var label = itemLabel(b);
      if (label) { b.title = label; b.dataset.nfTip = '1'; }
    });

    if (!nav.querySelector('.nf-rail-logo')) {
      nav.insertBefore(buildRailLogo(), nav.firstChild);
    }

    return true;
  }


  /* ============================================================ 画布模式侧栏
     进画布后原顶部栏被整个卸载（shell 加 no-bar，header 不再渲染），
     侧栏跟着消失。这里自建一份常驻侧栏，靠 postMessage 让页面切路由。 */
  var ROUTES = { '首页': 'home', '浏览器': 'browser', '画布': 'canvas', '素材库': 'asset-manager', '灵感库': 'inspiration', '应用市场': 'store', '我的': 'me' };
  var ROUTE_ORDER = ['home', 'browser', 'canvas', 'asset-manager', 'inspiration', 'store', 'me'];
  var iconCache = {};   // label -> 图标 svg 外框 HTML
  var railEl = null;
  var railRightEl = null;
  var railRoute = '';

  function cacheIcons() {
    navItems().forEach(function (b) {
      var label = itemLabel(b);
      var svg = b.querySelector('svg');
      if (label && svg) iconCache[label] = svg.outerHTML;
    });
  }

  function navigate(route) {
    try {
      window.postMessage({ type: 'navigate', route: route }, location.origin);
    } catch (e) {}
  }

  /* 画布路由下 Vue 卸了顶栏，侧栏仍使用相同的线性图标。 */
  var ICONS = {
    '首页': '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    '灵感库': '<path d="M12 2v2m5 3 2-2M5 5l2 2M9 18h6m-5 4h4"/><path d="M9 15c0-2-3-3-3-6a6 6 0 0 1 12 0c0 3-3 4-3 6"/>',
    '画布': '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    '素材库': '<rect x="6" y="3" width="15" height="15" rx="2"/><path d="M3 7v12a2 2 0 0 0 2 2h12"/><circle cx="11" cy="8" r="1.5"/><path d="m6 15 4-4 3 3 3-4 5 5"/>',
    '浏览器': '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',
    '应用市场': '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    '我的': '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  };

  function iconSvg(label) {
    var inner = ICONS[label] ||
      '<circle cx="12" cy="12" r="7"/>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }

  function fallbackIcon(label) {
    var cached = iconCache[label];
    if (cached && label !== '浏览器') return cached;
    if (ICONS[label]) return iconSvg(label);
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">' +
      '<circle cx="12" cy="12" r="7"/></svg>';
  }

  function buildRail() {
    var nav = document.createElement('nav');
    nav.className = 'tb-nav nf-rail-fallback';
    nav.id = 'nf-main-navigation';
    nav.setAttribute('aria-label', '主导航');

    nav.appendChild(buildRailLogo());
    var highlight = document.createElement('span');
    highlight.className = 'nf-rail-highlight';
    highlight.hidden = true;
    highlight.setAttribute('aria-hidden', 'true');
    nav.appendChild(highlight);

    var labels = Object.keys(ROUTES).filter(function (l) { return iconCache[l] || true; });
    labels.forEach(function (label) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tb-nav-item' + (ROUTES[label] === 'canvas' ? ' on' : '');
      btn.setAttribute('data-v-2019faf9', '');
      btn.setAttribute('aria-label', label);
      btn.innerHTML = (ICONS[label] ? iconSvg(label) : fallbackIcon(label)) +
        '<span class="nf-rail-label">' + label + '</span>';
      btn.dataset.nfIcon = '1';
      btn.addEventListener('click', function () {
        var hit = navItems().filter(function (b) { return itemLabel(b) === label; })[0];
        if (hit) hit.click();
        else navigate(ROUTES[label]);
      });
      nav.appendChild(btn);
    });

    var right = document.createElement('div');
    right.className = 'tb-right nf-rail-right';

    var themeBtn = document.createElement('button');
    themeBtn.type = 'button';
    themeBtn.className = 'tb-btn';
    themeBtn.setAttribute('data-v-77d7c4b0', '');
    themeBtn.setAttribute('aria-label', '切换主题');
    themeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/></svg>' +
      '<span class="nf-rail-label">主题</span>';
    themeBtn.addEventListener('click', toggleTheme);
    right.appendChild(themeBtn);

    var setBtn = document.createElement('button');
    setBtn.type = 'button';
    setBtn.className = 'tb-btn';
    setBtn.setAttribute('data-v-77d7c4b0', '');
    setBtn.setAttribute('aria-label', '设置');
    setBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M20 7h-9"/>' +
      '<path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>' +
      '<span class="nf-rail-label">设置</span>';
    setBtn.addEventListener('click', function () {
      try { window.postMessage({ type: 'open-settings', tab: 'general' }, location.origin); } catch (e) {}
    });
    right.appendChild(setBtn);

    return { nav: nav, right: right };
  }

  function toggleTheme() {
    var next = isDark() ? 'light' : 'dark';
    var done = false;
    try {
      if (window.StudioTheme && typeof window.StudioTheme.set === 'function') {
        window.StudioTheme.set(next);
        done = true;
      }
    } catch (e) {}
    if (!done) {
      document.documentElement.classList.toggle('theme-dark', next === 'dark');
      document.documentElement.setAttribute('data-theme', next);
    }
    try {
      window.dispatchEvent(new CustomEvent('studio-theme-change', { detail: { theme: next } }));
    } catch (e) {}
    syncBrand();
  }

  /* 当前处在哪个路由：画布模式 Vue 把 header 卸了，只能看 shell 的 class */
  function activeRoute() {
    var shell = document.querySelector('.shell');
    if (!shell) return '';
    if (shell.classList.contains('route-canvas')) return 'canvas';
    var on = shell.querySelector('.tb-nav .tb-nav-item.on');
    if (on) return ROUTES[itemLabel(on)] || '';
    var cls = String(shell.className);
    for (var i = 0; i < ROUTE_ORDER.length; i++) {
      if (cls.indexOf('route-' + ROUTE_ORDER[i]) >= 0) return ROUTE_ORDER[i];
    }
    return '';
  }

  function syncRailActive() {
    if (!railEl) return;
    var cur = railRoute || activeRoute();
    document.documentElement.classList.toggle('nf-route-canvas', cur === 'canvas');
    Array.prototype.slice.call(railEl.querySelectorAll('.tb-nav-item')).forEach(function (b) {
      var label = b.getAttribute('aria-label');
      b.classList.toggle('on', ROUTES[label] === cur);
      // 侧栏是先建后拿到图标的：Vue 那条导航一出现就把真图标补上
      if (!b.dataset.nfIcon) {
        b.innerHTML = (ICONS[label] ? iconSvg(label) : fallbackIcon(label)) +
          '<span class="nf-rail-label">' + label + '</span>';
        b.dataset.nfIcon = '1';
      }
    });
    if (railMotion) railMotion.select(railEl.querySelector('.tb-nav-item.on'));
  }

  window.addEventListener('noxflash-route-change', function (event) {
    railRoute = event.detail.id;
    syncRailActive();
  });

  /* 首页标题文案：今天想创作点什么？ → 有灵感聊一聊 */
  var HOME_TITLE_FROM = '\u4eca\u5929\u60f3\u521b\u4f5c\u70b9\u4ec0\u4e48\uff1f';
  var HOME_TITLE_TO = '\u6709\u7075\u611f\u804a\u4e00\u804a';
  function patchHomeTitle() {
    var hp = document.querySelector('.hp');
    if (!hp) return;
    var walker = document.createTreeWalker(hp, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walker.nextNode())) {
      if (n.nodeValue && n.nodeValue.indexOf(HOME_TITLE_FROM) !== -1) {
        n.nodeValue = n.nodeValue.split(HOME_TITLE_FROM).join(HOME_TITLE_TO);
      }
    }
  }

  /* 常驻框架：侧栏、标题栏建好就一直挂着，路由切换只换中间那张卡片 */
  function ensureFrame() {
    if (!railEl) {
      var built = buildRail();
      railEl = built.nav;
      railRightEl = built.right;
      document.body.appendChild(railEl);
      document.body.appendChild(railRightEl);
    }
    if (!brandbarEl) {
      brandbarEl = buildTitlebar();
      document.body.appendChild(brandbarEl);
      railMotion = createRailMotion(railEl, railRightEl, brandbarEl.querySelector('.nf-collapse'));
      applyRailState();
    }
    syncRailActive();
  }

  /* --------------------------------------------------------------- 启动 */
  var booted = false;
  var tries = 0;

  function tick() {
    patchHomeTitle();
    var a = patchBrand();
    var b = patchRail();
    if (b) cacheIcons();
    ensureFrame();
    if (a && b) { booted = true; return; }
    if (tries++ < 60) setTimeout(tick, 120);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tick);
  } else {
    tick();
  }

  /* 主题切换后同步 logo */
  new MutationObserver(function () {
    if (!brandImg) patchBrand();
    syncBrand();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });

  /* 路由切换后 .tb-brand / .tb-nav 可能被复用或重建 */
  var recheck = null;
  new MutationObserver(function () {
    if (recheck) return;
    recheck = setTimeout(function () {
      recheck = null;
      if (!document.querySelector('.nf-brand-mark') || !document.querySelector('.nf-newtab')) {
        booted = false;
        tries = 0;
        tick();
      } else {
        syncBrand();
        patchHomeTitle();
        if (patchRail()) cacheIcons();
      }
      ensureFrame();
    }, 150);
  }).observe(document.body, { childList: true, subtree: true });
})();
