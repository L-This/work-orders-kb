'use client';
import { parseDateOnly } from '@/lib/helpers';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

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
        .select('id,project_id,work_order_number,work_order_date,title,status,projects(name)')
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

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ar');
    if (!normalized) return items.slice(0, 12);
    return items.filter((item) =>
      `${item.item_name} ${item.category || ''} ${item.unit || ''}`
        .toLocaleLowerCase('ar')
        .includes(normalized),
    );
  }, [items, query]);

  const totalRemaining = useMemo(
    () => items.reduce((sum, item) => sum + number(item.total_remaining_quantity), 0),
    [items],
  );

  return (
    <main className="page knowledge-page">
      {!isSupabaseConfigured && (
        <div className="notice">
          لم يتم ربط Supabase بعد. أضف في Vercel المتغيرين <b>NEXT_PUBLIC_SUPABASE_URL</b> و{' '}
          <b>NEXT_PUBLIC_SUPABASE_ANON_KEY</b>.
        </div>
      )}

      {error && <div className="notice error-notice">تعذر تحميل بعض البيانات: {error}</div>}

      <section className="knowledge-hero">
        <div>
          <span className="eyebrow">مركز المعرفة</span>
          <h1>كل مشروع، وكل موقع، وكل أمر عمل في مرجع واحد</h1>
          <p>
            راجع تاريخ المواقع، ابحث في البنود والكميات، وتحقق من الرصيد المتبقي قبل إصدار أي أمر عمل جديد.
          </p>
          <div className="actions">
            <Link className="btn primary" href="/import">استيراد ملف Excel</Link>
            <Link className="btn" href="/projects">فتح المشاريع</Link>
            <button className="btn" onClick={() => void loadDashboard()} disabled={loading}>
              {loading ? 'جاري التحديث...' : 'تحديث البيانات'}
            </button>
          </div>
        </div>
        <div className="decision-card">
          <span>قرار إصدار أمر عمل</span>
          <strong>راجع تاريخ الموقع قبل اعتماد الاحتياج</strong>
          <p>آخر أمر عمل، البنود السابقة، إجمالي الكميات، المنفذ والمتبقي تظهر لك في صفحة واحدة.</p>
          <div className="decision-metric">
            <small>إجمالي المتبقي المسجل</small>
            <b>{formatNumber(totalRemaining)}</b>
          </div>
        </div>
      </section>

      <section className="stats-grid dashboard-stats">
        <Link href="/projects" className="stat metric-link"><small>المشاريع</small><strong>{counts.projects}</strong><span>عرض جميع المشاريع</span></Link>
        <Link href="/sites" className="stat metric-link"><small>المواقع</small><strong>{counts.sites}</strong><span>فتح دليل المواقع</span></Link>
        <Link href="/work-orders" className="stat metric-link"><small>أوامر العمل</small><strong>{counts.workOrders}</strong><span>السجل التاريخي</span></Link>
        <div className="stat"><small>قاموس البنود</small><strong>{counts.items}</strong><span>بند موحد قابل للبحث</span></div>
      </section>

      <section className="dashboard-grid">
        <div className="section-block search-hub">
          <div className="section-title">
            <div><span className="section-kicker">البحث العام</span><h2>ابحث بنوع البند</h2></div>
            <span>يشمل كل المشاريع والمواقع</span>
          </div>
          <div className="search-row">
            <input
              className="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="مثال: شبكة ري، تربة زراعية، إنترلوك..."
            />
            {query && <button className="btn compact" onClick={() => setQuery('')}>مسح</button>}
          </div>
          <div className="result-cards">
            {filteredItems.map((item) => (
              <article className="item-result" key={item.item_id}>
                <div className="item-result-head">
                  <div><b>{item.item_name}</b><small>{item.category || 'بدون تصنيف'} · {item.unit || 'بدون وحدة'}</small></div>
                  <span>{item.work_orders_count} أمر</span>
                </div>
                <div className="item-result-metrics">
                  <span><small>مشاريع</small><b>{item.projects_count}</b></span>
                  <span><small>مواقع</small><b>{item.sites_count}</b></span>
                  <span><small>الكمية</small><b>{formatNumber(item.total_quantity)}</b></span>
                  <span className="remaining"><small>المتبقي</small><b>{formatNumber(item.total_remaining_quantity)}</b></span>
                </div>
                <div className="item-period">من {formatDate(item.first_work_order_date)} إلى {formatDate(item.last_work_order_date)}</div>
              </article>
            ))}
            {!loading && filteredItems.length === 0 && <div className="empty">لا توجد نتائج مطابقة.</div>}
          </div>
        </div>

        <aside className="section-block quick-panel">
          <div className="section-title"><h2>وصول سريع</h2></div>
          <Link className="quick-link" href="/import"><span>01</span><div><b>استيراد مشروع</b><small>رفع Excel ثم المراجعة قبل الاعتماد</small></div></Link>
          <Link className="quick-link" href="/projects"><span>02</span><div><b>البحث داخل مشروع</b><small>المواقع والبنود وأوامر العمل</small></div></Link>
          <Link className="quick-link" href="/sites"><span>03</span><div><b>قصة موقع</b><small>التسلسل الزمني والكميات السابقة</small></div></Link>
          <Link className="quick-link" href="/work-orders"><span>04</span><div><b>سجل أوامر العمل</b><small>عرض الأوامر حسب التاريخ والمشروع</small></div></Link>
        </aside>
      </section>

      <section className="section-block">
        <div className="section-title">
          <div><span className="section-kicker">المشاريع</span><h2>بوابة المشاريع</h2></div>
          <Link href="/projects" className="text-link">عرض الكل</Link>
        </div>
        <div className="project-grid">
          {projects.slice(0, 6).map((project) => (
            <Link href={`/project/${project.id}`} className="project-card rich-project-card" key={project.id}>
              <span className="badge">{project.status || 'active'}</span>
              <h3>{project.name}</h3>
              <p>{project.contractor_name || project.municipality || 'لم تضاف بيانات إضافية'}</p>
              <span className="card-action">فتح المشروع ←</span>
            </Link>
          ))}
          {!loading && projects.length === 0 && <div className="empty">لا توجد مشاريع في القاعدة حتى الآن.</div>}
        </div>
      </section>

      <section className="split-grid">
        <div className="section-block">
          <div className="section-title"><div><span className="section-kicker">آخر تحديثات العمل</span><h2>أحدث أوامر العمل</h2></div><Link href="/work-orders" className="text-link">السجل الكامل</Link></div>
          <div className="activity-list">
            {recentOrders.map((order) => (
              <article className="activity-row" key={order.id}>
                <div className="activity-date"><b>{formatDate(order.work_order_date)}</b><small>{order.status || 'approved'}</small></div>
                <div><strong>أمر عمل رقم {order.work_order_number}</strong><p>{order.title || order.projects?.name || 'بدون عنوان'}</p></div>
              </article>
            ))}
            {!loading && recentOrders.length === 0 && <div className="empty">لا توجد أوامر عمل مستوردة بعد.</div>}
          </div>
        </div>

        <div className="section-block">
          <div className="section-title"><div><span className="section-kicker">النشاط</span><h2>آخر ملفات الاستيراد</h2></div><Link href="/import" className="text-link">استيراد جديد</Link></div>
          <div className="activity-list">
            {recentImports.map((batch) => (
              <article className="activity-row" key={batch.id}>
                <div className="import-status" data-status={batch.import_status}>{batch.import_status}</div>
                <div><strong>{batch.file_name}</strong><p>{formatDate(batch.created_at)} · {batch.imported_rows_count || 0} صف مستورد · {batch.error_rows_count || 0} خطأ</p></div>
              </article>
            ))}
            {!loading && recentImports.length === 0 && <div className="empty">لم يتم استيراد أي ملف حتى الآن.</div>}
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-title"><div><span className="section-kicker">مؤشر الاستخدام</span><h2>أكثر المواقع ارتباطًا بأوامر العمل</h2></div><Link href="/sites" className="text-link">دليل المواقع</Link></div>
        <div className="site-ranking">
          {sites.map((site, index) => (
            <Link href={`/site/${site.site_id}`} className="ranking-row" key={site.site_id}>
              <span className="rank">{String(index + 1).padStart(2, '0')}</span>
              <div className="ranking-name"><b>{site.site_name}</b><small>{site.project_name}</small></div>
              <div><small>أوامر العمل</small><b>{site.work_orders_count}</b></div>
              <div><small>البنود</small><b>{site.items_count}</b></div>
              <div><small>المتبقي</small><b>{formatNumber(site.total_remaining_quantity)}</b></div>
              <div><small>آخر أمر</small><b>{formatDate(site.last_work_order_date)}</b></div>
            </Link>
          ))}
          {!loading && sites.length === 0 && <div className="empty">ستظهر المواقع هنا بعد استيراد بيانات بريمان.</div>}
        </div>
      </section>
    </main>
  );
}
