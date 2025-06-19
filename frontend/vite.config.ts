// frontend/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0", // This makes the Vite dev server accessible from network interfaces
    port: 5173, // Your frontend port. Ensure this matches your docker-compose.yml
    watch: {
      usePolling: true, // Sometimes needed for shared volumes on different OSes
    },
    proxy: {
      '/api': {
        target: 'http://backend:3001', // Your backend service name and port
        changeOrigin: true,
        // rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
