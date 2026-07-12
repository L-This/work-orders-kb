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
type WorkOrderRow = { id: string };
type WorkOrderItemRow = { work_order_id: string; item_id: string };
type WorkOrderSiteRow = { work_order_id: string; site_id: string };

export default function ProjectPage({ params }: { params: { projectId: string } }) {
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [items, setItems] = useState<ProjectItemRow[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderRow[]>([]);
  const [workOrderItems, setWorkOrderItems] = useState<WorkOrderItemRow[]>([]);
  const [workOrderSites, setWorkOrderSites] = useState<WorkOrderSiteRow[]>([]);
  const [q, setQ] = useState('');
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
      supabase.from('work_orders').select('id').eq('project_id', params.projectId),
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

  const filteredSites = useMemo(
    () => sites.filter((site) => !q || site.name.includes(q)),
    [sites, q],
  );

  const filteredItems = useMemo(
    () =>
      enrichedItems.filter(
        (item) => !q || `${item.item_name} ${item.category || ''}`.includes(q),
      ),
    [enrichedItems, q],
  );

  const totalRemaining = enrichedItems.reduce(
    (sum, item) => sum + (Number(item.total_remaining_quantity) || 0),
    0,
  );

  return (
    <main className="page">
      <Link href="/" className="btn">رجوع للرئيسية</Link>

      <div className="section-title">
        <h3>{project?.name || 'المشروع'}</h3>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? 'جاري التحديث...' : 'تحديث'}
        </button>
      </div>

      {message ? <div className="notice">{message}</div> : null}

      <div className="stats project-stats-fixed">
        <div className="stat"><strong>{sites.length}</strong><span>مواقع</span></div>
        <div className="stat"><strong>{workOrders.length}</strong><span>أوامر عمل فعلية</span></div>
        <div className="stat"><strong>{items.length}</strong><span>بنود منفذة مختلفة</span></div>
        <div className="stat"><strong>{workOrderItems.length}</strong><span>سجلات بنود الأوامر</span></div>
        <div className="stat"><strong>{totalRemaining.toLocaleString()}</strong><span>إجمالي متبقي</span></div>
      </div>

      <div className="toolbar">
        <input
          className="input"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="بحث داخل المشروع: موقع أو بند"
        />
      </div>

      <div className="two-col">
        <section className="panel">
          <h3>المواقع</h3>
          {filteredSites.map((site) => (
            <Link
              key={site.id}
              className="card"
              style={{ display: 'block', marginBottom: 10 }}
              href={`/site/${site.id}`}
            >
              {site.name}
              <p className="muted">{site.area_name || 'صفحة قصة الموقع'}</p>
            </Link>
          ))}
        </section>

        <section className="panel">
          <h3>البنود داخل المشروع</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>البند</th>
                  <th>المواقع</th>
                  <th>أوامر العمل</th>
                  <th>الكمية</th>
                  <th>المنفذ</th>
                  <th>المتبقي</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.item_id}>
                    <td><b>{item.item_name}</b></td>
                    <td>{item.sites_count}</td>
                    <td>{item.work_orders_count}</td>
                    <td>{Number(item.total_quantity || 0).toLocaleString()}</td>
                    <td>{Number(item.total_executed_quantity || 0).toLocaleString()}</td>
                    <td>{Number(item.total_remaining_quantity || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
