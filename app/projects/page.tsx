'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
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
  contract_number: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  contract_value: number | null;
  owner_entity: string | null;
  supervisor_name: string | null;
  created_at: string | null;
  updated_at: string | null;
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
type ProjectForm = {
  name: string; code: string; municipality: string; contractor_name: string; status: string; description: string;
  contract_number: string; contract_start_date: string; contract_end_date: string; contract_value: string; owner_entity: string; supervisor_name: string;
};

const emptyProjectForm: ProjectForm = {
  name: '', code: '', municipality: '', contractor_name: '', status: 'active', description: '',
  contract_number: '', contract_start_date: '', contract_end_date: '', contract_value: '', owner_entity: '', supervisor_name: '',
};

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
  if (['archived', 'مؤرشف'].includes(value)) return 'مؤرشف';
  return status || 'نشط';
}


function ProjectMenuIcon({ name }: { name: 'edit' | 'contract' | 'sites' | 'items' | 'orders' | 'stats' | 'archive' | 'restore' | 'trash' | 'user' | 'clock' }) {
  const paths: Record<string, ReactNode> = {
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></>,
    contract: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></>,
    sites: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    items: <><path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/></>,
    orders: <><rect width="16" height="18" x="4" y="3" rx="2"/><path d="M9 3V1h6v2"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/></>,
    stats: <><path d="M3 3v18h18"/><path d="m7 16 4-5 4 3 5-7"/></>,
    archive: <><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v12h16V8"/><path d="M10 12h4"/></>,
    restore: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></>,
    trash: <><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 15H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  };
  return <svg className="project-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function relativeUpdate(value: string | null) {
  if (!value) return 'غير مسجل';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'غير مسجل';
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.round(hours / 24);
  if (days < 30) return `قبل ${days} يوم`;
  return new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium' }).format(new Date(value));
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
  const [message, setMessage] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);
  const [form, setForm] = useState<ProjectForm>(emptyProjectForm);
  const [saving, setSaving] = useState(false);
  const [actionProjectId, setActionProjectId] = useState('');
  const [menuProjectId, setMenuProjectId] = useState('');
  const [createdProject, setCreatedProject] = useState<Project | null>(null);
  const [editorTab, setEditorTab] = useState<'basic' | 'contract'>('basic');
  const [statsProject, setStatsProject] = useState<ProjectSummary | null>(null);
  const [deleteProject, setDeleteProject] = useState<ProjectSummary | null>(null);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);

  useEffect(() => { void loadProjects(); }, []);

  async function loadProjects() {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    setError('');

    const [projectResult, siteResult, orderResult, boqResult] = await Promise.all([
      supabase.from('projects').select('id,name,code,municipality,contractor_name,status,description,contract_number,contract_start_date,contract_end_date,contract_value,owner_entity,supervisor_name,created_at,updated_at').order('created_at', { ascending: false }),
      supabase.from('sites').select('id,project_id'),
      supabase.from('work_orders').select('id,project_id,work_order_date,work_order_end_date,status'),
      supabase.from('project_boq_items').select('project_id'),
    ]);

    const firstError = [projectResult.error, siteResult.error, orderResult.error, boqResult.error].find(Boolean);
    if (firstError) setError(firstError.message);

    setProjects(((projectResult.data || []) as Project[]).filter((project) => project.status !== 'deleted'));
    setSites((siteResult.data || []) as Site[]);
    setOrders((orderResult.data || []) as WorkOrder[]);
    setBoqItems((boqResult.data || []) as BoqItem[]);
    setLoading(false);
  }


  function openCreateProject() {
    setEditingProject(null);
    setForm(emptyProjectForm);
    setEditorTab('basic');
    setEditorOpen(true);
    setMessage('');
  }

  function openEditProject(project: ProjectSummary) {
    setEditingProject(project);
    setForm({
      name: project.name || '',
      code: project.code || '',
      municipality: project.municipality || '',
      contractor_name: project.contractor_name || '',
      status: project.status || 'active',
      description: project.description || '',
      contract_number: project.contract_number || '',
      contract_start_date: project.contract_start_date || '',
      contract_end_date: project.contract_end_date || '',
      contract_value: project.contract_value == null ? '' : String(project.contract_value),
      owner_entity: project.owner_entity || '',
      supervisor_name: project.supervisor_name || '',
    });
    setEditorTab('basic');
    setEditorOpen(true);
    setMenuProjectId('');
    setMessage('');
  }

  async function saveProject(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) { setMessage('اسم المشروع مطلوب.'); return; }
    setSaving(true);
    setMessage('');
    try {
      const endpoint = editingProject ? `/api/projects/${editingProject.id}` : '/api/projects';
      const response = await fetch(endpoint, {
        method: editingProject ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'تعذر حفظ المشروع.');
      if (editingProject) {
        setEditorOpen(false);
        setMessage('تم تحديث بيانات المشروع بنجاح.');
      } else {
        setCreatedProject(data.project as Project);
      }
      await loadProjects();
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : 'تعذر حفظ المشروع.');
    } finally {
      setSaving(false);
    }
  }

  async function archiveProject(project: ProjectSummary) {
    const nextStatus = project.status === 'archived' ? 'active' : 'archived';
    const confirmation = nextStatus === 'archived'
      ? `هل تريد أرشفة المشروع «${project.name}»؟ ستبقى جميع بياناته محفوظة.`
      : `هل تريد إعادة المشروع «${project.name}» إلى الحالة النشطة؟`;
    if (!window.confirm(confirmation)) return;
    setActionProjectId(project.id);
    setMessage('');
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'تعذر تحديث حالة المشروع.');
      setMessage(nextStatus === 'archived' ? 'تمت أرشفة المشروع.' : 'تمت إعادة تنشيط المشروع.');
      await loadProjects();
    } catch (actionError) {
      setMessage(actionError instanceof Error ? actionError.message : 'تعذر تحديث حالة المشروع.');
    } finally {
      setActionProjectId('');
      setMenuProjectId('');
    }
  }

  async function trashProject(project: ProjectSummary) {
    setActionProjectId(project.id);
    setMessage('');
    try {
      const response = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'تعذر حذف المشروع.');
      setMessage(`تم حذف المشروع نهائيًا مع جميع بياناته المرتبطة${data.removed ? ` (${data.removed.workOrders || 0} أمر عمل، ${data.removed.sites || 0} موقع)` : ''}.`);
      setDeleteProject(null);
      setDeleteConfirmed(false);
      await loadProjects();
    } catch (actionError) {
      setMessage(actionError instanceof Error ? actionError.message : 'تعذر حذف المشروع.');
    } finally {
      setActionProjectId('');
      setMenuProjectId('');
    }
  }

  function contractProgress(project: ProjectSummary) {
    if (!project.contract_start_date || !project.contract_end_date) return null;
    const start = new Date(`${project.contract_start_date}T00:00:00`).getTime();
    const end = new Date(`${project.contract_end_date}T23:59:59`).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    const now = Date.now();
    const percent = Math.max(0, Math.min(100, Math.round(((now - start) / (end - start)) * 100)));
    return { percent, daysTotal: Math.max(1, Math.ceil((end - start) / 86400000)), daysRemaining: Math.max(0, Math.ceil((end - now) / 86400000)) };
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
      {message && <div className="project-admin-message">{message}<button type="button" onClick={() => setMessage('')}>×</button></div>}

      <section className="projects-hero">
        <div>
          <span className="eyebrow">إدارة المشاريع</span>
          <h1>المشاريع المسجلة</h1>
          <p>نقطة الدخول لجميع المواقع وأوامر العمل والبنود، مع متابعة الحالة التشغيلية لكل مشروع.</p>
        </div>
        <div className="projects-hero-actions">
          <button className="btn project-create-button" type="button" onClick={openCreateProject}>+ مشروع جديد</button>
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
          <option value="مؤرشف">مؤرشف</option>
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
                <div className="project-card-admin-tools">
                  <span className={`project-status-chip status-${statusLabel(project.status)}`}>{statusLabel(project.status)}</span>
                  <button type="button" className="project-more-button" aria-label="إجراءات المشروع" onClick={() => setMenuProjectId((current) => current === project.id ? '' : project.id)}>⋮</button>
                  {menuProjectId === project.id ? <div className="project-action-menu">
                    <button type="button" onClick={() => openEditProject(project)}><ProjectMenuIcon name="edit" /><span>تعديل المشروع</span></button>
                    <div className="project-action-separator" aria-hidden="true" />
                    <button type="button" onClick={() => { openEditProject(project); setEditorTab('contract'); }}><ProjectMenuIcon name="contract" /><span>بيانات العقد</span></button>
                    <Link href={`/sites?project=${project.id}`}><ProjectMenuIcon name="sites" /><span>إدارة المواقع</span></Link>
                    <Link href={`/items?project=${project.id}`}><ProjectMenuIcon name="items" /><span>إدارة البنود</span></Link>
                    <Link href={`/work-orders?project=${project.id}`}><ProjectMenuIcon name="orders" /><span>أوامر العمل</span></Link>
                    <div className="project-action-separator" aria-hidden="true" />
                    <button type="button" onClick={() => { setStatsProject(project); setMenuProjectId(''); }}><ProjectMenuIcon name="stats" /><span>إحصائيات المشروع</span></button>
                    <button type="button" onClick={() => void archiveProject(project)} disabled={actionProjectId === project.id}><ProjectMenuIcon name={project.status === 'archived' ? 'restore' : 'archive'} /><span>{project.status === 'archived' ? 'إعادة التنشيط' : 'أرشفة المشروع'}</span></button>
                    <div className="project-action-separator" aria-hidden="true" />
                    <button type="button" className="danger" onClick={() => { setDeleteProject(project); setDeleteConfirmed(false); setMenuProjectId(''); }} disabled={actionProjectId === project.id}><ProjectMenuIcon name="trash" /><span>حذف المشروع</span></button>
                  </div> : null}
                </div>
              </div>
              <div className="project-card-copy">
                <h3 title={project.name}>{compactName(project.name)}</h3>
                <p>{[project.municipality, project.contractor_name].filter(Boolean).join(' · ') || project.description || 'لا توجد بيانات تعريفية إضافية.'}</p>
                {project.code && <code>{project.code}</code>}
                {(project.contract_number || project.contract_start_date || project.contract_end_date) ? <div className="project-contract-brief">
                  {project.contract_number ? <span>عقد {project.contract_number}</span> : null}
                  {project.contract_start_date ? <span>من {project.contract_start_date}</span> : null}
                  {project.contract_end_date ? <span>إلى {project.contract_end_date}</span> : null}
                </div> : null}
                <div className="project-card-info-strip">
                  <span><ProjectMenuIcon name="user" /><span><small>المشرف</small><b>{project.supervisor_name || 'غير مسجل'}</b></span></span>
                  <span><ProjectMenuIcon name="clock" /><span><small>آخر تحديث</small><b>{relativeUpdate(project.updated_at || project.created_at)}</b></span></span>
                </div>
              </div>
              {contractProgress(project) ? <div className="project-contract-progress">
                <div><span>تقدم مدة العقد</span><b>{contractProgress(project)?.percent}%</b></div>
                <div className="project-contract-progress-track"><i style={{ width: `${contractProgress(project)?.percent}%` }} /></div>
                <small>{contractProgress(project)?.daysRemaining} يوم متبقٍ من أصل {contractProgress(project)?.daysTotal} يوم</small>
              </div> : null}
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
              <div className="project-card-actions project-card-actions-hierarchy">
                <Link href={`/project/${project.id}`} className="btn primary project-open-main">فتح المشروع</Link>
                <div className="project-card-shortcuts">
                  <Link href={`/sites?project=${project.id}`} className="btn">المواقع</Link>
                  <Link href={`/items?project=${project.id}`} className="btn">البنود</Link>
                  <Link href={`/work-orders?project=${project.id}`} className="btn">أوامر العمل</Link>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="projects-table-wrap">
          <table className="projects-management-table">
            <colgroup>
              <col className="project-col-name" />
              <col className="project-col-status" />
              <col className="project-col-number" />
              <col className="project-col-number" />
              <col className="project-col-number" />
              <col className="project-col-number" />
              <col className="project-col-number" />
              <col className="project-col-action" />
            </colgroup>
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
              <td><div className="project-table-actions"><Link href={`/project/${project.id}`} className="text-link">فتح ←</Link><button type="button" onClick={() => openEditProject(project)} title="تعديل المشروع">✎</button></div></td>
            </tr>)}</tbody>
          </table>
        </section>
      )}

      {!loading && filtered.length === 0 && <div className="projects-empty-state"><b>لا توجد مشاريع مطابقة</b><span>غيّر عبارة البحث أو الفلاتر المستخدمة.</span><button className="btn" onClick={() => { setQuery(''); setStatusFilter('all'); setTimingFilter('all'); }}>إعادة ضبط الفلاتر</button></div>}

      {editorOpen ? <div className="project-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) { setEditorOpen(false); setCreatedProject(null); } }}>
        <section className="project-editor-modal" role="dialog" aria-modal="true" aria-label={editingProject ? 'تعديل المشروع' : 'إنشاء مشروع جديد'}>
          <div className="project-editor-head">
            <div><span className="eyebrow">{editingProject ? 'تعديل البيانات' : 'إضافة مشروع'}</span><h2>{editingProject ? 'تحديث المشروع' : 'مشروع جديد'}</h2><p>أدخل البيانات التعريفية الأساسية. يمكن إضافة المواقع والبنود وأوامر العمل بعد الحفظ.</p></div>
            <button type="button" onClick={() => { setEditorOpen(false); setCreatedProject(null); }} disabled={saving} aria-label="إغلاق">×</button>
          </div>
          <form className="project-editor-form" onSubmit={saveProject}>
            {createdProject && !editingProject ? <div className="project-create-success wide">
              <div className="project-create-success-icon">✓</div>
              <span className="eyebrow">تم الإنشاء بنجاح</span>
              <h3>{createdProject.name}</h3>
              <p>أصبح المشروع جاهزًا لإضافة المواقع وبنود العقد وإنشاء أوامر العمل.</p>
              <div className="project-create-next-actions">
                <Link href={`/project/${createdProject.id}`} className="btn primary">فتح المشروع وإضافة البيانات</Link>
                <Link href={`/sites?project=${createdProject.id}`} className="btn">إدارة المواقع</Link>
                <Link href={`/items?project=${createdProject.id}`} className="btn">إدارة البنود</Link>
                <Link href={`/work-orders/new?project=${createdProject.id}`} className="btn">إنشاء أمر عمل</Link>
                <button type="button" className="btn" onClick={() => { setCreatedProject(null); setForm(emptyProjectForm); }}>إنشاء مشروع آخر</button>
              </div>
            </div> : <>
            <div className="project-editor-tabs project-wizard-tabs wide">
              <button type="button" className={editorTab === 'basic' ? 'active' : editorTab === 'contract' ? 'complete' : ''} onClick={() => setEditorTab('basic')}>
                <span className="wizard-step-mark">{editorTab === 'contract' ? '✓' : '1'}</span>
                <span><small>الخطوة الأولى</small><b>البيانات الأساسية</b></span>
              </button>
              <span className="wizard-connector" aria-hidden="true" />
              <button type="button" className={editorTab === 'contract' ? 'active' : ''} onClick={() => setEditorTab('contract')}>
                <span className="wizard-step-mark">2</span>
                <span><small>الخطوة الثانية</small><b>بيانات العقد</b></span>
              </button>
            </div>
            <div key={editorTab} className="project-editor-tab-panel wide">
            {editorTab === 'basic' ? <>
            <label className="wide"><span>اسم المشروع *</span><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required autoFocus /></label>
            <label><span>رمز المشروع</span><input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} placeholder="مثال: PRJ-07" /></label>
            <label><span>الحالة</span><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}><option value="active">نشط</option><option value="paused">متوقف</option><option value="completed">منتهي</option><option value="archived">مؤرشف</option></select></label>
            <label><span>البلدية</span><input value={form.municipality} onChange={(event) => setForm((current) => ({ ...current, municipality: event.target.value }))} /></label>
            <label><span>المقاول</span><input value={form.contractor_name} onChange={(event) => setForm((current) => ({ ...current, contractor_name: event.target.value }))} /></label>
            <label className="wide"><span>الوصف</span><textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={4} /></label>
            </> : <>
            <label><span>رقم العقد</span><input value={form.contract_number} onChange={(event) => setForm((current) => ({ ...current, contract_number: event.target.value }))} placeholder="مثال: 2026/17" /></label>
            <label><span>الجهة المالكة</span><input value={form.owner_entity} onChange={(event) => setForm((current) => ({ ...current, owner_entity: event.target.value }))} placeholder="مثال: أمانة محافظة جدة" /></label>
            <label><span>تاريخ بداية العقد</span><input type="date" value={form.contract_start_date} onChange={(event) => setForm((current) => ({ ...current, contract_start_date: event.target.value }))} /></label>
            <label><span>تاريخ نهاية العقد</span><input type="date" value={form.contract_end_date} onChange={(event) => setForm((current) => ({ ...current, contract_end_date: event.target.value }))} /></label>
            <label><span>قيمة العقد</span><input type="number" min="0" step="0.01" value={form.contract_value} onChange={(event) => setForm((current) => ({ ...current, contract_value: event.target.value }))} placeholder="0.00" /></label>
            <label><span>المشرف المسؤول</span><input value={form.supervisor_name} onChange={(event) => setForm((current) => ({ ...current, supervisor_name: event.target.value }))} /></label>
            </>}
            </div>
            <div className="project-editor-actions wide"><button type="button" className="btn" onClick={() => setEditorOpen(false)} disabled={saving}>إلغاء</button><button type="submit" className="btn primary" disabled={saving}>{saving ? 'جاري الحفظ...' : editingProject ? 'حفظ التعديلات' : 'إنشاء المشروع'}</button></div>
            </>}
          </form>
        </section>
      </div> : null}

      {statsProject ? <div className="project-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setStatsProject(null); }}>
        <section className="project-stats-modal" role="dialog" aria-modal="true" aria-label="إحصائيات المشروع">
          <div className="project-editor-head"><div><span className="eyebrow">ملخص تنفيذي</span><h2>إحصائيات المشروع</h2><p>{statsProject.name}</p></div><button type="button" onClick={() => setStatsProject(null)}>×</button></div>
          <div className="project-stats-grid">
            <article><small>قيمة العقد</small><strong>{statsProject.contract_value == null ? 'غير مسجلة' : new Intl.NumberFormat('ar-SA').format(statsProject.contract_value)}</strong></article>
            <article><small>المواقع</small><strong>{statsProject.sitesCount}</strong></article>
            <article><small>أوامر العمل</small><strong>{statsProject.ordersCount}</strong></article>
            <article><small>بنود العقد</small><strong>{statsProject.itemsCount}</strong></article>
            <article><small>الأوامر الجارية</small><strong>{statsProject.activeOrders}</strong></article>
            <article><small>الأوامر القادمة</small><strong>{statsProject.upcomingOrders}</strong></article>
          </div>
          {contractProgress(statsProject) ? <div className="project-stats-progress"><div><span>تقدم مدة العقد</span><b>{contractProgress(statsProject)?.percent}%</b></div><div className="project-contract-progress-track"><i style={{ width: `${contractProgress(statsProject)?.percent}%` }} /></div><p>{contractProgress(statsProject)?.daysRemaining} يوم متبقٍ من مدة العقد.</p></div> : <div className="notice">أضف تاريخي بداية ونهاية العقد لإظهار التقدم الزمني.</div>}
          <div className="project-stats-note">مؤشرات المنفذ والمحجوز والمتبقي ستظهر هنا تلقائيًا بعد تفعيل مرحلة تسجيل التنفيذ الميداني.</div>
          <div className="project-editor-actions"><button type="button" className="btn" onClick={() => setStatsProject(null)}>إغلاق</button><Link className="btn primary" href={`/project/${statsProject.id}`}>فتح المشروع</Link></div>
        </section>
      </div> : null}

      {deleteProject ? <div className="project-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !actionProjectId) setDeleteProject(null); }}>
        <section className="project-delete-modal" role="dialog" aria-modal="true" aria-label="حذف المشروع">
          <div className="project-editor-head"><div><span className="eyebrow danger-text">إجراء حساس</span><h2>حذف المشروع</h2><p>{deleteProject.name}</p></div><button type="button" onClick={() => setDeleteProject(null)} disabled={!!actionProjectId}>×</button></div>
          <div className="project-delete-counts"><article><strong>{deleteProject.sitesCount}</strong><span>موقع</span></article><article><strong>{deleteProject.ordersCount}</strong><span>أمر عمل</span></article><article><strong>{deleteProject.itemsCount}</strong><span>بند عقد</span></article></div>
          <div className="project-delete-warning"><b>حذف نهائي وشامل</b><p>سيتم حذف المشروع وجميع أوامر العمل والمواقع وبنود العقد وسجلات الاستيراد المرتبطة به. لا يمكن التراجع عن هذه العملية.</p></div>
          <label className="project-delete-confirm"><input type="checkbox" checked={deleteConfirmed} onChange={(event) => setDeleteConfirmed(event.target.checked)} disabled={!!actionProjectId}/><span>أفهم أن جميع بيانات المشروع المرتبطة ستُحذف نهائيًا.</span></label>
          <div className="project-editor-actions">
            <button type="button" className="btn" onClick={() => setDeleteProject(null)} disabled={!!actionProjectId}>إلغاء</button>
            <button type="button" className="btn" onClick={() => { void archiveProject(deleteProject); setDeleteProject(null); }} disabled={!!actionProjectId}>{deleteProject.status === 'archived' ? 'إعادة التنشيط' : 'أرشفة المشروع'}</button>
            <button type="button" className="btn danger-button" onClick={() => void trashProject(deleteProject)} disabled={!!actionProjectId || !deleteConfirmed}>{actionProjectId ? 'جاري الحذف...' : 'حذف المشروع وكل بياناته'}</button>
          </div>
        </section>
      </div> : null}
    </main>
  );
}
