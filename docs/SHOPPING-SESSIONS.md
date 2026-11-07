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

## Fase 4 – Realtime en concurrentie

- Bestanden: `shopping-events.ts`, shopping/inventory-services, `use-live-shopping.ts`, de bestaande SSE-client, `live-events.test.ts`, gewone editformulieren, MCP en aanvullende integratietests.
- Centrale servicegrenzen publiceren na geslaagde wijzigingen: ook MCP, recepten, voorraad en achtergrondaanvullingen. Boodschappen en sessies gebruiken de bestaande household-SSE-stream; focus/polling blijven fallback.
- Op iedere ready/reconnect wordt actuele serverdata geladen. Verouderde fetch-antwoorden worden genegeerd; events tijdens revalidatie worden nogmaals verwerkt zodra die klaar is.
- Bestaande lijstbewerkingen ondersteunen expectedUpdatedAt; sessies gebruiken revisies en vaste actie-ID's. Een verouderde hoeveelheid overschrijft geen wijziging van iemand anders. Gelijktijdig afvinken blijft idempotent.
- Geen nieuwe migratie in deze fase. De actiehistoriek uit fase 3 ondersteunt de concurrencycontrole.
- Gerichte tests: 20 geslaagd, inclusief echte reconnect met een nagebootste EventSource. PostgreSQL: 10 integratietests geslaagd, inclusief gelijktijdige MCP/web-aankoop en MCP-toevoeging naar twee subscribers.
- De bestaande SSE-bus werkt in één API-proces, conform de huidige PM2-configuratie. Voor meerdere API-workers is gedeelde pub/sub nodig; polling blijft ook dan een herstelpad, geen onmiddellijke cross-worker-broadcast.

## Fase 5 – Financiële koppeling

- Bestanden: `session-payments.service.ts`, shopping-sessieroutes/MCP, `src/features/expenses/types/shopping-payment.ts`, de bestaande expenses-service, `session-payments.tsx`, sessie- en uitgavedetails, EN/NL.
- Migratie `20261107183000_shopping_payments`: nieuwe koppeltabel met unieke bron-/uitgave-identiteit; bestaande uitgaven en rekeninggegevens blijven ongewijzigd.
- Een betaling koppelt een bestaande betaalde uitgave of maakt met dezelfde uitgavenservice transactioneel één nieuwe uitgave. De bon kan later worden gekoppeld. Alleen bonnen koppelen creëert nooit een uitgave.
- Ondersteunt meerdere betalingen per sessie/bon, gezamenlijk of persoonlijk, bestaande gesplitste aandelen via API/MCP, betaalrekening en daadwerkelijke betaler. Web ondersteunt gesplitste betalingen als afzonderlijke bedragen met een eigen referentie.
- Betalingsreferenties zijn idempotent; gewijzigde retries worden geweigerd. Een uitgave kan niet dubbel worden gekoppeld. Bekende bontotalen bewaken overregistratie. Links lopen van sessie naar uitgave en terug.
- Vijf echte PostgreSQL-financetests geslaagd: parallelle retries, rekening/betaler, gesplitste betalingen/aandelen, bestaande uitgave hergebruiken, overbetaling en toegang voor kinderen. Voorraad blijft bij financiële acties ongewijzigd.
- De bestaande uitgavenfunctie accepteert een transactionele context voor eenmalige betalingen; meldingen volgen pas na commit. Periodieke uitgaven en leningen blijven hun bestaande route volgen.

## Fase 6 – Consistentie en eindvalidatie

