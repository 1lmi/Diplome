import type { Category, MenuItem, ProductDisplay } from "@/src/api/types";

function getBaseName(item: MenuItem) {
  return (item.product_name && item.product_name.trim()) || item.name.replace(/\s*\([^)]*\)\s*$/, "");
}

export function groupProducts(menu: MenuItem[]) {
  const grouped = new Map<string, ProductDisplay>();

  for (const item of menu) {
    const baseName = getBaseName(item);
    const key = `${item.category_id}|${baseName}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        id: item.id,
        key,
        category_id: item.category_id,
        name: baseName,
        description: item.description,
        image_url: item.image_url,
        variants: [],
        minPrice: item.price,
      });
    }

    const entry = grouped.get(key)!;
    entry.variants.push(item);
    entry.minPrice = Math.min(entry.minPrice, item.price);
  }

  const byCategory = new Map<number, ProductDisplay[]>();
  grouped.forEach((product) => {
    product.variants.sort((left, right) => left.price - right.price);
    if (!byCategory.has(product.category_id)) {
      byCategory.set(product.category_id, []);
    }
    byCategory.get(product.category_id)!.push(product);
  });

  return byCategory;
}

export function buildMenuSections(categories: Category[], menu: MenuItem[]) {
  const visibleCategories = categories.filter((item) => !item.is_hidden);
  const grouped = groupProducts(menu);

  return visibleCategories
    .map((category) => ({
      category,
      products: grouped.get(category.id) || [],
    }))
    .filter((section) => section.products.length > 0);
}

export function buildFeaturedProducts(menu: MenuItem[]) {
  const grouped = Array.from(groupProducts(menu).values()).flat();
  return grouped.slice(0, 6);
}

export function findProduct(menu: MenuItem[], productId: number) {
  const grouped = Array.from(groupProducts(menu).values()).flat();
  return grouped.find((item) => item.id === productId) || null;
}
