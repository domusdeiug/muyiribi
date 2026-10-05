-- Muyiribi migration: business contact verification (PesaPal payment + UgaText SMS OTP).
-- Run once in the Neon SQL console, after schema.sql.

-- Blue tier is now the UGX 5,000/year "verify my business" tier (was 60000).
UPDATE tiers SET price_ugx = 5000 WHERE code = 'blue';

-- The phone being verified may differ from the account login phone (users.phone),
-- so it's stored separately. users.phone_verified means "business_contact_phone is verified".
ALTER TABLE users ADD COLUMN IF NOT EXISTS business_contact_phone TEXT;

-- One row per verification attempt (pay -> OTP sent -> confirmed). A user can have
-- several rows over time (e.g. a failed/abandoned attempt followed by a successful one).
CREATE TABLE IF NOT EXISTS verification_requests (
	id                    BIGSERIAL PRIMARY KEY,
	user_id               BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	phone                 TEXT NOT NULL,
	amount_ugx            INT NOT NULL DEFAULT 5000,
	payment_ref           TEXT UNIQUE,                        -- PesaPal order_tracking_id
	payment_status        TEXT NOT NULL DEFAULT 'pending',     -- pending | paid | failed
	otp_hash              TEXT,                                -- sha256 hex, never store the raw code
	otp_expires_at        TIMESTAMPTZ,
	otp_attempts          INT NOT NULL DEFAULT 0,
	verified_at           TIMESTAMPTZ,
	created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_requests_user_idx ON verification_requests(user_id, created_at DESC);
