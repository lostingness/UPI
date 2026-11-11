-- Dev-only seed (NEVER run in production): one test user, mirroring
-- DatabaseSeeder (Test User <test@example.com>, password 'password').
-- The bcrypt hash below is for the literal password "password" (cost 12).
-- Generate a fresh hash with: node -e "require('bcryptjs').hash('password',12).then(console.log)"
-- and replace the value before running.
-- INSERT INTO users (name, email, password, role) VALUES
--   ('Test User', 'test@example.com', '$2b$12$REPLACE_WITH_FRESH_HASH', 'merchant');
SELECT 'seed.sql is intentionally commented out — see the header before running.' AS note;
