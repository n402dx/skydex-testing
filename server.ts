import express from 'express';
import fs from 'fs';
import path from 'path';
import {createServer as createViteServer} from 'vite';
import {createApiRouter} from './server/api';

const envPort = Number(process.env.SKYDECK_PORT || process.env.PORT);
const PORT = Number.isFinite(envPort) && envPort > 0 && envPort !== 8080 ? envPort : 3000;

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter());

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {middlewareMode: true, hmr: false},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const idx = path.join(distDir, 'index.html');
      if (fs.existsSync(idx)) {
        res.sendFile(idx);
      } else {
        res.status(404).send('Build output not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SkyDeck server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
