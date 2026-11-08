"""Generate the review inventory from actual routes, features and dialogs; no household data."""
from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
# Owner, visible title, pattern, user goal, primary CTA. Proposed ownership is explicit in the plan.
M={
'purchases':('purchases','Aankopen','list','Wat is werkelijk gekocht, voor wie en waar is het verwerkt?','Winkelbeurt starten'),
'purchase-detail':('purchases','Gamma · aankoop € 45,00','purchase','Drie producten, één uitgave, een duidelijke projectverdeling.','Bon toevoegen'),
'dashboard':('dashboard','Vandaag','dashboard','Wat vraagt vandaag onze aandacht?','Snelle actie'),
'login':('auth','Welkom thuis','auth','Meld je aan bij jullie huishouden.','Aanmelden'),
'setup':('auth','Jullie huishouden starten','setup','Een paar eenvoudige keuzes om samen te beginnen.','Volgende'),
'logout':('auth','Afgemeld','auth','Je sessie is afgesloten.','Opnieuw aanmelden'),
'link':('auth','Toegang tot WickedHome','auth','Aanvaard je uitnodiging of stel een nieuw wachtwoord in.','Doorgaan'),
'connect':('assistant','AI verbinden','consent','Bekijk welke gegevens deze AI mag lezen of aanpassen.','Verbinding toestaan'),
'house':('household','Ons huis','dashboard','Ruimtes, bewoners en toestellen in één overzicht.','Ruimte openen'),
'habitants':('household','Bewoners','cards','Wie woont hier en wat doen we samen?','Bewoner toevoegen'),
'contacts':('contacts','Contacten','list','Vind de juiste persoon, leverancier of vakman.','Contact toevoegen'),
'places':('places','Ruimtes','cards','Wat gebeurt waar in huis?','Ruimte toevoegen'),
'floor-plan':('places','Plattegrond · gelijkvloers','map','Vind ruimtes en toestellen op hun plaats.','Plattegrond bewerken'),
'place-detail':('places','Garage','detail','Voorraad, taken en toestellen in deze ruimte.','Actie in deze ruimte'),
 'tasks':('tasks','Taken','list','Wat kunnen we vandaag afwerken?','Taak toevoegen'),
 'task-detail':('tasks','Badkamermeubel monteren','task','Benodigdheden controleren en samen de taak afwerken.','Taak afronden'),
 'shops':('shops','Winkels en winkelgroepen','cards','Jullie vaste winkels en handige combinaties.','Winkel toevoegen'),
 'shop-detail':('shops','Gamma','detail','Producten, aankopen en contactgegevens van deze winkel.','Product bekijken'),
 'shopping':('shopping','Boodschappen','checklist','Wat willen we meenemen?','Boodschap toevoegen'),
 'shopping-sessions':('shopping','Winkelbeurten','cards','Start een winkelbeurt of ga verder waar jullie waren.','Winkelbeurt starten'),
 'shopping-shop-view':('shopping','Boodschappen per winkel','checklist','Dezelfde behoeften, gefilterd op één winkel of groep.','Winkelbeurt starten'),
 'shopping-products':('catalogue','Producten','cards','Eén product, bruikbaar in jullie hele huishouden.','Product toevoegen'),
 'inventory':('inventory','Voorraad','list','Wat is er in huis en waar ligt het?','Product scannen'),
 'inventory-count':('inventory','Voorraad tellen','count','Werk een locatie rustig af en controleer de verschillen.','Telling controleren'),
 'inventory-scan':('inventory','Product scannen','scan','Scan een product en kies gebruiken of aanvullen.','Scanner openen'),
 'inventory-product':('catalogue','Montagekit wit','product','Het product en zijn gebruik in voorraad, projecten en aankopen.','Bewerken'),
 'recipes':('recipes','Recepten','cards','Kies een maaltijd en zie wat al in huis is.','Recept toevoegen'),
 'recipe-detail':('recipes','Pasta met tomatensaus','recipe','Bereid je maaltijd voor met gekoppelde producten en voorraad.','Maaltijd plannen'),
 'recipe-cooking':('recipes','Samen koken','cooking','Eén stap tegelijk; gebruik alleen de echte hoeveelheden.','Stap afronden'),
 'expenses':('expenses','Uitgaven','list','Wat is betaald, wat volgt nog en waarvoor was het?','Uitgave toevoegen'),
 'expense-detail':('expenses','Gamma · € 45,00','expense','Eén betaling, met aankoop, bon en projectverdeling.','Betaling aanpassen'),
 'recurring-expense-detail':('expenses','Internetabonnement','detail','Planning, betaalgegevens en eerdere betalingen.','Periodieke uitgave aanpassen'),
 'income':('income','Inkomsten','list','Wat verwachten we en wat is echt ontvangen?','Inkomst registreren'),
 'money':('money','Geldstroom','money','Wat staat er op de rekening en wat is nog voorzien?','Overschrijving registreren'),
 'projects':('projects','Projecten','cards','Van idee tot afgewerkt, met taken, benodigdheden en budget.','Project starten'),
 'project-detail':('projects','Badkamer vernieuwen','project','Wat is de volgende stap en hoe staat het met ons budget?','Volgende taak openen'),
 'bills':('expenses','Doorverwijzing naar uitgaven','redirect','Bestaande links blijven uitkomen bij dezelfde uitgave.','Uitgaven openen'),
 'subscriptions':('expenses','Doorverwijzing naar periodieke uitgaven','redirect','Bestaande links blijven werken.','Periodieke uitgaven openen'),
 'documents':('documents','Documenten','list','Bewaar één bestand en vind de gekoppelde gegevens terug.','Document toevoegen'),
 'documents-trash':('documents','Prullenbak','list','Bekijk verwijderde bestanden en herstel wat je nodig hebt.','Herstellen'),
 'documents-drive':('integrations','Gekoppelde Drive-map','list','Vind bestanden bij hun bron en hun gekoppelde gegevens.','Map openen'),
 'calendar':('calendar','Agenda','calendar','Afspraken, taken en geplande betalingen in één tijdlijn.','Afspraak toevoegen'),
 'calendar-event':('calendar','Plaatsing badkamermeubel','detail','Wanneer, waar en met wie?','Afspraak aanpassen'),
 'energy':('energy','Energie','energy','Begrijp jullie verbruik, kosten en vooruitblik.','Periode kiezen'),
 'energy-appliances':('energy','Verbruik per toestel','list','Welke toestellen verklaren het verbruik?','Toestel toevoegen'),
 'energy-setup':('energy','Energie instellen','setup','Koppel meters en leg de juiste tarieven vast.','Volgende'),
 'energy-import':('energy','Energiegegevens importeren','import','Controleer het bestand en de gevonden metergegevens.','Bestand kiezen'),
 'devices':('devices','Toestellen','cards','Status, locatie en onderhoud van jullie toestellen.','Toestel toevoegen'),
 'device-detail':('devices','Wasmachine','detail','Actuele status, onderhoud, verbruik en documenten.','Onderhoud plannen'),
 'device-profiles':('devices','Toestelprofielen','cards','Herbruikbare instellingen voor gelijkaardige toestellen.','Profiel toevoegen'),
 'device-profile':('devices','Profiel · wasmachine','form','Kies welke eigenschappen en bediening dit toestel krijgt.','Profiel opslaan'),
 'home-assistant':('home-assistant','Home Assistant','connections','Koppeling, entiteiten en echte huisstatus.','Verbinding beheren'),
 'assistant':('assistant','Assistent','chat','Handel met dezelfde gegevens en regels als in de app.','Nieuw gesprek'),
 'settings':('settings','Instellingen','settings','Duidelijke ingangen voor huishouden, voorkeuren en beheer.','Instelling openen'),
 'integrations':('integrations','Koppelingen','connections','Welke diensten zijn verbonden en wat synchroniseren ze?','Koppeling toevoegen'),
 'notifications':('notifications','Meldingen','list','Wat vraagt aandacht en wat is al afgehandeld?','Alles gelezen'),
 'not-found':('auth','Deze pagina bestaat niet','empty','Ga terug naar een herkenbaar onderdeel van de app.','Naar Vandaag'),
}
DATA={
'dashboard':[('Vandaag samen','4 van 7 taken afgerond',''),('Volgende stap','Badkamermeubel monteren','task-detail'),('Winkelbeurt','Colruyt-groep · 3 producten','visit-active')],
'household':[('Rob','Volwassene · 2 taken klaar','tasks'),('Cindy','Volwassene · 2 taken klaar','tasks')],
'tasks':[('Badkamermeubel monteren','Rob en Cindy · klaar om te starten','task-detail'),('Tegels plaatsen','Wacht op benodigdheden · badkamer','project-materials'),('Afval buitenzetten','Cindy · donderdag','waste')],
'contacts':[('Gamma','Winkel · 1 aankoop gekoppeld','shop-detail'),('Installateur','Vakman · Badkamer vernieuwen','project-detail')],
'places':[('Garage','3 patronen montagekit · 1 project','inventory'),('Badkamer','3 taken · 2 toestellen','project-detail')],
'catalogue':[('Montagekit wit','3 aanwezig · 2 nodig voor een taak','product-stock'),('Schroeven','1 doos aanwezig · Badkamer vernieuwen','product-projects'),('Boni Halfvolle Melk 1 l','Op · 2 pakken op de lijst','shopping')],
'inventory':[('Montagekit wit','Garage · 3 patronen · minimum 1','inventory-product'),('Schroeven','Garage · 1 doos · minimum 1','product-projects'),('Boni Halfvolle Melk 1 l','Berging · 0 pakken · minimum 2','shopping')],
'shopping':[('Boni Halfvolle Melk 1 l','2 pakken · Colruyt · Op','inventory-product'),('Tomatenpuree','1 potje · Colruyt · Bijna op','inventory-product'),('Montagekit wit','2 patronen · Gamma · taak badkamermeubel','task-detail')],
'shops':[('Colruyt-groep','Colruyt + Collect&Go · favoriete groep','visit-start'),('Gamma','Klusmateriaal · laatst gebruikt','shop-detail')],
'projects':[('Badkamer vernieuwen','Actief · 1 van 3 taken klaar · € 1.700 vrij','project-detail'),('Tuin opfrissen','Gepland · budget nog niet ingesteld','project-detail')],
'purchases':[('Gamma · 7 november','€ 45,00 · 3 producten · betaald','purchase-detail'),('Sanitair X · 3 november','€ 425,00 · project badkamer','expense-detail')],
'expenses':[('Gamma','Betaald · € 45,00 · rekening gezamenlijk','expense-detail'),('Sanitair X','Betaald · € 425,00 · project badkamer','expense-detail'),('Transport badkamer','Nog te betalen · € 40,00','expense-detail'),('Internet','Nog te betalen · € 60,00','recurring-expense-detail')],
'income':[('Salaris Rob','€ 2.450,00 · ontvangen · november','income-detail'),('Salaris Cindy','€ 2.050,00 · ontvangen · november','income-detail'),('Maaltijdcheques','Werkelijk bedrag nog invullen · apart van bankgeld','income-detail')],
'money':[('Beginstand','€ 1.200,00 · saldo op 1 november','account-detail'),('Bijdragen','+ € 2.800,00 · werkelijk overgeschreven','contribution-plan-dialog'),('Betaalde uitgaven','− € 1.602,00 · 4 uitgaven','expenses-history'),('Huidig saldo','€ 2.398,00 · gepland nog € 100,00','account-detail')],
'recipes':[('Pasta met tomatensaus','2 personen · 1 product nog meenemen','recipe-detail'),('Groentesoep','4 personen · producten gekoppeld','recipe-detail')],
'documents':[('Gamma-7-november.pdf','Bij aankoop Gamma en uitgave € 45,00','purchase-detail'),('Badkamer-plan.pdf','Bij project Badkamer vernieuwen','project-detail')],
'calendar':[('Badkamermeubel monteren','Vandaag · Rob en Cindy · badkamer','task-detail'),('Installateur','Maandag 9 november · 09:00','calendar-event')],
'devices':[('Wasmachine','Wasruimte · beschikbaar · onderhoud gepland','device-detail'),('Koelkast','Keuken · temperatuur bekend via koppeling','device-detail')],
'energy':[('Elektriciteit','12,4 kWh vandaag · meetgegevens','devices'),('Gas','4,2 m³ vandaag · meetgegevens','energy-setup'),('Verbruik uitleggen','Kosten zijn een raming op basis van het ingestelde tarief','energy-import')],
'home-assistant':[('Home Assistant','Verbonden · laatst gesynchroniseerd 2 minuten geleden','devices'),('Alarm','Status zichtbaar; bediening vraagt bevestiging','alarm-arm-dialog')],
'integrations':[('Home Assistant','Verbonden · toestellen en metingen','home-assistant'),('Google Drive','Verbonden · documenten met bronlink','documents-drive'),('E-mail','3 voorstellen wachten op controle','mail-suggestion-preview-dialog')],
'notifications':[('Transportfactuur ontvangen','Controleer uitgave bij Badkamer vernieuwen','expense-detail'),('Cindy heeft melk meegenomen','Winkelbeurt is bijgewerkt','visit-active')],
'auth':[('Jouw huishouden','Eén account, gedeelde gegevens, eigen rechten','dashboard')],
'assistant':[('Jij','Wat heb ik nodig voor de badkamer?','project-detail'),('Assistent','2 patronen kit en 1 doos schroeven. Open de gekoppelde materialen.','project-materials')],
'settings':[('Huishouden','Adres, bewoners en taal','settings-household'),('Voorkeuren','Weergave, beweging en meldingen','settings-notifications'),('Koppelingen en automatisering','Verbindingen, geplande taken en hun werking','settings-automations')],
'waste':[('Restafval','Donderdag · taak voor Cindy','tasks'),('Papier en karton','Volgende week · ophalen','calendar')],
'weather':[('Vandaag','12° · regen in de namiddag','dashboard'),('Tuin plannen','Buitenactiviteit beter in de voormiddag','tasks')],
'automations':[('Minimumvoorraad controleren','Actief · laatste controle geslaagd','automation-detail'),('Terugkerende betalingen','Actief · volgende uitvoering morgen','automation-detail')],
'audit':[('Winkelbeurt afgerond','Rob · aankoop en voorraad één keer verwerkt','visit-summary'),('Uitgave gekoppeld','Cindy · Gamma € 45,00','expense-detail')],
}
FIELDS={
'tasks':['Titel','Wanneer','Toegewezen aan','Ruimte','Project','Benodigdheden','Herhaling','Herinnering','Afhankelijkheden'],
'auth':['E-mailadres','Wachtwoord'], 'assistant':['Toepassing','Toegestane gegevens','Lezen of wijzigen'],
'household':['Naam','Type bewoner','Kleur','Account koppelen'],'contacts':['Naam','Soort contact','Telefoon','E-mailadres'],
'places':['Naam','Verdieping','Type ruimte','Kleur'],'catalogue':['Naam','Categorie','Voorraadeenheid','Essentieel','Verpakkingsinhoud (optioneel)','Winkelkoppeling'],
'shopping':['Product','Aantal','Winkel of winkelgroep','Doel: huishouden, project of taak'],
'shops':['Naam','Type winkel','Website','Winkelgroep'], 'inventory':['Product','Locatie','Aantal','Minimumvoorraad','Houdbaar tot'],
'projects':['Naam','Doel','Budget (optioneel)','Ruimte','Begindatum','Einddatum'],
'expenses':['Winkel of begunstigde','Bedrag','Datum','Betaalrekening','Betaler','Gezamenlijk of persoonlijk','Projectverdeling'],
'income':['Ontvanger','Soort inkomst','Werkelijk bedrag','Ontvangstdatum','Rekening','Herhaling'],
'money':['Van','Naar rekening','Bedrag','Datum','Toelichting'],
'recipes':['Naam','Aantal personen','Ingrediënten','Bereidingsstappen'], 'documents':['Bestand','Naam','Map','Koppelen aan'],
'calendar':['Titel','Datum en tijd','Deelnemers','Ruimte','Herhaling'], 'devices':['Naam','Ruimte','Profiel','Gekoppelde entiteit'],
'energy':['Energiedrager','Meter','Meetperiode','Tarief'], 'home-assistant':['Verbinding','Entiteit','Ruimte'],
'integrations':['Dienst','Verbinding','Wat synchroniseren','Toestemming'], 'notifications':['Ontvanger','Kanaal','Soort melding'],
'settings':['Instelling','Waarde','Van toepassing op'],'weather':['Locatie','Eenheid','Weergave'],'waste':['Adres','Afvalsoort','Herinnering'],
'automations':['Taak','Planning','Actief','Laatste uitvoering'],'audit':['Gebeurtenis','Persoon','Datum','Gekoppeld gegeven'],
'purchases':['Winkel','Aankoopdatum','Productregels','Bon','Uitgave koppelen'],
}
REL={
'projects':[('Taken · 3','project-tasks'),('Materialen · 3','project-materials'),('Aankopen · 2','project-purchases'),('Kosten · € 460','project-costs'),('Documenten · 2','project-documents')],
'catalogue':[('Voorraad · 3 patronen','product-stock'),('Taken · 1','task-detail'),('Projecten · 1','product-projects'),('Aankopen · 1','purchase-detail')],
'inventory':[('Product','inventory-product'),('Aankoopbron','purchase-detail'),('Gebruikt door taak','task-detail')],
'expenses':[('Aankoop · Gamma','purchase-detail'),('Project · € 35','project-costs'),('Rekening','account-detail'),('Bon','project-documents')],
'purchases':[('Producten · 3','inventory-product'),('Voorraad','inventory'),('Project · € 35','project-costs'),('Uitgave · € 45','expense-detail'),('Bon · 1','project-documents')],
'shopping':[('Winkelbeurten','shopping-sessions'),('Producten','shopping-products'),('Taak','task-detail')],
'recipes':[('Producten','shopping-products'),('Voorraad','inventory'),('Boodschappen','shopping'),('Koken','recipe-cooking')],
'money':[('Ontvangen inkomsten','income'),('Betaalde uitgaven','expenses-history'),('Projectbudgetten','projects'),('Rekeninghistoriek','account-detail')],
'income':[('Geldstroom','money'),('Ontvanger','habitants'),('Inkomstenbron','income-source-form-dialog')],
'places':[('Voorraad','inventory'),('Taken','tasks'),('Toestellen','devices'),('Projecten','projects')],
'devices':[('Ruimte','place-detail'),('Onderhoud','tasks'),('Energie','energy'),('Handleiding','documents')],
'contacts':[('Projecten','projects'),('Uitgaven','expenses'),('Documenten','documents')],
'documents':[('Aankoop','purchase-detail'),('Uitgave','expense-detail'),('Project','project-detail')],
'calendar':[('Taak','task-detail'),('Project','project-detail'),('Bewoners','habitants')],
'home-assistant':[('Toestellen','devices'),('Ruimtes','places'),('Energie','energy')],
'integrations':[('Documenten','documents'),('Voorstellen','mail-suggestion-preview-dialog'),('Uitvoeringen','settings-automations')],
'household':[('Taken','tasks'),('Agenda','calendar'),('Huis','places')],
'notifications':[('Bijbehorend gegeven','task-detail'),('Voorkeuren','settings-notifications')],
}
P=[]
def add(id,owner,title,kind,goal,cta,route='',**kw):
 p=dict(id=id,owner=owner,title=title,kind=kind,goal=goal,primary=cta,route=route,rows=[dict(label=a,meta=b,to=c) for a,b,c in DATA.get(owner,DATA['settings'])],fields=FIELDS.get(owner,FIELDS['settings']),relations=[dict(label=a,to=b) for a,b in REL.get(owner,[])],filters=['Alles','Actief','Afgehandeld'],source=[],status='voorstel',**kw)
 P.append(p);return p
