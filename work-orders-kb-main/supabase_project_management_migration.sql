-- Project management fields for archive/trash workflows.
-- Run once in the SQL Editor of work-orders-db.

alter table public.projects
  add column if not exists updated_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_from_status text;

update public.projects
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

create index if not exists projects_deleted_at_idx
  on public.projects (deleted_at);

create index if not exists projects_status_idx
  on public.projects (status);

-- Additional contract and ownership fields used by the projects management page.
alter table public.projects
  add column if not exists contract_number text,
  add column if not exists contract_start_date date,
  add column if not exists contract_end_date date,
  add column if not exists contract_value numeric(18,2),
  add column if not exists owner_entity text,
  add column if not exists supervisor_name text;

create index if not exists projects_contract_number_idx
  on public.projects (contract_number);
