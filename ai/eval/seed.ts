import type { SessionUser } from "@/features/auth/types/auth";
import { calendarEventInputSchema } from "@/features/calendar/types/calendar";
import { contactInputSchema } from "@/features/contacts/types/contacts";
import { applianceInputSchema } from "@/features/energy/types/energy";
import { expenseCreateInputSchema } from "@/features/expenses/types/expenses";
import { incomeInputSchema, incomeSourceCreateSchema } from "@/features/income/types/income";
import { accountCreateSchema, contributionPlanSchema } from "@/features/money/types/money";
import { floorPlanInputSchema } from "@/features/places/types/places";
import { projectInputSchema } from "@/features/projects/types/projects";
import { recipeInputSchema } from "@/features/recipes/types/recipes";
import { shopInputSchema } from "@/features/shops/types/shops";
import { productInputSchema } from "@/features/shopping/types/shopping";
import { taskCompleteInputSchema, taskInputSchema } from "@/features/tasks/types/tasks";
import { addDays, todayIn } from "@/types/dates";
import { setupHousehold } from "@/api/auth/auth.service";
import { createEvent } from "@/api/calendar/calendar.service";
import { createContact, linkContactToProject } from "@/api/contacts/contacts.service";
import { createExpense } from "@/api/expenses/expenses.service";
import { createHabitant } from "@/api/household/household.service";
import { createIncome, createIncomeSource } from "@/api/income/income.service";
import { db } from "@/api/lib/db";
import { createAccount, createPlan } from "@/api/money/money.service";
import { createFloor, createPlace, saveFloorPlan } from "@/api/places/places.service";
import { createDevice, createProfileFromPreset } from "@/api/devices/devices.service";
import { createAppliance } from "@/api/energy/energy.service";
import { createProject } from "@/api/projects/projects.service";
import { cookRecipe, createRecipe } from "@/api/recipes/recipes.service";
import { createStockItem } from "@/api/inventory/inventory.service";
import { createItem, createProduct } from "@/api/shopping/shopping.service";
import { createShop } from "@/api/shops/shops.service";
import { completeTask, createTask } from "@/api/tasks/tasks.service";

/**
 * The household the eval runs against, on a throwaway database: Rob (owner, asking), Clara (adult),
 * Lena (child, with a login) and Max (the dog); two floors and a garden with rooms; tasks (one overdue),
 * shopping items, products in stock, events, unpaid bills, a joint account and a shop. Created through the features' services,
 * so it looks like real data.
 */
export type EvalHousehold = { owner: SessionUser; child: SessionUser };

