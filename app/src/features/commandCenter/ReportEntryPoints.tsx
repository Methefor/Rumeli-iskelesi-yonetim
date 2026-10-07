import { LinkButton, Stack } from '../../components/ui'
import { canAnalytics } from '../../domain/analytics'
import { useAuth } from '../../hooks/useAuth'

/**
 * Entry points to the daily and weekly manager summaries. The Command Center itself stays independent of the narrative: these are
 * plain links, shown only to roles that may read analytics.
 */
export function ReportEntryPoints() {
  const { roles } = useAuth()
  if (!canAnalytics(roles, 'analytics.read')) return null
  return (
    <Stack gap="sm">
      <LinkButton to="/app/manager/reports/daily-summary" variant="secondary" fullWidth>
        Günün yönetici özeti
      </LinkButton>
      <LinkButton to="/app/manager/reports/weekly-summary" variant="secondary" fullWidth>
        Haftalık özeti aç
      </LinkButton>
    </Stack>
  )
}
