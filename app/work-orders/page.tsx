'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { parseDateOnly } from '@/lib/helpers';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { getWorkOrderTiming, type WorkOrderTiming } from '@/lib/work-order-timing';

type ProjectRow = { id: string; name: string };
type OrderRow = {
  id: string;
  project_id: string;
  work_order_number: string;
  work_order_date: string | null;
  work_order_end_date: string | null;
  duration_days: number | null;
  title: string | null;
  status: string | null;
  contractor_name: string | null;
  notes: string | null;
  projects: ProjectRow | null;
};
type OrderSiteRow = { work_order_id: string; site_id: string };
type OrderItemRow = {
  id: string;
  work_order_id: string;
  item_id: string;
  executed_quantity: number | string | null;
  total_price: number | string | null;
  unit: string | null;
  remaining_quantity: number | string | null;
};

type EnrichedOrder = OrderRow & {
  sitesCount: number;
  itemsCount: number;
  rowsCount: number;
  totalExecutionValue: number;
  unitsCount: number;
  itemsWithRemaining: number;
  timing: WorkOrderTiming;
};

type ViewMode = 'cards' | 'table';
type TimingFilter = 'all' | 'active' | 'upcoming' | 'ending' | 'ended' | 'unscheduled';
type SortMode = 'newest' | 'ending' | 'starting' | 'number';

const formatDate = (value: string | null, short = false) =>
  value
    ? new Intl.DateTimeFormat('ar-SA', short
        ? { year: 'numeric', month: '2-digit', day: '2-digit' }
        : { year: 'numeric', month: 'long', day: 'numeric' },
      ).format(parseDateOnly(value))
    : 'غير مذكور';

const statusLabel = (status: string | null) => {
  const key = String(status || 'approved').toLowerCase();
  const labels: Record<string, string> = {
    approved: 'معتمد', completed: 'مكتمل', active: 'نشط', draft: 'مسودة', cancelled: 'ملغي',
  };
  return labels[key] || status || 'معتمد';
};

const timingFilterLabel: Record<TimingFilter, string> = {
  all: 'كل الحالات الزمنية', active: 'جارية الآن', upcoming: 'قادمة', ending: 'تنتهي قريبًا', ended: 'منتهية', unscheduled: 'غير مجدولة',
};

