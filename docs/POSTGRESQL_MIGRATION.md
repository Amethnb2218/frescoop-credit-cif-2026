# Migration Turso vers PostgreSQL

Ce guide décrit la bascule de FresCoop sans exposer les identifiants et avec Turso conservé comme solution de retour arrière.

## 1. Préparer PostgreSQL

1. Créer une base PostgreSQL managée dans la même région que le service Render.
2. Créer un utilisateur d'exécution dédié avec accès uniquement à cette base.
3. Récupérer l'URL TLS privée fournie par l'hébergeur et la stocker dans `DATABASE_URL` côté serveur uniquement.
4. Définir un `TOKEN_SECRET` long et aléatoire, ainsi que les mots de passe initiaux `DEMO_PWD`, `ADMIN_DEFAULT_PWD` et `JURY_PWD` si les comptes de démonstration sont utilisés.
5. Appliquer le schéma :

```bash
npm run db:migrate
```

Le serveur exécute aussi les migrations idempotentes avant le seed à chaque démarrage.

## 2. Contrôle à blanc

Sauvegarder Turso et empêcher temporairement les écritures applicatives. Définir ces variables uniquement dans un terminal sécurisé :

```text
TURSO_SOURCE_DATABASE_URL=<url-source>
TURSO_SOURCE_AUTH_TOKEN=<jeton-source>
DATABASE_URL=<url-postgresql-cible>
```

Ne jamais les committer, les placer dans Vite ou utiliser un préfixe `VITE_`.

Lancer le contrôle sans écriture :

```bash
npm run migrate:turso
```

Le script inspecte les 21 tables autorisées, vérifie la structure et la vacuité de la cible, simule le transfert complet par pages et par lots, contrôle les contraintes, les nombres de lignes et les relations, puis annule la transaction. Il n'affiche aucune URL ni aucun jeton.

## 3. Transfert

Vérifier que toutes les tables métier PostgreSQL sont vides, puis lancer :

```bash
npm run migrate:turso -- --apply
```

Le transfert :

- conserve tous les identifiants et relations ;
- convertit le contenu des pièces jointes vers `BYTEA` ;
- exclut `cashflow_entries.net_flow`, recalculé par PostgreSQL ;
- copie les tables dans l'ordre des dépendances ;
- copie les données par pages et effectue des insertions multi-lignes pour limiter la mémoire et les allers-retours ;
- compare les nombres de lignes et contrôle les principales clés étrangères ;
- effectue toutes les écritures dans une seule transaction et annule tout en cas d'erreur ;
- ne modifie jamais la base Turso source.

## 4. Bascule Render

Dans les variables du service Render :

- définir `DATABASE_URL` avec la chaîne privée TLS de la base ;
- conserver `TOKEN_SECRET`, `CORS_ORIGINS`, les variables Teranga et les mots de passe initiaux nécessaires ;
- utiliser `DATABASE_POOL_MAX=10`, `DATABASE_IDLE_TIMEOUT_MS=30000` et `DATABASE_CONNECT_TIMEOUT_MS=10000` comme valeurs de départ ;
- retirer les anciennes variables Turso du service après validation, mais conserver les identifiants dans un coffre pour le rollback.

Déployer la branche PostgreSQL, puis vérifier :

1. `GET /api/health` retourne `ok: true` ;
2. une connexion fonctionne ;
3. les dossiers et pièces jointes sont lisibles ;
4. une création et une synchronisation hors ligne fonctionnent ;
5. les écritures d'audit et les scores sont présents.

Si `TEST_DATABASE_URL` est disponible, l'utiliser pour une validation préalable contre un vrai serveur PostgreSQL isolé.

## 5. Retour arrière

En cas d'échec : arrêter les écritures, redéployer la dernière version Turso, restaurer ses variables serveur et vérifier que la sauvegarde/source n'a pas changé. Ne pas tenter de fusionner automatiquement les écritures effectuées après la bascule ; les exporter et les réconcilier explicitement avant une nouvelle tentative.
