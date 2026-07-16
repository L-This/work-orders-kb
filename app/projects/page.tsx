'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getWorkOrderTiming } from '@/lib/work-order-timing';

 type Project = {
  id: string;
  name: string;
  code: string | null;
  municipality: string | null;
  contractor_name: string | null;
  status: string | null;
  description: string | null;
  created_at: string | null;
};

type Site = { id: string; project_id: string };
type WorkOrder = {
  id: string;
  project_id: string;
  work_order_date: string | null;
  work_order_end_date: string | null;
  status: string | null;
};
type BoqItem = { project_id: string };

type ProjectSummary = Project & {
  sitesCount: number;
  ordersCount: number;
  itemsCount: number;
  activeOrders: number;
  upcomingOrders: number;
  endingSoonOrders: number;
  endedOrders: number;
};

type SortKey = 'name' | 'orders' | 'sites' | 'activity';
type ViewMode = 'cards' | 'table';

function compactName(name: string) {
  return name
    .replace(/مشروع\s+/g, '')
    .replace(/محافظة\s+جدة\s*[-–—]?\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function statusLabel(status: string | null) {
  const value = (status || 'active').toLowerCase();
  if (['active', 'نشط'].includes(value)) return 'نشط';
  if (['completed', 'منتهي'].includes(value)) return 'منتهي';
  if (['paused', 'متوقف'].includes(value)) return 'متوقف';
  return status || 'نشط';
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [boqItems, setBoqItems] = useState<BoqItem[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [timingFilter, setTimingFilter] = useState('all');
  const [sort, setSort] = useState<SortKey>('activity');
  const [view, setView] = useState<ViewMode>('cards');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { void loadProjects(); }, []);

  async function loadProjects() {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    setError('');

    const [projectResult, siteResult, orderResult, boqResult] = await Promise.all([
      supabase.from('projects').select('id,name,code,municipality,contractor_name,status,description,created_at').order('created_at', { ascending: false }),
      supabase.from('sites').select('id,project_id'),
      supabase.from('work_orders').select('id,project_id,work_order_date,work_order_end_date,status'),
      supabase.from('project_boq_items').select('project_id'),
    ]);

    const firstError = [projectResult.error, siteResult.error, orderResult.error, boqResult.error].find(Boolean);
    if (firstError) setError(firstError.message);

    setProjects((projectResult.data || []) as Project[]);
    setSites((siteResult.data || []) as Site[]);
    setOrders((orderResult.data || []) as WorkOrder[]);
    setBoqItems((boqResult.data || []) as BoqItem[]);
    setLoading(false);
  }

  const summaries = useMemo<ProjectSummary[]>(() => projects.map((project) => {
    const projectOrders = orders.filter((order) => order.project_id === project.id);
    const timings = projectOrders.map((order) => getWorkOrderTiming(order.work_order_date, order.work_order_end_date));
    return {
      ...project,
      sitesCount: sites.filter((site) => site.project_id === project.id).length,
      ordersCount: projectOrders.length,
      itemsCount: boqItems.filter((item) => item.project_id === project.id).length,
      activeOrders: timings.filter((timing) => timing.phase === 'active').length,
      upcomingOrders: timings.filter((timing) => timing.phase === 'upcoming').length,
      endingSoonOrders: timings.filter((timing) => timing.phase === 'active' && (timing.days ?? 9999) <= 30).length,
      endedOrders: timings.filter((timing) => timing.phase === 'ended').length,
    };
  }), [projects, sites, orders, boqItems]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const result = summaries.filter((project) => {
      const searchable = `${project.name} ${project.code || ''} ${project.contractor_name || ''} ${project.municipality || ''}`.toLowerCase();
      const statusMatches = statusFilter === 'all' || statusLabel(project.status) === statusFilter;
      const timingMatches = timingFilter === 'all'
        || (timingFilter === 'active' && project.activeOrders > 0)
        || (timingFilter === 'upcoming' && project.upcomingOrders > 0)
        || (timingFilter === 'ending' && project.endingSoonOrders > 0)
        || (timingFilter === 'without-orders' && project.ordersCount === 0);
      return (!term || searchable.includes(term)) && statusMatches && timingMatches;
    });

    return [...result].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'ar');
      if (sort === 'orders') return b.ordersCount - a.ordersCount;
      if (sort === 'sites') return b.sitesCount - a.sitesCount;
      return (b.activeOrders + b.upcomingOrders + b.endingSoonOrders) - (a.activeOrders + a.upcomingOrders + a.endingSoonOrders);
    });
  }, [summaries, query, statusFilter, timingFilter, sort]);

  const totals = useMemo(() => ({
    projects: summaries.length,
    sites: summaries.reduce((sum, row) => sum + row.sitesCount, 0),
    orders: summaries.reduce((sum, row) => sum + row.ordersCount, 0),
    active: summaries.reduce((sum, row) => sum + row.activeOrders, 0),
    attention: summaries.filter((row) => row.endingSoonOrders > 0 || row.upcomingOrders > 0).length,
  }), [summaries]);

  return (
    <main className="page projects-management-page">
      {!isSupabaseConfigured && <div className="notice">لم يتم ربط Supabase بعد.</div>}
      {error && <div className="notice error-notice">تعذر تحميل بعض بيانات المشاريع: {error}</div>}

      <section className="projects-hero">
        <div>
          <span className="eyebrow">إدارة المشاريع</span>
          <h1>المشاريع المسجلة</h1>
          <p>نقطة الدخول لجميع المواقع وأوامر العمل والبنود، مع متابعة الحالة التشغيلية لكل مشروع.</p>
        </div>
        <div className="projects-hero-actions">
          <button className="btn" onClick={() => void loadProjects()} disabled={loading}>{loading ? 'جاري التحديث...' : 'تحديث البيانات'}</button>
          <Link href="/import" className="btn primary">استيراد مشروع</Link>
        </div>
      </section>

      <section className="projects-summary-grid">
        <article><small>المشاريع</small><strong>{totals.projects}</strong><span>مشروع مسجل</span></article>
        <article><small>المواقع</small><strong>{totals.sites}</strong><span>ضمن جميع المشاريع</span></article>
        <article><small>أوامر العمل</small><strong>{totals.orders}</strong><span>أمر مرتبط بالمشاريع</span></article>
        <article><small>الجارية الآن</small><strong>{totals.active}</strong><span>أوامر ضمن فترة التنفيذ</span></article>
        <article className={totals.attention ? 'attention' : ''}><small>تحتاج متابعة</small><strong>{totals.attention}</strong><span>مشاريع بها موعد قريب</span></article>
      </section>

      <section className="projects-toolbar">
        <div className="projects-search-field">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم المشروع، البلدية، المقاول أو الرمز..." />
          {query && <button onClick={() => setQuery('')} aria-label="مسح البحث">×</button>}
        </div>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="حالة المشروع">
          <option value="all">كل حالات المشاريع</option>
          <option value="نشط">نشط</option>
          <option value="منتهي">منتهي</option>
          <option value="متوقف">متوقف</option>
        </select>
        <select value={timingFilter} onChange={(event) => setTimingFilter(event.target.value)} aria-label="المتابعة الزمنية">
          <option value="all">كل الحالات الزمنية</option>
          <option value="active">بها أوامر جارية</option>
          <option value="upcoming">بها أوامر قادمة</option>
          <option value="ending">قريبة من الانتهاء</option>
          <option value="without-orders">بدون أوامر عمل</option>
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label="ترتيب المشاريع">
          <option value="activity">الأكثر نشاطًا</option>
          <option value="orders">الأكثر أوامر عمل</option>
          <option value="sites">الأكثر مواقع</option>
          <option value="name">الاسم أبجديًا</option>
        </select>
        <div className="projects-view-switch" aria-label="طريقة العرض">
          <button className={view === 'cards' ? 'active' : ''} onClick={() => setView('cards')}>▦</button>
          <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>▤</button>
        </div>
      </section>

      <section className="projects-results-head">
        <div><span className="section-kicker">النتائج</span><h2>دليل المشاريع</h2></div>
        <strong>{filtered.length} من {summaries.length} مشروع</strong>
      </section>

      {view === 'cards' ? (
        <section className="projects-management-grid">
          {filtered.map((project, index) => (
            <article className="project-management-card" key={project.id}>
              <div className="project-card-topline">
                <span className="project-order-index">{String(index + 1).padStart(2, '0')}</span>
                <span className={`project-status-chip status-${statusLabel(project.status)}`}>{statusLabel(project.status)}</span>
              </div>
              <div className="project-card-copy">
                <h3 title={project.name}>{compactName(project.name)}</h3>
                <p>{[project.municipality, project.contractor_name].filter(Boolean).join(' · ') || project.description || 'لا توجد بيانات تعريفية إضافية.'}</p>
                {project.code && <code>{project.code}</code>}
              </div>
              <div className="project-card-metrics">
                <div><small>المواقع</small><strong>{project.sitesCount}</strong></div>
                <div><small>أوامر العمل</small><strong>{project.ordersCount}</strong></div>
                <div><small>بنود العقد</small><strong>{project.itemsCount}</strong></div>
              </div>
              <div className="project-card-timing">
                <span><i className="timing-dot active" /> جارية <b>{project.activeOrders}</b></span>
                <span><i className="timing-dot upcoming" /> قادمة <b>{project.upcomingOrders}</b></span>
                <span><i className="timing-dot ending" /> تنتهي قريبًا <b>{project.endingSoonOrders}</b></span>
                <span><i className="timing-dot ended" /> منتهية <b>{project.endedOrders}</b></span>
              </div>
              <div className="project-card-actions">
                <Link href={`/project/${project.id}`} className="btn primary">فتح المشروع</Link>
                <Link href={`/work-orders?project=${project.id}`} className="btn">أوامر العمل</Link>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="projects-table-wrap">
          <table className="projects-management-table">
            <thead><tr><th>المشروع</th><th>الحالة</th><th>المواقع</th><th>الأوامر</th><th>الجارية</th><th>القادمة</th><th>البنود</th><th></th></tr></thead>
            <tbody>{filtered.map((project) => <tr key={project.id}>
              <td className="project-table-name-cell">
                <Link href={`/project/${project.id}`} className="project-table-name-link" title={project.name}>
                  <b>{project.name}</b>
                </Link>
                <small title={[project.municipality, project.contractor_name].filter(Boolean).join(' · ')}>
                  {[project.municipality, project.contractor_name].filter(Boolean).join(' · ') || '—'}
                </small>
              </td>
              <td><span className={`project-status-chip status-${statusLabel(project.status)}`}>{statusLabel(project.status)}</span></td>
              <td>{project.sitesCount}</td><td>{project.ordersCount}</td><td>{project.activeOrders}</td><td>{project.upcomingOrders}</td><td>{project.itemsCount}</td>
              <td><Link href={`/project/${project.id}`} className="text-link">فتح ←</Link></td>
            </tr>)}</tbody>
          </table>
        </section>
      )}

      {!loading && filtered.length === 0 && <div className="projects-empty-state"><b>لا توجد مشاريع مطابقة</b><span>غيّر عبارة البحث أو الفلاتر المستخدمة.</span><button className="btn" onClick={() => { setQuery(''); setStatusFilter('all'); setTimingFilter('all'); }}>إعادة ضبط الفلاتر</button></div>}
    </main>
  );
}
