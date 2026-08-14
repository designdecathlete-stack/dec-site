insert into public.integration_secret_refs (provider, purpose, storage_type, secret_name, description)
values
  ('google', 'ga4_property_id', 'edge_function_secret', 'GA4_PROPERTY_ID', 'GA4 property ID used by ga4-sync'),
  ('google', 'ga4_service_account', 'edge_function_secret', 'GOOGLE_SERVICE_ACCOUNT_JSON', 'Service account JSON for GA4 Data API'),
  ('openai', 'lp_ai_analysis', 'edge_function_secret', 'OPENAI_API_KEY', 'OpenAI API key for LP analysis and proposal generation'),
  ('github', 'lp_file_operations', 'edge_function_secret', 'GITHUB_TOKEN', 'GitHub token for future branch and file operations'),
  ('netlify', 'deploy_trigger', 'edge_function_secret', 'NETLIFY_BUILD_HOOK_URL', 'Netlify build hook URL for future publish flow'),
  ('supabase', 'scheduled_function_project_url', 'supabase_vault', 'project_url', 'Project URL used by cron/pg_net to call Edge Functions'),
  ('supabase', 'scheduled_function_auth_token', 'supabase_vault', 'edge_function_token', 'Token used by cron/pg_net to authenticate scheduled function calls')
on conflict (provider, purpose) do update set
  storage_type = excluded.storage_type,
  secret_name = excluded.secret_name,
  description = excluded.description,
  updated_at = now();
