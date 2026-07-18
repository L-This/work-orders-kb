'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

type ProjectRow = { id: string; name?: string | null };
type SiteRow = { id: string; name: string; area_name?: string | null };
type ProjectItemRow = {
  item_id: string;
  item_name: string;
  category?: string | null;
  total_quantity?: number | string | null;
  total_executed_quantity?: number | string | null;
  total_remaining_quantity?: number | string | null;
  sites_count?: number | string | null;
  work_orders_count?: number | string | null;
};
type WorkOrderRow = { id: string; work_order_number?: string | null; title?: string | null; status?: string | null; work_order_date?: string | null };
type WorkOrderItemRow = { work_order_id: string; item_id: string };
type WorkOrderSiteRow = { work_order_id: string; site_id: string };

export default function ProjectPage({ params }: { params: { projectId: string } }) {
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [items, setItems] = useState<ProjectItemRow[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderRow[]>([]);
  const [workOrderItems, setWorkOrderItems] = useState<WorkOrderItemRow[]>([]);
  const [workOrderSites, setWorkOrderSites] = useState<WorkOrderSiteRow[]>([]);
  const [activeSection, setActiveSection] = useState<'sites' | 'orders' | 'items' | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    setMessage('');

    const [projectResult, sitesResult, itemsResult, workOrdersResult] = await Promise.all([
      supabase.from('projects').select('*').eq('id', params.projectId).single(),
      supabase.from('sites').select('*').eq('project_id', params.projectId).order('name'),
      supabase
        .from('v_project_item_search')
        .select('*')
        .eq('project_id', params.projectId)
        .order('total_quantity', { ascending: false }),
      supabase.from('work_orders').select('id,work_order_number,title,status,work_order_date').eq('project_id', params.projectId).order('work_order_date', { ascending: false, nullsFirst: false }),
    ]);

    if (projectResult.error || sitesResult.error || itemsResult.error || workOrdersResult.error) {
      setMessage(
        projectResult.error?.message ||
          sitesResult.error?.message ||
          itemsResult.error?.message ||
          workOrdersResult.error?.message ||
          'تعذر تحميل بيانات المشروع.',
      );
      setLoading(false);
      return;
    }

    const loadedWorkOrders = (workOrdersResult.data || []) as WorkOrderRow[];
    const workOrderIds = loadedWorkOrders.map((row) => row.id);

    let loadedWorkOrderItems: WorkOrderItemRow[] = [];
    let loadedWorkOrderSites: WorkOrderSiteRow[] = [];

    if (workOrderIds.length) {
      const [workOrderItemsResult, workOrderSitesResult] = await Promise.all([
        supabase
          .from('work_order_items')
          .select('work_order_id,item_id')
          .in('work_order_id', workOrderIds),
        supabase
          .from('work_order_sites')
          .select('work_order_id,site_id')
          .in('work_order_id', workOrderIds),
      ]);

      if (workOrderItemsResult.error || workOrderSitesResult.error) {
        setMessage(workOrderItemsResult.error?.message || workOrderSitesResult.error?.message || 'تعذر تحميل تجميع البنود.');
        setLoading(false);
        return;
      }

      loadedWorkOrderItems = (workOrderItemsResult.data || []) as WorkOrderItemRow[];
      loadedWorkOrderSites = (workOrderSitesResult.data || []) as WorkOrderSiteRow[];
    }

    setProject(projectResult.data as ProjectRow);
    setSites((sitesResult.data || []) as SiteRow[]);
    setItems((itemsResult.data || []) as ProjectItemRow[]);
    setWorkOrders(loadedWorkOrders);
    setWorkOrderItems(loadedWorkOrderItems);
    setWorkOrderSites(loadedWorkOrderSites);
    setLoading(false);
  }

  const itemUsage = useMemo(() => {
    const sitesByOrder = new Map<string, Set<string>>();
    for (const relation of workOrderSites) {
      if (!sitesByOrder.has(relation.work_order_id)) {
        sitesByOrder.set(relation.work_order_id, new Set());
      }
      sitesByOrder.get(relation.work_order_id)!.add(relation.site_id);
    }

    const ordersByItem = new Map<string, Set<string>>();
    const sitesByItem = new Map<string, Set<string>>();

    for (const row of workOrderItems) {
      if (!ordersByItem.has(row.item_id)) ordersByItem.set(row.item_id, new Set());
      if (!sitesByItem.has(row.item_id)) sitesByItem.set(row.item_id, new Set());

      ordersByItem.get(row.item_id)!.add(row.work_order_id);
      const orderSites = sitesByOrder.get(row.work_order_id);
      if (orderSites) {
        for (const siteId of orderSites) sitesByItem.get(row.item_id)!.add(siteId);
      }
    }

    return { ordersByItem, sitesByItem };
  }, [workOrderItems, workOrderSites]);

  const enrichedItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        work_orders_count: itemUsage.ordersByItem.get(item.item_id)?.size || 0,
        sites_count: itemUsage.sitesByItem.get(item.item_id)?.size || 0,
      })),
    [items, itemUsage],
  );

  const totalRemaining = enrichedItems.reduce(
    (sum, item) => sum + (Number(item.total_remaining_quantity) || 0),
    0,
  );

  return (
    <main className="page project-hub-page">
      <div className="project-hub-heading"><div><span className="eyebrow">مركز المشروع</span><h1>{project?.name || 'المشروع'}</h1><p>اختر القسم الذي تريد استعراضه؛ سيبقى قسم واحد فقط مفتوحًا لتصفح أسرع وأكثر وضوحًا.</p></div><Link href="/projects" className="btn">جميع المشاريع</Link></div>

      {message ? <div className="notice">{message}</div> : null}

      <div className="stats project-stats-fixed">
        <div className="stat"><strong>{sites.length}</strong><span>مواقع</span></div>
        <div className="stat"><strong>{workOrders.length}</strong><span>أوامر عمل فعلية</span></div>
        <div className="stat"><strong>{items.length}</strong><span>بنود منفذة مختلفة</span></div>
        <div className="stat"><strong>{workOrderItems.length}</strong><span>سجلات بنود الأوامر</span></div>
        <div className="stat"><strong>{totalRemaining.toLocaleString()}</strong><span>إجمالي متبقي</span></div>
      </div>

      <section className="project-section-switcher">
        <button className={activeSection==='sites'?'active':''} onClick={()=>setActiveSection(activeSection==='sites'?null:'sites')}><span>⌖</span><div><small>نطاق المشروع</small><strong>المواقع</strong><p>{sites.length} موقع مرتبط</p></div><i>{activeSection==='sites'?'−':'+'}</i></button>
        <button className={activeSection==='orders'?'active':''} onClick={()=>setActiveSection(activeSection==='orders'?null:'orders')}><span>▤</span><div><small>التنفيذ الزمني</small><strong>أوامر العمل</strong><p>{workOrders.length} أمر مسجل</p></div><i>{activeSection==='orders'?'−':'+'}</i></button>
        <button className={activeSection==='items'?'active':''} onClick={()=>setActiveSection(activeSection==='items'?null:'items')}><span>≡</span><div><small>الكميات والتنفيذ</small><strong>البنود</strong><p>{enrichedItems.length} بند مختلف</p></div><i>{activeSection==='items'?'−':'+'}</i></button>
      </section>

      {activeSection?<section className="project-section-stage">
        <header><div><span className="section-kicker">تفاصيل المشروع</span><h2>{activeSection==='sites'?'المواقع':activeSection==='orders'?'أوامر العمل':'البنود والكميات'}</h2></div><button onClick={()=>setActiveSection(null)}>إغلاق ×</button></header>
        {activeSection==='sites'?<div className="project-stage-grid">{sites.map(site=><Link href={`/site/${site.id}`} key={site.id}><span>⌖</span><div><strong>{site.name}</strong><small>{site.area_name||'فتح قصة الموقع'}</small></div><i>←</i></Link>)}{!sites.length?<div className="empty">لا توجد مواقع مرتبطة بالمشروع.</div>:null}</div>:null}
        {activeSection==='orders'?<div className="project-stage-grid">{workOrders.map(order=><Link href={`/work-order/${order.id}`} key={order.id}><span>▤</span><div><strong>{order.title||`أمر عمل رقم ${order.work_order_number||'—'}`}</strong><small>{[order.work_order_date,order.status].filter(Boolean).join(' · ')||'فتح التفاصيل'}</small></div><i>←</i></Link>)}{!workOrders.length?<div className="empty">لا توجد أوامر عمل مرتبطة بالمشروع.</div>:null}</div>:null}
        {activeSection==='items'?<div className="project-item-card-grid">{enrichedItems.map(item=><article key={item.item_id}><small>{item.category||'بند مشروع'}</small><h3>{item.item_name}</h3><div><span>الأوامر <b>{item.work_orders_count}</b></span><span>المواقع <b>{item.sites_count}</b></span><span>المتبقي <b>{Number(item.total_remaining_quantity||0).toLocaleString()}</b></span></div></article>)}{!enrichedItems.length?<div className="empty">لا توجد بنود منفذة داخل المشروع.</div>:null}</div>:null}
      </section>:<div className="project-hub-empty"><span>↑</span><strong>اختر بطاقة لعرض التفاصيل</strong><p>يمكنك الانتقال بين الأقسام دون ازدحام الصفحة.</p></div>}
    </main>
  );
}
