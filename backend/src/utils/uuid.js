export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeUuid(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized && UUID_PATTERN.test(normalized) ? normalized : null;
}

export function requireAuthenticatedUserId(req) {
  const userId = normalizeUuid(req.user?.user_id);
  if (!userId) {
    const error = new Error("Authenticated user identity is missing or invalid.");
    error.statusCode = 401;
    throw error;
  }
  return userId;
}

export async function setDatabaseUserContext(client, req) {
  const userId = requireAuthenticatedUserId(req);
  await client.query("SELECT set_config('app.current_user_id', $1, true);", [userId]);
  return userId;
}
