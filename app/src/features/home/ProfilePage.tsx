import { useNavigate } from 'react-router-dom'
import {
  Avatar,
  Button,
  Card,
  Note,
  PageHeader,
  Stack,
  StatusChip,
} from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useSelectedBranch } from '../../hooks/useSelectedBranch'
import { roleLabel } from '../../utils/roles'
import styles from './Profile.module.css'

/** Who is signed in, where, and with what role — plus a sign-out action. */
export function ProfilePage() {
  const { profile, roles, isDemo, signOut } = useAuth()
  const { branches, selectedBranch } = useSelectedBranch()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/', { replace: true })
  }

  const name = profile?.fullName ?? 'Kullanıcı'

  return (
    <Stack>
      <PageHeader title="Profil" />
      <Card>
        <div className={styles.identity}>
          <Avatar name={name} size="lg" />
          <div className={styles.text}>
            <strong className={styles.name}>{name}</strong>
            {profile?.employeeCode && (
              <span className={styles.muted}>Çalışan kodu: {profile.employeeCode}</span>
            )}
            <div className={styles.chips}>
              {roles.map((role) => (
                <StatusChip key={role} tone="info">
                  {roleLabel(role)}
                </StatusChip>
              ))}
              {isDemo && <StatusChip tone="warning">Demo</StatusChip>}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <Stack gap="sm">
          <div className={styles.label}>Şube</div>
          <div>
            {(branches.length > 0 ? branches : selectedBranch ? [selectedBranch] : [])
              .map((b) => b.name)
              .join(', ') || '—'}
          </div>
        </Stack>
      </Card>

      {isDemo && (
        <Note>Demo modundasınız: bu hesap ve ekrandaki tüm veriler sentetiktir.</Note>
      )}

      <Button
        variant="secondary"
        size="lg"
        fullWidth
        onClick={() => void handleSignOut()}
      >
        Çıkış Yap
      </Button>
    </Stack>
  )
}