routes=[('/', 'dashboard')]+re.findall(r'\{ path: "([^\"]+)", lazy: \(\) => import\("@/routes/([^\"]+)"\)',(ROOT/'src/app/router.tsx').read_text())
for path,mod in routes:
 owner,title,kind,goal,cta=M[mod];id=mod
 if path=='shopping/sessions/:sessionId':id='visit-active';title='Colruyt-groep · winkelbeurt';kind='visit';goal='Neem mee wat je wilt kopen; de rest kan Nu niet.';cta='Winkelbeurt afronden'
 elif path=='purchases/acquisitions/:acquisitionId':id='acquisition-detail'
 elif path=='shopping/shops/:shopId':id='shopping-one-shop';title='Boodschappen · Gamma'
 elif path=='documents/folders/:folderId':id='documents-folder';title='Documenten · Badkamer'
 elif path=='assistant/:conversationId':id='assistant-conversation';title='Gesprek · badkamer'
 elif path=='reset/:token':id='password-reset';title='Nieuw wachtwoord'
 elif path=='bills/:billId':id='bill-redirect'
 elif path=='subscriptions/:subscriptionId':id='subscription-redirect'
 p=add(id,owner,title,kind,goal,cta,'/' + path if path!='/' else '/')
 p['source']=['src/routes/'+mod+'.tsx']
 p['currentRoute']=p['route']
 if mod in ['shopping','shopping-sessions','shopping-shop-view']:p['filters']=['Alles','Op','Bijna op']
 if kind=='auth' and id=='password-reset':p['fields']=['Nieuw wachtwoord','Wachtwoord herhalen']
