/* script.js —— 时间线渲染、布局与交互逻辑 */

const TIMELINE_JSON = 'timeline.json';
const SVG_NS = 'http://www.w3.org/2000/svg';

// DOM 元素
const timelineEl = document.getElementById('timeline');
const sortOrderSel = document.getElementById('sort-order');
const viewModeSel = document.getElementById('view-mode');
const themeSel = document.getElementById('theme-select');

// 布局常量
const L = {
  pad: 64,          // 画布内边距
  stem: 40,         // 卡片到时间轴的引导线长度
  gapH: 104,        // 横向视图卡片之间的水平间距
  gapV: 40,         // 纵向视图卡片之间的垂直间距
  cardW: 300,       // 横向视图卡片宽度
  graphCardW: 228,  // 图谱视图卡片宽度
  pxPerYear: 380,   // 图谱视图每年的横向像素
  startYear: 2010
};

let events = [];
let track = null;   // 承载卡片与引导线的画布
let guides = null;  // SVG 引导线层

/* 自定义下拉组件已抽到 ui.js，两个页面共用 */

const ddView = enhanceSelect(viewModeSel);
const ddTheme = enhanceSelect(themeSel);
const ddSort = enhanceSelect(sortOrderSel);

/* ---------------- 偏好记忆（主题 / 视图 / 排序，详情页共用同一组键） ---------------- */

const THEME_KEY = 'timeline-theme';
const VIEW_KEY = 'timeline-view';
const SORT_KEY = 'timeline-sort';

// 沿用上次访问时选择的主题
function restoreTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (!saved) return;
  if (!Array.from(themeSel.options).some((o) => o.value === saved)) return;
  themeSel.value = saved;
  document.body.setAttribute('data-theme', saved);
  ddTheme.sync();
}

// 排序同理：详情页改了排序，回到时间线也生效
function restoreSort() {
  const saved = localStorage.getItem(SORT_KEY);
  if (!saved) return;
  if (!Array.from(sortOrderSel.options).some((o) => o.value === saved)) return;
  sortOrderSel.value = saved;
  ddSort.sync();
}

restoreTheme();
restoreSort();

/* ---------------- 默认视图（优先用上次选择，否则按屏幕自动判断） ---------------- */

const MOBILE_MAX = 768;   // 与 CSS 断点保持一致

// 窄屏，或触屏设备在较窄的横向视口下（手机横屏），默认使用纵向视图
function pickDefaultView() {
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const narrow = window.innerWidth <= MOBILE_MAX;
  const touchLandscape = coarsePointer && window.innerWidth <= 1024;
  return (narrow || touchLandscape) ? 'vertical' : 'graph';
}

function resolveView() {
  const saved = localStorage.getItem(VIEW_KEY);
  if (saved && ['graph', 'horizontal', 'vertical'].includes(saved)) return saved;
  return pickDefaultView();
}

let currentView = resolveView();
viewModeSel.value = currentView;
ddView.sync();
timelineEl.classList.remove('view-graph', 'view-vertical', 'view-horizontal');
timelineEl.classList.add(`view-${currentView}`);

/* ---------------- 主题与视图切换 ---------------- */

themeSel.addEventListener('change', (e) => {
  document.body.setAttribute('data-theme', e.target.value);
  localStorage.setItem(THEME_KEY, e.target.value);
});

viewModeSel.addEventListener('change', (e) => {
  currentView = e.target.value;
  localStorage.setItem(VIEW_KEY, currentView);
  timelineEl.classList.remove('view-graph', 'view-vertical', 'view-horizontal');
  timelineEl.classList.add(`view-${currentView}`);
  // 切换视图后回到起点，避免沿用上一个视图的滚动位置
  setScroll({ left: 0, top: 0 });
  renderTimeline();
});

/* ---------------- 日期解析 ---------------- */

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};

const MONTH_NAMES_CN = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月'
];

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

// 输出形如「2010年12月」的中文时间标签
function monthYearLabel(monthNum, year) {
  if (!year) return '';
  if (!monthNum) return `${year}年`;
  return `${year}年${MONTH_NAMES_CN[monthNum - 1]}`;
}

/* ---------------- 卡片构建 ---------------- */

