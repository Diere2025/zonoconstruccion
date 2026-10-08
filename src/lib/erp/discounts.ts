/** Promotions, combos and quantity discounts reduce revenue; they are not inventory. */
export function isDiscountProduct(product: {name?: unknown; sku?: unknown}): boolean {
  return [product.name,product.sku].some(value=>/^\s*descuentos?\b/iu.test(String(value??'')));
}
