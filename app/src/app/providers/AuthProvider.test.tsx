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
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
  unsubscribeMock: vi.fn(),
  fetchAuthorizationContextMock: vi.fn(),
  signOutMock: vi.fn(),
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

function Probe() {
  const { status, roles, branchIds, signOut } = useAuth()
  return (
    <div>
      <div data-testid="probe">
        {status}:{roles.join(',')}:{branchIds.join(',')}
      </div>
      <button onClick={() => void signOut()}>Çıkış Yap</button>
    </div>
  )
}

beforeEach(() => {
  getSessionMock.mockReset()
  onAuthStateChangeMock.mockReset().mockReturnValue({
    data: { subscription: { unsubscribe: unsubscribeMock } },
  })
  fetchAuthorizationContextMock.mockReset()
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
      expect(screen.getByTestId('probe')).toHaveTextContent('unauthenticated::'),
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
      expect(screen.getByTestId('probe')).toHaveTextContent('authenticated:cashier:b1'),
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
      expect(screen.getByTestId('probe')).toHaveTextContent('authenticated::'),
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
      expect(screen.getByTestId('probe')).toHaveTextContent('unauthenticated::'),
    )
    await userEvent.click(screen.getByText('Çıkış Yap'))
    expect(signOutMock).toHaveBeenCalledOnce()
  })
})
