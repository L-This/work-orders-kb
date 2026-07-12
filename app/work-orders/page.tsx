'use client';
import { parseDateOnly } from '@/lib/helpers';
import { useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

type Order={id:string;work_order_number:string;work_order_date:string|null;title:string|null;status:string|null;contractor_name:string|null;projects:{name:string}|null};
const date=(v:string|null)=>v?new Intl.DateTimeFormat('ar-SA',{year:'numeric',month:'short',day:'numeric'}).format(parseDateOnly(v)):'—';
export default function OrdersPage(){
 const [rows,setRows]=useState<Order[]>([]);const [q,setQ]=useState('');const [loading,setLoading]=useState(true);
 useEffect(()=>{if(!isSupabaseConfigured){setLoading(false);return;}supabase.from('work_orders').select('id,work_order_number,work_order_date,title,status,contractor_name,projects(name)').order('work_order_date',{ascending:false,nullsFirst:false}).then(({data})=>{setRows((data||[]) as unknown as Order[]);setLoading(false);});},[]);
 const filtered=useMemo(()=>rows.filter(r=>`${r.work_order_number} ${r.title||''} ${r.projects?.name||''} ${r.contractor_name||''}`.includes(q.trim())),[rows,q]);
 return <main className="page"><section className="page-heading"><span className="eyebrow">أوامر العمل</span><h1>السجل التاريخي لأوامر العمل</h1><p>بحث موحد برقم الأمر أو المشروع أو العنوان أو المقاول.</p></section><section className="section-block"><input className="search" placeholder="ابحث برقم أمر العمل أو اسم المشروع..." value={q} onChange={e=>setQ(e.target.value)}/><div className="table-wrap"><table><thead><tr><th>رقم الأمر</th><th>التاريخ</th><th>المشروع</th><th>العنوان</th><th>المقاول</th><th>الحالة</th></tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td><b>{r.work_order_number}</b></td><td>{date(r.work_order_date)}</td><td>{r.projects?.name||'—'}</td><td>{r.title||'—'}</td><td>{r.contractor_name||'—'}</td><td><span className="badge">{r.status||'approved'}</span></td></tr>)}</tbody></table></div>{!loading&&filtered.length===0&&<div className="empty">لا توجد أوامر عمل حتى الآن.</div>}</section></main>
}
