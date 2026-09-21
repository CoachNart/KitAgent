import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play, Volume2, X } from 'lucide-react';
import './voice-tour.css';

const STORAGE_KEY = 'kitsetups_voice_tour_v2';

const STEPS = [
  { title: 'Welcome to KitSetups', text: 'Welcome to KitSetups — your command center for crypto market intelligence, trade setups, signals, and trading tools.', target: () => document.querySelector('.home-page'), pause: 700 },
  { title: 'Start here: Home', text: 'Home gives you the market pulse at a glance. Scan what is moving, check your signals, and see what needs your attention.', target: () => document.querySelector('.home-page'), pause: 700 },
  { title: 'Explore Market Analysis', text: 'This is where you study a market before making a decision. Choose a pair, read the structure, and work through the analysis.', nav: 'Market analysis', target: () => document.querySelector('.content'), pause: 800 },
  { title: 'Use the Chart Terminal', text: 'The chart terminal gives you a closer look at price action. Use it when you need more detail before qualifying a setup.', nav: 'Chart terminal', target: () => document.querySelector('.content'), pause: 800 },
  { title: 'Check Perpetuals', text: 'Perpetuals is your trading workspace. Review positions and supported execution controls here.', nav: 'Perpetuals', target: () => document.querySelector('.content'), pause: 800 },
  { title: 'Review your History', text: 'History lets you look back at your activity and trading actions, so you can review what happened.', nav: 'History', target: () => document.querySelector('.content'), pause: 700 },
  { title: 'Manage your Profile', text: 'Profile is where your account and workspace preferences live.', nav: 'Profile', target: () => document.querySelector('.content'), pause: 700 },
  { title: 'Connect your wallet', text: 'Your wallet connection lives in the top bar. Connect when you are ready.', target: () => document.querySelector('.connect-btn'), pause: 700 },
  { title: 'That is KitSetups', text: 'You have the map now. Start on Home and explore the rest when you are ready.', target: () => document.querySelector('.kit-sidebar'), pause: 900 },
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
  if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance === 'undefined') return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = getNaturalVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || 'en-US';
  utterance.rate = 0.76;
  utterance.pitch = 1.03;
  utterance.volume = 1;
  utterance.onstart = onStart;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  // Chrome/Android can occasionally stall a fresh utterance; a short delayed resume keeps playback alive.
  synth.speak(utterance);
  window.setTimeout(() => {
    if (!synth.speaking && !synth.paused) synth.resume();
  }, 120);
  return true;
}

export default function VoiceTour() {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [rect, setRect] = useState(null);
  const timerRef = useRef(null);
  const retryRef = useRef(null);
  const stepRef = useRef(0);

  const step = STEPS[stepIndex];
  const progress = useMemo(() => `${stepIndex + 1} / ${STEPS.length}`, [stepIndex]);

  const stopSpeech = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    clearTimeout(retryRef.current);
    setSpeaking(false);
    setPaused(false);
  };

  const closeTour = (completed = false) => {
    stopSpeech();
    clearTimeout(timerRef.current);
    setActive(false);
    // A tour is a first-visit experience. Starting, finishing, or skipping it
    // counts as seen so a refresh can never trigger it again.
    localStorage.setItem(STORAGE_KEY, completed ? 'completed' : 'seen');
  };

  const locateTarget = (target = step.target) => {
    const el = target?.();
    if (!el) return null;
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    const pad = 7;
    setRect({ top: Math.max(6, r.top - pad), left: Math.max(6, r.left - pad), width: Math.min(r.width + pad * 2, window.innerWidth - 12), height: r.height + pad * 2 });
    return el;
  };

  const runStep = (index = stepIndex) => {
    const next = STEPS[index];
    if (!next) return;
    stepRef.current = index;
    clearTimeout(timerRef.current);
    clearTimeout(retryRef.current);
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
        const finish = () => {
          setSpeaking(false);
          if (stepRef.current !== index) return;
          if (index < STEPS.length - 1) timerRef.current = setTimeout(() => runStep(index + 1), next.pause);
          else timerRef.current = setTimeout(() => closeTour(true), next.pause);
        };
        const didSpeak = speak(next.text, () => setSpeaking(true), finish);
        if (!didSpeak) {
          setSpeaking(false);
          return;
        }
        // Some Android WebViews expose speechSynthesis but don't fire onstart until after a gesture.
        // Keep the card usable: the Listen button below can explicitly restart the current narration.
      }, next.nav ? 600 : 140);
    };
    reveal();
  };

  const startTour = () => {
    localStorage.setItem(STORAGE_KEY, 'seen');
    setActive(true);
    setStepIndex(0);
    setTimeout(() => runStep(0), 180);
  };

  const listenAgain = () => {
    clearTimeout(timerRef.current);
    setPaused(false);
    setSpeaking(false);
    const current = STEPS[stepRef.current];
    if (!current) return;
    speak(current.text, () => setSpeaking(true), () => setSpeaking(false));
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
    if (!window.speechSynthesis.speaking && !paused) {
      listenAgain();
      return;
    }
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
      clearTimeout(retryRef.current);
      stopSpeech();
      window.speechSynthesis?.removeEventListener?.('voiceschanged', loadVoices);
    };
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    const update = () => locateTarget();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true });
    const t = setTimeout(update, 450);
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
        <div className="voice-tour-brand"><span className="voice-tour-orb"><Volume2 size={12} /></span><span>KitSetups Guide</span></div>
        <div className="voice-tour-head-actions">
          <button className="voice-tour-listen" onClick={listenAgain} aria-label="Play narration"><Volume2 size={13} /> Listen</button>
          <button className="voice-tour-close" onClick={() => closeTour(false)} aria-label="Close tour"><X size={15} /></button>
        </div>
      </div>
      <div className="voice-tour-progress"><span style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} /></div>
      <div className="voice-tour-meta"><span>{progress}</span><span>{speaking ? 'Speaking' : paused ? 'Paused' : 'Guided tour'}</span></div>
      <h3>{step.title}</h3>
      <p>{step.text}</p>
      <div className="voice-tour-controls">
        <button onClick={togglePause} className="voice-tour-play" disabled={!('speechSynthesis' in window)}>{paused ? <Play size={13} /> : <Pause size={13} />} {paused ? 'Resume' : 'Pause'}</button>
        <button onClick={back} className="voice-tour-icon" disabled={stepIndex === 0} aria-label="Previous"><ArrowLeft size={14} /></button>
        <button onClick={next} className="voice-tour-next">{stepIndex === STEPS.length - 1 ? 'Finish' : 'Next'} <ArrowRight size={14} /></button>
      </div>
      <button className="voice-tour-skip" onClick={() => closeTour(false)}>Skip</button>
    </aside>
  </>;
}
