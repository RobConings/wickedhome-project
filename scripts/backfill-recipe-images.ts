/**
 * Fill missing source photos without changing any other recipe data (including updatedAt).
 * Existing uploaded covers and source photos are never overwritten. Safe to run again.
 *
 *   npx tsx --env-file=.env scripts/backfill-recipe-images.ts --dry-run
 *   npx tsx --env-file=.env scripts/backfill-recipe-images.ts
 */
import { db } from "../src/api/lib/db";
import { recipeInputSchema } from "../src/features/recipes/types/recipes";
import { readPage } from "../src/api/web/web.service";

const dryRun = process.argv.includes("--dry-run");

try {
  const recipes = await db.recipe.findMany({
    where: { coverFileId: null, OR: [{ imageUrl: null }, { imageUrl: "" }], sourceUrl: { not: null } },
    select: { id: true, name: true, sourceUrl: true },
    orderBy: { name: "asc" },
  });
  let filled = 0;
  let failed = 0;
  for (const recipe of recipes) {
    if (!recipe.sourceUrl) continue;
    try {
      const page = await readPage(recipe.sourceUrl);
      const parsed = recipeInputSchema.shape.imageUrl.safeParse(page.recipe?.imageUrl ?? page.imageUrl);
      if (!parsed.success || !parsed.data) {
        console.log(`No photo: ${recipe.name}`);
        continue;
      }
      const imageUrl = parsed.data;
      // Raw SQL deliberately bypasses Prisma's @updatedAt. Recheck the source and missing cover at write time.
      const count = dryRun ? 1 : await db.$executeRaw`
        UPDATE "recipes" SET "imageUrl" = ${imageUrl}
        WHERE "id" = ${recipe.id} AND "sourceUrl" = ${recipe.sourceUrl}
          AND "coverFileId" IS NULL AND ("imageUrl" IS NULL OR "imageUrl" = '')
      `;
      filled += count;
      console.log(`${dryRun ? "Would fill" : count ? "Filled" : "Skipped changed recipe"}: ${recipe.name} → ${imageUrl}`);
    } catch (error) {
      failed += 1;
      console.error(`Could not read ${recipe.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`${dryRun ? "Would fill" : "Filled"} ${filled} of ${recipes.length} recipes; ${failed} source(s) failed.`);
  if (failed) process.exitCode = 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
