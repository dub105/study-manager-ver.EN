import { useState, useEffect, useCallback, useRef } from "react";

// ─── constants ───────────────────────────────────────────────────
const C = {
  bg:"#0d1117", surf:"#161b22", surf2:"#1c2333", surf3:"#21293d",
  border:"#253047", border2:"#30415a",
  text:"#e6edf3", sub:"#5a7090", dim:"#8b9dba",
  ok:"#3fb950", warn:"#d29922", danger:"#f85149",
  accent:"#388bfd", gold:"#e3b341", purple:"#bc8cff",
};
const PALETTE = ["#3fb950","#388bfd","#bc8cff","#f78166","#ffa657","#e3b341","#39d353","#58a6ff","#d2a8ff","#ff7b72"];
const ICONS   = ["🩺","🧠","🫀","🫁","🦴","🦷","👁","🦻","🧬","💊","🔬","🦠","🛡️","🧪","💉","🩻","📋","⚗️"];
const DAYS    = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const UL = {
  1:{label:"Not studied", bg:"rgba(248,81,73,.12)",  color:"#ff9492", bd:"rgba(248,81,73,.28)"},
  2:{label:"Uncertain",   bg:"rgba(210,153,34,.12)", color:"#f0c040", bd:"rgba(210,153,34,.28)"},
  3:{label:"Mastered",    bg:"rgba(63,185,80,.12)",  color:"#7ee787", bd:"rgba(63,185,80,.28)"},
} as const;
const NAV = [
  {view:"dashboard",  icon:"📊", label:"Dashboard",      group:"Study"},
  {view:"plan",       icon:"🤖", label:"AI Study Plan",   group:"Study"},
  {view:"checklist",  icon:"☑️", label:"Mastery Check",   group:"Study"},
  {view:"schedule",   icon:"📅", label:"Weekly Schedule", group:"Study"},
  {view:"subjects",   icon:"📚", label:"Subjects",        group:"Manage"},
  {view:"exams",      icon:"🎯", label:"Exams & Goals",   group:"Manage"},
  {view:"timer",      icon:"⏱️", label:"Log & Reports",    group:"Study"},
  {view:"memo",       icon:"📝", label:"Notes",           group:"Manage"},
];

const STORAGE_KEY = "medstudy_en_v1";

const uid  = () => Date.now().toString(36)+Math.random().toString(36).slice(2,5);
const dsOf = (d=new Date()) => d.toISOString().slice(0,10);
const TODAY = new Date();
function daysUntil(s: string){ if(!s)return null; const n=new Date();n.setHours(0,0,0,0); return Math.ceil((new Date(s+"T00:00:00").getTime()-n.getTime())/86400000); }
function fmtMins(m: number){ return m>=60?Math.floor(m/60)+"h"+(m%60?" "+m%60+"m":""):m+"min"; }
function fmtSecs(s: number){ const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=s%60; return h>0?`${h}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`; }
function secsToMins(s: number){ return Math.round(s/60); }
function daysLabel(d: number|null, type: string){ if(d===null)return "—"; if(d<0)return type==="goal"?"Completed":"Done"; if(d===0)return "Today!"; return d+" day"+(d===1?"":"s")+" left"; }

interface Subject { id:string; name:string; icon:string; color:string; note:string; }
interface Theme   { id:string; subjectId:string; name:string; }
interface Topic   { id:string; themeId:string; subjectId:string; name:string; level:1|2|3; }
interface Schedule{ id:string; subjectId:string; date:string; dur:number; note:string; }
interface Exam    { id:string; name:string; date:string; subjectId:string; note:string; type:string; }
interface StudyLog{ id:string; subjectId:string; date:string; mins:number; note:string; planTaskId:string|null; ts:number; }
interface PlanTask { id:string; subject:string; title:string; detail:string; minutes:number; completed:boolean; }
interface AppState {
  subjects: Subject[];
  themes: Theme[];
  topics: Topic[];
  schedules: Schedule[];
  exams: Exam[];
  memos: Record<string,string>;
  planTasks: PlanTask[]|null;
  studyLogs: StudyLog[];
}

function makeSeed(): AppState {
  const [p1,p2,p3,p4]=[uid(),uid(),uid(),uid()];
  const subjects: Subject[]=[
    {id:p1,name:"Pharmacology",icon:"💊",color:"#3fb950",note:"USMLE Step 1 & 2"},
    {id:p2,name:"Pathology",   icon:"🔬",color:"#388bfd",note:"USMLE Step 1"},
    {id:p3,name:"Microbiology",icon:"🦠",color:"#bc8cff",note:"USMLE Step 1"},
    {id:p4,name:"Physiology",  icon:"🫀",color:"#e3b341",note:"USMLE Step 1"},
  ];
  const themes: Theme[]=[],topics: Topic[]=[];
  ([
    {sid:p1,tms:[
      {n:"Autonomic Pharmacology",tps:[{n:"Adrenergic receptor subtypes & distribution",lv:1},{n:"Beta-blockers: mechanism & indications",lv:1},{n:"Cholinergic & anticholinergic drugs",lv:2}]},
      {n:"Antibiotics",tps:[{n:"Beta-lactam mechanism of action",lv:2},{n:"Macrolides: spectrum & side effects",lv:1},{n:"Aminoglycosides",lv:1}]},
    ]},
    {sid:p2,tms:[
      {n:"Inflammation",tps:[{n:"Acute vs. chronic inflammation",lv:2},{n:"Inflammatory mediators",lv:1},{n:"Granulomatous inflammation",lv:1}]},
      {n:"Neoplasia",tps:[{n:"Benign vs. malignant distinctions",lv:2},{n:"Oncogenes & tumor suppressors",lv:1}]},
    ]},
    {sid:p3,tms:[{n:"Gram-positive cocci",tps:[{n:"S. aureus virulence factors",lv:1},{n:"Streptococcal infections",lv:2},{n:"S. pneumoniae capsule",lv:1}]}]},
    {sid:p4,tms:[{n:"Cardiac Physiology",tps:[{n:"Cardiac action potentials",lv:1},{n:"Frank-Starling mechanism",lv:2},{n:"Pressure-volume loops",lv:1}]}]},
  ] as {sid:string,tms:{n:string,tps:{n:string,lv:number}[]}[]}[]).forEach(({sid,tms})=>tms.forEach(({n,tps})=>{
    const tid=uid();themes.push({id:tid,subjectId:sid,name:n});
    tps.forEach(({n:tn,lv})=>topics.push({id:uid(),themeId:tid,subjectId:sid,name:tn,level:lv as 1|2|3}));
  }));
  const d1=new Date(TODAY);d1.setDate(TODAY.getDate()+90);
  const d2=new Date(TODAY);d2.setDate(TODAY.getDate()+365);
  const exams: Exam[]=[
    {id:uid(),name:"USMLE Step 1",date:dsOf(d1),subjectId:"",note:"Target: 240+",type:"exam"},
    {id:uid(),name:"AMC CAT Exam",date:dsOf(d2),subjectId:"",note:"Australian pathway",type:"goal"},
  ];
  const schedules: Schedule[]=[];
  [p1,p2,p3,p4,p1].forEach((sid,i)=>{
    const d=new Date(TODAY);d.setDate(TODAY.getDate()+i);
    schedules.push({id:uid(),subjectId:sid,date:dsOf(d),dur:[60,90,90,60,120][i],note:""});
  });
  const memos: Record<string,string>={[p1]:"",[p2]:"", [p3]:"", [p4]:""};
  return {subjects,themes,topics,schedules,exams,memos,planTasks:null,studyLogs:[]};
}

// ─── localStorage persistence ────────────────────────────────────
function loadState(): AppState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as AppState;
      // Ensure all required fields exist (backward compatibility)
      return {
        ...makeSeed(),
        ...parsed,
        studyLogs: parsed.studyLogs ?? [],
        memos: parsed.memos ?? {},
      };
    }
  } catch {
    // corrupted data — fall through to seed
  }
  return makeSeed();
}

function saveState(s: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // storage quota exceeded or unavailable — silently ignore
  }
}

