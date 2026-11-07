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

## Fase 2 – Boodschappen-UX

- Bestanden: shopping-types, shopping-service, MCP-shoppingtools, `shopping-item-list`, `shopping-item-row`, `shopping-grouping`, `shopping-preferences`, beide shopping-schermen en EN/NL-teksten.
- Categorieën gebruiken opgeslagen productcategorieën, nooit zoekwoorden. De gewone lijst groepeert standaard; de winkelweergave start op categorie. De volgorde is op dit apparaat instelbaar en wordt tussen tabbladen bijgewerkt.
- Automatische minimumvoorraadregels kunnen uit beeld worden gefilterd zonder instellingen te wijzigen. Gemengde recept/expliciete regels blijven zichtbaar.
- Nu niet bewaart de regel als SKIPPED, onderdrukt automatische herhaling en laat voorraad/product/minimum ongemoeid. Opnieuw opnemen herstelt OPEN.
- Migratie `20261107170000_shopping_skip`: uitsluitend extra enumwaarde; geen bestaande rijen gewijzigd of verwijderd.
- Gerichte UX/service-regressies: 29 tests geslaagd. Bestaande brede categorieën hergebruikt; geen extra subcategorietabellen.
