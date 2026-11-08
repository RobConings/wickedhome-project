# Page coverage

65 existing routes, 62 existing dialogs and 29 existing feature directories; 178 distinct wireframes including tabs and proposed linking workflows.

English is the default interface language. The atlas also provides Dutch; technical source field names and route identifiers retain their original spelling.

| Wireframe | Owner | Pattern | Current route / target | Source |
|---|---|---|---|---|
| dashboard — Today | dashboard | dashboard | / | src/routes/dashboard.tsx |
| login — Welcome home | auth | auth | /login | src/routes/login.tsx |
| setup — Set up your household | auth | setup | /setup | src/routes/setup.tsx |
| logout — Signed out | auth | auth | /logout | src/routes/logout.tsx |
| link — Access to WickedHome | auth | auth | /invite/:token | src/routes/link.tsx |
| password-reset — New password | auth | auth | /reset/:token | src/routes/link.tsx |
| connect — Connect AI | assistant | consent | /connect/:requestId | src/routes/connect.tsx |
| house — Our home | household | house | /house | src/routes/house.tsx |
| habitants — Residents | household | cards | /habitants | src/routes/habitants.tsx |
| contacts — Contacts | contacts | list | /contacts | src/routes/contacts.tsx |
| places — Spaces | places | cards | /places | src/routes/places.tsx |
| floor-plan — Floor plan · ground floor | places | map | /places/floors/:floorId/plan | src/routes/floor-plan.tsx |
| place-detail — Garage | places | detail | /places/:placeId | src/routes/place-detail.tsx |
| tasks — Tasks | tasks | list | /tasks | src/routes/tasks.tsx |
| task-detail — Install the bathroom cabinet | tasks | task | /tasks/:taskId | src/routes/task-detail.tsx |
| shops — Shops and shop groups | shops | cards | /shops | src/routes/shops.tsx |
| shop-detail — Gamma | shops | detail | /shops/:shopId | src/routes/shop-detail.tsx |
| shopping — Shopping | shopping | checklist | /shopping | src/routes/shopping.tsx |
| shopping-sessions — Shopping trips | shopping | cards | /shopping/sessions | src/routes/shopping-sessions.tsx |
| visit-active — Colruyt group · shopping trip | shopping | visit | /shopping/sessions/:sessionId | src/routes/shopping-sessions.tsx |
| shopping-shop-view — Shopping by shop | shopping | checklist | /shopping/shops | src/routes/shopping-shop-view.tsx |
| shopping-one-shop — Shopping · Gamma | shopping | checklist | /shopping/shops/:shopId | src/routes/shopping-shop-view.tsx |
| shopping-products — Products | catalogue | cards | /shopping/products | src/routes/shopping-products.tsx |
| purchases — Purchases | purchases | list | /purchases | src/routes/purchases.tsx |
| acquisition-detail — Gamma · €45.00 purchase | purchases | purchase | /purchases/acquisitions/:acquisitionId | src/routes/purchase-detail.tsx |
| purchase-detail — Gamma · €45.00 purchase | purchases | purchase | /purchases/:purchaseId | src/routes/purchase-detail.tsx |
| inventory — Inventory | inventory | list | /inventory | src/routes/inventory.tsx |
| inventory-count — Count stock | inventory | count | /inventory/count | src/routes/inventory-count.tsx |
| inventory-scan — Scan a product | inventory | scan | /inventory/scan | src/routes/inventory-scan.tsx |
| inventory-product — White mounting adhesive | catalogue | product | /inventory/products/:productId | src/routes/inventory-product.tsx |
| recipes — Recipes | recipes | cards | /recipes | src/routes/recipes.tsx |
| recipe-cooking — Cooking together | recipes | cooking | /recipes/cook/:entryId | src/routes/recipe-cooking.tsx |
| recipe-detail — Pasta with tomato sauce | recipes | recipe | /recipes/:recipeId | src/routes/recipe-detail.tsx |
| expenses — Expenses | expenses | list | /expenses | src/routes/expenses.tsx |
| recurring-expense-detail — Internet subscription | expenses | detail | /expenses/recurring/:recurringId | src/routes/recurring-expense-detail.tsx |
| expense-detail — Gamma · €45.00 | expenses | expense | /expenses/:expenseId | src/routes/expense-detail.tsx |
| income — Income | income | list | /income | src/routes/income.tsx |
| money — Cash flow | money | money | /money | src/routes/money.tsx |
| projects — Projects | projects | cards | /projects | src/routes/projects.tsx |
| project-detail — Bathroom renovation | projects | project | /projects/:projectId | src/routes/project-detail.tsx |
| bills — Redirect to Expenses | expenses | redirect | /bills | src/routes/bills.tsx |
| bill-redirect — Redirect to Expenses | expenses | redirect | /bills/:billId | src/routes/bills.tsx |
| subscriptions — Redirect to recurring expenses | expenses | redirect | /subscriptions | src/routes/subscriptions.tsx |
| subscription-redirect — Redirect to recurring expenses | expenses | redirect | /subscriptions/:subscriptionId | src/routes/subscriptions.tsx |
| documents — Documents | documents | list | /documents | src/routes/documents.tsx |
| documents-folder — Documents · bathroom | documents | list | /documents/folders/:folderId | src/routes/documents.tsx |
| documents-trash — Trash | documents | list | /documents/trash | src/routes/documents-trash.tsx |
| calendar — Calendar | calendar | calendar | /calendar | src/routes/calendar.tsx |
| calendar-event — Bathroom cabinet installation | calendar | detail | /calendar/events/:eventId | src/routes/calendar-event.tsx |
| energy — Energy | energy | energy | /energy | src/routes/energy.tsx |
| energy-appliances — Consumption by device | energy | list | /energy/appliances | src/routes/energy-appliances.tsx |
| energy-setup — Set up energy | energy | setup | /energy/setup | src/routes/energy-setup.tsx |
| energy-import — Import energy data | energy | import | /energy/import | src/routes/energy-import.tsx |
| devices — Devices | devices | cards | /devices | src/routes/devices.tsx |
| device-profiles — Device profiles | devices | cards | /devices/profiles | src/routes/device-profiles.tsx |
| device-profile — Profile · washing machine | devices | form | /devices/profiles/:profileId | src/routes/device-profile.tsx |
| device-detail — Washing machine | devices | detail | /devices/:deviceId | src/routes/device-detail.tsx |
| home-assistant — Home Assistant | home-assistant | connections | /home-assistant | src/routes/home-assistant.tsx |
| assistant — Assistant | assistant | chat | /assistant | src/routes/assistant.tsx |
| assistant-conversation — Conversation · bathroom | assistant | chat | /assistant/:conversationId | src/routes/assistant.tsx |
| settings — Settings | settings | settings | /settings | src/routes/settings.tsx |
| integrations — Connections | integrations | connections | /integrations | src/routes/integrations.tsx |
| documents-drive — Linked Drive folder | integrations | list | /documents/drive/:linkId | src/routes/documents-drive.tsx |
| notifications — Notifications | notifications | list | /notifications | src/routes/notifications.tsx |
| not-found — This page does not exist | auth | empty | /* | src/routes/not-found.tsx |
| visit-start — Start a shopping trip | shopping | visit-start | /shopping/sessions/new | New composition of existing components |
| visit-summary — Trip completed | shopping | visit-summary | /shopping/sessions/:id?tab=summary | New composition of existing components |
| visit-receipts — Receipts and payments | shopping | purchase | /shopping/sessions/:id?tab=receipts | New composition of existing components |
| shopping-staples — Recurring items | shopping | list | /shopping?tab=staples | New composition of existing components |
| shop-groups — Shop groups | shops | cards | /shops?tab=groups | New composition of existing components |
| product-stock — Mounting adhesive · stock | inventory | list | /products/:id?tab=stock | New composition of existing components |
| product-projects — Mounting adhesive · project use | projects | list | /products/:id?tab=projects | New composition of existing components |
| product-shops — Mounting adhesive · shops and variants | catalogue | list | /products/:id?tab=shops | New composition of existing components |
| project-tasks — Bathroom · tasks | projects | list | /projects/:id?tab=tasks | New composition of existing components |
| project-materials — Bathroom · requirements | projects | list | /projects/:id?tab=materials | New composition of existing components |
| project-purchases — Bathroom · purchases | projects | list | /projects/:id?tab=purchases | New composition of existing components |
| project-costs — Bathroom · costs | projects | costs | /projects/:id?tab=costs | New composition of existing components |
| project-documents — Bathroom · documents | documents | list | /projects/:id?tab=documents | New composition of existing components |
| expenses-history — Paid expenses | expenses | list | /expenses?tab=history | New composition of existing components |
| expenses-recurring — Recurring expenses | expenses | list | /expenses?tab=recurring | New composition of existing components |
| income-detail — Rob's salary · November | income | detail | /income?record=:id | New composition of existing components |
| account-detail — Joint account | money | money | /money?account=:id | New composition of existing components |
| recipes-all — All recipes | recipes | cards | /recipes?tab=all | New composition of existing components |
| cook-summary — Meal completed | recipes | visit-summary | /recipes/cook/:id?done=1 | New composition of existing components |
| automation-detail — Automation · inventory | automations | detail | /settings#automations | New composition of existing components |
| settings-household — Household settings | household | form | /settings#household | src/features/household/components/habitant-actions.tsx, src/features/household/components/habitant-type-badge.tsx, src/features/household/components/habitant-list-item.tsx |
| settings-account — My account | auth | form | /settings#account | src/features/auth/components/accounts-section.tsx, src/features/auth/components/setup-form.tsx, src/features/auth/components/link-qr-code.tsx |
| settings-accounts — Accounts and invitations | auth | form | /settings#accounts | src/features/auth/components/accounts-section.tsx, src/features/auth/components/setup-form.tsx, src/features/auth/components/link-qr-code.tsx |
| settings-notifications — Notification preferences | notifications | form | /settings#notifications | src/features/notifications/components/notification-bell.tsx, src/features/notifications/components/notification-settings-section.tsx, src/features/notifications/components/notification-row.tsx |
| settings-automations — Automations | automations | list | /settings#automations | src/features/automations/components/job-run-status-badge.tsx, src/features/automations/components/automations-section.tsx, src/features/automations/components/automation-job-row.tsx |
| settings-activity — Activity | audit | list | /settings#activity | src/features/audit/components/audit-entry-row.tsx, src/features/audit/components/activity-section.tsx |
| settings-weather — Weather settings | weather | list | /settings#weather | src/features/weather/components/weather-settings-section.tsx, src/features/weather/components/weather-icon.tsx, src/features/weather/components/weather-card.tsx |
| settings-waste — Waste settings | waste | list | /settings#waste | src/features/waste/components/waste-fraction-icon.tsx, src/features/waste/components/waste-task-settings.tsx, src/features/waste/components/waste-day-list.tsx |
| weather — Today's weather | weather | list | /settings#weather | src/features/weather/components/weather-settings-section.tsx, src/features/weather/components/weather-icon.tsx, src/features/weather/components/weather-card.tsx |
| waste — Waste calendar | waste | list | /settings#waste | src/features/waste/components/waste-fraction-icon.tsx, src/features/waste/components/waste-task-settings.tsx, src/features/waste/components/waste-day-list.tsx |
| settings-assistant — AI and MCP | assistant | form | /settings#assistant | src/features/assistant/components/voice-button.tsx, src/features/assistant/components/voice-picker.tsx, src/features/assistant/components/mcp-connections-panel.tsx |
| settings-display — Appearance and playfulness | settings | form | /settings#display | New composition of existing components |
| mail — Email suggestions | integrations | list | /settings#mail | src/features/integrations/components/project-mail-threads.tsx, src/features/integrations/components/mail-link-dialog.tsx, src/features/integrations/components/google-drive-panel.tsx |
| integration-health — Check connection | integrations | list | /settings#integration-health | src/features/integrations/components/project-mail-threads.tsx, src/features/integrations/components/mail-link-dialog.tsx, src/features/integrations/components/google-drive-panel.tsx |
| invite-dialog — Invite a resident | auth | dialog | Dialog / proposed view | src/features/auth/components/invite-dialog.tsx |
| share-link-dialog — Share invitation link | auth | dialog | Dialog / proposed view | src/features/auth/components/share-link-dialog.tsx |
| calendar-entry-dialog — View calendar item | calendar | dialog | Dialog / proposed view | src/features/calendar/components/calendar-entry-dialog.tsx |
| calendar-event-form-dialog — Edit appointment | calendar | dialog | Dialog / proposed view | src/features/calendar/components/calendar-event-form-dialog.tsx |
| contact-form-dialog — Edit contact | contacts | dialog | Dialog / proposed view | src/features/contacts/components/contact-form-dialog.tsx |
| device-form-dialog — Edit device | devices | dialog | Dialog / proposed view | src/features/devices/components/device-form-dialog.tsx |
| attach-document-dialog — Link an existing document | documents | dialog | Dialog / proposed view | src/features/documents/components/attach-document-dialog.tsx |
| document-preview-dialog — View document | documents | dialog | Dialog / proposed view | src/features/documents/components/document-preview-dialog.tsx |
| file-rename-dialog — Rename file | documents | dialog | Dialog / proposed view | src/features/documents/components/file-rename-dialog.tsx |
| folder-form-dialog — Manage a document folder | documents | dialog | Dialog / proposed view | src/features/documents/components/folder-form-dialog.tsx |
| move-to-folder-dialog — Move document | documents | dialog | Dialog / proposed view | src/features/documents/components/move-to-folder-dialog.tsx |
| appliance-form-dialog — Set up an energy device | energy | dialog | Dialog / proposed view | src/features/energy/components/appliance-form-dialog.tsx |
| battery-form-dialog — Set up battery | energy | dialog | Dialog / proposed view | src/features/energy/components/battery-form-dialog.tsx |
| gas-settings-form-dialog — Set up gas metering | energy | dialog | Dialog / proposed view | src/features/energy/components/gas-settings-form-dialog.tsx |
| solar-installation-form-dialog — Set up solar panels | energy | dialog | Dialog / proposed view | src/features/energy/components/solar-installation-form-dialog.tsx |
| expense-form-dialog — Edit expense | expenses | dialog | Dialog / proposed view | src/features/expenses/components/expense-form-dialog.tsx |
| log-expense-dialog — Record a paid expense | expenses | dialog | Dialog / proposed view | src/features/expenses/components/log-expense-dialog.tsx |
| mark-expense-paid-dialog — Confirm payment | expenses | dialog | Dialog / proposed view | src/features/expenses/components/mark-expense-paid-dialog.tsx |
| alarm-arm-dialog — Arm alarm | home-assistant | dialog | Dialog / proposed view | src/features/home-assistant/components/alarm-arm-dialog.tsx |
| alarm-disarm-dialog — Disarm alarm | home-assistant | dialog | Dialog / proposed view | src/features/home-assistant/components/alarm-disarm-dialog.tsx |
| ha-entity-picker-dialog — Choose a home entity | home-assistant | dialog | Dialog / proposed view | src/features/home-assistant/components/ha-entity-picker-dialog.tsx |
| habitant-form-dialog — Edit resident | household | dialog | Dialog / proposed view | src/features/household/components/habitant-form-dialog.tsx |
| income-form-dialog — Record income | income | dialog | Dialog / proposed view | src/features/income/components/income-form-dialog.tsx |
| income-source-form-dialog — Set up an income source | income | dialog | Dialog / proposed view | src/features/income/components/income-source-form-dialog.tsx |
| mail-link-dialog — Link email to a record | integrations | dialog | Dialog / proposed view | src/features/integrations/components/mail-link-dialog.tsx |
| mail-rules-dialog — Manage email rules | integrations | dialog | Dialog / proposed view | src/features/integrations/components/mail-rules-dialog.tsx |
| mail-suggestion-preview-dialog — Review email suggestion | integrations | dialog | Dialog / proposed view | src/features/integrations/components/mail-suggestion-preview-dialog.tsx |
| stock-item-form-dialog — Set up a stock location | inventory | dialog | Dialog / proposed view | src/features/inventory/components/stock-item-form-dialog.tsx |
| stocktake-dialog — Review stock count | inventory | dialog | Dialog / proposed view | src/features/inventory/components/stocktake-dialog.tsx |
| account-form-dialog — Manage a payment account | money | dialog | Dialog / proposed view | src/features/money/components/account-form-dialog.tsx |
| contribution-plan-dialog — Set up a contribution plan | money | dialog | Dialog / proposed view | src/features/money/components/contribution-plan-dialog.tsx |
| other-entry-dialog — Other account movement | money | dialog | Dialog / proposed view | src/features/money/components/other-entry-dialog.tsx |
| record-transfer-dialog — Record a transfer | money | dialog | Dialog / proposed view | src/features/money/components/record-transfer-dialog.tsx |
| set-balance-dialog — Set actual balance | money | dialog | Dialog / proposed view | src/features/money/components/set-balance-dialog.tsx |
| take-back-dialog — Return a contribution | money | dialog | Dialog / proposed view | src/features/money/components/take-back-dialog.tsx |
| floor-form-dialog — Manage a floor | places | dialog | Dialog / proposed view | src/features/places/components/floor-form-dialog.tsx |
| place-form-dialog — Manage a room | places | dialog | Dialog / proposed view | src/features/places/components/place-form-dialog.tsx |
| plan-import-dialog — Import floor plan | places | dialog | Dialog / proposed view | src/features/places/components/plan-import-dialog.tsx |
| link-invoice-materials-dialog — Link invoice lines to materials | projects | dialog | Dialog / proposed view | src/features/projects/components/link-invoice-materials-dialog.tsx |
| link-to-project-dialog — Link to a project | projects | dialog | Dialog / proposed view | src/features/projects/components/link-to-project-dialog.tsx |
| project-form-dialog — Edit project | projects | dialog | Dialog / proposed view | src/features/projects/components/project-form-dialog.tsx |
| goods-allocation-dialog — Allocate a purchase | purchases | dialog | Dialog / proposed view | src/features/purchases/components/goods-allocation-dialog.tsx |
| add-extra-dialog — Add an ingredient while cooking | recipes | dialog | Dialog / proposed view | src/features/recipes/components/add-extra-dialog.tsx |
| cooking-done-dialog — Finish cooking | recipes | dialog | Dialog / proposed view | src/features/recipes/components/cooking-done-dialog.tsx |
| recipe-categories-dialog — Manage recipe categories | recipes | dialog | Dialog / proposed view | src/features/recipes/components/recipe-categories-dialog.tsx |
| recipe-check-dialog — Check requirements | recipes | dialog | Dialog / proposed view | src/features/recipes/components/recipe-check-dialog.tsx |
| recipe-form-dialog — Edit recipe | recipes | dialog | Dialog / proposed view | src/features/recipes/components/recipe-form-dialog.tsx |
| add-shopping-item-dialog — Add a shopping item | shopping | dialog | Dialog / proposed view | src/features/shopping/components/add-shopping-item-dialog.tsx |
| link-alternative-dialog — Link a product variant | catalogue | dialog | Dialog / proposed view | src/features/shopping/components/link-alternative-dialog.tsx |
| product-form-dialog — Edit a product | catalogue | dialog | Dialog / proposed view | src/features/shopping/components/product-form-dialog.tsx |
| product-link-form-dialog — Add a shop link | catalogue | dialog | Dialog / proposed view | src/features/shopping/components/product-link-form-dialog.tsx |
| session-extra-dialog — Add an extra item | shopping | dialog | Dialog / proposed view | src/features/shopping/components/session-extra-dialog.tsx |
| session-item-adjust-dialog — Adjust quantity and linked variant | shopping | dialog | Dialog / proposed view | src/features/shopping/components/session-item-adjust-dialog.tsx |
| shopping-item-form-dialog — Edit a shopping item | shopping | dialog | Dialog / proposed view | src/features/shopping/components/shopping-item-form-dialog.tsx |
| shopping-list-form-dialog — Manage a shopping list | shopping | dialog | Dialog / proposed view | src/features/shopping/components/shopping-list-form-dialog.tsx |
| staple-form-dialog — Set up a recurring item | shopping | dialog | Dialog / proposed view | src/features/shopping/components/staple-form-dialog.tsx |
| shop-form-dialog — Edit shop | shops | dialog | Dialog / proposed view | src/features/shops/components/shop-form-dialog.tsx |
| shop-group-form-dialog — Create a shop group | shops | dialog | Dialog / proposed view | src/features/shops/components/shop-group-form-dialog.tsx |
| complete-task-dialog — Complete task | tasks | dialog | Dialog / proposed view | src/features/tasks/components/complete-task-dialog.tsx |
| task-blocked-dialog — Review dependency | tasks | dialog | Dialog / proposed view | src/features/tasks/components/task-blocked-dialog.tsx |
| task-form-dialog — Edit task | tasks | dialog | Dialog / proposed view | src/features/tasks/components/task-form-dialog.tsx |
| task-hold-dialog — Put task on hold | tasks | dialog | Dialog / proposed view | src/features/tasks/components/task-hold-dialog.tsx |
| shop-group-form — Create a shop group | shops | dialog | Dialog / proposed view | New composition of existing components |
| visit-item-adjust — Adjust a purchase line | shopping | dialog | Dialog / proposed view | New composition of existing components |
| visit-add-extra — Add an extra item | shopping | dialog | Dialog / proposed view | New composition of existing components |
| payment-link — Link an expense to a purchase | expenses | dialog | Dialog / proposed view | New composition of existing components |
| purchase-allocation — Allocate a purchase | purchases | dialog | Dialog / proposed view | New composition of existing components |
| stock-use-project — Use stock for a task | inventory | dialog | Dialog / proposed view | New composition of existing components |
| filter-panel — Filters and grouping | settings | dialog | Dialog / proposed view | New composition of existing components |
| global-search — Search WickedHome | dashboard | search | Dialog / proposed view | New composition of existing components |
| house-live — Our home · live | household | house | /house?tab=live | New composition of existing components |
| room-live — Living room · live | places | live | /places/:id?tab=live | New composition of existing components |
| ha-entities — Home Assistant · entities | home-assistant | list | /home-assistant?tab=entities | New composition of existing components |
| ha-entity — Living room lamp · source and state | home-assistant | live | /home-assistant?entity=:id | New composition of existing components |
| ha-map — Link home entities | home-assistant | form | /home-assistant?tab=mapping | New composition of existing components |
| ha-scenes — Home modes | home-assistant | live | /house?tab=scenes | New composition of existing components |
| ha-connection — Home Assistant · connection | home-assistant | connections | /home-assistant?tab=connection | New composition of existing components |
| energy-live — Energy · live and source | energy | energy | /energy?tab=live | New composition of existing components |
| device-live-controls — Device · controls and source | devices | live | /devices/:id?tab=controls | New composition of existing components |
