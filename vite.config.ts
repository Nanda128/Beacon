import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Raise the warning threshold to account for the heavier map-related bundles
    chunkSizeWarningLimit: 1200, // in kB
    rollupOptions: {
      output: {
        manualChunks: {
          // Keep map-related libraries in a dedicated vendor chunk
          maplibre: [
            'maplibre-gl',
            'react-map-gl/maplibre',
          ],
        },
      },
    },
  },
})
