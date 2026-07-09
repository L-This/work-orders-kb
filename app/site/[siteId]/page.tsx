'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export default function SitePage({ params }: { params: { siteId: string } }){
  const [summary,setSummary]=useState<any>(null);
  const [timeline,setTimeline]=useState<any[]>([]);
  const [notes,setNotes]=useState<any[]>([]);
  const [q,setQ]=useState('');
  useEffect(()=>{ load(); },[]);
  async function load(){
    if(!isSupabaseConfigured) return;
    const [{data:sum},{data:tl},{data:ns}] = await Promise.all([
      supabase.from('v_site_decision_summary').select('*').eq('site_id',params.siteId).single(),
      supabase.from('v_site_item_timeline').select('*').eq('site_id',params.siteId).order('work_order_date',{ascending:false}),
      supabase.from('site_notes').select('*').eq('site_id',params.siteId).order('note_date',{ascending:false})
    ]);
    setSummary(sum); setTimeline(tl||[]); setNotes(ns||[]);
  }
  const filtered = useMemo(()=>timeline.filter(x=>!q || `${x.item_name} ${x.work_order_number}`.includes(q)),[timeline,q]);
  return <main className="page">
    <Link href="/" className="btn">الرئيسية</Link>
    <div className="section-title"><h3>{summary?.site_name || 'صفحة الموقع'}</h3><button className="btn" onClick={load}>تحديث</button></div>
    <div className="grid">
      <div className="card"><span className="badge">المشروع</span><h3>{summary?.project_name||'—'}</h3></div>
      <div className="card"><span className="badge">أول أمر</span><h3>{summary?.first_work_order_date||'—'}</h3></div>
      <div className="card"><span className="badge">آخر أمر</span><h3>{summary?.last_work_order_date||'—'}</h3></div>
      <div className="card"><span className="badge">المتبقي</span><h3>{Number(summary?.total_remaining_quantity||0).toLocaleString()}</h3></div>
    </div>
    <section className="panel" style={{marginTop:18}}><h3>قرار إصدار أمر عمل</h3><p>{summary?.decision_notes || 'لا توجد ملاحظات قرار بعد. بعد استيراد البيانات ستظهر هنا مؤشرات أول وآخر أمر عمل والكميات المتبقية.'}</p><p className="muted">{summary?.site_description || summary?.permanent_notes || ''}</p></section>
    <div className="toolbar"><input className="input" value={q} onChange={e=>setQ(e.target.value)} placeholder="بحث داخل هذا الموقع: بند أو رقم أمر عمل" /></div>
    <div className="two-col">
      <section className="panel"><h3>قصة الموقع</h3><div className="timeline">{notes.map(n=><div key={n.id} className="timeline-item"><b>{n.note_date} - {n.title||n.note_type}</b><p>{n.body}</p></div>)}{notes.length===0 && <p className="muted">لا توجد ملاحظات بعد.</p>}</div></section>
      <section className="panel"><h3>سجل البنود وأوامر العمل</h3><div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>أمر العمل</th><th>البند</th><th>الوحدة</th><th>الكمية</th><th>المنفذ</th><th>المتبقي</th></tr></thead><tbody>{filtered.map((x,idx)=><tr key={idx}><td>{x.work_order_date||'—'}</td><td>{x.work_order_number}</td><td><b>{x.item_name}</b></td><td>{x.unit||'—'}</td><td>{Number(x.quantity||0).toLocaleString()}</td><td>{Number(x.executed_quantity||0).toLocaleString()}</td><td>{Number(x.remaining_quantity||0).toLocaleString()}</td></tr>)}</tbody></table></div></section>
    </div>
  </main>
}
