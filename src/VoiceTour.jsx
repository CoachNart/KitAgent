import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play, Volume2, X } from 'lucide-react';
import './voice-tour.css';

const STORAGE_KEY = 'kitsetups_voice_tour_v1';

const STEPS = [
  { id: 'welcome', title: 'Welcome to KitSetups', text: 'Welcome to KitSetups. This is your crypto command center for market intelligence, trade setups, signals and trading tools. I will give you a quick guided tour of the workspace.', target: () => document.querySelector('.home-page'), pause: 4200 },
  { id: 'home', title: 'Your command center', text: 'This is Home. You get the live market pulse, moving markets, your signal snapshot, open trades and recent signals without leaving the workspace.', target: () => document.querySelector('.home-page'), pause: 3800 },
  { id: 'market', title: 'Market analysis', text: 'Next is Market analysis. Open it when you want to study a pair, read the market structure and work through an analysis before taking a trade.', nav: 'Market analysis', target: () => document.querySelector('.content'), pause: 4300 },
  { id: 'chart', title: 'Chart terminal', text: 'Chart terminal is where you can work directly with the charting workspace and inspect price action in more detail.', nav: 'Chart terminal', target: () => document.querySelector('.content'), pause: 3600 },
  { id: 'perps', title: 'Perpetuals', text: 'Perpetuals is the trading area. This is where supported live trading workflows, positions and execution controls live. Execution stays permission-gated.', nav: 'Perpetuals', target: () => document.querySelector('.content'), pause: 4200 },
  { id: 'history', title: 'History', text: 'History keeps your recent activity and trading actions in one place, so you can review what happened in your workspace.', nav: 'History', target: () => document.querySelector('.content'), pause: 3200 },
  { id: 'profile', title: 'Profile and settings', text: 'Profile is where your account and workspace settings live. You can also manage supported wallet and account preferences from here.', nav: 'Profile', target: () => document.querySelector('.content'), pause: 3200 },
  { id: 'wallet', title: 'Connect wallet', text: 'The Connect wallet button is in the top bar. KitSetups is non-custodial: you approve wallet actions yourself, and nothing consequential executes silently.', target: () => document.querySelector('.connect-btn'), pause: 4000 },
  { id: 'done', title: 'You are ready', text: 'That is the KitSetups workspace. Explore freely, start with Home or Market analysis, and use the navigation whenever you want to move around.', target: () => document.querySelector('.kit-sidebar'), pause: 3500 },
];

function findNavButton(label) {
  return [...document.querySelectorAll('.kit-sidebar .side-link')].find((el) => el.textContent?.trim().toLowerCase().includes(label.toLowerCase())) || null;
}

function speak(text) {
  if (!('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.98;
  utterance.pitch = 1;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
  return true;
}

export default function VoiceTour() {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [rect, setRect] = useState(null);
  const timerRef = useRef(null);
  const resizeRef = useRef(null);

  const step = STEPS[stepIndex];
  const progress = useMemo(() => `${stepIndex + 1} / ${STEPS.length}`, [stepIndex]);

  const stopSpeech = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  const closeTour = (completed = false) => {
    stopSpeech();
    clearTimeout(timerRef.current);
    setActive(false);
    setPaused(false);
    if (completed) localStorage.setItem(STORAGE_KEY, 'completed');
  };

  const locateTarget = () => {
    const el = step.target?.();
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    setRect({ top: Math.max(8, r.top - 8), left: Math.max(8, r.left - 8), width: r.width + 16, height: r.height + 16 });
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return el;
  };

  const runStep = (index = stepIndex) => {
    const next = STEPS[index];
    if (!next) return;
    clearTimeout(timerRef.current);
    stopSpeech();
    setStepIndex(index);
    setPaused(false);

    const reveal = () => {
      if (next.nav) {
        const button = findNavButton(next.nav);
        if (button) button.click();
      }
      setTimeout(() => {
        locateTarget();
        const didSpeak = speak(next.text);
        setSpeaking(didSpeak);
        timerRef.current = setTimeout(() => {
          if (index < STEPS.length - 1) runStep(index + 1);
          else closeTour(true);
        }, next.pause);
      }, next.nav ? 550 : 100);
    };

    reveal();
  };

  const startTour = () => {
    setActive(true);
    setStepIndex(0);
    setTimeout(() => runStep(0), 250);
  };

  const next = () => {
    if (stepIndex >= STEPS.length - 1) return closeTour(true);
    runStep(stepIndex + 1);
  };

  const back = () => {
    if (stepIndex === 0) return;
    runStep(stepIndex - 1);
  };

  const togglePause = () => {
    if (!('speechSynthesis' in window)) return;
    if (paused) {
      window.speechSynthesis.resume();
      setPaused(false);
      setSpeaking(true);
      return;
    }
    window.speechSynthesis.pause();
    setPaused(true);
    setSpeaking(false);
  };

  useEffect(() => {
    let cancelled = false;
    const boot = () => {
      if (cancelled) return;
      if (document.querySelector('.kit-shell')) {
        const seen = localStorage.getItem(STORAGE_KEY);
        if (!seen) startTour();
        return;
      }
      setTimeout(boot, 300);
    };
    boot();
    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
      stopSpeech();
    };
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    const update = () => locateTarget();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true });
    resizeRef.current = update;
    const t = setTimeout(update, 80);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update);
    };
  }, [active, stepIndex]);

  if (!active) return null;

  return <>
    <div className="voice-tour-backdrop" aria-hidden="true" />
    {rect && <div className="voice-tour-spotlight" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} aria-hidden="true" />}
    <aside className="voice-tour-card" role="dialog" aria-label="KitSetups guided tour">
      <div className="voice-tour-head">
        <div className="voice-tour-brand"><span className="voice-tour-orb"><Volume2 size={14} /></span><span>KitSetups Guide</span></div>
        <button className="voice-tour-close" onClick={() => closeTour(false)} aria-label="Close tour"><X size={17} /></button>
      </div>
      <div className="voice-tour-progress"><span style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} /></div>
      <div className="voice-tour-count">{progress}</div>
      <h3>{step.title}</h3>
      <p>{step.text}</p>
      <div className="voice-tour-controls">
        <button onClick={togglePause} className="voice-tour-play" disabled={!('speechSynthesis' in window)}>{paused ? <Play size={15} /> : <Pause size={15} />} {paused ? 'Resume voice' : speaking ? 'Pause voice' : 'Play voice'}</button>
        <button onClick={back} className="voice-tour-icon" disabled={stepIndex === 0} aria-label="Previous"><ArrowLeft size={16} /></button>
        <button onClick={next} className="voice-tour-next">{stepIndex === STEPS.length - 1 ? 'Finish' : 'Next'} <ArrowRight size={16} /></button>
      </div>
      <button className="voice-tour-skip" onClick={() => closeTour(false)}>Skip tour</button>
    </aside>
  </>;
}
