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

    const [workProjects, irrigationProjects] = await Promise.all([
      work.from('projects').select('id,name,contractor_name').order('name'),
      irrigation.from('projects').select('id,name').order('name'),
    ]);

    const error = workProjects.error || irrigationProjects.error || links.error;
    if (error) throw error;

    return NextResponse.json({
      workProjects: workProjects.data || [],
      irrigationProjects: irrigationProjects.data || [],
      links: links.data || [],
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
