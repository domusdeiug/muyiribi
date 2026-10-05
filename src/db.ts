import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type Sql = NeonQueryFunction<false, false>;

export function db(env: Env): Sql {
	return neon(env.DATABASE_URL);
}

// Neon returns Record<string, any>[] for plain queries; this narrows it for TS.
type Row = Record<string, any>;
const rowsOf = (r: unknown): Row[] => r as Row[];

export interface Listing {
	id: number;
	business_name: string;
	owner_name: string | null;
	category: string;
	description: string;
	district: string;
	location: string | null;
	phone: string;
	whatsapp: string | null;
	email: string | null;
	website: string | null;
	tier_code: string;
	tier_rank: number;
	relevance: number;
}

export interface UserRow {
	id: number;
	phone: string;
	password_hash: string;
	tier_code: string;
	failed_logins: number;
	locked_until: string | null;
}

/**
 * Public search. Category and district are optional filters. The keyword is turned into
 * an OR full-text query, so any word can match. Results are ordered by relevance, then
 * tier, then newest. Each account contributes at most its tier's show_limit listings.
 * Only public fields are returned; search_vector and internal sequence numbers are not.
 */
export async function searchListings(
	sql: Sql,
	opts: { category?: string; district?: string; keyword?: string; limit: number },
): Promise<Listing[]> {
	const category = opts.category ?? null;
	const district = opts.district ?? null;

	// "TV LCD repair!" -> "tv | lcd | repair". Only letters and digits survive, so to_tsquery is safe.
	const words = (opts.keyword ?? "")
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((w) => w.length >= 2);
	const tsq = words.length ? words.join(" | ") : null;

	const rows = rowsOf(
		await sql`
		WITH ranked AS (
			SELECT l.*, t.code AS tier_code, t.rank AS tier_rank, t.show_limit,
			       ROW_NUMBER() OVER (PARTITION BY l.owner_id ORDER BY l.created_at DESC) AS owner_seq,
			       CASE WHEN ${tsq}::text IS NULL THEN 0
			            ELSE ts_rank(l.search_vector, to_tsquery('simple', ${tsq}))
			       END AS relevance
			FROM listings l
			JOIN users u ON u.id = l.owner_id
			JOIN tiers t ON t.code = u.tier_code
			WHERE l.status = 'approved'
			  AND (${category}::text IS NULL OR l.category = ${category})
			  AND (${district}::text IS NULL OR l.district ILIKE ${district})
			  AND (${tsq}::text IS NULL OR l.search_vector @@ to_tsquery('simple', ${tsq}))
		)
		SELECT id, business_name, owner_name, category, description, district, location,
		       phone, whatsapp, email, website, tier_code, tier_rank, relevance
		FROM ranked
		WHERE show_limit IS NULL OR owner_seq <= show_limit
		ORDER BY relevance DESC, tier_rank DESC, created_at DESC
		LIMIT ${opts.limit}`,
	);
	return rows as unknown as Listing[];
}

export async function getListing(sql: Sql, id: number): Promise<Listing | null> {
	const rows = rowsOf(
		await sql`
		SELECT l.*, t.code AS tier_code, t.rank AS tier_rank
		FROM listings l
		JOIN users u ON u.id = l.owner_id
		JOIN tiers t ON t.code = u.tier_code
		WHERE l.id = ${id} AND l.status = 'approved'`,
	);
	return (rows[0] as Listing) ?? null;
}

export async function listCategories(sql: Sql): Promise<string[]> {
	const rows = rowsOf(await sql`SELECT name FROM categories ORDER BY name`);
	return rows.map((r) => r.name as string);
}

export async function findUserByPhone(sql: Sql, phone: string): Promise<UserRow | null> {
	const rows = rowsOf(
		await sql`SELECT id, phone, password_hash, tier_code, failed_logins, locked_until
		FROM users WHERE phone = ${phone}`,
	);
	return (rows[0] as UserRow) ?? null;
}

export async function createUser(sql: Sql, phone: string, passwordHash: string): Promise<number> {
	const rows = rowsOf(
		await sql`INSERT INTO users (phone, password_hash)
		VALUES (${phone}, ${passwordHash}) RETURNING id`,
	);
	return Number(rows[0].id);
}

