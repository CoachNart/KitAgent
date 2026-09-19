import { Capacitor } from '@capacitor/core';

const STYLE_ID = 'kitsetups-pull-refresh-style';
const INDICATOR_ID = 'kitsetups-pull-refresh';
const TRIGGER_DISTANCE = 78;
const MAX_PULL = 118;

function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function getScrollableAncestor(target) {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY);
    if (canScrollY && node.scrollHeight > node.clientHeight && node.scrollTop > 0) return node;
    node = node.parentElement;
  }
  return null;
}

function isInteractiveTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, button, a, [contenteditable="true"], video, audio'));
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [
    '#kitsetups-pull-refresh{position:fixed;top:max(8px,env(safe-area-inset-top));left:50%;z-index:2147483647;width:34px;height:34px;border-radius:999px;display:grid;place-items:center;pointer-events:none;background:rgba(7,9,12,.92);border:1px solid rgba(0,199,254,.22);box-shadow:0 8px 28px rgba(0,0,0,.35);opacity:0;transform:translate(-50%,-52px) scale(.82);transition:opacity .16s ease,transform .16s ease;backdrop-filter:blur(10px)}',
    '#kitsetups-pull-refresh.visible{opacity:1;transform:translate(-50%,0) scale(1)}',
    '#kitsetups-pull-refresh.ready{border-color:rgba(0,199,254,.65);box-shadow:0 0 22px rgba(0,199,254,.14),0 8px 28px rgba(0,0,0,.35)}',
    '#kitsetups-pull-refresh svg{width:17px;height:17px;fill:none;stroke:#b9d8de;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;transition:transform .16s ease}',
    '#kitsetups-pull-refresh.ready svg{stroke:#00c7fe}',
    '#kitsetups-pull-refresh.loading svg{animation:kitsetups-pull-spin .72s linear infinite}',
    '@keyframes kitsetups-pull-spin{to{transform:rotate(360deg)}}'
  ].join('');
  document.head.appendChild(style);
}

function createIndicator() {
  const existing = document.getElementById(INDICATOR_ID);
  if (existing) return existing;
  const indicator = document.createElement('div');
  indicator.id = INDICATOR_ID;
  indicator.setAttribute('aria-hidden', 'true');
  indicator.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 4v12M7 11l5 5 5-5M5 20h14"/></svg>';
  document.body.appendChild(indicator);
  return indicator;
}

export function startAndroidPullToRefresh() {
  if (!isNativeAndroid()) return () => {};

  installStyles();
  const indicator = createIndicator();
  let startY = 0;
  let pulling = false;
  let active = false;
  let lockedByScroller = false;

  const reset = () => {
    pulling = false;
    active = false;
    lockedByScroller = false;
    indicator.classList.remove('visible', 'ready');
    indicator.style.transform = '';
  };

  const onTouchStart = (event) => {
    if (event.touches.length !== 1 || indicator.classList.contains('loading')) return;
    const target = event.target;
    if (isInteractiveTarget(target)) return;

    const scroller = getScrollableAncestor(target);
    lockedByScroller = Boolean(scroller);
    if (lockedByScroller || window.scrollY > 2) return;

    startY = event.touches[0].clientY;
    pulling = true;
    active = false;
  };

  const onTouchMove = (event) => {
    if (!pulling || event.touches.length !== 1) return;
    const distance = event.touches[0].clientY - startY;
    if (distance <= 0) return;

    active = true;
    const pull = Math.min(distance, MAX_PULL);
    const progress = Math.min(pull / TRIGGER_DISTANCE, 1);
    indicator.classList.add('visible');
    indicator.classList.toggle('ready', progress >= 1);
    indicator.style.transform = 'translate(-50%, ' + Math.max(0, pull * 0.52 - 34) + 'px) scale(' + (0.82 + progress * 0.18) + ')';

    if (distance > 8) event.preventDefault();
  };

  const onTouchEnd = () => {
    if (!pulling) return;
    const shouldRefresh = active && indicator.classList.contains('ready');
    if (shouldRefresh) {
      indicator.classList.add('loading', 'visible');
      indicator.classList.remove('ready');
      indicator.style.transform = 'translate(-50%, 0) scale(1)';
      window.setTimeout(() => window.location.reload(), 80);
      return;
    }
    reset();
  };

  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('touchcancel', reset, { passive: true });

  return () => {
    document.removeEventListener('touchstart', onTouchStart);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
    document.removeEventListener('touchcancel', reset);
    indicator.remove();
    document.getElementById(STYLE_ID)?.remove();
  };
}
