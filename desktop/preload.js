// NoxFlash Desktop — preload 脚本（contextIsolation）
// 职责：
//  1) 暴露 window.pywebview.api —— 兼容前端现有 pywebview 桥接约定（零前端改动）
//  2) 暴露 window.__noxflashBridge 低层桥（供 iframe 注入脚本转发用）
//  3) 在主 frame 触发 pywebviewready 事件
const { contextBridge, ipcRenderer } = require('electron');

// ---------- pywebview 兼容 API ----------
// 与 launcher.py 暴露给前端的 js_api 方法名对齐
const api = {
  // 窗口控制
  minimize: () => ipcRenderer.invoke('noxflash:window', { action: 'minimize' }),
  maximize: () => ipcRenderer.invoke('noxflash:window', { action: 'maximize' }),
  close: () => ipcRenderer.invoke('noxflash:window', { action: 'close' }),
  quit_app: () => ipcRenderer.invoke('noxflash:window', { action: 'quit' }),
  start_window_drag: () => ipcRenderer.invoke('noxflash:window', { action: 'start-drag' }),
  end_window_drag: () => ipcRenderer.invoke('noxflash:window', { action: 'end-drag' }),
  begin_frameless_resize: (dir) => ipcRenderer.invoke('noxflash:window', { action: 'begin-resize', dir }),
  update_frameless_resize: (dx, dy) => ipcRenderer.invoke('noxflash:window', { action: 'update-resize', dx, dy }),
  end_frameless_resize: () => ipcRenderer.invoke('noxflash:window', { action: 'end-resize' }),

  // 对话框
  save_file: (dataUrl, filename) => ipcRenderer.invoke('noxflash:save-file', { dataUrl, filename }),
  select_directory: () => ipcRenderer.invoke('noxflash:select-directory'),
  get_screen_sources: () => ipcRenderer.invoke('noxflash:recording-sources'),
  select_screen_source: (sourceId) => ipcRenderer.invoke('noxflash:recording-select-source', { sourceId }),

  // 数据目录 / 系统
  get_data_dir: () => ipcRenderer.invoke('noxflash:get-data-dir'),
  open_data_dir: () => ipcRenderer.invoke('noxflash:open-data-dir'),
  set_auto_start: (value) => ipcRenderer.invoke('noxflash:set-auto-start', { value }),

  // 素材源内嵌浏览器（WebContentsView 叠层，登录态由主进程持久化）
  open_source_view: (source, rect) => {
    // 两种用法：open_source_view('huaban', rect) / open_source_view({ url, sourceKey: 'custom', rect })
    if (source && typeof source === 'object') {
      return ipcRenderer.invoke('noxflash:source-view', Object.assign({ action: 'open' }, source, rect ? { rect: rect } : {}));
    }
    return ipcRenderer.invoke('noxflash:source-view', { action: 'open', source, rect });
  },
  set_source_view_bounds: (rect) => ipcRenderer.invoke('noxflash:source-view', { action: 'setBounds', rect }),
  close_source_view: () => ipcRenderer.invoke('noxflash:source-view', { action: 'close' }),
  get_source_view_state: () => ipcRenderer.invoke('noxflash:source-view', { action: 'state' }),
  reload_source_view: () => ipcRenderer.invoke('noxflash:source-view', { action: 'reload' }),
  get_source_view_page_html: () => ipcRenderer.invoke('noxflash:source-view', { action: 'page-html' }),
  // 前端两种调用都支持：(url, maxBytes) 位置参数 或 ({url, maxBytes}) 对象参数
  get_source_view_fetch_bytes: (a, b) => ipcRenderer.invoke('noxflash:source-view',
    typeof a === 'string'
      ? { action: 'fetch-bytes', url: a, maxBytes: b }
      : Object.assign({ action: 'fetch-bytes' }, a || {})),
  // 最近一次在内嵌浏览器里被拖拽的元素（真实媒体地址等）
  get_last_guest_drag: () => ipcRenderer.invoke('noxflash:source-view', { action: 'last-drag' }),
  get_guest_drag_bytes: () => ipcRenderer.invoke('noxflash:source-view', { action: 'guest-drag-bytes' }),
  get_guest_drag_original: () => ipcRenderer.invoke('noxflash:source-view', { action: 'guest-drag-original' }),
  // 内嵌浏览器网络里抓到的媒体请求（最近 120 秒）
  get_recent_source_media: () => ipcRenderer.invoke('noxflash:source-view', { action: 'recent-media' }),
  get_recent_custom_source_urls: () => ipcRenderer.invoke('noxflash:source-view', { action: 'custom-urls' }),
  // 内嵌网页缩放：mode = 'in' | 'out' | 'reset' | 'set'（set 时传 value）
  set_source_zoom: (mode, value) => ipcRenderer.invoke('noxflash:source-view', { action: 'source-zoom', mode, value }),
  source_zoom_in: () => ipcRenderer.invoke('noxflash:source-view', { action: 'source-zoom', mode: 'in' }),
  source_zoom_out: () => ipcRenderer.invoke('noxflash:source-view', { action: 'source-zoom', mode: 'out' }),
  source_zoom_reset: () => ipcRenderer.invoke('noxflash:source-view', { action: 'source-zoom', mode: 'reset' }),
  source_go_back: () => ipcRenderer.invoke('noxflash:source-view', { action: 'source-nav', nav: 'back' }),
  source_go_forward: () => ipcRenderer.invoke('noxflash:source-view', { action: 'source-nav', nav: 'forward' }),
  source_reload: () => ipcRenderer.invoke('noxflash:source-view', { action: 'source-nav', nav: 'reload' }),
  set_source_ui_theme: (theme) => ipcRenderer.invoke('noxflash:source-view', { action: 'source-ui-theme', theme: theme }),
  switch_source_site: (site) => ipcRenderer.invoke('noxflash:source-view', { action: 'source-site', site: site }),
  on_source_view_closed: (callback) => {
    const handler = (event, payload) => { try { callback(payload); } catch (_) {} };
    ipcRenderer.on('noxflash:source-view-closed', handler);
    return () => { try { ipcRenderer.removeListener('noxflash:source-view-closed', handler); } catch (_) {} };
  },
  on_source_custom_request: (callback) => {
    const handler = (event, payload) => { try { callback(payload); } catch (_) {} };
    ipcRenderer.on('noxflash:source-custom-request', handler);
    return () => { try { ipcRenderer.removeListener('noxflash:source-custom-request', handler); } catch (_) {} };
  },
  on_source_controls_fallback: (callback) => {
    const handler = (event, payload) => { try { callback(payload); } catch (_) {} };
    ipcRenderer.on('noxflash:source-controls-fallback', handler);
    return () => { try { ipcRenderer.removeListener('noxflash:source-controls-fallback', handler); } catch (_) {} };
  },
  // 用主进程 session.fetch 拉取（不受 CORS 限制、带登录 cookie）：(url, referer) 或 ({url, referer})
  fetch_source_url: (a, b) => ipcRenderer.invoke('noxflash:source-view',
    typeof a === 'string'
      ? { action: 'fetch-url', url: a, referer: b }
      : Object.assign({ action: 'fetch-url' }, a || {})),
  // 旧方法保留，内部转到 source-view（前端可渐进迁移）
  open_source_browser: (source) => ipcRenderer.invoke('noxflash:source-view', { action: 'open', source }),
  close_source_browser: () => ipcRenderer.invoke('noxflash:source-view', { action: 'close' }),
  get_source_browser_state: () => ipcRenderer.invoke('noxflash:source-view', { action: 'state' }),
  get_browser_homepage: (legacy) => ipcRenderer.invoke('noxflash:browser-homepage', 'get', legacy),
  set_browser_homepage: (url) => ipcRenderer.invoke('noxflash:browser-homepage', 'set', url),
  on_browser_tab_event: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('noxflash:browser-tab', handler);
    return () => ipcRenderer.removeListener('noxflash:browser-tab', handler);
  },

  // 标题栏主题（macOS）
  set_titlebar_theme: (r, g, b) => ipcRenderer.invoke('noxflash:set-titlebar-theme', { r, g, b }),

  // 信息
  get_app_info: () => ipcRenderer.invoke('noxflash:get-app-info'),
};