# New record views or explicit tabs; these are deliberately labeled proposed, not existing routes.
extras=[
('visit-start','shopping','Winkelbeurt starten','visit-start','Kies één winkel of één bestaande winkelgroep. De checklist volgt vanzelf.','Start winkelen','/shopping/sessions/new'),
('visit-summary','shopping','Winkelbeurt afgerond','visit-summary','Controleer de echte aantallen en koppel desgewenst de uitgave.','Uitgave koppelen','/shopping/sessions/:id?tab=summary'),
('visit-receipts','shopping','Bonnen en betalingen','purchase','Dezelfde aankoop onderbouwen, zonder opnieuw voorraad of geld te boeken.','Bon toevoegen','/shopping/sessions/:id?tab=receipts'),
('shopping-staples','shopping','Vaste producten','list','Wat keert terug en wanneer wil je het op je lijst?','Vast product toevoegen','/shopping?tab=staples'),
('shop-groups','shops','Winkelgroepen','cards','Beheer combinaties eenmaal; kies ze bij een winkelbeurt.','Winkelgroep maken','/shops?tab=groups'),
('purchases','purchases','Aankopen','list','Wat is werkelijk gekocht, voor wie en waar is het verwerkt?','Aankoop registreren','/purchases'),
('purchase-detail','purchases','Gamma · aankoop € 45,00','purchase','Drie producten, één uitgave, een duidelijke projectverdeling.','Bon toevoegen','/purchases/:id'),
('product-stock','inventory','Montagekit · voorraad','list','Bekijk de echte aantallen per locatie en hun mutaties.','Aantal aanpassen','/products/:id?tab=stock'),
('product-projects','projects','Montagekit · gebruik in projecten','list','De relatie loopt via benodigdheden en werkelijk gebruik.','Project openen','/products/:id?tab=projects'),
('product-shops','catalogue','Montagekit · winkels en varianten','list','Dezelfde identiteit, controleerbare varianten en winkelkoppelingen.','Winkelkoppeling toevoegen','/products/:id?tab=shops'),
('project-tasks','projects','Badkamer · taken','list','Volg de volgende uitvoerbare stap en wat nog blokkeert.','Taak toevoegen','/projects/:id?tab=tasks'),
('project-materials','projects','Badkamer · benodigdheden','list','Benodigd, aanwezig en gekocht zijn verschillende hoeveelheden.','Materiaal toevoegen','/projects/:id?tab=materials'),
('project-purchases','projects','Badkamer · aankopen','list','Bekijk welke aankopen dit project dienen.','Bestaande aankoop koppelen','/projects/:id?tab=purchases'),
('project-costs','projects','Badkamer · kosten','costs','€ 460 besteed, € 340 voorzien, € 1.700 nog vrij.','Uitgave koppelen','/projects/:id?tab=costs'),
('project-documents','documents','Badkamer · documenten','list','Eén bronbestand, vanuit project én aankoop bereikbaar.','Document koppelen','/projects/:id?tab=documents'),
('expenses-history','expenses','Betaalde uitgaven','list','Wat is werkelijk betaald en welke rekening is gebruikt?','Uitgave registreren','/expenses?tab=history'),
('expenses-recurring','expenses','Periodieke uitgaven','list','Instellingen en historie van terugkerende kosten.','Periodieke uitgave toevoegen','/expenses?tab=recurring'),
('income-detail','income','Salaris Rob · november','detail','Verwacht en daadwerkelijk ontvangen blijven zichtbaar onderscheiden.','Ontvangst aanpassen','/income?record=:id'),
('account-detail','money','Gezamenlijke rekening','money','Herleid het saldo naar ontvangen bijdragen en betaalde uitgaven.','Overschrijving registreren','/money?account=:id'),
('recipes-all','recipes','Alle recepten','cards','Kies uit de catalogus en plan daarna de maaltijd.','Recept toevoegen','/recipes?tab=all'),
('cook-summary','recipes','Maaltijd afgerond','visit-summary','Controleer wat werkelijk is gebruikt en bewaar eventuele correcties.','Terug naar recepten','/recipes/cook/:id?done=1'),
('automation-detail','automations','Automatisering · voorraad','detail','Wat doet deze taak, wanneer en wat was het resultaat?','Eenmalig uitvoeren','/settings#automations'),
]
for args in extras:
 if not any(page['id']==args[0] for page in P):add(*args)
