'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { parseDateOnly } from '@/lib/helpers';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { getWorkOrderTiming } from '@/lib/work-order-timing';

type OrderRow = {
  id: string;
  project_id: string;
  work_order_number: string;
  work_order_date: string | null;
  work_order_end_date: string | null;
  duration_days: number | null;
  title: string | null;
  status: string | null;
  contractor_name: string | null;
  notes: string | null;
  source_file_name: string | null;
  projects: { id: string; name: string } | null;
};
type SiteRelation = {
  site_id: string;
  notes: string | null;
  sites: { id: string; name: string; area_name: string | null } | null;
};
type ItemRow = {
  id: string;
  item_id: string;
  boq_item_id: string | null;
  item_no: string | null;
  unit: string | null;
  quantity: number | string | null;
  executed_quantity: number | string | null;
  remaining_quantity: number | string | null;
  unit_price: number | string | null;
  total_price: number | string | null;
  notes: string | null;
  items: { id: string; name: string; category: string | null } | null;
};
type AttachmentRow = {
  id: string;
  attachment_type: string;
  title: string | null;
  file_url: string;
  file_name: string | null;
};

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('ar-SA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(parseDateOnly(value))
    : 'غير مذكور';

const statusLabel = (status: string | null) => {
  const labels: Record<string, string> = {
    approved: 'معتمد',
    completed: 'مكتمل',
    active: 'نشط',
    draft: 'مسودة',
    cancelled: 'ملغي',
  };
  return labels[String(status || 'approved').toLowerCase()] || status || 'معتمد';
};

export default function WorkOrderDetailPage({
  params,
}: {
  params: { workOrderId: string };
}) {
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [sites, setSites] = useState<SiteRelation[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [activeSection, setActiveSection] = useState<'summary' | 'sites' | 'items' | 'attachments'>('summary');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage('');

    const [orderResult, sitesResult, itemsResult, attachmentsResult] = await Promise.all([
      supabase
        .from('work_orders')
        .select(
          'id,project_id,work_order_number,work_order_date,work_order_end_date,duration_days,title,status,contractor_name,notes,source_file_name,projects(id,name)',
        )
        .eq('id', params.workOrderId)
        .single(),
      supabase
        .from('work_order_sites')
        .select('site_id,notes,sites(id,name,area_name)')
        .eq('work_order_id', params.workOrderId),
      supabase
        .from('work_order_items')
        .select(
          'id,item_id,boq_item_id,item_no,unit,quantity,executed_quantity,remaining_quantity,unit_price,total_price,notes,items(id,name,category)',
        )
        .eq('work_order_id', params.workOrderId)
        .order('item_no', { ascending: true }),
      supabase
        .from('attachments')
        .select('id,attachment_type,title,file_url,file_name')
        .eq('work_order_id', params.workOrderId)
        .order('created_at', { ascending: false }),
    ]);

    if (orderResult.error || sitesResult.error || itemsResult.error || attachmentsResult.error) {
      setMessage(
        orderResult.error?.message ||
          sitesResult.error?.message ||
          itemsResult.error?.message ||
          attachmentsResult.error?.message ||
          'تعذر تحميل تفاصيل أمر العمل.',
      );
      setLoading(false);
      return;
    }

    const rawItems = (itemsResult.data || []) as unknown as ItemRow[];
    const boqIds = Array.from(
      new Set(rawItems.map((item) => item.boq_item_id).filter((id): id is string => Boolean(id))),
    );
    const boqPrices = new Map<string, number>();
    if (boqIds.length) {
      const boqResult = await supabase
        .from('project_boq_items')
        .select('id,unit_price')
        .in('id', boqIds);
      if (boqResult.error) {
        setMessage(boqResult.error.message);
        setLoading(false);
        return;
      }
      for (const row of boqResult.data || []) {
        boqPrices.set(row.id, Number(row.unit_price) || 0);
      }
    }

    const hydratedItems = rawItems.map((item) => ({
      ...item,
      unit_price:
        Number(item.unit_price) ||
        (item.boq_item_id ? boqPrices.get(item.boq_item_id) || 0 : 0),
    }));

    setOrder(orderResult.data as unknown as OrderRow);
    setSites((sitesResult.data || []) as unknown as SiteRelation[]);
    setItems(hydratedItems);
    setAttachments((attachmentsResult.data || []) as AttachmentRow[]);
    setLoading(false);
  }

  const distinctItems = new Set(items.map((item) => item.item_id)).size;
  const totalExecutionValue = items.reduce(
    (sum, item) => sum + (Number(item.total_price) || 0),
    0,
  );
  const unitsCount = new Set(items.map((item) => item.unit).filter(Boolean)).size;
  const itemsWithRemaining = items.filter((item) => (Number(item.remaining_quantity) || 0) > 0).length;
  const timing = getWorkOrderTiming(order?.work_order_date, order?.work_order_end_date);
  const quantitiesByUnit = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of items) {
      const unit = item.unit || 'بدون وحدة';
      totals.set(
        unit,
        (totals.get(unit) || 0) + (Number(item.executed_quantity ?? item.quantity) || 0),
      );
    }
    return Array.from(totals.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ar'));
  }, [items]);

  return (
    <main className="page work-order-detail-page">
      <div className="section-title work-order-detail-title">
        <div>
          <span className="eyebrow">تفاصيل أمر العمل</span>
          <p className="muted">{order?.projects?.name || 'المشروع غير محدد'}</p>
        </div>
        <div className="actions">
          {order?.project_id ? (
            <Link href={`/project/${order.project_id}`} className="btn">
              رجوع للمشروع
            </Link>
          ) : null}
          <Link href="/work-orders" className="btn">
            جميع أوامر العمل
          </Link>
        </div>
      </div>

      {message ? <div className="notice error-notice">{message}</div> : null}

      <section className="work-order-hero-card">
        <div className="work-order-hero-main">
          <span className="badge">{statusLabel(order?.status || null)}</span>
          <h1>{order?.title || `أمر عمل رقم ${order?.work_order_number || ''}`}</h1>
          <p>{order?.projects?.name || 'المشروع غير محدد'}</p>
          <div className={`work-order-live-counter ${timing.tone}`}>
            <div className="timing-label-row"><strong>{timing.label}</strong><span>{order?.duration_days ? `المدة الكاملة: ${order.duration_days} يوم` : 'المدة الكاملة غير محددة'}</span></div>
            {timing.progressPercent !== null && (
              <>
                <div className="timing-progress"><i style={{ width: `${timing.progressPercent}%` }} /></div>
                <small className="timing-progress-caption">{timing.phase === 'active' ? `نسبة التقدم الزمني ${timing.progressPercent}%` : timing.phase === 'upcoming' ? 'لم تبدأ مدة أمر العمل' : 'اكتملت المدة الزمنية'}</small>
              </>
            )}
          </div>
        </div>
        <div className="work-order-meta-panel">
          <span>
            <small>تاريخ بداية الأمر</small>
            <b>{formatDate(order?.work_order_date || null)}</b>
          </span>
          <span>
            <small>تاريخ انتهاء الأمر</small>
            <b>{formatDate(order?.work_order_end_date || null)}</b>
          </span>
          <span>
            <small>المقاول</small>
            <b>{order?.contractor_name || 'غير مذكور'}</b>
          </span>
          <span>
            <small>مصدر البيانات</small>
            <b>{order?.source_file_name || 'إدخال النظام'}</b>
          </span>
        </div>
      </section>

      <section className="stats work-order-detail-stats">
        <div className="stat">
          <strong>{sites.length}</strong>
          <span>مواقع مرتبطة</span>
        </div>
        <div className="stat">
          <strong>{distinctItems}</strong>
          <span>بنود مختلفة</span>
        </div>
        <div className="stat">
          <strong>{items.length}</strong>
          <span>سجلات بنود</span>
        </div>
        <div className="stat wide">
          <strong>{totalExecutionValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}</strong>
          <span>قيمة التنفيذ قبل الضريبة</span>
        </div>
        <div className="stat">
          <strong>{unitsCount}</strong>
          <span>وحدات قياس مختلفة</span>
        </div>
        <div className="stat">
          <strong>{itemsWithRemaining}</strong>
          <span>بنود لها رصيد متبقٍ</span>
        </div>
      </section>

      {sites.length > 1 ? (
        <div className="notice work-order-meaning-note">
          <b>تنبيه دقة البيانات:</b> هذا الأمر مرتبط بـ {sites.length} مواقع. كميات البنود أدناه هي
          كميات أمر العمل لجميع المواقع المرتبطة، وليست توزيعًا مؤكدًا لكل موقع على حدة.
        </div>
      ) : null}

      <nav className="detail-section-switcher" aria-label="أقسام أمر العمل">
        <button className={activeSection === 'summary' ? 'active' : ''} onClick={() => setActiveSection('summary')}><span>◫</span><b>الملخص</b><small>{quantitiesByUnit.length} وحدات قياس</small></button>
        <button className={activeSection === 'sites' ? 'active' : ''} onClick={() => setActiveSection('sites')}><span>⌖</span><b>المواقع</b><small>{sites.length} مواقع مرتبطة</small></button>
        <button className={activeSection === 'items' ? 'active' : ''} onClick={() => setActiveSection('items')}><span>≡</span><b>البنود</b><small>{items.length} سجل</small></button>
        <button className={activeSection === 'attachments' ? 'active' : ''} onClick={() => setActiveSection('attachments')}><span>⌑</span><b>المرفقات</b><small>{attachments.length} ملف</small></button>
      </nav>

      {activeSection === 'summary' ? <section className="section-block work-order-unit-summary detail-stage">
        <div className="section-title">
          <div>
            <span className="section-kicker">ملخص الكميات</span>
            <h2>الكميات المنفذة حسب وحدة القياس</h2>
          </div>
          <span>{quantitiesByUnit.length} وحدات</span>
        </div>
        <div className="unit-summary-grid">
          {quantitiesByUnit.map(([unit, total]) => (
            <div className="unit-summary-card" key={unit}>
              <small>{unit}</small>
              <b>{total.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b>
            </div>
          ))}
        </div>
      </section> : null}

      {activeSection === 'sites' ? <div className="work-order-detail-grid detail-stage single-stage">
        <section className="panel work-order-sites-panel">
          <div className="section-title">
            <div>
              <span className="section-kicker">نطاق الأمر</span>
              <h2>المواقع المشمولة</h2>
            </div>
            <span>{sites.length} موقع</span>
          </div>
          <div className="work-order-site-list">
            {sites.map((relation) => (
              <Link
                href={`/site/${relation.site_id}`}
                className="work-order-site-card"
                key={relation.site_id}
              >
                <b>{relation.sites?.name || 'موقع غير معروف'}</b>
                <small>{relation.sites?.area_name || 'فتح قصة الموقع'}</small>
                <span>فتح قصة الموقع ←</span>
              </Link>
            ))}
          </div>
          {!loading && sites.length === 0 ? (
            <div className="empty">لا توجد مواقع مرتبطة بهذا الأمر.</div>
          ) : null}
        </section>

      </div> : null}

      {activeSection === 'attachments' ? <div className="work-order-detail-grid detail-stage single-stage">
        <section className="panel work-order-attachments-panel">
          <div className="section-title">
            <div>
              <span className="section-kicker">المرفقات</span>
              <h2>ملفات أمر العمل</h2>
            </div>
            <span>{attachments.length} ملف</span>
          </div>
          {attachments.length ? (
            <div className="attachment-list">
              {attachments.map((attachment) => (
                <a
                  key={attachment.id}
                  className="attachment-row"
                  href={attachment.file_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>{attachment.attachment_type}</span>
                  <div>
                    <b>{attachment.title || attachment.file_name || 'مرفق'}</b>
                    <small>فتح الملف</small>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="empty">لا توجد مرفقات مسجلة لهذا الأمر حتى الآن.</div>
          )}
        </section>
      </div> : null}

      {activeSection === 'items' ? <section className="section-block work-order-items-section detail-stage">
        <div className="section-title">
          <div>
            <span className="section-kicker">البنود والكميات</span>
            <h2>تفاصيل بنود أمر العمل</h2>
          </div>
          <span>{items.length} سجل</span>
        </div>

        <div className="table-wrap">
          <table className="work-order-items-table">
            <thead>
              <tr>
                <th>رقم البند</th>
                <th>البند</th>
                <th>الوحدة</th>
                <th>الكمية المنفذة في الأمر</th>
                <th>رصيد الكمية بعد الأمر</th>
                <th>سعر الوحدة قبل الضريبة</th>
                <th>قيمة التنفيذ قبل الضريبة</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td data-label="رقم البند">{item.item_no || '—'}</td>
                  <td data-label="البند" className="work-order-item-description">
                    <b>{item.items?.name || 'بند غير معروف'}</b>
                    {item.items?.category ? <small>{item.items.category}</small> : null}
                  </td>
                  <td data-label="الوحدة">{item.unit || '—'}</td>
                  <td data-label="الكمية المنفذة">{Number(item.executed_quantity ?? item.quantity ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  <td data-label="الرصيد بعد الأمر">{Number(item.remaining_quantity || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  <td data-label="سعر الوحدة">{Number(item.unit_price || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  <td data-label="قيمة التنفيذ">{Number(item.total_price || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && items.length === 0 ? (
          <div className="empty">لا توجد بنود مسجلة في أمر العمل.</div>
        ) : null}
      </section> : null}
    </main>
  );
}
