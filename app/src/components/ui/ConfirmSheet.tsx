import type { ReactNode } from 'react'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { Stack } from './Layout'

export interface ConfirmSheetProps {
  open: boolean
  title: string
  /** What is about to happen — the user should be able to verify it at a glance. */
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  loading?: boolean
  /** Disable the confirm button (e.g. a required reason is still empty). */
  confirmDisabled?: boolean
  tone?: 'primary' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}

/** A bottom-sheet confirmation for consequential entries (waste, counts, cost changes, reversals). */
export function ConfirmSheet({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Vazgeç',
  loading = false,
  confirmDisabled = false,
  tone = 'primary',
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  return (
    <BottomSheet open={open} onClose={loading ? () => undefined : onCancel} title={title}>
      <Stack gap="md">
        <div>{children}</div>
        <Button
          size="lg"
          fullWidth
          variant={tone === 'danger' ? 'danger' : 'primary'}
          loading={loading}
          disabled={confirmDisabled}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
        <Button
          size="lg"
          fullWidth
          variant="secondary"
          disabled={loading}
          onClick={onCancel}
        >
          {cancelLabel}
        </Button>
      </Stack>
    </BottomSheet>
  )
}
