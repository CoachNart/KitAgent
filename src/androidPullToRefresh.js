import { Capacitor } from '@capacitor/core';

const STYLE_ID = 'kitsetups-pull-refresh-style';
const INDICATOR_ID = 'kitsetups-pull-refresh';
const TRIGGER_DISTANCE = 64;
const MAX_PULL = 116;

function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function scrollState(target) {
  const root = document.scrollingElement || document.documentElement;
  let node = target instanceof Element ? target : null;

  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const scrollable = /(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
    if (scrollable) return { node, atTop: node.scrollTop <= 1 };
    node = node.parentElement;
  }

  return { node: root, atTop: (window.scrollY || root.scrollTop || 0) <= 1 };
}

function isInteractiveTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, button, a, [contenteditable="true"], video, audio'));
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    html,body,#root{overscroll-behavior-y:contain}
    #kitsetups-pull-refresh{position:fixed;top:max(8px,env(safe-area-inset-top));left:50%;z-index:2147483647;width:36px;height:36px;border-radius:999px;display:grid;place-items:center;pointer-events:none;background:rgba(7,9,12,.96);border:1px solid rgba(0,199,254,.22);box-shadow:0 8px 28px rgba(0,0,0,.35);opacity:0;transform:translate(-50%,-54px) scale(.8);transition:opacity .12s ease,transform .12s ease;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
    #kitsetups-pull-refresh.visible{opacity:1}
    #kitsetups-pull-refresh.ready{border-color:rgba(0,199,254,.75);box-shadow:0 0 22px rgba(0,199,254,.16),0 8px 28px rgba(0,0,0,.35)}
    #kitsetups-pull-refresh svg{width:18px;height:18px;fill:none;stroke:#b9d8de;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    #kitsetups-pull-refresh.ready svg{stroke:#00c7fe}
    #kitsetups-pull-refresh.loading svg{animation:kitsetups-pull-spin .72s linear infinite}
    @keyframes kitsetups-pull-spin{to{transform:rotate(360deg)}}
  `;
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
  let pointerId = null;
  let scrollNode = null;
  let moved = false;

  const reset = () => {
    pulling = false;
    pointerId = null;
    scrollNode = null;
    moved = false;
    indicator.classList.remove('visible', 'ready', 'loading');
    indicator.style.transform = '';
  };

  const begin = (target, y, id = null) => {
    if (indicator.classList.contains('loading') || isInteractiveTarget(target)) return false;
    const state = scrollState(target);
    if (!state.atTop) return false;
    startY = y;
    pointerId = id;
    scrollNode = state.node;
    pulling = true;
    moved = false;
    return true;
  };

  const move = (y, event) => {
    if (!pulling) return;
    const distance = y - startY;
    if (distance <= 0) return;

    moved = true;
    const pull = Math.min(distance, MAX_PULL);
    const progress = Math.min(pull / TRIGGER_DISTANCE, 1);
    const offset = Math.max(0, pull * .62 - 38);

    indicator.classList.add('visible');
    indicator.classList.toggle('ready', progress >= 1);
    indicator.style.transform = `translate(-50%, ${offset}px) scale(${.82 + progress * .18})`;

    if (distance > 6) {
      event?.preventDefault?.();
      if (scrollNode && scrollNode !== document.scrollingElement) scrollNode.scrollTop = 0;
      else window.scrollTo(0, 0);
    }
  };

  const end = () => {
    if (!pulling) return;
    const refresh = moved && indicator.classList.contains('ready');

    if (refresh) {
      indicator.classList.add('loading', 'visible');
      indicator.classList.remove('ready');
      indicator.style.transform = 'translate(-50%, 0) scale(1)';
      window.setTimeout(() => window.location.reload(), 60);
      return;
    }

    reset();
  };

  const onPointerDown = (event) => {
    if (event.pointerType !== 'touch' || event.isPrimary === false) return;
    begin(event.target, event.clientY, event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!pulling || pointerId !== event.pointerId) return;
    move(event.clientY, event);
  };

  const onPointerUp = (event) => {
    if (pointerId !== null && event.pointerId !== pointerId) return;
    end();
  };

  const onTouchStart = (event) => {
    if (event.touches.length !== 1) return;
    begin(event.target, event.touches[0].clientY);
  };

  const onTouchMove = (event) => {
    if (!pulling || event.touches.length !== 1) return;
    move(event.touches[0].clientY, event);
  };

  document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
  document.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
  document.addEventListener('pointerup', onPointerUp, { capture: true, passive: true });
  document.addEventListener('pointercancel', reset, { capture: true, passive: true });

  // Touch fallback for older Android WebViews.
  document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
  document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
  document.addEventListener('touchend', end, { capture: true, passive: true });
  document.addEventListener('touchcancel', reset, { capture: true, passive: true });

  return () => {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('pointermove', onPointerMove, true);
    document.removeEventListener('pointerup', onPointerUp, true);
    document.removeEventListener('pointercancel', reset, true);
    document.removeEventListener('touchstart', onTouchStart, true);
    document.removeEventListener('touchmove', onTouchMove, true);
    document.removeEventListener('touchend', end, true);
    document.removeEventListener('touchcancel', reset, true);
    indicator.remove();
    document.getElementById(STYLE_ID)?.remove();
  };
}
