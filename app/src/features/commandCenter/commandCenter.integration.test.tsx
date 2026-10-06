import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Drives the Command Center in Preview demo mode with the synthetic QA fixture set (zero network). */
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
  await screen.findByRole('heading', { name: 'Rumeli Kontrol Merkezi' })
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

describe('Command Center (manager, demo mode, synthetic QA data)', () => {
  it('is ordered for a phone: today summary, attention, operations, weather, analytics, then performance', async () => {
    await bootApp('/')
    await loginAsManager()
    const headings = await screen.findAllByRole('heading', { level: 2 })
    const names = headings.map((h) => h.textContent ?? '')
    const idx = (re: RegExp) => names.findIndex((n) => re.test(n))
    expect(idx(/Dikkat gerekiyor/)).toBeGreaterThan(-1)
    expect(idx(/Dikkat gerekiyor/)).toBeLessThan(idx(/Operasyon$/))
    expect(idx(/Operasyon$/)).toBeLessThan(idx(/Hava durumu/))
    expect(idx(/Hava durumu/)).toBeLessThan(idx(/Analiz özeti/))
    expect(idx(/Analiz özeti/)).toBeLessThan(idx(/Performans/))
    // the today summary comes first (before the attention feed in the document)
    const today = screen.getByText(/^Bugün · \d{4}-\d{2}-\d{2}$/)
    const attention = screen.getByRole('heading', { name: 'Dikkat gerekiyor' })
    expect(today.compareDocumentPosition(attention) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('the today summary never adds X to finalized revenue and counts branch completeness', async () => {
    await bootApp('/')
    await loginAsManager()
    const region = (await screen.findByText(/^Bugün · \d{4}-\d{2}-\d{2}$/)).closest('section')!
    expect(within(region).getByText('Kesinleşmiş ciro (Z)')).toBeInTheDocument()
    expect(within(region).getByText(/Geçici X: .* kesinleşmiş ciroya dahil değil/)).toBeInTheDocument()
    expect(within(region).getByText(/şubenin Z raporu tamam/)).toBeInTheDocument()
    expect(within(region).getByText(/şube Z bekliyor/)).toBeInTheDocument()
  })

  it('the attention feed leads with the critical item and every item leads somewhere', async () => {
    await bootApp('/')
    await loginAsManager()
    const section = (await screen.findByRole('heading', { name: 'Dikkat gerekiyor' })).closest('section')!
    expect(await within(section).findByText('Mutabakat hatası')).toBeInTheDocument()
    expect(within(section).getByText('Kritik')).toBeInTheDocument()
    const first = within(section).getAllByRole('link', { name: 'Aç' })[0]!
    expect(first.getAttribute('href')).toBe('/app/manager/reports/reconciliation')
    expect(within(section).getAllByRole('link', { name: 'Aç' }).every((a) => a.getAttribute('href')?.startsWith('/app/manager/'))).toBe(true)
    // progressive disclosure: only the top items first
    expect(within(section).getAllByRole('link', { name: 'Aç' }).length).toBeLessThanOrEqual(5)
    expect(within(section).getByRole('button', { name: /Tümünü göster/ })).toBeInTheDocument()
  })

  it('weather: a fresh forecast is labelled as a forecast, a stale one says so, a branch without coordinates links to its location', async () => {
    await bootApp('/')
    const user = await loginAsManager()
    const weather = (await screen.findByRole('heading', { name: 'Hava durumu' })).closest('section')!
    expect(within(weather).getByText('Tahmin')).toBeInTheDocument()
    expect(within(weather).getByText('Güncel')).toBeInTheDocument()
    expect(within(weather).getByText(/yağış olasılığı %80/)).toBeInTheDocument()
    // the impact line is either the honest "not supported yet" or an evidence-gated RELATIONSHIP quote that says it is not causation
    expect(within(weather).getByText(/Geçmiş satışlara etkisi henüz desteklenmiyor|ilişkidir; neden-sonuç iddiası değildir/)).toBeInTheDocument()
    const select = within(weather).getByLabelText('Şube')
    await user.selectOptions(select, within(weather).getByRole('option', { name: 'İskele Dondurma' }))
    expect(await within(weather).findByText('Eski')).toBeInTheDocument()
    expect(within(weather).getByText(/Eski veri/)).toBeInTheDocument()
    await user.selectOptions(select, within(weather).getByRole('option', { name: 'Balık Ekmek' }))
    const link = await within(weather).findByRole('link', { name: 'Şube konumunu tanımla' })
    expect(link.getAttribute('href')).toBe('/app/manager/management/branch-location')
    expect(within(weather).queryByText(/°/)).not.toBeInTheDocument() // no fake temperature for an unavailable branch
  })

  it('the existing performance section still works below the command center', async () => {
    await bootApp('/')
    await loginAsManager()
    expect(await screen.findByText('Toplam Ciro')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Şube Karşılaştırması' })).toBeInTheDocument()
  })
})

describe('Command Center load cost (performance)', () => {
  it('opens with ONE batch dashboard-input request and ONE batch signals request, never per branch, and no analytics regeneration', async () => {
    vi.resetModules()
    window.history.replaceState({}, '', '/')
    const { demoApi } = await import('../../services/demo/api')
    const batchRaw = vi.spyOn(demoApi, 'fetchDashboardRaws')
    const batchSignals = vi.spyOn(demoApi, 'getCommandCenterSignals')
    const perBranchRaw = vi.spyOn(demoApi, 'fetchBranchDashboardRaw')
    const perBranchSignals = vi.spyOn(demoApi, 'getBranchOperationsSignals')
    const regenDaily = vi.spyOn(demoApi, 'regenerateDailyAnalytics')
    const regenWeekly = vi.spyOn(demoApi, 'regenerateWeeklyAnalytics')
    const { App } = await import('../../App')
    render(<App />)
    await loginAsManager()
    await screen.findByRole('heading', { name: 'Dikkat gerekiyor' })
    await screen.findByText('Toplam Ciro')
    // 3 branches in the synthetic set, and the default "Bugün" performance view reuses the same fetch
    expect(batchRaw).toHaveBeenCalledTimes(1)
    expect(batchSignals).toHaveBeenCalledTimes(1)
    expect(batchRaw.mock.calls[0]?.[0]).toHaveLength(3)
    expect(batchSignals.mock.calls[0]?.[0]).toHaveLength(3)
    expect(perBranchRaw).not.toHaveBeenCalled()
    expect(perBranchSignals).not.toHaveBeenCalled()
    expect(regenDaily).not.toHaveBeenCalled()
    expect(regenWeekly).not.toHaveBeenCalled()
  })
})
