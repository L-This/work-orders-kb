'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

type Project = { id:string; name:string; contractor_name?:string; status?:string; municipality?:string };
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
      supabase.from('v_general_item_search').select('*').order('total_remaining_quantity',{ascending:false}).limit(250)
    ]);
    setProjects(ps||[]); setItems(it||[]); setLoading(false);
  }

  const filtered = useMemo(()=>{
    const s=q.trim();
    if(!s) return items;
    return items.filter(x => `${x.item_name||''} ${x.category||''} ${x.unit||''}`.includes(s));
  },[items,q]);

  const totals = useMemo(()=>({
    projects: projects.length,
    items: items.length,
    sites: items.reduce((a,b)=>a+(Number(b.sites_count)||0),0),
    orders: items.reduce((a,b)=>a+(Number(b.work_orders_count)||0),0),
    remaining: items.reduce((a,b)=>a+(Number(b.total_remaining_quantity)||0),0),
  }),[projects,items]);

  return <main className="page">
    {!isSupabaseConfigured && <div className="notice">لم يتم ربط Supabase بعد. أضف متغيرات البيئة في Vercel: <b>NEXT_PUBLIC_SUPABASE_URL</b> و <b>NEXT_PUBLIC_SUPABASE_ANON_KEY</b>.</div>}

    <section className="hero">
      <div className="hero-content">
        <span className="eyebrow">V1 · واجهة النظام الأساسية</span>
        <h1>قاعدة معرفة لأوامر العمل من أول المشروع إلى آخر أمر</h1>
        <p>بحث عام، بحث داخل المشروع، بحث داخل الموقع، وقصة كاملة لكل موقع مع الكميات والبنود والمتبقي.</p>
        <div className="actions">
          <Link className="btn primary" href="/import">استيراد ملف Excel</Link>
          <button className="btn" onClick={load}>تحديث البيانات</button>
        </div>
      </div>
      <div className="hero-card">
        <strong>قرار إصدار أمر عمل</strong>
        <p>الهدف أن يختصر لك النظام تاريخ الموقع: آخر أمر، البنود السابقة، الكميات، والمتبقي قبل إصدار أي أمر جديد.</p>
      </div>
    </section>

    <section className="stats-grid">
      <div className="stat"><small>المشاريع</small><strong>{totals.projects}</strong></div>
      <div className="stat"><small>البنود</small><strong>{totals.items}</strong></div>
      <div className="stat"><small>ظهور المواقع</small><strong>{totals.sites}</strong></div>
      <div className="stat"><small>أوامر العمل</small><strong>{totals.orders}</strong></div>
      <div className="stat wide"><small>إجمالي المتبقي</small><strong>{totals.remaining.toLocaleString()}</strong></div>
    </section>

    <section className="section-block">
      <div className="section-title"><h2>المشاريع</h2><span>{loading ? 'جاري التحميل...' : `${projects.length} مشروع`}</span></div>
      <div className="project-grid">
        {projects.map(p=><Link key={p.id} href={`/project/${p.id}`} className="project-card">
          <span className="badge">{p.status || 'active'}</span>
          <h3>{p.name}</h3>
          <p>{p.contractor_name || p.municipality || 'بدون بيانات إضافية'}</p>
        </Link>)}
        {!loading && projects.length===0 && <div className="empty">لا توجد مشاريع ظاهرة. تأكد من تشغيل SQL النهائي وربط Supabase.</div>}
      </div>
    </section>

    <section className="section-block">
      <div className="section-title"><h2>البحث العام بالبند</h2><span>كل المشاريع</span></div>
      <input className="search" placeholder="ابحث عن بند: شبكة ري، تربة زراعية، إنترلوك..." value={q} onChange={e=>setQ(e.target.value)} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>البند</th><th>الوحدة</th><th>مشاريع</th><th>مواقع</th><th>أوامر</th><th>الكمية</th><th>المنفذ</th><th>المتبقي</th><th>الفترة</th></tr></thead>
          <tbody>{filtered.map(x=><tr key={x.item_id}>
            <td><b>{x.item_name}</b><small>{x.category || ''}</small></td>
            <td>{x.unit || '—'}</td><td>{x.projects_count}</td><td>{x.sites_count}</td><td>{x.work_orders_count}</td>
            <td>{Number(x.total_quantity||0).toLocaleString()}</td>
            <td>{Number(x.total_executed_quantity||0).toLocaleString()}</td>
            <td><b>{Number(x.total_remaining_quantity||0).toLocaleString()}</b></td>
            <td>{x.first_work_order_date || '—'} إلى {x.last_work_order_date || '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  </main>
}
