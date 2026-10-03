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

Your MCP URL will be `https://<worker-name>.<subdomain>.workers.dev/mcp`.

## Notes

- Passwords are hashed with PBKDF2 (Web Crypto). Accounts lock for 15 minutes after 5 failed logins.
- Creation limit (how many listings an account can create): Free 3, Blue 5, Green 7, Black unlimited.
- Search limit (how many of an account's listings can appear in search): Free 1, Blue 3, Green 5, Black unlimited. Newest first.
- Results are ordered by tier, highest first.
- Paid tiers only count while an active subscription exists. No flow creates subscriptions yet; payments come later.
- Phone verification (OTP via TextBee) is not implemented yet. `users.phone_verified` is ready for it.
