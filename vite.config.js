import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: '/Rumeli-iskelesi-yonetim/',
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
