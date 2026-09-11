# Moteur de scoring technique v4

## Nature du moteur

FresCoop n'utilise pas un modèle de machine learning opaque pour produire le score. Le moteur est **déterministe** : il applique des règles métier, formules, pondérations et seuils versionnés. À données et version identiques, le résultat et ses motifs sont identiques. Teranga AI fournit uniquement des signaux agronomiques encadrés ; la préqualification et la décision humaine restent séparées.

## Pourquoi les scores étaient tous à 25

L'ancien moteur calculait un score variable, puis appliquait `Math.min(score, 25)` dès qu'une règle bloquante était déclenchée. Les dossiers non éligibles finissaient donc presque tous à 25, quelles que soient leurs données.

La version 4 supprime ce plafond, sépare clairement la décision du score et relie l’analyse agronomique hybride au crédit :

`Projet agricole → moteur local FresCoop → Teranga AI → Rendement retenu → Revenu retenu → cash-flow → capacité → score → décision humaine`.

- le **score technique** mesure la solidité documentée du dossier ;
- la **préqualification** applique les règles métier, dont certaines restent bloquantes.

Un score élevé ne remplace donc jamais une règle critique ni la décision humaine du comité.

## Statut provisoire ou définitif

Le moteur calcule à partir des informations disponibles, mais distingue explicitement deux états :

- **provisoire** tant que des données indispensables manquent ; le détail énumère ces données et le résultat ne doit pas être utilisé comme une décision finale ;
- **définitif** après complétion du dossier et recalcul avec la version courante des règles.

Les données indispensables contrôlées sont :

- identité du demandeur et numéro d'identification ;
- secteur Agriculture et activité renseignée ;
- montant demandé et durée strictement positifs ;
- flux de trésorerie comprenant au moins un mois de revenus ;
- projet agricole avec culture, surface, rendement et prix ;
- au moins un intrant ou une charge avec un coût positif.

Chaque modification structurante ou synchronisation déclenche un nouveau calcul. « Définitif » décrit donc le score du dossier complet dans son état courant, pas une valeur figée malgré des données ou règles ultérieurement modifiées.

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

La capacité utilisée par le score est calculée avec le **Revenu retenu**. Le détail conserve en parallèle la capacité issue du revenu déclaré, la capacité retenue et leurs versions stressées avec une baisse de revenus de 20 %. L'écart avant/après reste donc visible et explicable au comité.

## Garde-fous Teranga AI

Le moteur local FresCoop demeure autoritaire en mode hors ligne ou lorsque Teranga est indisponible, lent, invalide ou incomplet. Dans ces cas, le Rendement retenu reste égal au Rendement déclaré : le fallback n'ajoute ni pénalité ni motif de refus.

Quand les deux réponses Teranga sont valides, le Rendement retenu est le minimum entre le Rendement déclaré et le Rendement Teranga. Une divergence déclenche uniquement une revue agronomique explicable. Si la capacité déclarée est acceptable mais que la capacité retenue devient insuffisante uniquement à cause de cet ajustement, la règle critique de capacité est neutralisée au profit d'une revue humaine. Si les capacités déclarée et retenue sont toutes deux insuffisantes, la règle financière critique reste applicable.

Teranga enrichit donc l'analyse du risque sans prendre la décision : le comité humain reste seul responsable de la décision finale.

## Migration des scores existants

Le moteur courant porte la version `4`. Au démarrage, le serveur sélectionne les dossiers dont le score est `NULL` ou dont la version est absente ou inférieure à 4, puis les réévalue avec le même service que l'API.

La migration est additive et idempotente :

- aucun dossier n'est supprimé ou recréé ;
- un dossier déjà évalué en version 4 n'est pas retraité ;
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
