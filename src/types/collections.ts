/** Small list helpers shared by feature contracts, the API and the browser (pure TypeScript). */

/** Sort comparator: by `name` (`items.sort(byName)`). */
export const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/** The total of `amountCents` over a list (money is integer cents). */
export const sumCents = (items: readonly { amountCents: number }[]) => items.reduce((sum, item) => sum + item.amountCents, 0);