# Embedded features and settings: each gets its own reviewable screen, even without a standalone route.
for id,owner,title,goal in [
('settings-household','household','Huishouden instellen','Adres, huishouden en taal op één herkenbaar formulier.'),
('settings-account','auth','Mijn account','Eigen toegang, sessies en wachtwoord beheren.'),
('settings-accounts','auth','Accounts en uitnodigingen','Bepaal wie toegang heeft en met welke rol.'),
('settings-notifications','notifications','Meldingsvoorkeuren','Kies welke meldingen waar mogen verschijnen.'),
('settings-automations','automations','Automatiseringen','Planning, uitvoering, pauzeren en fouten zichtbaar beheren.'),
('settings-activity','audit','Activiteit','Wie veranderde wat en bij welk gegeven?'),
('settings-weather','weather','Weer instellen','Locatie en eenvoudige weergavevoorkeuren.'),
('settings-waste','waste','Afval instellen','Ophaalschema, fracties en taakherinneringen.'),
('weather','weather','Weer voor vandaag','Nuttige informatie voor plannen in en rond het huis.'),
('waste','waste','Afvalkalender','Wat moet buiten, wanneer en wie doet het?'),
('settings-assistant','assistant','AI en MCP','Verbindingen, rechten en bevestigingen zijn controleerbaar.'),
('settings-display','settings','Weergave en spelplezier','Thema, minder beweging en speelse voortgang naar voorkeur.'),
('mail','integrations','E-mailvoorstellen','Controleer voorgestelde taken, uitgaven en documenten vóór verwerking.'),
('integration-health','integrations','Koppeling controleren','Verbinding, synchronisatie en eventuele fouten opvolgen.'),
]:
 p=add(id,owner,title,'list' if owner in ['audit','automations','integrations','waste','weather'] else 'form',goal,'Opslaan' if owner not in ['audit','automations'] else 'Details openen','/settings#'+id.replace('settings-',''))
 p['source']=[str(q.relative_to(ROOT)) for q in (ROOT/'src/features'/owner).rglob('*.tsx') if '/components/' in str(q)][:3]
