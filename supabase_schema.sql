create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  is_admin boolean not null default false
);

create table if not exists public.tours (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  level text not null,
  price integer not null default 0,
  location text,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references public.tours(id) on delete cascade,
  start_time timestamptz not null,
  capacity integer not null,
  remaining_slots integer not null,
  created_at timestamptz not null default now(),
  constraint sessions_capacity_check check (capacity >= 0),
  constraint sessions_remaining_slots_check check (remaining_slots >= 0 and remaining_slots <= capacity)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tour_id uuid not null references public.tours(id) on delete restrict,
  session_id uuid not null references public.sessions(id) on delete restrict,
  quantity integer not null,
  total_amount integer not null,
  created_at timestamptz not null default now(),
  constraint orders_quantity_check check (quantity > 0)
);

create or replace function public.create_order_atomic(
  p_user_id uuid,
  p_session_id uuid,
  p_quantity integer
)
returns public.orders
language plpgsql
security definer
as $$
declare
  v_session public.sessions;
  v_tour public.tours;
  v_order public.orders;
begin
  select *
  into v_session
  from public.sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Session not found';
  end if;

  if v_session.remaining_slots < p_quantity then
    raise exception 'Not enough slots';
  end if;

  select *
  into v_tour
  from public.tours
  where id = v_session.tour_id;

  insert into public.orders (user_id, tour_id, session_id, quantity, total_amount)
  values (p_user_id, v_tour.id, v_session.id, p_quantity, v_tour.price * p_quantity)
  returning * into v_order;

  update public.sessions
  set remaining_slots = remaining_slots - p_quantity
  where id = v_session.id;

  return v_order;
end;
$$;