function buildEventCard(ev) {
  // 整张卡片就是一个链接，点击进入该客户端的详情页
  const card = document.createElement('a');
  card.className = 'event';
  card.href = `client.html?id=${encodeURIComponent(ev.id || '')}`;

  const date = document.createElement('div');
  date.className = 'event-date';
  // 没有 month 字段的条目只显示年份，不编造月份
  date.appendChild(document.createTextNode(monthYearLabel(ev.__monthRaw, ev.year)));

  // 标注该客户端适配的反作弊（NCP / Grim）
  if (ev.anticheat) {
    const tag = document.createElement('span');
    tag.className = 'event-tag';
    tag.textContent = ev.anticheat;
    tag.title = `适配反作弊：${ev.anticheat}`;
    date.appendChild(tag);
  }
  card.appendChild(date);

  const h = document.createElement('h3');
  h.className = 'event-title';
  h.textContent = ev.name || '未命名';
  if (ev.color) h.style.color = ev.color;
  card.appendChild(h);

  const desc = document.createElement('div');
  desc.className = 'event-desc';
  desc.textContent = ev.description || '';
  card.appendChild(desc);

  return card;
}

/* ---------------- 画布与引导线 ---------------- */

function buildTrack() {
  if (!track) {
    track = document.createElement('div');
    track.className = 'track';

    guides = document.createElementNS(SVG_NS, 'svg');
    guides.setAttribute('class', 'guides');
    track.appendChild(guides);

    timelineEl.appendChild(track);
  }
  Array.from(track.querySelectorAll('.event, .message')).forEach((n) => n.remove());
  guides.innerHTML = '';
  track.style.width = '';
  track.style.height = '';
  track.style.zoom = zoom;
}

function showMessage(text, isError) {
  const box = document.createElement('div');
  box.className = 'message' + (isError ? ' error' : '');
  box.innerHTML = text;
  track.appendChild(box);
}

// 统一收尾：写入画布尺寸与引导线
function paint(layout, cards) {
  track.style.width = `${layout.width}px`;
  track.style.height = `${layout.height}px`;
  guides.setAttribute('width', layout.width);
  guides.setAttribute('height', layout.height);
  guides.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  guides.innerHTML = layout.svg;
  cards.forEach((c) => { c.style.visibility = ''; });
}

/* 纵向视图：中轴垂直贯穿，卡片左右交替，横向短引导线连到轴上 */
function layoutVertical(cards, viewW) {
  const narrow = viewW < 760;
  let totalW, spineX, cardW;

  if (narrow) {
    // 窄屏：轴线靠左，卡片统一放右侧
    spineX = 24;
    totalW = viewW;
    cardW = Math.max(200, totalW - spineX - L.stem - 20);
  } else {
    cardW = Math.max(260, Math.min(340, Math.round(viewW * 0.3)));
    totalW = Math.max(viewW, 820);
    spineX = Math.round(totalW / 2);
  }

  cards.forEach((c) => { c.style.width = `${cardW}px`; });
  const heights = cards.map((c) => c.offsetHeight);

  let y = L.pad;
  const stems = [];
  const nodes = [];

  cards.forEach((c, i) => {
    const leftSide = !narrow && i % 2 === 0;
    const h = heights[i];
    const left = leftSide ? spineX - L.stem - cardW : spineX + L.stem;

    c.style.left = `${left}px`;
    c.style.top = `${y}px`;

    const nodeY = y + 26;
    const fromX = leftSide ? spineX - L.stem : spineX + L.stem;
    stems.push(`<path class="stem" d="M ${fromX} ${nodeY} H ${spineX}" />`);
    nodes.push(`<circle class="node" cx="${spineX}" cy="${nodeY}" r="5" />`);

    y += h + L.gapV;
  });

  const totalH = Math.max(y - L.gapV + L.pad, 420);

  const svg = [
    `<line class="spine" x1="${spineX}" y1="${L.pad - 28}" x2="${spineX}" y2="${totalH - L.pad + 28}" />`,
    ...stems,
    ...nodes
  ].join('');

  return { width: totalW, height: totalH, svg };
}

