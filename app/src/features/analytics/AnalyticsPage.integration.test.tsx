import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Drives the real Analytics page (router, providers, demo data layer + the
 * deterministic engine) in Preview demo mode. The fetch spy proves zero network.
 * The synthetic demo reports carry no transaction counts, piece counts or
 * weather, so those metrics must show their honest "no data" states.
 */
async function bootApp(path: string) {
  vi.resetModules()
  window.history.replaceState({}, '', path)
  const { App } = await import('../../App')
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

vi.setConfig({ testTimeout: 30000 })

describe('demo mode: Analytics page', () => {
  it('a manager opens analytics from the nav and sees the summary with honest missing-data states', async () => {
    await bootApp('/')
    const user = await login('M001')
    await user.click(await screen.findByRole('link', { name: /Analiz/ }))

    expect(await screen.findByRole('heading', { name: 'Analiz' })).toBeInTheDocument()
    expect(await screen.findByText('Yönetici özeti')).toBeInTheDocument()
    // freshness is shown for the snapshot
    expect(await screen.findByText('Güncel')).toBeInTheDocument()
    // the demo reports carry no transaction counts: never a fabricated 0
    expect((await screen.findAllByText('Veri yok')).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('radio', { name: 'Günlük' }))
    expect(await screen.findByText('Brüt ciro')).toBeInTheDocument()
    expect(screen.getByText(/Net kâr değildir/)).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Saatlik' }))
    expect(await screen.findByText('Saatlik satış analizi yapılamıyor')).toBeInTheDocument()
    expect(screen.getByText('Desteklenmiyor')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Hava' }))
    expect(await screen.findByText('Hava durumu verisi yok')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Haftalık' }))
    expect(await screen.findByText('Haftalık ciro')).toBeInTheDocument()
    expect(await screen.findByText(/AI yorumu henüz yok/)).toBeInTheDocument()

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('a manager can regenerate with a mandatory reason (audited, versioned)', async () => {
    await bootApp('/')
    const user = await login('M001')
    await user.click(await screen.findByRole('link', { name: /Analiz/ }))
    await screen.findByText('Yönetici özeti')

    await user.click(screen.getByRole('button', { name: 'Yeniden hesapla' }))
    await screen.findByLabelText(/Gerekçe/)
    const confirmButtons = screen.getAllByRole('button', { name: 'Yeniden hesapla' })
    // the confirm button stays disabled until a reason of at least 5 characters is typed
    expect(confirmButtons.at(-1)).toBeDisabled()
    await user.type(screen.getByLabelText(/Gerekçe/), 'kontrol amaçlı')
    expect(screen.getAllByRole('button', { name: 'Yeniden hesapla' }).at(-1)).toBeEnabled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('a cashier has no analytics: no nav entry and the manager route is denied', async () => {
    await bootApp('/')
    await login('K001')
    await screen.findByText(/Merhaba, Demo Kasiyer/)
    expect(screen.queryByRole('link', { name: /Analiz/ })).not.toBeInTheDocument()
    cleanup()

    await bootApp('/app/manager/analytics')
    expect(await screen.findByText('Erişim reddedildi')).toBeInTheDocument()
    expect(screen.queryByText('Yönetici özeti')).not.toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
