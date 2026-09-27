import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import styles from './PwaStatus.module.css'

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

export function PwaStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const registration = useRef<ServiceWorkerRegistration | null>(null)
  const updateTimer = useRef<number | null>(null)
  const reloadOnControllerChange = useRef(false)

  useEffect(() => {
    let disposed = false
    let activeRegistration: ServiceWorkerRegistration | null = null
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    const handleControllerChange = () => {
      if (reloadOnControllerChange.current) window.location.reload()
    }
    const watchInstallingWorker = (worker: ServiceWorker | null) => {
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          setUpdateAvailable(true)
        }
      })
    }
    const handleUpdateFound = () => {
      watchInstallingWorker(activeRegistration?.installing ?? null)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
      void navigator.serviceWorker.ready.then((readyRegistration) => {
        if (disposed) return

        activeRegistration = readyRegistration
        registration.current = readyRegistration
        if (readyRegistration.waiting) setUpdateAvailable(true)

        readyRegistration.addEventListener('updatefound', handleUpdateFound)

        updateTimer.current = window.setInterval(() => {
          if (navigator.onLine) void readyRegistration.update()
        }, UPDATE_CHECK_INTERVAL_MS)
      })
    }

    return () => {
      disposed = true
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      navigator.serviceWorker?.removeEventListener(
        'controllerchange',
        handleControllerChange,
      )
      activeRegistration?.removeEventListener('updatefound', handleUpdateFound)
      if (updateTimer.current !== null) window.clearInterval(updateTimer.current)
    }
  }, [])

  const applyUpdate = () => {
    const waitingWorker = registration.current?.waiting
    if (!waitingWorker) return

    reloadOnControllerChange.current = true
    waitingWorker.postMessage({ type: 'SKIP_WAITING' })
  }

  if (isOnline && !updateAvailable) return null

  return (
    <div className={styles.stack} aria-live="polite">
      {!isOnline && (
        <div className={[styles.notice, styles.offline].join(' ')} role="status">
          <strong>İnternet bağlantısı yok.</strong>
          <span>Görüntüleme ve kayıt işlemleri bağlantı gelene kadar kullanılamaz.</span>
        </div>
      )}

      {updateAvailable && (
        <div className={[styles.notice, styles.update].join(' ')} role="status">
          <span>Uygulamanın yeni sürümü hazır.</span>
          <Button size="md" onClick={applyUpdate}>
            Şimdi güncelle
          </Button>
        </div>
      )}
    </div>
  )
}
