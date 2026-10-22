// Seeds reference data. Safe to run repeatedly: missing built-in shops are added by catalog key, existing ones are left alone.
// Run with: npm run db:seed
import { db } from "../src/api/lib/db";
import { BELGIAN_SHOPS } from "../src/api/shops/belgian-shops";

async function seedShops() {
  for (const { key, ...shop } of BELGIAN_SHOPS) {
    await db.shop.upsert({
      where: { catalogKey: key },
      create: { catalogKey: key, ...shop },
      // Never overwrite: the owner may have edited a built-in shop. New catalogue entries are still added.
      update: {},
    });
  }
  console.log(`Seeded ${BELGIAN_SHOPS.length} built-in shops`);
}

try {
  await seedShops();
} finally {
  await db.$disconnect();
}
