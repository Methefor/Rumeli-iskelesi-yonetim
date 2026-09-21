import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Drives the REAL app (router, providers, layouts, pages) in Preview demo
 * mode. The Supabase env values are dummies: demo mode must never use them,
 * which the fetch spy proves.
 */
async function bootApp(path: string) {
  vi.resetModules()
  window.history.replaceState({}, '', path)
  const { App } = await import('../App')
  return render(<App />)
}

async function login(code: string) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Çalışan Kodu'), code)
  await user.type(screen.getByLabelText('PIN'), '2027')
  await user.click(screen.getByRole('button', { name: 'Giriş Yap' }))
  return user
}

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.stubEnv('VITE_DEMO_MODE', 'true')
  vi.stubEnv('VITE_SUPABASE_URL', 'https://demo-mode-must-not-call-this.invalid')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'not-a-real-key')
  fetchSpy = vi.fn(() => Promise.reject(new Error('network is forbidden in demo mode')))
  vi.stubGlobal('fetch', fetchSpy)
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('demo mode — manager (M001)', () => {
  it('logs in, sees the operational overview and inventory, and can log out', async () => {
    await bootApp('/')
    const user = await login('M001')

    expect(
      await screen.findByRole('heading', { name: 'Genel Bakış' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Demo')).toBeInTheDocument()
    expect(screen.getByText(/sentetik örnek veri/i)).toBeInTheDocument()
    expect(await screen.findByText('Bugünkü ciro (X/Z)')).toBeInTheDocument()

    // Rumeli (M001's default branch) has no inventory tracking — an honest empty state.
    const nav = screen.getByRole('navigation', { name: 'Ana gezinme' })
    await user.click(within(nav).getByRole('link', { name: /Stok/ }))
    expect(await screen.findByText('Bu şubede stok takibi yok')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Şube seçimi'), 'İskele Dondurma')
    expect(await screen.findByText('Örnek Ürün A')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Maliyet' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Maliyet' }))
    expect(await screen.findByText(/geçmişi silinmez/i)).toBeInTheDocument()
    expect(
      (await screen.findAllByRole('button', { name: 'Yeni Maliyet Belirle' })).length,
    ).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Çıkış yap' }))
    expect(await screen.findByRole('button', { name: 'Giriş Yap' })).toBeInTheDocument()
    expect(sessionStorage.getItem('v4-demo-employee-code')).toBeNull()

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('a page refresh keeps the demo session', async () => {
    await bootApp('/')
    await login('M001')
    await screen.findByRole('heading', { name: 'Genel Bakış' })
    cleanup()

    await bootApp('/app/manager')
    expect(
      await screen.findByRole('heading', { name: 'Genel Bakış' }),
    ).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('demo mode — Dondurma employee (D001)', () => {
  it('sees stock and operational actions but no cost or gross profit UI', async () => {
    await bootApp('/')
    const user = await login('D001')

    expect(await screen.findByText(/Merhaba, Demo Çalışan/)).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Ana gezinme' })
    await user.click(await within(nav).findByRole('link', { name: /Stok/ }))

    expect(await screen.findByText('Örnek Ürün A')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Fire Kaydı' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Kapanış Sayımı' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Stok Girişi' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Maliyet' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Brüt Kâr' })).not.toBeInTheDocument()
    expect(screen.queryByText(/₺/)).not.toBeInTheDocument()

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('cannot reach manager-only routes (cost management)', async () => {
    await bootApp('/')
    await login('D001')
    await screen.findByText(/Merhaba, Demo Çalışan/)
    cleanup()

    await bootApp('/app/manager/inventory/costs')
    expect(await screen.findByText('Erişim reddedildi')).toBeInTheDocument()
    expect(screen.queryByText('Yeni Maliyet Belirle')).not.toBeInTheDocument()
  })
})

describe('demo mode — Rumeli cashier (K001)', () => {
  it('gets the Rumeli employee experience without a stock tab', async () => {
    await bootApp('/')
    await login('K001')

    expect(await screen.findByText(/Merhaba, Demo Kasiyer/)).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Ana gezinme' })
    expect(within(nav).getByRole('link', { name: /Vardiyam/ })).toBeInTheDocument()
    await waitFor(() =>
      expect(within(nav).queryByRole('link', { name: /Stok/ })).not.toBeInTheDocument(),
    )
    expect(screen.getAllByText(/Rumeli İskelesi/).length).toBeGreaterThan(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
