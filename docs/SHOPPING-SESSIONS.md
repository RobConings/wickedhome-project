# Boodschappen en winkelsessies

## Uitgangspunt

De waarnemingen uit de winkel dateren van vóór merge `bdc1a96`. Producten, ShoppingItem-behoeften, StockPurchase-aankopen, StockMovement-mutaties en Expense-uitgaven worden hergebruikt. Gegevens worden niet verwijderd om een nieuwe workflow te starten.

## Fase 1 – Analyse en P0-herstel

- Bestanden: `src/api/shopping/shopping.service.ts`, `shopping-actions.ts`, `shopping.routes.ts`, `ai/skills/shopping/tools.ts`, `src/api/inventory/purchases.service.ts` en regressietests.
- Afvinken onderdrukt direct nieuwe automatische voorraadregels, ongeacht essentieel en ook bij een nog onbekende voorraadlocatie. Web en MCP delen dezelfde aankoopactie.
- Bronidentiteiten blijven onbeperkt idempotent. Historische aankopen buiten de huidige mogelijke overlap blokkeren geen onafhankelijke nieuwe aankoop; kassabonnen blijven gecontroleerd op bron, hoeveelheid en eerdere tellingen.
- Geen migratie. Bestaande aankopen en voorraad blijven behouden.
- Gerichte regressies: 69 tests geslaagd. Inclusief recept/minimum-combinaties, herhaalde aankopen, oude bronherhaling en essentieel afvinken.
- Verdere sessiegebonden isolatie, werkelijk transactionele sessie-afhandeling en realtime volgen in fases 3–4.