- Bestanden: `src/features/shopping/types/product-identity.ts`, `src/types/units.ts`, `src/api/shopping/product-alternatives.ts`, shopping-/receptservices, MCP-productvoorbereiding en receptmatching; aanvullende sessie-/betalingstests, `scripts/verify-shopping-migration.mjs`, `scripts/shopping-browser-smoke.mjs`, npm-scripts en CI.
- Productmatching sluit bekende conflicterende producttypen uit. Bertolli smeerboter wordt niet aan vloeibare olijfolie gekoppeld omdat ‘olijfolie’ in de naam staat. De opgeslagen categorie blijft leidend. Gedeelde voorraad weigert bekende conflicterende typen, verpakkingen, eenheden of verpakkingsinhouden; generieke voorraadgroepen behouden verpakkingsmetadata.
- Huishoudelijk tellen blijft eenvoudig: één potje is één voorraadeenheid, zonder verplicht gramgewicht. Nieuwe boodschappen en sessieregels gebruiken de ene bekende huishoudelijke voorraadeenheid als standaard, ook bij een verouderd cataloguslabel. Expliciet ingevoerde recept-/aankoopeenheden worden niet stilzwijgend omgerekend. Gramomrekening is alleen beschikbaar als de inhoud al bekend is; onbekende inhoud blokkeert gewoon potjes tellen niet.
- De actuele catalogus is alleen gelezen: Bertolli staat al onder zuivel, tomatenpuree heeft 10 potjes voorraad en geen bekend gewicht. Geen echte voorraad, recepten, productkoppelingen of financiën aangepast. Een echte PostgreSQL-test controleert juist die verouderde tube/potje-situatie: één potje erbij geeft 11, zonder verpakkingsgewicht.
- Winkelen toont primair Gekocht en Nu niet. Hoeveelheden, voorraadlocaties en verwijderen zitten onder Aanpassen. Gekochte en overgeslagen producten staan buiten de actieve categorieën in inklapbare overzichten. Bon- en betalingsformulieren zijn optioneel uitklapbaar.
- Aanvullend hersteld: onderdrukking van automatische regels bij gedeelde voorraad en bulkafvinken, receptselectie zonder verborgen minimumhoeveelheden, later voorraad boeken bij een oorspronkelijk niet bijgehouden aankoop, veilige herhaling van sessiestart en betalingen, en behoud van aankoopnamen na verwijderen uit een sessie.
- Geen extra datamigratie boven de vier hierboven beschreven additieve migraties. Bestaande entiteiten en rollen blijven behouden.

### Definitieve controles

| Controle | Resultaat |
| --- | --- |
| `npm run typecheck` | Geslaagd |
| `npm run lint` | Geslaagd |
| `npm test` | 1.600 geslaagd; 22 database-integratietests bewust overgeslagen in deze unitrun |
| `npm run test:shopping-integration` | Alle 22 tests geslaagd op echte PostgreSQL, inclusief MCP |
| `npm run test:shopping-migrations` | 103 oude tabellen vergeleken; alle 14 representatieve bestaande records exact behouden |
| `npm run test:shopping-browser` | Geslaagd met twee onafhankelijke mobiele Chrome-contexten van 390 × 844 |
| `npm run build` | Client en API gebouwd |
| `git diff --check` | Geslaagd |

De browsercontrole gebruikt echte login, API, SSE en PostgreSQL: selectie, deelnemen, gelijktijdig afvinken, Nu niet, afsluiten, PDF-upload, bonregelherhaling, betalingsherhaling, offline/reconnect en mobiele breedte. API/MCP-integratietests controleren dezelfde service-events naar beide subscribers. De migratietest start van het schema vóór deze wijzigingen en vergelijkt alle bestaande kolomwaarden, inclusief voorraadmutatie, aankoopbewijs, receptbehoefte en betaalde uitgave. Dit is een wegwerpdataset, geen wijziging aan of volledige kopie van de huishoudelijke productiedatabase.

### Acceptatietests 1–16

