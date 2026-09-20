import {useEffect,useState} from 'react';
import {AlertCircle,CheckCircle2,Info,TriangleAlert,X} from 'lucide-react';
import './notice-center.css';

const ICONS={success:CheckCircle2,error:AlertCircle,warning:TriangleAlert,info:Info};
const TITLES={success:'Completed',error:'Something went wrong',warning:'Action needs attention',info:'KitSetups'};

function NoticeCard({notice,onClose}){
 const Icon=ICONS[notice.type]||Info;
 useEffect(()=>{const t=setTimeout(onClose,notice.duration||4200);return()=>clearTimeout(t)},[onClose,notice.duration]);
 return <article className={`ks-notice ${notice.type}`} role={notice.type==='error'?'alert':'status'}>
   <div className="ks-notice-icon"><Icon size={16}/></div>
   <div className="ks-notice-copy"><span className="ks-notice-title">{notice.title||TITLES[notice.type]}</span><span className="ks-notice-message">{notice.message}</span></div>
   <button type="button" className="ks-notice-close" aria-label="Dismiss notification" onClick={onClose}><X size={14}/></button>
 </article>;
}

export function notify(type='info',message='',title){
 if(typeof window==='undefined')return;
 window.dispatchEvent(new CustomEvent('kitagent-notice',{detail:{type,message,title}}));
}

export default function NoticeCenter(){
 const [items,setItems]=useState([]);
 useEffect(()=>{
   const add=e=>{const d=e.detail||{};const notice={id:`${Date.now()}-${Math.random()}`,type:['success','error','warning','info'].includes(d.type)?d.type:'info',message:String(d.message||''),title:d.title,duration:d.duration};setItems(v=>[...v.slice(-3),notice])};
   const onError=e=>add({detail:{type:'error',title:'Unexpected error',message:e?.error?.message||e?.message||'The workspace encountered an unexpected error.'}});
   const onReject=e=>{const reason=e?.reason;add({detail:{type:'error',title:'Request failed',message:reason?.message||String(reason||'An asynchronous request failed.')}})};
   window.addEventListener('kitagent-notice',add);
   window.addEventListener('error',onError);
   window.addEventListener('unhandledrejection',onReject);
   return()=>{window.removeEventListener('kitagent-notice',add);window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onReject)};
 },[]);
 const close=id=>setItems(v=>v.filter(x=>x.id!==id));
 return <div className="ks-notice-stack" aria-live="polite">{items.map(n=><NoticeCard key={n.id} notice={n} onClose={()=>close(n.id)}/>)}</div>;
}
