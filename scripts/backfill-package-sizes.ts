/**
 * Fills in missing package sizes ("content per package", docs/RECIPES.md → Units) by reading them from product
 * names: "BONI franse emmental geraspt 200 g" → 200 g, "Cola 6 x 33 cl" → 198 cl. Only products without a
 * package size are touched; a size that is set is never overwritten, so running it again changes nothing.
 *
 *   npx tsx --env-file=.env scripts/backfill-package-sizes.ts --dry-run   # print what it would set
 *   npx tsx --env-file=.env scripts/backfill-package-sizes.ts             # set it
 *
 * Uses DATABASE_URL (from .env or the environment), like the app.
 */
import { db } from "../src/api/lib/db";
import { packageSizeFromName } from "../src/api/shopping/barcode-lookup";

const dryRun = process.argv.includes("--dry-run");

try {
  const database = new URL(process.env.DATABASE_URL ?? "postgresql://unknown/unknown").pathname.slice(1);
  console.log(`${dryRun ? "Dry run" : "Backfilling"} on database "${database}"`);
  const products = await db.product.findMany({ where: { packageAmount: null, packageUnit: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  let set = 0;
  for (const product of products) {
    const size = packageSizeFromName(product.name);
    if (!size) continue;
    console.log(`${dryRun ? "would set" : "set"}: ${product.name} → ${size.amount} ${size.unit}`);
    if (!dryRun) {
      // Still empty at the moment of writing (never overwrite a size set meanwhile).
      const { count } = await db.product.updateMany({ where: { id: product.id, packageAmount: null, packageUnit: null }, data: { packageAmount: size.amount, packageUnit: size.unit } });
      set += count;
    } else set += 1;
  }
  console.log(`${dryRun ? "Would set" : "Set"} ${set} of ${products.length} products without a package size.`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
