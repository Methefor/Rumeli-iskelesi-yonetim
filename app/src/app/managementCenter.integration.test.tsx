import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Drives the REAL app in Preview demo mode through the Management Center.
 * The fetch spy proves demo mode never talks to Supabase or the Edge Function.
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

async function openManagement(user: ReturnType<typeof userEvent.setup>, linkName: string | RegExp) {
  const nav = await screen.findByRole('navigation', { name: 'Ana gezinme' })
  await user.click(within(nav).getByRole('link', { name: /Yönetim/ }))
  await user.click(await screen.findByRole('link', { name: linkName }))
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

describe('demo mode: Management Center', () => {
  it('manager: search, filter, deactivate with a mandatory reason, see it audited — zero network', async () => {
    await bootApp('/')
    const user = await login('M001')
    await openManagement(user, 'Çalışanları Yönet')

    expect(await screen.findByRole('heading', { name: 'Çalışanlar' })).toBeInTheDocument()
    expect(await screen.findByText('D001 — Demo Çalışan')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Yeni Çalışan' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Ara'), 'K002')
    expect(await screen.findByText('K002 — Demo Kasiyer 2')).toBeInTheDocument()
    expect(screen.queryByText('D001 — Demo Çalışan')).not.toBeInTheDocument()
    await user.clear(screen.getByLabelText('Ara'))

    await user.selectOptions(screen.getByLabelText('Rol'), 'employee')
    expect(await screen.findByText('D001 — Demo Çalışan')).toBeInTheDocument()
    expect(screen.queryByText('K002 — Demo Kasiyer 2')).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('Ara'))
    await user.type(screen.getByLabelText('Ara'), 'D001')
    await user.click(await screen.findByRole('link', { name: 'Detay' }))
    expect(await screen.findByRole('heading', { name: 'D001 — Demo Çalışan' })).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'Pasifleştir' }))
    const confirm = await screen.findByRole('button', { name: 'Onayla' })
    expect(confirm).toBeDisabled()
    await user.type(screen.getByLabelText('Gerekçe (zorunlu)'), 'işten ayrıldı')
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(await screen.findByRole('button', { name: 'Aktifleştir' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /Yönetim/ }))
    await user.click((await screen.findAllByRole('link', { name: 'Denetimi Aç' }))[0]!)
    expect(await screen.findByText('Çalışan pasifleştirildi')).toBeInTheDocument()
    expect(screen.getByText(/Gerekçe: işten ayrıldı/)).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('PIN reset asks for the PIN and a reason and never shows the PIN afterwards', async () => {
    await bootApp('/')
    const user = await login('M001')
    await openManagement(user, 'Çalışanları Yönet')
    await user.type(await screen.findByLabelText('Ara'), 'D002')
    await user.click(await screen.findByRole('link', { name: 'Detay' }))
    await user.click(await screen.findByRole('button', { name: 'PIN Sıfırla' }))
    const confirm = await screen.findByRole('button', { name: 'Onayla' })
    await user.type(screen.getByLabelText('Yeni PIN'), '8642')
    await user.type(screen.getByLabelText('Gerekçe (zorunlu)'), 'unuttu')
    await user.click(confirm)
    await waitFor(() => expect(screen.queryByLabelText('Yeni PIN')).not.toBeInTheDocument())
    expect(document.body.textContent).not.toContain('8642')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('manager cannot manage an owner or another manager: no action buttons are offered', async () => {
    await bootApp('/')
    const user = await login('M001')
    await openManagement(user, 'Çalışanları Yönet')
    await screen.findByText('O001 — Demo Sahip')
    const links = await screen.findAllByRole('link', { name: 'Detay' })
    // first cards are ordered by list order: owner is first in the seed
    await user.click(links[0]!)
    expect(await screen.findByText(/işlem yetkiniz yok/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'PIN Sıfırla' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pasifleştir' })).not.toBeInTheDocument()
  })

  it('creating an employee needs a reason and lands in the demo store only', async () => {
    await bootApp('/')
    const user = await login('M001')
    await openManagement(user, 'Çalışanları Yönet')
    await user.click(await screen.findByRole('link', { name: 'Yeni Çalışan' }))
    await user.type(await screen.findByLabelText('Çalışan kodu'), 'k777')
    await user.type(screen.getByLabelText('Ad soyad'), 'Deneme Kişi')
    await user.type(screen.getByLabelText('Geçici PIN'), '5555')
    await user.selectOptions(screen.getByLabelText('Rol'), 'cashier')
    await user.click(await screen.findByLabelText('İskele Dondurma'))
    await user.click(screen.getByRole('button', { name: 'Devam' }))
    const create = await screen.findByRole('button', { name: 'Oluştur' })
    expect(create).toBeDisabled()
    await user.type(screen.getByLabelText('Gerekçe (zorunlu)'), 'yeni işe alım')
    await user.click(create)
    expect(await screen.findByText('Deneme Kişi')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('5555')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('cashier (K001) cannot reach the Management Center', async () => {
    await bootApp('/')
    await login('K001')
    expect(await screen.findByRole('heading', { name: /Merhaba/ })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Ana gezinme' })
    expect(within(nav).queryByRole('link', { name: /Yönetim/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Yeni Çalışan' })).not.toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('settings: manager edits a threshold with a reason; validation blocks warning > error', async () => {
    await bootApp('/')
    const user = await login('M001')
    await openManagement(user, 'Ayarları Aç')
    await user.click(await screen.findByRole('button', { name: 'Eşikleri Düzenle' }))
    const warning = await screen.findByLabelText('Uyarı eşiği (%)')
    await user.clear(warning)
    await user.type(warning, '9')
    await user.type(screen.getByLabelText('Gerekçe (zorunlu)'), 'sezon')
    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeDisabled()
    await user.clear(warning)
    await user.type(warning, '3')
    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeEnabled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('demo mode: data quality view', () => {
  it('manager sees the summary with every demo value labelled as test data — zero network', async () => {
    await bootApp('/')
    const user = await login('M001')
    await openManagement(user, 'Özeti Aç')
    expect(await screen.findByRole('heading', { name: 'Veri kalitesi' })).toBeInTheDocument()
    expect(await screen.findByText(/Doğrulanmış 0/)).toBeInTheDocument()
    expect(screen.getByText(/Bilinmeyen 0/)).toBeInTheDocument()
    expect(screen.getByText(/yalnızca test\/örnek veridir/)).toBeInTheDocument()
    expect(screen.queryByText('Doğrulanmış', { selector: 'span' })).not.toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('cashier cannot open the data-quality route directly', async () => {
    await bootApp('/')
    await login('K001')
    await screen.findByRole('heading', { name: /Merhaba/ })
    window.history.pushState({}, '', '/app/manager/management/data-quality')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Veri kalitesi' })).not.toBeInTheDocument())
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
