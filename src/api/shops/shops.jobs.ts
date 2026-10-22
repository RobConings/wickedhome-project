import { registerJob } from "../jobs/job-registry";
import { retryMissingShopIcons } from "./shop-icon.service";

/** Retries shop icons whose last fetch failed (websites that were down, blocked us, or had no icon yet). */
registerJob({
  id: "shops.icons",
  schedule: "20 4 * * *",
  titleKey: "shops:jobs.icons.title",
  descriptionKey: "shops:jobs.icons.description",
  timeoutMs: 15 * 60 * 1000,
  run: async ({ signal, log }) => {
    const { due, fetched, failed } = await retryMissingShopIcons(signal);
    if (due > 0) log(`${due} shops without an icon: ${fetched} fetched, ${failed} failed`);
    return { summary: due === 0 ? "No icons missing" : `${fetched} of ${due} icons fetched` };
  },
});
