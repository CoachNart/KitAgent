import {ArrowLeft,BookOpen,Clock3,Lightbulb,ShieldCheck} from 'lucide-react';
import './lesson-detail.css';
import {KIT_LESSONS} from './kitLessons.js';
function T3KitBanner(){return <aside className="t3kit-float t3kit-float-lesson" aria-label="T3Kit promotion"><div className="t3kit-float-top"><span className="t3kit-brand"><img className="t3kit-logo" src="https://www.t3kit.xyz/assets/images/logo.webp" alt="T3Kit" /></span><a className="t3kit-close" href="https://www.t3kit.xyz" target="_blank" rel="noreferrer" aria-label="Open T3Kit">↗</a></div><h4>Your Web3 journey starts here.</h4><p>Learn Web3 from the ground up — guides, tools and opportunities.</p><a className="t3kit-cta" href="https://www.t3kit.xyz" target="_blank" rel="noreferrer">Explore T3Kit ↗</a></aside>}
export default function LessonDetail({lessonId,onBack}){
 const lesson=KIT_LESSONS.find(x=>x.id===lessonId);
 if(!lesson)return <main className="lesson-page"><T3KitBanner /><button className="lesson-back" onClick={onBack}><ArrowLeft size={16}/> Learning</button><div className="lesson-empty"><BookOpen size={28}/><h2>Lesson not found</h2><p>This lesson is no longer available.</p></div></main>;
 return <main className="lesson-page">
  <T3KitBanner />
  <div className="lesson-nav"><button className="lesson-back" onClick={onBack}><ArrowLeft size={16}/><span>Back</span></button><span className="lesson-pill"><BookOpen size={13}/> {lesson.category}</span></div>
  <div className="lesson-hero"><span className="lesson-eyebrow">DAILY TEK · BEGINNER FRIENDLY</span><h1>{lesson.title}</h1><p className="lesson-intro">{lesson.intro||lesson.body}</p><div className="lesson-meta"><span><Clock3 size={14}/> {lesson.minutes} min read</span><span>Learn the concept before using it</span></div></div>
  <div className="lesson-content"><article>{(lesson.sections||[['In simple terms',lesson.body]]).map(([heading,text],i)=><section className="lesson-section" key={heading}><span className="lesson-index">0{i+1}</span><div><h2>{heading}</h2><p>{text}</p></div></section>)}</article>
  <aside className="lesson-aside"><div className="lesson-tip-card"><div className="tip-icon"><Lightbulb size={17}/></div><span>THE KIT TIP</span><h3>Keep this in mind</h3><p>{lesson.tip}</p></div><div className="lesson-note"><ShieldCheck size={16}/><div><b>Education, not a promise</b><p>Trading involves risk. Understanding a concept does not guarantee a profitable outcome.</p></div></div></aside></div>
 </main>;
}