import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import {
	hashPassword,
	verifyPassword,
	newSessionToken,
	hashToken,
	normalisePhone,
	generateOtp,
	OTP_TTL_MS,
	MAX_OTP_ATTEMPTS,
	SESSION_TTL_MS,
} from "./auth";
import {
	db,
	searchListings,
	getListing,
	listCategories,
	findUserByPhone,
	createUser,
	recordFailedLogin,
	recordSuccessfulLogin,
	createSession,
	findSessionUser,
	deleteSession,
	effectiveTierLimit,
	countOwnListings,
	insertListing,
	getUserProfile,
	listTiers,
	createTierPayment,
	setTierPaymentRef,
	findTierPaymentByRef,
	findLatestTierPayment,
	markTierPaymentPaidWithOtp,
	markTierPaymentFailed,
	recordOtpAttempt,
	invalidateOtp,
	markTierPaymentConfirmed,
	upgradeUserAfterVerification,
	type Sql,
	type TierPayment,
} from "./db";
import {
	landingPage,
	authPage,
	addListingPage,
	pricingPage,
	tierPaymentStatusPage,
	tierPaymentConfirmPage,
	DESCRIPTION_MIN,
} from "./pages";
import { submitVerificationOrder, getPesapalTransactionStatus, isCompletedStatus } from "./pesapal";
import { sendSms } from "./ugatext";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const MIN_PASSWORD = 8;

// ---------- MCP ----------

function createServer(sql: Sql) {
	const server = new McpServer({ name: "Muyiribi", version: "1.0.0" });

	server.registerTool(
		"search_businesses",
		{
			inputSchema: z.object({
				keyword: z
					.string()
					.optional()
					.describe(
						"Several plain words describing what is needed, e.g. 'tv lcd repair'. Any word can match; listings matching more words rank higher. Not a phrase.",
					),
				category: z
					.string()
					.optional()
					.describe(
						"Exact category name from list_categories. Use it when the request fits a category. Optional.",
					),
				district: z.string().optional().describe("District name, e.g. Kampala"),
				limit: z
					.number()
					.int()
					.min(1)
					.max(5)
					.default(5)
					.describe("Number of results, 1 to 5"),
			}),
		},
		async ({ keyword, category, district, limit }) => {
			const rows = await searchListings(sql, { keyword, category, district, limit });
			return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
		},
	);

	server.registerTool(
		"get_business",
		{ inputSchema: z.object({ id: z.number().int().describe("Listing id") }) },
		async ({ id }) => {
			const row = await getListing(sql, id);
			const text = row ? JSON.stringify(row, null, 2) : "Not found";
			return { content: [{ type: "text", text }] };
		},
	);

	server.registerTool("list_categories", { inputSchema: z.object({}) }, async () => {
		const cats = await listCategories(sql);
		return { content: [{ type: "text", text: JSON.stringify(cats, null, 2) }] };
	});

	return server;
}

// ---------- helpers ----------

function html(body: string, status = 200, headers: Record<string, string> = {}): Response {
	return new Response(body, {
		status,
		headers: { "content-type": "text/html; charset=utf-8", ...headers },
	});
}

function redirect(location: string, headers: Record<string, string> = {}): Response {
	return new Response(null, { status: 303, headers: { location, ...headers } });
}

function getCookie(request: Request, name: string): string | null {
	const cookie = request.headers.get("cookie") ?? "";
	for (const part of cookie.split(";")) {
		const [k, ...v] = part.trim().split("=");
		if (k === name) return v.join("=");
	}
	return null;
}

function sessionCookie(token: string, maxAgeSec: number): string {
	return `muy_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}`;
}

async function currentUser(request: Request, sql: Sql) {
	const token = getCookie(request, "muy_session");
	if (!token) return null;
	return findSessionUser(sql, await hashToken(token));
}

async function readForm(request: Request): Promise<Record<string, string>> {
	const data = await request.formData();
	const out: Record<string, string> = {};
	for (const [k, v] of data.entries()) if (typeof v === "string") out[k] = v.trim();
	return out;
}

async function startSession(sql: Sql, userId: number): Promise<Response> {
	const token = newSessionToken();
	await createSession(sql, await hashToken(token), userId, new Date(Date.now() + SESSION_TTL_MS));
	return redirect("/add", {
		"set-cookie": sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000)),
	});
}

// ---------- tier payment processing (shared by IPN callback and manual check) ----------

/**
 * Queries PesaPal for a pending tier payment's status and, if it has resolved, updates the
 * DB. Every tier requires phone verification, so a completed payment always triggers an SMS
 * OTP and waits for /pricing/confirm. No-ops if not pending or not found.
 */
