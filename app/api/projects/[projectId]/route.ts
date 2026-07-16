import { NextRequest, NextResponse } from 'next/server';
import { createWorkOrdersAdminClient } from '@/lib/server-supabase';

export const dynamic = 'force-dynamic';

type Context = { params: { projectId: string } };

function clean(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function errorMessage(error: unknown, fallback: string) {
  const details = error && typeof error === 'object' ? error as { message?: string; details?: string; hint?: string; code?: string } : null;
  return [details?.message, details?.details, details?.hint, details?.code ? `الرمز: ${details.code}` : null].filter(Boolean).join(' — ') || fallback;
}

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const body = await request.json();
    const work = createWorkOrdersAdminClient();
    const name = body.name === undefined ? undefined : String(body.name || '').trim();
    if (name !== undefined && !name) return NextResponse.json({ error: 'اسم المشروع مطلوب.' }, { status: 400 });

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) payload.name = name;
    if (body.code !== undefined) payload.code = clean(body.code);
    if (body.municipality !== undefined) payload.municipality = clean(body.municipality);
    if (body.contractor_name !== undefined) payload.contractor_name = clean(body.contractor_name);
    if (body.status !== undefined) payload.status = clean(body.status) || 'active';
    if (body.description !== undefined) payload.description = clean(body.description);
    if (body.contract_number !== undefined) payload.contract_number = clean(body.contract_number);
    if (body.contract_start_date !== undefined) payload.contract_start_date = clean(body.contract_start_date);
    if (body.contract_end_date !== undefined) payload.contract_end_date = clean(body.contract_end_date);
    if (body.contract_value !== undefined) payload.contract_value = body.contract_value === '' || body.contract_value == null ? null : Number(body.contract_value);
    if (body.owner_entity !== undefined) payload.owner_entity = clean(body.owner_entity);
    if (body.supervisor_name !== undefined) payload.supervisor_name = clean(body.supervisor_name);

    const result = await work.from('projects').update(payload).eq('id', params.projectId).is('deleted_at', null)
      .select('id,name,code,municipality,contractor_name,status,description,contract_number,contract_start_date,contract_end_date,contract_value,owner_entity,supervisor_name,created_at,updated_at,deleted_at').single();
    if (result.error) throw result.error;
    return NextResponse.json({ project: result.data });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, 'تعذر تعديل المشروع.') }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  try {
    const work = createWorkOrdersAdminClient();
    const [orders, sites, items] = await Promise.all([
      work.from('work_orders').select('id', { count: 'exact', head: true }).eq('project_id', params.projectId),
      work.from('sites').select('id', { count: 'exact', head: true }).eq('project_id', params.projectId),
      work.from('project_boq_items').select('id', { count: 'exact', head: true }).eq('project_id', params.projectId),
    ]);
    const firstError = orders.error || sites.error || items.error;
    if (firstError) throw firstError;

    const dependencies = {
      workOrders: orders.count || 0,
      sites: sites.count || 0,
      items: items.count || 0,
    };
    if (dependencies.workOrders || dependencies.sites || dependencies.items) {
      return NextResponse.json({
        error: 'لا يمكن نقل المشروع إلى سلة المحذوفات لوجود بيانات مرتبطة به. استخدم الأرشفة بدلًا من الحذف.',
        dependencies,
      }, { status: 409 });
    }

    const current = await work.from('projects').select('status').eq('id', params.projectId).maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) return NextResponse.json({ error: 'المشروع غير موجود.' }, { status: 404 });

    const now = new Date().toISOString();
    const result = await work.from('projects').update({
      deleted_at: now,
      deleted_from_status: current.data.status || 'active',
      status: 'deleted',
      updated_at: now,
    }).eq('id', params.projectId).select('id').single();
    if (result.error) throw result.error;
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, 'تعذر حذف المشروع.') }, { status: 500 });
  }
}
