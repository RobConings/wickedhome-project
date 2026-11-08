/**
 * A variant may share stock with a main product. Treat an already-open need for either
 * product as the same household need instead of adding a duplicate from the product page.
 * This is a client-side preflight; the shopping service remains the owner of writes.
 */
export function productAlreadyOnList(
  productId: string,
  products: readonly { id: string; stockProductId: string | null }[],
  openItems: readonly { productId: string | null }[],
): boolean {
  const selected = products.find((product) => product.id === productId);
  const ownerId = selected?.stockProductId ?? productId;
  return openItems.some((item) => {
    const listed = products.find((product) => product.id === item.productId);
    return Boolean(listed && (listed.stockProductId ?? listed.id) === ownerId);
  });
}
