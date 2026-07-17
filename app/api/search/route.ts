import { NextRequest, NextResponse } from 'next/server';
import { createWorkOrdersAdminClient } from '@/lib/server-supabase';

export const dynamic = 'force-dynamic';

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

function includes(haystack: unknown[], needle: string) {
  return normalize(haystack.filter(Boolean).join(' ')).includes(needle);
}

export async function GET(request: NextRequest) {
  try {
    const query = String(request.nextUrl.searchParams.get('q') || '').trim();
    if (query.length < 2) {
      return NextResponse.json({ query, projects: [], workOrders: [], sites: [], items: [], total: 0 });
    }

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

    const projects = projectsResult.data || [];
    const orders = ordersResult.data || [];
    const sites = sitesResult.data || [];
    const items = itemsResult.data || [];
    const orderSites = orderSitesResult.data || [];
    const orderItems = orderItemsResult.data || [];
    const boq = boqResult.data || [];
    const needle = normalize(query);

    const projectMap = new Map(projects.map((row: any) => [row.id, row]));
    const siteCountByProject = new Map<string, number>();
    const orderCountByProject = new Map<string, number>();
    const itemCountByProject = new Map<string, Set<string>>();
    const siteCountByOrder = new Map<string, number>();
    const itemCountByOrder = new Map<string, Set<string>>();
    const orderCountBySite = new Map<string, number>();
    const orderCountByItem = new Map<string, Set<string>>();
    const projectCountByItem = new Map<string, Set<string>>();
    const usageByItem = new Map<string, { contract: number; executed: number; remaining: number; value: number }>();

    sites.forEach((row: any) => siteCountByProject.set(row.project_id, (siteCountByProject.get(row.project_id) || 0) + 1));
    orders.forEach((row: any) => orderCountByProject.set(row.project_id, (orderCountByProject.get(row.project_id) || 0) + 1));
    boq.forEach((row: any) => {
      if (!itemCountByProject.has(row.project_id)) itemCountByProject.set(row.project_id, new Set());
      itemCountByProject.get(row.project_id)!.add(row.item_id);
      if (!projectCountByItem.has(row.item_id)) projectCountByItem.set(row.item_id, new Set());
      projectCountByItem.get(row.item_id)!.add(row.project_id);
      const current = usageByItem.get(row.item_id) || { contract: 0, executed: 0, remaining: 0, value: 0 };
      current.contract += Number(row.contract_quantity || 0);
      current.value += Number(row.total_price || 0);
      usageByItem.set(row.item_id, current);
    });
    orderSites.forEach((row: any) => {
      siteCountByOrder.set(row.work_order_id, (siteCountByOrder.get(row.work_order_id) || 0) + 1);
      orderCountBySite.set(row.site_id, (orderCountBySite.get(row.site_id) || 0) + 1);
    });
    orderItems.forEach((row: any) => {
      if (!itemCountByOrder.has(row.work_order_id)) itemCountByOrder.set(row.work_order_id, new Set());
      itemCountByOrder.get(row.work_order_id)!.add(row.item_id);
      if (!orderCountByItem.has(row.item_id)) orderCountByItem.set(row.item_id, new Set());
      orderCountByItem.get(row.item_id)!.add(row.work_order_id);
      const current = usageByItem.get(row.item_id) || { contract: 0, executed: 0, remaining: 0, value: 0 };
      current.executed += Number(row.executed_quantity || 0);
      current.remaining += Number(row.remaining_quantity || 0);
      usageByItem.set(row.item_id, current);
    });

    const projectMatches = projects
      .filter((row: any) => includes([row.name, row.code, row.municipality, row.contractor_name, row.description, row.contract_number, row.owner_entity, row.status], needle))
      .slice(0, 12)
      .map((row: any) => ({ ...row, sitesCount: siteCountByProject.get(row.id) || 0, ordersCount: orderCountByProject.get(row.id) || 0, itemsCount: itemCountByProject.get(row.id)?.size || 0 }));

    const workOrderMatches = orders
      .filter((row: any) => {
        const project = projectMap.get(row.project_id) as any;
        return includes([row.work_order_number, row.title, row.status, row.contractor_name, row.notes, row.work_order_date, row.work_order_end_date, project?.name, project?.code], needle);
      })
      .slice(0, 18)
      .map((row: any) => ({ ...row, project: projectMap.get(row.project_id) || null, sitesCount: siteCountByOrder.get(row.id) || 0, itemsCount: itemCountByOrder.get(row.id)?.size || 0 }));

    const siteMatches = sites
      .filter((row: any) => {
        const project = projectMap.get(row.project_id) as any;
        return includes([row.name, row.site_code, row.area_name, row.status, row.source_code, row.source_district, project?.name, project?.municipality], needle);
      })
      .slice(0, 18)
      .map((row: any) => ({ ...row, project: projectMap.get(row.project_id) || null, ordersCount: orderCountBySite.get(row.id) || 0 }));

    const itemMatches = items
      .filter((row: any) => includes([row.name, row.unit, row.category, row.is_active ? 'نشط active' : 'متوقف inactive'], needle))
      .slice(0, 24)
      .map((row: any) => ({ ...row, projectsCount: projectCountByItem.get(row.id)?.size || 0, ordersCount: orderCountByItem.get(row.id)?.size || 0, ...(usageByItem.get(row.id) || { contract: 0, executed: 0, remaining: 0, value: 0 }) }));

    return NextResponse.json({
      query,
      projects: projectMatches,
      workOrders: workOrderMatches,
      sites: siteMatches,
      items: itemMatches,
      total: projectMatches.length + workOrderMatches.length + siteMatches.length + itemMatches.length,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذر تنفيذ البحث الشامل.' }, { status: 500 });
  }
}
