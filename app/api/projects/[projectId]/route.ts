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

    const result = await work.from('projects').update(payload).eq('id', params.projectId).is('deleted_at', null)
      .select('id,name,code,municipality,contractor_name,status,description,created_at,updated_at,deleted_at').single();
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
