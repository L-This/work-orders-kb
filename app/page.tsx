'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

type Project = { id:string; name:string; contractor_name?:string; status?:string };
type GeneralItem = { item_id:string; item_name:string; category:string|null; unit:string|null; projects_count:number; sites_count:number; work_orders_count:number; total_quantity:number; total_executed_quantity:number; total_remaining_quantity:number; first_work_order_date:string|null; last_work_order_date:string|null };

export default function Home(){
  const [projects,setProjects]=useState<Project[]>([]);
  const [items,setItems]=useState<GeneralItem[]>([]);
  const [q,setQ]=useState('');
  const [loading,setLoading]=useState(true);

  useEffect(()=>{ load(); },[]);
  async function load(){
    if(!isSupabaseConfigured){ setLoading(false); return; }
    setLoading(true);
    const [{data:ps},{data:it}] = await Promise.all([
      supabase.from('projects').select('*').order('created_at',{ascending:false}),
      supabase.from('v_general_item_search').select('*').order('total_quantity',{ascending:false}).limit(100)
    ]);
    setProjects(ps||[]); setItems(it||[]); setLoading(false);
  }
  const filtered = useMemo(()=>{
    const s=q.trim(); if(!s) return items;
    return items.filter(x => `${x.item_name||''} ${x.category||''} ${x.unit||''}`.includes(s));
  },[items,q]);
  const totals = useMemo(()=>({
    projects: projects.length,
    items: items.length,
    sites: items.reduce((a,b)=>a+(Number(b.sites_count)||0),0),
    orders: items.reduce((a,b)=>a+(Number(b.work_orders_count)||0),0)
  }),[projects,items]);

  return <main className="page">
    {!isSupabaseConfigured && <div className="notice">لم يتم ربط Supabase بعد. أضف مفاتيح المشروع في ملف <b>.env.local</b>.</div>}
    <section className="hero">
      <div className="panel">
        <h2>نظام مرجعي لأوامر العمل والكميات وقصة كل موقع</h2>
        <p>هذه النسخة الأولى تربط قاعدة Supabase، وتعرض البحث العام، وتفتح صفحة لكل مشروع وموقع، وتحتوي على صفحة استيراد Excel من المتصفح.</p>
        <div className="toolbar">
          <Link className="btn primary" href="/import">استيراد ملف Excel</Link>
          <button className="btn" onClick={load}>تحديث البيانات</button>
        </div>
      </div>
      <div className="panel">
        <div className="stats">
          <div className="stat"><strong>{totals.projects}</strong><span>مشاريع</span></div>
          <div className="stat"><strong>{totals.items}</strong><span>بنود</span></div>
          <div className="stat"><strong>{totals.sites}</strong><span>ظهور مواقع</span></div>
          <div className="stat"><strong>{totals.orders}</strong><span>أوامر عمل</span></div>
        </div>
        <p className="muted">بعد استيراد ملف بريمان ستبدأ الأرقام والنتائج بالظهور هنا تلقائيًا.</p>
      </div>
    </section>

    <div className="section-title"><h3>المشاريع</h3></div>
    <div className="grid">
      {projects.map(p=><Link key={p.id} href={`/project/${p.id}`} className="card">
        <span className="badge">{p.status||'active'}</span>
        <h3>{p.name}</h3>
        <p className="muted">{p.contractor_name||'—'}</p>
      </Link>)}
      {!loading && projects.length===0 && <div className="card muted">لا توجد مشاريع. تأكد من تشغيل ملف SQL النهائي.</div>}
    </div>

    <div className="section-title"><h3>البحث العام بالبند</h3></div>
    <div className="toolbar"><input className="input" placeholder="ابحث عن بند مثل: شبكة ري، تربة زراعية، إنترلوك..." value={q} onChange={e=>setQ(e.target.value)} /></div>
    <div className="table-wrap">
      <table><thead><tr><th>البند</th><th>التصنيف</th><th>الوحدة</th><th>مشاريع</th><th>مواقع</th><th>أوامر</th><th>الكمية</th><th>المنفذ</th><th>المتبقي</th><th>الفترة</th></tr></thead>
      <tbody>{filtered.map(x=><tr key={x.item_id}><td><b>{x.item_name}</b></td><td>{x.category||'—'}</td><td>{x.unit||'—'}</td><td>{x.projects_count}</td><td>{x.sites_count}</td><td>{x.work_orders_count}</td><td>{Number(x.total_quantity||0).toLocaleString()}</td><td>{Number(x.total_executed_quantity||0).toLocaleString()}</td><td>{Number(x.total_remaining_quantity||0).toLocaleString()}</td><td>{x.first_work_order_date||'—'} إلى {x.last_work_order_date||'—'}</td></tr>)}</tbody></table>
    </div>
  </main>
}
