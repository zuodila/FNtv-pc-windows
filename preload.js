'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Electron 28 的 preload 运行在 sandbox 中，不能 require 本地相对模块，CSS 在此内联。
// 拖动条必须独立且自身 pointer-events:auto，否则 -webkit-app-region:drag 失效（之前拖不动的根因）。
const CTRL_CSS = `
#__fntv_dragbar{
  position:fixed !important; top:0 !important; left:120px !important; right:140px !important;
  height:30px !important; z-index:2147483645 !important;
  -webkit-app-region:drag !important; -webkit-user-select:none !important;
  user-select:none !important; pointer-events:auto !important;
}
#__fntv_dragL,#__fntv_dragR{
  position:fixed !important; top:30px !important; bottom:0 !important;
  width:10px !important; z-index:2147483645 !important;
  -webkit-app-region:drag !important; pointer-events:auto !important;
}
#__fntv_dragL{ left:0 !important; }
#__fntv_dragR{ right:0 !important; }
#__fntv_ctrlbar{
  position:fixed !important; top:0 !important; right:8px !important;
  height:32px !important; z-index:2147483647 !important;
  display:flex !important; align-items:center !important; justify-content:flex-end !important;
  -webkit-app-region:no-drag !important; pointer-events:none !important;
  font-family:"Microsoft YaHei","PingFang SC",sans-serif !important; line-height:1 !important;
}
#__fntv_ctrlbar .fntv-box{
  pointer-events:auto !important; -webkit-app-region:no-drag !important;
  display:flex !important; align-items:center !important; height:32px !important;
  padding:0 4px !important; background:transparent !important; border:0 !important;
  box-shadow:none !important; border-radius:0 !important; margin:0 !important;
}
#__fntv_ctrlbar .fntv-btn{
  -webkit-app-region:no-drag !important; width:38px !important; height:32px !important;
  border:0 !important; background:transparent !important; color:#6b7583 !important;
  display:inline-flex !important; align-items:center !important; justify-content:center !important;
  cursor:pointer !important; padding:0 !important; font-size:13px !important;
  transition:background .15s,color .15s !important;
}
#__fntv_ctrlbar .fntv-btn:hover{ background:rgba(120,130,150,.22) !important; color:#333 !important; }
#__fntv_ctrlbar .fntv-close:hover{ background:#e81123 !important; color:#fff !important; }
#__fntv_ctrlbar .fntv-max.maxed span{ width:9px !important; height:9px !important; }
`;

// 关键：bridge API 同时保留本地引用 api。
// preload 运行在 isolated world，回调里若用 window.fntvAPI（main world）会是 undefined，
// 导致按钮点击报 "Cannot read properties of undefined (reading 'winMin')"。回调用 api.xxx。
const api = {
  getState: () => ipcRenderer.invoke('get-state'),
  connect: (payload) => ipcRenderer.invoke('connect', payload),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  retry: () => ipcRenderer.invoke('retry'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  winMin: () => ipcRenderer.invoke('win-min'),
  winMax: () => ipcRenderer.invoke('win-max'),
  winClose: () => ipcRenderer.invoke('win-close'),
  showMenu: () => ipcRenderer.invoke('show-menu'),
  isMaxed: () => ipcRenderer.invoke('win-ismax')
};
contextBridge.exposeInMainWorld('fntvAPI', api);

(function injectControls() {
  function ensureCss() {
    if (document.getElementById('__fntv_ctrlcss')) return;
    const st = document.createElement('style');
    st.id = '__fntv_ctrlcss';
    st.textContent = CTRL_CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function build() {
    try {
      ensureCss();
      const host = document.body || document.documentElement;

      // 1) 全宽顶部拖动条（独立于控制条，保证 drag 生效）
      if (!document.getElementById('__fntv_dragbar')) {
        const drag = document.createElement('div');
        drag.id = '__fntv_dragbar';
        drag.title = '按住拖动窗口';
        host.appendChild(drag);
        drag.addEventListener('dblclick', () => api.winMax());
      }
      // 2) 左右边缘拖动区：整页左右两侧都能按住拖动
      ['__fntv_dragL', '__fntv_dragR'].forEach(id => {
        if (!document.getElementById(id)) {
          const e = document.createElement('div');
          e.id = id;
          host.appendChild(e);
        }
      });

      // 3) 右上角控制条
      if (!document.getElementById('__fntv_ctrlbar')) {
        const bar = document.createElement('div');
        bar.id = '__fntv_ctrlbar';
        bar.innerHTML =
          '<div class="fntv-box">' +
            '<button class="fntv-btn fntv-min" title="最小化"><span style="display:inline-block;width:11px;height:1.6px;background:currentColor"></span></button>' +
            '<button class="fntv-btn fntv-max" title="最大化"><span style="display:inline-block;width:10px;height:10px;border:1.5px solid currentColor"></span></button>' +
            '<button class="fntv-btn fntv-close" title="关闭"><svg viewBox="0 0 12 12" width="12" height="12"><path stroke="currentColor" stroke-width="1.6" d="M2 2l8 8M10 2l-8 8"/></svg></button>' +
          '</div>';
        host.appendChild(bar);

        bar.querySelector('.fntv-min').addEventListener('click', () => api.winMin());
        const maxBtn = bar.querySelector('.fntv-max');
        maxBtn.addEventListener('click', () => api.winMax());
        bar.querySelector('.fntv-close').addEventListener('click', () => api.winClose());
        try {
          api.isMaxed().then(m => maxBtn.classList.toggle('maxed', !!m)).catch(() => {});
        } catch (e) {}
      }
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build, { once: true });
  } else {
    build();
  }
})();

// 在飞牛影视远程页面左上角品牌名旁加"作者：东哥"小字（仅在 http(s) 页面，不动本地向导页）
(function injectAuthor(){
  function tryInject() {
    try {
      if (!/^https?:/i.test(location.href)) return false;      // 只在飞牛远程页
      if (document.getElementById('__fntv_author')) return true; // 已注入
      // 找左上角包含"飞牛影视"文本的元素（取最小的那个）
      const all = document.querySelectorAll('div,span,a,h1,h2,p');
      let target = null;
      for (const el of all) {
        const txt = (el.textContent || '').trim();
        if (txt === '飞牛影视' && el.children.length <= 2) {
          const r = el.getBoundingClientRect();
          if (r.left < 260 && r.top < 120) { target = el; break; }
        }
      }
      if (!target) return false;
      const tag = document.createElement('span');
      tag.id = '__fntv_author';
      tag.textContent = '作者：东哥';
      tag.style.cssText = 'font-size:11px!important;line-height:1!important;margin-left:8px!important;opacity:.55!important;font-weight:400!important;vertical-align:middle!important;white-space:nowrap!important;color:inherit!important;';
      target.appendChild(tag);
      return true;
    } catch (e) { return false; }
  }
  // 多次尝试 + DOM 变化监听，等飞牛页面品牌区渲染出来
  let tries = 0;
  const timer = setInterval(() => {
    if (tryInject() || ++tries > 60) clearInterval(timer);
  }, 300);
  try {
    const mo = new MutationObserver(() => { if (tryInject()) mo.disconnect(); });
    mo.observe(document.documentElement || document, { childList: true, subtree: true });
    setTimeout(() => mo.disconnect(), 20000);
  } catch (e) {}
})();
