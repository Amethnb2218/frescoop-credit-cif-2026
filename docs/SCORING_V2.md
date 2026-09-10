# Moteur de scoring technique v3

## Pourquoi les scores étaient tous à 25

L'ancien moteur calculait un score variable, puis appliquait `Math.min(score, 25)` dès qu'une règle bloquante était déclenchée. Les dossiers non éligibles finissaient donc presque tous à 25, quelles que soient leurs données.

La version 3 supprime ce plafond et sépare clairement deux notions :

- le **score technique** mesure la solidité documentée du dossier ;
- la **préqualification** applique les règles métier, dont certaines restent bloquantes.

Un score élevé ne remplace donc jamais une règle critique ni la décision humaine du comité.

## Conditions nécessaires au calcul

Aucun score numérique n'est produit tant que les données indispensables ne sont pas présentes :

- identité du demandeur et numéro d'identification ;
- secteur Agriculture et activité renseignée ;
- montant demandé et durée strictement positifs ;
- flux de trésorerie comprenant au moins un mois de revenus ;
- projet agricole avec culture, surface, rendement et prix ;
- au moins un intrant ou une charge avec un coût positif.

Dans le cas contraire, le score reste `NULL` et le détail indique `INSUFFICIENT_DATA`. Cette règle évite d'afficher un faux score faible pour un dossier simplement incomplet.

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

La préqualification reste déterminée séparément :

- `NON_ELIGIBLE` lorsqu'une règle bloquante est déclenchée ;
- `REVUE_REQUISE` lorsqu'une vérification est nécessaire, que les preuves sont faibles ou que la capacité n'est pas suffisante ;
- `PREQUALIFIE` lorsque les règles, la capacité et les preuves sont satisfaisantes.

Le score conserve les différences entre dossiers ayant une même décision métier. La décomposition est persistée dans `prequalification_score_details` avec la version, le score brut, les ratios de capacité, les points par dimension, le volume des preuves et les pénalités appliquées.

## Migration des scores existants

Le moteur courant porte la version `3`. Au démarrage, le serveur sélectionne les dossiers dont le score est `NULL` ou dont la version est absente ou inférieure à 3, puis les réévalue avec le même service que l'API.

La migration est additive et idempotente :

- aucun dossier n'est supprimé ou recréé ;
- un dossier déjà évalué en version 3 n'est pas retraité ;
- un dossier incomplet peut rester avec un score `NULL` après réévaluation ;
- un dossier devenu complet reçoit un score numérique au prochain calcul ;
- les écritures du score, du détail et des évaluations sont regroupées dans un batch.

## Démonstration live

1. Ouvrir la liste des dossiers et montrer que les données synthétiques produisent des scores différents.
2. Ouvrir un dossier, puis l'onglet **Préqualification**.
3. Présenter les quatre dimensions, le ratio de capacité et les pénalités.
4. Déclencher **Évaluer les règles** après modification d'une preuve ou d'un flux de trésorerie synthétique.
5. Montrer que le score évolue, tandis qu'une règle critique reste bloquante.
6. Montrer qu'un dossier incomplet affiche « Non calculé — données insuffisantes » au lieu d'un score trompeur.
7. Couper temporairement le réseau pour montrer la saisie locale des preuves et la synchronisation différée déjà prévue par l'application.

Aucune donnée personnelle réelle ne doit être utilisée pendant la démonstration. Les profils fournis par le seed sont exclusivement des données de démonstration.

## Vérification locale

```bash
npm test
npm run build
```

Les tests couvrent notamment les seuils de capacité, les données absentes, la qualité des preuves, les pénalités, le déterminisme, la variation entre dossiers non éligibles et la complétude du projet agricole.
