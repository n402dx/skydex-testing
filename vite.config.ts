import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';
import {viteSingleFile} from 'vite-plugin-singlefile';

export default defineConfig(() => {
  const rootDir = import.meta.dirname;

  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      viteSingleFile(),
      {
        name: 'skydeck-vite-entry-swap',
        transformIndexHtml: {
          order: 'pre',
          handler(html: string): string {
            return html.replace(
              /<!-- SKYDECK_STATIC_RUNTIME_START -->[\s\S]*?<!-- SKYDECK_STATIC_RUNTIME_END -->/,
              '<script type="module" src="/src/main.tsx"></script>',
            );
          },
        },
      },
      {
        name: 'skydeck-dev-hmr-guard',
        apply: 'serve',
        transform(code: string, id: string) {
          if (id.includes('vite/dist/client/client.mjs') || id.endsWith('/@vite/client')) {
            const patched = code
              .replace(/else throw new SendBeforeConnectError\("send was called before connect"\);?/g, 'else return;')
              .replace(/transport\.connect\(createHMRHandler\(handleMessage\)\);?/g, '/* hmr disabled */')
              .replace(/setupForwardConsoleHandler\(transport,\s*forwardConsole\);?/g, '/* console forward disabled */');
            if (patched !== code) {
              return {code: patched, map: null};
            }
          }
          return null;
        },
      },
      {
        name: 'skydeck-static-dist-cleanup',
        apply: 'build',
        closeBundle: {
          order: 'post',
          handler(error?: Error): void {
            if (error) return;
            const distDir = path.resolve(rootDir, 'dist');
            if (fs.existsSync(distDir)) {
              fs.writeFileSync(path.join(distDir, '.nojekyll'), '');
            }
          },
        },
      },
    ],
    build: {
      assetsInlineLimit: 100000000,
      cssCodeSplit: false,
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(rootDir, '.'),
      },
    },
    server: {
      hmr: false,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
