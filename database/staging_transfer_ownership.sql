-- ============================================================
-- KAM GRAINS STAGING OWNERSHIP TRANSFER
-- DATABASE: kam_grains_staging ONLY
-- NEW OWNER: kam_grains_staging_dev
-- ============================================================

-- ------------------------------------------------------------
-- SAFETY CHECK
-- ------------------------------------------------------------
DO $$
BEGIN
    IF current_database() <> 'kam_grains_staging' THEN
        RAISE EXCEPTION
            'STOP: Expected kam_grains_staging but connected to %',
            current_database();
    END IF;

    IF current_user <> 'postgres' THEN
        RAISE EXCEPTION
            'STOP: This ownership transfer must be run as postgres. Current user: %',
            current_user;
    END IF;
END
$$;


-- ------------------------------------------------------------
-- DATABASE OWNERSHIP
-- ------------------------------------------------------------
ALTER DATABASE kam_grains_staging
OWNER TO kam_grains_staging_dev;


-- ------------------------------------------------------------
-- APPLICATION SCHEMA OWNERSHIP
-- ------------------------------------------------------------
ALTER SCHEMA app
OWNER TO kam_grains_staging_dev;

ALTER SCHEMA audit
OWNER TO kam_grains_staging_dev;

ALTER SCHEMA fin
OWNER TO kam_grains_staging_dev;

ALTER SCHEMA inv
OWNER TO kam_grains_staging_dev;

ALTER SCHEMA mfg
OWNER TO kam_grains_staging_dev;

ALTER SCHEMA pur
OWNER TO kam_grains_staging_dev;

ALTER SCHEMA reporting
OWNER TO kam_grains_staging_dev;

ALTER SCHEMA rpt
OWNER TO kam_grains_staging_dev;

ALTER SCHEMA sal
OWNER TO kam_grains_staging_dev;

ALTER SCHEMA sec
OWNER TO kam_grains_staging_dev;


-- ------------------------------------------------------------
-- TABLES, PARTITIONED TABLES, VIEWS,
-- MATERIALIZED VIEWS, SEQUENCES AND FOREIGN TABLES
-- ------------------------------------------------------------
DO $$
DECLARE
    r record;
    cmd text;
BEGIN
    FOR r IN
        SELECT
            n.nspname AS schema_name,
            c.relname AS object_name,
            c.relkind
        FROM pg_class c
        JOIN pg_namespace n
          ON n.oid = c.relnamespace
        WHERE n.nspname IN (
            'app',
            'audit',
            'fin',
            'inv',
            'mfg',
            'pur',
            'reporting',
            'rpt',
            'sal',
            'sec'
        )
        AND c.relkind IN (
            'r',  -- table
            'p',  -- partitioned table
            'v',  -- view
            'm',  -- materialized view
            'S',  -- sequence
            'f'   -- foreign table
        )
        AND NOT EXISTS (
            SELECT 1
            FROM pg_depend d
            WHERE d.classid = 'pg_class'::regclass
              AND d.objid = c.oid
              AND d.deptype = 'e'
        )
        ORDER BY n.nspname, c.relname
    LOOP

        cmd :=
            CASE r.relkind

                WHEN 'r' THEN
                    format(
                        'ALTER TABLE %I.%I OWNER TO kam_grains_staging_dev',
                        r.schema_name,
                        r.object_name
                    )

                WHEN 'p' THEN
                    format(
                        'ALTER TABLE %I.%I OWNER TO kam_grains_staging_dev',
                        r.schema_name,
                        r.object_name
                    )

                WHEN 'v' THEN
                    format(
                        'ALTER VIEW %I.%I OWNER TO kam_grains_staging_dev',
                        r.schema_name,
                        r.object_name
                    )

                WHEN 'm' THEN
                    format(
                        'ALTER MATERIALIZED VIEW %I.%I OWNER TO kam_grains_staging_dev',
                        r.schema_name,
                        r.object_name
                    )

                WHEN 'S' THEN
                    format(
                        'ALTER SEQUENCE %I.%I OWNER TO kam_grains_staging_dev',
                        r.schema_name,
                        r.object_name
                    )

                WHEN 'f' THEN
                    format(
                        'ALTER FOREIGN TABLE %I.%I OWNER TO kam_grains_staging_dev',
                        r.schema_name,
                        r.object_name
                    )

            END;

        RAISE NOTICE '%', cmd;
        EXECUTE cmd;

    END LOOP;
END
$$;


-- ------------------------------------------------------------
-- FUNCTIONS AND PROCEDURES
-- ------------------------------------------------------------
DO $$
DECLARE
    r record;
    cmd text;
BEGIN
    FOR r IN
        SELECT
            p.oid,
            n.nspname AS schema_name,
            p.proname AS routine_name,
            p.prokind,
            pg_get_function_identity_arguments(p.oid) AS identity_args
        FROM pg_proc p
        JOIN pg_namespace n
          ON n.oid = p.pronamespace
        WHERE n.nspname IN (
            'app',
            'audit',
            'fin',
            'inv',
            'mfg',
            'pur',
            'reporting',
            'rpt',
            'sal',
            'sec'
        )
        AND p.prokind IN ('f', 'p')
        AND NOT EXISTS (
            SELECT 1
            FROM pg_depend d
            WHERE d.classid = 'pg_proc'::regclass
              AND d.objid = p.oid
              AND d.deptype = 'e'
        )
        ORDER BY n.nspname, p.proname
    LOOP

        IF r.prokind = 'p' THEN

            cmd := format(
                'ALTER PROCEDURE %I.%I(%s) OWNER TO kam_grains_staging_dev',
                r.schema_name,
                r.routine_name,
                r.identity_args
            );

        ELSE

            cmd := format(
                'ALTER FUNCTION %I.%I(%s) OWNER TO kam_grains_staging_dev',
                r.schema_name,
                r.routine_name,
                r.identity_args
            );

        END IF;

        RAISE NOTICE '%', cmd;
        EXECUTE cmd;

    END LOOP;