# Dialogs exist as separate atlas entries; all source paths are checked below.
T={
'add-shopping-item-dialog':'Boodschap toevoegen','shopping-item-form-dialog':'Boodschap aanpassen','shopping-list-form-dialog':'Boodschappenlijst beheren','staple-form-dialog':'Vast product instellen','product-form-dialog':'Product bewerken','product-link-form-dialog':'Winkelkoppeling toevoegen','link-alternative-dialog':'Productvariant koppelen',
'shop-form-dialog':'Winkel bewerken','project-form-dialog':'Project bewerken','link-to-project-dialog':'Aan project koppelen','link-invoice-materials-dialog':'Factuurregels aan materialen koppelen','task-form-dialog':'Taak bewerken','complete-task-dialog':'Taak afronden','task-hold-dialog':'Taak uitstellen','task-blocked-dialog':'Afhankelijkheid beoordelen',
'expense-form-dialog':'Uitgave bewerken','log-expense-dialog':'Betaalde uitgave registreren','mark-expense-paid-dialog':'Betaling bevestigen','income-form-dialog':'Inkomst registreren','income-source-form-dialog':'Inkomstenbron instellen','record-transfer-dialog':'Overschrijving registreren','take-back-dialog':'Bijdrage terugnemen','set-balance-dialog':'Echt saldo vastleggen','other-entry-dialog':'Overige rekeningmutatie','account-form-dialog':'Betaalrekening beheren','contribution-plan-dialog':'Bijdrageplan instellen',
'recipe-form-dialog':'Recept bewerken','recipe-categories-dialog':'Receptcategorieën beheren','recipe-check-dialog':'Benodigdheden controleren','add-extra-dialog':'Ingrediënt toevoegen tijdens koken','cooking-done-dialog':'Koken afronden',
'stocktake-dialog':'Voorraadtelling controleren','stock-item-form-dialog':'Voorraadlocatie instellen','contact-form-dialog':'Contact bewerken','habitant-form-dialog':'Bewoner bewerken','device-form-dialog':'Toestel bewerken','calendar-event-form-dialog':'Afspraak bewerken','calendar-entry-dialog':'Agenda-item bekijken',
'folder-form-dialog':'Documentmap beheren','move-to-folder-dialog':'Document verplaatsen','file-rename-dialog':'Bestand hernoemen','attach-document-dialog':'Bestaand document koppelen','document-preview-dialog':'Document bekijken',
'floor-form-dialog':'Verdieping beheren','place-form-dialog':'Ruimte beheren','plan-import-dialog':'Plattegrond importeren',
'alarm-arm-dialog':'Alarm inschakelen','alarm-disarm-dialog':'Alarm uitschakelen','ha-entity-picker-dialog':'Huisentiteit kiezen','invite-dialog':'Bewoner uitnodigen','share-link-dialog':'Uitnodigingslink delen',
'mail-suggestion-preview-dialog':'E-mailvoorstel controleren','mail-rules-dialog':'E-mailregels beheren','mail-link-dialog':'E-mail aan gegeven koppelen','solar-installation-form-dialog':'Zonnepanelen instellen','battery-form-dialog':'Batterij instellen','gas-settings-form-dialog':'Gasmeting instellen','appliance-form-dialog':'Energietoestel instellen',
}
T['session-item-adjust-dialog']='Aantal en gekoppelde variant aanpassen'
T['session-extra-dialog']='Extra product meenemen'
T['shop-group-form-dialog']='Winkelgroep samenstellen'
T['goods-allocation-dialog']='Aankoop verdelen'
for source in sorted((ROOT/'src/features').rglob('*dialog.tsx')):
 owner=source.relative_to(ROOT).parts[2];id=source.stem;text=source.read_text()
 p=add(id,'catalogue' if id in ['product-form-dialog','product-link-form-dialog','link-alternative-dialog'] else owner,T[id],'dialog','Een korte, herkenbare handeling met dezelfde selectie, validatie en bevestiging.','Bevestigen' if any(x in id for x in ['complete','done','paid','arm','disarm','take-back','stocktake']) else 'Opslaan')
 p['source']=[str(source.relative_to(ROOT))]
 p['sourceFields']=sorted(set(re.findall(r'\bname(?:=|:\s*)["\']([\w.]+)["\']',text)))
 p['fields']=FIELDS.get(p['owner'],FIELDS['settings'])[:]
 if id=='session-item-adjust-dialog':p['fields']=['Gepland aantal','Gekoppelde variant']
 if id=='link-invoice-materials-dialog':p['fields']=['Bestaande uitgave','Aankoopregels','Toerekenen aan project','Totaal controleren']
 if id=='complete-task-dialog':p['fields']=['Afgewerkte taak','Werkelijk gebruikte materialen','Notitie (optioneel)']
 if id=='stocktake-dialog':p['fields']=['Locatie','Geteld aantal per product','Verschillen bevestigen']
 if 'alarm-' in id:p['fields']=['Actuele alarmstatus','Gewenste actie','Beveiligde bevestiging']
 if id in ['file-rename-dialog','folder-form-dialog']:p['fields']=['Naam','Map']
 if id=='share-link-dialog':p['fields']=['Ontvanger','Geldigheid','Link delen']
 p['sourceNote']='Bronvelden worden in de specificatie behouden; dit wireframe toont de primaire interactie. Voorwaardelijke velden komen onder de passende keuze.'
