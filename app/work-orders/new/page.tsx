'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type Project = {
  id: string;
  name: string;
  contractor_name: string | null;
};

type Site = { id: string; name: string };
type Contract = { id: string; contract_number: string | null };
type BoqItem = {
  id: string;
  item_id: string;
  boq_item_no: string | null;
  unit: string | null;
  contract_quantity: number | string | null;
  unit_price: number | string | null;
  items: { id: string; name: string; unit: string | null } | null;
};
type ExistingOrder = { id: string; work_order_number: string };
type ExistingLine = { item_id: string; executed_quantity: number | string | null };

type SelectedItem = {
  boqId: string;
  itemId: string;
  itemNo: string;
  name: string;
  unit: string;
  contractQuantity: number;
  previousExecuted: number;
  remainingBefore: number;
  unitPrice: number;
  requestedQuantity: string;
};

const toNumber = (value: number | string | null | undefined) => Number(value) || 0;

function addDays(dateValue: string, duration: number) {
  if (!dateValue || duration <= 0) return '';
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + Math.max(0, duration - 1));
  return date.toISOString().slice(0, 10);
}

function nextOrderNumber(numbers: string[]) {
  let max = 0;
  let width = 2;
  for (const value of numbers) {
    const matches = String(value || '').match(/\d+/g);
    if (!matches?.length) continue;
    const last = matches[matches.length - 1];
    max = Math.max(max, Number(last) || 0);
    width = Math.max(width, last.length);
  }
  return String(max + 1).padStart(width, '0');
}

