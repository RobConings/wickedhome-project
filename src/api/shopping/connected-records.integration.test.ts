import assert from "node:assert/strict";
import { after, it } from "node:test";
import { db } from "../lib/db";
import { shoppingSessionFixture as fixture } from "./sessions-test-helpers";
import { getExpenseAllocation, setExpenseAllocation } from "../expenses/project-allocation.service";
import { updateExpense } from "../expenses/expenses.service";
import { expenseInputSchema } from "@/features/expenses/types/expenses";
import { getProjectDetail } from "../projects/projects.service";
import { getMoneySummary } from "../money/money.service";
import { getDevicesOverview, setDeviceCover } from "../devices/devices.service";
import { attachFile } from "../documents/documents.service";
import { todayIn } from "@/types/dates";
const enabled = process.env.SHOPPING_INTEGRATION_TESTS === "1";
const options = { skip: !enabled };
after(async () => { if (enabled) await db.$disconnect(); });

it("one mixed expense allocates project/household costs, retries and corrections without a second account debit", options, async (t) => {
  const f = await fixture(t);
  const a = await db.project.create({ data: { householdId: f.home.id, name: "Bathroom", color: "#123456", budgetCents: 10000 } });
  const b = await db.project.create({ data: { householdId: f.home.id, name: "Garden", color: "#345678", budgetCents: 10000 } });
  const account = await db.paymentAccount.create({ data: { householdId: f.home.id, name: "Joint account", kind: "JOINT", color: "#123456", isDefault: true } });
  const expense = await db.expense.create({ data: { householdId: f.home.id, payee: "Mixed receipt", amountCents: 4500, category: "HOUSEHOLD", payerType: "JOINT", projectId: a.id, paymentAccountId: account.id, dueDate: new Date(todayIn()), paidOn: new Date(todayIn()) } });
  const before = await getMoneySummary(f.home.id);
  const original = await getExpenseAllocation(f.home.id, expense.id);
  const request = { revision: original.revision, householdCents: 1000, projects: [{ projectId: a.id, amountCents: 3500 }] };
  const allocated = await setExpenseAllocation(f.home.id, expense.id, request);
  await setExpenseAllocation(f.home.id, expense.id, request);
  assert.equal(allocated.unallocatedCents, 0);
  assert.equal((await getProjectDetail(f.home.id, a.id)).project.budget.spentCents, 3500);
  assert.equal((await getMoneySummary(f.home.id)).jointBalanceCents, before.jointBalanceCents);
  assert.equal((await getMoneySummary(f.home.id)).outPaidCents, 4500);
  const changed = await setExpenseAllocation(f.home.id, expense.id, { revision: allocated.revision, householdCents: 1000, projects: [{ projectId: a.id, amountCents: 2500 }, { projectId: b.id, amountCents: 1000 }] });
  assert.equal((await getProjectDetail(f.home.id, a.id)).project.budget.spentCents, 2500);
  assert.equal((await getProjectDetail(f.home.id, b.id)).project.budget.spentCents, 1000);
  await assert.rejects(setExpenseAllocation(f.home.id, expense.id, request), /expense changed/);
  await assert.rejects(setExpenseAllocation(f.home.id, expense.id, { ...request, revision: changed.revision, householdCents: 5000 }), /exceed/);
  await assert.rejects(updateExpense(f.home.id, expense.id, expenseInputSchema.parse({ payee: "Mixed receipt", amountCents: 4000, dueDate: todayIn(), category: "household", payerType: "joint", shares: [], paymentAccountId: account.id })), /allocation/);
  const foreign = await fixture(t);
  const foreignProject = await db.project.create({ data: { householdId: foreign.home.id, name: "Other home", color: "#123456" } });
  await assert.rejects(setExpenseAllocation(f.home.id, expense.id, { revision: changed.revision, householdCents: 1000, projects: [{ projectId: foreignProject.id, amountCents: 3500 }] }), /available/);
  await db.project.delete({ where: { id: b.id } });
  assert.ok((await getExpenseAllocation(f.home.id, expense.id)).projects.some((part) => part.projectId === null && part.name === "Garden" && part.amountCents === 1000));
  assert.equal(await db.expense.count({ where: { householdId: f.home.id } }), 1);
  assert.equal((await getMoneySummary(f.home.id)).jointBalanceCents, before.jointBalanceCents);
  assert.equal(await f.quantity(), 0);
});

