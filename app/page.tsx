'use client';
import { parseDateOnly } from '@/lib/helpers';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getWorkOrderTiming } from '@/lib/work-order-timing';

type Project = {
  id: string;
  name: string;
  contractor_name: string | null;
  municipality: string | null;
  status: string | null;
  created_at: string;
};

type WorkOrder = {
  id: string;
  project_id: string;
  work_order_number: string;
  work_order_date: string | null;
  title: string | null;
  status: string | null;
  work_order_end_date: string | null;
  duration_days: number | null;
  projects: { name: string } | null;
};

type ImportBatch = {
  id: string;
  file_name: string;
  import_status: string;
  imported_rows_count: number | null;
  error_rows_count: number | null;
  created_at: string;
};

type GeneralItem = {
  item_id: string;
  item_name: string;
  category: string | null;
  unit: string | null;
  projects_count: number;
  sites_count: number;
  work_orders_count: number;
  total_quantity: number;
  total_executed_quantity: number;
  total_remaining_quantity: number;
  first_work_order_date: string | null;
  last_work_order_date: string | null;
};

type SiteSummary = {
  site_id: string;
  site_name: string;
  project_id: string;
  project_name: string;
  work_orders_count: number;
  items_count: number;
  total_ordered_quantity: number;
  total_remaining_quantity: number;
  last_work_order_date: string | null;
};

type DashboardCounts = {
  projects: number;
  sites: number;
  workOrders: number;
  items: number;
};

const initialCounts: DashboardCounts = { projects: 0, sites: 0, workOrders: 0, items: 0 };

function number(value: unknown) {
  return Number(value || 0);
}

function formatNumber(value: unknown) {
  return number(value).toLocaleString('ar-SA', { maximumFractionDigits: 2 });
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }).format(parseDateOnly(value));
}

