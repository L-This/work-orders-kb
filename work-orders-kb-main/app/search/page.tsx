'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type ScopeKey='projects'|'workOrders'|'sites'|'items';
type Entity={id:string;name?:string;title?:string;work_order_number?:string};
type Result={type:ScopeKey;id:string;title:string;subtitle:string;href:string;score:number;matchKind:string;meta:string[];relations:{project?:Entity|null;site?:Entity|null;order?:Entity|null;item?:Entity|null;sites?:Entity[];orders?:Entity[];items?:Entity[]}};
type SearchData={query:string;total:number;elapsedMs:number;counts:Record<ScopeKey,number>;results:Result[]};
const empty:SearchData={query:'',total:0,elapsedMs:0,counts:{projects:0,workOrders:0,sites:0,items:0},results:[]};
const labels:Record<ScopeKey,string>={projects:'مشروع',workOrders:'أمر عمل',sites:'موقع',items:'بند'};
const plurals:Record<ScopeKey,string>={projects:'المشاريع',workOrders:'أوامر العمل',sites:'المواقع',items:'البنود'};
const icons:Record<ScopeKey,string>={projects:'▦',workOrders:'▤',sites:'⌖',items:'◇'};

function normalize(value:string){return value.normalize('NFKD').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').toLowerCase();}
function Highlight({text,query}:{text:string;query:string}){const n=normalize(text),q=normalize(query.trim()),i=n.indexOf(q);if(!q||i<0)return <>{text}</>;return <>{text.slice(0,i)}<mark>{text.slice(i,i+query.trim().length)}</mark>{text.slice(i+query.trim().length)}</>}

export default function SearchPage(){
 const [query,setQuery]=useState(''),[data,setData]=useState<SearchData>(empty),[loading,setLoading]=useState(false),[error,setError]=useState(''),[focused,setFocused]=useState(false);
 const [scopes,setScopes]=useState<Record<ScopeKey,boolean>>({projects:true,workOrders:true,sites:true,items:true});
 const [recent,setRecent]=useState<string[]>([]),[visible,setVisible]=useState(6); const requestId=useRef(0),inputRef=useRef<HTMLInputElement>(null);
 useEffect(()=>{try{setRecent(JSON.parse(localStorage.getItem('work-orders-recent-searches')||'[]'))}catch{}},[]);
 useEffect(()=>{const shortcut=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();inputRef.current?.focus()}};addEventListener('keydown',shortcut);return()=>removeEventListener('keydown',shortcut)},[]);
 useEffect(()=>{const value=query.trim();setVisible(6);if(value.length<2){requestId.current++;setData(empty);setLoading(false);setError('');return}const id=++requestId.current;const controller=new AbortController();const timer=setTimeout(async()=>{setLoading(true);setError('');try{const response=await fetch(`/api/search?q=${encodeURIComponent(value)}`,{cache:'no-store',signal:controller.signal});const payload=await response.json();if(!response.ok)throw new Error(payload.error||'تعذر تنفيذ البحث.');if(id===requestId.current)setData(payload)}catch(e){if(id===requestId.current&&!(e instanceof DOMException&&e.name==='AbortError'))setError(e instanceof Error?e.message:'تعذر تنفيذ البحث.')}finally{if(id===requestId.current)setLoading(false)}},250);return()=>{clearTimeout(timer);controller.abort()}},[query]);
 const filtered=useMemo(()=>data.results.filter(r=>scopes[r.type]),[data,scopes]); const shown=filtered.slice(0,visible);
 const suggestions=useMemo(()=>data.results.slice(0,6),[data]);
 function selectSearch(value:string){setQuery(value);setFocused(false);const next=[value,...recent.filter(x=>x!==value)].slice(0,10);setRecent(next);localStorage.setItem('work-orders-recent-searches',JSON.stringify(next))}
 function clearHistory(){setRecent([]);localStorage.removeItem('work-orders-recent-searches')}
 return <div className="module-page global-search-page">
  <section className="global-search-hero"><span className="eyebrow">مركز التنقل والاستعلام</span><h1>مركز البحث الشامل</h1><p>ابحث في قاعدة المعرفة كاملة، وشاهد النتائج وعلاقاتها مرتبة حسب قوة المطابقة.</p>
   <div className="global-search-box-wrap"><div className="global-search-box"><span className="search-glyph">⌕</span><input ref={inputRef} value={query} onChange={e=>setQuery(e.target.value)} onFocus={()=>setFocused(true)} onBlur={()=>setTimeout(()=>setFocused(false),180)} placeholder="ابحث عن مشروع، أمر عمل، موقع، بند أو رقم..." autoFocus/>{loading?<span className="global-search-spinner"/>:query?<button onClick={()=>setQuery('')} aria-label="مسح">×</button>:<kbd>Ctrl K</kbd>}</div>
    {focused&&query.trim().length>=2&&suggestions.length>0?<div className="search-suggestion-panel"><strong>اقتراحات البحث</strong>{suggestions.map(r=><button key={`${r.type}-${r.id}`} onMouseDown={()=>selectSearch(r.title)}><i>{icons[r.type]}</i><span><b><Highlight text={r.title} query={query}/></b><small>{labels[r.type]}</small></span></button>)}</div>:null}
    {focused&&query.trim().length<2&&recent.length>0?<div className="recent-search-panel"><div className="recent-head"><strong>آخر عمليات البحث</strong><button onMouseDown={clearHistory}>مسح السجل</button></div>{recent.map(x=><button key={x} onMouseDown={()=>selectSearch(x)}>↶ <span>{x}</span></button>)}</div>:null}
   </div>
   <div className="search-scope-row">{(Object.keys(scopes) as ScopeKey[]).map(key=><button key={key} className={scopes[key]?'active':''} onClick={()=>setScopes(s=>({...s,[key]:!s[key]}))}><span>{icons[key]}</span><span>{plurals[key]}</span><b>{data.counts[key]}</b></button>)}</div>
  </section>
  {query.trim().length>=2?<section className="search-summary-bar"><div><span>تم العثور على</span><strong>{filtered.length} نتيجة</strong></div><div><span>زمن البحث</span><strong>{data.elapsedMs}ms</strong></div><div className="match-legend"><i/> مطابقة تامة <i/> بداية الاسم <i/> ضمن الاسم <i/> التفاصيل</div></section>:null}
  {error?<div className="integration-message">{error}</div>:null}
  {!query.trim()?<section className="search-start-state"><div className="search-start-icon">⌕</div><h2>كل معلومة على بُعد بحث واحد</h2><p>اكتب اسمًا أو رقمًا أو رمزًا، وستظهر النتائج وعلاقاتها في قائمة واحدة.</p><div className="search-examples"><button onClick={()=>selectSearch('الري')}>الري</button><button onClick={()=>selectSearch('05')}>أمر 05</button><button onClick={()=>selectSearch('SITE')}>SITE</button></div></section>:null}
  {query.trim().length===1?<section className="search-start-state compact"><h2>اكتب حرفًا إضافيًا لبدء البحث</h2></section>:null}
  {query.trim().length>=2&&!loading&&!filtered.length&&!error?<section className="search-empty-state"><div>⌕</div><h2>لا توجد نتائج مطابقة</h2><p>جرّب كلمة أو رقمًا مختلفًا، أو فعّل نطاقات إضافية.</p></section>:null}
  {shown.length?<section className="unified-results"><header><div><span className="eyebrow">مرتبة حسب قوة المطابقة</span><h2>النتائج</h2></div><b>{filtered.length}</b></header><div className="unified-results-list">{shown.map((r,index)=><ResultCard key={`${r.type}-${r.id}`} result={r} query={query} index={index}/>)}</div>{visible<filtered.length?<button className="show-more-results" onClick={()=>setVisible(v=>v+12)}>عرض المزيد <span>({filtered.length-visible} نتيجة)</span></button>:null}</section>:null}
 </div>
}

