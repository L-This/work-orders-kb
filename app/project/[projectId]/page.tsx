'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export default function ProjectPage({ params }: { params: { projectId: string } }){
  const [project,setProject]=useState<any>(null);
  const [sites,setSites]=useState<any[]>([]);
  const [items,setItems]=useState<any[]>([]);
  const [q,setQ]=useState('');
  useEffect(()=>{ load(); },[]);
  async function load(){
    if(!isSupabaseConfigured) return;
    const [{data:p},{data:s},{data:i}] = await Promise.all([
      supabase.from('projects').select('*').eq('id',params.projectId).single(),
      supabase.from('sites').select('*').eq('project_id',params.projectId).order('name'),
      supabase.from('v_project_item_search').select('*').eq('project_id',params.projectId).order('total_quantity',{ascending:false})
    ]);
    setProject(p); setSites(s||[]); setItems(i||[]);
  }
  const filteredSites = useMemo(()=> sites.filter(s=>!q || s.name.includes(q)),[sites,q]);
  const filteredItems = useMemo(()=> items.filter(i=>!q || `${i.item_name} ${i.category||''}`.includes(q)),[items,q]);
  return <main className="page">
    <Link href="/" className="btn">رجوع للرئيسية</Link>
    <div className="section-title"><h3>{project?.name || 'المشروع'}</h3><button className="btn" onClick={load}>تحديث</button></div>
    <div className="stats">
      <div className="stat"><strong>{sites.length}</strong><span>مواقع</span></div>
      <div className="stat"><strong>{items.length}</strong><span>بنود منفذة</span></div>
      <div className="stat"><strong>{items.reduce((a,b)=>a+(Number(b.work_orders_count)||0),0)}</strong><span>أوامر عمل</span></div>
      <div className="stat"><strong>{items.reduce((a,b)=>a+(Number(b.total_remaining_quantity)||0),0).toLocaleString()}</strong><span>إجمالي متبقي</span></div>
    </div>
    <div className="toolbar"><input className="input" value={q} onChange={e=>setQ(e.target.value)} placeholder="بحث داخل المشروع: موقع أو بند" /></div>
    <div className="two-col">
      <section className="panel"><h3>المواقع</h3>{filteredSites.map(s=><Link key={s.id} className="card" style={{display:'block',marginBottom:10}} href={`/site/${s.id}`}>{s.name}<p className="muted">{s.area_name||'صفحة قصة الموقع'}</p></Link>)}</section>
      <section className="panel"><h3>البنود داخل المشروع</h3><div className="table-wrap"><table><thead><tr><th>البند</th><th>مواقع</th><th>أوامر</th><th>الكمية</th><th>المنفذ</th><th>المتبقي</th></tr></thead><tbody>{filteredItems.map(x=><tr key={x.item_id}><td><b>{x.item_name}</b></td><td>{x.sites_count}</td><td>{x.work_orders_count}</td><td>{Number(x.total_quantity||0).toLocaleString()}</td><td>{Number(x.total_executed_quantity||0).toLocaleString()}</td><td>{Number(x.total_remaining_quantity||0).toLocaleString()}</td></tr>)}</tbody></table></div></section>
    </div>
  </main>
}
