/* ui.js —— 两个页面共用的自定义下拉组件（原生 select 的弹层无法用 CSS 定制） */

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
