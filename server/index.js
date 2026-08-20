import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDb } from './db.js';

import authRoutes from './routes/auth.js';
import dossierRoutes from './routes/dossiers.js';
import evidenceRoutes from './routes/evidence.js';
import cashflowRoutes from './routes/cashflow.js';
import rulesRoutes from './routes/rules.js';
import syncRoutes from './routes/sync.js';
import bicRoutes from './routes/bic.js';
import auditRoutes from './routes/audit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors({ origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : true }));
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, mode: process.env.NODE_ENV || 'development', version: '2.0.0', product: 'FresCoop CIF DigiCoop-WA+' });
});

app.use('/api/auth', authRoutes);
app.use('/api/dossiers', dossierRoutes);
app.use('/api/evidence', evidenceRoutes);
app.use('/api/cashflow', cashflowRoutes);
app.use('/api/rules', rulesRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/bic', bicRoutes);
app.use('/api/audit', auditRoutes);

const distPath = join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Route non trouvée' });
  res.sendFile(join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 4174;
const HOST = process.env.FRESCOOP_HOST || '127.0.0.1';

async function start() {
  await initDb();
  console.log('[FresCoop] Base de données initialisée');

  const { seedIfEmpty } = await import('./seed.js');
  await seedIfEmpty();

  app.listen(PORT, HOST, () => {
    console.log(`[FresCoop] Serveur démarré sur http://${HOST}:${PORT}`);
  });
}

start().catch(err => {
  console.error('[FresCoop] Erreur au démarrage:', err);
  process.exit(1);
});
