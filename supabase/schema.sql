-- =====================================================================
-- ระบบตรวจสอบยอดค้างชำระ — โครงสร้างฐานข้อมูล Supabase
-- วิธีใช้: Supabase → SQL Editor → New query → วางทั้งไฟล์ → Run
-- =====================================================================

-- ลูกหนี้
create table if not exists public.customers (
  id             uuid primary key default gen_random_uuid(),
  phone          text not null unique check (phone ~ '^0[0-9]{8,9}$'),
  name           text not null,
  monthly_amount numeric(12,2) not null default 0 check (monthly_amount >= 0),
  note           text default '',
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- บิลรายเดือน (1 คน มีได้ 1 บิลต่อเดือน)
create table if not exists public.bills (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  bill_month  text not null check (bill_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),  -- รูปแบบ YYYY-MM (ค.ศ.)
  amount      numeric(12,2) not null check (amount >= 0),
  paid        boolean not null default false,
  paid_at     timestamptz,
  note        text default '',
  created_at  timestamptz not null default now(),
  unique (customer_id, bill_month)
);
create index if not exists bills_customer_idx on public.bills(customer_id);

-- รายชื่อผู้ดูแลระบบ (อ้างอิงบัญชีใน Supabase Auth)
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email   text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ตรวจว่าผู้ที่ล็อกอินอยู่เป็นแอดมินหรือไม่
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- Row Level Security: ตารางทั้งหมดอ่าน/เขียนได้เฉพาะแอดมิน
-- ผู้ใช้ทั่วไปค้นหาได้ผ่านฟังก์ชัน lookup_debt เท่านั้น (ทีละเบอร์)
-- ---------------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.bills     enable row level security;
alter table public.admins    enable row level security;

drop policy if exists "admin all customers" on public.customers;
create policy "admin all customers" on public.customers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all bills" on public.bills;
create policy "admin all bills" on public.bills
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read own admin row" on public.admins;
create policy "read own admin row" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- ฟังก์ชันสำหรับหน้าผู้ใช้: ค้นหาด้วยเบอร์โทร คืนชื่อ + รายการบิล
-- ---------------------------------------------------------------------
create or replace function public.lookup_debt(p_phone text)
returns json
language plpgsql stable security definer set search_path = public
as $$
declare
  v_phone text;
  c public.customers;
begin
  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if v_phone like '66%' and length(v_phone) = 11 then
    v_phone := '0' || substr(v_phone, 3);
  end if;
  if v_phone !~ '^0[0-9]{8,9}$' then
    return null;
  end if;

  select * into c from public.customers where phone = v_phone;
  if not found then
    return null;
  end if;

  return json_build_object(
    'name',  c.name,
    'phone', c.phone,
    'bills', coalesce((
      select json_agg(json_build_object(
               'month', b.bill_month, 'amount', b.amount, 'paid', b.paid,
               'paid_at', b.paid_at, 'note', b.note)
             order by b.bill_month desc)
      from public.bills b where b.customer_id = c.id
    ), '[]'::json)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- ฟังก์ชันสำหรับแอดมิน: ออกบิลประจำเดือนให้ทุกคนที่ใช้งานอยู่
-- ---------------------------------------------------------------------
create or replace function public.generate_month_bills(p_month text)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  n integer;
begin
  if not public.is_admin() then
    raise exception 'ไม่มีสิทธิ์';
  end if;
  insert into public.bills (customer_id, bill_month, amount)
  select id, p_month, monthly_amount
  from public.customers
  where active and monthly_amount > 0
  on conflict (customer_id, bill_month) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.lookup_debt(text)          from public;
revoke all on function public.generate_month_bills(text) from public;
revoke all on function public.is_admin()                 from public;
grant execute on function public.lookup_debt(text)          to anon, authenticated;
grant execute on function public.generate_month_bills(text) to authenticated;
grant execute on function public.is_admin()                 to authenticated;

-- =====================================================================
-- เพิ่มแอดมิน (ทำหลังจากสร้างผู้ใช้ใน Authentication → Users แล้ว)
-- เปลี่ยนอีเมลด้านล่างเป็นอีเมลของคุณ แล้ว Run เฉพาะคำสั่งนี้
-- =====================================================================
-- insert into public.admins (user_id, email)
-- select id, email from auth.users where email = 'you@example.com';
