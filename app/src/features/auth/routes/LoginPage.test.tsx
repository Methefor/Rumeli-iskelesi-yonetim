import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthContextValue } from '../../../app/providers/AuthContext'
import { ToastProvider } from '../../../app/providers/ToastProvider'
import { LoginPage } from './LoginPage'

const { demo } = vi.hoisted(() => ({ demo: { enabled: false } }))
vi.mock('../../../services/supabase', () => ({
  get isDemoModeEnabled() {
    return demo.enabled
  },
}))

function auth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: 'unauthenticated',
    session: null,
    user: null,
    roles: [],
    branchIds: [],
    profile: null,
    isDemo: false,
    signOut: vi.fn(),
    signInDemo: vi.fn(),
    signInWithPin: vi.fn(),
    ...overrides,
  }
}

function renderLogin(value: AuthContextValue) {
  return render(
    <AuthContext.Provider value={value}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/app/manager" element={<div>MANAGER HOME</div>} />
            <Route path="/app/employee" element={<div>EMPLOYEE HOME</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </AuthContext.Provider>,
  )
}

async function fill(code: string, pin: string) {
  await userEvent.type(screen.getByLabelText('Çalışan Kodu'), code)
  await userEvent.type(screen.getByLabelText('PIN'), pin)
}

beforeEach(() => {
  demo.enabled = false
})

describe('LoginPage (real mode)', () => {
  it('submits code + PIN to signInWithPin and shows the loading state, blocking a double submit', async () => {
    let resolve: (v: { ok: true }) => void = () => {}
    const signInWithPin = vi.fn(
      () =>
        new Promise<{ ok: true }>((r) => {
          resolve = r
        }),
    )
    renderLogin(auth({ signInWithPin }))
    await fill('P001', '2027')

    const button = screen.getByRole('button', { name: /Giriş Yap/ })
    await userEvent.click(button)
    await userEvent.click(button)

    expect(signInWithPin).toHaveBeenCalledTimes(1)
    expect(signInWithPin).toHaveBeenCalledWith('P001', '2027')
    expect(screen.getByLabelText('Çalışan Kodu')).toBeDisabled()

    resolve({ ok: true })
    await waitFor(() => expect(screen.getByLabelText('Çalışan Kodu')).not.toBeDisabled())
  })

  it('shows the same generic message for every credential failure and clears the PIN', async () => {
    const signInWithPin = vi
      .fn()
      .mockResolvedValue({ ok: false, reason: 'invalid_credentials' })
    renderLogin(auth({ signInWithPin }))
    await fill('P001', '0000')
    await userEvent.click(screen.getByRole('button', { name: /Giriş Yap/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Çalışan kodu veya PIN hatalı.')
    expect(screen.getByLabelText('PIN')).toHaveValue('')
  })

  it('shows a separate message for network failures and for unexpected responses', async () => {
    const signInWithPin = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: 'network' })
      .mockResolvedValueOnce({ ok: false, reason: 'unexpected' })
    renderLogin(auth({ signInWithPin }))

    await fill('P001', '2027')
    await userEvent.click(screen.getByRole('button', { name: /Giriş Yap/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Bağlantı hatası')

    await userEvent.type(screen.getByLabelText('PIN'), '2027')
    await userEvent.click(screen.getByRole('button', { name: /Giriş Yap/ }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Giriş şu anda tamamlanamadı'),
    )
  })

  it('validates the form locally: no request for an empty code or a short PIN', async () => {
    const signInWithPin = vi.fn()
    renderLogin(auth({ signInWithPin }))
    await fill('P001', '12')
    await userEvent.click(screen.getByRole('button', { name: /Giriş Yap/ }))
    expect(signInWithPin).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Çalışan kodu veya PIN hatalı.')
  })

  it.each([
    [['manager'], 'MANAGER HOME'],
    [['branch_manager'], 'MANAGER HOME'],
    [['cashier'], 'EMPLOYEE HOME'],
    [['employee'], 'EMPLOYEE HOME'],
  ])('redirects an authenticated %j session to its role home', (roles, home) => {
    renderLogin(auth({ status: 'authenticated', roles }))
    expect(screen.getByText(home)).toBeInTheDocument()
  })

  it('never shows the old "not ready" message', async () => {
    renderLogin(auth({ signInWithPin: vi.fn().mockResolvedValue({ ok: true }) }))
    await fill('P001', '2027')
    await userEvent.click(screen.getByRole('button', { name: /Giriş Yap/ }))
    expect(screen.queryByText(/şu anda kullanılamıyor/)).not.toBeInTheDocument()
  })
})

describe('LoginPage (demo mode)', () => {
  it('uses the synthetic directory only and never calls the real login', async () => {
    demo.enabled = true
    const signInDemo = vi.fn()
    const signInWithPin = vi.fn()
    renderLogin(auth({ signInDemo, signInWithPin }))
    await fill('M001', '2027')
    await userEvent.click(screen.getByRole('button', { name: /Giriş Yap/ }))

    expect(signInDemo).toHaveBeenCalledWith('M001', '2027')
    expect(signInWithPin).not.toHaveBeenCalled()
    expect(await screen.findByText('MANAGER HOME')).toBeInTheDocument()
  })
})
