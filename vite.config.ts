import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Rewrite the __SITE_URL__ token in emitted public assets (robots.txt,
 * sitemap.xml) with the build-time VITE_SITE_URL (falls back to the default
 * workers.dev subdomain). Public files aren't run through transformIndexHtml,
 * so we patch them after Vite writes the bundle.
 */
function injectSiteUrl() {
  const siteUrl = process.env.VITE_SITE_URL?.replace(/\/$/, '') || 'https://bh-address-finder.workers.dev';
  const outDir = path.resolve(__dirname, 'frontend-dist');
  return {
    name: 'inject-site-url',
    closeBundle() {
      for (const file of ['robots.txt', 'sitemap.xml']) {
        const p = path.join(outDir, file);
        try {
          const src = readFileSync(p, 'utf8');
          writeFileSync(p, src.replaceAll('__SITE_URL__', siteUrl));
        } catch { /* file not emitted — ignore */ }
      }
    },
  };
}

// Frontend dev config. In production the built frontend-dist/ is served by the
// Worker itself (Worker Static Assets), so /api and / are same-origin. During
// local dev we run Vite (this file) on one port and `wrangler dev` on another;
// this proxy forwards /api/* to the Worker so the page can call same-origin URLs.
export default defineConfig({
  root: path.resolve(__dirname, 'frontend'),
  plugins: [tailwindcss(), injectSiteUrl()],
  build: {
    outDir: path.resolve(__dirname, 'frontend-dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787', // wrangler dev default
        changeOrigin: true,
      },
    },
  },
});
