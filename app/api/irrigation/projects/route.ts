import { NextResponse } from 'next/server';
import { createIrrigationAdminClient, createWorkOrdersAdminClient } from '@/lib/server-supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const work = createWorkOrdersAdminClient();
      console.log(
  'SUPABASE URL:',
  process.env.NEXT_PUBLIC_SUPABASE_URL
);
    const irrigation = createIrrigationAdminClient();

    const [workProjects, irrigationProjects, links] = await Promise.all([
      work.from('projects').select('id,name,contractor_name').order('name'),
      irrigation.from('projects').select('id,name').order('name'),
      work.from('project_irrigation_links').select('work_orders_project_id,irrigation_project_id,irrigation_project_name,last_synced_at'),
    ]);

    const error = workProjects.error || irrigationProjects.error || links.error;
      console.log('LINKS FROM API:', links.data);
      console.log('WORK PROJECTS:', workProjects.data);
    if (error) throw error;

    return NextResponse.json({
      workProjects: workProjects.data || [],
      irrigationProjects: irrigationProjects.data || [],
      links: links.data || [],
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذر قراءة بيانات الربط.' }, { status: 500 });
  }
}
