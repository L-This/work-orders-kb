import { NextRequest, NextResponse } from 'next/server';
import { createWorkOrdersAdminClient } from '@/lib/server-supabase';

export const dynamic = 'force-dynamic';

type Context = { params: { workOrderId: string } };

function clean(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function errorMessage(error: unknown, fallback: string) {
  const details = error && typeof error === 'object'
    ? error as { message?: string; details?: string; hint?: string; code?: string }
    : null;
  return [details?.message, details?.details, details?.hint, details?.code ? `الرمز: ${details.code}` : null]
    .filter(Boolean)
    .join(' — ') || fallback;
}

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const body = await request.json();
    const work = createWorkOrdersAdminClient();
    const payload: Record<string, unknown> = {};

    if (body.title !== undefined) payload.title = clean(body.title);
    if (body.work_order_date !== undefined) payload.work_order_date = clean(body.work_order_date);
    if (body.work_order_end_date !== undefined) payload.work_order_end_date = clean(body.work_order_end_date);
    if (body.duration_days !== undefined) payload.duration_days = body.duration_days === '' || body.duration_days == null ? null : Number(body.duration_days);
    if (body.contractor_name !== undefined) payload.contractor_name = clean(body.contractor_name);
    if (body.notes !== undefined) payload.notes = clean(body.notes);
    if (body.status !== undefined) payload.status = clean(body.status) || 'approved';

    if (!Object.keys(payload).length) {
      return NextResponse.json({ error: 'لا توجد بيانات لتعديلها.' }, { status: 400 });
    }

    const result = await work
      .from('work_orders')
      .update(payload)
      .eq('id', params.workOrderId)
      .select('id,project_id,work_order_number,work_order_date,work_order_end_date,duration_days,title,status,contractor_name,notes')
      .single();

    if (result.error) throw result.error;
    return NextResponse.json({ workOrder: result.data });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, 'تعذر تعديل أمر العمل.') }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  try {
    const work = createWorkOrdersAdminClient();

    const [order, items, sites, attachments] = await Promise.all([
      work.from('work_orders').select('id').eq('id', params.workOrderId).maybeSingle(),
      work.from('work_order_items').select('id').eq('work_order_id', params.workOrderId),
      work.from('work_order_sites').select('id').eq('work_order_id', params.workOrderId),
      work.from('attachments').select('id').eq('work_order_id', params.workOrderId),
    ]);

    const firstError = order.error || items.error || sites.error || attachments.error;
    if (firstError) throw firstError;
    if (!order.data) return NextResponse.json({ error: 'أمر العمل غير موجود.' }, { status: 404 });

    // Only the order-owned records are removed. Projects, sites and the shared
    // item catalogue remain untouched.
    const attachmentsDelete = await work.from('attachments').delete().eq('work_order_id', params.workOrderId);
    if (attachmentsDelete.error) throw attachmentsDelete.error;
    const sitesDelete = await work.from('work_order_sites').delete().eq('work_order_id', params.workOrderId);
    if (sitesDelete.error) throw sitesDelete.error;
    const itemsDelete = await work.from('work_order_items').delete().eq('work_order_id', params.workOrderId);
    if (itemsDelete.error) throw itemsDelete.error;
    const orderDelete = await work.from('work_orders').delete().eq('id', params.workOrderId);
    if (orderDelete.error) throw orderDelete.error;

    return NextResponse.json({
      deleted: true,
      removed: {
        itemRows: (items.data || []).length,
        siteLinks: (sites.data || []).length,
        attachments: (attachments.data || []).length,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, 'تعذر حذف أمر العمل.') }, { status: 500 });
  }
}
