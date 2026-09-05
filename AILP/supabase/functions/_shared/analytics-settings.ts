type Settings = {
  ga4_property_id?: string | null
  ga4_page_path?: string | null
  ga4_measurement_id?: string | null
  gtm_container_id?: string | null
  is_active?: boolean
}

// PostgREST may infer a relation as an object or an array without generated DB types.
function one<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined
}

const nonEmpty = (value?: string | null) => value?.trim() || null

export function resolveAnalyticsSettings(target: {
  ga4_page_path?: string | null
  clients?: { ga4_property_id?: string | null } | { ga4_property_id?: string | null }[] | null
  lp_analytics_settings?: Settings | Settings[] | null
}) {
  const settings = one(target.lp_analytics_settings)
  return {
    ga4_property_id: nonEmpty(settings?.ga4_property_id) ?? nonEmpty(one(target.clients)?.ga4_property_id),
    ga4_page_path: nonEmpty(settings?.ga4_page_path) ?? nonEmpty(target.ga4_page_path),
    ga4_measurement_id: nonEmpty(settings?.ga4_measurement_id),
    gtm_container_id: nonEmpty(settings?.gtm_container_id),
    is_active: settings?.is_active !== false,
  }
}