/* 横向视图：水平轴居中，卡片上下交替，垂直短引导线连到轴上 */
function layoutHorizontal(cards, viewH) {
  const cardW = L.cardW;
  cards.forEach((c) => { c.style.width = `${cardW}px`; });
  const heights = cards.map((c) => c.offsetHeight);

  const above = heights.filter((_, i) => i % 2 === 0);
  const below = heights.filter((_, i) => i % 2 === 1);
  const maxAbove = above.length ? Math.max(...above) : 0;
  const maxBelow = below.length ? Math.max(...below) : 0;

  const topSpan = maxAbove + L.stem + L.pad;
  const botSpan = maxBelow + L.stem + L.pad;

  let totalH = Math.max(viewH || 480, topSpan + botSpan);
  const spineY = Math.max(topSpan, Math.round(totalH / 2));
  totalH = Math.max(totalH, spineY + botSpan);

  let x = L.pad;
  const stems = [];
  const nodes = [];

  cards.forEach((c, i) => {
    const isAbove = i % 2 === 0;
    const h = heights[i];
    const top = isAbove ? spineY - L.stem - h : spineY + L.stem;

    c.style.left = `${x}px`;
    c.style.top = `${top}px`;

    const nodeX = x + cardW / 2;
    const edgeY = isAbove ? top + h : top;
    stems.push(`<path class="stem" d="M ${nodeX} ${edgeY} V ${spineY}" />`);
    nodes.push(`<circle class="node" cx="${nodeX}" cy="${spineY}" r="5" />`);

    x += cardW + L.gapH;
  });

  const totalW = x - L.gapH + L.pad;

  const svg = [
    `<line class="spine" x1="${L.pad - 32}" y1="${spineY}" x2="${totalW - L.pad + 32}" y2="${spineY}" />`,
    ...stems,
    ...nodes
  ].join('');

  return { width: totalW, height: totalH, svg };
}

/* 图谱视图：按年份铺开横轴 + 年度网格线，卡片贴着轴线向上下堆叠 */
function layoutGraph(cards) {
  const cardW = L.graphCardW;
  const half = cardW / 2;
  const padX = half + 32; // 保证最早的卡片不会被画布左边裁掉
  const STEP = 8;         // 离轴距离的搜索步长
  const GAPX = 14;        // 相邻卡片之间的最小水平间隙

  cards.forEach((c) => { c.style.width = `${cardW}px`; });

  // 1. 按时间换算横坐标
  //    图谱里卡片位置由日期决定，所以"排序"体现为整条时间轴的方向：
  //    升序 = 最早在左，降序 = 最新在左（左右镜像）
  const descending = sortOrderSel.value === 'desc';
  const times = cards.map((c, i) => {
    const ev = events[i];
    return (ev.year - L.startYear) + (ev.__monthNum - 1) / 12;
  });
  const maxT = Math.max(...times);

  const items = cards.map((c, i) => {
    const t = descending ? (maxT - times[i]) : times[i];
    return { el: c, x: padX + t * L.pxPerYear, h: c.offsetHeight, side: 'below', top: 0 };
  });
  items.sort((a, b) => a.x - b.x);

  // 2. 逐张落位：从紧贴轴线开始向两侧推开，取第一个不与其他卡片重叠的位置
  //    虚拟轴线在 y = 0，上方卡片为负、下方为正，最后统一平移
  const placed = [];

  items.forEach((it, idx) => {
    const x1 = it.x - half - GAPX / 2;
    const x2 = it.x + half + GAPX / 2;
    const order = idx % 2 === 0 ? ['above', 'below'] : ['below', 'above'];
    let done = false;

    for (let o = 0; !done; o += STEP) {
      for (const side of order) {
        const top = side === 'above' ? -L.stem - o - it.h : L.stem + o;
        const y1 = top;
        const y2 = top + it.h;
        const clash = placed.some((p) => x1 < p.x2 && p.x1 < x2 && y1 < p.y2 && p.y1 < y2);
        if (!clash) {
          it.side = side;
          it.top = top;
          placed.push({ x1, x2, y1, y2 });
          done = true;
          break;
        }
      }
      if (o > 8000) break; // 保险，避免死循环
    }
  });

  // 3. 平移到画布内
  const minTop = Math.min(...items.map((it) => it.top));
  const shift = L.pad - minTop;
  const axisY = shift;
  const maxBottom = Math.max(...items.map((it) => it.top + it.h));
  const maxX = Math.max(...items.map((it) => it.x));
  const width = maxX + half + L.pad;
  const height = maxBottom + shift + L.pad;

  // 4. 落位并生成引导线
  const stems = [];
  const nodes = [];

  items.forEach((it) => {
    const top = it.top + shift;
    it.el.style.left = `${it.x - half}px`;
    it.el.style.top = `${top}px`;

    const edgeY = it.side === 'above' ? top + it.h : top;
    stems.push(`<path class="stem" d="M ${it.x} ${edgeY} V ${axisY}" />`);
    nodes.push(`<circle class="node" cx="${it.x}" cy="${axisY}" r="4.5" />`);
  });

  // 5. 年度网格线与年份标签（标签贴着轴线，避免顶部出现大片空白）
  const maxYear = Math.max(...events.map((e) => e.year));
  const grid = [];
  const labels = [];

  for (let yr = L.startYear; yr <= maxYear; yr++) {
    // 与卡片用同一套坐标：降序时年份也镜像排列（最新在左）
    const t = descending ? (maxT - (yr - L.startYear)) : (yr - L.startYear);
    const gx = padX + t * L.pxPerYear;
    grid.push(`<line class="grid" x1="${gx}" y1="0" x2="${gx}" y2="${height}" />`);
    labels.push(`<text class="year-label" x="${gx}" y="${axisY - 13}" text-anchor="middle">${yr}</text>`);
  }

  const svg = [
    ...grid,
    `<line class="axis" x1="${padX - 40}" y1="${axisY}" x2="${width - L.pad + 28}" y2="${axisY}" />`,
    ...stems,
    ...nodes,
    ...labels
  ].join('');

  return { width, height, svg, focusY: axisY };
}

