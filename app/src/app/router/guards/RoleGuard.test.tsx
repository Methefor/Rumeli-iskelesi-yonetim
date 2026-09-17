import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RoleGuard } from './RoleGuard'
import { useAuth } from '../../../hooks/useAuth'
import type { AuthContextValue } from '../../providers/AuthContext'

vi.mock('../../../hooks/useAuth')
const mockedUseAuth = vi.mocked(useAuth)

function authValue(overrides: Partial<AuthContextValue>): AuthContextValue {
  return {
    status: 'authenticated',
    session: null,
    user: null,
    roles: [],
    branchIds: [],
    signOut: vi.fn(),
    isDemo: false,
    signInDemo: vi.fn(),
    ...overrides,
  }
}

describe('RoleGuard', () => {
  it('shows loading state while session is being restored', () => {
    mockedUseAuth.mockReturnValue(authValue({ status: 'loading' }))
    render(
      <RoleGuard allow={['owner']}>
        <div>Manager Area</div>
      </RoleGuard>,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders children when the user has an allowed role', () => {
    mockedUseAuth.mockReturnValue(authValue({ roles: ['manager'] }))
    render(
      <RoleGuard allow={['owner', 'manager']}>
        <div>Manager Area</div>
      </RoleGuard>,
    )
    expect(screen.getByText('Manager Area')).toBeInTheDocument()
  })

  it('shows Unauthorized when the user has no allowed role', () => {
    mockedUseAuth.mockReturnValue(authValue({ roles: ['cashier'] }))
    render(
      <RoleGuard allow={['owner', 'manager']}>
        <div>Manager Area</div>
      </RoleGuard>,
    )
    expect(screen.queryByText('Manager Area')).not.toBeInTheDocument()
    expect(screen.getByText('Erişim reddedildi')).toBeInTheDocument()
  })

  it('shows Unauthorized when roles are empty (e.g. Phase D schema not applied yet)', () => {
    mockedUseAuth.mockReturnValue(authValue({ roles: [] }))
    render(
      <RoleGuard allow={['owner', 'manager']}>
        <div>Manager Area</div>
      </RoleGuard>,
    )
    expect(screen.getByText('Erişim reddedildi')).toBeInTheDocument()
  })
})
