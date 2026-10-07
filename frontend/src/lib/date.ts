/** Format a PostgreSQL DATE without constructing a timezone-shifted Date. */
export function formatDateOnly(value: unknown): string {
  const raw = String(value ?? "").slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "—";
}