it("device photos use attached household images, reject unrelated files and preserve device state", options, async (t) => {
  const f = await fixture(t);
  const profile = await db.deviceProfile.create({ data: { householdId: f.home.id, name: "Appliance", category: "APPLIANCE", icon: "plug", fields: [], rules: [] } });
  const device = await db.device.create({ data: { householdId: f.home.id, name: "Washing machine", profileId: profile.id, placeId: f.stock.placeId } });
  const image = await f.receipt();
  await db.documentFile.update({ where: { id: image.id }, data: { mimeType: "image/png", name: "washer.png" } });
  await assert.rejects(setDeviceCover(f.home.id, device.id, image.id), /attached/);
  await attachFile(f.home.id, { fileId: image.id, entityType: "device", entityId: device.id });
  await setDeviceCover(f.home.id, device.id, image.id);
  const shown = (await getDevicesOverview(f.home.id)).devices.find((item) => item.id === device.id)!;
  assert.equal(shown.coverFileId, image.id);
  assert.match(shown.imageUrl!, /\/api\/documents\/files\//);
  assert.equal(shown.place?.id, f.stock.placeId);
  const pdf = await f.receipt();
  await attachFile(f.home.id, { fileId: pdf.id, entityType: "device", entityId: device.id });
  await assert.rejects(setDeviceCover(f.home.id, device.id, pdf.id), /attached/);
  const foreign = await fixture(t);
  await assert.rejects(setDeviceCover(foreign.home.id, device.id, image.id), /not found/);
  await setDeviceCover(f.home.id, device.id, null);
  assert.equal((await getDevicesOverview(f.home.id)).devices.find((item) => item.id === device.id)!.imageUrl, null);
});

it("product brand is a real household record field with safe legacy updates, clearing and no stock effect", options, async (t) => {
  const { getProduct, listProducts, updateProduct } = await import("./shopping.service");
  const { productInputSchema } = await import("@/features/shopping/types/shopping");
  const f = await fixture(t);
  const original = await getProduct(f.home.id, f.product.id);
  const input = productInputSchema.parse({
    name: original.name,
    unit: original.unit,
    category: original.category,
    isEssential: original.isEssential,
    defaultShopId: original.defaultShopId,
    barcode: original.barcode,
    qrCode: original.qrCode,
    imageUrl: original.imageUrl,
    notes: original.notes,
    packageAmount: original.packageAmount,
    packageUnit: original.packageUnit,
  });
  assert.equal(original.brand, null);
  const withBrand = await updateProduct(f.home.id, f.product.id, { ...input, brand: "Verified Test Brand" });
  assert.equal(withBrand.brand, "Verified Test Brand");
  assert.deepEqual((await listProducts(f.home.id, { q: "verified test brand" })).map((product) => product.id), [f.product.id]);
  await updateProduct(f.home.id, f.product.id, { ...input, notes: "An older client changed notes without a brand field" });
  assert.equal((await getProduct(f.home.id, f.product.id)).brand, "Verified Test Brand", "Omitted brand must never clear the recorded value");
  const foreign = await fixture(t);
  assert.deepEqual(await listProducts(foreign.home.id, { q: "verified test brand" }), []);
  await assert.rejects(updateProduct(foreign.home.id, f.product.id, { ...input, brand: "Other home" }), /not found/i);
  const cleared = await updateProduct(f.home.id, f.product.id, { ...input, brand: null });
  assert.equal(cleared.brand, null);
  assert.deepEqual(await listProducts(f.home.id, { q: "verified test brand" }), []);
  assert.equal(await f.quantity(), 0, "Brand edits must not change stock");
  assert.equal(await db.stockMovement.count({ where: { householdId: f.home.id } }), 0);
  assert.equal(await db.expense.count({ where: { householdId: f.home.id } }), 0);
});

it("purchase history and catalogue context reuse the same requirements, variants and stock credit across projects", options, async (t) => {
  const { getPurchase, listPurchases } = await import("../purchases/purchases.service");
  const { getProductContext } = await import("../catalogue/catalogue.service");
  const { updateShoppingSessionItem } = await import("./sessions.service");
  const f = await fixture(t);
  const project = await db.project.create({ data: { householdId: f.home.id, name: "Pantry project", color: "#123456" } });
  const task = await db.task.create({ data: { householdId: f.home.id, title: "Prepare food", projectId: project.id } });
  await db.shoppingItem.update({ where: { id: f.requirement.id }, data: { taskId: task.id } });
  const variant = await db.product.create({ data: { householdId: f.home.id, name: "Other linked brand", category: "MEAT_FISH", unit: "pak", stockProductId: f.product.id } });
  const context = await getProductContext(f.home.id, variant.id);
  assert.equal(context.productId, f.product.id);
  assert.deepEqual(context.tasks.map((row) => row.id), [task.id]);
  assert.deepEqual(context.projects.map((row) => row.id), [project.id]);
  const session = await f.start();
  const item = session.items[0]!;
  const adjusted = await updateShoppingSessionItem(f.user, session.id, item.id, { revision: item.revision, operationId: "choose-variant", productId: variant.id });
  await updateShoppingSessionItem(f.user, session.id, item.id, { revision: adjusted.items.find((row) => row.id === item.id)!.revision, operationId: "acquire-once", status: "bought" });
  const purchases = await listPurchases(f.user, { productId: variant.id, projectId: project.id });
  assert.equal(purchases.length, 1);
  assert.deepEqual((await listPurchases(f.user, { requirementId: f.requirement.id })).map((row) => row.id), purchases.map((row) => row.id));
  const purchase = await getPurchase(f.user, purchases[0]!.id);
  assert.equal(purchase.lines[0]!.productId, variant.id);
  assert.equal(purchase.lines[0]!.name, variant.name);
  assert.equal(purchase.lines[0]!.quantity, 2);
  assert.equal(purchase.lines[0]!.stockQuantity, 2);
  assert.ok(purchase.lines[0]!.requirementIds.includes(f.requirement.id));
  assert.equal(await f.quantity(), 2);
  assert.equal(await db.stockMovement.count({ where: { householdId: f.home.id, reason: "BOUGHT" } }), 1);
  assert.equal(await db.expense.count({ where: { householdId: f.home.id } }), 0);
  const foreign = await fixture(t);
  await assert.rejects(getPurchase(foreign.user, purchase.id), /not found/);
  await assert.rejects(getProductContext(foreign.home.id, variant.id), /not found/);
  await assert.rejects(listPurchases(foreign.user, { projectId: project.id }), /not found/);
  await assert.rejects(listPurchases(foreign.user, { requirementId: f.requirement.id }), /not found/i);
  const child = await getPurchase({ ...f.user, role: "child" }, purchase.id);
  assert.equal(child.canReadMoney, false); assert.equal(child.totalCents, null); assert.equal(child.linkedPaidCents, null); assert.deepEqual(child.expenses, []);
  await db.product.delete({ where: { id: variant.id } });
  const historical = await getPurchase(f.user, purchase.id);
  assert.equal(historical.lines[0]!.name, "Other linked brand");
  assert.equal(historical.lines[0]!.catalogueProductId, f.product.id);
});

it("goods purpose allocates acquired quantities without consuming stock, completing needs or creating project costs", options, async (t) => {
  const { getGoodsAllocation, setGoodsAllocation } = await import("../purchases/goods-allocation.service");
  const { listPurchases } = await import("../purchases/purchases.service");
  const { getProductContext } = await import("../catalogue/catalogue.service");
  const { updateShoppingSessionItem } = await import("./sessions.service");
  const f = await fixture(t);
  const project = await db.project.create({ data: { householdId: f.home.id, name: "Bathroom", color: "#123456" } });
  const other = await db.project.create({ data: { householdId: f.home.id, name: "Garden", color: "#345678" } });
  const session = await f.start(); const item = session.items[0]!;
  await updateShoppingSessionItem(f.user, session.id, item.id, { revision: item.revision, operationId: "buy", status: "bought" });
  const acquisition = await db.stockPurchase.findFirstOrThrow({ where: { householdId: f.home.id } });
  const unchangedNeed = await db.shoppingItem.findUniqueOrThrow({ where: { id: f.requirement.id } });
  const current = await getGoodsAllocation(f.home.id, acquisition.id);
  assert.equal(current.explicit, false); assert.equal(current.unallocatedQuantity, 2);
  const request = { revision: current.revision, householdQuantity: 0.5, projects: [{ projectId: project.id, quantity: 1 }] };
  const allocated = await setGoodsAllocation(f.home.id, acquisition.id, request);
  assert.equal(allocated.unallocatedQuantity, 0.5);
  const retry = await setGoodsAllocation(f.home.id, acquisition.id, request);
  assert.equal(retry.revision, allocated.revision);
  assert.equal((await listPurchases(f.user, { projectId: project.id })).length, 1);
  assert.ok((await getProductContext(f.home.id, f.product.id)).projects.some((row) => row.id === project.id));
  const changed = await setGoodsAllocation(f.home.id, acquisition.id, { revision: allocated.revision, householdQuantity: 0.5, projects: [{ projectId: project.id, quantity: 1 }, { projectId: other.id, quantity: 0.5 }] });
  assert.equal(changed.unallocatedQuantity, 0);
  await assert.rejects(setGoodsAllocation(f.home.id, acquisition.id, request), /changed/);
  await assert.rejects(setGoodsAllocation(f.home.id, acquisition.id, { ...request, revision: changed.revision, householdQuantity: 2 }), /exceed/);
  const foreign = await fixture(t);
  await assert.rejects(setGoodsAllocation(foreign.home.id, acquisition.id, request), /not found/);
  assert.equal(await f.quantity(), 2);
  assert.equal(await db.stockMovement.count({ where: { householdId: f.home.id, reason: "BOUGHT" } }), 1);
  assert.equal(await db.expense.count({ where: { householdId: f.home.id } }), 0);
  assert.equal((await getProjectDetail(f.home.id, project.id)).project.budget.spentCents, 0);
  assert.deepEqual(await db.shoppingItem.findUniqueOrThrow({ where: { id: f.requirement.id } }), unchangedNeed);
  await db.project.delete({ where: { id: other.id } });
  assert.ok((await getGoodsAllocation(f.home.id, acquisition.id)).projects.some((part) => part.projectId === null && part.name === "Garden" && part.quantity === 0.5));
});

it("purpose quantities use the selected jars while canonical stock credit retains known grams", options, async (t) => {
  const { createShoppingSession, addShoppingSessionItem, updateShoppingSessionItem } = await import("./sessions.service");
  const { getPurchase } = await import("../purchases/purchases.service");
  const { setGoodsAllocation } = await import("../purchases/goods-allocation.service");
  const f = await fixture(t);
  await db.product.update({ where: { id: f.product.id }, data: { unit: "potje", packageAmount: 250, packageUnit: "g" } });
  await db.stockItem.update({ where: { id: f.stock.id }, data: { unit: "g", minQuantity: 500 } });
  await db.shoppingItem.update({ where: { id: f.requirement.id }, data: { unit: "potje" } });
  const empty = await createShoppingSession(f.user, { name: "Extra jars", shopIds: [f.shop.id], requirementIds: [], includeLowStock: true });
  const session = await addShoppingSessionItem(f.user, empty.id, { productId: f.product.id, quantity: 2, unit: "potje" });
  const item = session.items[0]!;
  const bought = await updateShoppingSessionItem(f.user, session.id, item.id, { revision: item.revision, operationId: "two-jars", status: "bought" });
  const purchase = await getPurchase(f.user, bought.purchases[0]!.id);
  const line = purchase.lines[0]!;
  assert.equal(await f.quantity(), 500);
  assert.equal(line.quantity, 2); assert.equal(line.unit, "potje");
  assert.equal(line.stockQuantity, 500); assert.equal(line.stockUnit, "g");
  assert.equal(bought.purchases[0]!.lines[0]!.purchasedQuantity, 2);
  const project = await db.project.create({ data: { householdId: f.home.id, name: "Pantry", color: "#123456" } });
  const allocation = await setGoodsAllocation(f.home.id, line.id, { revision: line.allocation.revision, householdQuantity: 1, projects: [{ projectId: project.id, quantity: 1 }] });
  assert.equal(allocation.unallocatedQuantity, 0); assert.equal(allocation.quantity, 2);
  assert.equal(await f.quantity(), 500);
});

it("product recipe links follow recorded shared-stock ingredients, isolate households and retain document ownership without changing stock", options, async (t) => {
  const { getProductContext } = await import("../catalogue/catalogue.service");
  const { listRecipesUsingProduct } = await import("../recipes/recipes.service");
  const { listLinkedFiles, detachFile } = await import("../documents/documents.service");
  const f = await fixture(t);
  const variant = await db.product.create({ data: { householdId: f.home.id, name: "Alternative", category: "MEAT_FISH", stockProductId: f.product.id } });
  const recipe = await db.recipe.create({ data: { householdId: f.home.id, name: "Family recipe", ingredients: { create: [
    { position: 0, name: "Main", productId: f.product.id }, { position: 1, name: "Alternative", productId: variant.id },
  ] } } });
  await db.recipe.create({ data: { householdId: f.home.id, name: "Unlinked namesake", ingredients: { create: { position: 0, name: f.product.name } } } });
  const foreign = await fixture(t);
  await db.recipe.create({ data: { householdId: foreign.home.id, name: "Foreign recipe", ingredients: { create: { position: 0, name: "Invalid cross-home historical link", productId: f.product.id } } } });
  assert.deepEqual((await listRecipesUsingProduct(f.home.id, variant.id)).map((row) => row.id), [recipe.id]);
  assert.deepEqual((await getProductContext(f.home.id, f.product.id)).recipes.map((row) => row.id), [recipe.id]);
  await assert.rejects(listRecipesUsingProduct(foreign.home.id, variant.id), /not found/);
  const file = await f.receipt();
  const link = { fileId: file.id, entityType: "product" as const, entityId: f.product.id };
  await attachFile(f.home.id, link);
  await attachFile(f.home.id, link);
  assert.equal((await listLinkedFiles(f.home.id, link)).length, 1);
  assert.equal((await listLinkedFiles(foreign.home.id, link)).length, 0);
  await assert.rejects(attachFile(foreign.home.id, link), /not found/);
  await detachFile(f.home.id, link);
  assert.equal((await listLinkedFiles(f.home.id, link)).length, 0);
  assert.ok(await db.documentFile.findUnique({ where: { id: file.id } }), "Detaching retains the document file");
  assert.equal(await f.quantity(), 0);
  assert.equal(await db.expense.count({ where: { householdId: f.home.id } }), 0);
});

it("document workspace resolves only recorded household owners, keeps attachment identity through rename/move, and hides missing or foreign references", options, async (t) => {
  const { getDocumentDetail, updateFile, createFolder } = await import("../documents/documents.service");
  const f = await fixture(t);
  const foreign = await fixture(t);
  const file = await f.receipt();
  await attachFile(f.home.id, { fileId: file.id, entityType: "product", entityId: f.product.id });
  await attachFile(f.home.id, { fileId: file.id, entityType: "product", entityId: foreign.product.id });
  await attachFile(f.home.id, { fileId: file.id, entityType: "task", entityId: "missing-task" });
  const before = await getDocumentDetail(f.home.id, file.id);
  assert.deepEqual(before.links.map((row) => [row.entityId, row.name, row.href]), [[f.product.id, f.product.name, `/inventory/products/${f.product.id}`]]);
  await assert.rejects(getDocumentDetail(foreign.home.id, file.id), /not found/i);
  const folder = await createFolder(f.home.id, { name: "Receipts" });
  await updateFile(f.home.id, file.id, { name: "Renamed receipt.pdf", folderId: folder.id });
  const after = await getDocumentDetail(f.home.id, file.id);
  assert.equal(after.file.id, file.id);
  assert.equal(after.file.name, "Renamed receipt.pdf");
  assert.equal(after.folder!.id, folder.id);
  assert.deepEqual(after.links, before.links);
  assert.equal(await f.quantity(), 0);
  assert.equal(await db.expense.count({ where: { householdId: f.home.id } }), 0);
});
