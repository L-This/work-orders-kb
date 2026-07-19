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
    const current = await work.from('projects').select('id').eq('id', params.projectId).maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) return NextResponse.json({ error: 'المشروع غير موجود.' }, { status: 404 });

    const [orders, sites, batches, projectItems] = await Promise.all([
      work.from('work_orders').select('id').eq('project_id', params.projectId),
      work.from('sites').select('id').eq('project_id', params.projectId),
      work.from('import_batches').select('id').eq('project_id', params.projectId),
      work.from('project_boq_items').select('item_id').eq('project_id', params.projectId),
    ]);
    const firstError = orders.error || sites.error || batches.error || projectItems.error;
    if (firstError) throw firstError;

    const orderIds = (orders.data || []).map((row) => row.id);
    const siteIds = (sites.data || []).map((row) => row.id);
    const batchIds = (batches.data || []).map((row) => row.id);
    const candidateItemIds = Array.from(new Set((projectItems.data || []).map((row) => row.item_id).filter(Boolean)));

    async function remove(table: string, column: string, ids: string[]) {
      if (!ids.length) return;
      const result = await work.from(table).delete().in(column, ids);
      if (result.error) throw result.error;
    }

    await remove('attachments', 'work_order_id', orderIds);
    await remove('work_order_items', 'work_order_id', orderIds);
    await remove('work_order_sites', 'work_order_id', orderIds);
    await remove('work_order_sites', 'site_id', siteIds);
    await remove('site_notes', 'site_id', siteIds);
    await remove('site_profiles', 'site_id', siteIds);
    await remove('raw_excel_rows', 'import_batch_id', batchIds);

    for (const table of ['project_irrigation_links', 'project_boq_items', 'work_orders', 'sites', 'contracts', 'import_batches'] as const) {
      const column = table === 'project_irrigation_links' ? 'work_orders_project_id' : 'project_id';
      const result = await work.from(table).delete().eq(column, params.projectId);
      if (result.error) throw result.error;
    }

    const deleted = await work.from('projects').delete().eq('id', params.projectId).select('id').single();
    if (deleted.error) throw deleted.error;

    let orphanItemsRemoved = 0;
    if (candidateItemIds.length) {
      const [remainingBoq, remainingLines] = await Promise.all([
        work.from('project_boq_items').select('item_id').in('item_id', candidateItemIds),
        work.from('work_order_items').select('item_id').in('item_id', candidateItemIds),
      ]);
      const referenceError = remainingBoq.error || remainingLines.error;
      if (referenceError) throw referenceError;
      const stillUsed = new Set([
        ...(remainingBoq.data || []).map((row) => row.item_id),
        ...(remainingLines.data || []).map((row) => row.item_id),
      ]);
      const orphanIds = candidateItemIds.filter((id) => !stillUsed.has(id));
      if (orphanIds.length) {
        const orphanDelete = await work.from('items').delete().in('id', orphanIds).select('id');
        if (orphanDelete.error) throw orphanDelete.error;
        orphanItemsRemoved = orphanDelete.data?.length || 0;
      }
    }

    return NextResponse.json({ deleted: true, removed: { workOrders: orderIds.length, sites: siteIds.length, importBatches: batchIds.length, orphanItems: orphanItemsRemoved } });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, 'تعذر حذف المشروع.') }, { status: 500 });
  }
}
