create table public.admin_email_allowlist (
  email text primary key,
  note text,
  created_at timestamptz not null default now()
);

alter table public.admin_email_allowlist enable row level security;

create policy "admin_email_allowlist_admin_only"
on public.admin_email_allowlist for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.admin_email_allowlist (email, note)
values
  ('h.dazai0316@gmail.com', 'Initial admin'),
  ('kanatani@dec-athlete.com', 'Initial admin')
on conflict (email) do update set
  note = excluded.note;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    updated_at = now();

  if exists (
    select 1
    from public.admin_email_allowlist
    where email = lower(coalesce(new.email, ''))
  ) then
    insert into public.user_roles (user_id, role, client_id)
    values (new.id, 'admin', null)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

insert into public.user_roles (user_id, role, client_id)
select p.id, 'admin', null
from public.profiles p
join public.admin_email_allowlist a on a.email = lower(p.email)
on conflict do nothing;
