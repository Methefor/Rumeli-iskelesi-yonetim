import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: '/Rumeli-iskelesi-yonetim/',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
      process.env.VITE_SUPABASE_URL || ''
    ),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(
      process.env.VITE_SUPABASE_ANON_KEY || ''
    ),
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin-dashboard.html'),
        cashier: resolve(__dirname, 'cashier-dashboard.html'),
        entry: resolve(__dirname, 'entry.html'),
      },
    },
  },
})
