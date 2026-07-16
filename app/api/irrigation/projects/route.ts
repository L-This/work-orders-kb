import { NextResponse } from 'next/server';
import { createIrrigationAdminClient, createWorkOrdersAdminClient } from '@/lib/server-supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const work = createWorkOrdersAdminClient();
      const test = await work
  .from('project_irrigation_links')
  .select('*');

console.log('LINK ERROR:', test.error);
console.log('LINK COUNT:', test.data?.length);
console.log('LINK DATA:', test.data);
    
    const irrigation = createIrrigationAdminClient();

    const [workProjects, irrigationProjects, links] = await Promise.all([
      work.from('projects').select('id,name,contractor_name').order('name'),
      irrigation.from('projects').select('id,name').order('name'),
      Promise.resolve({
  data: test.data,
  error: test.error,
}),
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
