import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Drives the daily / weekly manager summaries in Preview demo mode with the synthetic QA fixture set (zero network). */
async function bootApp() {
  vi.resetModules()
  window.history.replaceState({}, '', '/')
  const { demoApi } = await import('../../services/demo/api')
  const spies = {
    reportInputs: vi.spyOn(demoApi, 'getManagerReportInputs'),
    dashboard: vi.spyOn(demoApi, 'fetchDashboardRaws'),
    signals: vi.spyOn(demoApi, 'getCommandCenterSignals'),
    regenDaily: vi.spyOn(demoApi, 'regenerateDailyAnalytics'),
    regenWeekly: vi.spyOn(demoApi, 'regenerateWeeklyAnalytics'),
    perBranch: vi.spyOn(demoApi, 'getBranchOperationsSignals'),
  }
  const { App } = await import('../../App')
  render(<App />)
  return spies
}

async function loginAs(code: string, waitFor_: () => Promise<unknown>) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Çalışan Kodu'), code)
  await user.type(screen.getByLabelText('PIN'), '2027')
  await user.click(screen.getByRole('button', { name: 'Giriş Yap' }))
  await waitFor_()
  return user
}
const asManager = () => loginAs('M001', () => screen.findByRole('heading', { name: 'Rumeli Kontrol Merkezi' }))

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
  vi.restoreAllMocks()
})
vi.setConfig({ testTimeout: 40000 })

const section = (code: string) => document.querySelector(`[data-section="${code}"]`) as HTMLElement | null
const isOpen = (code: string) => (section(code)?.querySelector('details') as HTMLDetailsElement | null)?.open

describe('Command Center entry points', () => {
  it('only links to the summaries; the Command Center itself does not depend on the narrative', async () => {
    const spies = await bootApp()
    await asManager()
    const daily = await screen.findByRole('link', { name: 'Günün yönetici özeti' })
    const weekly = screen.getByRole('link', { name: 'Haftalık özeti aç' })
    expect(daily.getAttribute('href')).toBe('/app/manager/reports/daily-summary')
    expect(weekly.getAttribute('href')).toBe('/app/manager/reports/weekly-summary')
    // opening the Command Center never builds a report
    expect(spies.reportInputs).not.toHaveBeenCalled()
  })
})