export async function recordFailedLogin(
	sql: Sql,
	userId: number,
	lockMinutes: number,
	maxFails: number,
) {
	await sql`UPDATE users SET
		failed_logins = failed_logins + 1,
		locked_until = CASE WHEN failed_logins + 1 >= ${maxFails}
			THEN now() + (${lockMinutes} || ' minutes')::interval ELSE locked_until END
		WHERE id = ${userId}`;
}

export async function recordSuccessfulLogin(sql: Sql, userId: number) {
	await sql`UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now()
		WHERE id = ${userId}`;
}

export async function createSession(sql: Sql, tokenHash: string, userId: number, expiresAt: Date) {
	await sql`INSERT INTO sessions (token_hash, user_id, expires_at)
		VALUES (${tokenHash}, ${userId}, ${expiresAt.toISOString()})`;
}

export async function findSessionUser(
	sql: Sql,
	tokenHash: string,
): Promise<{ id: number; phone: string; tier_code: string } | null> {
	const rows = rowsOf(
		await sql`SELECT u.id, u.phone, u.tier_code
		FROM sessions s JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = ${tokenHash} AND s.expires_at > now()`,
	);
	return (rows[0] as { id: number; phone: string; tier_code: string }) ?? null;
}

export async function deleteSession(sql: Sql, tokenHash: string) {
	await sql`DELETE FROM sessions WHERE token_hash = ${tokenHash}`;
}

/**
 * A user's effective tier. Paid tiers only count while a subscription is active.
 * Users with no active paid subscription fall back to free. Requires subscriptions table.
 */
export async function effectiveTierLimit(sql: Sql, userId: number): Promise<number | null> {
	const rows = rowsOf(
		await sql`
		SELECT t.max_listings
		FROM users u
		JOIN tiers t ON t.code = u.tier_code
		WHERE u.id = ${userId}
		  AND (u.tier_code = 'free' OR EXISTS (
		        SELECT 1 FROM subscriptions s
		        WHERE s.user_id = u.id AND s.tier_code = u.tier_code
		          AND s.status = 'active' AND s.ends_at > now()))`,
	);
	if (rows.length === 0) {
		// Expired paid tier: fall back to free.
		const free = rowsOf(await sql`SELECT max_listings FROM tiers WHERE code = 'free'`);
		return (free[0]?.max_listings as number | null) ?? 1;
	}
	return rows[0].max_listings as number | null;
}

export async function countOwnListings(sql: Sql, userId: number): Promise<number> {
	const rows = rowsOf(
		await sql`SELECT COUNT(*)::int AS n FROM listings WHERE owner_id = ${userId}`,
	);
	return rows[0].n as number;
}

export async function insertListing(
	sql: Sql,
	ownerId: number,
	data: Record<string, unknown>,
): Promise<number> {
	const rows = rowsOf(
		await sql`
		INSERT INTO listings (
			owner_id, business_name, owner_name, category, description,
			district, location, phone, whatsapp, email, website
		) VALUES (
			${ownerId}, ${data.business_name}, ${data.owner_name ?? null}, ${data.category},
			${data.description}, ${data.district}, ${data.location ?? null}, ${data.phone},
			${data.whatsapp ?? null}, ${data.email ?? null}, ${data.website ?? null}
		) RETURNING id`,
	);
	return Number(rows[0].id);
}

export async function listOwnListings(sql: Sql, userId: number): Promise<Listing[]> {
	const rows = rowsOf(
		await sql`
		SELECT l.*, t.code AS tier_code, t.rank AS tier_rank
		FROM listings l
		JOIN users u ON u.id = l.owner_id
		JOIN tiers t ON t.code = u.tier_code
		WHERE l.owner_id = ${userId}
		ORDER BY l.created_at DESC`,
	);
	return rows as unknown as Listing[];
}

// ---------- pricing / tier catalog ----------

export interface TierInfo {
	code: string;
	name: string;
	rank: number;
	price_ugx: number;
	billing_period: string;
	max_listings: number | null;
	show_limit: number | null;
}

export async function listTiers(sql: Sql): Promise<TierInfo[]> {
	const rows = rowsOf(
		await sql`
		SELECT code, name, rank, price_ugx, billing_period, max_listings, show_limit
		FROM tiers ORDER BY rank`,
	);
	return rows as unknown as TierInfo[];
}

// ---------- user profile / tier payments ----------

