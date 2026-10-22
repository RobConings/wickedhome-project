import { registerJob } from "../jobs/job-registry";
import { cleanUpBarcodeCache } from "./barcode-lookup.service";

/**
 * Deletes barcode lookups long past reuse (hits after 180 days, misses after 30) and their cached photos,
 * except photos a saved product or shopping item still shows (barcode-cache.ts).
 */
registerJob({
  id: "shopping.barcode-cache",
  schedule: "35 4 * * *",
  titleKey: "shopping:jobs.barcodeCache.title",
  descriptionKey: "shopping:jobs.barcodeCache.description",
  run: async ({ signal, log }) => {
    const { rows, photos, kept, failedPhotos } = await cleanUpBarcodeCache({ signal, log });
    if (kept > 0) log(`${kept} expired lookups kept: their photo is in use or a scan is running`);
    const summary = rows === 0 ? "Nothing to clean up" : `${rows} old lookups and ${photos} photos removed`;
    if (failedPhotos > 0) throw new Error(`${summary}; ${failedPhotos} photos could not be deleted`);
    return { summary };
  },
});
