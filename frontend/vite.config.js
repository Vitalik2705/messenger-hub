import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 5173 sits inside a TCP range Hyper-V reserves on this machine, where bind fails with
    // EACCES while netstat still reports the port free. 5273 is outside every reserved block.
    port: 5273,
    // Fail loudly instead of silently moving to the next free port: the backend only trusts
    // one origin for CORS, so a shifted port breaks every request rather than the page.
    strictPort: true,
  },
})