// ─── shared UI ──────────────────────────────────────────────────
type BtnVariant = "ghost"|"accent"|"danger"|"gold"|"green";
type BtnSize    = "xs"|"sm"|"md";
function Btn({children,variant="ghost",size="md",disabled=false,style:sx={},...p}: {children:React.ReactNode;variant?:BtnVariant;size?:BtnSize;disabled?:boolean;style?:React.CSSProperties;[k:string]:unknown}){
  const base: React.CSSProperties={display:"inline-flex",alignItems:"center",gap:5,border:"none",borderRadius:8,fontFamily:"'Inter',sans-serif",fontWeight:600,cursor:disabled?"not-allowed":"pointer",whiteSpace:"nowrap",transition:"filter .12s",opacity:disabled?0.5:1};
  const sz: Record<BtnSize,React.CSSProperties>={sm:{padding:"6px 13px",fontSize:11},md:{padding:"8px 16px",fontSize:12},xs:{padding:"4px 10px",fontSize:10}};
  const vr: Record<BtnVariant,React.CSSProperties>={accent:{background:C.accent,color:"#fff"},ghost:{background:"rgba(255,255,255,0.07)",color:C.text,border:`1px solid ${C.border}`},danger:{background:"rgba(248,81,73,0.12)",color:C.danger,border:`1px solid rgba(248,81,73,0.25)`},gold:{background:C.gold,color:"#000"},green:{background:C.ok,color:"#000"}};
  return <button disabled={disabled} style={{...base,...sz[size],...vr[variant],...sx}} {...(p as React.ButtonHTMLAttributes<HTMLButtonElement>)}>{children}</button>;
}
function PBar({pct,color,height=8,style:sx={}}: {pct:number;color:string;height?:number;style?:React.CSSProperties}){return(<div style={{height,background:"rgba(255,255,255,0.07)",borderRadius:height/2,overflow:"hidden",...sx}}><div style={{height:"100%",borderRadius:height/2,background:color,width:`${pct}%`,transition:"width .5s ease"}}/></div>);}
function UBadge({level,active,onClick}: {level:1|2|3;active:boolean;onClick:()=>void}){const u=UL[level];return(<span onClick={onClick} style={{display:"inline-flex",alignItems:"center",padding:"5px 12px",borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",userSelect:"none",border:`1px solid ${u.bd}`,background:u.bg,color:u.color,opacity:active?1:0.25,transition:"opacity .15s"}}>{u.label}</span>);}
function SecLabel({children}: {children:React.ReactNode}){return(<div style={{display:"flex",alignItems:"center",gap:8,margin:"0 0 16px",fontSize:10,fontWeight:700,color:C.sub,textTransform:"uppercase",letterSpacing:"0.08em"}}>{children}<div style={{flex:1,height:1,background:C.border}}/></div>);}
function Modal({open,onClose,title,children,width=460}: {open:boolean;onClose:()=>void;title:string;children:React.ReactNode;width?:number}){if(!open)return null;return(<div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",backdropFilter:"blur(4px)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}><div onClick={e=>e.stopPropagation()} style={{background:C.surf,border:`1px solid ${C.border2}`,borderRadius:14,padding:28,width,maxWidth:"96vw",maxHeight:"92vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,0.7)"}}><div style={{fontSize:16,fontWeight:700,marginBottom:22}}>{title}</div>{children}</div></div>);}
function FGrp({label,children}: {label:string;children:React.ReactNode}){return <div style={{marginBottom:16}}><div style={{fontSize:12,fontWeight:600,color:C.sub,marginBottom:6}}>{label}</div>{children}</div>;}
function FInput({style:sx={},...p}: React.InputHTMLAttributes<HTMLInputElement>){return <input style={{width:"100%",padding:"10px 13px",background:C.surf2,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontFamily:"'Inter',sans-serif",fontSize:13,outline:"none",...sx}} {...p}/>;}
function FSelect({children,style:sx={},...p}: React.SelectHTMLAttributes<HTMLSelectElement>){return <select style={{width:"100%",padding:"10px 13px",background:C.surf2,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontFamily:"'Inter',sans-serif",fontSize:13,outline:"none",appearance:"none",...sx}} {...p}>{children}</select>;}
function useToast(){
  const [msg,setMsg]=useState(""); const [vis,setVis]=useState(false); const t=useRef<ReturnType<typeof setTimeout>|null>(null);
  const toast=useCallback((m: string)=>{setMsg(m);setVis(true);if(t.current)clearTimeout(t.current);t.current=setTimeout(()=>setVis(false),2400);},[]);
  const Toast=()=>(<div style={{position:"fixed",bottom:22,right:22,background:C.surf3,border:`1px solid ${C.border2}`,borderRadius:10,padding:"11px 18px",fontSize:13,fontWeight:500,zIndex:999,opacity:vis?1:0,transform:vis?"translateY(0)":"translateY(6px)",transition:"all .22s",pointerEvents:"none",color:C.text}}>{msg}</div>);
  return {toast,Toast};
}

// ─── Main App ────────────────────────────────────────────────────
export default function App(){
  const [S,setS]=useState<AppState>(loadState);
  const [view,setView]=useState("dashboard");
  const [weekOff,setWeekOff]=useState(0);
  const [clSubj,setClSubj]=useState<string|null>(null);
  const [memoSubj,setMemoSubj]=useState<string|null>(null);
  const [openTh,setOpenTh]=useState<Record<string,boolean>>({});
  const {toast,Toast}=useToast();
  const [planHours,setPlanHours]=useState(3);
  const [pasteText,setPasteText]=useState("");
  const [copied,setCopied]=useState(false);
  const [planErr,setPlanErr]=useState("");
  const [timerRunning,setTimerRunning]=useState(false);
  const [timerSecs,setTimerSecs]=useState(0);
  const [timerSubj,setTimerSubj]=useState<string|null>(null);
  const [timerNote,setTimerNote]=useState("");
  const [timerTaskId,setTimerTaskId]=useState<string|null>(null);
  const [reportTab,setReportTab]=useState("daily");
  const timerRef=useRef<ReturnType<typeof setInterval>|null>(null);
  const [manualSubj,setManualSubj]=useState("");
  const [manualMins,setManualMins]=useState(30);
  const [manualNote,setManualNote]=useState("");
  const [manualDate,setManualDate]=useState(dsOf());
  const [showManual,setShowManual]=useState(false);
  const [modal,setModal]=useState<string|null>(null);
  const [confirmCfg,setConfirmCfg]=useState<{message:string;onOk:()=>void}|null>(null);
  const [editSId,setEditSId]=useState<string|null>(null);
  const [smName,setSmName]=useState(""); const [smNote,setSmNote]=useState(""); const [smColor,setSmColor]=useState(PALETTE[0]); const [smIcon,setSmIcon]=useState(ICONS[0]);
  const [thSubj,setThSubj]=useState(""); const [thName,setThName]=useState("");
  const [tpTheme,setTpTheme]=useState(""); const [tpName,setTpName]=useState(""); const [tpLv,setTpLv]=useState<1|2|3>(1);
  const [scSubj,setScSubj]=useState(""); const [scDate,setScDate]=useState(dsOf()); const [scDur,setScDur]=useState(60); const [scNote,setScNote]=useState("");
  const [exName,setExName]=useState(""); const [exDate,setExDate]=useState(""); const [exSubj,setExSubj]=useState(""); const [exNote,setExNote]=useState(""); const [exType,setExType]=useState("exam");

  // ─── Persist to localStorage on every state change ───────────
  useEffect(()=>{ saveState(S); },[S]);

  useEffect(()=>{return ()=>{ if(timerRef.current) clearInterval(timerRef.current); };},[]);

  const upd=(fn: (n: AppState)=>void)=>setS(prev=>{const n=JSON.parse(JSON.stringify(prev)) as AppState;fn(n);return n;});
  const getSubj=(id: string)=>S.subjects.find(s=>s.id===id);
  const subjProg=(sid: string)=>{const ts=S.topics.filter(t=>t.subjectId===sid);if(!ts.length)return null;const done=ts.filter(t=>t.level===3).length;return{total:ts.length,done,pct:Math.round(done/ts.length*100)};};
  const nextExam=()=>S.exams.filter(e=>{ const d=daysUntil(e.date); return d!==null&&d>=0&&(e.type||"exam")==="exam"; }).sort((a,b)=>a.date.localeCompare(b.date))[0]||null;
  const aClSubj=clSubj||S.subjects[0]?.id||null;
  const aMemoSubj=memoSubj||S.subjects[0]?.id||null;

  const openSM=(id: string|null=null)=>{setEditSId(id);const s=id?getSubj(id):null;setSmName(s?.name||"");setSmNote(s?.note||"");setSmColor(s?.color||PALETTE[0]);setSmIcon(s?.icon||ICONS[0]);setModal("subject");};
  const saveSubj=()=>{if(!smName.trim()){toast("Please enter a subject name");return;}upd(n=>{if(editSId){const i=n.subjects.findIndex(s=>s.id===editSId);if(i>=0)n.subjects[i]={...n.subjects[i],name:smName.trim(),color:smColor,icon:smIcon,note:smNote.trim()};}else{const id=uid();n.subjects.push({id,name:smName.trim(),color:smColor,icon:smIcon,note:smNote.trim()});n.memos[id]="";}});setModal(null);toast(editSId?"Subject updated":"Subject added");};
  const delSubj=(id: string)=>{setConfirmCfg({message:"Delete this subject and all its themes and topics?\nThis cannot be undone.",onOk:()=>{upd(n=>{n.subjects=n.subjects.filter(s=>s.id!==id);n.themes=n.themes.filter(t=>t.subjectId!==id);n.topics=n.topics.filter(t=>t.subjectId!==id);delete n.memos[id];});if(clSubj===id)setClSubj(null);if(memoSubj===id)setMemoSubj(null);toast("Subject deleted");}});};
  const openTM=()=>{if(!S.subjects.length){toast("Add a subject first");return;}setThSubj(aClSubj||S.subjects[0].id);setThName("");setModal("theme");};
  const addTheme=()=>{if(!thName.trim()){toast("Please enter a theme name");return;}upd(n=>{n.themes.push({id:uid(),subjectId:thSubj,name:thName.trim()});});setModal(null);toast("Theme added");};
  const delTheme=(id: string)=>{setConfirmCfg({message:"Delete this theme and all its topics?",onOk:()=>{upd(n=>{n.themes=n.themes.filter(t=>t.id!==id);n.topics=n.topics.filter(t=>t.themeId!==id);});toast("Theme deleted");}});};
  const openPM=(tid: string|null=null)=>{if(!S.themes.length){toast("Add a theme first");return;}setTpTheme(tid||S.themes[0]?.id);setTpName("");setTpLv(1);setModal("topic");};
  const addTopic=()=>{if(!tpName.trim()||!tpTheme){toast("Please fill in all fields");return;}const th=S.themes.find(t=>t.id===tpTheme);if(!th)return;upd(n=>{n.topics.push({id:uid(),themeId:tpTheme,subjectId:th.subjectId,name:tpName.trim(),level:tpLv});});setModal(null);toast("Topic added");};
  const delTopic=(id: string)=>upd(n=>{n.topics=n.topics.filter(t=>t.id!==id);});
  const setLv=(id: string,lv: 1|2|3)=>upd(n=>{const t=n.topics.find(x=>x.id===id);if(t)t.level=lv;});
  const openSchM=()=>{if(!S.subjects.length){toast("Add a subject first");return;}setScSubj(aClSubj||S.subjects[0].id);setScDate(dsOf());setScDur(60);setScNote("");setModal("schedule");};
  const addSched=()=>{if(!scDate){toast("Please select a date");return;}upd(n=>{n.schedules.push({id:uid(),subjectId:scSubj,date:scDate,dur:scDur,note:scNote.trim()});});setModal(null);toast("Session added");};
  const delSched=(id: string)=>upd(n=>{n.schedules=n.schedules.filter(x=>x.id!==id);});
  const openEM=()=>{setExName("");setExDate("");setExSubj("");setExNote("");setExType("exam");setModal("exam");};
  const addExam=()=>{if(!exName.trim()||!exDate){toast("Please enter name and date");return;}upd(n=>{n.exams.push({id:uid(),name:exName.trim(),date:exDate,subjectId:exSubj,note:exNote.trim(),type:exType});});setModal(null);toast(exType==="exam"?"Exam added":"Goal added");};
  const delExam=(id: string)=>upd(n=>{n.exams=n.exams.filter(x=>x.id!==id);});
  const toggleTask=(id: string)=>upd(n=>{if(Array.isArray(n.planTasks))n.planTasks=n.planTasks.map(t=>t.id===id?{...t,completed:!t.completed}:t);});
  const clearPlan=()=>{upd(n=>{n.planTasks=null;});setPasteText("");toast("Plan cleared");};
  const startTimer=()=>{ if(timerRunning)return; setTimerRunning(true); timerRef.current=setInterval(()=>setTimerSecs(s=>s+1),1000); };
  const pauseTimer=()=>{ setTimerRunning(false); if(timerRef.current)clearInterval(timerRef.current); };
  const resetTimer=()=>{ pauseTimer(); setTimerSecs(0); };
  const saveSession=()=>{
    const mins=secsToMins(timerSecs);
    if(mins<1){toast("Minimum 1 minute required");return;}
    const subjId=timerSubj||S.subjects[0]?.id;
    if(!subjId){toast("Add a subject first");return;}
    const linkedTask=timerTaskId&&Array.isArray(S.planTasks)?S.planTasks.find(t=>t.id===timerTaskId):null;
    const noteToSave=timerNote.trim()||(linkedTask?linkedTask.title:"");
    upd(n=>{
      if(!n.studyLogs)n.studyLogs=[];
      n.studyLogs.push({id:uid(),subjectId:subjId,date:dsOf(),mins,note:noteToSave,planTaskId:timerTaskId||null,ts:Date.now()});
      if(timerTaskId&&Array.isArray(n.planTasks)){
        n.planTasks=n.planTasks.map(t=>t.id===timerTaskId?{...t,completed:true}:t);
      }
    });
    toast("Session saved"+(linkedTask?" · "+linkedTask.title+" completed":"")+" ✅");
    resetTimer();setTimerNote("");setTimerTaskId(null);
  };
  const addManualLog=(subjId: string,mins: number,note: string,date: string)=>{
    if(mins<1||!subjId)return;
    upd(n=>{if(!n.studyLogs)n.studyLogs=[];n.studyLogs.push({id:uid(),subjectId:subjId,date:date||dsOf(),mins,note:note||"",planTaskId:null,ts:Date.now()});});
    toast("Session logged");
  };
  const deleteLog=(id: string)=>upd(n=>{n.studyLogs=(n.studyLogs||[]).filter(l=>l.id!==id);});

  const buildPrompt=()=>{
    if(!S.subjects.length)return "";
    const totalMins=Math.round(planHours*60);
    const ne=nextExam();
    const neD=ne?daysUntil(ne.date):null;
    const urgentNote=ne&&neD!==null&&neD<=14?"\nURGENT: "+ne.name+" is in "+neD+" days. Prioritize heavily.":"";
    const lines=S.subjects.map(s=>{
      const ts=S.topics.filter(t=>t.subjectId===s.id);
      const ns=ts.filter(t=>t.level===1).map(t=>t.name);
      const un=ts.filter(t=>t.level===2).map(t=>t.name);
      const rem=ts.filter(t=>t.level!==3).map(t=>t.name);
      const ex=S.exams.filter(e=>e.subjectId===s.id).sort((a,b)=>a.date.localeCompare(b.date))[0];
      const exD=ex?daysUntil(ex.date):null;
      const p=subjProg(s.id);
      return s.name+": exam in "+(ex&&exD!==null?exD+"d":"N/A")+", mastery "+(p?p.pct+"%":"untracked")+", not-studied["+(ns.join(",")||"none")+"], uncertain["+(un.join(",")||"none")+"], remaining["+(rem.join(",")||"none")+"]";
    }).join("\n");
    const subjNames=S.subjects.map(s=>s.name).join(", ");
    return "You are a medical licensing exam coach (USMLE/AMC). Return ONLY a JSON array of study tasks (no preamble, no markdown fences).\n\nAvailable study time today: "+planHours+" hours ("+totalMins+" minutes)"+urgentNote+"\n\nSubject status:\n"+lines+"\n\nResponse format (array only):\n[{\"subject\":\"one of: "+subjNames+"\",\"title\":\"specific task title\",\"detail\":\"1-2 sentence study method\",\"minutes\":number}]\n\nRules: total minutes must equal "+totalMins+", 3-5 tasks, prioritize not-studied and uncertain topics, prioritize subjects with approaching exams.";
  };

  const applyPastedPlan=(text: string)=>{
    setPlanErr("");
    try{
      const cleaned=text.replace(/```[\w]*\n?/g,"").trim();
      const match=cleaned.match(/\[[\s\S]*\]/);
      if(!match)throw new Error("No JSON array found");
      const tasks=JSON.parse(match[0]) as {subject:string;title:string;detail:string;minutes:number}[];
      if(!Array.isArray(tasks)||!tasks.length)throw new Error("Empty task list");
      const nameToId: Record<string,string>={};S.subjects.forEach(s=>{nameToId[s.name]=s.id;});
      upd(n=>{n.planTasks=tasks.map((t,i)=>({...t,id:String(Date.now())+"_"+i,completed:false,subject:nameToId[t.subject]||S.subjects.find(s=>s.id===t.subject)?.id||S.subjects[0]?.id||""}));});
      setPasteText("");toast("Plan applied ✅");
    }catch(e){setPlanErr("Error: "+(e as Error).message);}
  };

  const WeekGrid=({off}: {off:number})=>{
    const base=new Date(TODAY);base.setDate(TODAY.getDate()-TODAY.getDay()+off*7);
    return(<div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:10}}>{Array.from({length:7},(_,i)=>{
      const d=new Date(base);d.setDate(base.getDate()+i);
      const dStr=dsOf(d),isT=dStr===dsOf(TODAY);
      return(<div key={i} style={{background:isT?"rgba(56,139,253,0.07)":"rgba(255,255,255,0.02)",border:`1px solid ${isT?C.accent:C.border}`,borderRadius:8,padding:"12px 10px",minHeight:88}}>
        <div style={{fontSize:11,fontWeight:700,color:isT?C.accent:C.sub,marginBottom:4}}>{DAYS[d.getDay()]}</div>
        <div style={{fontSize:20,fontWeight:700,fontFamily:"'DM Mono',monospace",marginBottom:8,lineHeight:1}}>{d.getDate()}</div>
        {S.schedules.filter(s=>s.date===dStr).map(sc=>{const s=getSubj(sc.subjectId);return <span key={sc.id} style={{display:"block",fontSize:10,fontWeight:600,padding:"3px 7px",borderRadius:4,marginBottom:3,background:`${s?.color||C.accent}22`,color:s?.color||C.accent}}>{s?.icon||""} {sc.dur}m</span>;})}
      </div>);
    })}</div>);
  };

  const VDashboard=()=>{
    const all=S.topics,done=all.filter(t=>t.level===3).length,weak=all.filter(t=>t.level<3).length,total=all.length,pct=total?Math.round(done/total*100):0;
    const ne=nextExam();
    const neD=ne?daysUntil(ne.date):null;
    return(<div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:16}}>
        {[
          {lbl:"Overall Mastery",val:total?pct+"%":"—",note:"across all topics",color:pct>=70?C.ok:pct>=40?C.warn:C.danger},
          {lbl:"Mastered",val:done,note:"of "+total+" topics",color:C.ok},
          {lbl:"Needs Review",val:weak,note:"uncertain + not studied",color:C.warn},
          {lbl:"Next Exam",val:ne&&neD!==null?neD+"d":"—",note:ne?ne.name:"No exam set",color:ne&&neD!==null&&neD<=30?C.danger:C.text},
        ].map(s=>(<div key={s.lbl} style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:10,padding:"18px 20px"}}>
          <div style={{fontSize:11,color:C.sub,marginBottom:10,fontWeight:600}}>{s.lbl}</div>
          <div style={{fontSize:30,fontWeight:700,fontFamily:"'DM Mono',monospace",letterSpacing:-1,lineHeight:1,color:s.color}}>{s.val}</div>
          <div style={{fontSize:11,color:C.sub,marginTop:6}}>{s.note}</div>
        </div>))}
      </div>

      <div style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:10,padding:"20px 22px",marginBottom:16}}>
        <SecLabel>Subject Progress</SecLabel>
        {S.subjects.length?S.subjects.map(s=>{const p=subjProg(s.id);const pt=p?.pct||0;return(<div key={s.id} style={{marginBottom:14}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}><span style={{fontSize:13,fontWeight:600}}>{s.icon} {s.name}</span><span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:C.sub}}>{p?p.done+"/"+p.total+" · "+pt+"%":"No topics"}</span></div><PBar pct={pt} color={s.color}/></div>)}):<div style={{textAlign:"center",padding:"20px 0",color:C.sub,fontSize:13}}>Add a subject to get started</div>}
      </div>

      <div style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:10,padding:"20px 22px",marginBottom:16}}>
        <SecLabel>Exam & Goal Countdown</SecLabel>
        {S.exams.length?(<div style={{display:"flex",flexDirection:"column",gap:12}}>{[...S.exams].sort((a,b)=>a.date.localeCompare(b.date)).slice(0,4).map(e=>{
          const d=daysUntil(e.date),isGoal=e.type==="goal";
          const ac=d===null?C.sub:d<0?C.ok:isGoal?(d<=30?C.warn:d<=90?C.accent:C.sub):(d<=14?C.danger:d<=30?C.warn:C.ok);
          return(<div key={e.id} style={{background:C.surf2,border:`1px solid ${C.border}`,borderRadius:10,padding:"18px 20px",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:0,left:0,width:4,height:"100%",background:ac}}/>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
              <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10,background:isGoal?"rgba(56,139,253,0.15)":"rgba(227,179,65,0.15)",color:isGoal?C.accent:C.gold}}>{isGoal?"📌 Goal":"🎯 Exam"}</span>
            </div>
            <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>{e.name}</div>
            <div style={{fontSize:11,color:C.sub,marginBottom:10}}>{e.date}</div>
            <div style={{fontSize:40,fontWeight:700,fontFamily:"'DM Mono',monospace",letterSpacing:-2,lineHeight:1,color:ac}}>{daysLabel(d,e.type)}</div>
          </div>);
        })}</div>):<div style={{textAlign:"center",padding:"20px 0",color:C.sub,fontSize:13}}>No exams or goals registered</div>}
      </div>

      <div style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:10,padding:"20px 22px",marginBottom:16}}>
        <SecLabel>Topics Needing Review</SecLabel>
        {S.topics.filter(t=>t.level<3).slice(0,8).map(t=>{
          const th=S.themes.find(x=>x.id===t.themeId),s=getSubj(t.subjectId),u=UL[t.level];
          return(<div key={t.id} style={{display:"flex",alignItems:"flex-start",gap:14,padding:"12px 14px",borderRadius:10,marginBottom:6}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:s?.color||C.accent,flexShrink:0,marginTop:5}}/>
            <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{t.name}</div><div style={{fontSize:11,color:C.sub,marginTop:2}}>{s?.icon} {s?.name} › {th?.name}</div></div>
            <span style={{display:"inline-flex",padding:"4px 11px",borderRadius:20,fontSize:11,fontWeight:700,background:u.bg,color:u.color,border:`1px solid ${u.bd}`,flexShrink:0}}>{u.label}</span>
          </div>);
        })}
        {!S.topics.filter(t=>t.level<3).length&&<div style={{textAlign:"center",padding:"20px 0",color:C.sub,fontSize:13}}>🎉 All topics mastered!</div>}
      </div>

      <div style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:10,padding:"20px 22px"}}>
        <SecLabel>This Week</SecLabel>
        <WeekGrid off={0}/>
      </div>
    </div>);
  };

  const VPlan=()=>{
    const tasks=Array.isArray(S.planTasks)?S.planTasks:[];
    const done=tasks.filter(t=>t.completed).length;
    const pct=tasks.length?Math.round(done/tasks.length*100):0;
    const prompt=buildPrompt();
    const copyPrompt=()=>{if(!prompt)return;navigator.clipboard.writeText(prompt).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2500);}).catch(()=>toast("Could not copy"));};
    return(<div>
      <div style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:10,padding:"20px 22px",marginBottom:14}}>
        <SecLabel>STEP 1 — Generate & copy the prompt</SecLabel>
        <div style={{fontSize:12,color:C.sub,marginBottom:16,lineHeight:1.75}}>Set your available hours, copy the prompt, and paste it into <strong style={{color:C.text}}>this Claude chat</strong> (outside this app window).</div>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,flexWrap:"wrap"}}>
          <span style={{fontSize:13,color:C.sub}}>Available today:</span>
          <input type="number" value={planHours} min={0.5} max={12} step={0.5} onChange={e=>setPlanHours(parseFloat(e.target.value)||3)} style={{width:64,padding:"8px 12px",background:C.surf2,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:13,outline:"none",fontFamily:"'Inter',sans-serif"}}/>
          <span style={{fontSize:13,color:C.sub}}>hours</span>
          <Btn variant="gold" onClick={copyPrompt}>{copied?"✅ Copied!":"📋 Copy prompt"}</Btn>
        </div>
        <textarea readOnly value={prompt} style={{width:"100%",height:88,padding:"10px 12px",background:C.surf2,border:`1px solid ${C.border}`,borderRadius:8,color:C.dim,fontSize:11,lineHeight:1.6,resize:"none",fontFamily:"monospace",outline:"none"}}/>
      </div>

      <div style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:10,padding:"20px 22px",marginBottom:14}}>
        <SecLabel>STEP 2 — Paste Claude's response</SecLabel>
        <div style={{fontSize:12,color:C.sub,marginBottom:12,lineHeight:1.75}}>Paste the JSON array returned by Claude (starting with <code style={{background:C.surf2,padding:"1px 5px",borderRadius:4,fontSize:11}}>[</code>).</div>
        <textarea value={pasteText} onChange={e=>setPasteText(e.target.value)} placeholder="Paste Claude's response here..." style={{width:"100%",height:100,padding:"10px 12px",background:C.surf2,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12,lineHeight:1.6,resize:"vertical",fontFamily:"monospace",outline:"none"}}/>
        <div style={{display:"flex",alignItems:"center",gap:10,marginTop:10}}>
          <Btn variant="accent" onClick={()=>applyPastedPlan(pasteText)} disabled={!pasteText.trim()}>✅ Apply plan</Btn>
          {tasks.length>0&&<Btn variant="ghost" size="sm" onClick={clearPlan}>Clear</Btn>}
        </div>
        {planErr&&<div style={{fontSize:11,color:C.danger,marginTop:12,lineHeight:1.6,background:"rgba(248,81,73,0.08)",border:"1px solid rgba(248,81,73,0.2)",borderRadius:8,padding:"10px 12px",whiteSpace:"pre-wrap",wordBreak:"break-all"}}>{planErr}</div>}
      </div>

      {tasks.length>0&&(<div style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:10,padding:"20px 22px"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,flex:1}}>Today's Plan</div>
          <span style={{fontSize:12,color:C.sub}}>{done}/{tasks.length} done</span>
          <div style={{width:80,height:5,background:C.border,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,background:C.ok,width:pct+"%",transition:"width .3s"}}/></div>
          <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:C.sub}}>{pct}%</span>
        </div>
        {tasks.map(t=>{const s=getSubj(t.subject)||S.subjects[0];return(<div key={t.id} onClick={()=>toggleTask(t.id)} style={{background:C.surf2,border:`1px solid ${t.completed?"rgba(63,185,80,0.3)":C.border}`,borderRadius:10,padding:"14px 16px",display:"flex",alignItems:"flex-start",gap:12,cursor:"pointer",opacity:t.completed?0.6:1,marginBottom:8,transition:"opacity .2s"}}>
          <div style={{width:20,height:20,borderRadius:5,flexShrink:0,marginTop:2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,border:t.completed?"1.5px solid "+C.ok:"1.5px solid "+C.border2,background:t.completed?C.ok:"transparent",color:"#000",transition:"all .15s"}}>{t.completed?"✓":""}</div>
          <div style={{width:30,height:30,borderRadius:7,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,background:`${s?.color||C.accent}22`}}>{s?.icon||"📖"}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:600,marginBottom:3,textDecoration:t.completed?"line-through":"none"}}>{t.title}</div>
            <div style={{fontSize:11,color:C.sub,lineHeight:1.55}}>{t.detail}</div>
            <div style={{fontSize:10,color:C.gold,fontFamily:"'DM Mono',monospace",marginTop:4}}>{s?.icon} {s?.name} · {fmtMins(t.minutes)}</div>
          </div>
        </div>);})}
      </div>)}
    </div>);
  };

  const VChecklist=()=>{
    const subj=getSubj(aClSubj||"");
    const themes=S.themes.filter(t=>t.subjectId===aClSubj);
    return(<div>
      <div style={{display:"flex",gap:5,marginBottom:22,flexWrap:"wrap"}}>
        {S.subjects.map(s=>(<div key={s.id} onClick={()=>setClSubj(s.id)} style={{padding:"8px 16px",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",background:s.id===aClSubj?"rgba(56,139,253,0.14)":"transparent",color:s.id===aClSubj?C.accent:C.sub,transition:"all .12s"}}>{s.icon} {s.name}</div>))}
      </div>
      {!S.subjects.length?(<div style={{textAlign:"center",padding:"40px 0",color:C.sub}}><div style={{fontSize:28,marginBottom:10}}>📚</div><div style={{fontSize:13,marginBottom:14}}>Add a subject to get started</div><Btn variant="accent" onClick={()=>setView("subjects")}>Go to Subjects</Btn></div>)
      :!themes.length?(<div style={{textAlign:"center",padding:"40px 0",color:C.sub}}><div style={{fontSize:28,marginBottom:10}}>☑️</div><div style={{fontSize:13,marginBottom:14}}>No themes yet</div><Btn variant="accent" onClick={openTM}>+ Add Theme</Btn></div>)
      :(<>{themes.map(th=>{
        const tps=S.topics.filter(t=>t.themeId===th.id);
        const done=tps.filter(t=>t.level===3).length;
        const pct=tps.length?Math.round(done/tps.length*100):0;
        const isOpen=openTh[th.id]===true;
        return(<div key={th.id} style={{border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden",marginBottom:10}}>
          <div onClick={()=>setOpenTh(p=>({...p,[th.id]:!isOpen}))} style={{display:"flex",alignItems:"center",gap:10,padding:"13px 16px",background:C.surf2,cursor:"pointer"}}>
            <span style={{fontSize:9,color:C.sub,transition:"transform .2s",transform:isOpen?"rotate(90deg)":"none",flexShrink:0}}>▶</span>
            <span style={{fontSize:13,fontWeight:600,flex:1}}>{th.name}</span>
            <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
              <div style={{width:60,height:5,background:"rgba(255,255,255,0.08)",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,background:subj?.color||C.accent,width:pct+"%"}}/></div>
              <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:C.sub,minWidth:32,textAlign:"right"}}>{done}/{tps.length}</span>
            </div>
            <button onClick={e=>{e.stopPropagation();delTheme(th.id);}} style={{background:"none",border:"none",color:C.sub,cursor:"pointer",fontSize:14,padding:"3px 7px",borderRadius:5}}>✕</button>
          </div>
          {isOpen&&(<div style={{padding:"10px 14px 12px",borderTop:`1px solid ${C.border}`}}>
            {tps.map(tp=>(<div key={tp.id} style={{padding:"12px 14px",borderRadius:10,marginBottom:6,background:C.surf3}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:10}}>
                <span style={{fontSize:13,fontWeight:600,lineHeight:1.5,flex:1}}>{tp.name}</span>
                <button onClick={()=>delTopic(tp.id)} style={{background:"none",border:"none",color:C.sub,cursor:"pointer",fontSize:14,padding:"2px 6px",borderRadius:5,flexShrink:0,marginTop:1}}>✕</button>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{([1,2,3] as (1|2|3)[]).map(lv=><UBadge key={lv} level={lv} active={tp.level===lv} onClick={()=>setLv(tp.id,lv)}/>)}</div>
            </div>))}
            <div onClick={()=>openPM(th.id)} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 14px",borderRadius:8,border:`1px dashed ${C.border2}`,color:C.sub,fontSize:12,cursor:"pointer",marginTop:4}}>+ Add topic</div>
          </div>)}
        </div>);
      })}<Btn variant="ghost" onClick={openTM} style={{marginTop:12}}>+ Add Theme</Btn></>)}
    </div>);
  };

  const VSchedule=()=>{
    const base=new Date(TODAY);base.setDate(TODAY.getDate()-TODAY.getDay()+weekOff*7);
    const last=new Date(base);last.setDate(base.getDate()+6);
    return(<div>
      <div style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:10,padding:"20px 22px",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:8}}>
          <div style={{fontSize:14,fontWeight:700}}>{base.toLocaleDateString("en-US",{month:"short",day:"numeric"})} – {last.toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div>
          <div style={{display:"flex",gap:7}}><Btn variant="ghost" size="xs" onClick={()=>setWeekOff(p=>p-1)}>◀ Prev</Btn><Btn variant="ghost" size="xs" onClick={()=>setWeekOff(0)}>This week</Btn><Btn variant="ghost" size="xs" onClick={()=>setWeekOff(p=>p+1)}>Next ▶</Btn></div>
        </div>
        <WeekGrid off={weekOff}/>
      </div>
      <div style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:10,padding:"20px 22px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700}}>Schedule List</div>
          <Btn variant="ghost" size="sm" onClick={openSchM}>+ Add session</Btn>
        </div>
        {[...S.schedules].sort((a,b)=>a.date.localeCompare(b.date)).map(sc=>{const s=getSubj(sc.subjectId);return(<div key={sc.id} style={{display:"flex",alignItems:"flex-start",gap:14,padding:"12px 14px",borderRadius:10,marginBottom:6}}><div style={{width:8,height:8,borderRadius:"50%",background:s?.color||C.accent,flexShrink:0,marginTop:5}}/><div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{s?.icon} {s?.name||"Unknown"} — {sc.dur}min</div><div style={{fontSize:11,color:C.sub,marginTop:2}}>{sc.date}{sc.note?" · "+sc.note:""}</div></div><button onClick={()=>delSched(sc.id)} style={{background:"none",border:"none",color:C.sub,cursor:"pointer",fontSize:14,padding:"3px 7px",borderRadius:5}}>✕</button></div>);})}
        {!S.schedules.length&&<div style={{textAlign:"center",padding:"20px 0",color:C.sub,fontSize:13}}>No sessions scheduled</div>}
      </div>
    </div>);
  };

  const VSubjects=()=>(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <div><div style={{fontSize:16,fontWeight:700}}>Subjects</div><div style={{fontSize:12,color:C.sub,marginTop:3}}>Add, edit, or remove subjects</div></div>
      <Btn variant="accent" onClick={()=>openSM(null)}>+ Add subject</Btn>
    </div>
    {!S.subjects.length?(<div style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:10,padding:"40px 0",textAlign:"center",color:C.sub}}><div style={{fontSize:28,marginBottom:10}}>📚</div><div style={{fontSize:13,marginBottom:16}}>No subjects yet</div><Btn variant="accent" onClick={()=>openSM(null)}>+ Add subject</Btn></div>)
    :S.subjects.map(s=>{const p=subjProg(s.id);return(<div key={s.id} style={{background:C.surf2,border:`1px solid ${C.border}`,borderRadius:10,padding:"20px 22px",marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}>
        <div style={{width:44,height:44,borderRadius:11,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0,background:s.color+"22"}}>{s.icon}</div>
        <div style={{flex:1,minWidth:0}}><div style={{fontSize:16,fontWeight:700,color:s.color}}>{s.name}</div><div style={{fontSize:12,color:C.sub,marginTop:2}}>{S.themes.filter(t=>t.subjectId===s.id).length} themes · {p?p.total+" topics · "+p.pct+"% mastered":"no topics"}{s.note?" · "+s.note:""}</div></div>
      </div>
      {p&&<PBar pct={p.pct} color={s.color} height={6} style={{marginBottom:14}}/>}
      <div style={{display:"flex",gap:10,borderTop:`1px solid ${C.border}`,paddingTop:14}}>
        <Btn variant="ghost" size="sm" onClick={()=>openSM(s.id)} style={{flex:1,justifyContent:"center"}}>✏️ Edit</Btn>
        <Btn variant="danger" size="sm" onClick={()=>delSubj(s.id)} style={{flex:1,justifyContent:"center"}}>🗑️ Delete</Btn>
      </div>
    </div>);})}
  </div>);

  const [examTabEn,setExamTabEn]=useState("all");
  const VExams=()=>{
    const tab=examTabEn, setTab=setExamTabEn;
    const sorted=[...S.exams].sort((a,b)=>a.date.localeCompare(b.date));
    const filtered=tab==="all"?sorted:sorted.filter(e=>(e.type||"exam")===tab);
    const examCnt=sorted.filter(e=>(e.type||"exam")==="exam").length;
    const goalCnt=sorted.filter(e=>e.type==="goal").length;
    return(<div>
      <div style={{display:"flex",gap:6,marginBottom:18}}>
        {([["all","All",sorted.length],["exam","🎯 Exams",examCnt],["goal","📌 Goals",goalCnt]] as [string,string,number][]).map(([key,lbl,cnt])=>(<div key={key} onClick={()=>setTab(key)} style={{padding:"8px 16px",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",background:tab===key?"rgba(56,139,253,0.14)":"transparent",color:tab===key?C.accent:C.sub,transition:"all .12s"}}>{lbl} <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,opacity:.7}}>({cnt})</span></div>))}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:16}}>
        {filtered.map(e=>{
          const isGoal=e.type==="goal",d=daysUntil(e.date);
          const ac=d===null?C.sub:d<0?C.ok:isGoal?(d<=30?C.warn:d<=90?C.accent:C.sub):(d<=14?C.danger:d<=30?C.warn:C.ok);
          const s=getSubj(e.subjectId),p=s?subjProg(s.id):null;
          return(<div key={e.id} style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:10,padding:"20px 22px",borderLeft:"4px solid "+ac}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:6}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}><span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10,background:isGoal?"rgba(56,139,253,0.15)":"rgba(227,179,65,0.15)",color:isGoal?C.accent:C.gold}}>{isGoal?"📌 Learning Goal":"🎯 Exam"}</span></div>
                <div style={{fontSize:16,fontWeight:700,lineHeight:1.4}}>{e.name}</div>
              </div>
              <button onClick={()=>delExam(e.id)} style={{background:"none",border:"none",color:C.sub,cursor:"pointer",fontSize:14,padding:"3px 7px",borderRadius:5,flexShrink:0}}>✕</button>
            </div>
            <div style={{fontSize:12,color:C.sub,marginBottom:8}}>{isGoal?"Target date: ":"Exam date: "}{e.date}{e.note?" · "+e.note:""}</div>
            {s&&<span style={{fontSize:11,fontWeight:700,color:s.color,background:s.color+"22",padding:"2px 9px",borderRadius:10,display:"inline-block",marginBottom:14}}>{s.icon} {s.name}</span>}
            {!s&&<div style={{marginBottom:14}}/>}
            <div style={{fontSize:40,fontWeight:700,fontFamily:"'DM Mono',monospace",color:ac,letterSpacing:-2,lineHeight:1,marginBottom:p?14:0}}>{daysLabel(d,e.type)}</div>
            {p&&s&&(<div style={{marginTop:14}}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:7}}><span style={{fontWeight:600,color:s.color}}>{s.icon} Mastery</span><span style={{fontFamily:"'DM Mono',monospace",color:C.sub}}>{p.pct}%</span></div><PBar pct={p.pct} color={s.color}/></div>)}
          </div>);
        })}
      </div>
      {!filtered.length&&(<div style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:10,padding:"40px 0",textAlign:"center",color:C.sub}}><div style={{fontSize:28,marginBottom:10}}>{tab==="goal"?"📌":"🎯"}</div><div style={{fontSize:13}}>No {tab==="goal"?"goals":"exams"} yet</div></div>)}
      <Btn variant="ghost" onClick={openEM}>+ Add exam or goal</Btn>
    </div>);
  };

  const VNotes=()=>{const s=getSubj(aMemoSubj||"");return(<div>
    <div style={{display:"flex",gap:5,marginBottom:22,flexWrap:"wrap"}}>{S.subjects.map(sub=>(<div key={sub.id} onClick={()=>setMemoSubj(sub.id)} style={{padding:"8px 16px",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",background:sub.id===aMemoSubj?"rgba(56,139,253,0.14)":"transparent",color:sub.id===aMemoSubj?C.accent:C.sub}}>{sub.icon} {sub.name}</div>))}</div>
    {s&&(<div style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:10,padding:"20px 22px"}}><div style={{fontSize:14,fontWeight:700,color:s.color,marginBottom:16}}>{s.icon} {s.name} — Notes</div><textarea defaultValue={S.memos[s.id]||""} onChange={e=>upd(n=>{n.memos={...n.memos,[s.id]:e.target.value};})} placeholder="Key points, mnemonics, weak areas, high-yield facts..." style={{width:"100%",minHeight:320,padding:"12px 14px",background:C.surf2,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontFamily:"'Inter',sans-serif",fontSize:13,lineHeight:1.75,outline:"none",resize:"vertical"}}/></div>)}
    {!S.subjects.length&&<div style={{textAlign:"center",padding:"40px 0",color:C.sub,fontSize:13}}>Add a subject first</div>}
  </div>);};

  const VTimer=()=>{
    const logs=S.studyLogs||[];
    const todayStr=dsOf();
    const todayLogs=logs.filter(l=>l.date===todayStr).sort((a,b)=>b.ts-a.ts);
    const todayMins=todayLogs.reduce((a,l)=>a+l.mins,0);
    const weekStart=new Date(TODAY); weekStart.setDate(TODAY.getDate()-TODAY.getDay()); weekStart.setHours(0,0,0,0);
    const weekDates=Array.from({length:7},(_,i)=>{const d=new Date(weekStart);d.setDate(weekStart.getDate()+i);return dsOf(d);});
    const weekLogs=logs.filter(l=>weekDates.includes(l.date));
    const weekMins=weekLogs.reduce((a,l)=>a+l.mins,0);
    const scopeLogs=reportTab==="daily"?todayLogs:weekLogs;
    const totalMins=reportTab==="daily"?todayMins:weekMins;
    const bySubj: Record<string,number>={};
    scopeLogs.forEach(l=>{bySubj[l.subjectId]=(bySubj[l.subjectId]||0)+l.mins;});
    const mSubj=manualSubj||timerSubj||S.subjects[0]?.id||"", setMSubj=setManualSubj;
    const mMins=manualMins, setMMins=setManualMins;
    const mNote=manualNote, setMNote=setManualNote;
    const mDate=manualDate, setMDate=setManualDate;
    const weekBarData=DAYS.map((lbl,i)=>({d:weekDates[i],lbl,mins:weekLogs.filter(l=>l.date===weekDates[i]).reduce((a,l)=>a+l.mins,0)}));
    const maxBar=Math.max(...weekBarData.map(b=>b.mins),60);
    return(<div>
      <div style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:10,padding:"22px 24px",marginBottom:14}}>
        <SecLabel>⏱ Stopwatch</SecLabel>
        <div style={{textAlign:"center",marginBottom:18}}>
          <div style={{fontSize:56,fontWeight:700,fontFamily:"'DM Mono',monospace",letterSpacing:-2,lineHeight:1,color:timerRunning?C.ok:C.text}}>{fmtSecs(timerSecs)}</div>
          <div style={{fontSize:12,color:C.sub,marginTop:6}}>{timerRunning?"Recording...":"Stopped"}</div>
        </div>
        {Array.isArray(S.planTasks)&&S.planTasks.length>0&&(
          <div style={{marginBottom:14}}>
            <div style={{fontSize:12,color:C.sub,marginBottom:6}}>Link to today's plan (optional)</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <div onClick={()=>{setTimerTaskId(null);setTimerNote("");}}
                style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:9,border:"1px solid "+(timerTaskId===null?C.accent:C.border),background:timerTaskId===null?"rgba(56,139,253,0.08)":"rgba(255,255,255,0.02)",cursor:"pointer",transition:"all .12s"}}>
                <div style={{width:16,height:16,borderRadius:"50%",border:"2px solid "+(timerTaskId===null?C.accent:C.sub),background:timerTaskId===null?C.accent:"transparent",flexShrink:0}}/>
                <span style={{fontSize:12,color:timerTaskId===null?C.accent:C.sub}}>No task linked</span>
              </div>
              {S.planTasks.filter(t=>!t.completed).map(t=>{
                const s=getSubj(t.subject)||S.subjects[0];
                const isSel=timerTaskId===t.id;
                return (
                  <div key={t.id} onClick={()=>{
                    setTimerTaskId(isSel?null:t.id);
                    if(!isSel){setTimerSubj(t.subject||S.subjects[0]?.id||null);setTimerNote(t.title);}
                    else{setTimerNote("");}
                  }}
                    style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 14px",borderRadius:9,border:"1px solid "+(isSel?C.accent:C.border),background:isSel?"rgba(56,139,253,0.08)":"rgba(255,255,255,0.02)",cursor:"pointer",transition:"all .12s"}}>
                    <div style={{width:16,height:16,borderRadius:"50%",border:"2px solid "+(isSel?C.accent:C.sub),background:isSel?C.accent:"transparent",flexShrink:0,marginTop:2}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,color:isSel?C.text:C.dim,marginBottom:2}}>{t.title}</div>
                      <div style={{fontSize:10,color:s?.color||C.accent}}>{s?.icon} {s?.name} · {fmtMins(t.minutes)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div style={{marginBottom:14}}><div style={{fontSize:12,color:C.sub,marginBottom:6}}>Subject</div><FSelect value={timerSubj||S.subjects[0]?.id||""} onChange={e=>setTimerSubj(e.target.value)}>{S.subjects.map(s=><option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}</FSelect></div>
        <div style={{marginBottom:16}}><div style={{fontSize:12,color:C.sub,marginBottom:6}}>Note (optional)</div><FInput value={timerNote} onChange={e=>setTimerNote(e.target.value)} placeholder="e.g. Beta-blockers review, Past paper"/></div>
        <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
          {!timerRunning?<Btn variant="green" onClick={startTimer} style={{minWidth:100,justifyContent:"center"}}>▶ Start</Btn>:<Btn variant="ghost" onClick={pauseTimer} style={{minWidth:100,justifyContent:"center"}}>⏸ Pause</Btn>}
          <Btn variant="ghost" onClick={resetTimer} style={{minWidth:80,justifyContent:"center"}}>↺ Reset</Btn>
          <Btn variant="accent" onClick={saveSession} disabled={timerSecs<60} style={{minWidth:120,justifyContent:"center"}}>💾 Save session</Btn>
        </div>
      </div>

      <div style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:10,padding:"22px 24px",marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <SecLabel style={{margin:0,flex:1}}>📊 Study Report</SecLabel>
          <div style={{display:"flex",gap:5}}>
            {[["daily","Today"],["weekly","This week"]].map(([k,lbl])=>(<div key={k} onClick={()=>setReportTab(k)} style={{padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",background:reportTab===k?"rgba(56,139,253,0.14)":"transparent",color:reportTab===k?C.accent:C.sub}}>{lbl}</div>))}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
          {[{lbl:"Study time",val:fmtMins(totalMins),color:C.gold},{lbl:"Sessions",val:scopeLogs.length,color:C.accent},{lbl:"Subjects",val:Object.keys(bySubj).length,color:C.ok}].map(s=>(<div key={s.lbl} style={{background:C.surf2,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16px",textAlign:"center"}}><div style={{fontSize:11,color:C.sub,marginBottom:6}}>{s.lbl}</div><div style={{fontSize:22,fontWeight:700,fontFamily:"'DM Mono',monospace",color:s.color}}>{s.val}</div></div>))}
        </div>
        {reportTab==="weekly"&&(<div style={{marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:700,color:C.sub,marginBottom:10}}>Daily study time</div>
          <div style={{display:"flex",gap:6,alignItems:"flex-end",height:100}}>
            {weekBarData.map(b=>{const h=maxBar>0?Math.round((b.mins/maxBar)*88):0;const isT=b.d===todayStr;return(<div key={b.d} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}><div style={{fontSize:9,color:C.sub,fontFamily:"'DM Mono',monospace"}}>{b.mins>0?b.mins+"m":""}</div><div style={{width:"100%",height:88,display:"flex",alignItems:"flex-end"}}><div style={{width:"100%",height:h||2,background:isT?C.gold:C.accent,borderRadius:"4px 4px 0 0",opacity:isT?1:0.6,transition:"height .4s ease",minHeight:2}}/></div><div style={{fontSize:10,fontWeight:700,color:isT?C.gold:C.sub}}>{b.lbl}</div></div>);})}
          </div>
        </div>)}
        {Object.keys(bySubj).length>0&&(<div style={{marginBottom:8}}>
          <div style={{fontSize:12,fontWeight:700,color:C.sub,marginBottom:10}}>By subject</div>
          {Object.entries(bySubj).sort((a,b)=>b[1]-a[1]).map(([sid,mins])=>{const s=getSubj(sid);const pct=totalMins?Math.round(mins/totalMins*100):0;return(<div key={sid} style={{marginBottom:10}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:13,fontWeight:600}}>{s?.icon} {s?.name||"Unknown"}</span><span style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:C.sub}}>{fmtMins(mins)} ({pct}%)</span></div><PBar pct={pct} color={s?.color||C.accent} height={6}/></div>);})}
        </div>)}
        {scopeLogs.length===0&&<div style={{textAlign:"center",padding:"20px 0",color:C.sub,fontSize:13}}>No sessions recorded</div>}
      </div>

      <div style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:10,padding:"22px 24px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <SecLabel style={{margin:0,flex:1}}>{reportTab==="daily"?"Today's":"This week's"} sessions</SecLabel>
          <Btn variant="ghost" size="sm" onClick={()=>setShowManual(v=>!v)}>{showManual?"Close":"+ Manual add"}</Btn>
        </div>
        {showManual&&(<div style={{background:C.surf2,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16px",marginBottom:14}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <div><div style={{fontSize:11,color:C.sub,marginBottom:5}}>Subject</div><FSelect value={mSubj} onChange={e=>setMSubj(e.target.value)}>{S.subjects.map(s=><option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}</FSelect></div>
            <div><div style={{fontSize:11,color:C.sub,marginBottom:5}}>Duration (min)</div><FInput type="number" value={mMins} min={1} step={5} onChange={e=>setMMins(parseInt(e.target.value)||30)}/></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <div><div style={{fontSize:11,color:C.sub,marginBottom:5}}>Date</div><FInput type="date" value={mDate} onChange={e=>setMDate(e.target.value)}/></div>
            <div><div style={{fontSize:11,color:C.sub,marginBottom:5}}>Note (optional)</div><FInput value={mNote} onChange={e=>setMNote(e.target.value)} placeholder="e.g. Anki review"/></div>
          </div>
          <Btn variant="accent" size="sm" onClick={()=>{addManualLog(mSubj,mMins,mNote,mDate);setMNote("");setShowManual(false);}}>Save</Btn>
        </div>)}
        {scopeLogs.length===0?<div style={{textAlign:"center",padding:"20px 0",color:C.sub,fontSize:13}}>No sessions yet</div>
        :scopeLogs.slice().sort((a,b)=>b.ts-a.ts).map(l=>{const s=getSubj(l.subjectId);const time=new Date(l.ts).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});return(<div key={l.id} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"12px 14px",borderRadius:10,marginBottom:6,background:C.surf2}}>
          <div style={{width:36,height:36,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0,background:(s?.color||C.accent)+"22"}}>{s?.icon||"📖"}</div>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,color:s?.color||C.accent}}>{s?.name||"Unknown"}</div><div style={{fontSize:11,color:C.sub,marginTop:2}}>{l.date} {time}{l.note?" · "+l.note:""}</div></div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:700,color:C.text,flexShrink:0}}>{fmtMins(l.mins)}</div>
          <button onClick={()=>deleteLog(l.id)} style={{background:"none",border:"none",color:C.sub,cursor:"pointer",fontSize:14,padding:"3px 6px",borderRadius:5,flexShrink:0}}>✕</button>
        </div>);})}
      </div>
    </div>);
  };

  const views: Record<string,React.ReactNode>={dashboard:<VDashboard/>,plan:<VPlan/>,checklist:<VChecklist/>,schedule:<VSchedule/>,timer:<VTimer/>,subjects:<VSubjects/>,exams:<VExams/>,memo:<VNotes/>};
  const ne=nextExam();
  const neD=ne?daysUntil(ne.date):null;

  return(<div style={{display:"flex",height:"100vh",background:C.bg,color:C.text,fontFamily:"'Inter',sans-serif",fontSize:14,lineHeight:1.65}}>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
      @keyframes spin{to{transform:rotate(360deg)}}
      *{box-sizing:border-box;margin:0;padding:0;}
      ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:${C.border2};border-radius:3px} ::-webkit-scrollbar-track{background:transparent}
    `}</style>

    {/* Sidebar */}
    <div style={{width:228,flexShrink:0,background:C.surf,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",overflowY:"auto"}}>
      <div style={{padding:"22px 20px 18px",display:"flex",alignItems:"center",gap:10,borderBottom:`1px solid ${C.border}`}}>
        <div style={{width:32,height:32,borderRadius:9,background:"linear-gradient(135deg,#3fb950,#388bfd)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>🩺</div>
        <div><div style={{fontSize:13,fontWeight:700}}>MedLicense</div><div style={{fontSize:10,color:C.sub,marginTop:2}}>USMLE · AMC · International</div></div>
      </div>
      {["Study","Manage"].map(group=>(<div key={group} style={{padding:"18px 0 4px"}}>
        <div style={{fontSize:10,fontWeight:700,color:C.sub,padding:"0 20px 6px",opacity:.7}}>{group}</div>
        {NAV.filter(n=>n.group===group).map(n=>(<div key={n.view} onClick={()=>setView(n.view)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 20px",fontSize:13,fontWeight:500,cursor:"pointer",borderLeft:`2px solid ${view===n.view?C.accent:"transparent"}`,color:view===n.view?C.text:C.dim,background:view===n.view?"rgba(56,139,253,0.08)":"transparent",transition:"all .12s"}}><span style={{fontSize:15,opacity:.8}}>{n.icon}</span>{n.label}</div>))}
      </div>))}
    </div>

    {/* Main */}
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
      <div style={{height:56,flexShrink:0,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 28px",background:C.surf}}>
        <div style={{fontSize:15,fontWeight:700}}>{NAV.find(n=>n.view===view)?.label||""}</div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{background:C.surf2,border:`1px solid ${C.border}`,borderRadius:20,padding:"5px 14px",fontFamily:"'DM Mono',monospace",fontSize:11,color:C.gold}}>🎯 {ne&&neD!==null?ne.name+" · "+neD+"d":"No exam set"}</div>
          <Btn variant="accent" size="sm" onClick={()=>setModal("quickadd")}>+ Add</Btn>
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"22px 28px 48px"}}>{views[view]}</div>
    </div>

    {/* Modals */}
    <Modal open={modal==="quickadd"} onClose={()=>setModal(null)} title="What would you like to add?" width={320}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {([["☑️","Theme",()=>{setModal(null);openTM();}],["📌","Topic",()=>{setModal(null);openPM(null);}],["📅","Session",()=>{setModal(null);openSchM();}],["🎯","Exam/Goal",()=>{setModal(null);openEM();}]] as [string,string,()=>void][]).map(([ico,lbl,fn])=>(<button key={lbl} onClick={fn} style={{background:"rgba(255,255,255,0.07)",border:`1px solid ${C.border}`,borderRadius:8,padding:"18px 8px",cursor:"pointer",color:C.text,display:"flex",flexDirection:"column",alignItems:"center",gap:6,fontSize:20,fontFamily:"'Inter',sans-serif"}}>{ico}<span style={{fontSize:11,color:C.sub}}>{lbl}</span></button>))}
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",marginTop:18}}><Btn variant="ghost" size="sm" onClick={()=>setModal(null)}>Close</Btn></div>
    </Modal>

    <Modal open={modal==="subject"} onClose={()=>setModal(null)} title={editSId?"Edit Subject":"Add Subject"}>
      <FGrp label="Subject name"><FInput value={smName} onChange={e=>setSmName(e.target.value)} placeholder="e.g. Pharmacology, Anatomy"/></FGrp>
      <FGrp label="Icon"><div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{ICONS.map(ic=><div key={ic} onClick={()=>setSmIcon(ic)} style={{width:32,height:32,borderRadius:7,border:`1px solid ${ic===smIcon?C.accent:C.border}`,background:ic===smIcon?"rgba(56,139,253,0.15)":"rgba(255,255,255,0.05)",fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{ic}</div>)}</div></FGrp>
      <FGrp label="Color"><div style={{display:"flex",gap:7,flexWrap:"wrap"}}>{PALETTE.map(c=><div key={c} onClick={()=>setSmColor(c)} style={{width:26,height:26,borderRadius:"50%",background:c,border:`2px solid ${c===smColor?"#fff":"transparent"}`,cursor:"pointer",transform:c===smColor?"scale(1.2)":"scale(1)",transition:"transform .12s"}}/>)}</div></FGrp>
      <FGrp label="Note (optional)"><FInput value={smNote} onChange={e=>setSmNote(e.target.value)} placeholder="e.g. USMLE Step 1, AMC MCQ"/></FGrp>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:22}}><Btn variant="ghost" onClick={()=>setModal(null)}>Cancel</Btn><Btn variant="accent" onClick={saveSubj}>Save</Btn></div>
    </Modal>

    <Modal open={modal==="theme"} onClose={()=>setModal(null)} title="Add Theme">
      <FGrp label="Subject"><FSelect value={thSubj} onChange={e=>setThSubj(e.target.value)}>{S.subjects.map(s=><option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}</FSelect></FGrp>
      <FGrp label="Theme name"><FInput value={thName} onChange={e=>setThName(e.target.value)} placeholder="e.g. Autonomic Pharmacology, Inflammation"/></FGrp>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:22}}><Btn variant="ghost" onClick={()=>setModal(null)}>Cancel</Btn><Btn variant="accent" onClick={addTheme}>Add</Btn></div>
    </Modal>

    <Modal open={modal==="topic"} onClose={()=>setModal(null)} title="Add Topic">
      <FGrp label="Theme"><FSelect value={tpTheme} onChange={e=>setTpTheme(e.target.value)}>{S.subjects.map(s=>{const ts=S.themes.filter(t=>t.subjectId===s.id);if(!ts.length)return null;return <optgroup key={s.id} label={s.icon+" "+s.name}>{ts.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>;})}</FSelect></FGrp>
      <FGrp label="Topic name"><FInput value={tpName} onChange={e=>setTpName(e.target.value)} placeholder="e.g. Beta-blocker mechanism, Gram stain"/></FGrp>
      <FGrp label="Initial mastery level"><FSelect value={tpLv} onChange={e=>setTpLv(parseInt(e.target.value) as 1|2|3)}><option value={1}>🔴 Not studied</option><option value={2}>🟡 Uncertain</option><option value={3}>🟢 Mastered</option></FSelect></FGrp>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:22}}><Btn variant="ghost" onClick={()=>setModal(null)}>Cancel</Btn><Btn variant="accent" onClick={addTopic}>Add</Btn></div>
    </Modal>

    <Modal open={modal==="schedule"} onClose={()=>setModal(null)} title="Add Study Session">
      <FGrp label="Subject"><FSelect value={scSubj} onChange={e=>setScSubj(e.target.value)}>{S.subjects.map(s=><option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}</FSelect></FGrp>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <FGrp label="Date"><FInput type="date" value={scDate} onChange={e=>setScDate(e.target.value)}/></FGrp>
        <FGrp label="Duration (min)"><FInput type="number" value={scDur} onChange={e=>setScDur(parseInt(e.target.value)||60)} min={10} step={10}/></FGrp>
      </div>
      <FGrp label="Notes (optional)"><FInput value={scNote} onChange={e=>setScNote(e.target.value)} placeholder="e.g. Past papers, Anki review"/></FGrp>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:22}}><Btn variant="ghost" onClick={()=>setModal(null)}>Cancel</Btn><Btn variant="accent" onClick={addSched}>Add</Btn></div>
    </Modal>

    <Modal open={modal==="exam"} onClose={()=>setModal(null)} title="Add Exam or Goal">
      <FGrp label="Type">
        <div style={{display:"flex",gap:8}}>
          {([["exam","🎯 Exam"],["goal","📌 Learning Goal"]] as [string,string][]).map(([key,lbl])=>(<div key={key} onClick={()=>setExType(key)} style={{flex:1,padding:"10px 0",borderRadius:8,textAlign:"center",fontSize:13,fontWeight:700,cursor:"pointer",border:`1px solid ${exType===key?C.accent:C.border}`,background:exType===key?"rgba(56,139,253,0.12)":"transparent",color:exType===key?C.accent:C.sub,transition:"all .15s"}}>{lbl}</div>))}
        </div>
      </FGrp>
      <FGrp label={exType==="exam"?"Exam name":"Goal name"}><FInput value={exName} onChange={e=>setExName(e.target.value)} placeholder={exType==="exam"?"e.g. USMLE Step 1, AMC CAT":"e.g. Complete Pathology review"}/></FGrp>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <FGrp label={exType==="exam"?"Exam date":"Target completion date"}><FInput type="date" value={exDate} onChange={e=>setExDate(e.target.value)}/></FGrp>
        <FGrp label="Subject (optional)"><FSelect value={exSubj} onChange={e=>setExSubj(e.target.value)}><option value="">None (general)</option>{S.subjects.map(s=><option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}</FSelect></FGrp>
      </div>
      <FGrp label="Notes (optional)"><FInput value={exNote} onChange={e=>setExNote(e.target.value)} placeholder={exType==="exam"?"e.g. Target score 240+":"e.g. Finish Pathoma + Sketchy"}/></FGrp>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:22}}><Btn variant="ghost" onClick={()=>setModal(null)}>Cancel</Btn><Btn variant="accent" onClick={addExam}>Add</Btn></div>
    </Modal>

    {confirmCfg&&(<div onClick={()=>setConfirmCfg(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",backdropFilter:"blur(3px)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}><div onClick={e=>e.stopPropagation()} style={{background:C.surf,border:`1px solid ${C.border2}`,borderRadius:14,padding:28,width:340,maxWidth:"92vw",boxShadow:"0 24px 64px rgba(0,0,0,0.6)"}}><div style={{fontSize:15,fontWeight:700,marginBottom:14}}>⚠️ Confirm</div><div style={{fontSize:13,color:C.dim,lineHeight:1.7,marginBottom:24,whiteSpace:"pre-wrap"}}>{confirmCfg.message}</div><div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><Btn variant="ghost" onClick={()=>setConfirmCfg(null)}>Cancel</Btn><button style={{background:C.danger,color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",fontWeight:700,fontSize:13,cursor:"pointer"}} onClick={()=>{confirmCfg.onOk();setConfirmCfg(null);}}>Delete</button></div></div></div>)}
    <Toast/>
  </div>);
}
