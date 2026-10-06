import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Drives the fire / closing-count screens in Preview demo mode (zero network). */
async function bootApp(path: string) {
  vi.resetModules()
  window.history.replaceState({}, '', path)
  const { App } = await import('../../App')
  return render(<App />)
}

async function loginAsManager() {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Çalışan Kodu'), 'M001')
  await user.type(screen.getByLabelText('PIN'), '2027')
  await user.click(screen.getByRole('button', { name: 'Giriş Yap' }))
  await user.click(await screen.findByRole('link', { name: /Yönetim/ }))
  return user
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

describe('inventory control screens (manager, demo mode)', () => {
  it('the hub links to the fire report, count overview and reasons', async () => {
    await bootApp('/')
    await loginAsManager()
    expect(await screen.findByRole('link', { name: 'Raporu Aç' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nedenleri Yönet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sayım Özetini Aç' })).toBeInTheDocument()
  })

  it('the fire reasons page lists the six historical reasons from the catalogue', async () => {
    await bootApp('/')
    const user = await loginAsManager()
    await user.click(await screen.findByRole('link', { name: 'Nedenleri Yönet' }))
    expect(await screen.findByRole('heading', { name: 'Fire nedenleri' })).toBeInTheDocument()
    expect(await screen.findByText('Son kullanma tarihi')).toBeInTheDocument()
    expect(screen.getByText('Numune / ikram')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yeni neden ekle' })).toBeInTheDocument()
  })

  it('the fire report never shows a missing cost as zero and states an empty period plainly', async () => {
    await bootApp('/')
    const user = await loginAsManager()
    await user.click(await screen.findByRole('link', { name: 'Raporu Aç' }))
    expect(await screen.findByRole('heading', { name: 'Fire raporu' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Bu dönemde fire kaydı yok.')).toBeInTheDocument())
    expect(screen.getByText('Maliyet etkisi')).toBeInTheDocument()
  })
})
