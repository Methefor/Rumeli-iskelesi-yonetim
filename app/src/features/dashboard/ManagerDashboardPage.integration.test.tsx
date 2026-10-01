import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Drives the real Manager Dashboard (router, providers, demo data layer) in
 * Preview demo mode — the fetch spy proves it is still zero-network, and the
 * assertions prove every card renders the honest missing/partial/not-
 * applicable state the seeded demo fixture is built to exercise (see
 * services/demo/store.ts: Rumeli has no inventory tracking at all; İskele
 * Dondurma has one uncosted item, so its gross profit is partial).
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

describe('demo mode: Manager Dashboard', () => {
  it('owner/manager sees the organization overview, both branches compared honestly, and can switch period — zero network', async () => {
    await bootApp('/')
    const user = await login('M001')

    expect(
      await screen.findByRole('heading', { name: 'Rumeli Kontrol Merkezi' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Toplam Ciro')).toBeInTheDocument()
    expect(screen.getAllByText('Gönderilen Rapor').length).toBeGreaterThan(0)
    expect(screen.getByText('Açık Mutabakat Sorunu')).toBeInTheDocument()

    // Branch comparison: both seeded branches appear, each with its own honest state.
    const comparison = (
      await screen.findByRole('heading', { name: 'Şube Karşılaştırması' })
    ).closest('section')!
    expect(within(comparison).getByText('Rumeli İskelesi')).toBeInTheDocument()
    expect(within(comparison).getByText('İskele Dondurma')).toBeInTheDocument()
    // Rumeli has no inventory tracking at all in the demo fixture.
    expect(screen.getAllByText('Stok takibi yok').length).toBeGreaterThan(0)

    // Operational efficiency section renders from the same aggregation, not ad hoc JSX math.
    expect(await screen.findByText('Operasyonel Verimlilik')).toBeInTheDocument()
    expect(screen.getByText('Vardiya Tamamlanma')).toBeInTheDocument()

    // The seeded sales/inventory fixture spans the last two days, not "today" —
    // switching the period re-triggers the (still network-free) load and now surfaces it.
    await user.click(screen.getByRole('radio', { name: 'Son 30 gün' }))
    expect(await screen.findByText('Toplam Ciro')).toBeInTheDocument()
    // Dondurma tracks inventory and has an uncosted item -> gross profit is disclosed as partial, never a fabricated full number.
    expect(await screen.findAllByText(/Kısmi/)).not.toHaveLength(0)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('selecting a branch in the comparison updates the branch detail drill-down', async () => {
    await bootApp('/')
    await login('M001')
    await screen.findByRole('heading', { name: 'Rumeli Kontrol Merkezi' })

    const comparison = (
      await screen.findByRole('heading', { name: 'Şube Karşılaştırması' })
    ).closest('section')!
    const dondurmaCard = within(comparison)
      .getByText('İskele Dondurma')
      .closest('button')!
    await userEvent.click(dondurmaCard)

    expect(
      await screen.findByRole('heading', { name: /Şube Detayı · İskele Dondurma/ }),
    ).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('cashier (K001) cannot reach the manager dashboard route', async () => {
    await bootApp('/')
    await login('K001')
    await screen.findByText(/Merhaba, Demo Kasiyer/)
    cleanup()

    await bootApp('/app/manager')
    expect(await screen.findByText('Erişim reddedildi')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Rumeli Kontrol Merkezi' }),
    ).not.toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('never renders a bare currency zero for an unavailable/not-applicable metric', async () => {
    await bootApp('/')
    const user = await login('M001')
    await screen.findByRole('heading', { name: 'Rumeli Kontrol Merkezi' })
    // The seeded sales/inventory data is in the last two days, not "today".
    await user.click(screen.getByRole('radio', { name: 'Son 30 gün' }))
    // The org-wide gross-profit card must disclose partiality via text, not silently show a complete-looking ₺ figure with no caveat.
    const overview = (await screen.findByText('CANLI OPERASYON ÖZETİ')).closest(
      'section',
    )!
    const grossProfitLabel = await within(overview).findAllByText(/^Brüt Kâr/)
    expect(grossProfitLabel[0]!.textContent).toMatch(/Kısmi/)
  })
})
