import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// StackBlitz WebContainers only expose the port they hand you, and they set
// PORT themselves. Locally we keep 12000; elsewhere we let Vite pick and fall
// back if the port is taken, so the preview never dies on a busy port.
const port = Number(process.env.PORT) || 12000;

export default defineConfig({
  plugins: [react()],
  server: { host: true, port, strictPort: false, allowedHosts: true },
  preview: { host: true, port, strictPort: false, allowedHosts: true },
  build: { target: 'es2022', assetsInlineLimit: 0 },
});
