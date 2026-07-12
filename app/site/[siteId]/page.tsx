'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

type Site = { id:string; name:string; area_name?:string|null; project_id:string };
type Project = { id:string; name?:string|null };
type Order = { id:string; work_order_number:string; work_order_date?:string|null; title?:string|null; status?:string|null; notes?:string|null };
type Line = { id:string; work_order_id:string; item_id:string; item_no?:string|null; unit?:string|null; quantity?:number|string|null; executed_quantity?:number|string|null; remaining_quantity?:number|string|null; total_price?:number|string|null; notes?:string|null };
type Item = { id:string; name:string; category?:string|null };

const num = (v:any) => Number(v || 0) || 0;
const fmt = (v:any) => num(v).toLocaleString('ar-SA', { maximumFractionDigits: 2 });

export default function SitePage({ params }: { params: { siteId: string } }) {
  const [site,setSite]=useState<Site|null>(null);
  const [project,setProject]=useState<Project|null>(null);
  const [orders,setOrders]=useState<Order[]>([]);
  const [lines,setLines]=useState<Line[]>([]);
  const [items,setItems]=useState<Item[]>([]);
  const [orderSiteCounts,setOrderSiteCounts]=useState<Record<string,number>>({});
  const [q,setQ]=useState('');
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState('');

  useEffect(()=>{ load(); },[]);

  async function load(){
    if(!isSupabaseConfigured) return;
    setLoading(true); setMessage('');
    const siteResult = await supabase.from('sites').select('id,name,area_name,project_id').eq('id',params.siteId).single();
    if(siteResult.error){ setMessage(siteResult.error.message); setLoading(false); return; }
    const loadedSite = siteResult.data as Site;
    setSite(loadedSite);

    const [projectResult, relationResult] = await Promise.all([
      supabase.from('projects').select('id,name').eq('id',loadedSite.project_id).single(),
      supabase.from('work_order_sites').select('work_order_id').eq('site_id',params.siteId),
    ]);
    if(projectResult.error || relationResult.error){ setMessage(projectResult.error?.message || relationResult.error?.message || 'تعذر تحميل قصة الموقع.'); setLoading(false); return; }
    setProject(projectResult.data as Project);
    const orderIds = [...new Set((relationResult.data||[]).map((x:any)=>x.work_order_id))];
    if(!orderIds.length){ setOrders([]); setLines([]); setItems([]); setLoading(false); return; }

    const [ordersResult, linesResult, allOrderSitesResult] = await Promise.all([
      supabase.from('work_orders').select('id,work_order_number,work_order_date,title,status,notes').in('id',orderIds).order('work_order_date',{ascending:false}),
      supabase.from('work_order_items').select('id,work_order_id,item_id,item_no,unit,quantity,executed_quantity,remaining_quantity,total_price,notes').in('work_order_id',orderIds),
      supabase.from('work_order_sites').select('work_order_id,site_id').in('work_order_id',orderIds),
    ]);
    if(ordersResult.error || linesResult.error || allOrderSitesResult.error){ setMessage(ordersResult.error?.message || linesResult.error?.message || allOrderSitesResult.error?.message || 'تعذر تحميل أوامر العمل.'); setLoading(false); return; }
    const siteCountMap: Record<string,number> = {};
    for (const row of allOrderSitesResult.data || []) {
      const orderId = (row as any).work_order_id as string;
      siteCountMap[orderId] = (siteCountMap[orderId] || 0) + 1;
    }
    setOrderSiteCounts(siteCountMap);
    const loadedLines = (linesResult.data||[]) as Line[];
    const itemIds = [...new Set(loadedLines.map(x=>x.item_id).filter(Boolean))];
    let loadedItems:Item[]=[];
    if(itemIds.length){
      const itemResult = await supabase.from('items').select('id,name,category').in('id',itemIds);
      if(itemResult.error){ setMessage(itemResult.error.message); setLoading(false); return; }
      loadedItems=(itemResult.data||[]) as Item[];
    }
    setOrders((ordersResult.data||[]) as Order[]); setLines(loadedLines); setItems(loadedItems); setLoading(false);
  }

  const itemMap = useMemo(()=>new Map(items.map(i=>[i.id,i])),[items]);
  const linesByOrder = useMemo(()=>{ const m=new Map<string,Line[]>(); for(const l of lines){ if(!m.has(l.work_order_id))m.set(l.work_order_id,[]); m.get(l.work_order_id)!.push(l); } return m; },[lines]);
  const filteredOrders = useMemo(()=>orders.filter(o=>{ if(!q)return true; const hay=[o.work_order_number,o.work_order_date,...(linesByOrder.get(o.id)||[]).map(l=>itemMap.get(l.item_id)?.name||'')].join(' '); return hay.includes(q); }),[orders,q,linesByOrder,itemMap]);
  const cumulative = useMemo(()=>{ const m=new Map<string,{name:string;unit:string;orders:Set<string>;executed:number;latestRemaining:number}>(); const orderDate=new Map(orders.map(o=>[o.id,o.work_order_date||''])); for(const l of lines){ const key=l.item_id; const name=itemMap.get(key)?.name||`بند ${l.item_no||''}`; if(!m.has(key))m.set(key,{name,unit:l.unit||'—',orders:new Set(),executed:0,latestRemaining:0}); const x=m.get(key)!; x.orders.add(l.work_order_id); x.executed+=num(l.executed_quantity ?? l.quantity); const current=(lines.filter(z=>z.item_id===key).sort((a,b)=>(orderDate.get(b.work_order_id)||'').localeCompare(orderDate.get(a.work_order_id)||''))[0]); x.latestRemaining=num(current?.remaining_quantity); } return [...m.values()].sort((a,b)=>b.executed-a.executed); },[lines,orders,itemMap]);
  const firstDate=[...orders].map(o=>o.work_order_date).filter(Boolean).sort()[0]||'—';
  const lastDate=[...orders].map(o=>o.work_order_date).filter(Boolean).sort().at(-1)||'—';
  const multiSiteOrders=orders.filter(o=>(orderSiteCounts[o.id]||0)>1).length;

  return <main className="page site-story-page">
    <div className="section-title">
      <div><span className="eyebrow">قصة الموقع</span><h2>{site?.name || 'الموقع'}</h2><p className="muted">{project?.name || ''}{site?.area_name ? ` · ${site.area_name}` : ''}</p></div>
      <div className="actions"><Link href={site?.project_id ? `/project/${site.project_id}` : '/projects'} className="btn">رجوع للمشروع</Link><button className="btn" onClick={load} disabled={loading}>{loading?'جاري التحديث...':'تحديث'}</button></div>
    </div>
    {message && <div className="notice error-notice">{message}</div>}

    <div className="stats site-story-stats">
      <div className="stat"><strong>{orders.length}</strong><span>أوامر عمل مرتبطة</span></div>
      <div className="stat"><strong>{cumulative.length}</strong><span>بنود مختلفة</span></div>
      <div className="stat"><strong>{multiSiteOrders}</strong><span>أوامر تشمل أكثر من موقع</span></div>
      <div className="stat"><strong>{firstDate}</strong><span>أول أمر عمل</span></div>
      <div className="stat"><strong>{lastDate}</strong><span>آخر أمر عمل</span></div>
    </div>

    <div className="notice site-story-note"><b>تنبيه دقة البيانات:</b> هذه الصفحة تثبت أن الموقع ورد ضمن أمر العمل. أما الكميات المعروضة فهي <b>كميات أمر العمل كاملة لجميع المواقع المرتبطة به</b>، ولا تمثل كمية منفذة داخل هذا الموقع بعينه إلا إذا كان أمر العمل مرتبطًا بموقع واحد فقط.</div>

    <div className="toolbar"><input className="input" value={q} onChange={e=>setQ(e.target.value)} placeholder="ابحث في قصة الموقع: رقم أمر، تاريخ، أو اسم بند" /></div>

    <section className="panel site-story-section">
      <div className="section-title"><div><span className="section-kicker">التسلسل الزمني</span><h2>رحلة أوامر العمل</h2></div><span>{filteredOrders.length} أمر</span></div>
      <div className="story-timeline">
        {filteredOrders.map((o,index)=>{ const orderLines=linesByOrder.get(o.id)||[]; const executed=orderLines.reduce((s,l)=>s+num(l.executed_quantity ?? l.quantity),0); return <article className="story-order" key={o.id}>
          <div className="story-marker">{String(filteredOrders.length-index).padStart(2,'0')}</div>
          <div className="story-order-card">
            <div className="story-order-head"><div><span className="badge">أمر عمل {o.work_order_number}</span><h3>{o.work_order_date || 'تاريخ غير مسجل'}</h3><p className="muted">{o.title || ''}{o.status ? ` · ${o.status}` : ''}</p></div><div className="story-order-total"><small>إجمالي كميات الأمر لجميع المواقع</small><b>{fmt(executed)}</b><span>{orderLines.length} بند · مرتبط بـ {orderSiteCounts[o.id] || 1} موقع</span></div></div>
            <div className="story-lines">{orderLines.map(l=><div className="story-line" key={l.id}><div><b>{itemMap.get(l.item_id)?.name || `بند ${l.item_no||''}`}</b><small>{l.unit || 'بدون وحدة'}</small></div><span><small>كمية منفذة في أمر العمل</small><b>{fmt(l.executed_quantity ?? l.quantity)}</b></span><span><small>المتبقي في رصيد البند بعد الأمر</small><b>{fmt(l.remaining_quantity)}</b></span></div>)}</div>
          </div>
        </article>})}
        {!filteredOrders.length && <div className="empty">لا توجد أوامر عمل مطابقة.</div>}
      </div>
    </section>

    <section className="panel site-story-section">
      <div className="notice site-story-note compact-note">الأرقام في هذا الجدول تخص أوامر العمل التي ورد فيها الموقع، وليست توزيعًا للكميات على الموقع نفسه.</div>
      <div className="section-title"><div><span className="section-kicker">مرجع ارتباط الموقع</span><h2>بنود أوامر العمل التي شملت الموقع</h2></div><span>{cumulative.length} بند</span></div>
      <div className="table-wrap"><table><thead><tr><th>البند</th><th>الوحدة</th><th>عدد أوامر العمل</th><th>إجمالي كميات الأوامر المرتبطة</th><th>آخر متبقٍ في رصيد البند</th></tr></thead><tbody>{cumulative.map((x,i)=><tr key={i}><td><b>{x.name}</b></td><td>{x.unit}</td><td>{x.orders.size}</td><td>{fmt(x.executed)}</td><td>{fmt(x.latestRemaining)}</td></tr>)}</tbody></table></div>
    </section>
  </main>;
}
