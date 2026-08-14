insert into public.clients (name, slug, ga4_property_id)
values
  ('chacha eyelash&eyebrow', 'chacha', null),
  ('サロン・ド・ノーブル', 'marr', null),
  ('Resole', 'resole', null),
  ('リフテージ新所沢店', 'lifutage-shintokorozawa-lp', null),
  ('放課後サロン会議', 'biyoshitsu-owner-hokago-lp', null),
  ('Splendor', 'splender', null)
on conflict (slug) do nothing;

insert into public.lp_projects (client_id, name, slug, folder_path, public_url, ga4_page_path)
select id, 'chacha 錦糸町店 LP', 'main', 'chacha', 'https://dec-site.site/chacha/', '/chacha/'
from public.clients where slug = 'chacha'
on conflict (folder_path) do nothing;

insert into public.lp_projects (client_id, name, slug, folder_path, public_url, ga4_page_path)
select id, 'サロン・ド・ノーブル LP', 'main', 'marr', 'https://dec-site.site/marr/', '/marr/'
from public.clients where slug = 'marr'
on conflict (folder_path) do nothing;

insert into public.lp_projects (client_id, name, slug, folder_path, public_url, ga4_page_path)
select id, 'Resole LP', 'main', 'resole', 'https://dec-site.site/resole/', '/resole/'
from public.clients where slug = 'resole'
on conflict (folder_path) do nothing;

insert into public.lp_projects (client_id, name, slug, folder_path, public_url, ga4_page_path)
select id, 'リフテージ新所沢店 LP', 'main', 'lifutage-shintokorozawa-lp', 'https://dec-site.site/lifutage-shintokorozawa-lp/', '/lifutage-shintokorozawa-lp/'
from public.clients where slug = 'lifutage-shintokorozawa-lp'
on conflict (folder_path) do nothing;

insert into public.lp_projects (client_id, name, slug, folder_path, public_url, ga4_page_path)
select id, '放課後サロン会議 LP', 'main', 'biyoshitsu-owner-hokago-lp', 'https://dec-site.site/biyoshitsu-owner-hokago-lp/', '/biyoshitsu-owner-hokago-lp/'
from public.clients where slug = 'biyoshitsu-owner-hokago-lp'
on conflict (folder_path) do nothing;

insert into public.lp_projects (client_id, name, slug, folder_path, public_url, ga4_page_path)
select id, 'Splendor 採用LP', 'recruit', 'splender/recruit-lp', 'https://dec-site.site/splender/recruit-lp/', '/splender/recruit-lp/'
from public.clients where slug = 'splender'
on conflict (folder_path) do nothing;
