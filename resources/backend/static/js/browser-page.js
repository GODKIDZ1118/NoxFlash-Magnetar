(() => {
  const homeKey = 'noxflash-browser-home';
  const historyKey = 'noxflash-browser-history';
  const partition = 'persist:noxflash-browser';
  const api = () => window.pywebview?.api;
  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  };
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  }
  function webUrl(value) {
    try {
      const url = new URL(value);
      if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href;
    } catch {}
    return '';
  }
  function getHomepage() {
    const legacy = webUrl(read(homeKey, ''));
    return api()?.get_browser_homepage?.(legacy) ?? Promise.resolve(legacy);
  }
  async function saveHomepage(url) {
    if (api()?.set_browser_homepage) {
      await api().set_browser_homepage(url);
      return true;
    }
    return write(homeKey, url);
  }
  function website(value) {
    const input = value.trim();
    if (!input) return '';
    if (/^[\w-]+(?:\.[\w-]+)*:\d+(?:[/?#]|$)/.test(input)) return webUrl('http://' + input);
    if (/^[a-z][a-z\d+.-]*:/i.test(input)) return webUrl(input);
    if (/^(?:localhost|\[[\da-f:]+\])(?=$|[/?#])/i.test(input)) return webUrl('http://' + input);
    if (/^[^\s/]+\.[^\s/]+/.test(input)) return webUrl('https://' + input);
    return '';
  }
  const icons = {
    back: '<path d="m12 19-7-7 7-7M5 12h14"/>',
    forward: '<path d="m12 5 7 7-7 7M19 12H5"/>',
    reload: '<path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/>',
    home: '<path d="m3 10 9-7 9 7v10H3zM9 20v-7h6v7"/>',
    history: '<path d="M3 12a9 9 0 1 1 3 6M3 5v7h7m2-5v5l3 2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',
    stop: '<rect x="7" y="7" width="10" height="10" rx="1"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  };
  const svg = name => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
  const button = (action, label, icon = action) =>
    `<button type="button" class="nfb-icon" data-action="${action}" title="${label}" aria-label="${label}">${svg(icon)}</button>`;
  const historyDate = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'long' });
  const historyClock = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  function openHistory() {
    if (document.getElementById('nfb-history-dialog')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'nfb-history-dialog';
    dialog.setAttribute('aria-labelledby', 'nfb-history-title');
    dialog.innerHTML = `
      <header class="nfb-history-head">
        <h2 id="nfb-history-title">历史浏览记录</h2>
        <button type="button" class="nv-btn sm primary" data-delete disabled>删除</button>
        <button type="button" class="nfb-icon" aria-label="关闭历史浏览记录" autofocus>${svg('close')}</button>
      </header>
      <p class="nfb-history-feedback" role="status" hidden></p>
      <div class="nfb-history" tabindex="0" aria-label="按日期分类的浏览记录"></div>`;
    const list = dialog.querySelector('.nfb-history');
    const remove = dialog.querySelector('[data-delete]');
    const feedback = dialog.querySelector('.nfb-history-feedback');
    const choices = [];
    const keyFor = row => JSON.stringify([row.url, row.time]);
    const updateDelete = () => { remove.disabled = !choices.some(({ checkbox }) => checkbox.checked); };
    function render() {
      const saved = read(historyKey, []);
      const rows = (Array.isArray(saved) ? saved : [])
        .filter(row => row && webUrl(row.url) && typeof row.time === 'number' && Number.isFinite(new Date(row.time).getTime()))
        .sort((a, b) => b.time - a.time);
      list.replaceChildren();
      choices.length = 0;
      updateDelete();
      let group;
      let previousDate;
      for (const row of rows) {
        const date = historyDate.format(row.time);
        if (date !== previousDate) {
          group = document.createElement('section');
          const heading = document.createElement('h3');
          heading.textContent = date;
          group.append(heading);
          list.append(group);
          previousDate = date;
        }
        const item = document.createElement('div');
        const hitArea = document.createElement('label');
        const checkbox = document.createElement('input');
        const link = document.createElement('button');
        const timestamp = document.createElement('time');
        const detail = document.createElement('span');
        const title = document.createElement('strong');
        const address = document.createElement('span');
        const url = webUrl(row.url);
        item.className = 'nfb-history-row';
        hitArea.className = 'nfb-history-choice';
        hitArea.dataset.index = String(choices.length);
        checkbox.type = 'checkbox';
        checkbox.setAttribute('aria-label', '选择 ' + (row.title || url));
        hitArea.append(checkbox);
        choices.push({ checkbox, key: keyFor(row) });
        link.type = 'button';
        timestamp.dateTime = new Date(row.time).toISOString();
        timestamp.textContent = historyClock.format(row.time);
        title.textContent = row.title || url;
        address.textContent = url;
        detail.append(title, address);
        link.append(timestamp, detail);
        link.addEventListener('click', () => {
          dialog.close();
          window.postMessage({ type: 'noxflash:browser-history', url }, location.origin);
        });
        item.append(hitArea, link);
        group.append(item);
      }
      if (!rows.length) {
        const empty = document.createElement('p');
        empty.className = 'nfb-history-empty';
        empty.textContent = '暂无浏览记录';
        list.append(empty);
      }
    }
    list.addEventListener('change', updateDelete);
    let drag;
    list.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || drag) return;
      const area = event.target.closest('.nfb-history-choice');
      if (!area) return;
      event.preventDefault();
      const index = Number(area.dataset.index);
      const { checkbox } = choices[index];
      drag = { id: event.pointerId, index, checked: !checkbox.checked };
      checkbox.focus({ preventScroll: true });
      checkbox.checked = drag.checked;
      list.setPointerCapture(event.pointerId);
      updateDelete();
    });
    list.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId || !(event.buttons & 1)) return;
      const area = document.elementFromPoint(event.clientX, event.clientY)?.closest('.nfb-history-choice');
      if (!area) return;
      const index = Number(area.dataset.index);
      for (let i = Math.min(drag.index, index); i <= Math.max(drag.index, index); i++) {
        choices[i].checkbox.checked = drag.checked;
      }
      drag.index = index;
      updateDelete();
    });
    list.addEventListener('lostpointercapture', () => { drag = null; });
    dialog.querySelector('[autofocus]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') event.stopPropagation();
    });
    let outside;
    dialog.addEventListener('pointerdown', event => { outside = event.target === dialog; });
    dialog.addEventListener('click', event => {
      if (outside && event.target === dialog) dialog.close();
    });
    remove.addEventListener('click', () => {
      const selected = new Map();
      for (const { checkbox, key } of choices) {
        if (checkbox.checked) selected.set(key, (selected.get(key) || 0) + 1);
      }
      if (!selected.size) return;
      const saved = read(historyKey, []);
      if (!Array.isArray(saved) || !write(historyKey, saved.filter(row => {
        if (!row) return true;
        const key = keyFor(row);
        const count = selected.get(key) || 0;
        if (count) selected.set(key, count - 1);
        return count === 0;
      }))) {
        feedback.textContent = '删除失败，请重试。';
        feedback.hidden = false;
        return;
      }
      feedback.hidden = true;
      render();
      list.focus({ preventScroll: true });
    });
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    render();
    document.body.append(dialog);
    dialog.showModal();
  }

  class BrowserPage extends HTMLElement {
    connectedCallback() {
      if (this.tabs) return;
      this.tabs = [];
      this.innerHTML = `
        <header class="nfb-chrome">
          <div class="nfb-tabbar"><div class="nfb-tabs" role="group" aria-label="浏览器标签页"></div>${button('plus', '新建标签页')}</div>
          <form class="nfb-toolbar">
            <div class="nfb-nav-controls">${button('back', '后退')}${button('forward', '前进')}${button('reload', '刷新')}${button('home', '浏览器首页')}</div>
            <label class="nfb-address">${svg('search')}<input type="text" aria-label="浏览器地址栏" placeholder="输入网址或搜索" autocomplete="off" spellcheck="false" /></label>
            <div class="nfb-nav-controls">${button('history', '历史浏览记录')}</div>
          </form>
        </header>
        <div class="nfb-content">
          <div class="nfb-home-setup" hidden><button class="nv-btn sm ghost" type="button" data-action="settings">设置浏览器首页</button></div>
          <section class="nfb-error" hidden><h2></h2><p></p><button class="nv-btn sm ghost" type="button" data-action="reload">重试</button></section>
        </div>
        <p class="nfb-status" aria-live="polite" hidden></p>`;
      this.tabList = this.querySelector('.nfb-tabs');
      this.content = this.querySelector('.nfb-content');
      this.address = this.querySelector('input');
      this.homeSetup = this.querySelector('.nfb-home-setup');
      this.error = this.querySelector('.nfb-error');
      this.status = this.querySelector('.nfb-status');
      const submitAddress = event => {
        event.preventDefault();
        const input = event.currentTarget.querySelector('input').value.trim();
        if (!input) return;
        const url = website(input);
        if (!url && /^[a-z][\w+.-]*:/i.test(input)) {
          this.message('请输入有效的 HTTP 或 HTTPS 网址。');
          return;
        }
        event.currentTarget.querySelector('input').blur();
        this.navigate(this.active, url || 'https://www.bing.com/search?q=' + encodeURIComponent(input));
      };
      this.querySelector('form').addEventListener('submit', submitAddress);
      this.querySelectorAll('.nfb-nav-controls button').forEach(control => control.removeAttribute('title'));
      this.querySelector('[data-action="history"]').setAttribute('aria-haspopup', 'dialog');
      this.addEventListener('click', event => {
        const control = event.target.closest('button');
        if (!control) return;
        if (control.dataset.action) this.action(control.dataset.action);
      });
      this.addEventListener('keydown', event => {
        if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
        if (this.shortcut(event.key.toLowerCase())) event.preventDefault();
      });
      this.unsubscribe = api()?.on_browser_tab_event?.(data => {
        if (this.getClientRects().length === 0 || this.active?.guestId !== data.id) return;
        if (data.key) this.shortcut(data.key);
        else if (webUrl(data.url)) this.addTab(data.url, !data.background);
      });
      this.onRouteChange = ({ detail }) => {
        if (detail.id !== 'browser' || detail.skipBrowserHome) return;
        const homeTab = this.tabs[0];
        this.select(homeTab);
        this.openHomepage(homeTab);
      };
      window.addEventListener('noxflash-route-change', this.onRouteChange);
      this.openHomepage(this.addTab());
    }
    disconnectedCallback() {
      this.unsubscribe?.();
      window.removeEventListener('noxflash-route-change', this.onRouteChange);
      this.tabs = null;
    }
    async openHomepage(tab) {
      const revision = ++tab.navigation;
      tab.homePending = true;
      this.render();
      try {
        const url = webUrl(await getHomepage());
        if (!this.tabs?.includes(tab) || tab.navigation !== revision) return;
        if (url !== tab.url || tab.error) this.navigate(tab, url);
      } catch {
        if (this.active === tab) this.message('读取浏览器首页失败。');
      } finally {
        if (this.tabs?.includes(tab) && tab.navigation === revision) {
          tab.homePending = false;
          this.render();
        }
      }
    }
    message(text) {
      this.status.textContent = text;
      this.status.hidden = !text;
    }
    addTab(url = '', activate = true) {
      url = webUrl(url);
      const tab = { url: '', title: '', navigation: 0, homePending: !url };
      const item = document.createElement('div');
      item.className = 'nfb-tab';
      item.innerHTML = `<button type="button" class="nfb-tab-label">${svg('compass')}<span></span></button>${button('close', '关闭标签页')}`;
      tab.item = item;
      tab.select = item.firstElementChild;
      tab.select.addEventListener('click', () => this.select(tab));
      item.lastElementChild.addEventListener('click', () => this.closeTab(tab));
      this.tabs.push(tab);
      this.tabList.append(item);
      if (activate) this.select(tab);
      if (url) this.navigate(tab, url);
      this.render();
      return tab;
    }
    select(tab) {
      this.active = tab;
      this.message('');
      this.render(true);
      tab.item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    closeTab(tab) {
      const index = this.tabs.indexOf(tab);
      this.tabs.splice(index, 1);
      tab.item.remove();
      tab.ready = false;
      tab.view?.remove();
      if (!this.tabs.length) this.openHomepage(this.addTab());
      else if (tab === this.active) this.select(this.tabs[Math.min(index, this.tabs.length - 1)]);
    }
    shortcut(key) {
      if (key === 'l') { this.address.focus(); this.address.select(); }
      else if (key === 't') { this.action('plus'); }
      else if (key === 'w') { this.closeTab(this.active); this.active.select.focus(); }
      else if (key === 'r') { this.action('reload'); }
      else return false;
      return true;
    }
    action(action) {
      const tab = this.active;
      if (action === 'plus') this.openHomepage(this.addTab());
      if (action === 'history') openHistory();
      if (action === 'home') this.openHomepage(tab);
      if (action === 'settings') window.postMessage({ type: 'open-settings', tab: 'general' }, location.origin);
      if (action === 'back' && tab.back) tab.view.goBack();
      if (action === 'forward' && tab.forward) tab.view.goForward();
      if (action === 'reload' && tab.loading && tab.ready) tab.view.stop();
      else if (action === 'reload' && tab.url) {
        if (tab.ready && !tab.error) tab.view.reload();
        else this.navigate(tab, tab.url);
      }
    }
    navigate(tab, url) {
      tab.navigation++;
      tab.homePending = false;
      if (tab === this.active) this.message('');
      if (url && !api()?.on_browser_tab_event) {
        tab.url = url;
        tab.error = '请在更新后的 NoxFlash 桌面客户端中浏览网页。';
        this.render(tab === this.active);
        return;
      }
      tab.url = url;
      tab.title = '';
      tab.error = '';
      if (!tab.view && url) this.createView(tab, url);
      else if (tab.view) {
        if (tab.ready) tab.view.loadURL(url || 'about:blank').catch(() => {});
        else if (url) tab.view.src = url;
        else { tab.view.remove(); tab.view = null; tab.loading = false; }
      }
      this.render(tab === this.active);
    }
    createView(tab, url) {
      const view = document.createElement('webview');
      tab.view = view;
      tab.loading = true;
      view.title = '网页内容';
      view.setAttribute('partition', partition);
      view.setAttribute('allowpopups', '');
      const updateNav = () => {
        if (!tab.ready || !view.isConnected) return;
        tab.back = view.canGoBack();
        tab.forward = view.canGoForward();
      };
      const visit = () => {
        if (!tab.ready || !view.isConnected) return;
        const current = webUrl(view.getURL());
        if (!current || tab.error) return;
        const title = view.getTitle() || current;
        const rows = read(historyKey, []);
        const recent = rows[0];
        if (recent?.url === current && Date.now() - recent.time < 2000) {
          if (recent.title !== title) write(historyKey, [{ ...recent, title }, ...rows.slice(1)]);
          return;
        }
        write(historyKey, [{ url: current, title, time: Date.now() }, ...rows].slice(0, 500));
      };
      view.addEventListener('dom-ready', () => {
        if (!view.isConnected) return;
        tab.ready = true;
        tab.guestId = view.getWebContentsId();
        updateNav();
        this.render();
      });
      view.addEventListener('did-start-loading', () => { tab.loading = true; this.render(); });
      view.addEventListener('did-stop-loading', () => {
        tab.loading = false;
        if (tab.ready) updateNav();
        this.render();
      });
      view.addEventListener('did-start-navigation', event => {
        if (!event.isMainFrame) return;
        tab.url = webUrl(event.url);
        tab.error = '';
        this.render();
      });
      view.addEventListener('did-navigate', event => {
        tab.url = webUrl(event.url);
        tab.title = '';
        this.render();
      });
      view.addEventListener('did-navigate-in-page', event => {
        if (!event.isMainFrame) return;
        tab.url = webUrl(event.url);
        updateNav();
        visit();
        this.render();
      });
      view.addEventListener('did-finish-load', () => {
        if (!tab.ready || !view.isConnected) return;
        tab.title = view.getTitle();
        updateNav();
        visit();
        this.render();
      });
      view.addEventListener('page-title-updated', event => { tab.title = event.title; this.render(); });
      view.addEventListener('did-fail-load', event => {
        if (!event.isMainFrame || event.errorCode === -3) return;
        tab.url = webUrl(event.validatedURL) || tab.url;
        tab.error = '请检查网址和网络连接，然后重试。';
        this.render();
      });
      view.addEventListener('render-process-gone', () => {
        tab.error = '网页已停止响应，可以重试。';
        tab.ready = tab.back = tab.forward = tab.loading = false;
        view.remove();
        tab.view = null;
        this.render();
      });
      view.src = url;
      this.content.prepend(view);
    }
    render(forceAddress = false) {
      const active = this.active;
      if (!active) return;
      for (const tab of this.tabs) {
        const current = tab === active;
        const label = tab.url ? tab.title || new URL(tab.url).hostname : '浏览器首页';
        tab.select.querySelector('span').textContent = label;
        tab.select.title = label;
        tab.select.setAttribute('aria-pressed', String(current));
        tab.item.classList.toggle('is-active', current);
        if (tab.view) tab.view.hidden = !current || !tab.url || !!tab.error;
      }
      if (forceAddress || document.activeElement !== this.address) this.address.value = active.url;
      this.querySelector('[data-action="back"]').disabled = !active.back;
      this.querySelector('[data-action="forward"]').disabled = !active.forward;
      const reload = this.querySelector('.nfb-toolbar [data-action="reload"]');
      const label = active.loading ? '停止加载' : '刷新';
      if (reload.getAttribute('aria-label') !== label) {
        reload.setAttribute('aria-label', label);
        reload.innerHTML = svg(active.loading ? 'stop' : 'reload');
      }
      reload.disabled = !active.url;
      this.homeSetup.hidden = !!active.url || active.homePending;
      this.error.hidden = !active.error;
      if (active.error) {
        this.error.querySelector('h2').textContent = '无法打开网页';
        this.error.querySelector('p').textContent = active.error;
      }
    }
  }

  class BrowserSettings extends HTMLElement {
    connectedCallback() {
      if (this.initialized) return;
      this.initialized = true;
      const input = this.querySelector('input');
      const form = this.querySelector('form');
      const submit = form.querySelector('button[type=submit]');
      const feedback = this.querySelector('.nfb-feedback');
      input.disabled = submit.disabled = true;
      getHomepage().then(url => { input.value = webUrl(url); })
        .catch(() => { feedback.textContent = '读取浏览器首页失败。'; })
        .finally(() => { input.disabled = submit.disabled = false; });
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const value = input.value.trim();
        const url = website(value);
        if (value && !url) {
          feedback.textContent = '请输入有效的 HTTP 或 HTTPS 网址。';
          return;
        }
        input.disabled = submit.disabled = true;
        try {
          if (!await saveHomepage(url)) throw new Error('Homepage write failed');
          input.value = url;
          feedback.textContent = '已保存。';
        } catch {
          feedback.textContent = '保存失败。';
        } finally {
          input.disabled = submit.disabled = false;
        }
      });
      this.querySelector('[data-history-open]').addEventListener('click', openHistory);
    }
  }

  customElements.define('nox-browser', BrowserPage);
  customElements.define('nox-browser-settings', BrowserSettings);
})();
