# Voorstel woningbediening

Ontwerpvoorstel van 14 november 2026. Deze map bevat het oorspronkelijke ontwerp en het zelfstandige interactieve voorbeeld. De daaropvolgende applicatie-implementatie staat beschreven in [HOME-CONTROL.md](../../HOME-CONTROL.md); het voorbeeld zelf stuurt geen apparaten aan.

- proposal.mdx: productkeuzes, uitvoeringsarchitectuur, leveringsvolgorde en acceptatiecriteria.
- proposal.plan.html: gerenderd visueel plan.
- woning-interface.html: inline ontwerp met vijf weergaven en een lokale actie-editor/simulator.
- preview.html: browserwrapper voor het zelfstandig testen van het ontwerp.

## Vastgestelde uitgangssituatie

- 39 WickedHome-apparaatrecords; deze omvatten ook circuitrecords en gedeelde kaartpunten.
- 129 HA-entiteiten op het moment van de inspectie; dit zijn geen 129 fysieke apparaten.
- HC1: vloerverwarming gelijkvloers en badkamer. HC2: gedeeld circuit voor zes radiatoren.
- Lokale en cloud-Buderus-entiteiten zijn aanwezig. De bestaande kaartbediening gebruikt de lokale bron.
- Verisure-paneel ondersteunt thuis/afwezig en meldt code_arm_required=true.
- Camera's Living, Keuken en Garage leveren foto's; HA meldt geen stream-feature.
- Zeven media-player-entiteiten zijn bekend. Meerdere Philips-bronnen hebben dezelfde zichtbare naam; toestelidentiteit en functies moeten worden geverifieerd voordat ze onder één kaart worden gegroepeerd.
- De beschikbare TV-bron meldt TURN_OFF-ondersteuning; de huidige WickedHome-adapter heeft nog geen media-player-acties.
- Home Connect is nog niet geladen; er is nog geen betrouwbare klaar-trigger voor de Bosch-toestellen.
- Er zijn geen bestaande script- of automation-entiteiten in de inspectie. De huidige HA-configuratie heeft daarvoor nog geen YAML-configuratiesleutels.
- Bestaande WickedHome-automatiseringen zijn achtergrondjobs. Hun scheduler en geschiedenis blijven behouden.

## Ontwerpkeuzes

Alle apparaten moeten op het grondplan én in het apparatenoverzicht terug te vinden zijn. De kaart is een volwaardige bedieningsweergave naast het overzicht en de actieknoppen. Huisbrede functies krijgen een huisbreed element; gedeelde circuits houden hun gedeelde identiteit. Er verschijnt standaard geen alarmbediening over de kaart. Dezelfde detailbediening opent pas na selectie van het bijbehorende kaart- of overzichtselement.

Acties zijn herbruikbare gebruikersdefinities, regels koppelen gebeurtenissen aan die acties, woonprofielen beschrijven gewenste instellingen. De echte alarmtoestand staat daar los van.

Gewone gepubliceerde apparaatreeksen en regels draaien in Home Assistant. Handmatige alarmstappen blijven via de bestaande app-dienst lopen met bevestiging, code en audit. De eerste levering behandelt inschakelen als handmatige startvoorwaarde, vóór de gewone apparaatreeks. Een automatische trigger kan die stap niet passeren zonder de vereiste gebruikerinteractie.

Geen alarmcode in een opgeslagen actie of in scriptvariabelen/traces. Geen verborgen generieke script-acties die bestaande alarmrechten omzeilen. Het voorstel introduceert geen algemene automatische ontgrendel- of uitschakelroute.

## Uitgevoerde ontwerpcontrole

- MDX-validatie zonder waarschuwingen.
- JavaScript-syntaxcontrole.
- Browsercontrole van alle vijf weergaven op 320, 390, 736 en 1024 pixels.
- Geen buiten beeld vallende knoppen, invoervelden of selecties.
- Getest: open-raamblokkade, geweigerde alarmstap, gedeeltelijke uitvoering bij offline TV, dry-run, eigen actienaam bewaren, gedeeld-circuitconflict en regel aanpassen.
- Aanvullend getest: dezelfde alarmdetailbediening vanuit overzicht, apparaten en kaart zonder van weergave te wisselen; standaard gesloten; sluiten herstelt de ruimte; kamerselectie opent geen alarm; verdieping wisselen sluit details. Geen overlap van kaart en alarmpaneel op desktop en geen afgeknipte bediening op de vier breedtes.
- Geen browser-scriptfouten; geen netwerkverzoeken met schrijvende HTTP-methodes vanuit het voorbeeld.
- Voorbeeldinteractie blijft lokaal en stuurt geen Home Assistant-services aan.

De voorbeeldtemperaturen zijn ontwerpwaarden, geen aanbeveling en geen wijziging van de huidige instellingen.
