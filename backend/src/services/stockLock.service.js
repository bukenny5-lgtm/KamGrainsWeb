const LOCK_PREFIX = "stock-fulfil:";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value, fieldName) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`Stock lock requires a valid ${fieldName}.`);
  }
  return value.toLowerCase();
}

export function stockLockKey(locationId, productId) {
  const normalizedLocationId = assertUuid(locationId, "location_id");
  const normalizedProductId = assertUuid(productId, "product_id");
  return `${LOCK_PREFIX}${normalizedLocationId}:${normalizedProductId}`;
}

/**
 * Validate the lightweight client contract used by the lock helper.
 *
 * This checks only that callers supplied a dedicated-client-shaped object. It
 * cannot prove that BEGIN has executed or that the transaction is active;
 * transaction ownership and lifetime remain the caller's responsibility.
 */
export function assertTransactionClient(client) {
  if (!client || typeof client.query !== "function" || typeof client.release !== "function") {
    throw new TypeError("Stock locks require a dedicated client with query() and release(); transaction state is caller-managed.");
  }
  return client;
}

export async function lockStockItems(client, items) {
  const keys = new Map();
  assertTransactionClient(client);
  if (!Array.isArray(items)) throw new TypeError("Stock lock items must be an array.");
  for (const item of items) {
    const locationId = assertUuid(item?.location_id, "location_id");
    const productId = assertUuid(item?.product_id, "product_id");
    const key = stockLockKey(locationId, productId);
    keys.set(`${locationId}:${productId}`, key);
  }

  const orderedKeys = [...keys.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, key]) => key);

  for (const key of orderedKeys) {
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
      [key]
    );
  }
}