| Nr. | Geautomatiseerd gecontroleerd |
| --- | --- |
| 1–2 | Essentieel/minimum afvinken: één aankoop en mutatie, geen dubbele actieve regel (`sessions.integration.test.ts`) |
| 3 | Nu niet wijzigt geen voorraad en keert niet terug in dezelfde beurt (sessie- en shopping-regressies) |
| 4 | Alleen geselecteerde producten, idempotente sessiestart (sessie-integratie en browser) |
| 5 | Gedeeltelijke aankoop, cumulatieve hoeveelheid, veilige retry (sessie-integratie) |
| 6–7 | Zonder bon kopen, later dezelfde goederen aan bon koppelen zonder extra voorraad (sessie-integratie en browser) |
| 8 | Identieke upload en herhaalde gedrukte bonregel boeken niet opnieuw (sessie-integratie en browser) |
| 9 | Oude onafhankelijke aankoop blokkeert nieuwe beurt niet; oude bronherhaling blijft idempotent (purchase-unit- en sessie-integratie) |
| 10 | Gelijktijdig afvinken: twee deelnemers en MCP/web, één mutatie (database-integratie en twee browsers) |
| 11 | MCP-publicatie vanuit gedeelde service naar twee household-subscribers; echte browser ontvangt dezelfde SSE-stream (MCP-integratie en browser) |
| 12 | Verbindingsherstel haalt actuele status op (EventSource-test en offline/reconnect in browser) |
| 13 | Recept/minimum combineren zonder dubbel optellen; automatische bijdrage uitsluiten bij selectie (shopping-regressies en sessie-integratie) |
| 14 | Potje/tube blijven verschillende expliciete verpakkingen; potjes tellen zonder gewicht; verifieerbare gramomrekening werkt (units en database-integratie) |
| 15 | Aankoop, voorraad, bon, bestaande/nieuwe uitgave, rekening, betaler en gesplitste betaling (financiële integratie en browser) |
| 16 | Migratie behoudt oude gegevens en relaties (`verify-shopping-migration.mjs`) |

### Gebruik en uitrol

Open **Boodschappen → Winkelsessies**, kies de winkels en gewenste producten en start de beurt. Andere gezinsleden openen dezelfde sessie en kiezen Deelnemen. Gekocht registreert de geplande hoeveelheid; Aanpassen ondersteunt deelhoeveelheden en locatiekeuze. Nu niet verplaatst de regel uit de actieve lijst. Sluit de sessie af wanneer geen te kopen regels overblijven. Bonnen en betalingen kunnen later worden toegevoegd; bij een bonregel verwijst het gedrukte regelnummer steeds naar dezelfde echte bonregel.

Voor opnieuw testen is een expliciete wegwerpdatabase nodig waarvan de naam op `test` of `ci` eindigt:

```sh
export DATABASE_URL=postgresql://USER@127.0.0.1:5432/wickedhome_test
npx prisma migrate deploy
npm run test:shopping-integration
MIGRATION_TEST_DATABASE_URL="$DATABASE_URL" npm run test:shopping-migrations
npm run test:shopping-browser
```

De browsertest start en stopt zelf zijn lokale API/Vite-proces, gebruikt tijdelijke documentopslag en ruimt uitsluitend zijn eigen testhuishouden op. Chrome/Chromium moet geïnstalleerd zijn; desgewenst via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. CI voert de database-, migratie- en browsertests ook uit.

Uitrol gebeurt via het bestaande deployproces: backup behouden, dependencies installeren, `prisma migrate deploy`, client/API bouwen en API herstarten. De nieuwe functies zijn pas op de server beschikbaar na die uitrol. Deze werkzaamheden hebben de serverapplicatie en productiedatabase niet bijgewerkt.

### Grenzen en invloed op bestaande functies

- Bonnen worden opgeslagen en gecontroleerd gekoppeld; er is geen nieuwe automatische OCR-parser toegevoegd. De bestaande document- en MCP-workflows blijven bruikbaar.
- De categorievolgorde is een voorkeur per apparaat; productstatussen, aankopen en sessies zijn household-breed gedeeld.
- De huidige SSE-infrastructuur vereist één API-proces voor directe broadcasts. Meerdere workers vereisen gedeelde pub/sub.
- Oude bulkafronding markeert lijstregels gekocht zonder fictieve voorraad te verzinnen. Individueel kopen en sessie-aankopen registreren bekende voorraad via de bestaande aankoopadministratie.
- Verouderde edits leveren een conflict op en laden de actuele stand. Hoeveelheidsverschillen op bonnen vragen beoordeling; bestaande voorraad wordt niet automatisch verlaagd.
- Productmatching is een conservatieve uitsluiting van bekende conflicten, geen volledige productontologie of bewijs van gelijkwaardigheid. Bestaande productkoppelingen zijn niet automatisch herschreven.

