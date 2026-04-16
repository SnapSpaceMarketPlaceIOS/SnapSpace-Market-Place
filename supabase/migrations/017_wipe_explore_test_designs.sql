-- Migration 017: wipe all test/development user-posted designs from the
-- Explore feed, in preparation for launching a fresh version of the app.
--
-- Context: during development we seeded `user_designs` with AI-generated
-- test posts while iterating on the Explore page. Before a public App Store
-- submission we want the Explore feed to start from zero so new users see
-- only organic content as real users create it.
--
-- After this runs, ExploreScreen.js will fall back to LOCAL_DESIGNS (the
-- 42 hand-curated seed designs in src/data/designs.js) until real users
-- begin publishing.
--
-- Safety notes:
--   - Destructive / irreversible: these rows cannot be recovered without
--     a database backup.
--   - Does NOT touch Supabase Storage. Image files in the generated-designs
--     bucket are orphaned but will naturally expire per their TTL policy,
--     or can be bulk-cleaned via the Supabase dashboard.
--   - Does NOT touch `designs` (if that table exists) — only `user_designs`.
--   - Preserves the table schema, RLS policies, and indexes.

BEGIN;

-- Optional: dry-run first — uncomment to count what would be deleted:
-- SELECT COUNT(*) AS rows_to_delete FROM public.user_designs;

DELETE FROM public.user_designs;

-- If you ever want to preserve your OWN test designs (e.g. authored by
-- a specific user), replace the line above with a scoped delete, e.g.:
--   DELETE FROM public.user_designs
--   WHERE user_id <> '<your-uuid-here>';

COMMIT;

-- Post-check: verify the table is empty.
-- SELECT COUNT(*) FROM public.user_designs;
