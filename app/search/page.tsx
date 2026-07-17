'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type SearchData = {
  query: string;
  total: number;
  projects: Array<{ id:string; name:string; code:string|null; municipality:string|null; contractor_name:string|null; status:string|null; sitesCount:number; ordersCount:number; itemsCount:number }>;
  workOrders: Array<{ id:string; project_id:string; work_order_number:string; title:string|null; status:string|null; contractor_name:string|null; work_order_date:string|null; work_order_end_date:string|null; project:{id:string;name:string}|null; sitesCount:number; itemsCount:number }>;
  sites: Array<{ id:string; project_id:string; name:string; site_code:string|null; area_name:string|null; status:string|null; project:{id:string;name:string}|null; ordersCount:number }>;
  items: Array<{ id:string; name:string; unit:string|null; category:string|null; is_active:boolean; projectsCount:number; ordersCount:number; contract:number; executed:number; remaining:number; value:number }>;
};

type ScopeKey = 'projects' | 'workOrders' | 'sites' | 'items';

const emptyData: SearchData = { query:'', total:0, projects:[], workOrders:[], sites:[], items:[] };
const number = (value:number) => new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 }).format(Number(value || 0));
const date = (value:string|null) => value ? new Intl.DateTimeFormat('ar-SA', { year:'numeric', month:'short', day:'numeric' }).format(new Date(`${value}T00:00:00`)) : 'غير محدد';