function timingClass(timing: WorkOrderTiming) {
  if (timing.phase === 'active' && timing.days !== null && timing.days <= 7) return 'ending';
  return timing.phase;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [orderSites, setOrderSites] = useState<OrderSiteRow[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItemRow[]>([]);
  const [query, setQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [timingFilter, setTimingFilter] = useState<TimingFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => { void load(); }, []);

  async function load() {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true); setMessage('');
    const [ordersResult, sitesResult, itemsResult] = await Promise.all([
      supabase.from('work_orders').select('id,project_id,work_order_number,work_order_date,work_order_end_date,duration_days,title,status,contractor_name,notes,projects(id,name)').order('work_order_date', { ascending: false, nullsFirst: false }).order('work_order_number', { ascending: false }),
      supabase.from('work_order_sites').select('work_order_id,site_id'),
      supabase.from('work_order_items').select('id,work_order_id,item_id,executed_quantity,remaining_quantity,total_price,unit'),
    ]);
    if (ordersResult.error || sitesResult.error || itemsResult.error) {
      setMessage(ordersResult.error?.message || sitesResult.error?.message || itemsResult.error?.message || 'تعذر تحميل أوامر العمل.');
      setLoading(false); return;
    }
    setOrders((ordersResult.data || []) as unknown as OrderRow[]);
    setOrderSites((sitesResult.data || []) as OrderSiteRow[]);
    setOrderItems((itemsResult.data || []) as OrderItemRow[]);
    setLoading(false);
  }

  const enrichedOrders = useMemo<EnrichedOrder[]>(() => {
    const siteSets = new Map<string, Set<string>>();
    const itemSets = new Map<string, Set<string>>();
    const rowsCount = new Map<string, number>();
    const executionValues = new Map<string, number>();
    const unitSets = new Map<string, Set<string>>();
    const remainingCounts = new Map<string, number>();

    for (const row of orderSites) {
      if (!siteSets.has(row.work_order_id)) siteSets.set(row.work_order_id, new Set());
      siteSets.get(row.work_order_id)!.add(row.site_id);
    }
    for (const row of orderItems) {
      if (!itemSets.has(row.work_order_id)) itemSets.set(row.work_order_id, new Set());
      itemSets.get(row.work_order_id)!.add(row.item_id);
      rowsCount.set(row.work_order_id, (rowsCount.get(row.work_order_id) || 0) + 1);
      executionValues.set(row.work_order_id, (executionValues.get(row.work_order_id) || 0) + (Number(row.total_price) || 0));
      if (!unitSets.has(row.work_order_id)) unitSets.set(row.work_order_id, new Set());
      if (row.unit) unitSets.get(row.work_order_id)!.add(row.unit);
      if ((Number(row.remaining_quantity) || 0) > 0) remainingCounts.set(row.work_order_id, (remainingCounts.get(row.work_order_id) || 0) + 1);
    }

    return orders.map((order) => ({
      ...order,
      sitesCount: siteSets.get(order.id)?.size || 0,
      itemsCount: itemSets.get(order.id)?.size || 0,
      rowsCount: rowsCount.get(order.id) || 0,
      totalExecutionValue: executionValues.get(order.id) || 0,
      unitsCount: unitSets.get(order.id)?.size || 0,
      itemsWithRemaining: remainingCounts.get(order.id) || 0,
      timing: getWorkOrderTiming(order.work_order_date, order.work_order_end_date),
    }));
  }, [orders, orderSites, orderItems]);

  const projects = useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach((order) => { if (order.projects?.id && order.projects.name) map.set(order.projects.id, order.projects.name); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [orders]);

  const statuses = useMemo(() => Array.from(new Set(orders.map((order) => order.status || 'approved'))), [orders]);

  const timingCounts = useMemo(() => ({
    active: enrichedOrders.filter((o) => o.timing.phase === 'active').length,
    ending: enrichedOrders.filter((o) => o.timing.phase === 'active' && o.timing.days !== null && o.timing.days <= 7).length,
    upcoming: enrichedOrders.filter((o) => o.timing.phase === 'upcoming').length,
    ended: enrichedOrders.filter((o) => o.timing.phase === 'ended').length,
    unscheduled: enrichedOrders.filter((o) => o.timing.phase === 'unscheduled').length,
  }), [enrichedOrders]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = enrichedOrders.filter((order) => {
      const matchesQuery = !needle || `${order.work_order_number} ${order.title || ''} ${order.projects?.name || ''} ${order.contractor_name || ''} ${order.notes || ''}`.toLowerCase().includes(needle);
      const matchesProject = projectFilter === 'all' || order.project_id === projectFilter;
      const matchesStatus = statusFilter === 'all' || (order.status || 'approved') === statusFilter;
      const matchesTiming = timingFilter === 'all'
        || (timingFilter === 'ending' && order.timing.phase === 'active' && order.timing.days !== null && order.timing.days <= 7)
        || (timingFilter !== 'ending' && order.timing.phase === timingFilter);
      return matchesQuery && matchesProject && matchesStatus && matchesTiming;
    });

    return list.sort((a, b) => {
      if (sortMode === 'number') return String(a.work_order_number).localeCompare(String(b.work_order_number), 'ar', { numeric: true });
      if (sortMode === 'ending') return String(a.work_order_end_date || '9999-12-31').localeCompare(String(b.work_order_end_date || '9999-12-31'));
      if (sortMode === 'starting') return String(a.work_order_date || '9999-12-31').localeCompare(String(b.work_order_date || '9999-12-31'));
      return String(b.work_order_date || '').localeCompare(String(a.work_order_date || ''));
    });
  }, [enrichedOrders, projectFilter, query, sortMode, statusFilter, timingFilter]);

  const totalSites = new Set(orderSites.map((row) => row.site_id)).size;
  const totalExecutionValue = orderItems.reduce((sum, row) => sum + (Number(row.total_price) || 0), 0);

  return (
    <main className="page work-orders-management-page">
      <section className="page-heading work-orders-management-hero">
        <div>
          <span className="eyebrow">إدارة أوامر العمل</span>
          <h1>مركز متابعة التنفيذ الزمني</h1>
          <p>تابع الأوامر الجارية والقادمة والمنتهية، وقارن نطاق المواقع والبنود وقيمة التنفيذ من شاشة واحدة.</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={load} disabled={loading}>{loading ? 'جاري التحديث...' : 'تحديث البيانات'}</button>
          <Link href="/import" className="btn primary">استيراد أمر عمل</Link>
        </div>
      </section>

      {message ? <div className="notice error-notice">{message}</div> : null}

      <section className="work-orders-executive-stats">
        <button onClick={() => setTimingFilter('all')} className={timingFilter === 'all' ? 'active' : ''}><small>إجمالي الأوامر</small><strong>{orders.length}</strong><span>أمر مسجل</span></button>
        <button onClick={() => setTimingFilter('active')} className={timingFilter === 'active' ? 'active' : ''}><small>جارية الآن</small><strong>{timingCounts.active}</strong><span>ضمن فترة التنفيذ</span></button>
        <button onClick={() => setTimingFilter('ending')} className={timingFilter === 'ending' ? 'active warning' : 'warning'}><small>تنتهي قريبًا</small><strong>{timingCounts.ending}</strong><span>خلال 7 أيام</span></button>
        <button onClick={() => setTimingFilter('upcoming')} className={timingFilter === 'upcoming' ? 'active' : ''}><small>قادمة</small><strong>{timingCounts.upcoming}</strong><span>لم تبدأ بعد</span></button>
        <button onClick={() => setTimingFilter('ended')} className={timingFilter === 'ended' ? 'active muted' : 'muted'}><small>منتهية</small><strong>{timingCounts.ended}</strong><span>انتهت مدتها</span></button>
        <div><small>قيمة التنفيذ</small><strong>{totalExecutionValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}</strong><span>قبل الضريبة</span></div>
      </section>

      <section className="section-block work-orders-control-panel">
        <div className="work-orders-filter-grid-v2">
          <label className="wide"><span>البحث</span><input className="search" placeholder="رقم الأمر، المشروع، المقاول أو عنوان الأمر..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <label><span>المشروع</span><select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}><option value="all">كل المشاريع</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <label><span>الحالة الإدارية</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">كل الحالات</option>{statuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
          <label><span>الحالة الزمنية</span><select value={timingFilter} onChange={(event) => setTimingFilter(event.target.value as TimingFilter)}>{(Object.keys(timingFilterLabel) as TimingFilter[]).map((key) => <option key={key} value={key}>{timingFilterLabel[key]}</option>)}</select></label>
          <label><span>الترتيب</span><select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}><option value="newest">الأحدث أولًا</option><option value="ending">الأقرب للانتهاء</option><option value="starting">الأقرب للبدء</option><option value="number">رقم الأمر</option></select></label>
          <div className="view-switch" aria-label="طريقة العرض"><button className={viewMode === 'cards' ? 'active' : ''} onClick={() => setViewMode('cards')} title="عرض البطاقات">▦</button><button className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')} title="العرض الجدولي">☷</button></div>
        </div>
      </section>

      <section className="section-block work-orders-results-section">
        <div className="section-title"><div><span className="section-kicker">النتائج</span><h2>أوامر العمل المسجلة</h2></div><span>{filtered.length} من {orders.length} أمر • {totalSites} موقع</span></div>

        {viewMode === 'cards' ? (
          <div className="work-orders-operation-grid">
            {filtered.map((order) => (
              <article className={`work-order-operation-card ${timingClass(order.timing)}`} key={order.id}>
                <div className="operation-card-head">
                  <div className="work-order-number">{order.work_order_number}</div>
                  <div><span className="badge">{statusLabel(order.status)}</span><small>{order.timing.compactLabel}</small></div>
                </div>

                <div className="operation-title-block">
                  <h3 title={order.title || order.projects?.name || ''}>{order.title || `أمر عمل رقم ${order.work_order_number}`}</h3>
                  <p title={order.projects?.name || ''}>{order.projects?.name || 'مشروع غير محدد'}</p>
                  <small>{order.contractor_name || 'المقاول غير مذكور'}</small>
                </div>

                <div className="operation-dates">
                  <span><small>البداية</small><b>{formatDate(order.work_order_date, true)}</b></span>
                  <span><small>النهاية</small><b>{formatDate(order.work_order_end_date, true)}</b></span>
                  <span><small>المدة</small><b>{order.duration_days || order.timing.totalDays || '—'} {order.duration_days || order.timing.totalDays ? 'يوم' : ''}</b></span>
                </div>

                <div className="operation-progress-block">
                  <div className="operation-countdown"><strong>{order.timing.days ?? '—'}</strong><span>{order.timing.phase === 'upcoming' ? 'يومًا حتى البداية' : order.timing.phase === 'ended' ? 'يومًا منذ الانتهاء' : order.timing.phase === 'active' ? 'يومًا متبقيًا' : 'مدة غير محددة'}</span></div>
                  <div className="operation-progress-copy"><b>{order.timing.label}</b><div className="timing-progress"><i style={{ width: `${order.timing.progressPercent ?? 0}%` }} /></div><small>{order.timing.progressPercent !== null ? `${order.timing.progressPercent}% من المدة` : 'لا تتوفر نسبة تقدم زمنية'}</small></div>
                </div>

                <div className="operation-metrics"><span><small>المواقع</small><b>{order.sitesCount}</b></span><span><small>البنود</small><b>{order.itemsCount}</b></span><span><small>سجلات البنود</small><b>{order.rowsCount}</b></span><span><small>بنود برصيد</small><b>{order.itemsWithRemaining}</b></span></div>
                <div className="operation-value"><small>قيمة التنفيذ قبل الضريبة</small><b>{order.totalExecutionValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b></div>
                <div className="operation-actions"><Link href={`/work-order/${order.id}`} className="btn primary">فتح أمر العمل</Link>{order.projects?.id ? <Link href={`/project/${order.projects.id}`} className="btn">فتح المشروع</Link> : null}</div>
              </article>
            ))}
          </div>
        ) : (
          <div className="table-wrap work-orders-management-table-wrap">
            <table className="work-orders-management-table">
              <colgroup><col className="wo-col-number"/><col className="wo-col-project"/><col className="wo-col-date"/><col className="wo-col-date"/><col className="wo-col-duration"/><col className="wo-col-small"/><col className="wo-col-small"/><col className="wo-col-status"/><col className="wo-col-action"/></colgroup>
              <thead><tr><th>أمر العمل</th><th>المشروع</th><th>البداية</th><th>النهاية</th><th>المدة</th><th>المواقع</th><th>البنود</th><th>الحالة الزمنية</th><th></th></tr></thead>
              <tbody>{filtered.map((order) => <tr key={order.id}><td><b>{order.work_order_number}</b><small>{statusLabel(order.status)}</small></td><td><Link href={`/work-order/${order.id}`} title={order.projects?.name || ''}><b>{order.title || `أمر عمل رقم ${order.work_order_number}`}</b><small>{order.projects?.name || 'مشروع غير محدد'} • {order.contractor_name || 'المقاول غير مذكور'}</small></Link></td><td>{formatDate(order.work_order_date, true)}</td><td>{formatDate(order.work_order_end_date, true)}</td><td>{order.duration_days || order.timing.totalDays || '—'}</td><td>{order.sitesCount}</td><td>{order.itemsCount}</td><td><span className={`timing-table-pill ${timingClass(order.timing)}`}>{order.timing.compactLabel}</span></td><td><Link href={`/work-order/${order.id}`} className="text-link">فتح ←</Link></td></tr>)}</tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length === 0 ? <div className="empty">لا توجد أوامر عمل مطابقة للفلاتر الحالية.</div> : null}
      </section>
    </main>
  );
}
