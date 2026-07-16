-- نفّذ هذا الملف مرة واحدة داخل مشروع Supabase الخاص بنظام أوامر العمل: work-orders-db

create table if not exists public.project_irrigation_links (
  id uuid primary key default gen_random_uuid(),
  work_orders_project_id uuid not null unique references public.projects(id) on delete cascade,
  irrigation_project_id uuid not null,
  irrigation_project_name text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sites
  add column if not exists source_system text,
  add column if not exists source_site_id uuid,
  add column if not exists source_project_id uuid,
  add column if not exists source_code text,
  add column if not exists source_district text,
  add column if not exists synced_at timestamptz;

create unique index if not exists uq_sites_external_source
  on public.sites(source_system, source_site_id)
  where source_system is not null and source_site_id is not null;

create index if not exists idx_sites_source_project
  on public.sites(source_system, source_project_id);

alter table public.project_irrigation_links enable row level security;

-- القراءة عبر الواجهة الإدارية اختيارية، بينما عمليات الربط والمزامنة تتم من الخادم بمفتاح service role.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'project_irrigation_links' and policyname = 'Allow authenticated read irrigation links'
  ) then
    create policy "Allow authenticated read irrigation links"
      on public.project_irrigation_links for select
      to authenticated
      using (true);
  end if;
end $$;
