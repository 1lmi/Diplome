import type { CartItem, ProductDisplay } from "./types";

export function buildAvailableProductSizeIds(products: ProductDisplay[]) {
  const ids = new Set<number>();

  for (const product of products) {
    for (const variant of product.variants) {
      ids.add(variant.id);
    }
  }

  return ids;
}

export function getUnavailableCartItems(items: CartItem[], products: ProductDisplay[]) {
  const availableIds = buildAvailableProductSizeIds(products);
  return items.filter((item) => !availableIds.has(item.productSizeId));
}
