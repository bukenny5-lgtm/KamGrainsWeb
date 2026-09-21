-- Phase 22: safely read the request user UUID from PostgreSQL session context.
-- Empty or whitespace-only context must behave as NULL, never as an invalid UUID.
CREATE OR REPLACE FUNCTION sec.current_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $function$
BEGIN
    RETURN NULLIF(btrim(current_setting('app.current_user_id', true)), '')::uuid;
END;
$function$;