function compactProjectName(name: string) {
  const cleaned = name
    .replace(/مشروع\s+/g, '')
    .replace(/محافظة\s+جدة\s*[-–—]?\s*/g, '')
    .replace(/بلدية\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.length > 74 ? `${cleaned.slice(0, 71).trim()}…` : cleaned;
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentOrders, setRecentOrders] = useState<WorkOrder[]>([]);
  const [recentImports, setRecentImports] = useState<ImportBatch[]>([]);
  const [items, setItems] = useState<GeneralItem[]>([]);
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [counts, setCounts] = useState<DashboardCounts>(initialCounts);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void loadDashboard();
  }, []);

  async function loadDashboard() {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    const [
      projectsResult,
      sitesCountResult,
      ordersCountResult,
      itemsCountResult,
      ordersResult,
      importsResult,
      itemResult,
      siteResult,
    ] = await Promise.all([
      supabase.from('projects').select('*', { count: 'exact' }).order('created_at', { ascending: false }),
      supabase.from('sites').select('id', { count: 'exact', head: true }),
      supabase.from('work_orders').select('id', { count: 'exact', head: true }),
      supabase.from('items').select('id', { count: 'exact', head: true }),
      supabase
        .from('work_orders')
        .select('id,project_id,work_order_number,work_order_date,title,status,work_order_end_date,duration_days,projects(name)')
        .order('work_order_date', { ascending: false, nullsFirst: false })
        .limit(6),
      supabase
        .from('import_batches')
        .select('id,file_name,import_status,imported_rows_count,error_rows_count,created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('v_general_item_search')
        .select('*')
        .order('work_orders_count', { ascending: false })
        .limit(100),
      supabase
        .from('v_site_decision_summary')
        .select('site_id,site_name,project_id,project_name,work_orders_count,items_count,total_ordered_quantity,total_remaining_quantity,last_work_order_date')
        .order('work_orders_count', { ascending: false })
        .limit(8),
    ]);

    const firstError = [
      projectsResult.error,
      sitesCountResult.error,
      ordersCountResult.error,
      itemsCountResult.error,
      ordersResult.error,
      importsResult.error,
      itemResult.error,
      siteResult.error,
    ].find(Boolean);

    if (firstError) setError(firstError.message);

    const projectRows = (projectsResult.data || []) as Project[];
    setProjects(projectRows);
    setCounts({
      projects: projectsResult.count ?? projectRows.length,
      sites: sitesCountResult.count ?? 0,
      workOrders: ordersCountResult.count ?? 0,
      items: itemsCountResult.count ?? 0,
    });
    setRecentOrders((ordersResult.data || []) as unknown as WorkOrder[]);
    setRecentImports((importsResult.data || []) as ImportBatch[]);
    setItems((itemResult.data || []) as GeneralItem[]);
    setSites((siteResult.data || []) as SiteSummary[]);
    setLoading(false);
  }

  const totalRemaining = useMemo(
    () => items.reduce((sum, item) => sum + number(item.total_remaining_quantity), 0),
    [items],
  );

  const orderTiming = useMemo(() => recentOrders.map((order) => ({
    order,
    timing: getWorkOrderTiming(order.work_order_date, order.work_order_end_date),
  })), [recentOrders]);

  const timingCounts = useMemo(() => ({
    active: orderTiming.filter(({ timing }) => timing.phase === 'active').length,
    upcoming: orderTiming.filter(({ timing }) => timing.phase === 'upcoming' && (timing.days ?? 9999) <= 30).length,
    endingSoon: orderTiming.filter(({ timing }) => timing.phase === 'active' && (timing.days ?? 9999) <= 30).length,
    ended: orderTiming.filter(({ timing }) => timing.phase === 'ended').length,
  }), [orderTiming]);

  const alerts = useMemo(() => orderTiming
    .filter(({ timing }) =>
      (timing.phase === 'upcoming' && (timing.days ?? 9999) <= 30) ||
      (timing.phase === 'active' && (timing.days ?? 9999) <= 30)
    )
    .slice(0, 5), [orderTiming]);

  return (
    <main className="page executive-dashboard">
      {!isSupabaseConfigured && (
        <div className="notice">لم يتم ربط Supabase بعد. أضف متغيرات الاتصال في Vercel.</div>
      )}
      {error && <div className="notice error-notice">تعذر تحميل بعض البيانات: {error}</div>}

      <section className="dashboard-welcome">
        <div>
          <span className="eyebrow">لوحة القيادة</span>
          <h1>نظرة تشغيلية على منظومة أوامر العمل</h1>
          <p>ملخص مباشر للمشاريع، أوامر العمل، المواعيد والتنبيهات التي تحتاج متابعة.</p>
        </div>
        <div className="dashboard-welcome-actions">
          <Link className="btn primary" href="/projects">فتح المشاريع</Link>
        </div>
      </section>

      <section className="dashboard-kpis">
        <Link href="/projects" className="dashboard-kpi"><small>المشاريع</small><strong>{counts.projects}</strong><span>مشروع مسجل</span></Link>
        <Link href="/sites" className="dashboard-kpi"><small>المواقع</small><strong>{counts.sites}</strong><span>موقع مرتبط بالمشاريع</span></Link>
        <Link href="/work-orders" className="dashboard-kpi"><small>أوامر العمل</small><strong>{counts.workOrders}</strong><span>أمر في السجل</span></Link>
        <Link href="/items" className="dashboard-kpi"><small>قاموس البنود</small><strong>{counts.items}</strong><span>بند موحد قابل للبحث</span></Link>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section-head">
          <div><span className="section-kicker">المتابعة الزمنية</span><h2>حالة أوامر العمل</h2></div>
          <Link href="/work-orders" className="text-link">عرض السجل الكامل</Link>
        </div>
        <div className="status-overview-grid">
          <article className="status-overview active"><span>جارية الآن</span><strong>{timingCounts.active}</strong><small>أوامر ضمن فترة التنفيذ</small></article>
          <article className="status-overview upcoming"><span>تبدأ قريبًا</span><strong>{timingCounts.upcoming}</strong><small>خلال 30 يومًا</small></article>
          <article className="status-overview warning"><span>قريبة من الانتهاء</span><strong>{timingCounts.endingSoon}</strong><small>متبقٍ 30 يومًا أو أقل</small></article>
          <article className="status-overview ended"><span>منتهية</span><strong>{timingCounts.ended}</strong><small>ضمن أحدث الأوامر المحملة</small></article>
        </div>
      </section>

      <section className="dashboard-two-column">
        <div className="dashboard-section">
          <div className="dashboard-section-head">
            <div><span className="section-kicker">المشاريع</span><h2>المشاريع المسجلة</h2></div>
            <Link href="/projects" className="text-link">عرض الكل</Link>
          </div>
          <div className="dashboard-project-list">
            {projects.slice(0, 6).map((project, index) => (
              <Link href={`/project/${project.id}`} className="dashboard-project-row" key={project.id}>
                <span className="project-index">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <b title={project.name}>{compactProjectName(project.name)}</b>
                  <small>{[project.municipality, project.contractor_name].filter(Boolean).join(' · ') || 'لا توجد بيانات إضافية'}</small>
                </div>
                <span className="project-open">فتح ←</span>
              </Link>
            ))}
            {!loading && projects.length === 0 && <div className="empty">لا توجد مشاريع مسجلة.</div>}
          </div>
        </div>

        <div className="dashboard-section alerts-panel">
          <div className="dashboard-section-head">
            <div><span className="section-kicker">مركز التنبيهات</span><h2>يحتاج إلى متابعة</h2></div>
            <span className="alert-count">{alerts.length}</span>
          </div>
          <div className="dashboard-alert-list">
            {alerts.map(({ order, timing }) => (
              <Link href={`/work-order/${order.id}`} className={`dashboard-alert ${timing.tone}`} key={order.id}>
                <span className="alert-dot" />
                <div><b>أمر عمل رقم {order.work_order_number}</b><small>{order.projects?.name || order.title || 'بدون عنوان'}</small></div>
                <strong>{timing.compactLabel}</strong>
              </Link>
            ))}
            {!loading && alerts.length === 0 && <div className="dashboard-clear-state"><b>لا توجد تنبيهات عاجلة</b><span>لا توجد أوامر تبدأ أو تنتهي خلال 30 يومًا ضمن أحدث البيانات.</span></div>}
          </div>
        </div>
      </section>

      <section className="dashboard-two-column dashboard-bottom-grid">
        <div className="dashboard-section">
          <div className="dashboard-section-head"><div><span className="section-kicker">آخر النشاط</span><h2>أحدث أوامر العمل</h2></div><Link href="/work-orders" className="text-link">كل الأوامر</Link></div>
          <div className="dashboard-activity-list">
            {recentOrders.slice(0, 5).map((order) => {
              const timing = getWorkOrderTiming(order.work_order_date, order.work_order_end_date);
              return <Link href={`/work-order/${order.id}`} className="dashboard-activity-row" key={order.id}>
                <div className="activity-number">{order.work_order_number}</div>
                <div><b>{order.projects?.name || order.title || `أمر عمل ${order.work_order_number}`}</b><small>{formatDate(order.work_order_date)} · {timing.compactLabel}</small></div>
              </Link>;
            })}
          </div>
        </div>

        <div className="dashboard-section">
          <div className="dashboard-section-head"><div><span className="section-kicker">الاستيراد</span><h2>آخر ملفات البيانات</h2></div></div>
          <div className="dashboard-activity-list">
            {recentImports.slice(0, 5).map((batch) => (
              <article className="dashboard-activity-row" key={batch.id}>
                <div className="import-mini-status" data-status={batch.import_status}>XL</div>
                <div><b>{batch.file_name}</b><small>{formatDate(batch.created_at)} · {batch.imported_rows_count || 0} صف · {batch.error_rows_count || 0} خطأ</small></div>
              </article>
            ))}
            {!loading && recentImports.length === 0 && <div className="empty">لا توجد عمليات استيراد مسجلة.</div>}
          </div>
        </div>
      </section>

      <section className="dashboard-decision-strip">
        <div><span>الرصيد المتبقي المسجل</span><strong>{formatNumber(totalRemaining)}</strong></div>
        <p>استخدم قصة الموقع قبل اعتماد أي احتياج أو إصدار أمر عمل جديد.</p>
      </section>
    </main>
  );
}
