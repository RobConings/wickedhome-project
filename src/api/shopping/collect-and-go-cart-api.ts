import type { CollectAndGoCart, CollectAndGoState } from "@/features/shopping/types/collect-and-go";
import { collectAndGoUnverified as invalid, retailerRecord as record, retailerDecimal as decimal, readCollectAndGoResponse } from "./collect-and-go-api";

/** Sanitized contract based on the actual wcscartsvcv2 response, never a guest or placed order. */
export function parseCollectAndGoCartResponse(raw: unknown): CollectAndGoCart {
  const cart = record(raw);
  if (!cart || cart.resourceName !== "cart" || cart.orderStatus !== "P" || typeof cart.orderId !== "string" || !cart.orderId || typeof cart.x_xtraEmailId !== "string" || !/^[^\s@]+@[^\s@]+$/.test(cart.x_xtraEmailId) || cart.totalProductPriceCurrency !== "EUR") throw invalid();
  const total = decimal(cart.recordSetTotal), count = decimal(cart.recordSetCount), start = decimal(cart.recordSetStartNumber);
  // Collect&Go omits orderItem entirely for a verified, signed-in empty basket.
  const rows = cart.orderItem === undefined && total === 0 && count === 0 && start === 0 ? [] : cart.orderItem;
  if (!Array.isArray(rows)) throw invalid();
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(count) || start !== 0 || total < rows.length || count !== rows.length) throw invalid();
  const items = rows.slice(0, 500).map((value) => {
    const item = record(value), quantity = decimal(item?.quantity);
    if (!item || item.currency !== "EUR" || typeof item.xitem_productName !== "string" || !item.xitem_productName.trim() || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) throw invalid();
    const price = decimal(item.unitPrice);
    return { ...(typeof item.productId === "string" && /^\d{1,20}$/.test(item.productId) && { productId: item.productId }), ...(typeof item.partNumber === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(item.partNumber) && { articleNumber: item.partNumber }), name: item.xitem_productName.trim().slice(0, 300), url: null, quantity, unitPriceCents: Number.isFinite(price) && price >= 0 && price < 1000000 ? Math.round(price * 100) : null };
  });
  return { authenticated: true, observedAt: new Date().toISOString(), items, truncated: total > items.length };
}

/** Read the pending basket; placed reservations are exposed separately. */
export async function fetchCollectAndGoCart(state: CollectAndGoState, signal: AbortSignal): Promise<CollectAndGoCart> {
  const response = await readCollectAndGoResponse(state, "cart/@self", signal);
  const cart = parseCollectAndGoCartResponse(response.body);
  response.acceptSessionCookies();
  return cart;
}
