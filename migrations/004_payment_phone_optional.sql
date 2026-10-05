-- Muyiribi migration: the phone number is no longer collected before payment.
-- The user picks their mobile money number on PesaPal's page, then confirms/edits the
-- verification number on our OTP step. tier_payments.phone is therefore filled in at
-- send-code time, not at payment start.
-- Run once in the Neon SQL console, after 003_tier_names_and_pricing.sql.

ALTER TABLE tier_payments ALTER COLUMN phone DROP NOT NULL;

-- Store PesaPal's hosted checkout URL so the status page can rebuild the iframe on reload.
ALTER TABLE tier_payments ADD COLUMN IF NOT EXISTS redirect_url TEXT;
