import type { Product, ShoppingItem } from "./shopping";
import type { CollectAndGoCart } from "./collect-and-go";
const nameKey = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("nl-BE").replace(/\s+/g, " ");
const isCollectAndGo = (value: string | null) => { try { return value !== null && new URL(value).hostname === "www.collectandgo.be"; } catch { return false; } };
/** Presence only, never a quantity conversion, substitute, stock update or purchase. */
export function collectAndGoMatches(items: ShoppingItem[], products: Product[], cart: CollectAndGoCart | undefined, usable: boolean, now = Date.now()): Set<string> {
  const matches = new Set<string>();
  if (!usable || !cart?.authenticated || now - Date.parse(cart.observedAt) > 90000 || Date.parse(cart.observedAt) > now + 5000 || !Number.isFinite(Date.parse(cart.observedAt))) return matches;
  const catalogue = new Map(products.map(product => [product.id, product]));
  for (const item of items) {
    if (item.status !== "open") continue;
    const product = item.productId ? catalogue.get(item.productId) : undefined;
    const links = product?.shopLinks.filter(link => isCollectAndGo(link.url)) ?? [];
    const names = new Set([item.name, ...(product ? [product.name] : [])].map(nameKey));
    const candidates = cart.items.filter(entry => (entry.url && (entry.url === item.url || links.some(link => link.url === entry.url))) || (entry.articleNumber && links.some(link => link.articleNumber === entry.articleNumber)) || names.has(nameKey(entry.name)));
    if (candidates.length === 1) matches.add(item.id);
  }
  return matches;
}
