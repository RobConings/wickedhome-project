# How the app works: short notes per area, for app_help (one section is returned per topic)

Format: `## Title | keywords NL and EN`. Each section ≤ ~80 tokens, written for the person (not for developers).
Read at runtime by ai/core/app-map.ts; never part of the system prompt.

## Home (dashboard) | dashboard, start, overzicht, home, overview, vandaag, today
- The first page: today's tasks, agenda, bills due, waste collection, weather and quick actions.
- "+" (phone) or "Quick action" (sidebar) adds a task, shopping item, expense, event or income from any page; Ctrl/Cmd+K searches pages and actions.

## Household members | gezin, gezinslid, bewoner, habitant, member, kind, child, huisdier, pet, verjaardag, birthday
- Habitants are the people (adults, children), pets and guests of the house, with colour, emoji and birthday.
- Owners and adults add, edit and remove them on the Habitants page; someone with a login can't be removed (remove the login first).
- Birthdays show on the calendar.

## Accounts and roles | account, login, inloggen, uitnodigen, uitnodiging, nodig, invite, rol, role, eigenaar, owner, toegang, wachtwoord, password
- A login belongs to one habitant. Roles: owner (everything), adult (everything except owners), child (own tasks, shopping list, looking).
- Settings › Accounts: invite with a link or QR code (works once, expires), change a role, block or allow a login, make a password-reset link, remove a login.
- There is always at least one owner. Passwords are only set by the person themselves.

## Places and floor plan | kamer, kamers, ruimte, verdieping, plattegrond, grondplan, room, floor, floor plan, zone, tuin
- Places are rooms and outdoor zones, grouped per floor (indoor or outdoor), with area from the drawn shape.
- The floor-plan editor draws rooms, walls, doors and windows per floor; tasks, stock and devices can be linked to a place.

## Tasks | taak, taken, klusje, to-do, todo, chore, herhalen, recurring task, afvinken
- One list for chores, to-dos and maintenance, with due date, assignees, room, checklist, comments and repeat rules.
- Some tasks come from other areas (put the bins out, pay a bill, meal vouchers) and link back to them.
- Children complete their own tasks.

## Shopping | boodschappen, boodschappenlijst, winkel, shopping list, groceries, product, producten, vaste producten, staples
- One household list; items can have a shop, quantity and project. The shop view groups the list per shop.
- Products are the household catalogue (shared with stock); staples come back on a list on a schedule (milk every week).

## Shops | winkels, winkel, shop, store, supermarkt
- The household's shops with type, address and opening details; used to group the shopping list.

## Inventory | voorraad, stock, inventaris, scannen, barcode, houdbaar, vervaldatum, expiry, pantry, op
- Stock is "product at a place" with quantity, minimum and expiry date. Scan a barcode or the app's own QR label to use, add or look up stock; unknown barcodes are filled in automatically when known.
- Below the minimum, an item can go onto the shopping list.

## Calendar | agenda, kalender, afspraak, event, appointment, calendar, google agenda
- Household events with participants and categories, plus birthdays, waste collections, project dates and synced Google calendars.
- Google calendars are connected per person on the Integrations page; household events can be published to one Google calendar.

## Energy | energie, stroom, elektriciteit, gas, verbruik, meterstand, zonnepanelen, injectie, energy, electricity, consumption, meter, solar
- Usage per day, week, month and year for electricity and gas, from meter readings, an imported quarter-hour CSV of the grid operator, or Home Assistant sensors.
- Energy › setup sets meters and tariffs; Energy › import reads a CSV; Energy › appliances lists what uses electricity, per place.

## Documents | document, documenten, map, bestand, upload, prullenbak, trash, file, folder, pdf, drive
- Folders with uploaded files (bills, manuals, warranties), linkable to expenses, appliances, places and projects. Deleted files stay in the trash for a while.
- Google Drive folders can be linked in (read-only), and bill documents can be stored in a Drive folder (Integrations).

## Expenses and bills | uitgave, uitgaven, rekening, factuur, betalen, domiciliering, abonnement, lening, expense, bill, invoice, subscription, loan, recurring, terugkerend
- One kind of expense: a one-off bill, or a recurring one (subscription, loan, insurance) that creates instances. Each has a payee, amount, due date, payment method and who pays (joint account, one person, or split).
- Direct debits are marked paid automatically on their due date. Bills found in Gmail appear as "Suggested from mail" to accept, link or dismiss.

