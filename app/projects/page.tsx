'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
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

  useEffect(() => { void loadProjects(); }, []);

  async function loadProjects() {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    setError('');

    const [projectResult, siteResult, orderResult, boqResult] = await Promise.all([
      supabase.from('projects').select('id,name,code,municipality,contractor_name,status,description,contract_number,contract_start_date,contract_end_date,contract_value,owner_entity,supervisor_name,created_at').order('created_at', { ascending: false }),
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
    if (!window.confirm(`نقل المشروع «${project.name}» إلى سلة المحذوفات؟ لا يمكن تنفيذ ذلك إذا كان مرتبطًا بمواقع أو بنود أو أوامر عمل.`)) return;
    setActionProjectId(project.id);
    setMessage('');
    try {
      const response = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'تعذر حذف المشروع.');
      setMessage('تم نقل المشروع إلى سلة المحذوفات.');
      await loadProjects();
    } catch (actionError) {
      setMessage(actionError instanceof Error ? actionError.message : 'تعذر حذف المشروع.');
    } finally {
      setActionProjectId('');
      setMenuProjectId('');
    }
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
                    <button type="button" onClick={() => openEditProject(project)}>تعديل البيانات</button>
                    <Link href={`/project/${project.id}`}>إدارة المواقع والبنود</Link>
                    <Link href={`/work-orders?project=${project.id}`}>إدارة أوامر العمل</Link>
                    <button type="button" onClick={() => void archiveProject(project)} disabled={actionProjectId === project.id}>{project.status === 'archived' ? 'إعادة التنشيط' : 'أرشفة المشروع'}</button>
                    <button type="button" className="danger" onClick={() => void trashProject(project)} disabled={actionProjectId === project.id}>حذف إلى السلة</button>
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
                <button type="button" className="btn" onClick={() => { setCreatedProject(null); setForm(emptyProjectForm); }}>إنشاء مشروع آخر</button>
              </div>
            </div> : <>
            <label className="wide"><span>اسم المشروع *</span><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required autoFocus /></label>
            <label><span>رمز المشروع</span><input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} placeholder="مثال: PRJ-07" /></label>
            <label><span>الحالة</span><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}><option value="active">نشط</option><option value="paused">متوقف</option><option value="completed">منتهي</option><option value="archived">مؤرشف</option></select></label>
            <label><span>البلدية</span><input value={form.municipality} onChange={(event) => setForm((current) => ({ ...current, municipality: event.target.value }))} /></label>
            <label><span>المقاول</span><input value={form.contractor_name} onChange={(event) => setForm((current) => ({ ...current, contractor_name: event.target.value }))} /></label>
            <label><span>رقم العقد</span><input value={form.contract_number} onChange={(event) => setForm((current) => ({ ...current, contract_number: event.target.value }))} placeholder="مثال: 2026/17" /></label>
            <label><span>الجهة المالكة</span><input value={form.owner_entity} onChange={(event) => setForm((current) => ({ ...current, owner_entity: event.target.value }))} placeholder="مثال: أمانة محافظة جدة" /></label>
            <label><span>تاريخ بداية العقد</span><input type="date" value={form.contract_start_date} onChange={(event) => setForm((current) => ({ ...current, contract_start_date: event.target.value }))} /></label>
            <label><span>تاريخ نهاية العقد</span><input type="date" value={form.contract_end_date} onChange={(event) => setForm((current) => ({ ...current, contract_end_date: event.target.value }))} /></label>
            <label><span>قيمة العقد</span><input type="number" min="0" step="0.01" value={form.contract_value} onChange={(event) => setForm((current) => ({ ...current, contract_value: event.target.value }))} placeholder="0.00" /></label>
            <label><span>المشرف المسؤول</span><input value={form.supervisor_name} onChange={(event) => setForm((current) => ({ ...current, supervisor_name: event.target.value }))} /></label>
            <label className="wide"><span>الوصف</span><textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={4} /></label>
            <div className="project-editor-actions"><button type="button" className="btn" onClick={() => setEditorOpen(false)} disabled={saving}>إلغاء</button><button type="submit" className="btn primary" disabled={saving}>{saving ? 'جاري الحفظ...' : editingProject ? 'حفظ التعديلات' : 'إنشاء المشروع'}</button></div>
            </>}
          </form>
        </section>
      </div> : null}
    </main>
  );
}
