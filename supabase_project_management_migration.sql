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
