/* ui.js —— 两个页面共用的界面组件（自定义下拉、缩放控件） */

const CARET_SVG = '<svg class="dd-caret" viewBox="0 0 10 10" aria-hidden="true">'
  + '<path d="M2 3.8 L5 6.8 L8 3.8" fill="none" stroke="currentColor" '
  + 'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function enhanceSelect(sel) {
  const wrap = document.createElement('div');
  wrap.className = 'dd';
  wrap.dataset.open = 'false';

  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);
  sel.classList.add('dd-native');
  sel.tabIndex = -1; // 焦点交给触发按钮

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'dd-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = '<span class="dd-value"></span>' + CARET_SVG;

  const valueEl = trigger.querySelector('.dd-value');

  const menu = document.createElement('ul');
  menu.className = 'dd-menu';
  menu.setAttribute('role', 'listbox');

  wrap.appendChild(trigger);
  wrap.appendChild(menu);

  let activeIndex = -1;
  const items = () => Array.from(menu.children);

  function sync() {
    const opt = sel.options[sel.selectedIndex];
    valueEl.textContent = opt ? opt.textContent : '';
    items().forEach((li, i) => {
      li.setAttribute('aria-selected', i === sel.selectedIndex ? 'true' : 'false');
    });
  }

  function setActive(i) {
    const list = items();
    if (!list.length) return;
    activeIndex = (i + list.length) % list.length;
    list.forEach((li, idx) => li.classList.toggle('is-active', idx === activeIndex));
  }

  function onDocPointerDown(e) {
    if (!wrap.contains(e.target)) close();
  }

  function open() {
    wrap.dataset.open = 'true';
    trigger.setAttribute('aria-expanded', 'true');
    setActive(sel.selectedIndex);

    // 靠近视口右侧时改为右对齐，避免面板被裁掉
    menu.style.left = '0';
    menu.style.right = 'auto';
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) {
      menu.style.left = 'auto';
      menu.style.right = '0';
    }
    document.addEventListener('pointerdown', onDocPointerDown, true);
  }

  function close() {
    if (wrap.dataset.open !== 'true') return;
    wrap.dataset.open = 'false';
    trigger.setAttribute('aria-expanded', 'false');
    activeIndex = -1;
    items().forEach((li) => li.classList.remove('is-active'));
    document.removeEventListener('pointerdown', onDocPointerDown, true);
  }

  Array.from(sel.options).forEach((opt, i) => {
    const li = document.createElement('li');
    li.className = 'dd-option';
    li.setAttribute('role', 'option');
    li.textContent = opt.textContent;
    li.addEventListener('click', () => {
      sel.selectedIndex = i;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      sync();
      close();
      trigger.focus();
    });
    menu.appendChild(li);
  });

  trigger.addEventListener('click', () => {
    if (wrap.dataset.open === 'true') close();
    else open();
  });

  trigger.addEventListener('keydown', (e) => {
    const isOpen = wrap.dataset.open === 'true';
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) open();
      else setActive(activeIndex + (e.key === 'ArrowDown' ? 1 : -1));
    } else if ((e.key === 'Enter' || e.key === ' ') && isOpen && activeIndex >= 0) {
      e.preventDefault();
      items()[activeIndex].click();
    } else if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      close();
    }
  });

  menu.addEventListener('mousemove', (e) => {
    const li = e.target.closest('.dd-option');
    if (li) setActive(items().indexOf(li));
  });

  // 页面或时间线滚动时收起面板
  window.addEventListener('scroll', close, true);

  sel.addEventListener('change', sync);
  sync();

  return { sync };
}

/* ---------------- 页头禁止拖选 ---------------- */

/**
 * 页头是一排操作控件，不是阅读区：在标签或按钮上按下拖动时不该选中文字。
 * CSS 的 user-select: none 已经挡掉大部分情况，这里再加一道兜底
 * （部分浏览器从不可选区域起拖仍会扩出选区）。
 * 搜索框（input / textarea）保持正常的文字选择与编辑。
 */
function lockHeaderSelection() {
  document.querySelectorAll('.site-header').forEach((header) => {
    header.addEventListener('selectstart', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      e.preventDefault();
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', lockHeaderSelection);
} else {
  lockHeaderSelection();
}

/* ---------------- 缩放控件（两个页面共用） ---------------- */

/**
 * 创建一个「－ 百分比 ＋」的缩放控件。
 * get() 返回当前缩放比，set(v) 负责应用（由调用方决定如何保持视口锚点）。
 * 返回 { el, sync }，sync() 用于外部状态变化后刷新显示。
 */
function createZoomControl({ min = 0.5, max = 2.5, factor = 1.25, get, set }) {
  const wrap = document.createElement('div');
  wrap.className = 'zoom-ctrl';

  const btnOut = document.createElement('button');
  btnOut.type = 'button';
  btnOut.className = 'zoom-btn';
  btnOut.dataset.dir = 'out';
  btnOut.setAttribute('aria-label', '缩小');
  btnOut.textContent = '−';

  const val = document.createElement('button');
  val.type = 'button';
  val.className = 'zoom-val';
  val.title = '点击重置为 100%';

  const btnIn = document.createElement('button');
  btnIn.type = 'button';
  btnIn.className = 'zoom-btn';
  btnIn.dataset.dir = 'in';
  btnIn.setAttribute('aria-label', '放大');
  btnIn.textContent = '＋';

  const clamp = (v) => Math.min(max, Math.max(min, v));

  function sync() {
    const v = get();
    val.textContent = `${Math.round(v * 100)}%`;
    btnOut.disabled = v <= min + 1e-6;
    btnIn.disabled = v >= max - 1e-6;
  }

  btnOut.addEventListener('click', () => { set(clamp(get() / factor)); sync(); });
  btnIn.addEventListener('click', () => { set(clamp(get() * factor)); sync(); });
  val.addEventListener('click', () => { set(1); sync(); });

  wrap.appendChild(btnOut);
  wrap.appendChild(val);
  wrap.appendChild(btnIn);

  return { el: wrap, sync };
}