# Explicit missing cross-feature flows, also reviewable as complete pages/forms.
for id,owner,title,kind,fields in [
('shop-group-form','shops','Winkelgroep samenstellen','dialog',['Naam groep','Winkels toevoegen via selectie','Volgorde','Opslaan als favoriete groep']),
('visit-item-adjust','shopping','Aankoopregel aanpassen','dialog',['Gepland aantal','Gekoppelde variant']),
('visit-add-extra','shopping','Extra product meenemen','dialog',['Product of variant kiezen','Aantal','Doel (optioneel)','Voorraadlocatie (optioneel)']),
('payment-link','expenses','Uitgave aan aankoop koppelen','dialog',['Bestaande uitgave of nieuwe betaling','Bedrag','Rekening','Betaler','Bonregels en projectverdeling']),
('purchase-allocation','purchases','Aankoop verdelen','dialog',['Aankoopregel','Project of huishouden','Toegerekend aantal','Toegerekend bedrag']),
('stock-use-project','inventory','Voorraad voor taak gebruiken','dialog',['Product','Werkelijk gebruikt aantal','Voorraadlocatie','Taak en project']),
('filter-panel','settings','Filters en groepering','dialog',['Zoeken','Status','Periode','Project','Groeperen op','Bewaren als voorkeur']),
('global-search','dashboard','Zoeken in WickedHome','search',['Zoekterm','Soort gegeven','Project of ruimte']),
]:
 p=add(id,owner,title,kind,'Kies herkenbare gegevens; de eigenaar verwerkt de actie en bewaart de relaties.','Bevestigen');p['fields']=fields
