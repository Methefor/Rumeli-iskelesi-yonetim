import { useState, type ReactNode } from 'react'
import { ConfirmSheet, Input, Stack } from '../../components/ui'

interface ReasonSheetProps {
  open: boolean
  title: string
  /** What is about to happen, plus any extra fields (e.g. the new PIN). */
  children?: ReactNode
  confirmLabel: string
  tone?: 'primary' | 'danger'
  loading?: boolean
  /** Extra condition that must hold before confirming (e.g. a PIN was typed). */
  ready?: boolean
  onConfirm: (reason: string) => void
  onCancel: () => void
}

/**
 * Every critical management action asks for a reason before it can be
 * confirmed. The server requires one too; this only makes the requirement
 * visible instead of surfacing a rejected request.
 *
 * The body is mounted only while the sheet is open, so a reason typed for one
 * action can never leak into the next one.
 */
export function ReasonSheet(props: ReasonSheetProps) {
  if (!props.open) return null
  return <OpenReasonSheet {...props} />
}

function OpenReasonSheet({
  title,
  children,
  confirmLabel,
  tone = 'primary',
  loading = false,
  ready = true,
  onConfirm,
  onCancel,
}: ReasonSheetProps) {
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()
  return (
    <ConfirmSheet
      open
      title={title}
      confirmLabel={confirmLabel}
      tone={tone}
      loading={loading}
      confirmDisabled={!trimmed || !ready}
      onConfirm={() => onConfirm(trimmed)}
      onCancel={onCancel}
    >
      <Stack gap="sm">
        {children}
        <Input
          label="Gerekçe (zorunlu)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
        />
      </Stack>
    </ConfirmSheet>
  )
}