export default function NewWorkOrderPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [contractId, setContractId] = useState<string | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [boqItems, setBoqItems] = useState<BoqItem[]>([]);
  const [previousExecuted, setPreviousExecuted] = useState<Map<string, number>>(new Map());
  const [orderNumber, setOrderNumber] = useState('01');
  const [durationDays, setDurationDays] = useState('30');
  const [startDate, setStartDate] = useState('');
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [itemToAdd, setItemToAdd] = useState('');
  const [loading, setLoading] = useState(true);
  const [projectLoading, setProjectLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [createdOrderId, setCreatedOrderId] = useState('');

  const duration = Math.max(0, Number(durationDays) || 0);
  const endDate = useMemo(() => addDays(startDate, duration), [startDate, duration]);
  const selectedProject = projects.find((project) => project.id === projectId) || null;

  useEffect(() => { void loadProjects(); }, []);
  useEffect(() => {
    if (!projectId) {
      setSites([]); setBoqItems([]); setSelectedItems([]); setSelectedSiteIds([]); setContractId(null); setOrderNumber('01');
      return;
    }
    void loadProjectData(projectId);
  }, [projectId]);

  async function loadProjects() {
    if (!isSupabaseConfigured) { setLoading(false); setMessage('إعدادات Supabase غير مكتملة.'); return; }
    const result = await supabase.from('projects').select('id,name,contractor_name').order('name');
    if (result.error) setMessage(result.error.message);
    else setProjects((result.data || []) as Project[]);
    setLoading(false);
  }

  async function loadProjectData(id: string) {
    setProjectLoading(true); setMessage(''); setCreatedOrderId('');
    setSelectedItems([]); setSelectedSiteIds([]); setItemToAdd('');
    const [sitesResult, boqResult, ordersResult, contractsResult] = await Promise.all([
      supabase.from('sites').select('id,name').eq('project_id', id).eq('status', 'active').order('name'),
      supabase.from('project_boq_items').select('id,item_id,boq_item_no,unit,contract_quantity,unit_price,items(id,name,unit)').eq('project_id', id).order('boq_item_no'),
      supabase.from('work_orders').select('id,work_order_number').eq('project_id', id),
      supabase.from('contracts').select('id,contract_number').eq('project_id', id).order('created_at', { ascending: false }).limit(1),
    ]);

    const error = sitesResult.error || boqResult.error || ordersResult.error || contractsResult.error;
    if (error) { setMessage(error.message); setProjectLoading(false); return; }

    const existingOrders = (ordersResult.data || []) as ExistingOrder[];
    setSites((sitesResult.data || []) as Site[]);
    setBoqItems((boqResult.data || []) as unknown as BoqItem[]);
    setOrderNumber(nextOrderNumber(existingOrders.map((order) => order.work_order_number)));
    setContractId(((contractsResult.data || [])[0] as Contract | undefined)?.id || null);

    if (existingOrders.length) {
      const linesResult = await supabase.from('work_order_items').select('item_id,executed_quantity').in('work_order_id', existingOrders.map((order) => order.id));
      if (linesResult.error) setMessage(linesResult.error.message);
      else {
        const map = new Map<string, number>();
        for (const line of (linesResult.data || []) as ExistingLine[]) {
          map.set(line.item_id, (map.get(line.item_id) || 0) + toNumber(line.executed_quantity));
        }
        setPreviousExecuted(map);
      }
    } else setPreviousExecuted(new Map());

    setProjectLoading(false);
  }

  function toggleSite(siteId: string) {
    setSelectedSiteIds((current) => current.includes(siteId) ? current.filter((id) => id !== siteId) : [...current, siteId]);
  }

  function addItem() {
    const boq = boqItems.find((item) => item.id === itemToAdd);
    if (!boq || selectedItems.some((item) => item.boqId === boq.id)) return;
    const contractQuantity = toNumber(boq.contract_quantity);
    const executed = previousExecuted.get(boq.item_id) || 0;
    const unit = boq.unit || boq.items?.unit || '';
    setSelectedItems((current) => [...current, {
      boqId: boq.id,
      itemId: boq.item_id,
      itemNo: boq.boq_item_no || '',
      name: boq.items?.name || 'بند غير مسمى',
      unit,
      contractQuantity,
      previousExecuted: executed,
      remainingBefore: Math.max(0, contractQuantity - executed),
      unitPrice: toNumber(boq.unit_price),
      requestedQuantity: '',
    }]);
    setItemToAdd('');
  }

  function updateQuantity(boqId: string, value: string) {
    setSelectedItems((current) => current.map((item) => item.boqId === boqId ? { ...item, requestedQuantity: value } : item));
  }

  function removeItem(boqId: string) {
    setSelectedItems((current) => current.filter((item) => item.boqId !== boqId));
  }

  const validation = useMemo(() => {
    if (!projectId) return 'اختر المشروع.';
    if (!orderNumber.trim()) return 'رقم أمر العمل غير متوفر.';
    if (!selectedSiteIds.length) return 'اختر موقعًا واحدًا على الأقل.';
    if (!startDate) return 'حدد تاريخ بداية أمر العمل.';
    if (duration < 1) return 'مدة أمر العمل يجب أن تكون يومًا واحدًا على الأقل.';
    if (!selectedItems.length) return 'أضف بندًا واحدًا على الأقل.';
    for (const item of selectedItems) {
      const quantity = Number(item.requestedQuantity);
      if (!Number.isFinite(quantity) || quantity <= 0) return `أدخل كمية صحيحة للبند: ${item.name}`;
      if (quantity > item.remainingBefore) return `الكمية المطلوبة للبند «${item.name}» أكبر من الرصيد المتاح.`;
    }
    return '';
  }, [duration, orderNumber, projectId, selectedItems, selectedSiteIds.length, startDate]);

  async function createWorkOrder() {
    if (validation || !selectedProject) { setMessage(validation || 'تحقق من البيانات.'); return; }
    setSaving(true); setMessage(''); setCreatedOrderId('');
    let workOrderId = '';
    try {
      const inserted = await supabase.from('work_orders').insert({
        project_id: projectId,
        contract_id: contractId,
        work_order_number: orderNumber.trim(),
        work_order_date: startDate,
        work_order_end_date: endDate,
        duration_days: duration,
        title: `أمر عمل رقم ${orderNumber.trim()}`,
        status: 'approved',
        contractor_name: selectedProject.contractor_name,
        notes: 'تم إنشاؤه يدويًا من شاشة إنشاء أوامر العمل.',
        source_file_name: null,
      }).select('id').single();
      if (inserted.error) throw inserted.error;
      workOrderId = inserted.data.id;

      const siteInsert = await supabase.from('work_order_sites').insert(selectedSiteIds.map((siteId) => ({ work_order_id: workOrderId, site_id: siteId })));
      if (siteInsert.error) throw siteInsert.error;

      const itemInsert = await supabase.from('work_order_items').insert(selectedItems.map((item) => {
        const quantity = Number(item.requestedQuantity);
        return {
          work_order_id: workOrderId,
          site_id: selectedSiteIds.length === 1 ? selectedSiteIds[0] : null,
          item_id: item.itemId,
          boq_item_id: item.boqId,
          item_no: item.itemNo || null,
          unit: item.unit || null,
          quantity,
          executed_quantity: quantity,
          remaining_quantity: Math.max(0, item.remainingBefore - quantity),
          unit_price: item.unitPrice,
          total_price: quantity * item.unitPrice,
          notes: `تم الإنشاء يدويًا • المواقع: ${selectedSiteIds.length}`,
          source_sheet: 'manual-entry',
          source_row_number: null,
        };
      }));
      if (itemInsert.error) throw itemInsert.error;

      setCreatedOrderId(workOrderId);
      setMessage(`تم إنشاء أمر العمل رقم ${orderNumber} بنجاح.`);
    } catch (error) {
      if (workOrderId) await supabase.from('work_orders').delete().eq('id', workOrderId);
      setMessage(error instanceof Error ? error.message : 'تعذر إنشاء أمر العمل.');
    } finally { setSaving(false); }
  }

  return (
    <main className="page create-work-order-page">
      <section className="page-heading create-work-order-hero">
        <div>
          <span className="eyebrow">إدارة أوامر العمل</span>
          <h1>إنشاء أمر عمل جديد</h1>
          <p>اختر المشروع والمواقع والمدة، ثم أضف البنود بعد مراجعة كميات العقد والمنفذ سابقًا والرصيد المتاح.</p>
        </div>
        <div className="actions"><Link href="/work-orders" className="btn">رجوع لأوامر العمل</Link></div>
      </section>

      {message ? <div className={`notice ${createdOrderId ? 'success-notice' : 'error-notice'}`}>{message}{createdOrderId ? <Link href={`/work-order/${createdOrderId}`} className="text-link">فتح أمر العمل ←</Link> : null}</div> : null}

      <section className="create-order-step section-block">
        <div className="section-title"><div><span className="section-kicker">الخطوة 01</span><h2>المشروع ورقم الأمر</h2></div></div>
        <div className="create-order-fields two-columns">
          <label><span>المشروع</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)} disabled={loading}><option value="">اختر المشروع...</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <label><span>رقم أمر العمل التالي</span><input value={orderNumber} readOnly className="auto-field" /><small>يُحسب تلقائيًا بناءً على آخر أمر مسجل داخل المشروع.</small></label>
        </div>
      </section>

      <section className="create-order-step section-block">
        <div className="section-title"><div><span className="section-kicker">الخطوة 02</span><h2>نطاق المواقع</h2></div><span>{selectedSiteIds.length} موقع محدد</span></div>
        {!projectId ? <div className="empty compact">اختر المشروع أولًا لعرض المواقع.</div> : projectLoading ? <div className="empty compact">جاري تحميل مواقع المشروع...</div> : <div className="create-site-selector">{sites.map((site) => <label key={site.id} className={selectedSiteIds.includes(site.id) ? 'selected' : ''}><input type="checkbox" checked={selectedSiteIds.includes(site.id)} onChange={() => toggleSite(site.id)} /><span>{site.name}</span></label>)}</div>}
      </section>

      <section className="create-order-step section-block">
        <div className="section-title"><div><span className="section-kicker">الخطوة 03</span><h2>المدة والتواريخ</h2></div></div>
        <div className="create-order-fields three-columns">
          <label><span>مدة أمر العمل بالأيام</span><input type="number" min="1" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} /></label>
          <label><span>تاريخ بداية أمر العمل</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label><span>تاريخ نهاية أمر العمل</span><input type="date" value={endDate} readOnly className="auto-field" /><small>يُحسب تلقائيًا من تاريخ البداية والمدة.</small></label>
        </div>
      </section>

      <section className="create-order-step section-block">
        <div className="section-title"><div><span className="section-kicker">الخطوة 04</span><h2>البنود والكميات المطلوبة</h2></div><span>{selectedItems.length} بند مضاف</span></div>
        <div className="add-item-row"><select value={itemToAdd} onChange={(event) => setItemToAdd(event.target.value)} disabled={!projectId || projectLoading}><option value="">اختر بندًا من جدول كميات المشروع...</option>{boqItems.filter((boq) => !selectedItems.some((selected) => selected.boqId === boq.id)).map((boq) => <option key={boq.id} value={boq.id}>{boq.boq_item_no ? `${boq.boq_item_no} — ` : ''}{boq.items?.name || 'بند غير مسمى'}</option>)}</select><button className="btn primary" type="button" onClick={addItem} disabled={!itemToAdd}>إضافة البند</button></div>

        {selectedItems.length ? <div className="table-wrap create-order-items-table"><table><thead><tr><th>البند</th><th>الوحدة</th><th>كمية العقد</th><th>المنفذ سابقًا</th><th>الرصيد المتاح</th><th>الكمية المطلوبة</th><th>الرصيد بعد الأمر</th><th></th></tr></thead><tbody>{selectedItems.map((item) => {
          const requested = Number(item.requestedQuantity) || 0;
          const after = item.remainingBefore - requested;
          return <tr key={item.boqId}><td><b>{item.name}</b><small>{item.itemNo ? `رقم البند: ${item.itemNo}` : ''}</small></td><td>{item.unit || '—'}</td><td>{item.contractQuantity.toLocaleString('en-US')}</td><td>{item.previousExecuted.toLocaleString('en-US')}</td><td><b>{item.remainingBefore.toLocaleString('en-US')}</b></td><td><input type="number" min="0" max={item.remainingBefore} step="any" value={item.requestedQuantity} onChange={(event) => updateQuantity(item.boqId, event.target.value)} /></td><td className={after < 0 ? 'danger-value' : ''}>{after.toLocaleString('en-US')}</td><td><button className="icon-danger-button" onClick={() => removeItem(item.boqId)} title="حذف البند">×</button></td></tr>;
        })}</tbody></table></div> : <div className="empty compact">لم تتم إضافة بنود بعد.</div>}
      </section>

      <section className="section-block create-order-review">
        <div><span className="section-kicker">المراجعة النهائية</span><h2>اعتماد إنشاء أمر العمل</h2><p>{selectedProject ? selectedProject.name : 'لم يتم اختيار المشروع'} • {selectedSiteIds.length} موقع • {duration || 0} يوم • {selectedItems.length} بند</p></div>
        <button className="btn primary create-order-submit" onClick={createWorkOrder} disabled={saving || Boolean(validation)}>{saving ? 'جاري إنشاء أمر العمل...' : 'إنشاء واعتماد أمر العمل'}</button>
        {validation ? <small className="validation-hint">{validation}</small> : null}
      </section>
    </main>
  );
}
