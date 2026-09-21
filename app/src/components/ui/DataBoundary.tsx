import type { ReactNode } from 'react'
import { ErrorState } from './ErrorState'
import { Skeleton } from './Skeleton'
import { Stack } from './Layout'

export interface DataBoundaryState<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
}

export interface DataBoundaryProps<T> {
  state: DataBoundaryState<T>
  children: (data: T) => ReactNode
  /** Number of skeleton rows while loading. */
  rows?: number
  rowHeight?: number
}

/**
 * The standard loading / error / content switch, so every screen shows the
 * same skeleton and the same retryable error state. While a RELOAD is in
 * flight the previous data stays on screen (no flash of skeletons).
 */
export function DataBoundary<T>({
  state,
  children,
  rows = 3,
  rowHeight = 72,
}: DataBoundaryProps<T>) {
  if (state.data !== null) return <>{children(state.data)}</>

  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />

  return (
    <Stack gap="sm" aria-busy="true" aria-label="Yükleniyor">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={rowHeight} radius="var(--radius-lg)" />
      ))}
    </Stack>
  )
}
