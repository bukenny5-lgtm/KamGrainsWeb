export async function logBusinessEvent(client, {
  eventCode,
  objectType,
  objectId,
  documentNo = null,
  companyId = null,
  branchId = null,
  locationId = null,
  userId = null,
  amount = null,
  currency = "UGX",
  reason = null,
  reference = null,
  journalId = null,
  relatedObjectId = null,
  metadata = {},
}) {
  if (!eventCode || !objectType || !objectId) return null;
  const result = await client.query(
    `SELECT audit.log_business_event($1,$2,$3::uuid,$4,$5::uuid,$6::uuid,$7::uuid,$8::uuid,$9::numeric,$10,$11,$12,$13::uuid,$14::uuid,$15::jsonb) AS event_id`,
    [eventCode, objectType, objectId, documentNo, companyId, branchId, locationId, userId, amount, currency, reason, reference, journalId, relatedObjectId, JSON.stringify(metadata || {})]
  );
  return result.rows[0]?.event_id || null;
}
