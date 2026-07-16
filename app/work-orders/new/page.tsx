'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type Project = { id: string; name: string; contractor_name: string | null };
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
type ExistingLine = {
  item_id: string;
  quantity: number | string | null;
  executed_quantity: number | string | null;
};

type ItemBalance = { executed: number; reserved: number };
type SelectedItem = {
  boqId: string;
  itemId: string;
  itemNo: string;
  name: string;
  unit: string;
  contractQuantity: number;
  previousExecuted: number;
  previouslyReserved: number;
  availableBefore: number;
  unitPrice: number;
  requestedQuantity: string;
};

const toNumber = (value: number | string | null | undefined) => Number(value) || 0;
const formatQuantity = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 3 });
const formatMoney = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });

function compactText(value: string | null | undefined, maxLength = 72) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(1, maxLength - 1)).trim()}…`;
}

function compactProjectName(value: string) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  const firstUsefulPart = clean.split(/\s[-–—:]\s/)[0]?.trim() || clean;
  return compactText(firstUsefulPart.length >= 24 ? firstUsefulPart : clean, 78);
}

function compactItemName(value: string) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  const firstSentence = clean.split(/[؛\n:.]/)[0]?.trim() || clean;
  const words = firstSentence.split(' ').filter(Boolean);
  const shortWords = words.slice(0, 7).join(' ');
  return compactText(shortWords || firstSentence, 42);
}

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
  const [siteQuery, setSiteQuery] = useState('');
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [boqItems, setBoqItems] = useState<BoqItem[]>([]);
  const [itemBalances, setItemBalances] = useState<Map<string, ItemBalance>>(new Map());
  const [orderNumber, setOrderNumber] = useState('01');
  const [lastOrderNumber, setLastOrderNumber] = useState('لا يوجد');
  const [durationDays, setDurationDays] = useState('30');
  const [startDate, setStartDate] = useState('');
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [itemToAdd, setItemToAdd] = useState('');
  const [draftQuantity, setDraftQuantity] = useState('');
  const [loading, setLoading] = useState(true);
  const [projectLoading, setProjectLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [createdOrderId, setCreatedOrderId] = useState('');

  const duration = Math.max(0, Number(durationDays) || 0);
  const endDate = useMemo(() => addDays(startDate, duration), [startDate, duration]);
  const selectedProject = projects.find((project) => project.id === projectId) || null;
  const draftBoq = boqItems.find((item) => item.id === itemToAdd) || null;

  const draftBalance = useMemo(() => {
    if (!draftBoq) return null;
    const balance = itemBalances.get(draftBoq.item_id) || { executed: 0, reserved: 0 };
    const contractQuantity = toNumber(draftBoq.contract_quantity);
    const available = Math.max(0, contractQuantity - balance.executed - balance.reserved);
    const requested = Math.max(0, Number(draftQuantity) || 0);
    return {
      contractQuantity,
      executed: balance.executed,
      reserved: balance.reserved,
      available,
      requested,
      after: available - requested,
      unit: draftBoq.unit || draftBoq.items?.unit || '',
    };
  }, [draftBoq, draftQuantity, itemBalances]);

  const visibleSites = useMemo(() => {
    const needle = siteQuery.trim().toLowerCase();
    if (!needle) return sites;
    return sites.filter((site) => site.name.toLowerCase().includes(needle));
  }, [siteQuery, sites]);

  const estimatedValue = useMemo(() => selectedItems.reduce(
    (sum, item) => sum + (Number(item.requestedQuantity) || 0) * item.unitPrice,
    0,
  ), [selectedItems]);

  const totalRequestedQuantity = useMemo(() => selectedItems.reduce(
    (sum, item) => sum + (Number(item.requestedQuantity) || 0),
    0,
  ), [selectedItems]);

  useEffect(() => { void loadProjects(); }, []);
  useEffect(() => {
    if (!projectId) {
      setSites([]);
      setBoqItems([]);
      setSelectedItems([]);
      setSelectedSiteIds([]);
      setContractId(null);
      setOrderNumber('01');
      setLastOrderNumber('لا يوجد');
      setItemBalances(new Map());
      setItemToAdd('');
      setDraftQuantity('');
      return;
    }
    void loadProjectData(projectId);
  }, [projectId]);

  async function loadProjects() {
    if (!isSupabaseConfigured) {
      setLoading(false);
      setMessage('إعدادات Supabase غير مكتملة.');
      return;
    }
    const result = await supabase.from('projects').select('id,name,contractor_name').order('name');
    if (result.error) setMessage(result.error.message);
    else setProjects((result.data || []) as Project[]);
    setLoading(false);
  }

  async function loadProjectData(id: string) {
    setProjectLoading(true);
    setMessage('');
    setCreatedOrderId('');
    setSelectedItems([]);
    setSelectedSiteIds([]);
    setSiteQuery('');
    setItemToAdd('');
    setDraftQuantity('');

    // مزامنة مواقع مشروع الري أولًا، ثم قراءة المعرّفات المحلية من جدول sites.
    // إذا لم يكن المشروع مربوطًا بعد، تستمر الشاشة وتعرض المواقع المحلية الموجودة فقط.
    try {
      await fetch('/api/irrigation/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workProjectId: id }),
      });
    } catch {
      // لا نوقف إنشاء أمر العمل عند تعذر الاتصال المؤقت بقاعدة الري.
    }

    const [sitesResult, boqResult, ordersResult, contractsResult] = await Promise.all([
      supabase.from('sites').select('id,name').eq('project_id', id).eq('status', 'active').order('name'),
      supabase.from('project_boq_items').select('id,item_id,boq_item_no,unit,contract_quantity,unit_price,items(id,name,unit)').eq('project_id', id).order('boq_item_no'),
      supabase.from('work_orders').select('id,work_order_number').eq('project_id', id),
      supabase.from('contracts').select('id,contract_number').eq('project_id', id).order('created_at', { ascending: false }).limit(1),
    ]);

    const error = sitesResult.error || boqResult.error || ordersResult.error || contractsResult.error;
    if (error) {
      setMessage(error.message);
      setProjectLoading(false);
      return;
    }

    const existingOrders = (ordersResult.data || []) as ExistingOrder[];
    setSites((sitesResult.data || []) as Site[]);
    setBoqItems((boqResult.data || []) as unknown as BoqItem[]);
    const existingNumbers = existingOrders.map((order) => order.work_order_number);
    const generatedNumber = nextOrderNumber(existingNumbers);
    const generatedNumeric = Number(generatedNumber) || 1;
    setOrderNumber(generatedNumber);
    setLastOrderNumber(existingOrders.length
      ? String(Math.max(...existingNumbers.map((value) => {
          const matches = String(value || '').match(/\d+/g);
          return Number(matches?.[matches.length - 1]) || 0;
        }))).padStart(generatedNumber.length, '0')
      : 'لا يوجد');
    setContractId(((contractsResult.data || [])[0] as Contract | undefined)?.id || null);

    if (existingOrders.length) {
      const linesResult = await supabase
        .from('work_order_items')
        .select('item_id,quantity,executed_quantity')
        .in('work_order_id', existingOrders.map((order) => order.id));
      if (linesResult.error) setMessage(linesResult.error.message);
      else setItemBalances(buildBalances((linesResult.data || []) as ExistingLine[]));
    } else {
      setItemBalances(new Map());
    }

    setProjectLoading(false);
  }

  function buildBalances(lines: ExistingLine[]) {
    const map = new Map<string, ItemBalance>();
    for (const line of lines) {
      const current = map.get(line.item_id) || { executed: 0, reserved: 0 };
      const target = toNumber(line.quantity);
      const executed = toNumber(line.executed_quantity);
      current.executed += executed;
      current.reserved += Math.max(0, target - executed);
      map.set(line.item_id, current);
    }
    return map;
  }

  function toggleSite(siteId: string) {
    setSelectedSiteIds((current) => current.includes(siteId)
      ? current.filter((id) => id !== siteId)
      : [...current, siteId]);
  }

  function selectVisibleSites() {
    setSelectedSiteIds((current) => Array.from(new Set([...current, ...visibleSites.map((site) => site.id)])));
  }

  function clearSites() {
    setSelectedSiteIds([]);
  }

  function addItem() {
    if (!draftBoq || !draftBalance || selectedItems.some((item) => item.boqId === draftBoq.id)) return;
    const requested = Number(draftQuantity);
    if (!Number.isFinite(requested) || requested <= 0) {
      setMessage('أدخل كمية مطلوبة صحيحة قبل إضافة البند.');
      return;
    }
    if (requested > draftBalance.available) {
      setMessage('الكمية المطلوبة أكبر من الرصيد الحقيقي المتاح بعد خصم المنفذ والمحجوز.');
      return;
    }

    setMessage('');
    setSelectedItems((current) => [...current, {
      boqId: draftBoq.id,
      itemId: draftBoq.item_id,
      itemNo: draftBoq.boq_item_no || '',
      name: draftBoq.items?.name || 'بند غير مسمى',
      unit: draftBalance.unit,
      contractQuantity: draftBalance.contractQuantity,
      previousExecuted: draftBalance.executed,
      previouslyReserved: draftBalance.reserved,
      availableBefore: draftBalance.available,
      unitPrice: toNumber(draftBoq.unit_price),
      requestedQuantity: String(requested),
    }]);
    setItemToAdd('');
    setDraftQuantity('');
  }

  function updateQuantity(boqId: string, value: string) {
    setSelectedItems((current) => current.map((item) => item.boqId === boqId
      ? { ...item, requestedQuantity: value }
      : item));
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
      if (quantity > item.availableBefore) return `الكمية المطلوبة للبند «${item.name}» أكبر من الرصيد الحقيقي المتاح.`;
    }
    return '';
  }, [duration, orderNumber, projectId, selectedItems, selectedSiteIds.length, startDate]);

  async function createWorkOrder() {
    if (validation || !selectedProject) {
      setMessage(validation || 'تحقق من البيانات.');
      return;
    }

    setSaving(true);
    setMessage('');
    setCreatedOrderId('');
    let workOrderId = '';

    try {
      // Recheck balances immediately before saving to reduce double-reservation risk.
      const existingOrdersResult = await supabase.from('work_orders').select('id').eq('project_id', projectId);
      if (existingOrdersResult.error) throw existingOrdersResult.error;
      const existingOrderIds = (existingOrdersResult.data || []).map((row) => row.id);
      let latestBalances = new Map<string, ItemBalance>();
      if (existingOrderIds.length) {
        const latestLines = await supabase
          .from('work_order_items')
          .select('item_id,quantity,executed_quantity')
          .in('work_order_id', existingOrderIds)
          .in('item_id', selectedItems.map((item) => item.itemId));
        if (latestLines.error) throw latestLines.error;
        latestBalances = buildBalances((latestLines.data || []) as ExistingLine[]);
      }

      for (const item of selectedItems) {
        const boq = boqItems.find((row) => row.id === item.boqId);
        const contractQuantity = toNumber(boq?.contract_quantity);
        const latest = latestBalances.get(item.itemId) || { executed: 0, reserved: 0 };
        const available = Math.max(0, contractQuantity - latest.executed - latest.reserved);
        if ((Number(item.requestedQuantity) || 0) > available) {
          throw new Error(`تغيّر رصيد البند «${item.name}» أثناء العمل. المتاح الآن ${formatQuantity(available)} ${item.unit}. حدّث الصفحة وأعد المحاولة.`);
        }
      }

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
        notes: 'تم إنشاؤه يدويًا. كميات البنود مستهدفة ومحجوزة، ولا تُعد منفذة حتى تسجيل التنفيذ الفعلي.',
        source_file_name: null,
      }).select('id').single();
      if (inserted.error) throw inserted.error;
      workOrderId = inserted.data.id;

      const siteInsert = await supabase.from('work_order_sites').insert(
        selectedSiteIds.map((siteId) => ({ work_order_id: workOrderId, site_id: siteId })),
      );
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
          executed_quantity: 0,
          remaining_quantity: Math.max(0, item.availableBefore - quantity),
          unit_price: item.unitPrice,
          total_price: quantity * item.unitPrice,
          notes: `كمية مستهدفة ومحجوزة لأمر العمل • المواقع: ${selectedSiteIds.length}`,
          source_sheet: 'manual-entry-reservation',
          source_row_number: null,
        };
      }));
      if (itemInsert.error) throw itemInsert.error;

      setCreatedOrderId(workOrderId);
      setMessage(`تم إنشاء أمر العمل رقم ${orderNumber} وحجز كمياته بنجاح دون اعتبارها منفذة.`);
    } catch (error) {
      if (workOrderId) await supabase.from('work_orders').delete().eq('id', workOrderId);
      setMessage(error instanceof Error ? error.message : 'تعذر إنشاء أمر العمل.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page create-work-order-page create-work-order-v27">
      <section className="page-heading create-work-order-hero">
        <div>
          <span className="eyebrow">إدارة أوامر العمل</span>
          <h1>إنشاء أمر عمل جديد</h1>
          <p>حدد النطاق الزمني والمواقع، ثم احجز كميات البنود المستهدفة بعد مراجعة المنفذ والمحجوز والرصيد الحقيقي.</p>
        </div>
        <div className="actions"><Link href="/work-orders" className="btn">رجوع لأوامر العمل</Link></div>
      </section>

      {message ? (
        <div className={`notice ${createdOrderId ? 'success-notice' : 'error-notice'}`}>
          {message}
          {createdOrderId ? <Link href={`/work-order/${createdOrderId}`} className="text-link">فتح أمر العمل ←</Link> : null}
        </div>
      ) : null}

      <section className="create-order-step section-block">
        <div className="section-title"><div><span className="section-kicker">الخطوة 01</span><h2>المشروع ورقم الأمر</h2></div></div>
        <div className="create-order-fields project-number-layout">
          <label>
            <span>المشروع</span>
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)} disabled={loading}>
              <option value="">اختر المشروع...</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {compactProjectName(project.name)}
                </option>
              ))}
            </select>
          </label>
          <div className="next-order-number-card" aria-label="رقم أمر العمل التالي">
            <small>سيتم إنشاء</small>
            <span>أمر العمل رقم</span>
            <strong>{orderNumber}</strong>
            <div className="order-number-comparison">
              <span>آخر أمر مسجل</span>
              <b>{lastOrderNumber}</b>
            </div>
            <em>يُحسب تلقائيًا داخل المشروع المختار</em>
          </div>
        </div>

        {selectedProject ? (
          <div className="selected-project-summary">
            <div>
              <small>المشروع المختار</small>
              <strong>{selectedProject.name}</strong>
            </div>
            <div>
              <small>المقاول</small>
              <span>{selectedProject.contractor_name || 'غير مسجل'}</span>
            </div>
            <div>
              <small>المتاح بعد الاختيار</small>
              <span>{sites.length} موقع • {boqItems.length} بند عقد</span>
            </div>
          </div>
        ) : null}
      </section>

      <section className="create-order-step section-block">
        <div className="section-title">
          <div><span className="section-kicker">الخطوة 02</span><h2>نطاق المواقع</h2></div>
          <div className="site-selection-summary">
            <strong className="selected-count-badge">{selectedSiteIds.length} موقع محدد</strong>
            {projectId ? <span className="sites-source-note">المواقع متزامنة من نظام الري</span> : null}
            {selectedSiteIds.length ? (
              <span>{sites.filter((site) => selectedSiteIds.includes(site.id)).slice(0, 3).map((site) => site.name).join(' • ')}{selectedSiteIds.length > 3 ? ` • +${selectedSiteIds.length - 3}` : ''}</span>
            ) : null}
          </div>
        </div>
        {!projectId ? <div className="empty compact">اختر المشروع أولًا لعرض المواقع.</div> : projectLoading ? <div className="empty compact">جاري تحميل مواقع المشروع...</div> : (
          <div className="site-picker-panel">
            <div className="site-picker-toolbar">
              <input value={siteQuery} onChange={(event) => setSiteQuery(event.target.value)} placeholder="ابحث عن موقع..." />
              <button className="btn" type="button" onClick={selectVisibleSites} disabled={!visibleSites.length}>تحديد الظاهر</button>
              <button className="btn" type="button" onClick={clearSites} disabled={!selectedSiteIds.length}>إلغاء الكل</button>
            </div>
            <div className="create-site-selector searchable">
              {visibleSites.map((site) => (
                <label key={site.id} className={selectedSiteIds.includes(site.id) ? 'selected' : ''}>
                  <input type="checkbox" checked={selectedSiteIds.includes(site.id)} onChange={() => toggleSite(site.id)} />
                  <span>{site.name}</span>
                </label>
              ))}
              {!visibleSites.length ? <div className="empty compact">لا توجد مواقع مطابقة للبحث.</div> : null}
            </div>
          </div>
        )}
      </section>

      <section className="create-order-step section-block">
        <div className="section-title"><div><span className="section-kicker">الخطوة 03</span><h2>المدة والتواريخ</h2></div></div>
        <div className="create-order-fields three-columns timeline-fields">
          <label><span>مدة أمر العمل بالأيام</span><input type="number" min="1" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} /><small>عدد الأيام الفعلية: {duration || 0}</small></label>
          <label><span>تاريخ بداية أمر العمل</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label><span>تاريخ نهاية أمر العمل</span><input type="date" value={endDate} readOnly className="auto-field" /><small>يتحدث مباشرة من تاريخ البداية والمدة.</small></label>
        </div>
      </section>

      <section className="create-order-step section-block">
        <div className="section-title">
          <div><span className="section-kicker">الخطوة 04</span><h2>البنود والكميات المستهدفة</h2></div>
          <strong className="selected-count-badge">{selectedItems.length} بند مضاف</strong>
        </div>

        <div className="item-selection-builder">
          <label className="item-select-field">
            <span>اختيار البند</span>
            <select value={itemToAdd} onChange={(event) => { setItemToAdd(event.target.value); setDraftQuantity(''); }} disabled={!projectId || projectLoading}>
              <option value="">اختر بندًا من جدول كميات المشروع...</option>
              {boqItems.filter((boq) => !selectedItems.some((selected) => selected.boqId === boq.id)).map((boq) => (
                <option key={boq.id} value={boq.id}>
                  {boq.boq_item_no ? `${boq.boq_item_no} — ` : ''}{compactItemName(boq.items?.name || 'بند غير مسمى')}
                </option>
              ))}
            </select>
          </label>

          {draftBoq && draftBalance ? (
            <div className="item-balance-preview">
              <div className="item-preview-heading">
                <div>
                  <small>{draftBoq.boq_item_no ? `رقم البند ${draftBoq.boq_item_no}` : 'البند المختار'}</small>
                  <h3>{draftBoq.items?.name || 'بند غير مسمى'}</h3>
                </div>
                <div className="item-preview-meta">
                  <span>{draftBalance.unit || 'بدون وحدة'}</span>
                  <span>سعر الوحدة: {formatMoney(toNumber(draftBoq.unit_price))}</span>
                </div>
              </div>
              <div className="item-balance-grid five">
                <div><small>كمية العقد</small><strong>{formatQuantity(draftBalance.contractQuantity)}</strong></div>
                <div><small>المنفذ فعليًا</small><strong>{formatQuantity(draftBalance.executed)}</strong></div>
                <div><small>محجوز لأوامر أخرى</small><strong>{formatQuantity(draftBalance.reserved)}</strong></div>
                <div className="available"><small>الرصيد الحقيقي المتاح</small><strong>{formatQuantity(draftBalance.available)}</strong></div>
              </div>
              <div className="live-reservation-summary">
                <div><small>الرصيد الحالي</small><strong>{formatQuantity(draftBalance.available)}</strong></div>
                <div><small>المطلوب</small><strong>{formatQuantity(draftBalance.requested)}</strong></div>
                <div className={draftBalance.after < 0 ? 'danger' : ''}><small>الرصيد بعد الحجز</small><strong>{formatQuantity(draftBalance.after)}</strong></div>
              </div>
              <div className="item-request-row compact">
                <label><span>الكمية المطلوبة</span><input type="number" min="0" max={draftBalance.available} step="any" value={draftQuantity} onChange={(event) => setDraftQuantity(event.target.value)} /></label>
                <button className="btn primary add-selected-item-button" type="button" onClick={addItem}>+ إضافة البند</button>
              </div>
            </div>
          ) : <div className="empty compact">اختر بندًا لعرض كمية العقد والمنفذ والمحجوز والرصيد المتاح.</div>}
        </div>

        {selectedItems.length ? (
          <div className="table-wrap create-order-items-table reserved-items-table">
            <table>
              <thead><tr><th>رقم</th><th>البند</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة</th><th>القيمة</th><th>الرصيد بعد الحجز</th><th></th></tr></thead>
              <tbody>{selectedItems.map((item) => {
                const requested = Number(item.requestedQuantity) || 0;
                const after = item.availableBefore - requested;
                return (
                  <tr key={item.boqId}>
                    <td><b>{item.itemNo || '—'}</b></td>
                    <td><b>{compactItemName(item.name)}</b><small title={item.name}>{item.name}</small></td>
                    <td>{item.unit || '—'}</td>
                    <td><input type="number" min="0" max={item.availableBefore} step="any" value={item.requestedQuantity} onChange={(event) => updateQuantity(item.boqId, event.target.value)} /></td>
                    <td>{formatMoney(item.unitPrice)}</td>
                    <td><b>{formatMoney(requested * item.unitPrice)}</b></td>
                    <td className={after < 0 ? 'danger-value' : ''}>{formatQuantity(after)}</td>
                    <td><button className="icon-danger-button" type="button" onClick={() => removeItem(item.boqId)} title="حذف البند">×</button></td>
                  </tr>
                );
              })}</tbody>
              <tfoot><tr><td colSpan={3}>الإجمالي</td><td><b>{formatQuantity(totalRequestedQuantity)}</b></td><td>—</td><td><b>{formatMoney(estimatedValue)}</b></td><td colSpan={2}>—</td></tr></tfoot>
            </table>
          </div>
        ) : null}
      </section>

      <section className="create-order-step section-block final-order-review">
        <div className="section-title"><div><span className="section-kicker">المراجعة النهائية</span><h2>اعتماد إنشاء أمر العمل</h2></div></div>
        <div className="final-review-card">
          <div className="review-order-number"><small>سيتم إنشاء</small><strong>أمر العمل رقم {orderNumber}</strong><span>{selectedProject?.name || 'لم يتم اختيار المشروع'}</span></div>
          <div className="review-summary-grid seven">
            <div><small>المواقع</small><strong>{selectedSiteIds.length}</strong></div>
            <div><small>عدد البنود</small><strong>{selectedItems.length}</strong></div>
            <div><small>إجمالي الكميات</small><strong>{formatQuantity(totalRequestedQuantity)}</strong></div>
            <div><small>المدة</small><strong>{duration || 0} يوم</strong></div>
            <div><small>البداية</small><strong>{startDate || '—'}</strong></div>
            <div><small>النهاية</small><strong>{endDate || '—'}</strong></div>
            <div><small>القيمة الإجمالية قبل الضريبة</small><strong>{formatMoney(estimatedValue)}</strong></div>
          </div>
          <div className="reservation-explainer"><b>منطق الحجز:</b> الكميات المختارة ستُخصم من الرصيد المتاح وتظهر كمحجوزة لأمر العمل، ولن تُضاف إلى المنفذ الفعلي إلا عند تسجيل التنفيذ لاحقًا.</div>
          {validation ? <div className="inline-validation">{validation}</div> : <div className="inline-validation ready">البيانات مكتملة وجاهزة للاعتماد.</div>}
          <button className="btn primary create-order-submit" type="button" onClick={createWorkOrder} disabled={Boolean(validation) || saving || projectLoading}>
            {saving ? 'جاري الإنشاء والحجز...' : 'اعتماد وإنشاء أمر العمل'}
          </button>
        </div>
      </section>
    </main>
  );
}