## Income | inkomen, inkomsten, loon, salaris, maaltijdcheques, income, salary, wage, meal vouchers
- Incomes per person (salary, benefits, meal vouchers) with their dates and amounts; meal vouchers belong to a person.

## Money flow | geldstroom, gezamenlijke rekening, spaarrekening, bijdrage, saldo, money flow, joint account, savings, contribution, balance
- Month by month: income, contributions to the joint accounts, joint outgoings and the balance the app follows; set the real balance when it drifts from the bank.

## Projects | project, projecten, verbouwing, renovatie, budget, project budget, renovation
- Budget pots (a renovation, a holiday) that tasks, expenses and shopping materials link to: in or out of budget, and by how much.

## Contacts | contact, contacten, adresboek, aannemer, loodgieter, leverancier, contractor, plumber, supplier, address book, telefoonnummer, phone number
- Everyone the household deals with (contractor, plumber, supplier, bank, school), grouped by trade, with phone numbers and email addresses to tap.
- A project's page shows who works on it and as what; link or add a contact there. Owners and adults change contacts; children look them up.

## Devices and the house | toestel, toestellen, apparaat, sensor, device, devices, profiel, profile, indicator, huis, house
- Devices have a profile (type with fields and indicator rules), a place and a spot on the floor plan; values are set by hand or follow Home Assistant live.
- The House page shows the plans with device indicators and the alarm.

## Home Assistant and the alarm | home assistant, alarm, alarmsysteem, inschakelen, arm, alarm panel
- Home Assistant connects household-wide (server setup); it feeds device states, energy statistics and the alarm.
- The alarm can be armed (home or away) by owners and adults; disarming is only done at the panel or in Home Assistant, never by the assistant.

## Assistant | assistent, chat, spraak, voice, mcp, assistant, ai
- The assistant runs on a local model in the house and does what you can do in the app, with the same rights. Changes ask for confirmation on a card; money, deletes, roles and the alarm always ask.
- Other assistants on the network can use it over MCP with a personal token (Integrations › Assistant).

## Integrations | integratie, integraties, koppeling, google, gmail, drive, verbinden, connect, integration, sync, synchroniseren
- Google per person (Integrations page): calendar, Gmail, "Send mail from the assistant" and Drive, each asked separately. Home Assistant and the assistant are household-wide.
- Assistant mails go out only after your tap on Send or Save as draft.
- Syncs run by themselves (Automations) or by hand. Connecting and disconnecting happen on the Integrations page.

## Notifications | melding, meldingen, notificatie, push, stille uren, quiet hours, notification, bell, bel
- The bell shows unread notifications; the Notifications page lists them (90 days). Push to phones is turned on per device in Settings › Notifications.
- Per kind you choose on/off and sometimes a time; quiet hours hold non-urgent ones until morning (the alarm always comes through).

## Settings | instellingen, settings, adres, address, weerbron, weather provider, taal, language, afvalophaler
- Settings has sections: household name and address (gives the weather its location), waste collector, weather source, my account, notifications, accounts, activity log, automations and a link to Integrations.
- Language is chosen in the account menu.

## Automations | automatisering, automatiseringen, geplande taak, job, jobs, scheduled, schedule, cron, achtergrond
- Work the app does by itself on a schedule (waste calendar sync, Google sync, auto-paying direct debits, clean-ups). Settings › Automations shows each with its schedule, last run and history.
- Owners and adults can run one now or pause it.

## Activity log | activiteit, logboek, audit, wie heeft, gewijzigd, history, who changed, activity, log
- Settings › Activity (owners and adults) lists who changed what, when, and through which channel: the app, the assistant, an MCP client or a scheduled job. Kept a year; never holds passwords or codes.

## Waste collection | afval, vuilnis, vuilbak, ophaling, pmd, gft, papier, waste, bins, garbage, recycling
- The collector's calendar is synced daily from the home address; collections show on the calendar and dashboard, and can create "bins out" tasks with notifications.

## Weather | weer, regen, temperatuur, weather, rain, forecast, voorspelling
- The forecast for the home's location from the chosen weather source (Settings › Weather); a default source stands in when the chosen one fails.
