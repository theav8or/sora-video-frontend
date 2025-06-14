import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// Get the directory name in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
      'process.env': {}
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
    
    // Build configuration
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      emptyOutDir: true,
      sourcemap: false, // Disable source maps
      minify: 'esbuild', // Use esbuild for faster, minimal output
      cssCodeSplit: false, // Disable CSS code splitting
      reportCompressedSize: false, // Don't report compressed size
      chunkSizeWarningLimit: 2000, // Increase chunk size warning limit
      brotliSize: false, // Disable brotli compression
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
        },
        output: {
          entryFileNames: 'assets/main.js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name][extname]',
          manualChunks: () => 'main', // Single bundle for all code
        },
      },
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
    
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
    
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom'],
    },
    
    esbuild: {
      jsxInject: `import React from 'react'`
    }
  };
});
