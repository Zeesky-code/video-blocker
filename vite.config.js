import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'esm-src/content.js'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
        format: 'iife', // Immediately Invoked Function Expression for browser compatibility
        inlineDynamicImports: true, // Include Toastify CSS inline
        manualChunks: undefined,
      },
      external: [],
    },
    target: 'es2020',
    minify: false, // Keep readable for debugging
    sourcemap: true,
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
  plugins: [
    {
      name: 'copy-extension-assets',
      generateBundle() {
        // Copy manifest.json with options page configuration
        this.emitFile({
          type: 'asset',
          fileName: 'manifest.json',
          source: JSON.stringify({
            "manifest_version": 3,
            "name": "Twitter Video Blocker (Click-to-Block)",
            "version": "1.0.0",
            "description": "Control+Click videos on Twitter/X to fingerprint and block matching videos in your feed.",
            "permissions": ["storage", "activeTab"],
            "options_page": "options/options.html",
            "content_scripts": [
              {
                "matches": ["*://twitter.com/*", "*://x.com/*"],
                "js": ["content.js"],
                "css": ["toastify.css"]
              }
            ],
            "web_accessible_resources": [
              {
                "resources": ["options/*"],
                "matches": ["<all_urls>"]
              }
            ]
          }, null, 2)
        });

        // Copy options files
        const optionsDir = path.resolve(__dirname, 'options');

        if (fs.existsSync(optionsDir)) {
          const files = fs.readdirSync(optionsDir);

          files.forEach(file => {
            const filePath = path.join(optionsDir, file);
            const stats = fs.statSync(filePath);

            if (stats.isFile()) {
              const content = fs.readFileSync(filePath, 'utf8');
              this.emitFile({
                type: 'asset',
                fileName: `options/${file}`,
                source: content
              });
            }
          });
        }

        // Copy Toastify CSS
        const toastifyCssPath = path.resolve(__dirname, 'node_modules/toastify-js/src/toastify.css');
        if (fs.existsSync(toastifyCssPath)) {
          const cssContent = fs.readFileSync(toastifyCssPath, 'utf8');
          this.emitFile({
            type: 'asset',
            fileName: 'toastify.css',
            source: cssContent
          });
        }
      }
    }
  ],
});
