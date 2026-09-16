import { useState, type FormEvent } from 'react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Card } from '../../../components/ui/Card'
import { StatusChip } from '../../../components/ui/StatusChip'
import { useToast } from '../../../hooks/useToast'
import styles from './LoginPage.module.css'

/**
 * Login UI shell only — NOT wired to Supabase. There is no pin-login Edge
 * Function deployed yet (see supabase/functions/pin-login, not deployed)
 * and no `profiles`/`pin_credentials` schema in production yet (see
 * supabase/migrations, not applied). Submitting shows an explicit
 * "not ready" state rather than pretending to authenticate — see
 * DECISIONS.md for why the legacy plaintext-PIN pattern was not ported
 * here as a stopgap.
 */
export function LoginPage() {
  const { showToast } = useToast()
  const [employeeCode, setEmployeeCode] = useState('')
  const [pin, setPin] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // TODO(Phase C completion): call the pin-login Edge Function once
    // deployed, then supabase.auth.setSession() with the returned tokens.
    showToast("Giriş backend'i henüz hazır değil (Faz C hazırlık aşaması).", 'warning')
  }

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        <StatusChip tone="info">Faz C — hazırlık</StatusChip>
        <h1 className={styles.title}>Rumeli Operasyon</h1>
        <p className={styles.subtitle}>Çalışan kodu ve PIN ile giriş yapın.</p>

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
