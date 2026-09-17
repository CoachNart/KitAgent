import {useEffect,useMemo,useState} from 'react';
import {BookOpen,ChevronRight,X,Clock3} from 'lucide-react';
import {KIT_LESSONS} from './kitLessons.js';



export default function DailyLearning({onReadMore}){
 const [lesson,setLesson]=useState(null),[open,setOpen]=useState(false),[tick,setTick]=useState(0);
 const choose=()=>{
  const seen=[];
  const pool=KIT_LESSONS.filter(x=>!seen.includes(x.id));
  const available=pool.length?pool:KIT_LESSONS;
  const next=available[(Math.floor(Math.random()*available.length)+tick)%available.length];
  setLesson(next);setOpen(true);
  const timer=setTimeout(()=>setOpen(false),90000);
  return()=>clearTimeout(timer);
 };
 useEffect(()=>{const t=setTimeout(()=>{setTick(x=>x+1);choose();},8000);return()=>clearTimeout(t)},[]);
 const close=completed=>{
  if(!lesson)return;
  
  setOpen(false);
  if(completed){setTimeout(()=>{setTick(x=>x+1);choose()},6*60*1000)}
 };
 if(!open||!lesson)return null;
 return <aside className="daily-learning" role="dialog" aria-label="Daily trading education">
  <div className="learning-top"><span className="learning-kicker"><BookOpen size={14}/> DAILY TEK</span><button onClick={()=>close(false)} aria-label="Close lesson"><X size={16}/></button></div>
  <div className="learning-category">{lesson.category}</div>
  <h3>{lesson.title}</h3>
  <p className="learning-preview">{String(lesson.body || "").replace(/\s+/g," ").trim().slice(0, 145)}{String(lesson.body || "").trim().length > 145 ? "…" : ""}</p>
  <div className="learning-tip"><b>Kit Tip</b><span>{lesson.tip}</span></div>
  <div className="learning-foot"><span><Clock3 size={13}/> {lesson.minutes} min read</span><div className="learning-actions"><button onClick={()=>close(false)}>Dismiss</button><button onClick={()=>onReadMore?.(lesson.id)}>Read more <ChevronRight size={14}/></button></div></div>
 </aside>
}