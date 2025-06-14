import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current directory.
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    // Use relative paths for assets in production, absolute in development
    base: mode === 'development' ? '/' : './',
    
    plugins: [react()],
    
    // Ensure Vite serves the SPA for all routes in development
    appType: 'spa',
    
    // Define global constants
    define: {
      'import.meta.env.VITE_APP_URL': JSON.stringify(env.VITE_APP_URL || 'https://sora-wafl.azurewebsites.net'),
      'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || '/api'),
    },
    
    // Development server configuration
    server: {
      port: 5173,
      strictPort: true,
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
