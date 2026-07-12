'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

type Site={site_id:string;site_name:string;project_name:string;work_orders_count:number;items_count:number;total_remaining_quantity:number;last_work_order_date:string|null};
const fmt=(v:unknown)=>Number(v||0).toLocaleString('ar-SA',{maximumFractionDigits:2});
export default function SitesPage(){
 const [rows,setRows]=useState<Site[]>([]);const [q,setQ]=useState('');const [loading,setLoading]=useState(true);
 useEffect(()=>{if(!isSupabaseConfigured){setLoading(false);return;}supabase.from('v_site_decision_summary').select('site_id,site_name,project_name,work_orders_count,items_count,total_remaining_quantity,last_work_order_date').order('site_name').then(({data})=>{setRows((data||[]) as Site[]);setLoading(false);});},[]);
 const filtered=useMemo(()=>rows.filter(r=>`${r.site_name} ${r.project_name}`.includes(q.trim())),[rows,q]);
 return <main className="page"><section className="page-heading"><span className="eyebrow">المواقع</span><h1>دليل المواقع وقصصها</h1><p>ابحث عن موقع وافتح تاريخه الكامل من بداية المشروع.</p></section><section className="section-block"><input className="search" placeholder="ابحث باسم الموقع أو المشروع..." value={q} onChange={e=>setQ(e.target.value)}/><div className="site-directory">{filtered.map(s=><Link href={`/site/${s.site_id}`} className="directory-row" key={s.site_id}><div><b>{s.site_name}</b><small>{s.project_name}</small></div><span><small>الأوامر</small><b>{s.work_orders_count}</b></span><span><small>البنود</small><b>{s.items_count}</b></span><span><small>المتبقي</small><b>{fmt(s.total_remaining_quantity)}</b></span><span className="open-arrow">←</span></Link>)}{!loading&&filtered.length===0&&<div className="empty">لا توجد مواقع حتى الآن.</div>}</div></section></main>
}