function ResultCard({result:r,query,index}:{result:Result;query:string;index:number}){const relationRows=[r.relations.project&&{type:'projects' as ScopeKey,label:r.relations.project.name||'المشروع',href:`/project/${r.relations.project.id}`},r.relations.site&&{type:'sites' as ScopeKey,label:r.relations.site.name||'الموقع',href:`/site/${r.relations.site.id}`},r.relations.order&&{type:'workOrders' as ScopeKey,label:r.relations.order.title||`أمر ${r.relations.order.work_order_number}`,href:`/work-order/${r.relations.order.id}`},r.relations.item&&{type:'items' as ScopeKey,label:r.relations.item.name||'البند',href:`/items?itemId=${r.relations.item.id}`}].filter(Boolean) as Array<{type:ScopeKey;label:string;href:string}>;
 const extras=[...(r.relations.sites||[]).map(x=>({type:'sites' as ScopeKey,label:x.name||'موقع',href:`/site/${x.id}`})),...(r.relations.orders||[]).map(x=>({type:'workOrders' as ScopeKey,label:x.title||`أمر ${x.work_order_number}`,href:`/work-order/${x.id}`})),...(r.relations.items||[]).map(x=>({type:'items' as ScopeKey,label:x.name||'بند',href:`/items?itemId=${x.id}`}))];
 const links=[...relationRows,...extras].filter(x=>x.href!==r.href).filter((x,i,a)=>a.findIndex(y=>y.href===x.href)===i).slice(0,4);
 return <article className={`unified-result-card rank-${Math.floor(r.score/100)}`}><div className="unified-rank">{index+1}</div><div className="unified-type-icon">{icons[r.type]}</div><div className="unified-main"><div className="result-label-row"><span className={`entity-badge ${r.type}`}>{labels[r.type]}</span><span className="match-badge">{r.matchKind}</span></div><h3><Highlight text={r.title} query={query}/></h3><p><Highlight text={r.subtitle||'لا توجد بيانات إضافية'} query={query}/></p><div className="result-meta">{r.meta.map((x,i)=><span key={i}><Highlight text={String(x)} query={query}/></span>)}</div>{links.length?<div className="smart-relation"><small>العلاقات الذكية</small><div>{links.map((x,i)=><Fragment key={x.href}>{i>0?<span className="relation-arrow">←</span>:null}<Link href={x.href}><i>{icons[x.type]}</i>{x.label}</Link></Fragment>)}</div></div>:null}</div><div className="result-quick-actions"><Link className="primary" href={r.href}>فتح {labels[r.type]}</Link>{links.filter(x=>x.href!==r.href).slice(0,2).map(x=><Link key={x.href} href={x.href}>فتح {labels[x.type]}</Link>)}</div></article>}