contextBridge.exposeInMainWorld('pywebview', {
  api,
});

// ---------- Magnetar 更新 ----------
contextBridge.exposeInMainWorld('noxflashUpdater', {
  mode: 'auto',
  checkNow: () => ipcRenderer.invoke('noxflash:update-check'),
  downloadAndInstall: () => ipcRenderer.invoke('noxflash:update-install'),
  onProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('noxflash:update-progress', listener);
    return () => ipcRenderer.removeListener('noxflash:update-progress', listener);
  },
  onStage: () => () => {},
  restartNow: () => ipcRenderer.invoke('noxflash:update-restart'),
  installOnQuit: () => ipcRenderer.invoke('noxflash:update-later'),
  markNotesSeen: () => ipcRenderer.invoke('noxflash:update-notes-seen'),
  retryInstall: () => ipcRenderer.invoke('noxflash:update-retry'),
});

// ---------- 自绘窗口按钮（与「轻画」同一套架构：窗口无边框，按钮由网页画） ----------
const winStateListeners = new Set();
ipcRenderer.on('noxflash:win-state', (event, payload) => {
  const data = payload || {};
  winStateListeners.forEach((cb) => { try { cb(data); } catch (_) {} });
});

contextBridge.exposeInMainWorld('noxflashWin', {
  minimize: () => ipcRenderer.send('noxflash:win', 'minimize'),
  toggleMaximize: () => ipcRenderer.send('noxflash:win', 'toggle-max'),
  close: () => ipcRenderer.send('noxflash:win', 'close'),
  getState: () => ipcRenderer.invoke('noxflash:win-state'),
  onState: (cb) => {
    if (typeof cb !== 'function') return () => {};
    winStateListeners.add(cb);
    return () => { try { winStateListeners.delete(cb); } catch (_) {} };
  },
});

