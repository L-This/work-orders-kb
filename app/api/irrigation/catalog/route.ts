import { NextResponse } from 'next/server';
import { createIrrigationAdminClient } from '@/lib/server-supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type IrrigationCatalogSite = {
  id: string;
  project_id: string;
  name: string;
  code: string | null;
  district: string | null;
  active: boolean;
};

export async function GET() {
  try {
    const irrigation = createIrrigationAdminClient();
    const [projects, gardens] = await Promise.all([
      irrigation.from('projects').select('id,name').order('name'),
      irrigation
        .from('gardens')
        .select('id,project_id,name,code,district,active')
        .eq('active', true)
        .order('name'),
    ]);

    const error = projects.error || gardens.error;
    if (error) throw error;

    const sitesByProject = new Map<string, IrrigationCatalogSite[]>();
    for (const site of (gardens.data || []) as IrrigationCatalogSite[]) {
      const current = sitesByProject.get(site.project_id) || [];
      current.push(site);
      sitesByProject.set(site.project_id, current);
    }

    return NextResponse.json(
      {
        projects: (projects.data || []).map((project) => ({
          id: project.id,
          name: project.name,
          sites: sitesByProject.get(project.id) || [],
        })),
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'تعذر جلب مشاريع الري ومواقعها.' },
      { status: 500 },
    );
  }
}
