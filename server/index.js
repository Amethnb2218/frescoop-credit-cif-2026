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
import memoRoutes from './routes/memo.js';
import productRoutes from './routes/products.js';
import visitRoutes from './routes/visits.js';
import consentRoutes from './routes/consent.js';
import fraudRoutes from './routes/fraud.js';
import exportRoutes from './routes/export.js';
import statsRoutes from './routes/stats.js';

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
app.use('/api/memo', memoRoutes);
app.use('/api/products', productRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/consent', consentRoutes);
app.use('/api/fraud', fraudRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/stats', statsRoutes);

const distPath = join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Route non trouvée' });
  res.sendFile(join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 4174;
const HOST = process.env.FRESCOOP_HOST || '0.0.0.0';

async function start() {
  await initDb();
  console.log('[FresCoop] Base de données initialisée');

  const { seedIfEmpty, ensureAdminAccounts } = await import('./seed.js');
  await seedIfEmpty();
  await ensureAdminAccounts();

  app.listen(PORT, HOST, () => {
    console.log(`[FresCoop] Serveur démarré sur http://${HOST}:${PORT}`);
  });
}

start().catch(err => {
  console.error('[FresCoop] Erreur au démarrage:', err);
  process.exit(1);
});
