# FresCoop — Copilote Crédit Agricole

**CIF DigiCoop-WA+ 2026 — Thématique 02 : Scoring Microcrédit**

> Le copilote offline-first de l'agent de crédit agricole. Il transforme des données dispersées et des preuves terrain en un dossier vérifiable, un cash-flow saisonnier et une recommandation explicable, puis transmet la décision à l'IMF.

## Principes produit

- **Score explicable** : FresCoop est un algorithme déterministe fondé sur des règles, des calculs et des seuils versionnés. À entrées et version identiques, le résultat est identique ; ce n'est pas un modèle de machine learning opaque.
- **Teranga comme signal, pas comme décideur** : Teranga enrichit l'estimation du rendement, le risque et le conseil agronomique. Il ne décide jamais seul. Son indisponibilité déclenche un repli local explicite, sans pénalité ni refus automatique.
- **Décision humaine** : le score technique et la préqualification aident le comité ; l'IMF prend et motive la décision finale.
- **Score progressif** : tant que le dossier est incomplet, le score est signalé comme provisoire et les données manquantes sont affichées. Après complétion et recalcul serveur, il devient définitif pour la version courante du dossier et des règles.
- **Faible connectivité** : le brouillon est conservé localement, les opérations sont mises en file hors ligne puis synchronisées sans doublon. Les appels IA sont exécutés côté serveur ; aucun modèle n'est installé sur le téléphone.

## Architecture

- **Frontend** : React 19 + Vite + React Router
- **Backend** : Node.js + Express + libSQL (Turso/SQLite)
- **Offline** : IndexedDB + file de synchronisation idempotente
- **IA agronomique** : appels Teranga côté serveur, avec moteur local FresCoop en repli
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

## Démonstration recommandée

1. Ouvrir un dossier incomplet : montrer le statut provisoire et les données manquantes.
2. Compléter une donnée structurante, puis recalculer : montrer le score définitif et sa décomposition en règles, calculs et seuils.
3. Comparer rendement déclaré, rendement Teranga et rendement retenu ; rappeler que ce signal ne décide jamais seul.
4. Simuler l'indisponibilité de Teranga : montrer le repli local sans pénalité automatique.
5. Passer hors ligne, enregistrer un brouillon, puis rétablir le réseau : montrer la file de synchronisation et le recalcul serveur.

Aucune donnée personnelle réelle ne doit être utilisée pendant la démonstration.

## Déploiement Render

```bash
npm run build
npm start
```

Variables d'environnement requises : voir `.env.example`

## Positionnement

FresCoop ne prête pas et ne décide pas à la place de l'IMF. La décision finale reste humaine et entièrement traçable.
