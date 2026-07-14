'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { parseDateOnly } from '@/lib/helpers';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { getWorkOrderTiming } from '@/lib/work-order-timing';

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
  quantitiesByUnit: Array<[string, number]>;
};

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('ar-SA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(parseDateOnly(value))
    : 'غير مذكور';

const statusLabel = (status: string | null) => {
  const key = String(status || 'approved').toLowerCase();
  const labels: Record<string, string> = {
    approved: 'معتمد',
    completed: 'مكتمل',
    active: 'نشط',
    draft: 'مسودة',
    cancelled: 'ملغي',
  };
  return labels[key] || status || 'معتمد';
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [orderSites, setOrderSites] = useState<OrderSiteRow[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItemRow[]>([]);
  const [query, setQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage('');

    const [ordersResult, sitesResult, itemsResult] = await Promise.all([
      supabase
        .from('work_orders')
        .select(
          'id,project_id,work_order_number,work_order_date,work_order_end_date,duration_days,title,status,contractor_name,notes,projects(id,name)',
        )
        .order('work_order_date', { ascending: false, nullsFirst: false })
        .order('work_order_number', { ascending: false }),
      supabase.from('work_order_sites').select('work_order_id,site_id'),
      supabase
        .from('work_order_items')
        .select('id,work_order_id,item_id,executed_quantity,remaining_quantity,total_price,unit'),
    ]);

    if (ordersResult.error || sitesResult.error || itemsResult.error) {
      setMessage(
        ordersResult.error?.message ||
          sitesResult.error?.message ||
          itemsResult.error?.message ||
          'تعذر تحميل أوامر العمل.',
      );
      setLoading(false);
      return;
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
    const quantitiesByOrderUnit = new Map<string, Map<string, number>>();

    for (const row of orderSites) {
      if (!siteSets.has(row.work_order_id)) siteSets.set(row.work_order_id, new Set());
      siteSets.get(row.work_order_id)!.add(row.site_id);
    }

    for (const row of orderItems) {
      if (!itemSets.has(row.work_order_id)) itemSets.set(row.work_order_id, new Set());
      itemSets.get(row.work_order_id)!.add(row.item_id);
      rowsCount.set(row.work_order_id, (rowsCount.get(row.work_order_id) || 0) + 1);
      executionValues.set(
        row.work_order_id,
        (executionValues.get(row.work_order_id) || 0) + (Number(row.total_price) || 0),
      );
      if (!unitSets.has(row.work_order_id)) unitSets.set(row.work_order_id, new Set());
      if (row.unit) unitSets.get(row.work_order_id)!.add(row.unit);

      const remainingQuantity = Number((row as OrderItemRow & { remaining_quantity?: number | string | null }).remaining_quantity) || 0;
      if (remainingQuantity > 0) {
        remainingCounts.set(row.work_order_id, (remainingCounts.get(row.work_order_id) || 0) + 1);
      }

      const unit = row.unit || 'بدون وحدة';
      if (!quantitiesByOrderUnit.has(row.work_order_id)) {
        quantitiesByOrderUnit.set(row.work_order_id, new Map());
      }
      const unitMap = quantitiesByOrderUnit.get(row.work_order_id)!;
      unitMap.set(
        unit,
        (unitMap.get(unit) || 0) + (Number(row.executed_quantity) || 0),
      );
    }

    return orders.map((order) => ({
      ...order,
      sitesCount: siteSets.get(order.id)?.size || 0,
      itemsCount: itemSets.get(order.id)?.size || 0,
      rowsCount: rowsCount.get(order.id) || 0,
      totalExecutionValue: executionValues.get(order.id) || 0,
      unitsCount: unitSets.get(order.id)?.size || 0,
      itemsWithRemaining: remainingCounts.get(order.id) || 0,
      quantitiesByUnit: Array.from(quantitiesByOrderUnit.get(order.id)?.entries() || []).sort(
        (a, b) => a[0].localeCompare(b[0], 'ar'),
      ),
    }));
  }, [orders, orderSites, orderItems]);

  const projects = useMemo(() => {
    const map = new Map<string, string>();
    for (const order of orders) {
      if (order.projects?.id && order.projects.name) map.set(order.projects.id, order.projects.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [orders]);

  const statuses = useMemo(
    () => Array.from(new Set(orders.map((order) => order.status || 'approved'))),
    [orders],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return enrichedOrders.filter((order) => {
      const matchesQuery =
        !needle ||
        `${order.work_order_number} ${order.title || ''} ${order.projects?.name || ''} ${
          order.contractor_name || ''
        } ${order.notes || ''}`
          .toLowerCase()
          .includes(needle);
      const matchesProject = projectFilter === 'all' || order.project_id === projectFilter;
      const matchesStatus = statusFilter === 'all' || (order.status || 'approved') === statusFilter;
      return matchesQuery && matchesProject && matchesStatus;
    });
  }, [enrichedOrders, query, projectFilter, statusFilter]);

  const totalSites = new Set(orderSites.map((row) => row.site_id)).size;
  const totalDistinctItems = new Set(orderItems.map((row) => row.item_id)).size;
  const totalRows = orderItems.length;
  const totalExecutionValue = orderItems.reduce(
    (sum, row) => sum + (Number(row.total_price) || 0),
    0,
  );
  const totalUnits = new Set(orderItems.map((row) => row.unit).filter(Boolean)).size;
  const totalRemainingRows = orderItems.filter(
    (row) => (Number(row.remaining_quantity) || 0) > 0,
  ).length;

  return (
    <main className="page orders-page">
      <section className="page-heading orders-heading">
        <span className="eyebrow">أوامر العمل</span>
        <h1>السجل التاريخي لأوامر العمل</h1>
        <p>
          راجع كل أمر عمل، والمواقع التي شملها، والبنود المرتبطة به، ثم افتح صفحة الأمر للتفاصيل الكاملة.
        </p>
      </section>

      {message ? <div className="notice error-notice">{message}</div> : null}

      <section className="stats work-orders-stats">
        <div className="stat">
          <strong>{orders.length}</strong>
          <span>أوامر عمل فعلية</span>
        </div>
        <div className="stat">
          <strong>{totalSites}</strong>
          <span>مواقع ظهرت في الأوامر</span>
        </div>
        <div className="stat">
          <strong>{totalDistinctItems}</strong>
          <span>بنود مختلفة</span>
        </div>
        <div className="stat">
          <strong>{totalRows}</strong>
          <span>سجلات بنود الأوامر</span>
        </div>
        <div className="stat">
          <strong>{totalUnits}</strong>
          <span>وحدات قياس مختلفة</span>
        </div>
        <div className="stat">
          <strong>{totalRemainingRows}</strong>
          <span>سجلات لها رصيد متبقٍ</span>
        </div>
        <div className="stat wide">
          <strong>{totalExecutionValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}</strong>
          <span>إجمالي قيمة التنفيذ قبل الضريبة</span>
        </div>
      </section>

      <section className="section-block orders-filter-panel">
        <div className="orders-filter-grid">
          <label>
            <span>البحث</span>
            <input
              className="search"
              placeholder="رقم الأمر، المشروع، العنوان أو المقاول..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label>
            <span>المشروع</span>
            <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
              <option value="all">كل المشاريع</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>الحالة</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">كل الحالات</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" onClick={load} disabled={loading}>
            {loading ? 'جاري التحديث...' : 'تحديث البيانات'}
          </button>
        </div>
      </section>

      <section className="section-block orders-list-section">
        <div className="section-title">
          <div>
            <span className="section-kicker">النتائج</span>
            <h2>أوامر العمل المسجلة</h2>
          </div>
          <span>{filtered.length} أمر</span>
        </div>

        <div className="orders-grid">
          {filtered.map((order) => (
            <Link href={`/work-order/${order.id}`} className="work-order-card" key={order.id}>
              <div className="work-order-card-top">
                <div className="work-order-number">{order.work_order_number}</div>
                <span className="badge">{statusLabel(order.status)}</span>
              </div>

              <div className="work-order-card-body">
                {(() => { const timing = getWorkOrderTiming(order.work_order_date, order.work_order_end_date); return <div className={`work-order-timing-banner ${timing.tone}`}><b>{timing.compactLabel}</b>{order.duration_days ? <small>مدة الأمر: {order.duration_days} يوم</small> : null}</div>; })()}
                <span className="order-date">{formatDate(order.work_order_date)} — {formatDate(order.work_order_end_date)}</span>
                <h3>{order.title || `أمر عمل رقم ${order.work_order_number}`}</h3>
                <p>{order.projects?.name || 'مشروع غير محدد'}</p>
                <small>{order.contractor_name || 'المقاول غير مذكور'}</small>
              </div>

              <div className="work-order-card-metrics">
                <span>
                  <small>المواقع المرتبطة</small>
                  <b>{order.sitesCount}</b>
                </span>
                <span>
                  <small>البنود المختلفة</small>
                  <b>{order.itemsCount}</b>
                </span>
                <span>
                  <small>سجلات البنود</small>
                  <b>{order.rowsCount}</b>
                </span>
                <span>
                  <small>وحدات القياس</small>
                  <b>{order.unitsCount}</b>
                </span>
                <span>
                  <small>بنود لها رصيد متبقٍ</small>
                  <b>{order.itemsWithRemaining}</b>
                </span>
                <span>
                  <small>قيمة التنفيذ قبل الضريبة</small>
                  <b>{order.totalExecutionValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b>
                </span>
              </div>

              <div className="work-order-unit-chips">
                {order.quantitiesByUnit.map(([unit, quantity]) => (
                  <span key={unit}>
                    <small>{unit}</small>
                    <b>{quantity.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b>
                  </span>
                ))}
              </div>

              <div className="work-order-card-action">فتح تفاصيل أمر العمل ←</div>
            </Link>
          ))}
        </div>

        {!loading && filtered.length === 0 ? (
          <div className="empty">لا توجد أوامر عمل مطابقة للفلاتر الحالية.</div>
        ) : null}
      </section>
    </main>
  );
}
