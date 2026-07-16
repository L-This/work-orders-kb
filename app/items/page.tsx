'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

type Item = { id: string; name: string; normalized_name?: string | null; unit?: string | null; is_active?: boolean | null; category?: string | null };
type BoqRow = { id: string; item_id: string; project_id: string; boq_item_no?: string | null; unit?: string | null; contract_quantity?: number | null; unit_price?: number | null; total_price?: number | null };
type WorkLine = { id: string; item_id: string; work_order_id: string; quantity?: number | null; executed_quantity?: number | null; remaining_quantity?: number | null; total_price?: number | null };
type Project = { id: string; name: string };
type WorkOrder = { id: string; project_id: string; work_order_number?: string | null; status?: string | null };
type ItemStats = Item & {
  boqCount: number;
  projectCount: number;
  orderCount: number;
  contractQuantity: number;
  reservedQuantity: number;
  executedQuantity: number;
  remainingQuantity: number;
  contractValue: number;
  executionValue: number;
  projects: Project[];
};

type EditorState = { mode: 'create' | 'edit'; item?: ItemStats } | null;
type DetailState = ItemStats | null;

function number(value: unknown) { const result = Number(value); return Number.isFinite(result) ? result : 0; }
function formatNumber(value: number) { return new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 }).format(value); }

