import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Drives the real Management hub in Preview demo mode (zero network). */
async function bootApp(path: string) {
  vi.resetModules()
  window.history.replaceState({}, '', path)
  const { App } = await import('../../App')
  return render(<App />)
}

beforeEach(() => {
  vi.stubEnv('VITE_DEMO_MODE', 'true')
  vi.stubEnv('VITE_SUPABASE_URL', 'https://demo-mode-must-not-call-this.invalid')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'not-a-real-key')
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network is forbidden in demo mode'))))
  sessionStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
vi.setConfig({ testTimeout: 30000 })

describe('Management hub copy matches what is actually built', () => {
  it('employees and roles are usable; they are not listed under "Yakında"; unfinished modules still are', async () => {
    await bootApp('/')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Çalışan Kodu'), 'M001')
    await user.type(screen.getByLabelText('PIN'), '2027')
    await user.click(screen.getByRole('button', { name: 'Giriş Yap' }))
    await user.click(await screen.findByRole('link', { name: /Yönetim/ }))

    const available = (await screen.findByRole('heading', { name: 'Kullanılabilir' })).closest('section')!
    expect(within(available).getByText('Çalışanlar')).toBeInTheDocument()
    expect(within(available).getByRole('link', { name: 'Çalışanları Yönet' })).toBeInTheDocument()

    const soon = screen.getByRole('heading', { name: 'Yakında' }).closest('section')!
    expect(within(soon).queryByText('Çalışanlar ve roller')).not.toBeInTheDocument()
    // not pretended complete
    expect(within(soon).getByText('Şubeler')).toBeInTheDocument()
    expect(within(soon).getByText('Puanlama ve rozetler')).toBeInTheDocument()
    expect(within(soon).getByText('Genel operasyon ayarları')).toBeInTheDocument()
  })
})
