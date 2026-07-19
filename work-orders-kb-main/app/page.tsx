'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getWorkOrderTiming } from '@/lib/work-order-timing';

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

type DashboardCounts = {
  projects: number;
  sites: number;
  workOrders: number;
  items: number;
};

const initialCounts: DashboardCounts = { projects: 0, sites: 0, workOrders: 0, items: 0 };

export default function Home() {
  const [recentOrders, setRecentOrders] = useState<WorkOrder[]>([]);
  const [counts, setCounts] = useState<DashboardCounts>(initialCounts);
  const [error, setError] = useState('');

  useEffect(() => {
    void loadDashboard();
  }, []);

  async function loadDashboard() {
    if (!isSupabaseConfigured) {
      return;
    }

    setError('');

    const [
      projectsResult,
      sitesCountResult,
      ordersCountResult,
      itemsCountResult,
      ordersResult,
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
    ]);

    const firstError = [
      projectsResult.error,
      sitesCountResult.error,
      ordersCountResult.error,
      itemsCountResult.error,
      ordersResult.error,
    ].find(Boolean);

    if (firstError) setError(firstError.message);

    setCounts({
      projects: projectsResult.count ?? projectsResult.data?.length ?? 0,
      sites: sitesCountResult.count ?? 0,
      workOrders: ordersCountResult.count ?? 0,
      items: itemsCountResult.count ?? 0,
    });
    setRecentOrders((ordersResult.data || []) as unknown as WorkOrder[]);
  }

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
  const timingTotal = Math.max(1, orderTiming.length);

  const alerts = useMemo(() => orderTiming
    .filter(({ timing }) =>
      (timing.phase === 'upcoming' && (timing.days ?? 9999) <= 30) ||
      (timing.phase === 'active' && (timing.days ?? 9999) <= 30)
    ), [orderTiming]);

  return (
    <main className="page executive-dashboard">
      {!isSupabaseConfigured && (
        <div className="notice">لم يتم ربط Supabase بعد. أضف متغيرات الاتصال في Vercel.</div>
      )}
      {error && <div className="notice error-notice">تعذر تحميل بعض البيانات: {error}</div>}

      <section className="dashboard-welcome">
        <div className="dashboard-welcome-copy">
          <span className="dashboard-eyebrow"><i /> لوحة القيادة</span>
          <h1>مركز القرار التشغيلي</h1>
          <p>ابدأ بما يحتاج تدخلك الآن، ثم انتقل مباشرة إلى المشروع أو أمر العمل أو الموقع.</p>
          <div className="dashboard-live-line"><span>●</span> بيانات مباشرة من قاعدة النظام</div>
        </div>
        <div className="dashboard-focus-card">
          <small>الأولوية الحالية</small>
          <strong>{alerts.length}</strong>
          <span>{alerts.length === 1 ? 'أمر يحتاج متابعة زمنية' : 'أوامر تحتاج متابعة زمنية'}</span>
          <Link href="/alerts">فتح مركز التنبيهات</Link>
        </div>
      </section>

      <section className="dashboard-kpis">
        <Link href="/projects" className="dashboard-kpi projects"><span className="dashboard-kpi-icon">▦</span><div><small>المشاريع</small><strong>{counts.projects}</strong><span>مشروع مسجل</span></div><i>←</i></Link>
        <Link href="/sites" className="dashboard-kpi sites"><span className="dashboard-kpi-icon">⌖</span><div><small>المواقع</small><strong>{counts.sites}</strong><span>موقع مرتبط بالمشاريع</span></div><i>←</i></Link>
        <Link href="/work-orders" className="dashboard-kpi orders"><span className="dashboard-kpi-icon">▤</span><div><small>أوامر العمل</small><strong>{counts.workOrders}</strong><span>أمر في السجل</span></div><i>←</i></Link>
        <Link href="/items" className="dashboard-kpi items"><span className="dashboard-kpi-icon">≡</span><div><small>البنود</small><strong>{counts.items}</strong><span>بند في قاعدة المعرفة</span></div><i>←</i></Link>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section-head">
          <div><span className="section-kicker">المتابعة الزمنية</span><h2>حالة أوامر العمل</h2><p>توزيع زمني مباشر يساعدك على معرفة ما يحتاج تحركًا.</p></div>
          <Link href="/work-orders" className="dashboard-section-link">عرض السجل الكامل <span>←</span></Link>
        </div>
        <div className="status-overview-grid">
          <article className="status-overview active"><div><i>●</i><span>جارية الآن</span></div><strong>{timingCounts.active}</strong><small>أوامر ضمن فترة التنفيذ</small><em><b style={{width:`${Math.min(100,timingCounts.active/timingTotal*100)}%`}} /></em></article>
          <article className="status-overview upcoming"><div><i>◷</i><span>تبدأ قريبًا</span></div><strong>{timingCounts.upcoming}</strong><small>خلال 30 يومًا</small><em><b style={{width:`${Math.min(100,timingCounts.upcoming/timingTotal*100)}%`}} /></em></article>
          <article className="status-overview warning"><div><i>!</i><span>قريبة من الانتهاء</span></div><strong>{timingCounts.endingSoon}</strong><small>متبقٍ 30 يومًا أو أقل</small><em><b style={{width:`${Math.min(100,timingCounts.endingSoon/timingTotal*100)}%`}} /></em></article>
          <article className="status-overview ended"><div><i>✓</i><span>انتهت مدتها</span></div><strong>{timingCounts.ended}</strong><small>بحسب جميع أوامر العمل</small><em><b style={{width:`${Math.min(100,timingCounts.ended/timingTotal*100)}%`}} /></em></article>
        </div>
      </section>

    </main>
  );
}
