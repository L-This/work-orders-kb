-- Run once in Supabase SQL Editor before importing the updated workbook.
alter table public.work_orders
  add column if not exists work_order_end_date date,
  add column if not exists duration_days integer;

create index if not exists idx_work_orders_end_date
  on public.work_orders(work_order_end_date);

comment on column public.work_orders.work_order_end_date is 'Planned end date parsed from the Excel work-order header.';
comment on column public.work_orders.duration_days is 'Calendar-day difference between start and end dates.';
