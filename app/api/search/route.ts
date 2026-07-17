import { NextRequest, NextResponse } from 'next/server';
import { createWorkOrdersAdminClient } from '@/lib/server-supabase';

export const dynamic = 'force-dynamic';

function normalize(value: unknown) {
  return String(value ?? '').normalize('NFKD').replace(/[\u064B-\u065F\u0670]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();
}

function rank(primary: unknown, secondary: unknown[], needle: string) {
  const name = normalize(primary);
  const other = normalize(secondary.filter(Boolean).join(' '));
  if (name === needle) return { score: 400, matchKind: 'مطابقة تامة' };
  if (name.startsWith(needle)) return { score: 300, matchKind: 'يبدأ بعبارة البحث' };
  if (name.includes(needle)) return { score: 200, matchKind: 'مطابقة في الاسم' };
  if (other.includes(needle)) return { score: 100, matchKind: 'مطابقة في التفاصيل' };
  return null;
}

export async function GET(request: NextRequest) {
  const started = performance.now();
  try {
    const query = String(request.nextUrl.searchParams.get('q') || '').trim();
    if (query.length < 2) return NextResponse.json({ query, results: [], total: 0, counts: { projects:0, workOrders:0, sites:0, items:0 }, elapsedMs: 0 });
    const work = createWorkOrdersAdminClient();
    const [projectsResult, ordersResult, sitesResult, itemsResult, orderSitesResult, orderItemsResult, boqResult] = await Promise.all([
      work.from('projects').select('id,name,code,municipality,contractor_name,status,description,contract_number,owner_entity').neq('status', 'deleted'),
      work.from('work_orders').select('id,project_id,work_order_number,title,status,contractor_name,notes,work_order_date,work_order_end_date,duration_days'),
      work.from('sites').select('id,project_id,name,site_code,area_name,status,source_code,source_district'),
      work.from('items').select('id,name,unit,category,is_active'),
      work.from('work_order_sites').select('work_order_id,site_id'),
      work.from('work_order_items').select('work_order_id,item_id,quantity,executed_quantity,remaining_quantity,total_price'),
      work.from('project_boq_items').select('project_id,item_id,contract_quantity,total_price'),
    ]);
    const error = projectsResult.error || ordersResult.error || sitesResult.error || itemsResult.error || orderSitesResult.error || orderItemsResult.error || boqResult.error;
    if (error) throw error;

    const projects:any[] = projectsResult.data || [], orders:any[] = ordersResult.data || [], sites:any[] = sitesResult.data || [], items:any[] = itemsResult.data || [];
    const orderSites:any[] = orderSitesResult.data || [], orderItems:any[] = orderItemsResult.data || [], boq:any[] = boqResult.data || [];
    const needle = normalize(query), projectMap = new Map(projects.map(x => [x.id,x])), siteMap = new Map(sites.map(x => [x.id,x])), orderMap = new Map(orders.map(x => [x.id,x]));
    const sitesByOrder = new Map<string,any[]>(), itemsByOrder = new Map<string,any[]>(), ordersBySite = new Map<string,any[]>(), ordersByItem = new Map<string,any[]>(), projectsByItem = new Map<string,any[]>();
    for (const x of orderSites) { const site=siteMap.get(x.site_id), order=orderMap.get(x.work_order_id); if(site){if(!sitesByOrder.has(x.work_order_id))sitesByOrder.set(x.work_order_id,[]);sitesByOrder.get(x.work_order_id)!.push(site);} if(order){if(!ordersBySite.has(x.site_id))ordersBySite.set(x.site_id,[]);ordersBySite.get(x.site_id)!.push(order);} }
    for (const x of orderItems) { const item=items.find(i=>i.id===x.item_id), order=orderMap.get(x.work_order_id); if(item){if(!itemsByOrder.has(x.work_order_id))itemsByOrder.set(x.work_order_id,[]);itemsByOrder.get(x.work_order_id)!.push(item);} if(order){if(!ordersByItem.has(x.item_id))ordersByItem.set(x.item_id,[]);ordersByItem.get(x.item_id)!.push(order);} }
    for (const x of boq) { const project=projectMap.get(x.project_id); if(project){if(!projectsByItem.has(x.item_id))projectsByItem.set(x.item_id,[]); if(!projectsByItem.get(x.item_id)!.some(p=>p.id===project.id))projectsByItem.get(x.item_id)!.push(project);} }

    const results:any[] = [];
    for (const row of projects) { const m=rank(row.name,[row.code,row.municipality,row.contractor_name,row.description,row.contract_number,row.owner_entity,row.status],needle); if(m) results.push({...m,type:'projects',id:row.id,title:row.name,subtitle:[row.municipality,row.contractor_name].filter(Boolean).join(' · '),href:`/project/${row.id}`,meta:[row.code,row.status].filter(Boolean),relations:{project:row,sites:sites.filter(s=>s.project_id===row.id).slice(0,3),orders:orders.filter(o=>o.project_id===row.id).slice(0,3),items:projectsByItem.size?boq.filter(b=>b.project_id===row.id).slice(0,3).map(b=>items.find(i=>i.id===b.item_id)).filter(Boolean):[]}}); }
    for (const row of orders) { const project=projectMap.get(row.project_id); const m=rank(row.title || row.work_order_number,[row.work_order_number,row.status,row.contractor_name,row.notes,row.work_order_date,row.work_order_end_date,project?.name,project?.code],needle); if(m) results.push({...m,type:'workOrders',id:row.id,title:row.title||`أمر عمل رقم ${row.work_order_number}`,subtitle:project?.name||'مشروع غير محدد',href:`/work-order/${row.id}`,meta:[row.work_order_number,row.status,row.work_order_date].filter(Boolean),relations:{project,sites:(sitesByOrder.get(row.id)||[]).slice(0,3),order:row,items:(itemsByOrder.get(row.id)||[]).slice(0,3)}}); }
    for (const row of sites) { const project=projectMap.get(row.project_id); const linkedOrders=ordersBySite.get(row.id)||[]; const m=rank(row.name,[row.site_code,row.area_name,row.status,row.source_code,row.source_district,project?.name,project?.municipality],needle); if(m) results.push({...m,type:'sites',id:row.id,title:row.name,subtitle:project?.name||'مشروع غير محدد',href:`/site/${row.id}`,meta:[row.site_code,row.area_name,row.status].filter(Boolean),relations:{project,site:row,orders:linkedOrders.slice(0,3),items:linkedOrders.flatMap(o=>itemsByOrder.get(o.id)||[]).filter((v,i,a)=>a.findIndex(x=>x.id===v.id)===i).slice(0,3)}}); }
    for (const row of items) { const linkedOrders=ordersByItem.get(row.id)||[], linkedProjects=projectsByItem.get(row.id)||[]; const m=rank(row.name,[row.unit,row.category,row.is_active?'نشط active':'متوقف inactive'],needle); if(m) results.push({...m,type:'items',id:row.id,title:row.name,subtitle:`${row.category||'غير مصنف'} · ${row.unit||'بدون وحدة'}`,href:`/items?itemId=${row.id}`,meta:[row.category,row.unit,row.is_active?'نشط':'متوقف'].filter(Boolean),relations:{project:linkedProjects[0]||null,sites:linkedOrders.flatMap(o=>sitesByOrder.get(o.id)||[]).filter((v,i,a)=>a.findIndex(x=>x.id===v.id)===i).slice(0,3),orders:linkedOrders.slice(0,3),item:row}}); }
    results.sort((a,b)=>b.score-a.score || a.title.localeCompare(b.title,'ar'));
    const counts={projects:results.filter(x=>x.type==='projects').length,workOrders:results.filter(x=>x.type==='workOrders').length,sites:results.filter(x=>x.type==='sites').length,items:results.filter(x=>x.type==='items').length};
    return NextResponse.json({query,results,total:results.length,counts,elapsedMs:Math.max(1,Math.round(performance.now()-started))});
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذر تنفيذ البحث الشامل.' }, { status: 500 }); }
}
