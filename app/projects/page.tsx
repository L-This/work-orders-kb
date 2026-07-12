'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

type Project = { id:string; name:string; code:string|null; municipality:string|null; contractor_name:string|null; status:string|null; description:string|null };

export default function ProjectsPage(){
  const [rows,setRows]=useState<Project[]>([]); const [q,setQ]=useState(''); const [loading,setLoading]=useState(true);
  useEffect(()=>{ if(!isSupabaseConfigured){setLoading(false);return;} supabase.from('projects').select('*').order('name').then(({data})=>{setRows((data||[]) as Project[]);setLoading(false);}); },[]);
  const filtered=useMemo(()=>rows.filter(r=>`${r.name} ${r.code||''} ${r.contractor_name||''} ${r.municipality||''}`.includes(q.trim())),[rows,q]);
  return <main className="page"><section className="page-heading"><span className="eyebrow">المشاريع</span><h1>بوابة كافة المشاريع</h1><p>اختر مشروعًا لعرض المواقع والبنود وأوامر العمل الخاصة به.</p></section><section className="section-block"><input className="search" placeholder="ابحث باسم المشروع أو المقاول..." value={q} onChange={e=>setQ(e.target.value)}/><div className="project-grid list-grid">{filtered.map(p=><Link href={`/project/${p.id}`} className="project-card rich-project-card" key={p.id}><span className="badge">{p.status||'active'}</span><h3>{p.name}</h3><p>{p.contractor_name||p.municipality||p.description||'بدون بيانات إضافية'}</p><span className="card-action">فتح المشروع ←</span></Link>)}{!loading&&filtered.length===0&&<div className="empty">لا توجد نتائج.</div>}</div></section></main>
}
