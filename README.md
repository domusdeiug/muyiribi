# Muyiribi

Business directory for Uganda. Cloudflare Worker + Neon Postgres, with a simple web UI and an MCP endpoint for AI tools.

## Routes

- `/` landing page
- `/signup`, `/login`, `/logout` phone + password accounts (password show/hide toggle)
- `/add` add a business listing (creation limit depends on tier; description min 40 characters)
- `/mcp` MCP endpoint with tools: `search_businesses`, `get_business`, `list_categories`

Results are ranked by tier, highest first (black, green, blue, free).

## Setup

1. Run `schema.sql` once in the Neon SQL console.
2. Install dependencies: `npm install`
3. Set the database secret: `npx wrangler secret put DATABASE_URL` (your Neon connection string)
4. Local dev: `npm run dev`
5. Deploy: `npm run deploy`

Your MCP URL is: `https://ug-online.domus-dei-tech.workers.dev/mcp`.

## Notes

- Passwords are hashed with PBKDF2 (Web Crypto). Accounts lock for 15 minutes after 5 failed logins.
- Creation limit (how many listings an account can create): Free 3, Basic 5, Pro 7, Premium unlimited.
- Search limit (how many of an account's listings can appear in search): Free 1, Basic 3, Pro 5, Premium unlimited. Newest first.
- Results are ordered by tier, highest first.
- Paid tiers only count while an active subscription exists. No flow creates subscriptions yet; payments come later.
- `/pricing` shows all tiers and sells them via PesaPal. Every paid tier (Basic UGX 5,000/yr,
  Pro UGX 12,000/yr, Premium UGX 25,000/yr) requires business contact phone verification by SMS
  OTP (sent via UgaText) before the tier is granted. See `migrations/002_verification.sql` and
  `migrations/003_tier_names_and_pricing.sql`, and `migrations/004_payment_phone_optional.sql`.
- Paid-tier flow is one page. "Get <tier>" creates a PesaPal order and shows its checkout in an
  iframe on `/pricing/status`. The page polls `/pricing/check` until payment completes, then
  asks for the verification number (prefilled, editable) and sends the SMS code. Status is only
  trusted from PesaPal's GetTransactionStatus, never from the callback URL.


## MCP Registry
- step 0: 
update version in server.json

- step 1: 
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher
chmod +x mcp-publisher

- step 2: 
./mcp-publisher login github
./mcp-publisher validate server.json
./mcp-publisher publish server.json

## MCP
scaffold: npm create cloudflare@latest -- my-mcp --type=mcp-server
get token for workers from cloudflare
cd my-mcp
npm install
npx wrangler dev        # local dev
npx wrangler deploy     # deploy