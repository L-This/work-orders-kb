import { NextRequest, NextResponse } from 'next/server';
import { createIrrigationAdminClient, createWorkOrdersAdminClient } from '@/lib/server-supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const workProjectId = String(body.workProjectId || '');
    const irrigationProjectId = String(body.irrigationProjectId || '');
    if (!workProjectId || !irrigationProjectId) {
      return NextResponse.json({ error: 'اختر المشروع في النظامين.' }, { status: 400 });
    }

    const work = createWorkOrdersAdminClient();
    const irrigation = createIrrigationAdminClient();
    const irrigationProject = await irrigation.from('projects').select('id,name').eq('id', irrigationProjectId).single();
    if (irrigationProject.error) throw irrigationProject.error;

    const result = await work.from('project_irrigation_links').upsert({
      work_orders_project_id: workProjectId,
      irrigation_project_id: irrigationProjectId,
      irrigation_project_name: irrigationProject.data.name,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'work_orders_project_id' }).select().single();
    if (result.error) throw result.error;

    return NextResponse.json({ link: result.data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذر حفظ الربط.' }, { status: 500 });
  }
}
