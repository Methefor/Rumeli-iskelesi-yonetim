import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PwaStatus } from './PwaStatus'

describe('PwaStatus', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: undefined,
    })
  })

  it('warns while offline and clears the warning when the connection returns', () => {
    render(<PwaStatus />)

    act(() => window.dispatchEvent(new Event('offline')))
    expect(screen.getByText('İnternet bağlantısı yok.')).toBeInTheDocument()
    expect(screen.getByText(/kayıt işlemleri.*kullanılamaz/i)).toBeInTheDocument()

    act(() => window.dispatchEvent(new Event('online')))
    expect(screen.queryByText('İnternet bağlantısı yok.')).not.toBeInTheDocument()
  })

  it('waits for the user before applying an available update', async () => {
    const user = userEvent.setup()
    const waitingWorker = { postMessage: vi.fn() }
    const registration = {
      waiting: waitingWorker,
      installing: null,
      update: vi.fn(async () => undefined),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    const serviceWorkerContainer = {
      controller: {},
      ready: Promise.resolve(registration),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: serviceWorkerContainer,
    })

    render(<PwaStatus />)

    await waitFor(() => {
      expect(screen.getByText('Uygulamanın yeni sürümü hazır.')).toBeInTheDocument()
    })
    expect(waitingWorker.postMessage).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Şimdi güncelle' }))
    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })
})
