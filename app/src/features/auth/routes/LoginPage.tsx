import { useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Card } from '../../../components/ui/Card'
import { StatusChip } from '../../../components/ui/StatusChip'
import { useToast } from '../../../hooks/useToast'
import { useAuth } from '../../../hooks/useAuth'
import { isDemoModeEnabled } from '../../../services/supabase'
import { demoHomePath, findDemoUser, homePathForRoles } from '../demoUsers'
import styles from './LoginPage.module.css'

/**
 * Login. Real mode signs in through the `pin-login` Edge Function
 * (AuthContext.signInWithPin), which resolves only after the session exists
 * and the user's roles are loaded, then redirects by role. Every
 * authentication failure — wrong PIN, unknown code, inactive, locked — shows
 * the SAME generic message, so the screen cannot reveal whether an account
 * exists or is locked. Only a connectivity problem and an unexpected backend
 * response get their own wording. Raw backend text, PINs and tokens are never
 * shown or logged.
 *
 * When VITE_DEMO_MODE=true (Preview only — see services/supabase/env.ts),
 * submitting instead checks the synthetic demoUsers directory entirely
 * client-side via AuthContext.signInDemo — no network call of any kind.
 */
const MESSAGES = {
  invalid_credentials: 'Çalışan kodu veya PIN hatalı.',
  network: 'Bağlantı hatası. İnternet bağlantınızı kontrol edip tekrar deneyin.',
  unexpected: 'Giriş şu anda tamamlanamadı. Lütfen tekrar deneyin.',
} as const

export function LoginPage() {
  const { showToast } = useToast()
  const { signInDemo, signInWithPin, status, roles, isDemo } = useAuth()
  const navigate = useNavigate()
  const [employeeCode, setEmployeeCode] = useState('')
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Ref guard: state updates are async, so a fast double tap could otherwise
  // start two sign-ins before `submitting` re-renders.
  const inFlight = useRef(false)

  // A restored real session visiting "/" goes straight to its home. (Demo
  // sessions keep the existing behaviour: the demo login screen stays reachable.)
  if (!isDemoModeEnabled && status === 'authenticated' && !isDemo) {
    return <Navigate to={homePathForRoles(roles)} replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (inFlight.current) return

    if (isDemoModeEnabled) {
      const demoUser = findDemoUser(employeeCode, pin)
      if (!demoUser) {
        showToast('Çalışan kodu veya PIN hatalı.', 'danger')
        return
      }
      signInDemo(employeeCode, pin)
      navigate(demoHomePath(demoUser))
      return
    }

    if (!employeeCode.trim() || pin.length < 4) {
      setError(MESSAGES.invalid_credentials)
      return
    }

    inFlight.current = true
    setSubmitting(true)
    setError(null)
    const result = await signInWithPin(employeeCode, pin)
    inFlight.current = false
    setSubmitting(false)
    if (!result.ok) {
      setError(MESSAGES[result.reason])
      setPin('')
    }
    // On success the redirect happens through the authenticated-state branch
    // above, using the roles that were loaded before this promise resolved.
  }

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        {isDemoModeEnabled && <StatusChip tone="info">Demo / Preview</StatusChip>}
        <h1 className={styles.title}>Rumeli Operasyon</h1>
        <p className={styles.subtitle}>Çalışan kodu ve PIN ile giriş yapın.</p>
        {isDemoModeEnabled && (
          <p className={styles.subtitle}>
            Demo: M001/2027 (yönetici), K001/2027 (kasiyer), D001/2027 (çalışan)
          </p>
        )}

        <form className={styles.form} onSubmit={(e) => void handleSubmit(e)} noValidate>
          <Input
            label="Çalışan Kodu"
            name="employeeCode"
            autoComplete="username"
            value={employeeCode}
            disabled={submitting}
            onChange={(e) => setEmployeeCode(e.target.value)}
            required
          />
          <Input
            label="PIN"
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={6}
            value={pin}
            disabled={submitting}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            required
          />
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" fullWidth loading={submitting}>
            Giriş Yap
          </Button>
        </form>
      </Card>
    </div>
  )
}