# Domain examples for key linked screens.
for p in P:
 if p['id']=='project-tasks':p['rows']=[dict(label=x,meta=y,to='task-detail') for x,y in [('Badkamermeubel monteren','Klaar om te starten · Rob en Cindy'),('Tegels plaatsen','Wacht op materiaal · nog € 300 voorzien'),('Oude kast verwijderen','Afgerond · 1 van 3 stappen')]]
 if p['id']=='project-materials':p['rows']=[dict(label=x,meta=y,to='inventory-product') for x,y in [('Montagekit wit','2 nodig · 3 aanwezig · 2 gekocht · € 19'),('Schroeven','1 doos nodig · gekocht · € 16'),('Tegels','Nog te kiezen · raming € 300')]]
 if p['id']=='project-purchases':p['rows']=[dict(label='Gamma · € 45,00',meta='€ 35 voor badkamer · € 10 voor huishouden',to='purchase-detail'),dict(label='Sanitair X · € 425,00',meta='Volledig voor badkamer · betaald',to='expense-detail')]
 if p['id']=='project-costs':p['rows']=[dict(label=x,meta=y,to='expense-detail') for x,y in [('Sanitair X','€ 425 besteed'),('Gamma','€ 35 besteed van een bon van € 45'),('Transport','€ 40 te betalen'),('Tegels','€ 300 raming · geen bankbetaling')]]
 if p['id']=='visit-summary':p['rows']=[dict(label=x,meta=y,to='visit-item-adjust') for x,y in [('Boni Halfvolle Melk 1 l','2 pakken · voorraad in berging eenmaal bijgewerkt'),('Tomatenpuree','1 potje gekocht · nog niet in bijgehouden voorraad'),('Yoghurt','Nu niet: yoghurt · blijft op de boodschappenlijst')]]
 if p['id']=='visit-active':p['rows']=[dict(label=x,meta=y,to='visit-item-adjust') for x,y in [('Boni Halfvolle Melk 1 l','2 pakken · Colruyt'),('Tomatenpuree','1 potje · Colruyt'),('Yoghurt','1 pot · Collect&Go')]]
 if p['id']=='purchase-detail':p['rows']=[dict(label=x,meta=y,to='purchase-allocation') for x,y in [('Montagekit wit','2 × € 9,50 = € 19 · project badkamer'),('Schroeven','1 doos · € 16 · project badkamer'),('Verfroller','1 stuk · € 10 · huishouden')]]
 if p['id']=='visit-start':p['fields']=['Winkel of winkelgroep'];p['relations']=[]
 if p['kind']=='dialog':p['relations']=[]
