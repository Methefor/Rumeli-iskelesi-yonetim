export type AnalyticsPermission =
  | 'analytics.read'
  | 'analytics.financial.read'
  | 'analytics.ai.read'
  | 'analytics.regenerate'

/**
 * UI-VISIBILITY ONLY. Mirrors the role -> permission seed in
 * supabase/migrations/20261006000100_analytics_engine_v1.sql. Every read and
 * regeneration is authorized again server-side (RLS + SECURITY DEFINER RPCs).
 * cashier, employee and viewer have no analytics permission by default.
 */
const ROLE_PERMISSIONS: Readonly<Record<string, readonly AnalyticsPermission[]>> = {
  owner: ['analytics.read', 'analytics.financial.read', 'analytics.ai.read', 'analytics.regenerate'],
  manager: ['analytics.read', 'analytics.financial.read', 'analytics.ai.read', 'analytics.regenerate'],
  branch_manager: ['analytics.read', 'analytics.financial.read', 'analytics.ai.read'],
  cashier: [],
  employee: [],
  viewer: [],
}

export function analyticsPermissionsFor(roles: readonly string[]): ReadonlySet<AnalyticsPermission> {
  const granted = new Set<AnalyticsPermission>()
  for (const role of roles) for (const p of ROLE_PERMISSIONS[role] ?? []) granted.add(p)
  return granted
}

export function canAnalytics(roles: readonly string[], permission: AnalyticsPermission): boolean {
  return analyticsPermissionsFor(roles).has(permission)
}
