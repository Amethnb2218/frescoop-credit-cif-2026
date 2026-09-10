# FresCoop — Copilote Crédit Agricole

**CIF DigiCoop-WA+ 2026 — Thématique 02 : Scoring Microcrédit**

> Le copilote offline-first de l'agent de crédit agricole. Il transforme des données dispersées et des preuves terrain en un dossier vérifiable, un cash-flow saisonnier et une recommandation explicable, puis transmet la décision à l'IMF.

## Architecture

- **Frontend** : React 19 + Vite + React Router
- **Backend** : Node.js + Express + PostgreSQL
- **Offline** : IndexedDB + Sync Queue idempotente
- **Déploiement** : Render.com

## Modules P0

1. Authentification RBAC (Agent, Superviseur, Comité, Risk Manager, Admin, Auditeur)
2. Multi-tenant IMF
3. Dossier de crédit (workflow 10 étapes)
4. Evidence Ledger (niveaux A/B/C/D)
5. Cash-flow agricole saisonnier
6. Stress tests (5 scénarios)
7. Moteur de règles explicables
8. Préqualification (3 dimensions)
9. Risk & Integrity Flags
10. BIC (données simulées)
11. Mémo comité
12. Décision humaine + override
13. Audit log
14. Synchronisation offline

## Lancement (développement)

```bash
npm install
npm run dev
```

Le serveur API démarre sur http://localhost:4174
Le frontend Vite sur http://localhost:5173

## Comptes de démonstration

| Rôle | Email | Mot de passe |
|------|-------|-------------|
| Agent | agent@frescoop.demo | demo2026 |
| Superviseur | superviseur@frescoop.demo | demo2026 |
| Comité | comite@frescoop.demo | demo2026 |
| Risk Manager | risk@frescoop.demo | demo2026 |
| Auditeur | auditeur@frescoop.demo | demo2026 |
| Admin | admin@frescoop.demo | demo2026 |

## Données de démonstration

4 cas pré-configurés :
- **Cas A** (Awa Faye) : Bon dossier — preuves solides, cash-flow positif
- **Cas B** (Mamadou Cissé) : Thin file — peu d'historique, activité réelle
- **Cas C** (Abdoulaye Diop) : Risque — dette existante, incohérences
- **Cas D** (Ousmane Ndiaye) : Saisonnalité — revenus concentrés déc-fév

## Déploiement Render

```bash
npm run build
npm start
```

Variables d'environnement requises : voir `.env.example`.
Pour transférer une base Turso existante, suivre `docs/POSTGRESQL_MIGRATION.md`.

## Positionnement

FresCoop ne prête pas et ne décide pas à la place de l'IMF. La décision finale reste humaine et entièrement traçable.
