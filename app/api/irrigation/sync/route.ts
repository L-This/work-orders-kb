import { NextRequest, NextResponse } from 'next/server';
import { createIrrigationAdminClient, createWorkOrdersAdminClient } from '@/lib/server-supabase';

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const workProjectId = String(body.workProjectId || '');
    if (!workProjectId) return NextResponse.json({ error: 'معرّف المشروع مطلوب.' }, { status: 400 });

    const work = createWorkOrdersAdminClient();
    const irrigation = createIrrigationAdminClient();

    const link = await work.from('project_irrigation_links')
      .select('irrigation_project_id')
      .eq('work_orders_project_id', workProjectId)
      .maybeSingle();
    if (link.error) throw link.error;
    if (!link.data) return NextResponse.json({ error: 'هذا المشروع غير مربوط بمشروع الري بعد.' }, { status: 404 });

    const gardens = await irrigation.from('gardens')
      .select('id,project_id,name,code,active,district')
      .eq('project_id', link.data.irrigation_project_id)
      .eq('active', true)
      .order('name');
    if (gardens.error) throw gardens.error;

    const now = new Date().toISOString();
    const rows = (gardens.data || []).map((garden) => ({
      project_id: workProjectId,
      name: garden.name,
      normalized_name: normalizeArabic(garden.name),
      status: 'active',
      source_system: 'irrigation',
      source_site_id: garden.id,
      source_project_id: garden.project_id,
      source_code: garden.code || null,
      source_district: garden.district || null,
      synced_at: now,
    }));

    for (const row of rows) {
  const existingBySource = await work
    .from('sites')
    .select('id')
    .eq('source_system', row.source_system)
    .eq('source_site_id', row.source_site_id)
    .maybeSingle();

  if (existingBySource.error) {
    throw existingBySource.error;
  }

  if (existingBySource.data) {
    const updateBySource = await work
      .from('sites')
      .update({
        project_id: row.project_id,
        name: row.name,
        normalized_name: row.normalized_name,
        status: row.status,
        source_project_id: row.source_project_id,
        source_code: row.source_code,
        source_district: row.source_district,
        synced_at: row.synced_at,
      })
      .eq('id', existingBySource.data.id);

    if (updateBySource.error) {
      throw updateBySource.error;
    }

    continue;
  }

  const existingByName = await work
    .from('sites')
    .select('id')
    .eq('project_id', row.project_id)
    .eq('name', row.name)
    .maybeSingle();

  if (existingByName.error) {
    throw existingByName.error;
  }

  if (existingByName.data) {
    const attachExistingSite = await work
      .from('sites')
      .update({
        normalized_name: row.normalized_name,
        status: row.status,
        source_system: row.source_system,
        source_site_id: row.source_site_id,
        source_project_id: row.source_project_id,
        source_code: row.source_code,
        source_district: row.source_district,
        synced_at: row.synced_at,
      })
      .eq('id', existingByName.data.id);

    if (attachExistingSite.error) {
      throw attachExistingSite.error;
    }

    continue;
  }

  const insertSite = await work.from('sites').insert(row);

  if (insertSite.error) {
    throw insertSite.error;
  }
}

    const syncedSourceIds = rows.map((row) => row.source_site_id);
    const existing = await work.from('sites')
      .select('id,source_site_id')
      .eq('project_id', workProjectId)
      .eq('source_system', 'irrigation');
    if (existing.error) throw existing.error;

    const staleIds = (existing.data || [])
      .filter((site) => site.source_site_id && !syncedSourceIds.includes(site.source_site_id))
      .map((site) => site.id);
    if (staleIds.length) {
      const deactivate = await work.from('sites').update({ status: 'inactive', synced_at: now }).in('id', staleIds);
      if (deactivate.error) throw deactivate.error;
    }

    const updateLink = await work.from('project_irrigation_links')
      .update({ last_synced_at: now, updated_at: now })
      .eq('work_orders_project_id', workProjectId);
    if (updateLink.error) throw updateLink.error;

    return NextResponse.json({ synced: rows.length, deactivated: staleIds.length, syncedAt: now });
    } catch (error: unknown) {
    console.error('Irrigation sites sync failed:', error);

    const details =
      error && typeof error === 'object'
        ? error as {
            message?: string;
            details?: string;
            hint?: string;
            code?: string;
          }
        : null;

    const parts = [
      details?.message,
      details?.details,
      details?.hint,
      details?.code ? `الرمز: ${details.code}` : null,
    ].filter(Boolean);

    return NextResponse.json(
      {
        error:
          parts.length > 0
            ? parts.join(' — ')
            : error instanceof Error
              ? error.message
              : 'تعذرت مزامنة المواقع.',
      },
      { status: 500 },
    );
  }
}
