import { NextRequest, NextResponse } from 'next/server';
import { createWorkOrdersAdminClient } from '@/lib/server-supabase';

export const dynamic = 'force-dynamic';

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

export async function GET() {
  try {
    const work = createWorkOrdersAdminClient();
    const [items, boq, lines, projects, orders] = await Promise.all([
      work.from('items').select('id,name,normalized_name,unit,is_active,category').order('name'),
      work.from('project_boq_items').select('id,item_id,project_id,boq_item_no,unit,contract_quantity,unit_price,total_price'),
      work.from('work_order_items').select('id,item_id,work_order_id,quantity,executed_quantity,remaining_quantity,total_price'),
      work.from('projects').select('id,name'),
      work.from('work_orders').select('id,project_id,work_order_number,status,title,work_order_date,work_order_end_date'),
    ]);

    const error = items.error || boq.error || lines.error || projects.error || orders.error;
    if (error) throw error;

    const linkedItemIds = new Set([
      ...(boq.data || []).map((row) => row.item_id),
      ...(lines.data || []).map((row) => row.item_id),
    ]);

    return NextResponse.json({
      items: (items.data || []).filter((item) => linkedItemIds.has(item.id)),
      boq: boq.data || [],
      lines: lines.data || [],
      projects: projects.data || [],
      orders: orders.data || [],
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذر تحميل البنود.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body.name || '').trim();
    if (!name) return NextResponse.json({ error: 'اسم البند مطلوب.' }, { status: 400 });

    const work = createWorkOrdersAdminClient();
    const duplicate = await work.from('items').select('id').eq('normalized_name', normalizeArabic(name)).maybeSingle();
    if (duplicate.error) throw duplicate.error;
    if (duplicate.data) return NextResponse.json({ error: 'يوجد بند مسجل بالاسم نفسه.' }, { status: 409 });

    const inserted = await work.from('items').insert({
      name,
      normalized_name: normalizeArabic(name),
      unit: String(body.unit || '').trim() || null,
      category: String(body.category || '').trim() || null,
      is_active: body.isActive !== false,
    }).select('id,name,normalized_name,unit,is_active,category').single();
    if (inserted.error) throw inserted.error;

    return NextResponse.json({ item: inserted.data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذر إنشاء البند.' }, { status: 500 });
  }
}
