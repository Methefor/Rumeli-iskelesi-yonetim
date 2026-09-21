import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ProtectedRoute } from './ProtectedRoute'
import { useAuth } from '../../../hooks/useAuth'
import type { AuthContextValue, AuthStatus } from '../../providers/AuthContext'

vi.mock('../../../hooks/useAuth')
const mockedUseAuth = vi.mocked(useAuth)

function authValue(status: AuthStatus): AuthContextValue {
  return {
    status,
    session: null,
    user: null,
    roles: [],
    branchIds: [],
    signOut: vi.fn(),
    isDemo: false,
    profile: null,
    signInDemo: vi.fn(),
  }
}

function renderProtected(status: AuthStatus) {
  mockedUseAuth.mockReturnValue(authValue(status))
  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route path="/" element={<div>Login Page</div>} />
        <Route
          path="/protected"
          element={
            <ProtectedRoute>
              <div>Secret Content</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  it('shows a loading state while the session is being restored', () => {
    renderProtected('loading')
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument()
  })

  it('redirects to / when unauthenticated', () => {
    renderProtected('unauthenticated')
    expect(screen.getByText('Login Page')).toBeInTheDocument()
    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument()
  })

  it('renders children when authenticated', () => {
    renderProtected('authenticated')
    expect(screen.getByText('Secret Content')).toBeInTheDocument()
  })
})
