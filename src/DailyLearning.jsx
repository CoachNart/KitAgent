import {useEffect,useMemo,useState} from 'react';
import {BookOpen,ChevronRight,X,Clock3} from 'lucide-react';
import {KIT_LESSONS} from './kitLessons.js';

const KEY='kitsetups_learning_state_v1';
const readState=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}};
const saveState=s=>{try{localStorage.setItem(KEY,JSON.stringify(s))}catch{}};

export default function DailyLearning(){
 const [lesson,setLesson]=useState(null),[open,setOpen]=useState(false),[tick,setTick]=useState(0);
 const choose=()=>{
  const state=readState(),seen=Array.isArray(state.seen)?state.seen:[],day=new Date().toISOString().slice(0,10);
  const pool=KIT_LESSONS.filter(x=>!seen.includes(x.id));
  const available=pool.length?pool:KIT_LESSONS;
  const next=available[(Math.floor(Math.random()*available.length)+tick)%available.length];
  setLesson(next);setOpen(true);
  const timer=setTimeout(()=>setOpen(false),90000);
  return()=>clearTimeout(timer);
 };
 useEffect(()=>{const state=readState(),last=state.lastShown||0;if(Date.now()-last<6*60*60*1000)return;const t=setTimeout(()=>{setTick(x=>x+1);choose();saveState({...state,lastShown:Date.now()})},8000);return()=>clearTimeout(t)},[]);
 const close=completed=>{
  if(!lesson)return;
  const state=readState(),seen=new Set(Array.isArray(state.seen)?state.seen:[]);
  if(completed)seen.add(lesson.id);
  saveState({...state,seen:[...seen],lastShown:Date.now()});
  setOpen(false);
  if(completed){setTimeout(()=>{setTick(x=>x+1);choose()},6*60*1000)}
 };
 if(!open||!lesson)return null;
 return <aside className="daily-learning" role="dialog" aria-label="Daily trading education">
  <div className="learning-top"><span className="learning-kicker"><BookOpen size={14}/> DAILY TEK</span><button onClick={()=>close(false)} aria-label="Close lesson"><X size={16}/></button></div>
  <div className="learning-category">{lesson.category}</div>
  <h3>{lesson.title}</h3>
  <p>{lesson.body}</p>
  <div className="learning-tip"><b>Kit Tip</b><span>{lesson.tip}</span></div>
  <div className="learning-foot"><span><Clock3 size={13}/> {lesson.minutes} min read</span><button onClick={()=>close(true)}>Got it <ChevronRight size={14}/></button></div>
 </aside>
}