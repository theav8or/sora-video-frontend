// @ts-nocheck
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

// Get the directory name in ES module
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vite.dev/config/
export default defineConfig(() => ({
  base: './', // Use relative paths for assets
  plugins: [react()],
  // Ensure Vite serves the SPA for all routes in development
  appType: 'spa',
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    // Disable all source maps
    sourcemap: false,
    // Use esbuild for faster, minimal output
    minify: 'esbuild',
    // Disable CSS code splitting
    cssCodeSplit: false,
    // Don't report compressed size
    reportCompressedSize: false,
    // Disable chunk size warnings
    chunkSizeWarningLimit: 2000,
    // Disable brotli compression
    brotliSize: false,
    // Configure rollup for minimal output
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
      output: {
        // Single bundle with no hashing for simpler deployment
        entryFileNames: 'assets/main.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
        // Single bundle for all code
        manualChunks: () => 'main',
      },
    },
    // Aggressive optimizations
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
        passes: 2
      },
      format: {
        comments: false,
      },
      mangle: {
        toplevel: true,
      },
    },
  },
  define: {
    'process.env': {}
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
  esbuild: {
    jsxInject: `import React from 'react'`
  }
}))