export async function seedEvalHousehold(): Promise<EvalHousehold> {
  const today = todayIn();
  const { userId } = await setupHousehold({ householdName: "Eval", name: "Rob", email: "rob@example.com", password: "a-long-password-1", locale: "nl" });
  const ownerRow = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { household: true } });
  const householdId = ownerRow.householdId;

  const clara = await createHabitant(householdId, { name: "Clara", type: "adult", color: "#3b82b6", birthday: "1988-03-02" });
  const lena = await createHabitant(householdId, { name: "Lena", type: "child", color: "#c2508a", birthday: "2016-05-12" });
  await createHabitant(householdId, { name: "Max", type: "pet", color: "#6b8f73" });
  const childRow = await db.user.create({
    data: { email: "lena@example.com", passwordHash: "x", role: "CHILD", locale: "nl", householdId, habitantId: lena.id },
  });

  const ground = await createFloor(householdId, { name: "Gelijkvloers", level: 0, kind: "indoor" });
  const first = await createFloor(householdId, { name: "Eerste verdieping", level: 1, kind: "indoor" });
  const garden = await createFloor(householdId, { name: "Tuin", level: 0, kind: "outdoor" });
  const kitchen = await createPlace(householdId, { name: "Keuken", floorId: ground.id, color: "#d4573b" });
  const living = await createPlace(householdId, { name: "Woonkamer", floorId: ground.id, color: "#124734" });
  const bathroom = await createPlace(householdId, { name: "Badkamer", floorId: first.id, color: "#3b82b6" });
  await createPlace(householdId, { name: "Slaapkamer Lena", floorId: first.id, color: "#c2508a" });
  await createPlace(householdId, { name: "Moestuin", floorId: garden.id, color: "#6b8f73" });
  // The ground floor drawn (fictional sizes): the living 6 × 4,5 m with the kitchen east of it and a door in
  // its south wall; a lamp, a window contact and a thermostat in the living, the dishwasher in the kitchen.
  const rect = (x: number, y: number, width: number, depth: number) => [{ x, y }, { x: x + width, y }, { x: x + width, y: y + depth }, { x, y: y + depth }];
  await saveFloorPlan(
    householdId,
    ground.id,
    floorPlanInputSchema.parse({
      gridSize: 25,
      places: [
        { id: living.id, name: living.name, color: living.color, polygon: rect(0, 0, 600, 450) },
        { id: kitchen.id, name: kitchen.name, color: kitchen.color, polygon: rect(600, 0, 400, 450) },
      ],
      elements: [
        { id: "wall-living-south", kind: "wall", a: { x: 0, y: 450 }, b: { x: 600, y: 450 }, thickness: 20 },
        { id: "door-living-south", kind: "door", wallId: "wall-living-south", offset: 100, width: 90, hingeAtEnd: false, swingFlipped: false },
      ],
    }),
  );
  await createDevice(householdId, { name: "Lamp living", profileId: (await createProfileFromPreset(householdId, "light", "nl")).id, placeId: living.id });
  await createDevice(householdId, { name: "Raam living", profileId: (await createProfileFromPreset(householdId, "contact", "nl")).id, placeId: living.id });
  await createDevice(householdId, { name: "Thermostaat", profileId: (await createProfileFromPreset(householdId, "climate", "nl")).id, placeId: living.id });
  await createAppliance(householdId, applianceInputSchema.parse({ name: "Vaatwasser", category: "dishwasher", placeId: kitchen.id }));

  const robHabitant = ownerRow.habitantId ?? "";
  const task = (input: Record<string, unknown>) => createTask(householdId, taskInputSchema.parse({ type: "todo", ...input }));
  await task({ title: "Vuilnisbakken buiten zetten", dueDate: addDays(today, 1), assigneeIds: [robHabitant] });
  await task({ title: "Badkamer poetsen", dueDate: addDays(today, -1), assigneeIds: [clara.id], placeId: bathroom.id });
  await task({ title: "Gras maaien", dueDate: addDays(today, 3), assigneeIds: [lena.id], checklist: [{ label: "Benzine bijvullen" }, { label: "Randen trimmen" }] });
  await task({ title: "Belastingaangifte invullen", assigneeIds: [robHabitant, clara.id] });

  // Its webshop is switched on for ingredient search (recipes_find_product; the eval's fake web has a page there).
  const shop = await createShop(
    householdId,
    shopInputSchema.parse({ name: "Delhaize", type: "supermarket", websiteUrl: "https://www.delhaize.be", hasWebshop: true, ingredientSearch: true }),
  );
  const owner: SessionUser = {
    id: ownerRow.id,
    email: ownerRow.email,
    name: "Rob",
    role: "owner",
    locale: "nl",
    householdId,
    householdName: ownerRow.household.name,
    habitantId: ownerRow.habitantId,
  };
  await createItem(owner, { name: "Melk", quantity: 2, source: "manual" });
  await createItem(owner, { name: "Brood", shopId: shop.id, source: "manual" });

  // A task already done (to reopen), and stock: tomatoes enough, rice running low, coffee with a barcode.
  const windows = await task({ title: "Ramen wassen", dueDate: today, assigneeIds: [clara.id] });
  await completeTask(owner, windows.id, taskCompleteInputSchema.parse({}));
  const product = (input: Record<string, unknown>) => createProduct(householdId, productInputSchema.parse(input));
  const tomatoes = await product({ name: "Tomaten in blik", unit: "blik", category: "pantry", defaultShopId: shop.id });
  const rice = await product({ name: "Rijst", unit: "pak", category: "pantry" });
  await product({ name: "Koffie", unit: "pak", category: "drinks", barcode: "5400000000017" });
  await createStockItem(owner, { productId: tomatoes.id, placeId: kitchen.id, quantity: 6, minQuantity: 2 });
  await createStockItem(owner, { productId: rice.id, placeId: kitchen.id, quantity: 1, minQuantity: 2 });

  // A recipe with products (basil is free text: no product yet), being cooked right now.
  const garlic = await product({ name: "Look", unit: "stuk", category: "produce" });
  const pasta = await product({ name: "Spaghetti", unit: "pak", category: "pantry" });
  const minced = await product({ name: "Gehakt", unit: "pak", category: "meat_fish" });
  await createStockItem(owner, { productId: garlic.id, placeId: kitchen.id, quantity: 3 });
  await createStockItem(owner, { productId: pasta.id, placeId: kitchen.id, quantity: 2 });
  const bolognese = await createRecipe(
    owner,
    recipeInputSchema.parse({
      name: "Spaghetti bolognese",
      servings: 4,
      sourceUrl: "https://www.kookboek.example/recepten/spaghetti-bolognese",
      ingredients: [
        { productId: pasta.id, name: "Spaghetti", quantity: 1, unit: "pak", note: "400 g" },
        { productId: minced.id, name: "Gehakt", quantity: 1, unit: "pak", note: "500 g" },
        { productId: garlic.id, name: "Look", quantity: 2, unit: "stuk", note: "2 teentjes" },
        { productId: tomatoes.id, name: "Tomaten in blik", quantity: 1, unit: "blik" },
        { name: "Verse basilicum", note: "1 bosje" },
      ],
      steps: [
        { text: "Bak het gehakt rul in een pan." },
        { text: "Voeg de look en de tomaten toe en laat 20 min sudderen.", timerMinutes: 20 },
        { text: "Kook de spaghetti 10 minuten.", timerMinutes: 10 },
        { text: "Werk af met basilicum." },
      ],
    }),
  );
  await cookRecipe(owner, bolognese.id);

  const event = (input: Record<string, unknown>) => createEvent(householdId, calendarEventInputSchema.parse(input));
  await event({ title: "Tandarts Lena", allDay: false, startDate: addDays(today, 2), endDate: addDays(today, 2), startTime: "14:00", endTime: "14:30", participantIds: [lena.id] });
  await event({ title: "Etentje bij oma", allDay: false, startDate: addDays(today, 5), endDate: addDays(today, 5), startTime: "18:00", endTime: "21:00", participantIds: [] });

  // Finance (fictional): the joint and savings accounts with opening balances, bills with payment details, a
  // subscription and a loan, incomes, contribution plans and a project with a budget.
  const monthStart = `${today.slice(0, 7)}-01`;
  const joint = await createAccount(householdId, ownerRow.id, accountCreateSchema.parse({ name: "Gezamenlijke rekening", kind: "joint", openingBalanceCents: 210_000, openingDate: monthStart, ownerIds: [robHabitant, clara.id] }));
  await createAccount(householdId, ownerRow.id, accountCreateSchema.parse({ name: "Spaarrekening", kind: "savings", openingBalanceCents: 1_250_000, openingDate: monthStart, ownerIds: [robHabitant, clara.id] }));
  const expense = (input: Record<string, unknown>) => createExpense(householdId, expenseCreateInputSchema.parse({ payerType: "joint", ...input }));
  await expense({ payee: "Fluvius", amountCents: 8540, category: "energy", dueDate: addDays(today, 3), paymentMethod: "wire_transfer", iban: "BE68539007547034", structuredCommunication: "123456789002" });
  await expense({ payee: "Proximus", amountCents: 5999, category: "internet_phone", dueDate: addDays(today, 5), paymentMethod: "direct_debit" });
  await expense({ payee: "Netflix", amountCents: 1799, category: "subscriptions", dueDate: addDays(today, 10), paymentMethod: "direct_debit", rrule: "FREQ=MONTHLY", kind: "subscription", payerType: "person", payerHabitantId: clara.id });
  await expense({ payee: "Lening auto", amountCents: 32_000, category: "loans", dueDate: addDays(today, 12), paymentMethod: "direct_debit", rrule: "FREQ=MONTHLY", kind: "loan", totalOpenCents: 950_000 });
  const source = (input: Record<string, unknown>) => createIncomeSource(householdId, incomeSourceCreateSchema.parse({ rrule: "FREQ=MONTHLY", startDate: monthStart, ...input }));
  await source({ name: "Loon Clara", kind: "salary", habitantId: clara.id, amountCents: 245_000 });
  await source({ name: "Maaltijdcheques Rob", kind: "meal_vouchers", habitantId: robHabitant, amountMode: "variable", estimateCents: 16_000 });
  // A recorded one-off this month (to delete: "het bedrag klopte niet").
  await createIncome(householdId, incomeInputSchema.parse({ habitantId: clara.id, date: monthStart, amountCents: 12_000, kind: "sale", description: "Verkoop oude fiets" }));
  const plan = (habitantId: string, amountCents: number) => createPlan(householdId, contributionPlanSchema.parse({ habitantId, accountId: joint.id, amountCents, dayOfMonth: 1, activeFrom: monthStart }));
  await plan(robHabitant, 145_000);
  await plan(clara.id, 120_000);
  const bathroomProject = await createProject(householdId, projectInputSchema.parse({ name: "Badkamer renovatie", color: "#3b82b6", tag: "renovation", budgetCents: 500_000, status: "active", placeIds: [bathroom.id] }));

  // Contacts (fictional names, example.be addresses, made-up numbers): a contractor, a plumber on the bathroom
  // project, and the school.
  const contact = (input: Record<string, unknown>) => createContact(owner, contactInputSchema.parse(input));
  await contact({ name: "Jan Peeters", company: "Bouwbedrijf Peeters", trade: "aannemer", emails: ["jan@peeters.example.be"], phones: ["+32 470 11 22 33"] });
  const plumber = await contact({ name: "Waterwerken Janssens", trade: "loodgieter", emails: ["info@janssens.example.be"], phones: ["0478 00 00 01"] });
  await linkContactToProject(householdId, plumber.id, bathroomProject.id, { role: "loodgieter" });
  await contact({ name: "Basisschool De Linde", trade: "school", emails: ["secretariaat@delinde.example.be"] });

  // Integrations and notifications (fictional): Rob's Google connection (Gmail read + "send mail from the
  // assistant") with one bill found in his mail, and an unread notification. The "token" is a placeholder: the
  // eval never reaches Google (mail reads fail on it; writes stop at the card).
  const google = await db.googleConnection.create({
    data: { userId: ownerRow.id, householdId, googleAccountEmail: "rob@example.com", googleSubject: "eval-subject", refreshTokenEnc: "v1.eval.placeholder.x", scopes: ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.compose"] },
  });
  await db.mailBillSuggestion.create({
    data: { householdId, connectionId: google.id, gmailMessageId: "eval-message-1", payee: "Telenet", category: "internet_phone", subject: "Uw factuur van Telenet", receivedAt: new Date(`${addDays(today, -1)}T08:00:00Z`), amountCents: 6450, dueDate: new Date(`${addDays(today, 14)}T00:00:00Z`), dedupeKey: "eval-telenet-1" },
  });
  await db.notification.create({ data: { userId: ownerRow.id, kind: "waste.bins", title: "PMD buiten zetten", body: "Morgen wordt PMD opgehaald." } });

  return { owner, child: { ...owner, id: childRow.id, email: childRow.email, name: "Lena", role: "child", habitantId: lena.id } };
}
