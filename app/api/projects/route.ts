import { NextRequest, NextResponse } from 'next/server';
import { createWorkOrdersAdminClient } from '@/lib/server-supabase';

export const dynamic = 'force-dynamic';

function clean(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

export async function GET() {
  try {
    const work = createWorkOrdersAdminClient();
    const result = await work
      .from('projects')
      .select('id,name,code,municipality,contractor_name,status,description,created_at,updated_at,deleted_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (result.error) throw result.error;
    return NextResponse.json({ projects: result.data || [] });
  } catch (error) {
    const details = error && typeof error === 'object' ? error as { message?: string; details?: string; hint?: string } : null;
    return NextResponse.json({ error: details?.message || details?.details || 'تعذر تحميل المشاريع.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body.name || '').trim();
    if (!name) return NextResponse.json({ error: 'اسم المشروع مطلوب.' }, { status: 400 });

    const work = createWorkOrdersAdminClient();
    const duplicate = await work.from('projects').select('id').eq('name', name).is('deleted_at', null).maybeSingle();
    if (duplicate.error) throw duplicate.error;
    if (duplicate.data) return NextResponse.json({ error: 'يوجد مشروع مسجل بالاسم نفسه.' }, { status: 409 });

    const result = await work.from('projects').insert({
      name,
      code: clean(body.code),
      municipality: clean(body.municipality),
      contractor_name: clean(body.contractor_name),
      status: clean(body.status) || 'active',
      description: clean(body.description),
      updated_at: new Date().toISOString(),
    }).select('id,name,code,municipality,contractor_name,status,description,created_at,updated_at,deleted_at').single();

    if (result.error) throw result.error;
    return NextResponse.json({ project: result.data }, { status: 201 });
  } catch (error) {
    const details = error && typeof error === 'object' ? error as { message?: string; details?: string; hint?: string } : null;
    return NextResponse.json({ error: details?.message || details?.details || 'تعذر إنشاء المشروع.' }, { status: 500 });
  }
}
