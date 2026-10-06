import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Drives the procurement screens in Preview demo mode with the synthetic QA fixture set (zero network). */
async function bootApp(path: string) {
  vi.resetModules()
  window.history.replaceState({}, '', path)
  const { App } = await import('../../App')
  return render(<App />)
}

async function openProcurement() {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Çalışan Kodu'), 'M001')
  await user.type(screen.getByLabelText('PIN'), '2027')
  await user.click(screen.getByRole('button', { name: 'Giriş Yap' }))
  await user.click(await screen.findByRole('link', { name: /Yönetim/ }))
  await user.click(await screen.findByRole('link', { name: 'Tedariki Aç' }))
  return user
}

beforeEach(() => {
  vi.stubEnv('VITE_DEMO_MODE', 'true')
  vi.stubEnv('VITE_DEMO_FIXTURES', 'qa')
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
vi.setConfig({ testTimeout: 40000 })

describe('procurement screens (manager, demo mode)', () => {
  it('the hub opens the procurement home with attention cards and the suggestion note', async () => {
    await bootApp('/')
    await openProcurement()
    expect(await screen.findByRole('heading', { name: 'Tedarik ve siparişler' })).toBeInTheDocument()
    expect(await screen.findByText('Onay bekleyen')).toBeInTheDocument()
    expect(screen.getByText('Teslimatı geciken')).toBeInTheDocument()
    expect(screen.getByText(/Satış hızı ve hava durumu kullanılmaz/)).toBeInTheDocument()
  })

  it('the supplier page lists the three synthetic suppliers including the inactive one', async () => {
    await bootApp('/')
    const user = await openProcurement()
    await user.click(await screen.findByRole('link', { name: 'Tedarikçiler' }))
    expect(await screen.findByRole('heading', { name: 'Tedarikçiler' })).toBeInTheDocument()
    expect(await screen.findByText('Sentetik Firma A')).toBeInTheDocument()
    expect(screen.getByText('Sentetik Merkez Depo')).toBeInTheDocument()
    expect(screen.getByText('Sentetik Pasif Firma')).toBeInTheDocument()
    expect(screen.getByText('Pasif')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yeni tedarikçi ekle' })).toBeInTheDocument()
  })

  it('the supply settings page says "not configured" instead of inventing values', async () => {
    await bootApp('/')
    const user = await openProcurement()
    await user.click(await screen.findByRole('link', { name: 'Tedarik ayarları' }))
    expect(await screen.findByRole('heading', { name: 'Tedarik ayarları' })).toBeInTheDocument()
    expect((await screen.findAllByText('Tedarikçi tanımlı değil')).length).toBeGreaterThan(0)
  })

  it('the new order page offers only active suppliers', async () => {
    await bootApp('/')
    const user = await openProcurement()
    await user.click(await screen.findByRole('link', { name: 'Yeni sipariş' }))
    expect(await screen.findByRole('heading', { name: 'Yeni sipariş' })).toBeInTheDocument()
    const select = await screen.findByLabelText('Tedarikçi')
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent)
    expect(options).toContain('Sentetik Firma A')
    expect(options).not.toContain('Sentetik Pasif Firma')
  })
})
