import { useCallback, useEffect, useRef, useState } from 'react'
import { friendlyErrorMessage } from '../services/errors'

export interface AsyncState<T> {
  /** Latest successful result for the CURRENT key (kept while a reload is in flight); null before the first load or after the key changes. */
  data: T | null
  /** A Turkish, user-safe message; never raw database text. */
  error: string | null
  /** True until the current key (and reload count) has produced a result. */
  loading: boolean
  reload: () => void
}

interface Result<T> {
  key: string
  reload: number
  data: T | null
  error: string | null
}

/**
 * Loads data for a string `key` (null = do not load yet). Re-runs when the
 * key changes or `reload()` is called. `loader` may change identity between
 * renders — the latest one is used — so callers can close over props freely;
 * put everything the loader depends on into `key`.
 *
 * State is only written from the async callbacks (never synchronously in the
 * effect body), and a stale response for an old key is ignored.
 */
export function useAsync<T>(key: string | null, loader: () => Promise<T>): AsyncState<T> {
  const loaderRef = useRef(loader)
  const [result, setResult] = useState<Result<T> | null>(null)
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    loaderRef.current = loader
  })

  useEffect(() => {
    if (key === null) return
    let cancelled = false
    loaderRef.current().then(
      (data) => {
        if (!cancelled) setResult({ key, reload: reloadCount, data, error: null })
      },
      (error: unknown) => {
        const message =
          error instanceof Error ? error.message : friendlyErrorMessage(null)
        if (!cancelled)
          setResult({ key, reload: reloadCount, data: null, error: message })
      },
    )
    return () => {
      cancelled = true
    }
  }, [key, reloadCount])

  const reload = useCallback(() => setReloadCount((n) => n + 1), [])

  const sameKey = result !== null && result.key === key
  const settled = sameKey && result.reload === reloadCount

  return {
    data: sameKey ? result.data : null,
    error: settled ? result.error : null,
    loading: key !== null && !settled,
    reload,
  }
}
