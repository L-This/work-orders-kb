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

    if (rows.length) {
      const upsert = await work.from('sites').upsert(rows, { onConflict: 'source_system,source_site_id' });
      if (upsert.error) throw upsert.error;
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
