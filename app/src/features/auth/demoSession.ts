import { findDemoUser, type DemoUser } from './demoUsers'

/**
 * Where the Preview-only demo identity lives for the browser session.
 * "CODE:PIN" is stored together so a reload re-validates against the
 * synthetic demoUsers directory (findDemoUser) instead of trusting a bare,
 * unverified employee code read back from storage. Shared by AuthProvider
 * and the demo data layer (services/demo) so both always agree on who the
 * demo actor is. Never a network call, never a real credential.
 */
export const DEMO_STORAGE_KEY = 'v4-demo-employee-code'

export function readStoredDemoCredentials(): {
  employeeCode: string
  pin: string
} | null {
  if (typeof sessionStorage === 'undefined') return null
  const stored = sessionStorage.getItem(DEMO_STORAGE_KEY)
  if (!stored) return null
  const separatorIndex = stored.indexOf(':')
  if (separatorIndex === -1) return null
  return {
    employeeCode: stored.slice(0, separatorIndex),
    pin: stored.slice(separatorIndex + 1),
  }
}

export function storeDemoCredentials(user: DemoUser): void {
  sessionStorage.setItem(DEMO_STORAGE_KEY, `${user.employeeCode}:${user.pin}`)
}

export function clearStoredDemoCredentials(): void {
  sessionStorage.removeItem(DEMO_STORAGE_KEY)
}

/** The currently signed-in demo user, re-validated against the directory, or null. */
export function currentDemoUser(): DemoUser | null {
  const stored = readStoredDemoCredentials()
  if (!stored) return null
  return findDemoUser(stored.employeeCode, stored.pin) ?? null
}
