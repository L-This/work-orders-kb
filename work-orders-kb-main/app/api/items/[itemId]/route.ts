import { NextRequest, NextResponse } from 'next/server';
import { createWorkOrdersAdminClient } from '@/lib/server-supabase';

function normalizeArabic(value: string) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

export async function PATCH(request: NextRequest, { params }: { params: { itemId: string } }) {
  try {
    const body = await request.json();
    const work = createWorkOrdersAdminClient();
    const payload: Record<string, unknown> = {};

    if (typeof body.name === 'string') {
      const name = body.name.trim();
      if (!name) return NextResponse.json({ error: 'اسم البند مطلوب.' }, { status: 400 });
      payload.name = name;
      payload.normalized_name = normalizeArabic(name);
    }
    if ('unit' in body) payload.unit = String(body.unit || '').trim() || null;
    if ('category' in body) payload.category = String(body.category || '').trim() || null;
    if (typeof body.isActive === 'boolean') payload.is_active = body.isActive;

    const updated = await work.from('items').update(payload).eq('id', params.itemId)
      .select('id,name,normalized_name,unit,is_active,category').single();
    if (updated.error) throw updated.error;
    return NextResponse.json({ item: updated.data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذر تعديل البند.' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { itemId: string } }) {
  try {
    const work = createWorkOrdersAdminClient();
    const [boq, lines] = await Promise.all([
      work.from('project_boq_items').select('id', { count: 'exact', head: true }).eq('item_id', params.itemId),
      work.from('work_order_items').select('id', { count: 'exact', head: true }).eq('item_id', params.itemId),
    ]);
    if (boq.error || lines.error) throw boq.error || lines.error;

    const references = (boq.count || 0) + (lines.count || 0);
    if (references > 0) {
      return NextResponse.json({
        error: 'لا يمكن حذف البند لأنه مستخدم في جداول الكميات أو أوامر العمل. يمكنك تعطيله بدلًا من ذلك.',
        references,
      }, { status: 409 });
    }

    const deleted = await work.from('items').delete().eq('id', params.itemId);
    if (deleted.error) throw deleted.error;
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذر حذف البند.' }, { status: 500 });
  }
}
