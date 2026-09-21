import {ArrowLeft,BookOpen,Clock3,Lightbulb,ShieldCheck,CalendarDays} from 'lucide-react';
import './lesson-detail.css';
import {getDailyTekLesson} from './kitLessons.js';

export default function LessonDetail({lessonId,onBack}){
 const lesson=getDailyTekLesson();
 if(!lesson)return <main className="lesson-page"><button className="lesson-back" onClick={onBack}><ArrowLeft size={16}/> Back</button><div className="lesson-empty"><BookOpen size={28}/><h2>Daily Tek is unavailable</h2><p>There is no lesson available in the current learning library.</p></div></main>;
 const today=new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'});
 return <main className="lesson-page">
  <div className="lesson-nav"><button className="lesson-back" onClick={onBack}><ArrowLeft size={16}/><span>Back</span></button><span className="lesson-pill"><BookOpen size={13}/> {lesson.category}</span></div>
  <section className="daily-tek-hero">
   <div className="daily-tek-kicker"><span className="daily-tek-dot"/> DAILY TEK <span>·</span> NEW LESSON EVERY DAY</div>
   <div className="daily-tek-date"><CalendarDays size={14}/> {today}</div>
   <h1>{lesson.title}</h1>
   <p className="lesson-intro">{lesson.intro||lesson.body}</p>
   <div className="lesson-meta"><span><Clock3 size={14}/> {lesson.minutes} min read</span><span>Education, not a signal</span></div>
  </section>
  <div className="lesson-content">
   <article>
    {(lesson.sections||[['In simple terms',lesson.body]]).map(([heading,text],i)=><section className="lesson-section" key={heading}><span className="lesson-index">{String(i+1).padStart(2,'0')}</span><div><h2>{heading}</h2><p>{text}</p></div></section>)}
   </article>
   <aside className="lesson-aside">
    <div className="lesson-tip-card"><div className="tip-icon"><Lightbulb size={17}/></div><span>THE KIT TIP</span><h3>Keep this in mind</h3><p>{lesson.tip}</p></div>
    <div className="lesson-note"><ShieldCheck size={16}/><div><b>Learn before you trade</b><p>Daily Tek explains a concept. It does not guarantee an outcome or tell you what trade to take.</p></div></div>
   </aside>
  </div>
 </main>;
}
