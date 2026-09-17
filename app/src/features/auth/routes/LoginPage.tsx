import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Card } from '../../../components/ui/Card'
import { StatusChip } from '../../../components/ui/StatusChip'
import { useToast } from '../../../hooks/useToast'
import { useAuth } from '../../../hooks/useAuth'
import { isDemoModeEnabled } from '../../../services/supabase'
import { demoHomePath, findDemoUser } from '../demoUsers'
import styles from './LoginPage.module.css'

/**
 * Login UI shell. The real path is NOT wired to Supabase yet — there is no
 * pin-login Edge Function deployed (see supabase/functions/pin-login, not
 * deployed) and no `profiles`/`pin_credentials` schema in production yet
 * (see supabase/migrations, not applied). Submitting shows an explicit
 * "not ready" state there rather than pretending to authenticate — see
 * DECISIONS.md for why the legacy plaintext-PIN pattern was not ported
 * here as a stopgap.
 *
 * When VITE_DEMO_MODE=true (Preview only — see services/supabase/env.ts),
 * submitting instead checks the synthetic demoUsers directory entirely
 * client-side and, on a match, signs in via AuthContext.signInDemo — no
 * network call, real Supabase path left completely unchanged for when a
 * real backend exists.
 */
export function LoginPage() {
  const { showToast } = useToast()
  const { signInDemo } = useAuth()
  const navigate = useNavigate()
  const [employeeCode, setEmployeeCode] = useState('')
  const [pin, setPin] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()

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

    // TODO(Phase C completion): call the pin-login Edge Function once
    // deployed, then supabase.auth.setSession() with the returned tokens.
    showToast("Giriş backend'i henüz hazır değil (Faz C hazırlık aşaması).", 'warning')
  }

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        <StatusChip tone="info">{isDemoModeEnabled ? 'Demo / Preview' : 'Faz C — hazırlık'}</StatusChip>
        <h1 className={styles.title}>Rumeli Operasyon</h1>
        <p className={styles.subtitle}>Çalışan kodu ve PIN ile giriş yapın.</p>
        {isDemoModeEnabled && (
          <p className={styles.subtitle}>
            Demo: M001/2027 (yönetici), K001/2027 (kasiyer), D001/2027 (çalışan)
          </p>
        )}

        <form className={styles.form} onSubmit={handleSubmit}>
          <Input
            label="Çalışan Kodu"
            name="employeeCode"
            autoComplete="username"
            value={employeeCode}
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
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            required
          />
          <Button type="submit" size="lg" fullWidth>
            Giriş Yap
          </Button>
        </form>
      </Card>
    </div>
  )
}
