-- Event spend: once a ticket reaches the amount the owner sets, the counter may
-- attach a manual, reason-tagged discount to it. 0 disables the whole feature.

alter table public.stores
  add column if not exists event_spend numeric(10, 2) not null default 0;

alter table public.orders
  add column if not exists special_discount numeric(10, 2) not null default 0,
  add column if not exists special_discount_reason text not null default '';

comment on column public.stores.event_spend is
  'Order total that unlocks the counter event discount. 0 = disabled.';
comment on column public.orders.special_discount is
  'Manual event discount added at the counter, already folded into discount_total.';
