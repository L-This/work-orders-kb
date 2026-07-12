'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { parseDateOnly } from '@/lib/helpers';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type OrderRow = {
  id: string;
  project_id: string;
  work_order_number: string;
  work_order_date: string | null;
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
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

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
          'id,project_id,work_order_number,work_order_date,title,status,contractor_name,notes,source_file_name,projects(id,name)',
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
          'id,item_id,item_no,unit,quantity,executed_quantity,remaining_quantity,unit_price,total_price,notes,items(id,name,category)',
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

    setOrder(orderResult.data as unknown as OrderRow);
    setSites((sitesResult.data || []) as unknown as SiteRelation[]);
    setItems((itemsResult.data || []) as unknown as ItemRow[]);
    setAttachments((attachmentsResult.data || []) as AttachmentRow[]);
    setLoading(false);
  }

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      `${item.item_no || ''} ${item.items?.name || ''} ${item.items?.category || ''} ${
        item.unit || ''
      } ${item.notes || ''}`
        .toLowerCase()
        .includes(needle),
    );
  }, [items, query]);

  const distinctItems = new Set(items.map((item) => item.item_id)).size;
  const totalQuantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const totalExecuted = items.reduce(
    (sum, item) => sum + (Number(item.executed_quantity) || 0),
    0,
  );
  const totalRemaining = items.reduce(
    (sum, item) => sum + (Number(item.remaining_quantity) || 0),
    0,
  );

  return (
    <main className="page work-order-detail-page">
      <div className="section-title work-order-detail-title">
        <div>
          <span className="eyebrow">تفاصيل أمر العمل</span>
          <h2>أمر عمل رقم {order?.work_order_number || '—'}</h2>
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
          <button className="btn" onClick={load} disabled={loading}>
            {loading ? 'جاري التحديث...' : 'تحديث'}
          </button>
        </div>
      </div>

      {message ? <div className="notice error-notice">{message}</div> : null}

      <section className="work-order-hero-card">
        <div className="work-order-hero-main">
          <span className="badge">{statusLabel(order?.status || null)}</span>
          <h1>{order?.title || `أمر عمل رقم ${order?.work_order_number || ''}`}</h1>
          <p>{order?.notes || 'لا توجد ملاحظات مسجلة لهذا الأمر.'}</p>
        </div>
        <div className="work-order-meta-panel">
          <span>
            <small>تاريخ الأمر</small>
            <b>{formatDate(order?.work_order_date || null)}</b>
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
          <strong>{totalExecuted.toLocaleString()}</strong>
          <span>إجمالي الكميات المنفذة في الأمر</span>
        </div>
        <div className="stat wide">
          <strong>{totalRemaining.toLocaleString()}</strong>
          <span>إجمالي رصيد البنود بعد الأمر</span>
        </div>
      </section>

      {sites.length > 1 ? (
        <div className="notice work-order-meaning-note">
          <b>تنبيه دقة البيانات:</b> هذا الأمر مرتبط بـ {sites.length} مواقع. كميات البنود أدناه هي
          كميات أمر العمل لجميع المواقع المرتبطة، وليست توزيعًا مؤكدًا لكل موقع على حدة.
        </div>
      ) : null}

      <div className="work-order-detail-grid">
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
      </div>

      <section className="section-block work-order-items-section">
        <div className="section-title">
          <div>
            <span className="section-kicker">البنود والكميات</span>
            <h2>تفاصيل بنود أمر العمل</h2>
          </div>
          <span>{filteredItems.length} سجل</span>
        </div>

        <input
          className="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ابحث برقم البند أو الوصف أو الوحدة..."
        />

        <div className="table-wrap">
          <table className="work-order-items-table">
            <thead>
              <tr>
                <th>رقم البند</th>
                <th>البند</th>
                <th>الوحدة</th>
                <th>كمية الأمر</th>
                <th>المنفذ في الأمر</th>
                <th>المتبقي بعد الأمر</th>
                <th>سعر الوحدة</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.item_no || '—'}</td>
                  <td>
                    <b>{item.items?.name || 'بند غير معروف'}</b>
                    {item.items?.category ? <small>{item.items.category}</small> : null}
                  </td>
                  <td>{item.unit || '—'}</td>
                  <td>{Number(item.quantity || 0).toLocaleString()}</td>
                  <td>{Number(item.executed_quantity || 0).toLocaleString()}</td>
                  <td>{Number(item.remaining_quantity || 0).toLocaleString()}</td>
                  <td>{Number(item.unit_price || 0).toLocaleString()}</td>
                  <td>{Number(item.total_price || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && filteredItems.length === 0 ? (
          <div className="empty">لا توجد بنود مطابقة للبحث.</div>
        ) : null}
      </section>
    </main>
  );
}
