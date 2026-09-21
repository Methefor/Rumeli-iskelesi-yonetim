import { useState, type ReactNode } from 'react'
import { deriveClosingStatus, canInventory } from '../../domain/inventory'
import { addDaysIso, formatDate, formatTime, istanbulDate } from '../../utils/dates'
import {
  Button,
  Card,
  DataBoundary,
  EmptyState,
  LinkButton,
  PageHeader,
  Stack,
  StatusChip,
} from '../../components/ui'
import { useAsync } from '../../hooks/useAsync'
import { useAuth } from '../../hooks/useAuth'
import { useSelectedBranch } from '../../hooks/useSelectedBranch'
import { useToast } from '../../hooks/useToast'
import {
  confirmShiftAssignment,
  listInventoryCounts,
  listInventoryItems,
  listInventoryMovements,
  listMyRecentReports,
  listMyShiftAssignments,
} from '../../services/data'
import styles from './Home.module.css'

const ASSIGNMENT_LABEL: Record<string, string> = {
  assigned: 'Onay bekliyor',
  confirmed: 'Onaylandı',
  cancelled: 'İptal',
}

/**
 * "What do I do now?" — the employee's shift for today, whether it is
 * confirmed, and ONE clear next action (confirm the shift -> submit the sales
 * report -> submit the closing count), with the closing checklist beneath it.
 */
