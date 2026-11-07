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

## Fase 3 – Winkelsessies en aankoopbewijzen

- Nieuwe bestanden: `prisma/schema/shopping-sessions.prisma`, `src/api/shopping/sessions.service.ts`, `sessions.routes.ts`, `src/features/shopping/types/sessions.ts`, `data/sessions-requests.ts`, `screens/sessions-screen.tsx`, `src/routes/shopping-sessions.tsx`, `ai/skills/shopping/sessions.ts` en database-integratietests.
- Gewijzigd: shopping-router/routes/index, EN/NL, inventory-transacties en aankoopcontext, Prisma household/inventory-relaties. De categorievoorkeur is verplaatst naar een afzonderlijke hook.
- Migraties `20261107173000_shopping_sessions` en `20261107180000_shopping_operations`: uitsluitend nieuwe tabellen, nullable relaties en indexen. Bestaande StockPurchase-regels blijven bestaan en kunnen aan nieuwe aankoophoofden worden gekoppeld.
- Een sessie bevat uitsluitend geselecteerde behoeften. Meerdere deelnemers, winkels/groepen, hoeveelheden, gedeeltelijke aankopen, Nu niet, verwijderen, afsluiten en historiek zijn beschikbaar via web én MCP.
- Sessieactie, aankoopbewijs, voorraadmutatie en status worden in één transactie verwerkt. Een vaste actie-ID met payloadcontrole voorkomt ook veranderde retries; revisies voorkomen overschreven wijzigingen.
- Bonnen worden als bestaande documenten opgeslagen. Inhoudshash + gedrukte regel voorkomen dubbele imports. Eerdere acquisities kunnen worden geselecteerd; afwijkingen vragen beoordeling. Meerdere bonnen kunnen afzonderlijke deelacquisities van hetzelfde product bevestigen.
- Ontbrekende bonproducten kunnen worden toegevoegd, ook bij een afgesloten sessie. Niet bijgehouden producten krijgen een aankoopregel zonder fictieve voorraadverhoging.
- Acht echte PostgreSQL-integratietests geslaagd, waaronder gelijktijdige MCP/web-acties, twee deelnemers, gedeeltelijke aankopen, bronherhaling, conflicterende revisies, meerdere bonnen en household-isolatie.
- Geen automatische OCR toegevoegd: bonregels worden gecontroleerd gekoppeld via web of MCP. Uitgaven/betalingen volgen in fase 5.
