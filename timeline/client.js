/* client.js —— 客户端详情页 */

const TIMELINE_JSON = 'timeline.json';
const THEME_KEY = 'timeline-theme';
const VIEW_KEY = 'timeline-view';
const SORT_KEY = 'timeline-sort';

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};

const MONTH_NAMES_CN = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月'
];

const root = document.getElementById('detail');
const clientId = new URLSearchParams(location.search).get('id');

/* ---------------- 头部控件 ---------------- */
// 与首页共用 ui.js 里的自定义下拉。视图与排序在详情页不改变内容，
// 只把选择记下来，回到时间线时生效。

const viewSel = document.getElementById('view-mode');
const themeSel = document.getElementById('theme-select');
const sortSel = document.getElementById('sort-order');

const ddView = enhanceSelect(viewSel);
const ddTheme = enhanceSelect(themeSel);
const ddSort = enhanceSelect(sortSel);

function restoreSelect(sel, key, dd, after) {
  const saved = localStorage.getItem(key);
  if (saved && Array.from(sel.options).some((o) => o.value === saved)) {
    sel.value = saved;
    dd.sync();
  }
  if (after) after(sel.value);
}

restoreSelect(themeSel, THEME_KEY, ddTheme,
  (v) => document.body.setAttribute('data-theme', v));
restoreSelect(viewSel, VIEW_KEY, ddView);
restoreSelect(sortSel, SORT_KEY, ddSort);

themeSel.addEventListener('change', (e) => {
  document.body.setAttribute('data-theme', e.target.value);
  localStorage.setItem(THEME_KEY, e.target.value);
});
viewSel.addEventListener('change', (e) => localStorage.setItem(VIEW_KEY, e.target.value));
sortSel.addEventListener('change', (e) => localStorage.setItem(SORT_KEY, e.target.value));

/* ---------------- 工具 ---------------- */

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function parseMonth(m) {
  if (m === undefined || m === null) return null;
  if (typeof m === 'number' && Number.isFinite(m)) {
    const n = Math.trunc(m);
    return (n >= 1 && n <= 12) ? n : null;
  }
  if (typeof m === 'string') {
    const trimmed = m.trim().toLowerCase();
    const n = Number(trimmed);
    if (!Number.isNaN(n) && Number.isFinite(n)) return (n >= 1 && n <= 12) ? n : null;
    return MONTHS[trimmed] || null;
  }
  return null;
}

function monthYearLabel(monthNum, year) {
  if (!year) return '';
  if (!monthNum) return `${year}年`;
  return `${year}年${MONTH_NAMES_CN[monthNum - 1]}`;
}

/* ---------------- 渲染 ---------------- */

function renderNotFound() {
  root.innerHTML = '';
  root.appendChild(make('div', 'detail-date', '未找到'));
  root.appendChild(make('h1', 'detail-title', '没有这个客户端'));
  root.appendChild(make('p', 'detail-story',
    '链接可能已经失效，或者这个条目已被重命名。回到时间线重新选择即可。'));

  const nav = make('nav', 'detail-nav');
  const back = make('a', '', '← 返回时间线');
  back.href = 'index.html';
  back.style.flex = '0 0 auto';
  back.style.padding = '13px 18px';
  nav.appendChild(back);
  root.appendChild(nav);

  document.title = '未找到 — Minecraft 客户端时间线';
}

function buildNavLink(ev, label, extraClass) {
  const a = make('a', extraClass);
  a.href = `client.html?id=${encodeURIComponent(ev.id)}`;
  a.appendChild(make('span', 'nav-label', label));
  a.appendChild(make('span', 'nav-name', ev.name));
  return a;
}

function render(ev, prev, next) {
  root.innerHTML = '';

  // 标题区
  root.appendChild(make('div', 'detail-date', monthYearLabel(ev.__monthRaw, ev.year)));
  root.appendChild(make('h1', 'detail-title', ev.name || '未命名'));

  if (Array.isArray(ev.aliases) && ev.aliases.length) {
    root.appendChild(make('div', 'detail-aliases', `别名：${ev.aliases.join('、')}`));
  }

  // 信息表
  const rows = [
    ['开发者', ev.developer],
    ['平台', ev.platform],
    ['基于', ev.base],
    ['适配反作弊', ev.anticheat],
    ['获取方式', ev.license],
    ['状态', ev.status]
  ].filter((row) => row[1]);

  if (rows.length) {
    const dl = make('dl', 'detail-meta');
    rows.forEach(([key, value]) => {
      const item = make('div', 'meta-item');
      item.appendChild(make('dt', '', key));
      item.appendChild(make('dd', '', value));
      dl.appendChild(item);
    });
    root.appendChild(dl);
  }

  // 详细介绍：优先用 story，没有则退回一句话简介，避免两段内容重复
  const isPlaceholder = /^（暂无介绍/.test(ev.description || '');
  const body = ev.story || (isPlaceholder ? '' : ev.description);

  const introSec = make('section', 'detail-section');
  introSec.appendChild(make('h2', '', '介绍'));
  introSec.appendChild(make('p', 'detail-story', body || '（暂无介绍，待补充）'));
  root.appendChild(introSec);

  // 主要特性
  if (Array.isArray(ev.features) && ev.features.length) {
    const sec = make('section', 'detail-section');
    sec.appendChild(make('h2', '', '主要特性'));
    const ul = make('ul', 'chips');
    ev.features.forEach((f) => ul.appendChild(make('li', '', f)));
    sec.appendChild(ul);
    root.appendChild(sec);
  }

  // 前后导航（按时间顺序，与首页的排序选择无关）
  if (prev || next) {
    const nav = make('nav', 'detail-nav');
    if (prev) nav.appendChild(buildNavLink(prev, '上一个', 'prev'));
    if (next) nav.appendChild(buildNavLink(next, '下一个', 'next'));
    root.appendChild(nav);
  }

  document.title = `${ev.name} — Minecraft 客户端时间线`;
}

/* ---------------- 数据加载 ---------------- */

async function init() {
  if (!clientId) {
    renderNotFound();
    return;
  }

  try {
    const resp = await fetch(`${TIMELINE_JSON}?t=${Date.now()}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();

    const items = json
      .map((e) => {
        const year = Number(e.year);
        if (!e.name || !year) return null;
        const monthNum = parseMonth(e.month);
        return {
          ...e,
          year,
          __monthNum: monthNum || 1, // 仅用于排序
          __monthRaw: monthNum       // 用于显示，缺月份时只显示年份
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.year - b.year) || (a.__monthNum - b.__monthNum));

    const index = items.findIndex((e) => e.id === clientId);
    if (index < 0) {
      renderNotFound();
      return;
    }

    render(items[index], items[index - 1], items[index + 1]);
  } catch (err) {
    console.warn('数据获取失败：', err);
    root.innerHTML = '';
    root.appendChild(make('h1', 'detail-title', '数据加载失败'));
    root.appendChild(make('p', 'detail-story',
      window.location.protocol === 'file:'
        ? '浏览器出于安全策略禁止直接读取本地 JSON 文件。请启动本地服务器（例如 python -m http.server）后再访问。'
        : `无法读取 ${TIMELINE_JSON}：${err.message}`));
  }
}

init();
