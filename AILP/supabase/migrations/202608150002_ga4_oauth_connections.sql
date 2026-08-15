create type public.integration_connection_status as enum (
  'pending',
  'active',
  'expired',
  'revoked',
  'failed'
);

create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  auth_type text not null,
  status public.integration_connection_status not null default 'pending',
  owner_user_id uuid references public.profiles(id) on delete set null,
  client_id uuid references public.clients(id) on delete cascade,
  display_name text,
  external_account_id text,
  scopes text[] not null default '{}',
  access_token_secret_name text,
  refresh_token_secret_name text,
  service_account_secret_name text,
  expires_at timestamptz,
  last_verified_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_connections_provider check (provider in ('google_ga4', 'github', 'netlify', 'openai')),
  constraint integration_connections_auth_type check (auth_type in ('oauth2', 'service_account', 'api_token')),
  constraint integration_connections_has_owner_or_client check (owner_user_id is not null or client_id is not null)
);

create table public.ga4_property_connections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  ga4_property_id text not null,
  property_display_name text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, ga4_property_id)
);

create unique index ga4_property_connections_one_default_per_client
on public.ga4_property_connections (client_id)
where is_default;

create trigger set_integration_connections_updated_at
before update on public.integration_connections
for each row execute function public.set_updated_at();

create trigger set_ga4_property_connections_updated_at
before update on public.ga4_property_connections
for each row execute function public.set_updated_at();

alter table public.integration_connections enable row level security;
alter table public.ga4_property_connections enable row level security;

create policy "integration_connections_select_admin_or_owner"
on public.integration_connections for select
to authenticated
using (
  public.is_admin()
  or owner_user_id = auth.uid()
  or (client_id is not null and public.can_access_client(client_id))
);

create policy "integration_connections_admin_write"
on public.integration_connections for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "ga4_property_connections_select_by_client_role"
on public.ga4_property_connections for select
to authenticated
using (public.can_access_client(client_id));

create policy "ga4_property_connections_admin_write"
on public.ga4_property_connections for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