function Icon({ name }: { name:'search'|'project'|'order'|'site'|'item'|'clock'|'arrow'|'close' }) {
  const paths: Record<string, ReactNode> = {
    search:<><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    project:<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h6M7 16h8"/></>,
    order:<><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3V1h6v2M8 8h8M8 12h8M8 16h5"/></>,
    site:<><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    item:<><path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
    clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    arrow:<path d="m9 18 6-6-6-6"/>,
    close:<><path d="m7 7 10 10M17 7 7 17"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [data, setData] = useState<SearchData>(emptyData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scopes, setScopes] = useState<Record<ScopeKey, boolean>>({ projects:true, workOrders:true, sites:true, items:true });
  const [recent, setRecent] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    try { setRecent(JSON.parse(localStorage.getItem('work-orders-recent-searches') || '[]')); } catch { setRecent([]); }
  }, []);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) { setData(emptyData); setLoading(false); setError(''); return; }
    const id = ++requestId.current;
    const timer = window.setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(value)}`, { cache:'no-store' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'تعذر تنفيذ البحث.');
        if (id !== requestId.current) return;
        setData(payload as SearchData);
        const next = [value, ...recent.filter((item) => item !== value)].slice(0, 5);
        setRecent(next);
        localStorage.setItem('work-orders-recent-searches', JSON.stringify(next));
      } catch (searchError) {
        if (id === requestId.current) setError(searchError instanceof Error ? searchError.message : 'تعذر تنفيذ البحث.');
      } finally { if (id === requestId.current) setLoading(false); }
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query]);

  const visibleTotal = useMemo(() =>
    (scopes.projects ? data.projects.length : 0) +
    (scopes.workOrders ? data.workOrders.length : 0) +
    (scopes.sites ? data.sites.length : 0) +
    (scopes.items ? data.items.length : 0), [data, scopes]);

  function toggleScope(key: ScopeKey) { setScopes((current) => ({ ...current, [key]: !current[key] })); }
  function clearSearch() { setQuery(''); setData(emptyData); }

  return <div className="module-page global-search-page">
    <section className="global-search-hero">
      <span className="eyebrow">مركز التنقل والاستعلام</span>
      <h1>مركز البحث الشامل</h1>
      <p>ابحث عن أي مشروع أو أمر عمل أو موقع أو بند أو رقم، واستعرض العلاقات والنتائج من شاشة واحدة.</p>

      <div className="global-search-box-wrap">
        <div className="global-search-box">
          <Icon name="search" />
          <input value={query} onChange={(event)=>setQuery(event.target.value)} onFocus={()=>setFocused(true)} onBlur={()=>window.setTimeout(()=>setFocused(false),150)} placeholder="ابحث عن مشروع، أمر عمل، موقع، بند أو رقم..." autoFocus />
          {loading ? <span className="global-search-spinner" /> : query ? <button type="button" onClick={clearSearch} aria-label="مسح البحث"><Icon name="close" /></button> : <kbd>⌘ K</kbd>}
        </div>
        {focused && query.length < 2 && recent.length > 0 ? <div className="recent-search-panel">
          <strong><Icon name="clock" /> عمليات البحث الأخيرة</strong>
          {recent.map((item)=><button key={item} type="button" onMouseDown={()=>setQuery(item)}>{item}</button>)}
        </div> : null}
      </div>

      <div className="search-scope-row">
        {([
          ['projects','المشاريع','project'],['workOrders','أوامر العمل','order'],['sites','المواقع','site'],['items','البنود','item'],
        ] as Array<[ScopeKey,string,'project'|'order'|'site'|'item']>).map(([key,label,icon])=><button key={key} type="button" className={scopes[key]?'active':''} onClick={()=>toggleScope(key)}><Icon name={icon}/><span>{label}</span><b>{data[key].length}</b></button>)}
      </div>
    </section>

    {query.trim().length >= 2 ? <section className="search-overview-strip">
      <div><small>إجمالي النتائج</small><strong>{visibleTotal}</strong></div>
      <div><small>المشاريع</small><strong>{scopes.projects ? data.projects.length : 0}</strong></div>
      <div><small>أوامر العمل</small><strong>{scopes.workOrders ? data.workOrders.length : 0}</strong></div>
      <div><small>المواقع</small><strong>{scopes.sites ? data.sites.length : 0}</strong></div>
      <div><small>البنود</small><strong>{scopes.items ? data.items.length : 0}</strong></div>
    </section> : null}

    {error ? <div className="integration-message">{error}</div> : null}

    {!query.trim() ? <section className="search-start-state"><div className="search-start-icon"><Icon name="search"/></div><h2>ابدأ بكتابة ما تبحث عنه</h2><p>يمكنك البحث بالاسم أو الرقم أو الرمز أو المقاول أو البلدية أو حتى جزء من وصف البند.</p><div className="search-examples"><button onClick={()=>setQuery('الري')}>الري</button><button onClick={()=>setQuery('05')}>أمر 05</button><button onClick={()=>setQuery('SITE')}>SITE</button></div></section> : null}

    {query.trim().length === 1 ? <section className="search-start-state compact"><h2>اكتب حرفًا إضافيًا لبدء البحث</h2></section> : null}

    {query.trim().length >= 2 && !loading && visibleTotal === 0 && !error ? <section className="search-empty-state"><div><Icon name="search"/></div><h2>لم يتم العثور على نتائج مطابقة</h2><p>جرّب كلمة أخرى، رقمًا مختلفًا، أو فعّل نطاقات بحث إضافية.</p></section> : null}

    <div className="search-results-stack">
      {scopes.projects && data.projects.length ? <ResultSection title="المشاريع" icon="project" count={data.projects.length}>
        <div className="search-result-grid projects">
          {data.projects.map((row)=><article className="search-result-card project-result" key={row.id}><div className="result-card-icon"><Icon name="project"/></div><div className="result-card-body"><span className="result-type">مشروع</span><h3>{row.name}</h3><p>{[row.municipality,row.contractor_name].filter(Boolean).join(' · ') || 'لا توجد بيانات تعريفية إضافية'}</p><div className="result-metrics"><span><b>{row.sitesCount}</b> موقع</span><span><b>{row.ordersCount}</b> أمر</span><span><b>{row.itemsCount}</b> بند</span></div></div><Link href={`/project/${row.id}`}>فتح المشروع <Icon name="arrow"/></Link></article>)}
        </div>
      </ResultSection> : null}

      {scopes.workOrders && data.workOrders.length ? <ResultSection title="أوامر العمل" icon="order" count={data.workOrders.length}>
        <div className="search-result-grid orders">
          {data.workOrders.map((row)=><article className="search-result-card order-result" key={row.id}><div className="result-number">{row.work_order_number}</div><div className="result-card-body"><span className="result-type">أمر عمل</span><h3>{row.title || `أمر عمل رقم ${row.work_order_number}`}</h3><p>{row.project?.name || 'مشروع غير محدد'}</p><div className="result-meta"><span>{row.status || 'معتمد'}</span><span>{date(row.work_order_date)} — {date(row.work_order_end_date)}</span></div><div className="result-metrics"><span><b>{row.sitesCount}</b> موقع</span><span><b>{row.itemsCount}</b> بند</span></div></div><Link href={`/work-order/${row.id}`}>فتح الأمر <Icon name="arrow"/></Link></article>)}
        </div>
      </ResultSection> : null}

      {scopes.sites && data.sites.length ? <ResultSection title="المواقع" icon="site" count={data.sites.length}>
        <div className="search-result-grid sites">
          {data.sites.map((row)=><article className="search-result-card site-result" key={row.id}><div className="result-card-icon"><Icon name="site"/></div><div className="result-card-body"><span className="result-type">موقع {row.site_code ? `· ${row.site_code}` : ''}</span><h3>{row.name}</h3><p>{row.project?.name || 'مشروع غير محدد'}</p><div className="result-meta"><span>{row.area_name || 'النطاق غير مسجل'}</span><span>{row.status || 'نشط'}</span></div><div className="result-metrics"><span><b>{row.ordersCount}</b> أمر عمل مرتبط</span></div></div><Link href={`/site/${row.id}`}>فتح الموقع <Icon name="arrow"/></Link></article>)}
        </div>
      </ResultSection> : null}

      {scopes.items && data.items.length ? <ResultSection title="البنود" icon="item" count={data.items.length}>
        <div className="search-result-grid items">
          {data.items.map((row)=><article className="search-result-card item-result" key={row.id}><div className="result-card-icon"><Icon name="item"/></div><div className="result-card-body"><span className="result-type">بند · {row.category || 'غير مصنف'}</span><h3 title={row.name}>{row.name}</h3><p>الوحدة: {row.unit || 'غير مسجلة'}</p><div className="result-metrics"><span><b>{row.projectsCount}</b> مشروع</span><span><b>{row.ordersCount}</b> أمر</span><span><b>{number(row.remaining)}</b> متبقي</span></div><div className="item-search-progress"><span style={{width:`${row.contract > 0 ? Math.min(100,(row.executed/row.contract)*100) : 0}%`}}/></div></div><Link href={`/items?itemId=${row.id}`}>عرض البند <Icon name="arrow"/></Link></article>)}
        </div>
      </ResultSection> : null}
    </div>
  </div>;
}

function ResultSection({ title, icon, count, children }:{ title:string; icon:'project'|'order'|'site'|'item'; count:number; children:ReactNode }) {
  return <section className="search-result-section"><header><div className="section-title-icon"><Icon name={icon}/></div><div><span className="eyebrow">نتائج مطابقة</span><h2>{title}</h2></div><b>{count}</b></header>{children}</section>;
}
