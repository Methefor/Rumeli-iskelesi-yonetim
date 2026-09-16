import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('renders its label', () => {
    render(<Button>Kaydet</Button>)
    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeInTheDocument()
  })

  it('calls onClick when pressed', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Gönder</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Gönder' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('is disabled and non-interactive while loading', async () => {
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} loading>
        Gönder
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Gönder' })
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})