// 低层桥：iframe 子页面注入脚本通过 window.parent.postMessage 转发到这里
contextBridge.exposeInMainWorld('__noxflashBridge', {
  invoke: (method, payload) => ipcRenderer.invoke('noxflash:' + method, payload),
});

// ---------- iframe 子页面桥接：接收 postMessage 转发请求并回发结果 ----------
// iframe 内被注入了迷你 shim，调用 window.parent.postMessage({__noxflashReq,...})；
// 主 frame 的 preload 在此监听、走 IPC 到主进程、再把结果 postMessage 回 iframe。
window.addEventListener('message', async (e) => {
  const data = e.data;
  if (!data || data.__noxflashReq !== true) return;
  const { seq, method, payload } = data;
  try {
    const result = await ipcRenderer.invoke('noxflash:' + method, payload);
    if (e.source && typeof e.source.postMessage === 'function') {
      e.source.postMessage({ __noxflashRes: true, seq, result }, '*');
    }
  } catch (err) {
    if (e.source && typeof e.source.postMessage === 'function') {
      e.source.postMessage({ __noxflashRes: true, seq, result: null }, '*');
    }
  }
});

// ---------- 主进程事件 → 主窗口 + 所有 iframe 转发 ----------
// iframe 桥只有 request/response；关闭/自定义站点这类被动事件走 postMessage 广播，
// iframe 里的 shim 再转成 document 上的 CustomEvent 供画布页监听。
function forwardSourceEvent(ipcChannel, messageType) {
  ipcRenderer.on(ipcChannel, (event, payload) => {
    try { window.dispatchEvent(new CustomEvent(messageType, { detail: payload })); } catch (_) {}
    try {
      const frames = document.querySelectorAll ? document.querySelectorAll('iframe') : [];
      Array.prototype.forEach.call(frames, (frame) => {
        try {
          const frameWindow = frame && frame.contentWindow;
          if (frameWindow && typeof frameWindow.postMessage === 'function') {
            frameWindow.postMessage({ type: messageType, payload: payload }, '*');
          }
        } catch (_) {}
      });
    } catch (_) {}
  });
}
forwardSourceEvent('noxflash:source-view-closed', 'noxflash:source-view-close');
forwardSourceEvent('noxflash:source-custom-request', 'noxflash:source-custom-request');

// 触发 pywebviewready（与 pywebview 的真实事件名一致）
try {
  window.dispatchEvent(new Event('pywebviewready'));
} catch (_) {}