export function EmployeeHomePage() {
  const { user, roles, profile } = useAuth()
  const { selectedBranch, selectedBranchId } = useSelectedBranch()
  const { showToast } = useToast()
  const today = istanbulDate()
  const [confirming, setConfirming] = useState(false)

  const state = useAsync(
    user && selectedBranchId
      ? `employee-home:${user.id}:${selectedBranchId}:${today}`
      : null,
    async () => {
      if (!user || !selectedBranchId) return null
      const branchId = selectedBranchId
      const yesterday = addDaysIso(today, -1)

      const [assignments, reports, items] = await Promise.all([
        listMyShiftAssignments(user.id),
        listMyRecentReports(user.id),
        canInventory(roles, 'inventory.read')
          ? listInventoryItems(branchId).catch(() => [])
          : Promise.resolve([]),
      ])

      // Today's active assignment (else last night's evening shift, which runs past midnight).
      const relevant = assignments
        .filter(
          (a) =>
            a.shift.branchId === branchId &&
            a.status !== 'cancelled' &&
            a.shift.status !== 'cancelled',
        )
        .filter(
          (a) =>
            a.shift.businessDate === today ||
            (a.shift.businessDate === yesterday && a.shift.definition.key === 'evening'),
        )
      const current =
        relevant.find((a) => a.shift.businessDate === today) ?? relevant[0] ?? null

      const tracksInventory = items.length > 0
      let countSubmitted = false
      let wasteEntries = 0
      if (current && tracksInventory) {
        const [counts, movements] = await Promise.all([
          listInventoryCounts(branchId, 10),
          listInventoryMovements(branchId, 200),
        ])
        countSubmitted = counts.some(
          (c) => c.status === 'submitted' && c.shiftId === current.shift.id,
        )
        wasteEntries = movements.filter(
          (m) => m.type === 'WASTE' && m.shiftId === current.shift.id,
        ).length
      }

      const salesReportSubmitted = current
        ? reports.some((r) => r.shiftId === current.shift.id && r.status !== 'cancelled')
        : false

      return {
        current,
        tracksInventory,
        salesReportSubmitted,
        countSubmitted,
        wasteEntries,
      }
    },
  )

  async function handleConfirm(assignmentId: string) {
    setConfirming(true)
    const { error } = await confirmShiftAssignment(assignmentId)
    setConfirming(false)
    if (error) {
      showToast(error, 'danger')
      return
    }
    showToast('Vardiya onaylandı', 'success')
    state.reload()
  }

  const canRecord = canInventory(roles, 'inventory.record')
  const canCount = canInventory(roles, 'inventory.count')

  return (
    <Stack>
      <PageHeader
        title={profile?.fullName ? `Merhaba, ${profile.fullName}` : 'Ana Sayfa'}
        subtitle={[profile?.employeeCode, selectedBranch?.name, formatDate(today)]
          .filter(Boolean)
          .join(' · ')}
      />

      <DataBoundary state={state} rows={3} rowHeight={110}>
        {(data) => {
          if (data === null || data.current === null) {
            return (
              <EmptyState
                icon="🕒"
                title="Bugün için vardiyanız yok"
                description="Size atanmış aktif bir vardiya görünmüyor. Yöneticinizle iletişime geçebilir veya vardiyalarınıza bakabilirsiniz."
                action={
                  <LinkButton to="shifts" variant="secondary">
                    Vardiyalarım
                  </LinkButton>
                }
              />
            )
          }

          const {
            current,
            tracksInventory,
            salesReportSubmitted,
            countSubmitted,
            wasteEntries,
          } = data
          const closing = deriveClosingStatus({
            salesReportSubmitted,
            wasteEntries,
            countSubmitted: tracksInventory ? countSubmitted : true,
          })
          const steps = closing.steps.filter((s) => tracksInventory || s.key === 'sales')

          // The single most useful next action.
          let action: ReactNode
          if (current.status === 'assigned') {
            action = (
              <Button
                size="lg"
                fullWidth
                loading={confirming}
                onClick={() => void handleConfirm(current.assignmentId)}
              >
                Vardiyayı Onayla
              </Button>
            )
          } else if (!salesReportSubmitted) {
            action = (
              <LinkButton to={`shifts/${current.shift.id}/report`} size="lg" fullWidth>
                Satış Raporu Gir
              </LinkButton>
            )
          } else if (tracksInventory && canCount && !countSubmitted) {
            action = (
              <LinkButton to="inventory/count" size="lg" fullWidth>
                Kapanış Sayımı Yap
              </LinkButton>
            )
          } else {
            action = (
              <StatusChip tone="success">
                Tüm işlemler tamamlandı — iyi çalışmalar!
              </StatusChip>
            )
          }

          return (
            <Stack>
              <Card>
                <div className={styles.primaryAction}>
                  <div>
                    <div className={styles.sectionTitle}>
                      {current.shift.businessDate === today
                        ? 'Bugünkü vardiya'
                        : 'Dünkü akşam vardiyası'}
                    </div>
                    <strong>
                      {current.shift.branchName} — {current.shift.definition.name}
                    </strong>
                    <div className={styles.greeting}>
                      {formatTime(
                        current.shift.definition.startHour,
                        current.shift.definition.startMinute,
                      )}
                      –
                      {formatTime(
                        current.shift.definition.endHour,
                        current.shift.definition.endMinute,
                      )}
                    </div>
                  </div>
                  <StatusChip
                    tone={current.status === 'confirmed' ? 'success' : 'warning'}
                  >
                    {ASSIGNMENT_LABEL[current.status] ?? current.status}
                  </StatusChip>
                  {action}
                </div>
              </Card>

              <section aria-labelledby="closing">
                <h2 id="closing" className={styles.sectionTitle}>
                  Kapanış kontrol listesi
                </h2>
                <Card>
                  <ul className={styles.steps}>
                    {steps.map((step) => (
                      <li
                        key={step.key}
                        className={[styles.step, step.done ? styles.stepDone : '']
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <span className={styles.stepIcon} aria-hidden="true">
                          {step.done ? '✓' : ''}
                        </span>
                        <span>
                          {step.label}
                          {step.optional ? ' — isteğe bağlı' : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>

              {tracksInventory && (canRecord || canCount) && (
                <section aria-labelledby="stock-actions">
                  <h2 id="stock-actions" className={styles.sectionTitle}>
                    Stok işlemleri
                  </h2>
                  <div className={styles.quick}>
                    {canRecord && (
                      <LinkButton to="inventory/waste" variant="secondary" fullWidth>
                        Fire Kaydı
                      </LinkButton>
                    )}
                    {canCount && (
                      <LinkButton to="inventory/count" variant="secondary" fullWidth>
                        Kapanış Sayımı
                      </LinkButton>
                    )}
                    <LinkButton to="inventory" variant="secondary" fullWidth>
                      Stok Durumu
                    </LinkButton>
                  </div>
                </section>
              )}
            </Stack>
          )
        }}
      </DataBoundary>
    </Stack>
  )
}
