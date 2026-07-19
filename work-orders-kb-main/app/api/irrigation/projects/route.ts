import { NextResponse } from 'next/server';
import { createIrrigationAdminClient, createWorkOrdersAdminClient } from '@/lib/server-supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const work = createWorkOrdersAdminClient();
    const irrigation = createIrrigationAdminClient();

    // Read links separately. This avoids the inconsistent empty result that appeared
    // when the links query ran concurrently with the two project queries.
    const links = await work
      .from('project_irrigation_links')
      .select('work_orders_project_id,irrigation_project_id,irrigation_project_name,last_synced_at');

    const [workProjects, irrigationProjects, sites, imports] = await Promise.all([
      work.from('projects').select('id,name,contractor_name').is('deleted_at', null).or('status.is.null,status.neq.deleted').order('name'),
      irrigation.from('projects').select('id,name').order('name'),
      work.from('sites').select('id,project_id,status,source_system,synced_at'),
      work.from('import_batches').select('id,project_id,import_status,error_rows_count,created_at').order('created_at', { ascending: false }).limit(20),
    ]);

    const error = workProjects.error || irrigationProjects.error || sites.error || imports.error || links.error;
    if (error) throw error;

    const activeProjectIds = new Set((workProjects.data || []).map((project) => project.id));
    const activeSites = (sites.data || []).filter((site) => activeProjectIds.has(site.project_id));
    const activeLinks = (links.data || []).filter((link) => activeProjectIds.has(link.work_orders_project_id));
    const activeImports = (imports.data || []).filter((batch) => !batch.project_id || activeProjectIds.has(batch.project_id));
    const projectSiteStats: Record<string, { total: number; synced: number; inactive: number }> = {};
    for (const site of activeSites) {
      const stats = projectSiteStats[site.project_id] || { total: 0, synced: 0, inactive: 0 };
      stats.total += 1;
      if (site.source_system === 'irrigation') stats.synced += 1;
      if (site.status === 'inactive') stats.inactive += 1;
      projectSiteStats[site.project_id] = stats;
    }

    return NextResponse.json({
      workProjects: workProjects.data || [],
      irrigationProjects: irrigationProjects.data || [],
      links: activeLinks,
      projectSiteStats,
      summary: {
        sites: activeSites.length,
        syncedSites: activeSites.filter((site) => site.source_system === 'irrigation').length,
        inactiveSites: activeSites.filter((site) => site.status === 'inactive').length,
        failedImports: activeImports.filter((batch) => batch.import_status === 'failed' || Number(batch.error_rows_count || 0) > 0).length,
      },
    });
  } catch (error) {
    const details = error && typeof error === 'object'
      ? error as { message?: string; details?: string; hint?: string }
      : null;
    return NextResponse.json(
      { error: details?.message || details?.details || details?.hint || 'تعذر قراءة بيانات الربط.' },
      { status: 500 },
    );
  }
}