async function checkTierPayment(sql: Sql, env: Env, payment: TierPayment) {
	if (payment.payment_status !== "pending" || !payment.payment_ref) return;

	const txStatus = await getPesapalTransactionStatus(env, payment.payment_ref);
	if (isCompletedStatus(txStatus.status)) {
		const otp = generateOtp();
		const otpHash = await hashToken(otp);
		const expiresAt = new Date(Date.now() + OTP_TTL_MS);
		await markTierPaymentPaidWithOtp(sql, payment.id, otpHash, expiresAt);
		await sendSms(
			env,
			payment.phone,
			`Your Muyiribi verification code is ${otp}. It expires in 30 minutes.`,
		);
	} else if (txStatus.status === "FAILED" || txStatus.status === "INVALID") {
		await markTierPaymentFailed(sql, payment.id);
	}
	// Any other status (pending, etc.): leave as-is.
}

// ---------- web routes ----------

async function handleWeb(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const sql = db(env);
	const path = url.pathname;
	const method = request.method;

	if (path === "/" && method === "GET") {
		return html(landingPage(await currentUser(request, sql)));
	}

	if (path === "/signup" && method === "GET") {
		return html(authPage("signup"));
	}

	if (path === "/signup" && method === "POST") {
		const f = await readForm(request);
		const phone = normalisePhone(f.phone ?? "");
		if (!phone) return html(authPage("signup", "Enter a valid Uganda phone number."), 400);
		if ((f.password ?? "").length < MIN_PASSWORD)
			return html(
				authPage("signup", `Password must be at least ${MIN_PASSWORD} characters.`),
				400,
			);

		if (await findUserByPhone(sql, phone))
			return html(
				authPage("signup", "An account with this number already exists. Log in instead."),
				409,
			);

		const userId = await createUser(sql, phone, await hashPassword(f.password));
		return startSession(sql, userId);
	}

	if (path === "/login" && method === "GET") {
		return html(authPage("login"));
	}

	if (path === "/login" && method === "POST") {
		const f = await readForm(request);
		const phone = normalisePhone(f.phone ?? "");
		const generic = "Phone number or password is incorrect.";
		if (!phone) return html(authPage("login", generic), 401);

		const user = await findUserByPhone(sql, phone);
		if (!user) return html(authPage("login", generic), 401);

		if (user.locked_until && new Date(user.locked_until) > new Date()) {
			return html(
				authPage("login", "Too many failed attempts. Try again in 15 minutes."),
				429,
			);
		}

		const ok = await verifyPassword(f.password ?? "", user.password_hash);
		if (!ok) {
			await recordFailedLogin(sql, user.id, LOCK_MINUTES, MAX_FAILED_LOGINS);
			return html(authPage("login", generic), 401);
		}

		await recordSuccessfulLogin(sql, user.id);
		return startSession(sql, user.id);
	}

	if (path === "/logout") {
		const token = getCookie(request, "muy_session");
		if (token) await deleteSession(sql, await hashToken(token));
		return redirect("/", { "set-cookie": sessionCookie("", 0) });
	}

	if (path === "/add" && method === "GET") {
		const user = await currentUser(request, sql);
		if (!user) return redirect("/login");
		const categories = await listCategories(sql);
		const limit = await effectiveTierLimit(sql, user.id);
		const count = await countOwnListings(sql, user.id);
		const atLimit = limit !== null && count >= limit;
		return html(
			addListingPage(user, categories, {
				atLimit,
				count,
				limit,
				success: url.searchParams.get("saved") === "1",
			}),
		);
	}

	if (path === "/add" && method === "POST") {
		const user = await currentUser(request, sql);
		if (!user) return redirect("/login");

		const limit = await effectiveTierLimit(sql, user.id);
		const count = await countOwnListings(sql, user.id);
		const categories = await listCategories(sql);
		if (limit !== null && count >= limit) {
			return html(addListingPage(user, categories, { atLimit: true, count, limit }), 403);
		}

		const f = await readForm(request);
		const fail = (error: string) => html(addListingPage(user, categories, { error }), 400);

		if (!f.business_name) return fail("Business name is required.");
		if (!f.category || !categories.includes(f.category))
			return fail("Choose a valid category.");
		if ((f.description ?? "").length < DESCRIPTION_MIN)
			return fail(`Description must be at least ${DESCRIPTION_MIN} characters.`);
		if (!f.district) return fail("District is required.");
		const phone = normalisePhone(f.phone ?? "");
		if (!phone) return fail("Enter a valid contact phone number.");
		const whatsapp = f.whatsapp ? normalisePhone(f.whatsapp) : null;
		if (f.whatsapp && !whatsapp)
			return fail("Enter a valid WhatsApp number or leave it blank.");

		await insertListing(sql, user.id, {
			business_name: f.business_name,
			owner_name: f.owner_name || null,
			category: f.category,
			description: f.description,
			district: f.district,
			location: f.location || null,
			phone,
			whatsapp,
			email: f.email || null,
			website: f.website || null,
		});

		return redirect("/add?saved=1");
	}

	// ---------- pricing & tier payments ----------

	if (path === "/pricing" && method === "GET") {
		const sessionUser = await currentUser(request, sql);
		const tiers = await listTiers(sql);

		if (!sessionUser) return html(pricingPage(null, tiers));

		const profile = await getUserProfile(sql, sessionUser.id);
		if (!profile) return redirect("/login");

		// If there's a payment in flight for this user, send them to its status page
		// instead of letting them start another one.
		const latest = await findLatestTierPayment(sql, sessionUser.id);
		if (latest && latest.payment_status !== "failed" && !latest.verified_at) {
			return redirect("/pricing/status");
		}

		return html(
			pricingPage(sessionUser, tiers, {
				currentTierCode: profile.tier_code,
				phoneVerified: profile.phone_verified,
				defaultPhone: profile.business_contact_phone ?? profile.phone,
			}),
		);
	}

	if (path === "/pricing/start" && method === "POST") {
		const sessionUser = await currentUser(request, sql);
		if (!sessionUser) return redirect("/login");

		const f = await readForm(request);
		const tiers = await listTiers(sql);
		const tier = tiers.find((t) => t.code === f.tier);
		if (!tier || tier.price_ugx <= 0) return redirect("/pricing");

		const phone = normalisePhone(f.phone ?? "");
		if (!phone) {
			return html(
				pricingPage(sessionUser, tiers, { error: "Enter a valid Uganda phone number." }),
				400,
			);
		}

		const id = await createTierPayment(sql, sessionUser.id, tier.code, phone, tier.price_ugx);

		try {
			const origin = new URL(request.url).origin;
			const order = await submitVerificationOrder(env, origin, {
				merchantRef: `tier-${id}`,
				amountUgx: tier.price_ugx,
				phone,
			});
			await setTierPaymentRef(sql, id, order.order_tracking_id);
			return html(
				tierPaymentStatusPage(sessionUser, {
					kind: "awaiting_payment",
					tierName: tier.name,
					phone,
					amountUgx: tier.price_ugx,
					redirectUrl: order.redirect_url,
				}),
			);
		} catch (err) {
			await markTierPaymentFailed(sql, id);
			const message = err instanceof Error ? err.message : "Could not start the payment.";
			return html(
				tierPaymentStatusPage(sessionUser, {
					kind: "payment_failed",
					tierName: tier.name,
					phone,
					error: message,
				}),
				502,
			);
		}
	}

	if (path === "/pricing/status" && method === "GET") {
		const sessionUser = await currentUser(request, sql);
		if (!sessionUser) return redirect("/login");

		const latest = await findLatestTierPayment(sql, sessionUser.id);
		if (!latest) return redirect("/pricing");
		const tiers = await listTiers(sql);
		const tierName = tiers.find((t) => t.code === latest.tier_code)?.name ?? latest.tier_code;

		if (latest.verified_at) {
			const profile = await getUserProfile(sql, sessionUser.id);
			return html(
				tierPaymentStatusPage(sessionUser, {
					kind: "done",
					tierName,
					phone: latest.phone,
					phoneVerified: profile?.phone_verified ?? false,
				}),
			);
		}
		if (latest.payment_status === "failed") {
			return html(
				tierPaymentStatusPage(sessionUser, {
					kind: "payment_failed",
					tierName,
					phone: latest.phone,
				}),
			);
		}
		if (latest.payment_status === "paid") {
			return html(
				tierPaymentStatusPage(sessionUser, {
					kind: "awaiting_otp",
					tierName,
					phone: latest.phone,
				}),
			);
		}
		return html(
			tierPaymentStatusPage(sessionUser, {
				kind: "awaiting_payment",
				tierName,
				phone: latest.phone,
				amountUgx: latest.amount_ugx,
				redirectUrl: "",
			}),
		);
	}

	if (path === "/pricing/confirm" && method === "GET") {
		const sessionUser = await currentUser(request, sql);
		if (!sessionUser) return redirect("/login");
		const latest = await findLatestTierPayment(sql, sessionUser.id);
		if (!latest || latest.verified_at || latest.payment_status !== "paid")
			return redirect("/pricing");
		if (
			!latest.otp_hash ||
			!latest.otp_expires_at ||
			new Date(latest.otp_expires_at) <= new Date()
		) {
			return html(tierPaymentConfirmPage(sessionUser, { expired: true }));
		}
		return html(tierPaymentConfirmPage(sessionUser, { phone: latest.phone }));
	}

	if (path === "/pricing/confirm" && method === "POST") {
		const sessionUser = await currentUser(request, sql);
		if (!sessionUser) return redirect("/login");
		const latest = await findLatestTierPayment(sql, sessionUser.id);
		if (!latest || latest.verified_at || latest.payment_status !== "paid")
			return redirect("/pricing");

		if (
			!latest.otp_hash ||
			!latest.otp_expires_at ||
			new Date(latest.otp_expires_at) <= new Date()
		) {
			return html(tierPaymentConfirmPage(sessionUser, { expired: true }));
		}

		const f = await readForm(request);
		const code = (f.code ?? "").trim();
		const codeHash = await hashToken(code);

		if (codeHash !== latest.otp_hash) {
			const attempts = await recordOtpAttempt(sql, latest.id);
			if (attempts >= MAX_OTP_ATTEMPTS) {
				await invalidateOtp(sql, latest.id);
				return html(tierPaymentConfirmPage(sessionUser, { expired: true }));
			}
			return html(
				tierPaymentConfirmPage(sessionUser, {
					phone: latest.phone,
					error: `Incorrect code. ${MAX_OTP_ATTEMPTS - attempts} attempt(s) left.`,
				}),
				400,
			);
		}

		const tiers = await listTiers(sql);
		const tierName = tiers.find((t) => t.code === latest.tier_code)?.name ?? latest.tier_code;

		await markTierPaymentConfirmed(sql, latest.id);
		await upgradeUserAfterVerification(
			sql,
			sessionUser.id,
			latest.tier_code,
			latest.phone,
			latest.payment_ref,
			latest.amount_ugx,
		);
		await sendSms(
			env,
			latest.phone,
			`Your Muyiribi business contact is verified. You're now on the ${tierName} tier for one year. Thank you!`,
		);

		return redirect("/pricing/status");
	}

	// PesaPal IPN callback — server-to-server, no session. Matched by payment_ref (the
	// merchant's own order_tracking_id, returned by PesaPal as the "OrderTrackingId" param).
	if (path === "/payments/pesapal-ipn") {
		const orderTrackingId = url.searchParams.get("OrderTrackingId");
		const notificationType = url.searchParams.get("OrderNotificationType");
		if (!orderTrackingId) return new Response("OK", { status: 200 });

		try {
			const payment = await findTierPaymentByRef(sql, orderTrackingId);
			if (payment) await checkTierPayment(sql, env, payment);
		} catch (err) {
			console.error("pesapal-ipn error:", err);
		}

		// PesaPal expects 200 OK regardless of outcome.
		if (notificationType) return new Response("OK", { status: 200 });
		return redirect("/pricing/status");
	}

	// Manual "check status now" button on the awaiting-payment page, for when the IPN is slow
	// or doesn't arrive. Queries PesaPal directly instead of waiting.
	if (path === "/pricing/check" && method === "GET") {
		const sessionUser = await currentUser(request, sql);
		if (!sessionUser) return redirect("/login");

		const latest = await findLatestTierPayment(sql, sessionUser.id);
		if (latest && !latest.verified_at) {
			try {
				await checkTierPayment(sql, env, latest);
			} catch (err) {
				console.error("pricing/check error:", err);
				const tiers = await listTiers(sql);
				const tierName =
					tiers.find((t) => t.code === latest.tier_code)?.name ?? latest.tier_code;
				return html(
					tierPaymentStatusPage(sessionUser, {
						kind: "payment_failed",
						tierName,
						phone: latest.phone,
						error: "Couldn't reach PesaPal just now. Try again in a moment.",
					}),
					502,
				);
			}
		}

		return redirect("/pricing/status");
	}

	// Old URL, kept as a redirect in case it's bookmarked anywhere.
	if (path === "/verify") return redirect("/pricing");

	return html("<h1>Not found</h1>", 404);
}

// ---------- entry ----------

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const path = new URL(request.url).pathname;
		if (path === "/mcp" || path.startsWith("/mcp/")) {
			const handler = createMcpHandler(() => createServer(db(env)));
			return handler(request, env, ctx);
		}
		return handleWeb(request, env);
	},
} satisfies ExportedHandler<Env>;
