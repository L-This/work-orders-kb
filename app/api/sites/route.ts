import { NextRequest, NextResponse } from 'next/server';
import { createWorkOrdersAdminClient } from '@/lib/server-supabase';

export const dynamic = 'force-dynamic';

function clean(value: unknown) { const text = String(value ?? '').trim(); return text || null; }
function normalizeArabic(value: string) { return value.normalize('NFKD').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/[^\p{L}\p{N}]+/gu,' ').trim().toLowerCase(); }
function message(error: unknown, fallback: string) { const e = error && typeof error === 'object' ? error as {message?:string;details?:string;hint?:string;code?:string}:null; return [e?.message,e?.details,e?.hint,e?.code?`الرمز: ${e.code}`:null].filter(Boolean).join(' — ') || fallback; }

export async function GET() {
  try {
    const work = createWorkOrdersAdminClient();
    const [sites, projects, summary] = await Promise.all([
      work.from('sites').select('id,project_id,name,site_code,area_name,status,created_at,updated_at,source_system,source_code,source_district,synced_at').order('name'),
      work.from('projects').select('id,name,municipality').neq('status','deleted').order('name'),
      work.from('v_site_decision_summary').select('site_id,work_orders_count,items_count,total_remaining_quantity,last_work_order_date'),
    ]);
    const error = sites.error || projects.error || summary.error; if (error) throw error;
    const metrics = new Map((summary.data || []).map((row:any)=>[row.site_id,row]));
    const projectMap = new Map((projects.data || []).map((p:any)=>[p.id,p]));
    return NextResponse.json({
      projects: projects.data || [],
      sites: (sites.data || []).map((site:any)=>({ ...site, project: projectMap.get(site.project_id) || null, ...(metrics.get(site.id) || {work_orders_count:0,items_count:0,total_remaining_quantity:0,last_work_order_date:null}) })),
    });
  } catch (error) { return NextResponse.json({error:message(error,'تعذر تحميل المواقع.')},{status:500}); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body.name || '').trim(); const projectId = String(body.project_id || '').trim();
    if (!name || !projectId) return NextResponse.json({error:'اسم الموقع والمشروع مطلوبان.'},{status:400});
    const work = createWorkOrdersAdminClient();
    const duplicate = await work.from('sites').select('id').eq('project_id',projectId).eq('name',name).maybeSingle();
    if (duplicate.error) throw duplicate.error; if (duplicate.data) return NextResponse.json({error:'يوجد موقع بالاسم نفسه داخل المشروع.'},{status:409});
    const result = await work.from('sites').insert({project_id:projectId,name,normalized_name:normalizeArabic(name),site_code:clean(body.site_code),area_name:clean(body.area_name),status:clean(body.status)||'active'}).select('id,project_id,name,site_code,area_name,status,created_at,updated_at,source_system,source_code,source_district,synced_at').single();
    if (result.error) throw result.error; return NextResponse.json({site:result.data},{status:201});
  } catch (error) { return NextResponse.json({error:message(error,'تعذر إنشاء الموقع.')},{status:500}); }
}
