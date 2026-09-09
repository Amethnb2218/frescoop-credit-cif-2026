# Moteur de scoring technique v2

## Pourquoi les scores étaient tous à 25

L'ancien moteur calculait un score variable, puis appliquait `Math.min(score, 25)` dès qu'une règle bloquante était déclenchée. Les dossiers non éligibles finissaient donc presque tous à 25, quelles que soient leurs données.

La version 2 supprime ce plafond et sépare clairement deux notions :

- le **score technique** mesure la solidité documentée du dossier ;
- la **préqualification** applique les règles métier, dont certaines restent bloquantes.

## Calcul auditable

Le score brut est calculé sur 100 points :

| Dimension | Maximum | Principe |
| --- | ---: | --- |
| Identité | 15 | Identité du demandeur renseignée |
| Capacité | 35 | Ratio entre flux net mensuel et échéance estimée |
| Preuves | 30 | Couverture et qualité des preuves A, B, C et D |
| Risques | 20 | Capital initial diminué par les règles déclenchées |

Pondération des preuves : A = 1, B = 0,75, C = 0,4 et D = 0,1. Les pénalités de risque dépendent de la sévérité : faible = 3, moyenne = 5, élevée = 8 et critique = 20.

Une capacité non calculable reste `UNKNOWN`. Elle impose une revue humaine au lieu d'utiliser une valeur artificielle.

## Cohérence score-décision

Le score brut est projeté dans la tranche correspondant à la décision :

- `NON_ELIGIBLE` : 0 à 39, rouge ;
- `REVUE_REQUISE` : 40 à 70, orange ;
- `PREQUALIFIE` : 71 à 100, vert.

Cette projection conserve les différences entre dossiers d'une même catégorie sans permettre à un score vert de contredire une règle bloquante.

La décomposition est persistée dans `prequalification_score_details` avec : version, score brut, ratio de capacité, points par dimension, volume des preuves et pénalités appliquées.

## Migration des scores existants

Le moteur courant porte la version `2`. Au démarrage, le serveur sélectionne uniquement les dossiers déjà évalués dont la version est absente ou inférieure à 2, puis les recalcule avec le même service que l'API.

La migration est additive et idempotente :

- aucun dossier n'est supprimé ou recréé ;
- un score déjà en version 2 n'est pas retraité ;
- un dossier jamais évalué, dont le score est `NULL`, reste inchangé ;
- les écritures score, détail et évaluations sont regroupées dans un batch.

## Démonstration live

1. Ouvrir la liste des dossiers et montrer que les données synthétiques produisent des scores différents.
2. Ouvrir un dossier, puis l'onglet **Préqualification**.
3. Présenter les quatre dimensions, le ratio de capacité et les pénalités.
4. Déclencher **Évaluer les règles** après modification d'une preuve ou d'un cash-flow synthétique.
5. Montrer que le score évolue, tandis qu'une règle critique reste bloquante.
6. Couper temporairement le réseau pour montrer la saisie locale des preuves et la synchronisation différée déjà prévue par l'application.

Aucune donnée personnelle réelle ne doit être utilisée pendant la démonstration. Les profils fournis par le seed sont exclusivement des données de démonstration.

## Vérification locale

```bash
npm test
npm run build
```

Les tests couvrent notamment les seuils de capacité, les données absentes, la qualité des preuves, les pénalités, le déterminisme et la variation entre deux dossiers non éligibles.