describe('daily manager summary page (manager, synthetic QA data)', () => {
  it('shows the headline, completeness, collapsible sections (the first two open), limitations and the evidence of each section', async () => {
    const spies = await bootApp()
    const user = await asManager()
    await user.click(await screen.findByRole('link', { name: 'Günün yönetici özeti' }))
    expect(await screen.findByRole('heading', { name: 'Günlük yönetici özeti' })).toBeInTheDocument()
    expect(await screen.findByText(/Kısmi veri|Veri tam/)).toBeInTheDocument()
    // narrative first: headline (h2) + sections; progressive disclosure (no wall of text)
    await waitFor(() => expect(section('result')).not.toBeNull())
    expect(isOpen('result')).toBe(true)
    expect(isOpen('attention')).toBe(true)
    expect(isOpen('inventory')).toBe(false)
    expect(isOpen('procurement')).toBe(false)
    expect(within(section('result')!).getAllByText(/kesinleşmiş ciro|kesinleşmedi/i).length).toBeGreaterThan(0)
    // the critical reconciliation error of the QA data is in the attention section, with a way to the details
    expect(within(section('attention')!).getAllByText(/Kritik/).length).toBeGreaterThan(0)
    expect(within(section('attention')!).getByRole('link', { name: 'Kontrol merkezini aç' }).getAttribute('href')).toBe('/app/manager')
    // evidence is available per section ("Dayanak") with labelled values
    expect(within(section('result')!).getByText(/Dayanak \(\d+\)/)).toBeInTheDocument()
    // limitations first-class and explained
    const limitations = section('limitations')!
    expect(within(limitations).getByText(/Sınırlamalar \(\d+\)/)).toBeInTheDocument()
    expect(limitations.textContent).toMatch(/Z raporu olmayan günlerin cirosu kesinleşmedi/)
    expect(screen.getByText(/yapay zekâ kullanılmadı/)).toBeInTheDocument()
    // requests: 3 (today) = one batch call each, no per-branch call, nothing regenerated
    expect(spies.reportInputs).toHaveBeenCalledTimes(1)
    expect(spies.dashboard.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(spies.perBranch).not.toHaveBeenCalled()
    expect(spies.regenDaily).not.toHaveBeenCalled()
    expect(spies.regenWeekly).not.toHaveBeenCalled()
  })

  it('X is never finalized revenue on the page', async () => {
    await bootApp()
    const user = await asManager()
    await user.click(await screen.findByRole('link', { name: 'Günün yönetici özeti' }))
    await waitFor(() => expect(section('result')).not.toBeNull())
    expect(section('result')!.textContent).toMatch(/Geçici \(yalnızca X\) ciro/)
    expect(section('result')!.textContent).toMatch(/kesinleşmiş ciroya eklenmedi/)
  })

  it('a past date is labelled, has no live attention/procurement, and can be reached with the date controls; next is disabled today', async () => {
    const spies = await bootApp()
    const user = await asManager()
    await user.click(await screen.findByRole('link', { name: 'Günün yönetici özeti' }))
    await waitFor(() => expect(section('result')).not.toBeNull())
    expect(screen.getByRole('button', { name: 'Sonraki gün' })).toBeDisabled()
    const callsBefore = spies.signals.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Önceki gün' }))
    expect(await screen.findByText('Geçmiş tarih')).toBeInTheDocument()
    await waitFor(() => expect(section('attention')?.textContent).toMatch(/yalnızca bugünün özetinde/))
    expect(section('procurement')!.textContent).toMatch(/yalnızca bugünün özetinde/)
    // a past date never shows today's forward-looking list
    expect(section('tomorrow')).toBeNull()
    expect(document.body.textContent).not.toMatch(/Yarın için takip/)
    expect(spies.signals.mock.calls.length).toBe(callsBefore) // no live signals for a past date
    expect(screen.getByRole('button', { name: 'Sonraki gün' })).toBeEnabled()
  })

  it('shows a retryable error state when the read model fails (no half-built report)', async () => {
    const spies = await bootApp()
    const user = await asManager()
    spies.reportInputs.mockRejectedValueOnce(new Error('Bağlantı hatası, lütfen tekrar deneyin.'))
    await user.click(await screen.findByRole('link', { name: 'Günün yönetici özeti' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Bağlantı hatası/)
    await user.click(within(alert).getByRole('button', { name: 'Tekrar Dene' }))
    await waitFor(() => expect(section('result')).not.toBeNull())
  })

  it('shows a loading skeleton first', async () => {
    const spies = await bootApp()
    const user = await asManager()
    spies.reportInputs.mockImplementationOnce(async (ids) => {
      await new Promise((r) => setTimeout(r, 400))
      return Object.fromEntries(ids.map((id) => [id, null]))
    })
    await user.click(await screen.findByRole('link', { name: 'Günün yönetici özeti' }))
    expect(await screen.findByLabelText('Yükleniyor')).toBeInTheDocument()
    // every branch unreadable: the page says so (limitation) and does not turn it into a reassuring report
    await waitFor(() => expect(section('limitations')).not.toBeNull())
    expect(section('limitations')!.textContent).toMatch(/okunamadı/)
    expect(screen.getAllByText(/ciro yorumu yapılmadı|henüz rapor yok/i).length).toBeGreaterThan(0)
  })

  it('a cashier lands on the employee area and is not offered the manager summaries', async () => {
    await bootApp()
    await loginAs('K001', async () => {
      await waitFor(() => expect(window.location.pathname).toMatch(/^\/app\/employee/))
    })
    expect(screen.queryByRole('link', { name: 'Günün yönetici özeti' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Haftalık özeti aç' })).not.toBeInTheDocument()
  })
})

describe('weekly manager summary page (manager, synthetic QA data)', () => {
  it('opens on the current week as IN PROGRESS, never as a final week, with the 9 weekly sections available', async () => {
    const spies = await bootApp()
    const user = await asManager()
    await user.click(await screen.findByRole('link', { name: 'Haftalık özeti aç' }))
    expect(await screen.findByRole('heading', { name: 'Haftalık yönetici özeti' })).toBeInTheDocument()
    expect(await screen.findByText('Hafta sürüyor')).toBeInTheDocument()
    await waitFor(() => expect(section('summary')).not.toBeNull())
    for (const code of ['summary', 'performance', 'issues', 'inventory', 'procurement', 'weather', 'quality']) expect(section(code), code).not.toBeNull()
    expect(screen.getByText(/hafta henüz bitmedi, kesin hafta sonucu değildir/)).toBeInTheDocument() // the summary lives in the hero; the section only holds what the hero does not repeat
    expect(section('summary')!.textContent).toMatch(/Geçici \(yalnızca X\) ciro/)
    expect(isOpen('summary')).toBe(true)
    expect(isOpen('quality')).toBe(false)
    expect(spies.reportInputs).toHaveBeenCalledTimes(1)
    expect(spies.regenWeekly).not.toHaveBeenCalled()
  })

  it('moves to the previous complete week, which carries the planned repeated-issue facts; "Bu haftaya dön" returns', async () => {
    await bootApp()
    const user = await asManager()
    await user.click(await screen.findByRole('link', { name: 'Haftalık özeti aç' }))
    await screen.findByText('Hafta sürüyor')
    expect(screen.getByRole('button', { name: 'Sonraki hafta' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Önceki hafta' }))
    await waitFor(() => expect(screen.queryByText('Hafta sürüyor')).not.toBeInTheDocument())
    await waitFor(() => expect(section('issues')?.textContent).toMatch(/Z raporu eksikliği bu hafta 3 gün görüldü/))
    expect(section('issues')!.textContent).toMatch(/mutabakat uyarısı bu hafta \d+ gün görüldü/)
    // the limits of the data are explained, with the frequency wording only (no invented "recurring" label)
    expect(section('issues')!.textContent).not.toMatch(/sürekli|tekrarlayan sorun/)
    // a completed historical week never shows today's procurement / forecast / follow-up from live state
    expect(section('procurement')!.textContent).toMatch(/geçmiş haftalar için saklanmadığından/)
    expect(section('procurement')!.textContent).not.toMatch(/\d+ (siparişin teslim tarihi geçti|sipariş onay bekliyor)/)
    await user.click(screen.getByRole('button', { name: 'Bu haftaya dön' }))
    expect(await screen.findByText('Hafta sürüyor')).toBeInTheDocument()
  })
})