export interface UserProfile {
	id: number;
	phone: string;
	phone_verified: boolean;
	business_contact_phone: string | null;
	tier_code: string;
}

export async function getUserProfile(sql: Sql, userId: number): Promise<UserProfile | null> {
	const rows = rowsOf(
		await sql`
		SELECT id, phone, phone_verified, business_contact_phone, tier_code
		FROM users WHERE id = ${userId}`,
	);
	return (rows[0] as UserProfile) ?? null;
}

/**
 * One row per attempt to buy a paid tier. Every tier payment verifies the business contact
 * phone number by SMS OTP before the tier is granted — there is no payment-only path.
 */
export interface TierPayment {
	id: number;
	user_id: number;
	tier_code: string;
	phone: string;
	amount_ugx: number;
	payment_ref: string | null;
	payment_status: "pending" | "paid" | "failed";
	otp_hash: string | null;
	otp_expires_at: string | null;
	otp_attempts: number;
	verified_at: string | null;
	created_at: string;
}

export async function createTierPayment(
	sql: Sql,
	userId: number,
	tierCode: string,
	phone: string,
	amountUgx: number,
): Promise<number> {
	const rows = rowsOf(
		await sql`
		INSERT INTO tier_payments (user_id, tier_code, phone, amount_ugx)
		VALUES (${userId}, ${tierCode}, ${phone}, ${amountUgx}) RETURNING id`,
	);
	return Number(rows[0].id);
}

export async function setTierPaymentRef(sql: Sql, id: number, ref: string) {
	await sql`UPDATE tier_payments SET payment_ref = ${ref} WHERE id = ${id}`;
}

export async function findTierPaymentByRef(sql: Sql, ref: string): Promise<TierPayment | null> {
	const rows = rowsOf(await sql`SELECT * FROM tier_payments WHERE payment_ref = ${ref}`);
	return (rows[0] as TierPayment) ?? null;
}

export async function findLatestTierPayment(sql: Sql, userId: number): Promise<TierPayment | null> {
	const rows = rowsOf(
		await sql`
		SELECT * FROM tier_payments WHERE user_id = ${userId}
		ORDER BY created_at DESC LIMIT 1`,
	);
	return (rows[0] as TierPayment) ?? null;
}

export async function markTierPaymentPaidWithOtp(
	sql: Sql,
	id: number,
	otpHash: string,
	expiresAt: Date,
) {
	await sql`UPDATE tier_payments SET
		payment_status = 'paid', otp_hash = ${otpHash}, otp_expires_at = ${expiresAt.toISOString()}, otp_attempts = 0
		WHERE id = ${id}`;
}

export async function markTierPaymentFailed(sql: Sql, id: number) {
	await sql`UPDATE tier_payments SET payment_status = 'failed' WHERE id = ${id}`;
}

export async function recordOtpAttempt(sql: Sql, id: number): Promise<number> {
	const rows = rowsOf(
		await sql`
		UPDATE tier_payments SET otp_attempts = otp_attempts + 1
		WHERE id = ${id} RETURNING otp_attempts`,
	);
	return rows[0].otp_attempts as number;
}

export async function invalidateOtp(sql: Sql, id: number) {
	await sql`UPDATE tier_payments SET otp_hash = NULL, otp_expires_at = NULL WHERE id = ${id}`;
}

export async function markTierPaymentConfirmed(sql: Sql, id: number) {
	await sql`UPDATE tier_payments SET verified_at = now() WHERE id = ${id}`;
}

/** Marks the phone verified, upgrades to the paid tier, and opens a 1-year active subscription. */
export async function upgradeUserAfterVerification(
	sql: Sql,
	userId: number,
	tierCode: string,
	phone: string,
	paymentRef: string | null,
	amountUgx: number,
) {
	const now = new Date();
	const ends = new Date(now);
	ends.setFullYear(ends.getFullYear() + 1);

	await sql`UPDATE users SET
		tier_code = ${tierCode}, phone_verified = TRUE, business_contact_phone = ${phone}
		WHERE id = ${userId}`;

	await sql`INSERT INTO subscriptions (user_id, tier_code, amount_ugx, starts_at, ends_at, payment_ref, status)
		VALUES (${userId}, ${tierCode}, ${amountUgx}, ${now.toISOString()}, ${ends.toISOString()}, ${paymentRef}, 'active')
		ON CONFLICT (payment_ref) DO NOTHING`;
}
