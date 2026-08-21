# Analyse concurrentielle — FresCoop

## FresCoop a-t-il un concurrent direct ?

**NON.** Aucun outil n'occupe exactement la même niche.

---

## Ce qui existe (concurrents partiels)

| Solution | Pays | Ce qu'elle fait | Ce qu'elle NE fait PAS (et que FresCoop fait) |
|----------|------|----------------|-----------------------------------------------|
| **Ensibuuko** | Ouganda (6 pays) | Core banking pour coopératives/SACCOs, offline, USSD, scoring communautaire | Pas de workflow d'instruction pour agent terrain, pas de cash-flow saisonnier, pas d'evidence ledger classé A/B/C/D, pas d'audit de décision |
| **Oradian** | 13 pays | Core banking API-first pour IMF, origination automatisée avec IA | Back-end pur, pas d'outil terrain, pas offline, pas spécifique agricole |
| **Mifos X** | Open source mondial | Core banking configurable pour MFI | Pas d'offline natif, pas d'outil terrain, pas de scoring agricole saisonnier |
| **DigiFi** | USA/Global | Loan origination system, decision engine | Pas pour l'Afrique, pas offline, pas agricole, pas pour IMF |
| **Apollo Agriculture** | Kenya | Finance + intrants pour fermiers, scoring satellite | Sert les fermiers directement, pas les agents/IMF |
| **myAgro** | Sénégal/Mali | Épargne-layaway mobile pour intrants agricoles | Pas de crédit, pas d'outil pour IMF, pas d'instruction de dossier |
| **FarmDrive** | Kenya | Scoring crédit agricole via données mobiles et satellite | Scoring uniquement, pas de workflow terrain, pas offline |

---

## La niche de FresCoop (occupée par personne)

FresCoop est au croisement exact de 4 dimensions qu'aucun acteur ne couvre ensemble :

1. **Outil pour l'agent terrain** — pas un back-office, pas une app fermier
2. **Offline-first** — fonctionne sans réseau, synchronise au retour de la connexion
3. **Crédit agricole avec cash-flow saisonnier** — comprend que les revenus ne sont pas mensuels
4. **Evidence ledger + audit trail** — chaque preuve classée (A/B/C/D), chaque décision tracée

---

## Positionnement dans la chaîne de valeur

```
[TERRAIN]          [INSTRUCTION]           [DÉCISION]          [GESTION]
                                                               
  Agent             FresCoop                 Comité             Core Banking
  collecte     →    structure le      →     décide sur     →   Ensibuuko/Mifos
  les données       dossier vérifiable      base du mémo       gère le portefeuille
                                                               
  ← PERSONNE N'EST ICI →                                      ← TOUT LE MONDE EST ICI →
```

Les solutions existantes gèrent le crédit APRÈS la décision.
FresCoop digitalise l'instruction AVANT la décision.

---

## Arguments pour le jury

### "Ça existe déjà ?"

> "Ensibuuko et Mifos gèrent le portefeuille existant — c'est du core banking. Nous, nous structurons le dossier AVANT qu'il entre dans le portefeuille. Dans les conditions réelles du terrain : sans réseau, avec des preuves vérifiables à 4 niveaux, et un audit complet de chaque décision. C'est la pièce manquante de la chaîne."

### "Pourquoi pas un module dans Mifos ?"

> "Mifos n'a pas de mode offline. En zone rurale sénégalaise, l'agent n'a pas de réseau pendant 80% de sa tournée. Notre architecture offline-first n'est pas un plugin — c'est un choix structurel qui change tout le design."

### "Et Apollo Agriculture / FarmDrive ?"

> "Apollo et FarmDrive servent les fermiers directement avec du scoring automatisé. Nous servons les agents de crédit des coopératives qui ont besoin de constituer un dossier vérifiable pour leur comité. Ce n'est pas le même utilisateur, pas le même problème, pas la même solution."

---

## Avantage concurrentiel résumé

| Critère | FresCoop | Ensibuuko | Mifos | Apollo |
|---------|----------|-----------|-------|--------|
| Outil agent terrain | ✅ | ❌ | ❌ | ❌ |
| Offline-first | ✅ | ⚠️ (partiel) | ❌ | ❌ |
| Cash-flow saisonnier | ✅ | ❌ | ❌ | ⚠️ |
| Evidence ledger (A/B/C/D) | ✅ | ❌ | ❌ | ❌ |
| Audit trail complet | ✅ | ⚠️ | ⚠️ | ❌ |
| Scoring explicable (rules-first) | ✅ | ❌ | ❌ | ❌ (black box) |
| Spécifique crédit agricole | ✅ | ❌ | ❌ | ✅ |
| Pour IMF/coopératives | ✅ | ✅ | ✅ | ❌ |
