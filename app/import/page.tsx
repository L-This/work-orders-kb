'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { normalizeArabic } from '@/lib/helpers';
import { parseWorkOrdersMatrixWorkbook, SmartWorkbook } from '@/lib/excel-import';
import { getWorkOrderTiming } from '@/lib/work-order-timing';

type ImportProgress = {
  step: string;
  current: number;
  total: number;
};

const keyOf = (...parts: unknown[]) => parts.map(p => String(p ?? '')).join('::');

export default function ImportPage() {
  const [fileName, setFileName] = useState('');
  const [data, setData] = useState<SmartWorkbook | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [imported, setImported] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [orderQuery, setOrderQuery] = useState('');
  const [showAllOrders, setShowAllOrders] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const metrics = useMemo(() => {
    if (!data) return null;
    return {
      boqItems: data.boqItems.length,
      workOrders: data.workOrders.length,
      sites: data.sites.length,
      orderLines: data.workOrders.reduce((sum, order) => sum + order.items.length, 0),
      executed: data.workOrders.reduce((sum, order) => sum + order.items.reduce((s, item) => s + item.quantity, 0), 0),
    };
  }, [data]);

  const readiness = useMemo(() => {
    if (!data) return null;
    const checks = [
      { label: 'اسم المشروع', ready: Boolean(data.project.name?.trim()) },
      { label: 'جدول الكميات', ready: data.boqItems.length > 0 },
      { label: 'أوامر العمل', ready: data.workOrders.length > 0 },
      { label: 'المواقع المرتبطة', ready: data.sites.length > 0 },
    ];
    return { checks, ready: checks.every(check => check.ready), percent: Math.round((checks.filter(check => check.ready).length / checks.length) * 100) };
  }, [data]);

  const filteredOrders = useMemo(() => {
    if (!data) return [];
    const needle = normalizeArabic(orderQuery.trim());
    if (!needle) return data.workOrders;
    return data.workOrders.filter(order => normalizeArabic([order.number, ...order.sites, ...order.items.map(item => item.itemName)].join(' ')).includes(needle));
  }, [data, orderQuery]);

  const visibleOrders = showAllOrders ? filteredOrders : filteredOrders.slice(0, 6);

  function resetImport() {
    setFileName(''); setData(null); setStatus(''); setError(''); setProgress(null); setImported(false); setOrderQuery(''); setShowAllOrders(false);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function parseFile(file: File) {
    if (!/\.(xlsx|xls)$/i.test(file.name)) { setError('صيغة الملف غير مدعومة. اختر ملف XLSX أو XLS.'); return; }
    setFileName(file.name); setData(null); setImported(false); setError(''); setShowAllOrders(false); setOrderQuery('');
    setStatus('جاري تحليل الملف واكتشاف بنية أوامر العمل...');
    try {
      const parsed = parseWorkOrdersMatrixWorkbook(await file.arrayBuffer());
      setData(parsed); setStatus('اكتمل التحليل. راجع نتيجة فحص الملف قبل اعتماد الاستيراد.');
    } catch (e: any) { setError(e?.message || 'تعذر تحليل ملف Excel.'); setStatus(''); }
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await parseFile(file);
  }

  async function ensureProject(parsed: SmartWorkbook) {
    const payload = {
      name: parsed.project.name,
      code: parsed.project.code || null,
      municipality: parsed.project.municipality || null,
      contractor_name: parsed.project.contractorName || null,
      status: 'active',
      description: 'تم استيراد بيانات المشروع من جدول الكميات وأوامر العمل التاريخية.',
    };
    const existing = parsed.project.code
      ? await supabase.from('projects').select('id,name').eq('code', parsed.project.code).maybeSingle()
      : await supabase.from('projects').select('id,name').eq('name', parsed.project.name).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.id) {
      const updatePayload = payload;
      const update = await supabase.from('projects').update(updatePayload).eq('id', existing.data.id);
      if (update.error) throw update.error;
      return existing.data.id as string;
    }
    const inserted = await supabase.from('projects').insert(payload).select('id').single();
    if (inserted.error) throw inserted.error;
    return inserted.data.id as string;
  }

  async function ensureContract(projectId: string, parsed: SmartWorkbook) {
    const contractNumber = parsed.project.code || 'العقد الرئيسي';
    const payload = {
      project_id: projectId,
      contract_number: contractNumber,
      contract_name: parsed.project.name,
      start_date: parsed.project.startDate,
      end_date: parsed.project.endDate,
      contractor_name: parsed.project.contractorName || null,
      total_value: parsed.project.contractValue,
      notes: `مصدر البيانات: ${fileName}`,
    };
    const existing = await supabase.from('contracts').select('id').eq('project_id', projectId).eq('contract_number', contractNumber).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.id) {
      const update = await supabase.from('contracts').update(payload).eq('id', existing.data.id);
      if (update.error) throw update.error;
      return existing.data.id as string;
    }
    const inserted = await supabase.from('contracts').insert(payload).select('id').single();
    if (inserted.error) throw inserted.error;
    return inserted.data.id as string;
  }

  async function importWorkbook() {
    if (!data) return;
    if (!isSupabaseConfigured) {
      setError('لم يتم ربط Supabase بالموقع.');
      return;
    }
    setError('');
    setImported(false);
    setStatus('بدأ الاستيراد. لا تغلق الصفحة حتى تظهر رسالة الاكتمال.');

    let batchId = '';
    try {
      const projectId = await ensureProject(data);
      const contractId = await ensureContract(projectId, data);
      const batch = await supabase.from('import_batches').insert({
        project_id: projectId,
        file_name: fileName,
        import_status: 'parsed',
        notes: `المحلل: ${data.parser} — ${data.workOrders.length} أوامر عمل، ${data.sites.length} مواقع، ${data.boqItems.length} بنود.`,
      }).select('id').single();
      if (batch.error) throw batch.error;
      batchId = batch.data.id;

      const siteIds = new Map<string, string>();
      setProgress({ step: 'إنشاء المواقع', current: 0, total: data.sites.length });
      for (let index = 0; index < data.sites.length; index += 1) {
        const siteName = data.sites[index];
        const existing = await supabase.from('sites').select('id').eq('project_id', projectId).eq('name', siteName).maybeSingle();
        if (existing.error) throw existing.error;
        let siteId = existing.data?.id as string | undefined;
        if (!siteId) {
          const inserted = await supabase.from('sites').insert({
            project_id: projectId,
            name: siteName,
            normalized_name: normalizeArabic(siteName),
            status: 'active',
          }).select('id').single();
          if (inserted.error) throw inserted.error;
          siteId = inserted.data.id;
        }
        siteIds.set(siteName, siteId);
        setProgress({ step: 'إنشاء المواقع', current: index + 1, total: data.sites.length });
      }

      const itemIds = new Map<string, string>();
      const boqIds = new Map<string, string>();
      setProgress({ step: 'استيراد جدول الكميات', current: 0, total: data.boqItems.length });
      for (let index = 0; index < data.boqItems.length; index += 1) {
        const item = data.boqItems[index];
        const normalized = normalizeArabic(item.itemName);
        const existing = await supabase.from('items').select('id').eq('name', item.itemName).maybeSingle();
        if (existing.error) throw existing.error;
        let itemId = existing.data?.id as string | undefined;
        if (!itemId) {
          const inserted = await supabase.from('items').insert({
            name: item.itemName,
            normalized_name: normalized,
            unit: item.unit || null,
            is_active: true,
          }).select('id').single();
          if (inserted.error) throw inserted.error;
          itemId = inserted.data.id;
        }
        itemIds.set(keyOf(item.itemNo, item.itemName), itemId);

        const boqExisting = await supabase.from('project_boq_items')
          .select('id')
          .eq('project_id', projectId)
          .eq('item_id', itemId)
          .eq('boq_item_no', item.itemNo)
          .maybeSingle();
        if (boqExisting.error) throw boqExisting.error;
        const boqPayload = {
          project_id: projectId,
          contract_id: contractId,
          item_id: itemId,
          boq_item_no: item.itemNo,
          unit: item.unit || null,
          contract_quantity: item.contractQuantity,
          unit_price: item.unitPrice,
          total_price: item.totalPrice,
          notes: `صف Excel رقم ${item.rowNumber}`,
        };
        let boqId = boqExisting.data?.id as string | undefined;
        if (boqId) {
          const updated = await supabase.from('project_boq_items').update(boqPayload).eq('id', boqId);
          if (updated.error) throw updated.error;
        } else {
          const inserted = await supabase.from('project_boq_items').insert(boqPayload).select('id').single();
          if (inserted.error) throw inserted.error;
          boqId = inserted.data.id;
        }
        boqIds.set(keyOf(item.itemNo, item.itemName), boqId);
        setProgress({ step: 'استيراد جدول الكميات', current: index + 1, total: data.boqItems.length });
      }

      let importedLines = 0;
      const totalLines = data.workOrders.reduce((sum, order) => sum + order.items.length, 0);
      setProgress({ step: 'استيراد أوامر العمل', current: 0, total: totalLines });
      for (const order of data.workOrders) {
        const workOrderNumber = order.number;
        const existing = await supabase.from('work_orders').select('id').eq('project_id', projectId).eq('work_order_number', workOrderNumber).maybeSingle();
        if (existing.error) throw existing.error;
        const orderPayload = {
          project_id: projectId,
          contract_id: contractId,
          work_order_number: workOrderNumber,
          work_order_date: order.startDate,
          work_order_end_date: order.endDate,
          duration_days: order.durationDays,
          title: `أمر عمل رقم ${workOrderNumber}`,
          status: order.status,
          contractor_name: data.project.contractorName || null,
          notes: null,
          source_file_name: fileName,
        };
        let workOrderId = existing.data?.id as string | undefined;
        if (workOrderId) {
          const updated = await supabase.from('work_orders').update(orderPayload).eq('id', workOrderId);
          if (updated.error) throw updated.error;
        } else {
          const inserted = await supabase.from('work_orders').insert(orderPayload).select('id').single();
          if (inserted.error) throw inserted.error;
          workOrderId = inserted.data.id;
        }

        for (const siteName of order.sites) {
          const siteId = siteIds.get(siteName);
          if (!siteId) continue;
          const relation = await supabase.from('work_order_sites').upsert(
            { work_order_id: workOrderId, site_id: siteId },
            { onConflict: 'work_order_id,site_id' },
          );
          if (relation.error) throw relation.error;
        }

        for (const line of order.items) {
          const mapKey = keyOf(line.itemNo, line.itemName);
          const itemId = itemIds.get(mapKey);
          const boqId = boqIds.get(mapKey);
          if (!itemId) continue;
          const existingLine = await supabase.from('work_order_items')
            .select('id')
            .eq('work_order_id', workOrderId)
            .eq('item_id', itemId)
            .eq('source_sheet', data.sheetName)
            .eq('source_row_number', line.rowNumber)
            .maybeSingle();
          if (existingLine.error) throw existingLine.error;
          const payload = {
            work_order_id: workOrderId,
            site_id: null,
            item_id: itemId,
            boq_item_id: boqId || null,
            item_no: line.itemNo,
            unit: line.unit || null,
            quantity: line.quantity,
            executed_quantity: line.quantity,
            remaining_quantity: line.remainingAfterOrder,
            unit_price: line.unitPrice,
            total_price: line.totalPrice,
            notes: order.sites.length ? `مواقع التنفيذ: ${order.sites.join('، ')}` : null,
            source_sheet: data.sheetName,
            source_row_number: line.rowNumber,
          };
          if (existingLine.data?.id) {
            const updated = await supabase.from('work_order_items').update(payload).eq('id', existingLine.data.id);
            if (updated.error) throw updated.error;
          } else {
            const inserted = await supabase.from('work_order_items').insert(payload);
            if (inserted.error) throw inserted.error;
          }
          const raw = await supabase.from('raw_excel_rows').insert({
            import_batch_id: batchId,
            sheet_name: data.sheetName,
            row_number: line.rowNumber,
            raw_data: { order: workOrderNumber, line, sites: order.sites },
            parsed_project_name: data.project.name,
            parsed_site_name: order.sites.join('، '),
            parsed_work_order_number: workOrderNumber,
            parsed_work_order_date: order.startDate,
            parsed_item_name: line.itemName,
            parsed_unit: line.unit,
            parsed_quantity: line.quantity,
            parsed_executed_quantity: line.quantity,
            parsed_remaining_quantity: line.remainingAfterOrder,
            parse_status: 'imported',
          });
          if (raw.error) throw raw.error;
          importedLines += 1;
          setProgress({ step: 'استيراد أوامر العمل', current: importedLines, total: totalLines });
        }
      }

      const complete = await supabase.from('import_batches').update({
        import_status: 'imported',
        imported_rows_count: importedLines,
        error_rows_count: 0,
      }).eq('id', batchId);
      if (complete.error) throw complete.error;
      setProgress(null);
      setImported(true);
      setStatus(`تم استيراد المشروع بنجاح: ${data.workOrders.length} أوامر عمل، ${data.sites.length} مواقع، ${importedLines} بند منفذ.`);
    } catch (e: any) {
      console.error(e);
      if (batchId) {
        await supabase.from('import_batches').update({ import_status: 'failed', error_rows_count: 1, notes: e?.message || 'خطأ غير معروف' }).eq('id', batchId);
      }
      setProgress(null);
      setError(e?.message || 'تعذر إكمال الاستيراد.');
      setStatus('');
    }
  }

  return (
    <main className="page import-page import-center-page">
      <section className="import-hero-pro"><div><span className="section-kicker">مركز إدخال البيانات</span><h1>استيراد Excel الذكي</h1><p>ارفع ملف المشروع، وسيكتشف النظام المشروع وجدول الكميات والمواقع وأوامر العمل تلقائيًا قبل كتابة أي معلومة في القاعدة.</p></div><div className="import-hero-shield"><span>✓</span><strong>مراجعة قبل الحفظ</strong><small>لن تُكتب البيانات قبل اعتمادك النهائي</small></div></section>

      <div className="steps import-steps">
        <span className={`step ${fileName ? 'active' : ''}`}>1 رفع الملف</span>
        <span className={`step ${data ? 'active' : ''}`}>2 التحليل العام</span>
        <span className={`step ${data ? 'active' : ''}`}>3 المراجعة</span>
        <span className={`step ${imported ? 'active' : ''}`}>4 الاعتماد</span>
      </div>

      <section className={`drop import-drop import-drop-pro ${dragging ? 'is-dragging' : ''} ${fileName ? 'has-file' : ''}`} onDragEnter={event=>{event.preventDefault();setDragging(true)}} onDragOver={event=>event.preventDefault()} onDragLeave={event=>{event.preventDefault();setDragging(false)}} onDrop={event=>{event.preventDefault();setDragging(false);const file=event.dataTransfer.files?.[0];if(file)void parseFile(file)}}>
        <input ref={fileInput} id="excel-file" type="file" accept=".xlsx,.xls" onChange={onFile} />
        <label htmlFor="excel-file">
          <span className="upload-icon">{fileName ? '✓' : 'XL'}</span>
          <strong>{fileName || 'اسحب ملف Excel هنا أو اضغط للاختيار'}</strong>
          <small>{fileName ? 'تم اختيار الملف وتحليله محليًا — يمكنك استبداله بملف آخر' : 'XLSX أو XLS · لا يتم الحفظ في القاعدة قبل الاعتماد'}</small>
        </label>
        {fileName ? <button type="button" className="import-reset" onClick={event=>{event.stopPropagation();resetImport()}}>إزالة الملف والبدء من جديد</button> : null}
      </section>

      {status && <div className="notice import-notice">{status}</div>}
      {error && <div className="notice error-notice">{error}</div>}

      {data && metrics && (
        <>
          <section className="panel import-project-summary">
            <div>
              <span className="section-kicker">بيانات المشروع المكتشفة</span>
              <h2>{data.project.name}</h2>
              <p>{data.project.municipality || 'البلدية غير مذكورة'} · {data.project.contractorName || 'المقاول غير مذكور'}</p><small className="import-parser-badge">محلل عام متعدد المشاريع · {data.parser}</small>
            </div>
            <div className="project-meta-grid">
              <span><small>رقم المشروع</small><b>{data.project.code || '—'}</b></span>
              <span><small>بداية المشروع</small><b>{data.project.startDate || '—'}</b></span>
              <span><small>نهاية المشروع</small><b>{data.project.endDate || '—'}</b></span>
              <span><small>قيمة البنود</small><b>{data.project.contractValue.toLocaleString('ar-SA')}</b></span>
            </div>
          </section>

          {readiness && <section className={`import-readiness ${readiness.ready ? 'ready' : 'needs-review'}`}><div className="readiness-score"><strong>{readiness.percent}%</strong><span>جاهزية الملف</span></div><div><span className="section-kicker">فحص تلقائي قبل الاستيراد</span><h2>{readiness.ready ? 'الملف جاهز للمراجعة والاعتماد' : 'الملف يحتاج إلى مراجعة'}</h2><div className="readiness-checks">{readiness.checks.map(check=><span className={check.ready?'ok':'missing'} key={check.label}><i>{check.ready?'✓':'!'}</i>{check.label}</span>)}</div></div></section>}

          <section className="stats import-metrics">
            <div className="stat"><small>بنود جدول الكميات</small><strong>{metrics.boqItems}</strong><span>البنود الأصلية للعقد</span></div>
            <div className="stat"><small>أوامر العمل المكتشفة</small><strong>{metrics.workOrders}</strong><span>أوامر تحتوي بيانات فعلية</span></div>
            <div className="stat"><small>المواقع</small><strong>{metrics.sites}</strong><span>أسماء مواقع منفصلة</span></div>
            <div className="stat"><small>بنود أوامر العمل</small><strong>{metrics.orderLines}</strong><span>سطر قابل للاستيراد</span></div>
          </section>

          {data.warnings.length > 0 && (
            <section className="panel warning-panel">
              <h3>ملاحظات قبل الاعتماد</h3>
              {data.warnings.map(warning => <p key={warning}>• {warning}</p>)}
            </section>
          )}

          <section className="panel">
            <div className="section-title">
              <div><span className="section-kicker">المراجعة</span><h2>أوامر العمل والمواقع</h2></div>
              <span>{filteredOrders.length} من {data.workOrders.length} أوامر</span>
            </div>
            <div className="import-order-toolbar"><input value={orderQuery} onChange={event=>{setOrderQuery(event.target.value);setShowAllOrders(false)}} placeholder="ابحث برقم الأمر أو الموقع أو اسم البند..." />{orderQuery?<button type="button" onClick={()=>setOrderQuery('')}>مسح</button>:null}</div>
            <div className="import-orders-grid">
              {visibleOrders.map(order => {
                const timing = getWorkOrderTiming(order.startDate, order.endDate);
                return (
                <article className="import-order-card" key={order.number}>
                  <div className="import-order-head">
                    <span>أمر عمل</span>
                    <strong>{order.number}</strong>
                  </div>
                  <div className={`import-order-timing ${timing.tone}`}>
                    <div>
                      <small>الحالة الزمنية</small>
                      <b>{timing.label}</b>
                    </div>
                    <span>{timing.phase === 'active' && timing.progressPercent !== null ? `اكتمل ${timing.progressPercent}% من المدة` : timing.phase === 'upcoming' ? 'لم يبدأ التنفيذ بعد' : timing.phase === 'ended' ? 'تم تجاوز تاريخ الانتهاء' : 'لا توجد مدة كاملة'}</span>
                    {timing.progressPercent !== null && (
                      <div className="timing-progress" aria-label={`نسبة تقدم المدة ${timing.progressPercent}%`}>
                        <i style={{ width: `${timing.progressPercent}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="import-order-data">
                    <p><small>تاريخ البدء</small><b>{order.startDate || 'غير مذكور'}</b></p>
                    <p><small>تاريخ الانتهاء</small><b>{order.endDate || 'غير مذكور'}</b></p>
                    <p><small>مدة أمر العمل</small><b>{order.durationDays !== null ? `${order.durationDays} يوم` : 'غير محددة'}</b></p>
                    <p><small>المواقع</small><b>{order.sites.length}</b></p>
                    <p><small>البنود المنفذة</small><b>{order.items.length}</b></p>
                  </div>
                  <div className="site-chips">
                    {order.sites.slice(0, 5).map(site => <span key={site}>{site}</span>)}
                    {order.sites.length > 5 && <span>+{order.sites.length - 5}</span>}
                  </div>
                </article>
                );
              })}
            </div>
            {!visibleOrders.length?<div className="import-no-orders">لا توجد أوامر عمل مطابقة لعبارة البحث.</div>:null}
            {filteredOrders.length>6?<button type="button" className="import-show-more" onClick={()=>setShowAllOrders(value=>!value)}>{showAllOrders?'عرض أول 6 أوامر':`عرض جميع الأوامر (${filteredOrders.length})`}</button>:null}
          </section>

          <section className="panel">
            <div className="section-title">
              <div><span className="section-kicker">المعاينة</span><h2>أول بنود جدول الكميات</h2></div>
              <span>يتم استيراد جميع البنود</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>رقم البند</th><th>الوصف</th><th>الوحدة</th><th>كمية العقد</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
                <tbody>{data.boqItems.slice(0, 18).map(item => (
                  <tr key={`${item.itemNo}-${item.rowNumber}`}><td>{item.itemNo}</td><td><b>{item.itemName}</b></td><td>{item.unit}</td><td>{item.contractQuantity.toLocaleString('ar-SA')}</td><td>{item.unitPrice.toLocaleString('ar-SA')}</td><td>{item.totalPrice.toLocaleString('ar-SA')}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </section>

          <section className="panel import-approval">
            <div>
              <span className="section-kicker">الاعتماد النهائي</span>
              <h2>استيراد البيانات إلى Supabase</h2>
              <p>الاستيراد آمن عند تكراره: يتم تحديث المشروع والعقد والبنود وأوامر العمل الموجودة بدل إنشاء نسخ مكررة.</p>
            </div>
            <button className="btn primary import-button" onClick={importWorkbook} disabled={Boolean(progress) || imported || !readiness?.ready}>
              {progress ? `${progress.step} (${progress.current}/${progress.total})` : imported ? 'تم الاعتماد بنجاح' : 'اعتماد واستيراد المشروع'}
            </button>
            {progress && <div className="progress-track"><span style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }} /></div>}
            {imported && <div className="import-success-actions"><Link className="btn primary" href="/">فتح مركز المعرفة</Link><Link className="btn" href="/projects">فتح المشروع</Link></div>}
          </section>
        </>
      )}
    </main>
  );
}
