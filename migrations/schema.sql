-- Muyiribi v1 schema. Run once in the Neon SQL console.

CREATE TABLE IF NOT EXISTS tiers (
  code           TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  rank           INT  NOT NULL UNIQUE,
  max_listings   INT,                          -- NULL = unlimited
  price_ugx      INT  NOT NULL DEFAULT 0,
  billing_period TEXT NOT NULL DEFAULT 'year'
);

-- max_listings = how many listings the account may CREATE.
-- show_limit   = how many of them can APPEAR in search (per account).
ALTER TABLE tiers ADD COLUMN IF NOT EXISTS show_limit INT;

INSERT INTO tiers (code, name, rank, max_listings, show_limit, price_ugx, billing_period) VALUES
  ('free',  'Free',  0, 3,    1,    0,     'none'),
  ('blue',  'Blue',  1, 5,    3,    60000, 'year'),
  ('green', 'Green', 2, 7,    5,    12000, 'year'),
  ('black', 'Black', 3, NULL, NULL, 25000, 'year')
ON CONFLICT (code) DO UPDATE SET
  max_listings = EXCLUDED.max_listings,
  show_limit   = EXCLUDED.show_limit,
  price_ugx    = EXCLUDED.price_ugx;

CREATE TABLE IF NOT EXISTS categories (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  id              BIGSERIAL PRIMARY KEY,
  phone           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  phone_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  tier_code       TEXT NOT NULL DEFAULT 'free' REFERENCES tiers(code),
  failed_logins   INT NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier_code    TEXT NOT NULL REFERENCES tiers(code),
  amount_ugx   INT  NOT NULL,
  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ NOT NULL,
  payment_ref  TEXT UNIQUE,
  status       TEXT NOT NULL DEFAULT 'active'  -- 'active' | 'expired' | 'cancelled'
);
CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON subscriptions(user_id, ends_at);

CREATE TABLE IF NOT EXISTS listings (
  id              BIGSERIAL PRIMARY KEY,
  owner_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_name   TEXT NOT NULL,
  owner_name      TEXT,
  category        TEXT NOT NULL REFERENCES categories(name),
  description     TEXT NOT NULL,                -- services go here; main search signal
  district        TEXT NOT NULL,
  location        TEXT,                         -- free text: landmark, address, area
  phone           TEXT NOT NULL,                -- pre-filled from signup, editable
  whatsapp        TEXT,                         -- NULL if no WhatsApp number given
  email           TEXT,
  website         TEXT,
  status          TEXT NOT NULL DEFAULT 'approved',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Full-text search. Auto-maintained. Name ranks highest, then category, then description.
  search_vector   tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(business_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(category, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'C')
  ) STORED
);
CREATE INDEX IF NOT EXISTS listings_public_idx ON listings(status, category, district);
CREATE INDEX IF NOT EXISTS listings_owner_idx  ON listings(owner_id);
CREATE INDEX IF NOT EXISTS listings_search_idx ON listings USING GIN (search_vector);

-- Category list (fixed). Full labels, as agreed.
INSERT INTO categories (name) VALUES
  ('Certified Professional (Teacher, Lawyer, Eng., etc.)'),
  ('Research, Consultancy and Innovation'),
  ('Fundis (Handymen, Carpenters, painters, masons)'),
  ('Mechanic (Phone, Car, Motorcycle etc.)'),
  ('Electrician (Energy, Solar & Utilities)'),
  ('Plumber (Water and Utilities)'),
  ('Tech Services (Software)'),
  ('Manufacturing Industry (Metal-welding, etc.)'),
  ('Shop & Supermarket (Bakeries, Wholesale, etc.)'),
  ('Import and Export'),
  ('Medical Services (Pharmacy, Lab and Vet)'),
  ('Bookshop & Stationery Services (Printing, Scanning etc.)'),
  ('Food and Hospitality (Restaurant, Motels, Lodge, etc.)'),
  ('NGO (Humanitarian Org., Faith-Based Org., etc)'),
  ('Hospital (Heath and Social Services)'),
  ('School (Education and Training)'),
  ('Rental Services (Rentals, Air B&B, Brokers etc.)'),
  ('Private Security'),
  ('Construction & Real Estate'),
  ('Agriculture Produce'),
  ('Poultry & Livestock'),
  ('Transport & Tourism (Boda, Special-hire, Tour-guide, etc.)'),
  ('Mobile Money and Financial Services (SACCO, Forex etc.)'),
  ('Waste Mgt., Cleaning and Sanitation'),
  ('Salon & Spa (Beauticians, Hair-stylists, etc.)'),
  ('Event Planning & Decoration'),
  ('Tailoring, Fashion and Design'),
  ('Media, Arts & Creative Industry (Musician, Photography, etc.)'),
  ('Other (Muyiribi, Vendors, etc.)')
ON CONFLICT (name) DO NOTHING;