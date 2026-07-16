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

    const [items, attachments] = await Promise.all([
      work.from('work_order_items').select('id,executed_quantity').eq('work_order_id', params.workOrderId),
      work.from('attachments').select('id', { count: 'exact', head: true }).eq('work_order_id', params.workOrderId),
    ]);

    if (items.error || attachments.error) throw items.error || attachments.error;

    const executedRows = (items.data || []).filter((row) => Number(row.executed_quantity) > 0).length;
    const attachmentCount = attachments.count || 0;

    if (executedRows || attachmentCount) {
      return NextResponse.json({
        error: 'لا يمكن حذف أمر العمل لوجود تنفيذ فعلي أو مرفقات مرتبطة به. استخدم الإلغاء بدلًا من الحذف.',
        dependencies: { executedRows, attachments: attachmentCount },
      }, { status: 409 });
    }

    const sitesDelete = await work.from('work_order_sites').delete().eq('work_order_id', params.workOrderId);
    if (sitesDelete.error) throw sitesDelete.error;
    const itemsDelete = await work.from('work_order_items').delete().eq('work_order_id', params.workOrderId);
    if (itemsDelete.error) throw itemsDelete.error;
    const orderDelete = await work.from('work_orders').delete().eq('id', params.workOrderId);
    if (orderDelete.error) throw orderDelete.error;

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, 'تعذر حذف أمر العمل.') }, { status: 500 });
  }
}
