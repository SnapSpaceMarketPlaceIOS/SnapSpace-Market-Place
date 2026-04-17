-- ============================================================================
-- One-off cleanup: delete four Explore posts whose stored products do not
-- match the AI-generated image. These were early @snapspace.user test
-- wishes generated before the product-matching pipeline was finalized.
--
-- NOT a migration. Do not add to supabase/migrations. Run this manually
-- via Supabase Dashboard → SQL Editor → New Query → paste → Run.
-- ============================================================================

-- Step 1 (OPTIONAL, recommended): Preview what will be deleted.
-- Run this SELECT by itself first — confirm 4 rows before running Step 2.

SELECT
  d.id,
  p.username,
  d.prompt,
  d.visibility,
  d.created_at,
  jsonb_array_length(COALESCE(d.products, '[]'::jsonb)) AS product_count
FROM user_designs d
LEFT JOIN profiles p ON p.id = d.user_id
WHERE p.username = 'snapspace.user'
  AND d.prompt IN (
    'Modern minimal living room amazing layout',
    'Modern living room, dark leather sofa, white rug. Modern coffee table',
    'Modern minimal living room, modern leather sofa',
    'Japandi dining room, walnut table, rattan chairs, warm pendant lighting'
  )
ORDER BY d.created_at DESC;

-- ============================================================================
-- Step 2: The actual delete, wrapped in a transaction so you can ROLLBACK
-- if the preview doesn't look right. Expected to remove EXACTLY 4 rows.
-- ============================================================================

BEGIN;

WITH deleted AS (
  DELETE FROM user_designs
  WHERE user_id IN (SELECT id FROM profiles WHERE username = 'snapspace.user')
    AND prompt IN (
      'Modern minimal living room amazing layout',
      'Modern living room, dark leather sofa, white rug. Modern coffee table',
      'Modern minimal living room, modern leather sofa',
      'Japandi dining room, walnut table, rattan chairs, warm pendant lighting'
    )
  RETURNING id, prompt
)
SELECT id, prompt FROM deleted;

-- If the RETURNING output above shows the correct 4 rows, COMMIT.
-- If anything looks wrong, ROLLBACK instead of COMMIT.

COMMIT;
-- ROLLBACK;  -- ← uncomment and re-run if you want to undo