function Icon({ name }: { name: 'edit' | 'layers' | 'pause' | 'play' | 'trash' | 'chart' }) {
  const paths: Record<string, React.ReactNode> = {
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></>,
    layers: <><path d="m12 2 9 5-9 5-9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></>,
    pause: <><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></>,
    play: <path d="m8 5 11 7-11 7Z"/>,
    trash: <><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></>,
    chart: <><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function Page() {
  const [items, setItems] = useState<Item[]>([]);
  const [boq, setBoq] = useState<BoqRow[]>([]);
  const [lines, setLines] = useState<WorkLine[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [unit, setUnit] = useState('all');
  const [sort, setSort] = useState('usage');
  const [openMenu, setOpenMenu] = useState('');
  const [editor, setEditor] = useState<EditorState>(null);
  const [details, setDetails] = useState<DetailState>(null);
  const [deleteItem, setDeleteItem] = useState<ItemStats | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!editor && !details && !deleteItem) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setEditor(null); setDetails(null); setDeleteItem(null); } };
    window.addEventListener('keydown', close);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', close); };
  }, [editor, details, deleteItem]);

  async function load() {
    setLoading(true);
    const response = await fetch('/api/items', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) setMessage(data.error || 'تعذر تحميل البنود.');
    else {
      setItems(data.items || []); setBoq(data.boq || []); setLines(data.lines || []);
      setProjects(data.projects || []); setOrders(data.orders || []);
    }
    setLoading(false);
  }

  const stats = useMemo<ItemStats[]>(() => {
    const projectMap = new Map(projects.map((project) => [project.id, project]));
    const orderMap = new Map(orders.map((order) => [order.id, order]));
    return items.map((item) => {
      const itemBoq = boq.filter((row) => row.item_id === item.id);
      const itemLines = lines.filter((row) => row.item_id === item.id);
      const projectIds = new Set(itemBoq.map((row) => row.project_id));
      for (const line of itemLines) {
        const order = orderMap.get(line.work_order_id);
        if (order?.project_id) projectIds.add(order.project_id);
      }
      return {
        ...item,
        boqCount: itemBoq.length,
        projectCount: projectIds.size,
        orderCount: new Set(itemLines.map((row) => row.work_order_id)).size,
        contractQuantity: itemBoq.reduce((sum, row) => sum + number(row.contract_quantity), 0),
        reservedQuantity: itemLines.reduce((sum, row) => sum + Math.max(0, number(row.quantity) - number(row.executed_quantity)), 0),
        executedQuantity: itemLines.reduce((sum, row) => sum + number(row.executed_quantity), 0),
        remainingQuantity: itemLines.reduce((sum, row) => sum + number(row.remaining_quantity), 0),
        contractValue: itemBoq.reduce((sum, row) => sum + number(row.total_price), 0),
        executionValue: itemLines.reduce((sum, row) => sum + number(row.total_price), 0),
        projects: Array.from(projectIds).map((id) => projectMap.get(id)).filter(Boolean) as Project[],
      };
    });
  }, [items, boq, lines, projects, orders]);

  const categories = useMemo(() => Array.from(new Set(stats.map((item) => item.category).filter(Boolean) as string[])).sort(), [stats]);
  const units = useMemo(() => Array.from(new Set(stats.map((item) => item.unit).filter(Boolean) as string[])).sort(), [stats]);
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    const next = stats.filter((item) => {
      if (status === 'active' && item.is_active === false) return false;
      if (status === 'inactive' && item.is_active !== false) return false;
      if (category !== 'all' && (item.category || '') !== category) return false;
      if (unit !== 'all' && (item.unit || '') !== unit) return false;
      if (text && ![item.name, item.category, item.unit, ...item.projects.map((project) => project.name)].join(' ').toLowerCase().includes(text)) return false;
      return true;
    });
    return next.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'ar');
      if (sort === 'value') return b.contractValue - a.contractValue;
      if (sort === 'remaining') return b.remainingQuantity - a.remainingQuantity;
      return (b.orderCount + b.projectCount) - (a.orderCount + a.projectCount);
    });
  }, [stats, query, status, category, unit, sort]);

  const summary = useMemo(() => ({
    total: stats.length,
    active: stats.filter((item) => item.is_active !== false).length,
    inactive: stats.filter((item) => item.is_active === false).length,
    used: stats.filter((item) => item.orderCount > 0).length,
    unused: stats.filter((item) => item.orderCount === 0 && item.projectCount === 0).length,
  }), [stats]);

  async function toggleActive(item: ItemStats) {
    setBusy(true); setMessage('');
    const response = await fetch(`/api/items/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: item.is_active === false }) });
    const data = await response.json();
    if (!response.ok) setMessage(data.error || 'تعذر تغيير حالة البند.');
    else { setMessage(item.is_active === false ? 'تم تفعيل البند.' : 'تم تعطيل البند.'); await load(); }
    setBusy(false); setOpenMenu('');
  }

  async function removeItem() {
    if (!deleteItem) return;
    setBusy(true); setMessage('');
    const response = await fetch(`/api/items/${deleteItem.id}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) setMessage(data.error || 'تعذر حذف البند.');
    else { setMessage('تم حذف البند بنجاح.'); setDeleteItem(null); await load(); }
    setBusy(false);
  }

  return <div className="module-page items-management-page" onClick={() => openMenu && setOpenMenu('')}>
    <section className="items-hero">
      <div>
        <span className="eyebrow">إدارة البنود</span>
        <h1>مركز إدارة البنود والكميات</h1>
        <p>أدر قاموس البنود، راقب استخدامها عبر المشاريع وأوامر العمل، وتابع الكميات التعاقدية والمنفذة والمتبقية.</p>
      </div>
      <div className="items-hero-actions">
        <button className="primary-action" type="button" onClick={() => setEditor({ mode: 'create' })}>+ بند جديد</button>
        <a className="secondary-action" href="/import">استيراد جدول كميات</a>
        <button className="secondary-action" type="button" onClick={() => void load()}>تحديث البيانات</button>
      </div>
    </section>

    {message ? <div className="integration-message">{message}</div> : null}

    <section className="items-summary-grid">
      <div><small>إجمالي البنود</small><strong>{summary.total}</strong><span>بند مركزي مسجل</span></div>
      <div><small>نشطة</small><strong>{summary.active}</strong><span>متاحة للاستخدام</span></div>
      <div><small>مستخدمة بأوامر</small><strong>{summary.used}</strong><span>دخلت في التنفيذ</span></div>
      <div><small>غير مستخدمة</small><strong>{summary.unused}</strong><span>لم ترتبط بعد</span></div>
      <div><small>متوقفة</small><strong>{summary.inactive}</strong><span>تحتاج مراجعة</span></div>
    </section>

    <section className="items-filter-panel">
      <label className="items-search"><span>البحث</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="اسم البند، الفئة، الوحدة أو المشروع..." /></label>
      <label><span>الحالة</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">كل الحالات</option><option value="active">نشطة</option><option value="inactive">متوقفة</option></select></label>
      <label><span>الفئة</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">كل الفئات</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label><span>الوحدة</span><select value={unit} onChange={(event) => setUnit(event.target.value)}><option value="all">كل الوحدات</option>{units.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label><span>الترتيب</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="usage">الأكثر استخدامًا</option><option value="name">الاسم</option><option value="value">أعلى قيمة عقدية</option><option value="remaining">أعلى رصيد متبقٍ</option></select></label>
    </section>

    <section className="items-results-section">
      <div className="items-results-head"><div><span className="eyebrow">النتائج</span><h2>دليل البنود</h2></div><span>{filtered.length} من {stats.length} بند</span></div>
      {loading ? <div className="items-skeleton-grid">{Array.from({ length: 6 }).map((_, index) => <div key={index} />)}</div> : filtered.length ? (
        <div className="items-card-grid">
          {filtered.map((item, index) => <article className={`item-card ${item.is_active === false ? 'is-inactive' : ''}`} key={item.id}>
            <div className="item-card-top">
              <div className="item-index">{String(index + 1).padStart(2, '0')}</div>
              <div className="item-status-line"><span className={item.is_active === false ? 'item-status off' : 'item-status'}>{item.is_active === false ? 'متوقف' : 'نشط'}</span><span>{item.category || 'غير مصنف'}</span></div>
              <button className="item-menu-button" type="button" onClick={(event) => { event.stopPropagation(); setOpenMenu(openMenu === item.id ? '' : item.id); }}>⋮</button>
              {openMenu === item.id ? <div className="item-action-menu" onClick={(event) => event.stopPropagation()}>
                <button onClick={() => { setEditor({ mode: 'edit', item }); setOpenMenu(''); }}><Icon name="edit"/>تعديل البند</button>
                <button onClick={() => { setDetails(item); setOpenMenu(''); }}><Icon name="chart"/>تفاصيل الاستخدام</button>
                <button onClick={() => void toggleActive(item)} disabled={busy}><Icon name={item.is_active === false ? 'play' : 'pause'}/>{item.is_active === false ? 'تفعيل البند' : 'إيقاف البند'}</button>
                <div className="item-menu-separator" />
                <button className="danger" onClick={() => { setDeleteItem(item); setOpenMenu(''); }}><Icon name="trash"/>حذف البند</button>
              </div> : null}
            </div>
            <h3 title={item.name}>{item.name}</h3>
            <div className="item-unit-chip">{item.unit || 'بدون وحدة'}</div>
            <div className="item-metrics">
              <div><small>المشاريع</small><strong>{item.projectCount}</strong></div>
              <div><small>أوامر العمل</small><strong>{item.orderCount}</strong></div>
              <div><small>سجلات الكميات</small><strong>{item.boqCount}</strong></div>
            </div>
            <div className="item-quantity-strip">
              <div><small>تعاقدي</small><strong>{formatNumber(item.contractQuantity)}</strong></div>
              <div><small>منفذ</small><strong>{formatNumber(item.executedQuantity)}</strong></div>
              <div><small>متبقٍ</small><strong>{formatNumber(item.remainingQuantity)}</strong></div>
            </div>
            <div className="item-card-footer"><span>القيمة العقدية</span><strong>{formatNumber(item.contractValue)}</strong></div>
            <button className="item-open-button" type="button" onClick={() => setDetails(item)}>فتح تفاصيل البند</button>
          </article>)}
        </div>
      ) : <div className="module-empty"><strong>لا توجد بنود مطابقة</strong><span>غيّر البحث أو الفلاتر، أو أضف بندًا جديدًا.</span></div>}
    </section>

    {typeof document !== 'undefined' && editor ? createPortal(<ItemEditor state={editor} busy={busy} onClose={() => setEditor(null)} onSaved={async (text) => { setMessage(text); setEditor(null); await load(); }} setBusy={setBusy} />, document.body) : null}
    {typeof document !== 'undefined' && details ? createPortal(<ItemDetails item={details} onClose={() => setDetails(null)} />, document.body) : null}
    {typeof document !== 'undefined' && deleteItem ? createPortal(<div className="items-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteItem(null); }}><section className="items-modal compact"><button className="items-modal-close" onClick={() => setDeleteItem(null)}>×</button><span className="eyebrow">حذف بند</span><h2>{deleteItem.name}</h2><p>هذا البند مرتبط بـ {deleteItem.projectCount} مشروع و{deleteItem.orderCount} أمر عمل.</p>{deleteItem.projectCount || deleteItem.orderCount ? <div className="items-warning">لن يسمح النظام بحذفه حفاظًا على السجل، ويمكن تعطيله بدلًا من ذلك.</div> : null}<div className="items-modal-actions"><button className="danger-button" onClick={() => void removeItem()} disabled={busy}>{busy ? 'جاري الحذف...' : 'حذف البند'}</button><button onClick={() => setDeleteItem(null)}>إلغاء</button></div></section></div>, document.body) : null}
  </div>;
}

function ItemEditor({ state, busy, onClose, onSaved, setBusy }: { state: NonNullable<EditorState>; busy: boolean; onClose: () => void; onSaved: (message: string) => Promise<void>; setBusy: (value: boolean) => void }) {
  const [name, setName] = useState(state.item?.name || '');
  const [unit, setUnit] = useState(state.item?.unit || '');
  const [category, setCategory] = useState(state.item?.category || '');
  const [isActive, setIsActive] = useState(state.item?.is_active !== false);
  const [error, setError] = useState('');
  async function save() {
    if (!name.trim()) { setError('اسم البند مطلوب.'); return; }
    setBusy(true); setError('');
    const response = await fetch(state.mode === 'create' ? '/api/items' : `/api/items/${state.item?.id}`, {
      method: state.mode === 'create' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, unit, category, isActive }),
    });
    const data = await response.json();
    if (!response.ok) setError(data.error || 'تعذر حفظ البند.');
    else await onSaved(state.mode === 'create' ? 'تم إنشاء البند بنجاح.' : 'تم تحديث البند بنجاح.');
    setBusy(false);
  }
  return <div className="items-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="items-modal"><button className="items-modal-close" onClick={onClose}>×</button><span className="eyebrow">{state.mode === 'create' ? 'إضافة بند' : 'تعديل بند'}</span><h2>{state.mode === 'create' ? 'بند جديد' : 'تعديل بيانات البند'}</h2><p>سجّل الاسم والوحدة والفئة ليصبح البند متاحًا ضمن جداول الكميات وأوامر العمل.</p>{error ? <div className="items-warning">{error}</div> : null}<div className="items-form-grid"><label className="full"><span>اسم البند *</span><textarea value={name} onChange={(event) => setName(event.target.value)} autoFocus /></label><label><span>الوحدة</span><input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="مثال: عدد، م²، م.ط" /></label><label><span>الفئة</span><input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="مثال: ري، زراعة، كهرباء" /></label><label className="full status-toggle"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /><span>البند نشط ومتاح للاستخدام</span></label></div><div className="items-modal-actions"><button className="primary-action" onClick={() => void save()} disabled={busy}>{busy ? 'جاري الحفظ...' : state.mode === 'create' ? 'إنشاء البند' : 'حفظ التعديلات'}</button><button onClick={onClose}>إلغاء</button></div></section></div>;
}