/* ---------------- 渲染入口 ---------------- */

// 程序化滚动时临时关掉平滑滚动：
// 否则 scrollLeft / scrollTop 的赋值会变成动画，初始定位会停在起点
function setScroll({ left, top }) {
  const prev = timelineEl.style.scrollBehavior;
  timelineEl.style.scrollBehavior = 'auto';
  if (left !== undefined) timelineEl.scrollLeft = left;
  if (top !== undefined) timelineEl.scrollTop = top;
  timelineEl.style.scrollBehavior = prev;
}

function renderTimeline() {
  buildTrack();

  if (!events.length) {
    showMessage('暂无事件数据。', false);
    return;
  }

  const cards = events.map((ev) => buildEventCard(ev));
  cards.forEach((c) => {
    c.style.visibility = 'hidden';
    track.appendChild(c);
  });

  const viewW = timelineEl.clientWidth;
  const viewH = timelineEl.clientHeight;

  let layout;
  if (currentView === 'vertical') layout = layoutVertical(cards, viewW);
  else if (currentView === 'horizontal') layout = layoutHorizontal(cards, viewH);
  else layout = layoutGraph(cards);

  paint(layout, cards);

  // 图谱视图内容较高，初始滚动到时间轴所在的纵向中心
  if (layout.focusY) {
    setScroll({ top: Math.max(0, layout.focusY - timelineEl.clientHeight / 2) });
  }
}

/* ---------------- 数据加载 ---------------- */

async function loadTimeline() {
  try {
    // GitHub Pages 缓存较重，加时间戳强制获取最新数据
    const url = `${TIMELINE_JSON}?t=${new Date().getTime()}`;
    const resp = await fetch(url);

    if (!resp.ok) {
      // 部分服务器会拒绝静态文件带查询参数，做一次兜底重试
      if (resp.status === 404) {
        const retry = await fetch(TIMELINE_JSON);
        if (retry.ok) {
          processJson(await retry.json());
          return;
        }
      }
      throw new Error(`HTTP ${resp.status}`);
    }
    const json = await resp.json();
    processJson(json);

  } catch (err) {
    console.warn('数据获取失败：', err);

    let msg = `数据加载出错：${err.message}`;
    if (window.location.protocol === 'file:') {
      msg = `<b>本地文件读取失败</b><br>浏览器出于安全策略（CORS）禁止直接读取本地硬盘上的 JSON 文件。<br><br>
        解决方法：<br>
        1. 推送到 GitHub Pages（部署后即可正常访问）<br>
        2. 或启动本地服务器（例如 <code>python -m http.server</code>）<br>
        3. 或使用 VS Code 的 “Live Server” 插件。`;
    }

    buildTrack();
    showMessage(msg, true);
  }
}

function processJson(json) {
  // 数据归一化
  events = json.map((e, idx) => {
    const monthNum = parseMonth(e.month);
    const yearNum = Number(e.year);
    if (!e.name || !yearNum) return null;
    return {
      ...e,
      year: yearNum,
      __monthNum: monthNum || 1, // 缺月份时按 1 月处理，仅用于排序
      __monthRaw: monthNum,      // 真实月份（可能为 null），用于显示
      __originalIndex: idx
    };
  }).filter((x) => x);

  applySort();
}

