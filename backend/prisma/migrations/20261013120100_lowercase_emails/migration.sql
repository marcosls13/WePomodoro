-- Lookups (password reset, signup) use lowercase emails. Lowercase older
-- mixed-case ones, skipping any that would collide with another account; for
-- case-only duplicates only the oldest account is changed.
UPDATE "User" u
SET "email" = lower(u."email")
WHERE u."email" <> lower(u."email")
  AND u."id" = (SELECT min(o."id") FROM "User" o WHERE lower(o."email") = lower(u."email"))
  AND NOT EXISTS (SELECT 1 FROM "User" o WHERE o."email" = lower(u."email"));
