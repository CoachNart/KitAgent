import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play, Volume2, X } from 'lucide-react';
import './voice-tour.css';

const STORAGE_KEY = 'kitsetups_voice_tour_v2';

const STEPS = [
  { title: 'Welcome to KitSetups', text: 'Welcome to KitSetups — your command center for crypto market intelligence, trade setups, signals, and trading tools.', target: () => document.querySelector('.home-page'), pause: 900 },
  { title: 'Start here: Home', text: 'Home gives you the market pulse at a glance. Scan what is moving, check your signals, and see what needs your attention.', target: () => document.querySelector('.home-page'), pause: 900 },
  { title: 'Explore Market Analysis', text: 'This is where you study a market before making a decision. Choose a pair, read the structure, and work through the analysis.', nav: 'Market analysis', target: () => document.querySelector('.content'), pause: 1000 },
  { title: 'Use the Chart Terminal', text: 'The chart terminal gives you a closer look at price action. Use it when you need more detail before qualifying a setup.', nav: 'Chart terminal', target: () => document.querySelector('.content'), pause: 1000 },
  { title: 'Check Perpetuals', text: 'Perpetuals is your trading workspace. Review positions and supported execution controls here. Any consequential action stays under your control.', nav: 'Perpetuals', target: () => document.querySelector('.content'), pause: 1000 },
  { title: 'Review your History', text: 'History lets you look back at your activity and trading actions, so you can review what happened instead of relying on memory.', nav: 'History', target: () => document.querySelector('.content'), pause: 900 },
  { title: 'Manage your Profile', text: 'Profile is where your account and workspace preferences live. This is also where supported account settings can be managed.', nav: 'Profile', target: () => document.querySelector('.content'), pause: 900 },
  { title: 'Connect your wallet', text: 'Your wallet connection lives in the top bar. Connect when you are ready, and approve wallet actions yourself.', target: () => document.querySelector('.connect-btn'), pause: 900 },
  { title: 'That is KitSetups', text: 'You have the map now. Start on Home, dive into Market Analysis when you find something interesting, and use the navigation to explore the rest.', target: () => document.querySelector('.kit-sidebar'), pause: 1200 },
];

function findNavButton(label) {
  return [...document.querySelectorAll('.kit-sidebar .side-link')].find((el) => el.textContent?.trim().toLowerCase().includes(label.toLowerCase())) || null;
}

function getNaturalVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const preferred = [
    'Microsoft Jenny Online', 'Microsoft Aria Online', 'Microsoft Ava Online',
    'Google US English', 'Google UK English Female', 'Samantha', 'Karen', 'Daniel',
  ];
  return voices.find((voice) => preferred.some((name) => voice.name.toLowerCase().includes(name.toLowerCase())))
    || voices.find((voice) => /^en(-|_)(US|GB)/i.test(voice.lang))
    || voices.find((voice) => /^en/i.test(voice.lang))
    || voices[0];
}

function speak(text, onStart, onEnd) {
  if (!('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = getNaturalVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || 'en-US';
  utterance.rate = 0.78;
  utterance.pitch = 1.02;
  utterance.volume = 1;
  utterance.onstart = onStart;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
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
  const advanceRef = useRef(null);

  const step = STEPS[stepIndex];
  const progress = useMemo(() => `${stepIndex + 1} / ${STEPS.length}`, [stepIndex]);

  const stopSpeech = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
  };

  const closeTour = (completed = false) => {
    stopSpeech();
    clearTimeout(timerRef.current);
    setActive(false);
    if (completed) localStorage.setItem(STORAGE_KEY, 'completed');
  };

  const locateTarget = (target = step.target) => {
    const el = target?.();
    if (!el) return null;
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    const pad = 8;
    setRect({ top: Math.max(8, r.top - pad), left: Math.max(8, r.left - pad), width: Math.min(r.width + pad * 2, window.innerWidth - 16), height: r.height + pad * 2 });
    return el;
  };

  const runStep = (index = stepIndex) => {
    const next = STEPS[index];
    if (!next) return;
    clearTimeout(timerRef.current);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setStepIndex(index);
    setPaused(false);
    setSpeaking(false);

    const reveal = () => {
      if (next.nav) {
        const button = findNavButton(next.nav);
        if (button) button.click();
      }
      setTimeout(() => {
        locateTarget(next.target);
        const didSpeak = speak(
          next.text,
          () => setSpeaking(true),
          () => {
            setSpeaking(false);
            if (index < STEPS.length - 1) {
              timerRef.current = setTimeout(() => runStep(index + 1), next.pause);
            } else {
              timerRef.current = setTimeout(() => closeTour(true), next.pause);
            }
          },
        );
        if (!didSpeak) setSpeaking(false);
        if (!didSpeak) timerRef.current = setTimeout(() => index < STEPS.length - 1 ? runStep(index + 1) : closeTour(true), 5000);
      }, next.nav ? 700 : 180);
    };
    reveal();
  };

  const startTour = () => {
    setActive(true);
    setStepIndex(0);
    setTimeout(() => runStep(0), 220);
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
    const loadVoices = () => window.speechSynthesis?.getVoices();
    window.speechSynthesis?.addEventListener?.('voiceschanged', loadVoices);
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
      clearTimeout(advanceRef.current);
      stopSpeech();
      window.speechSynthesis?.removeEventListener?.('voiceschanged', loadVoices);
    };
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    const update = () => locateTarget();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true });
    const t = setTimeout(update, 500);
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
      <div className="voice-tour-count">{progress} · {speaking ? 'VOICE ON' : paused ? 'PAUSED' : 'GUIDED TOUR'}</div>
      <h3>{step.title}</h3>
      <p>{step.text}</p>
      <div className="voice-tour-controls">
        <button onClick={togglePause} className="voice-tour-play" disabled={!('speechSynthesis' in window)}>{paused ? <Play size={15} /> : <Pause size={15} />} {paused ? 'Resume' : 'Pause'}</button>
        <button onClick={back} className="voice-tour-icon" disabled={stepIndex === 0} aria-label="Previous"><ArrowLeft size={16} /></button>
        <button onClick={next} className="voice-tour-next">{stepIndex === STEPS.length - 1 ? 'Finish' : 'Next'} <ArrowRight size={16} /></button>
      </div>
      <button className="voice-tour-skip" onClick={() => closeTour(false)}>Skip tour</button>
    </aside>
  </>;
}