## MCP en AI: operationele uitleg

De AI leest deze regels via `skills_load` voor shopping, inventory, recipes en expenses. De uitleg staat ook in de werkelijk gepubliceerde toolbeschrijvingen en JSON Schema-velden; dit rapport is geen vereiste om de tools correct te gebruiken.

- **Eerst lezen:** `shopping_sessions` en `shopping_session` leveren sessie-/regel-ID's, de aparte revisies, cumulatief gekochte hoeveelheden, aankoopregels en voorraadlocaties. Productidentiteit en eenheden komen uit de bestaande catalogus/voorraad.
- **Gewoon kopen:** `shopping_session_update_item` met `status: bought`, huidige regelrevisie en een vaste `operationId` koopt de geplande hoeveelheid. `purchasedQuantity` mag dan wegblijven. Eén potje heeft geen gramgewicht nodig.
- **Deelkoop:** eerder 1 gekocht en nu nog 1 betekent `purchasedQuantity: 2`, niet 1. Een nieuwe actie krijgt een nieuwe actie-ID. Een netwerkretry gebruikt dezelfde ID en ongewijzigde inhoud. Bij revisieconflict eerst opnieuw lezen.
- **Nieuwe planning:** `shopping_plan_visit` start een nieuwe beoordeling van behoeften; `shopping_start_session` neemt uitsluitend geselecteerde behoefte-ID's over. `includeLowStock: false` sluit de automatische hoeveelheidsbijdrage uit. Dat wijzigt geen minimumvoorraad.
- **Nu niet:** `skipped` koopt niets en wijzigt geen voorraad. `open` neemt opnieuw op. Afsluiten registreert geen ontbrekende aankopen of uitgaven.
- **Voorraad:** `stockAdded: false` betekent dat de aankoop wel geregistreerd is, maar geen bijgehouden voorraad verhoogde. De AI mag dan geen voorraadverhoging claimen. Bij verschillende locaties vraagt de AI om een herkenbare locatie, niet om een intern ID.
- **Bon na aankoop:** document uploaden, `shopping_session_attach_receipt`, daarna `shopping_session_match_receipt`. Gebruik steeds hetzelfde gedrukte regelnummer voor dezelfde bonregel. Bestaande aankoop-ID's betekenen dezelfde goederen; die krijgen geen tweede voorraadboeking. Verschillen of een latere voorraadtelling vragen beoordeling.
- **Betaling:** de nieuwe alleen-lezen tool `shopping_payment_options` geeft beschikbare betaalrekening-, betaler- en recente betaalde uitgave-ID's met namen. De AI vertaalt namen naar die ID's. Daarna koppelt `shopping_session_record_payment` een bestaande uitgave of maakt één nieuwe; nooit daarnaast `expenses_log` voor dezelfde betaling. Een vaste referentie identificeert één betaling; afzonderlijke betalingen krijgen eigen referenties.
- **Veilig gedeeld:** web en MCP gebruiken dezelfde transacties en events. De bestaande MCP-bevestiging voor schrijfacties blijft gelden. Kinderen kunnen geen financiële opties lezen of betalingen vastleggen.

Aanvullend gecontroleerd: alle 31 bestaande MCP-/toolcontracttests slagen, inclusief echte JSON Schema-generatie en het maximale formaat van de AI-handleidingen. Een extra PostgreSQL/MCP-test controleert het uitlezen van betaalrekening-ID's, household-isolatie en het weigeren van toegang voor kinderen.
