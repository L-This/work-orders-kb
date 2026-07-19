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
  const [items, setItems] = useState<GeneralItem[]>([]);
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [counts, setCounts] = useState<DashboardCounts>(initialCounts);
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
      itemResult,
      siteResult,
    ] = await Promise.all([
      supabase.from('projects').select('*', { count: 'exact' }).is('deleted_at', null).or('status.is.null,status.neq.deleted').order('created_at', { ascending: false }),
      supabase.from('sites').select('id', { count: 'exact', head: true }),
      supabase.from('work_orders').select('id', { count: 'exact', head: true }),
      supabase.from('items').select('id', { count: 'exact', head: true }),
      supabase
        .from('work_orders')
        .select('id,project_id,work_order_number,work_order_date,title,status,work_order_end_date,duration_days,projects(name)')
        .order('work_order_date', { ascending: false, nullsFirst: false })
        .limit(1000),
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
          <h1>مركز القرار التشغيلي</h1>
          <p>ابدأ بما يحتاج تدخلك الآن، ثم انتقل مباشرة إلى المشروع أو أمر العمل أو الموقع.</p>
        </div>
        <div className="dashboard-focus-card">
          <small>الأولوية الحالية</small>
          <strong>{alerts.length}</strong>
          <span>{alerts.length === 1 ? 'أمر يحتاج متابعة زمنية' : 'أوامر تحتاج متابعة زمنية'}</span>
          <Link href="/alerts">فتح مركز التنبيهات</Link>
        </div>
      </section>

      <section className="dashboard-kpis">
        <Link href="/projects" className="dashboard-kpi"><small>المشاريع</small><strong>{counts.projects}</strong><span>مشروع مسجل</span></Link>
        <Link href="/sites" className="dashboard-kpi"><small>المواقع</small><strong>{counts.sites}</strong><span>موقع مرتبط بالمشاريع</span></Link>
        <Link href="/work-orders" className="dashboard-kpi"><small>أوامر العمل</small><strong>{counts.workOrders}</strong><span>أمر في السجل</span></Link>
        <Link href="/items" className="dashboard-kpi"><small>البنود</small><strong>{counts.items}</strong><span>بند مسجل في قاعدة المعرفة</span></Link>
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
          <article className="status-overview ended"><span>انتهت مدتها</span><strong>{timingCounts.ended}</strong><small>بحسب جميع أوامر العمل</small></article>
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
            <Link href="/alerts" className="text-link">عرض المركز</Link>
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
          <div className="dashboard-section-head"><div><span className="section-kicker">حركة المواقع</span><h2>المواقع الأكثر نشاطًا</h2></div><Link href="/sites" className="text-link">كل المواقع</Link></div>
          <div className="dashboard-activity-list">
            {sites.slice(0, 5).map((site, index) => (
              <Link href={`/site/${site.site_id}`} className="dashboard-site-row" key={site.site_id}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div><b>{site.site_name}</b><small>{site.project_name}</small></div>
                <div className="dashboard-site-metrics"><b>{site.work_orders_count}</b><small>أمر عمل</small></div>
              </Link>
            ))}
            {!loading && sites.length === 0 && <div className="empty">لا توجد مواقع مرتبطة بأوامر عمل.</div>}
          </div>
        </div>
      </section>

      <section className="dashboard-decision-strip">
        <div><span>الرصيد المتبقي المسجل</span><strong>{formatNumber(totalRemaining)}</strong></div>
        <p>هذا الرقم ملخص من البنود المسجلة، ويمكن فتح قسم البنود للوصول إلى تفاصيل الكميات.</p>
        <Link href="/items" className="text-link">فتح البنود ←</Link>
      </section>
    </main>
  );
}