# Connected home is a first-class context, not only an integrations settings card.
for id,owner,title,kind,goal,cta,route in [
 ('house-live','household','Ons huis · live','house','Wat is de toestand van het huis en wat kunnen we eenvoudig doen?','Ruimte openen','/house?tab=live'),
 ('room-live','places','Woonkamer · live','live','Klimaat, verlichting en gekoppelde taken in deze ruimte.','Toestel openen','/places/:id?tab=live'),
 ('ha-entities','home-assistant','Home Assistant · entiteiten','list','Vind gekoppelde entiteiten op ruimte, type en beschikbaarheid.','Entiteit koppelen','/home-assistant?tab=entities'),
 ('ha-entity','home-assistant','Lamp woonkamer · bron en status','live','De echte bronstatus en toegestane bediening, met actualiteit.','Bediening openen','/home-assistant?entity=:id'),
 ('ha-map','home-assistant','Huisentiteiten koppelen','form','Koppel bestaande entiteiten aan onze toestellen en ruimtes, zonder duplicaten.','Koppeling opslaan','/home-assistant?tab=mapping'),
 ('ha-scenes','home-assistant','Huisstanden','live','Bestaande Home Assistant-scènes herkenbaar starten met de juiste bevoegdheden.','Huisstand kiezen','/house?tab=scenes'),
 ('ha-connection','home-assistant','Home Assistant · verbinding','connections','Verbinding, synchronisatie en bronproblemen begrijpen.','Verbinding controleren','/home-assistant?tab=connection'),
 ('energy-live','energy','Energie · live en herkomst','energy','Metingen en actualiteit onderscheiden van tarieframing en echte uitgave.','Meter bekijken','/energy?tab=live'),
 ('device-live-controls','devices','Toestel · bediening en bron','live','Alleen bediening tonen die het toestel en de bron werkelijk ondersteunen.','Toestel bedienen','/devices/:id?tab=controls'),
]:add(id,owner,title,kind,goal,cta,route)
for p in P:
 if p['id']=='house':p['kind']='house'
 if p['id']=='house' or p['id']=='house-live':p['relations']=[{'label':'Ruimtes','to':'places'},{'label':'Toestellen','to':'devices'},{'label':'Energie','to':'energy-live'},{'label':'Home Assistant','to':'ha-entities'},{'label':'Huisstanden','to':'ha-scenes'}]
 if p['id']=='settings':p['rows']=[dict(label=title,meta=desc,to=target) for title,desc,target in [('Huishouden','Adres, bewoners en voorkeuren','settings-household'),('Bewoners en accounts','Toegang en rollen','settings-accounts'),('Meldingen','Kies kanalen en soorten','settings-notifications'),('AI en MCP','Toegang, context en bevestiging','settings-assistant'),('Koppelingen','Home Assistant, Drive en e-mail','integrations'),('Automatiseringen','Planning en resultaat','settings-automations'),('Activiteit','Wie wijzigde wat','settings-activity'),('Weergave en spelplezier','Thema en minder beweging','settings-display'),('Afval','Ophaalschema en taken','settings-waste'),('Weer','Locatie en weergave','settings-weather')]]
 if p['id']=='ha-map':p['fields']=['Home Assistant-entiteit','Bestaand toestel of nieuw toestel','Ruimte','Ondersteunde bediening controleren']
# Example media is explicit fixture metadata, separate from source identities and record mutations.
media_keys={'Badkamer vernieuwen':'bathroom','Pasta met tomatensaus':'pasta','Wasmachine':'laundry','Boni Halfvolle Melk 1 l':'milk'}
for p in P:
 p['coverKey']={'project-detail':'bathroom','recipe-detail':'pasta','device-detail':'laundry'}.get(p['id'])
 for row in p['rows']:row['mediaKey']=media_keys.get(row['label'])
# Quick filters have the same visual grammar, with domain-specific meaning.
for p in P:
 p['filters']={'income':['Alles','Verwacht','Ontvangen'],'expenses':['Alles','Te betalen','Betaald'],'tasks':['Alles','Nog te doen','Afgerond'],'projects':['Alles','Lopend','Afgerond'],'inventory':['Alles','Aanvullen','Voldoende'],'catalogue':['Alles','Met voorraad','Zonder voorraad'],'devices':['Alles','Onderhoud','Gekoppeld'],'documents':['Alles','Gekoppeld','Zonder koppeling']}.get(p['owner'],p['filters'])
# A stable review catalogue, not an implementation router.
ids=[p['id'] for p in P]
assert len(ids)==len(set(ids)), 'duplicate ids'
for p in P:
 for x in p['rows']:
  assert not x['to'] or x['to'] in ids,(p['id'],x['to'])
 for x in p['relations']:assert x['to'] in ids,(p['id'],x['to'])
features=sorted(p.name for p in (ROOT/'src/features').iterdir() if p.is_dir())
assert set(features)<=set(p['owner'] for p in P),set(features)-set(p['owner'] for p in P)
assert len(routes)==len([p for p in P if 'currentRoute' in p])
components=['AppShell','BrandMark','PageContainer','PageHeader','BreadcrumbTrail','PageGrid','Card','StatTile','Progress','GeneralList','GeneralForm','GeneralFormDialog','EntityPicker','SegmentedControl','EmptyState','ErrorState','Badge','Button']
meta=dict(generatedFrom='src/app/router.tsx + src/features + existing dialog components',routeCount=len(routes),dialogCount=len(T),featureCount=len(features),pageCount=len(P),features=features,components=components,note='Ontwerp met fictieve gegevens; actuele routes, nieuwe views en echte broncomponenten zijn expliciet gemarkeerd.')
(OUT/'catalog.nl.json').write_text(json.dumps(dict(meta=meta,pages=P),ensure_ascii=False,indent=2)+'\n')
print(json.dumps(meta,ensure_ascii=False,indent=2))

# Keep an explicit Dutch fixture and publish the design catalogue in English by default.
import subprocess,sys
subprocess.run([sys.executable,str(OUT/'localize_catalog.py')],check=True)

english=json.loads((OUT/'catalog.json').read_text())
lines=['# Page coverage','',f"{len(routes)} existing routes, {len(T)} existing dialogs and {len(features)} existing feature directories; {len(P)} distinct wireframes including tabs and proposed linking workflows.",'','English is the default interface language. The atlas also provides Dutch; technical source field names and route identifiers retain their original spelling.','','| Wireframe | Owner | Pattern | Current route / target | Source |','|---|---|---|---|---|']
for p in english['pages']:
 lines.append(f"| {p['id']} — {p['title']} | {p['owner']} | {p['kind']} | {p.get('currentRoute',p['route'] or 'Dialog / proposed view')} | {', '.join(p['source']) or 'New composition of existing components'} |")
(OUT/'coverage.md').write_text('\n'.join(lines)+'\n')
