import { RouterProvider } from 'react-router-dom'
import { router } from './app/router/router'
import { ToastProvider } from './app/providers/ToastProvider'
import { AuthProvider } from './app/providers/AuthProvider'
import { PwaStatus } from './app/pwa/PwaStatus'

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <RouterProvider router={router} />
        <PwaStatus />
      </ToastProvider>
    </AuthProvider>
  )
}
