// frontend/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: "0.0.0.0", // This makes the Vite dev server accessible from network interfaces
    port: 5173, // Your frontend port. Ensure this matches your docker-compose.yml
    watch: {
      usePolling: true, // Sometimes needed for shared volumes on different OSes
    },
  },
})