function ItemDetails({ item, onClose }: { item: ItemStats; onClose: () => void }) {
  return <div className="items-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="items-modal details"><button className="items-modal-close" onClick={onClose}>×</button><span className="eyebrow">تفاصيل البند</span><h2>{item.name}</h2><div className="item-detail-summary"><div><small>الوحدة</small><strong>{item.unit || 'غير مسجلة'}</strong></div><div><small>الفئة</small><strong>{item.category || 'غير مصنف'}</strong></div><div><small>المشاريع</small><strong>{item.projectCount}</strong></div><div><small>أوامر العمل</small><strong>{item.orderCount}</strong></div></div><div className="item-detail-quantities"><div><small>الكمية التعاقدية</small><strong>{formatNumber(item.contractQuantity)}</strong></div><div><small>المحجوز</small><strong>{formatNumber(item.reservedQuantity)}</strong></div><div><small>المنفذ</small><strong>{formatNumber(item.executedQuantity)}</strong></div><div><small>المتبقي</small><strong>{formatNumber(item.remainingQuantity)}</strong></div><div><small>القيمة العقدية</small><strong>{formatNumber(item.contractValue)}</strong></div><div><small>قيمة أوامر العمل</small><strong>{formatNumber(item.executionValue)}</strong></div></div><div className="item-project-list"><h3>المشاريع المرتبطة</h3>{item.projects.length ? item.projects.map((project) => <a key={project.id} href={`/project/${project.id}`}>{project.name}</a>) : <span>لا توجد مشاريع مرتبطة بهذا البند.</span>}</div><div className="items-modal-actions"><button onClick={onClose}>إغلاق</button></div></section></div>;
}
