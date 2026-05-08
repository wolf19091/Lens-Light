import { state } from '../state.js';
import { applyPreviewEffects } from '../camera/camera.js';

const DOUBLE_TAP_WINDOW_MS = 300;
const RIPPLE_LIFETIME_MS = 500;

function setMenuOpen(button, menu, open) {
  menu?.classList.toggle('active', open);
  button?.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function applyOptionSelection(options, selectedOption) {
  for (const option of options) {
    const isSelected = option === selectedOption;
    option.classList.toggle('selected', isSelected);
    option.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    option.tabIndex = isSelected ? 0 : -1;
  }
}

function bindTimerMenu(dom, { showStatus }) {
  dom.timerBtn?.addEventListener('click', () => {
    const willOpen = !dom.timerMenu?.classList.contains('active');
    setMenuOpen(dom.timerBtn, dom.timerMenu, willOpen);
  });

  const options = Array.from(document.querySelectorAll('.timer-option'));
  for (const opt of options) {
    opt.addEventListener('click', () => {
      const time = parseInt(opt.dataset.time, 10) || 0;
      state.featureState.timerDelay = time;

      applyOptionSelection(options, opt);

      dom.timerBtn?.classList.toggle('active', time > 0);
      setMenuOpen(dom.timerBtn, dom.timerMenu, false);

      showStatus(time > 0 ? `⏱️ Timer: ${time}s` : '⏱️ Timer OFF', 1500);
    });
  }
}

function bindFilterMenu(dom, { showStatus }) {
  dom.filterBtn?.addEventListener('click', () => {
    const willOpen = !dom.filterMenu?.classList.contains('active');
    setMenuOpen(dom.filterBtn, dom.filterMenu, willOpen);
  });

  const options = Array.from(document.querySelectorAll('.filter-option'));
  for (const opt of options) {
    opt.addEventListener('click', () => {
      const filter = opt.dataset.filter || 'normal';
      state.featureState.currentFilter = filter;

      applyOptionSelection(options, opt);

      dom.filterBtn?.classList.toggle('active', filter !== 'normal');
      setMenuOpen(dom.filterBtn, dom.filterMenu, false);

      applyPreviewEffects(dom);
      showStatus(`🎨 Filter: ${filter}`, 1500);
    });
  }
}

function bindOutsideClickClose(dom) {
  document.addEventListener('click', (e) => {
    if (dom.timerBtn && dom.timerMenu && !dom.timerBtn.contains(e.target) && !dom.timerMenu.contains(e.target)) {
      setMenuOpen(dom.timerBtn, dom.timerMenu, false);
    }
    if (dom.filterBtn && dom.filterMenu && !dom.filterBtn.contains(e.target) && !dom.filterMenu.contains(e.target)) {
      setMenuOpen(dom.filterBtn, dom.filterMenu, false);
    }
    if (dom.exposureBtn && dom.exposureControl && !dom.exposureBtn.contains(e.target) && !dom.exposureControl.contains(e.target)) {
      dom.exposureControl.classList.remove('active');
      dom.exposureBtn.classList.remove('active');
    }
  });
}

function bindDoubleTapFlip(dom) {
  let lastTap = 0;
  dom.video?.parentElement?.addEventListener('click', (e) => {
    const now = Date.now();
    if (now - lastTap < DOUBLE_TAP_WINDOW_MS && dom.flipCameraBtn && !dom.flipCameraBtn.disabled) {
      dom.flipCameraBtn.click();

      const ripple = document.createElement('div');
      ripple.style.cssText = `
        position: absolute; left: ${e.clientX}px; top: ${e.clientY}px;
        width: 10px; height: 10px; border-radius: 50%;
        background: rgba(255,255,255,0.8);
        transform: translate(-50%, -50%);
        pointer-events: none; animation: ripple 0.5s ease-out forwards;
      `;
      document.body.appendChild(ripple);
      setTimeout(() => ripple.remove(), RIPPLE_LIFETIME_MS);
    }
    lastTap = now;
  });
}

export function bindMenusAndGestures(dom, env) {
  bindTimerMenu(dom, env);
  bindFilterMenu(dom, env);
  bindOutsideClickClose(dom);
  bindDoubleTapFlip(dom);
}
