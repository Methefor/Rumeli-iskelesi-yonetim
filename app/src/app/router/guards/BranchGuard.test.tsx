import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BranchGuard } from './BranchGuard'
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

describe('BranchGuard', () => {
  it('shows loading state while session is being restored', () => {
    mockedUseAuth.mockReturnValue(authValue({ status: 'loading' }))
    render(
      <BranchGuard branchId="branch-1">
        <div>Branch Content</div>
      </BranchGuard>,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders children for a member of the branch', () => {
    mockedUseAuth.mockReturnValue(authValue({ branchIds: ['branch-1'] }))
    render(
      <BranchGuard branchId="branch-1">
        <div>Branch Content</div>
      </BranchGuard>,
    )
    expect(screen.getByText('Branch Content')).toBeInTheDocument()
  })

  it('shows Unauthorized for a non-member, non-org-wide user', () => {
    mockedUseAuth.mockReturnValue(
      authValue({ roles: ['cashier'], branchIds: ['branch-2'] }),
    )
    render(
      <BranchGuard branchId="branch-1">
        <div>Branch Content</div>
      </BranchGuard>,
    )
    expect(screen.queryByText('Branch Content')).not.toBeInTheDocument()
    expect(screen.getByText('Erişim reddedildi')).toBeInTheDocument()
  })

  it('grants access to an org-wide role regardless of branch membership', () => {
    mockedUseAuth.mockReturnValue(authValue({ roles: ['owner'], branchIds: [] }))
    render(
      <BranchGuard branchId="branch-1">
        <div>Branch Content</div>
      </BranchGuard>,
    )
    expect(screen.getByText('Branch Content')).toBeInTheDocument()
  })
})
