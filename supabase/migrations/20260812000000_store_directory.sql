-- Public stall directory: every store can opt in/out of the /order listing and
-- carry a manual rank so an owner can pin their own stall to the top.
alter table public.stores
  add column if not exists listed boolean not null default true,
  add column if not exists featured_rank integer not null default 0;

create index if not exists stores_directory_idx
  on public.stores (listed, featured_rank desc, name);
