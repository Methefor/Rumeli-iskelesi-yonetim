import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { useAuth } from '../../hooks/useAuth'

const {
  getSessionMock,
  onAuthStateChangeMock,
  unsubscribeMock,
  fetchAuthorizationContextMock,
  signOutMock,
  demoModeState,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
  unsubscribeMock: vi.fn(),
  fetchAuthorizationContextMock: vi.fn(),
  signOutMock: vi.fn(),
  demoModeState: { enabled: false },
}))

vi.mock('../../services/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
    },
  },
}))

vi.mock('../../services/supabase/auth', () => ({
  fetchAuthorizationContext: fetchAuthorizationContextMock,
  signOut: signOutMock,
}))

vi.mock('../../services/supabase/env', () => ({
  get isDemoModeEnabled() {
    return demoModeState.enabled
  },
}))

function Probe() {
  const { status, roles, branchIds, signOut, isDemo, signInDemo } = useAuth()
  return (
    <div>
      <div data-testid="probe">
        {status}:{roles.join(',')}:{branchIds.join(',')}:{isDemo ? 'demo' : 'real'}
      </div>
      <button onClick={() => void signOut()}>Çıkış Yap</button>
      <button onClick={() => signInDemo('M001', '2027')}>Demo Manager Girişi</button>
      <button onClick={() => signInDemo('WRONG', '0000')}>Demo Yanlış Giriş</button>
    </div>
  )
}

beforeEach(() => {
  getSessionMock.mockReset()
  onAuthStateChangeMock.mockReset().mockReturnValue({
    data: { subscription: { unsubscribe: unsubscribeMock } },
  })
  fetchAuthorizationContextMock.mockReset()
  signOutMock.mockReset()
  demoModeState.enabled = false
  sessionStorage.clear()
})

describe('AuthProvider', () => {
  it('resolves to unauthenticated when there is no session', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveTextContent('unauthenticated:::real'),
    )
  })

  it('resolves to authenticated with roles/branches once a session exists', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    fetchAuthorizationContextMock.mockResolvedValue({
      roles: ['cashier'],
      branchIds: ['b1'],
    })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveTextContent('authenticated:cashier:b1:real'),
    )
  })

  it('degrades to empty roles/branches without crashing when authorization lookup fails', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    fetchAuthorizationContextMock.mockResolvedValue({ roles: [], branchIds: [] })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveTextContent('authenticated:::real'),
    )
  })

  it('calls the underlying signOut request when the exposed signOut is invoked', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveTextContent('unauthenticated:::real'),
    )
    await userEvent.click(screen.getByText('Çıkış Yap'))
    expect(signOutMock).toHaveBeenCalledOnce()
  })

  describe('demo mode', () => {
    it('signInDemo is a no-op returning null when demo mode is disabled', async () => {
      demoModeState.enabled = false
      getSessionMock.mockResolvedValue({ data: { session: null } })

      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )
      await waitFor(() =>
        expect(screen.getByTestId('probe')).toHaveTextContent('unauthenticated:::real'),
      )

      await userEvent.click(screen.getByText('Demo Manager Girişi'))
      // Still unauthenticated — demo mode is off, so the click did nothing.
      expect(screen.getByTestId('probe')).toHaveTextContent('unauthenticated:::real')
      expect(getSessionMock).toHaveBeenCalledTimes(1) // no extra Supabase call triggered
    })

    it('signs in as the demo manager (M001) with the correct role and branch, no Supabase call', async () => {
      demoModeState.enabled = true

      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )

      await userEvent.click(screen.getByText('Demo Manager Girişi'))

      await waitFor(() =>
        expect(screen.getByTestId('probe')).toHaveTextContent(
          'authenticated:manager:demo-branch-rumeli:demo',
        ),
      )
      expect(getSessionMock).not.toHaveBeenCalled()
      expect(fetchAuthorizationContextMock).not.toHaveBeenCalled()
    })

    it('rejects unknown demo credentials without changing auth state', async () => {
      demoModeState.enabled = true

      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )

      await userEvent.click(screen.getByText('Demo Yanlış Giriş'))
      expect(screen.getByTestId('probe')).toHaveTextContent('unauthenticated:::real')
    })

    it('restores a demo session on remount (refresh/navigation) without a Supabase call', async () => {
      demoModeState.enabled = true
      sessionStorage.setItem('v4-demo-employee-code', 'K001:2027')

      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )

      await waitFor(() =>
        expect(screen.getByTestId('probe')).toHaveTextContent(
          'authenticated:cashier:demo-branch-rumeli:demo',
        ),
      )
      expect(getSessionMock).not.toHaveBeenCalled()
    })

    it('signOut on a demo session clears it locally and never calls the real signOut request', async () => {
      demoModeState.enabled = true

      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )

      await userEvent.click(screen.getByText('Demo Manager Girişi'))
      await waitFor(() =>
        expect(screen.getByTestId('probe')).toHaveTextContent(
          'authenticated:manager:demo-branch-rumeli:demo',
        ),
      )

      await userEvent.click(screen.getByText('Çıkış Yap'))

      await waitFor(() =>
        expect(screen.getByTestId('probe')).toHaveTextContent('unauthenticated:::real'),
      )
      expect(signOutMock).not.toHaveBeenCalled()
      expect(sessionStorage.getItem('v4-demo-employee-code')).toBeNull()
    })
  })
})