function applySort() {
  const order = sortOrderSel.value;
  events.sort((a, b) => {
    if (a.year !== b.year) return order === 'asc' ? a.year - b.year : b.year - a.year;
    return order === 'asc' ? a.__monthNum - b.__monthNum : b.__monthNum - a.__monthNum;
  });
  setScroll({ left: 0, top: 0 });
  renderTimeline();
}

/* ---------------- 拖动平移（替代滚动条） ---------------- */

function enableDragPan(el) {
  const THRESHOLD = 4;        // 超过这个位移才算拖动，避免影响点击
  let dragging = false;
  let moved = false;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;
  let suppressUntil = 0;

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;  // 触摸交给浏览器原生滚动
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = el.scrollLeft;
    startTop = el.scrollTop;
  });

  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!moved) {
      if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
      moved = true;
      el.classList.add('is-dragging');
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    }

    el.scrollLeft = startLeft - dx;
    el.scrollTop = startTop - dy;
  });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('is-dragging');
    if (moved) {
      // 拖动结束时浏览器还会补一个 click，拦掉它，避免误进详情页
      suppressUntil = Date.now() + 250;
    }
    moved = false;
  }

  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);

  // 捕获阶段拦截拖动后的那次点击
  el.addEventListener('click', (e) => {
    if (Date.now() < suppressUntil) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // 横向视图没有纵向滚动条，把滚轮映射到横向
  el.addEventListener('wheel', (e) => {
    if (currentView !== 'horizontal' || e.ctrlKey) return;
    const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (!delta) return;
    e.preventDefault();
    el.scrollLeft += delta;
  }, { passive: false });
}

enableDragPan(timelineEl);

/* ---------------- 双指捏合缩放（移动端） ---------------- */

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const ZOOM_KEY = 'timeline-zoom';

let zoom = (() => {
  const saved = Number(localStorage.getItem(ZOOM_KEY));
  return (saved >= ZOOM_MIN && saved <= ZOOM_MAX) ? saved : 1;
})();

const zoomBadge = document.getElementById('zoom-badge');
let badgeTimer = null;

function showZoomBadge() {
  if (!zoomBadge) return;
  zoomBadge.textContent = `${Math.round(zoom * 100)}%`;
  zoomBadge.classList.add('is-visible');
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => zoomBadge.classList.remove('is-visible'), 900);
}

// 以 (focalX, focalY) 为中心缩放，保证手指下的内容不跑位
function applyZoom(next, focalX, focalY) {
  if (!track) return;
  next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
  if (Math.abs(next - zoom) < 0.005) return;

  const contentX = (timelineEl.scrollLeft + focalX) / zoom;
  const contentY = (timelineEl.scrollTop + focalY) / zoom;

  zoom = next;
  track.style.zoom = zoom;

  timelineEl.scrollLeft = contentX * zoom - focalX;
  timelineEl.scrollTop = contentY * zoom - focalY;

  localStorage.setItem(ZOOM_KEY, String(zoom));
  showZoomBadge();
}

let pinchDist = 0;
let pinchBaseZoom = 1;
let pinchFocal = { x: 0, y: 0 };

timelineEl.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 2) return;
  const [a, b] = e.touches;
  pinchDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  pinchBaseZoom = zoom;
  const rect = timelineEl.getBoundingClientRect();
  pinchFocal = {
    x: (a.clientX + b.clientX) / 2 - rect.left,
    y: (a.clientY + b.clientY) / 2 - rect.top
  };
}, { passive: true });

timelineEl.addEventListener('touchmove', (e) => {
  if (e.touches.length !== 2 || !pinchDist) return;
  const [a, b] = e.touches;
  const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  if (!dist) return;
  if (e.cancelable) e.preventDefault();   // 别让浏览器把整页也缩放了
  applyZoom(pinchBaseZoom * (dist / pinchDist), pinchFocal.x, pinchFocal.y);
}, { passive: false });

timelineEl.addEventListener('touchend', (e) => {
  if (e.touches.length < 2) pinchDist = 0;
}, { passive: true });

timelineEl.addEventListener('touchcancel', () => { pinchDist = 0; }, { passive: true });

/* ---------------- 事件绑定 ---------------- */

sortOrderSel.addEventListener('change', () => {
  localStorage.setItem(SORT_KEY, sortOrderSel.value);
  applySort();
});

// 窗口尺寸变化后重算布局（引导线位置依赖实际卡片尺寸）
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (events.length) renderTimeline();
  }, 160);
});

loadTimeline();