END
$$;


-- ------------------------------------------------------------
-- ENUMS AND DOMAINS
-- ------------------------------------------------------------
DO $$
DECLARE
    r record;
    cmd text;
BEGIN
    FOR r IN
        SELECT
            n.nspname AS schema_name,
            t.typname AS type_name,
            t.typtype
        FROM pg_type t
        JOIN pg_namespace n
          ON n.oid = t.typnamespace
        WHERE n.nspname IN (
            'app',
            'audit',
            'fin',
            'inv',
            'mfg',
            'pur',
            'reporting',
            'rpt',
            'sal',
            'sec'
        )
        AND t.typtype IN ('d', 'e')
        AND NOT EXISTS (
            SELECT 1
            FROM pg_depend d
            WHERE d.classid = 'pg_type'::regclass
              AND d.objid = t.oid
              AND d.deptype = 'e'
        )
        ORDER BY n.nspname, t.typname
    LOOP

        IF r.typtype = 'd' THEN

            cmd := format(
                'ALTER DOMAIN %I.%I OWNER TO kam_grains_staging_dev',
                r.schema_name,
                r.type_name
            );

        ELSE

            cmd := format(
                'ALTER TYPE %I.%I OWNER TO kam_grains_staging_dev',
                r.schema_name,
                r.type_name
            );

        END IF;

        RAISE NOTICE '%', cmd;
        EXECUTE cmd;

    END LOOP;
END
$$;


-- ------------------------------------------------------------
-- PRIVILEGES
-- ------------------------------------------------------------
GRANT CONNECT, TEMP
ON DATABASE kam_grains_staging
TO kam_grains_staging_dev;

GRANT USAGE, CREATE
ON SCHEMA
    app,
    audit,
    fin,
    inv,
    mfg,
    pur,
    reporting,
    rpt,
    sal,
    sec
TO kam_grains_staging_dev;

GRANT ALL PRIVILEGES
ON ALL TABLES
IN SCHEMA
    app,
    audit,
    fin,
    inv,
    mfg,
    pur,
    reporting,
    rpt,
    sal,
    sec
TO kam_grains_staging_dev;

GRANT ALL PRIVILEGES
ON ALL SEQUENCES
IN SCHEMA
    app,
    audit,
    fin,
    inv,
    mfg,
    pur,
    reporting,
    rpt,
    sal,
    sec
TO kam_grains_staging_dev;

GRANT EXECUTE
ON ALL FUNCTIONS
IN SCHEMA
    app,
    audit,
    fin,
    inv,
    mfg,
    pur,
    reporting,
    rpt,
    sal,
    sec
TO kam_grains_staging_dev;


-- ------------------------------------------------------------
-- VERIFICATION
-- ------------------------------------------------------------

SELECT
    current_database() AS database_name,
    current_user AS executing_user,
    pg_get_userbyid(datdba) AS database_owner
FROM pg_database
WHERE datname = current_database();


SELECT
    n.nspname AS schema_name,
    pg_get_userbyid(n.nspowner) AS owner
FROM pg_namespace n
WHERE n.nspname IN (
    'app',
    'audit',
    'fin',
    'inv',
    'mfg',
    'pur',
    'reporting',
    'rpt',
    'sal',
    'sec'
)
ORDER BY n.nspname;


SELECT
    n.nspname AS schema_name,
    p.proname AS function_name,
    pg_get_function_identity_arguments(p.oid) AS arguments,
    pg_get_userbyid(p.proowner) AS owner,
    p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n
  ON n.oid = p.pronamespace
WHERE n.nspname = 'sal'
AND p.proname IN (
    'post_delivery',
    'post_delivery_by_no'
)
ORDER BY p.proname;


SELECT
    schemaname,
    viewname,
    viewowner
FROM pg_views
WHERE schemaname = 'sal'
AND viewname = 'v_delivery_line_lot_options';


-- ------------------------------------------------------------
-- COUNT ANY REMAINING APPLICATION OBJECTS NOT OWNED BY
-- kam_grains_staging_dev
-- ------------------------------------------------------------

SELECT
    n.nspname AS schema_name,
    count(*) AS objects_not_owned_by_staging_dev
FROM pg_class c
JOIN pg_namespace n
  ON n.oid = c.relnamespace
WHERE n.nspname IN (
    'app',
    'audit',
    'fin',
    'inv',
    'mfg',
    'pur',
    'reporting',
    'rpt',
    'sal',
    'sec'
)
AND c.relkind IN ('r','p','v','m','S','f')
AND pg_get_userbyid(c.relowner) <> 'kam_grains_staging_dev'
GROUP BY n.nspname
ORDER BY n.nspname;
