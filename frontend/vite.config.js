import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (mode === "production" && !env.VITE_API_BASE_URL) {
    throw new Error("Set VITE_API_BASE_URL to the hosted API URL before building the desktop app.");
  }
  return {
    plugins: [react()],
  };
})
