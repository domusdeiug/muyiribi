-- Muyiribi migration: rename tiers to basic/pro/premium, and generalize the payment
-- flow so any paid tier can be bought (not just basic's phone-verification flow).
-- Run once in the Neon SQL console, after 002_verification.sql.

-- ---------- 1. Rename tier codes, keeping rank/prices/limits ----------
-- tiers.code is referenced by users.tier_code and subscriptions.tier_code. Temporarily
-- make those FKs cascade the rename, so we don't have to touch every dependent row by hand.
DO $$
DECLARE
	r RECORD;
BEGIN
	FOR r IN
		SELECT conname, conrelid::regclass AS tbl
		FROM pg_constraint
		WHERE confrelid = 'tiers'::regclass AND contype = 'f'
	LOOP
		EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
		EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (tier_code) REFERENCES tiers(code) ON UPDATE CASCADE', r.tbl, r.conname);
	END LOOP;
END $$;

UPDATE tiers SET code = 'basic',   name = 'Basic'   WHERE code = 'blue';
UPDATE tiers SET code = 'pro',     name = 'Pro'     WHERE code = 'green';
UPDATE tiers SET code = 'premium', name = 'Premium' WHERE code = 'black';

-- ---------- 2. Generalize verification_requests -> tier_payments ----------
-- Every paid tier now goes through this table and requires phone verification by SMS OTP
-- before the tier is granted — Basic, Pro and Premium all work the same way.
ALTER TABLE verification_requests RENAME TO tier_payments;

ALTER TABLE tier_payments ADD COLUMN IF NOT EXISTS tier_code TEXT REFERENCES tiers(code);
UPDATE tier_payments SET tier_code = 'basic' WHERE tier_code IS NULL;
ALTER TABLE tier_payments ALTER COLUMN tier_code SET NOT NULL;
