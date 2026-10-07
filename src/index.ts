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
	markTierPaymentPaid,
	markTierPaymentFailed,
	setTierPaymentOtp,
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
	DESCRIPTION_MIN,
} from "./pages";
import { submitVerificationOrder, getPesapalTransactionStatus, isCompletedStatus } from "./pesapal";
import { sendSms } from "./ugatext";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const MIN_PASSWORD = 8;

// ---------- MCP ----------
// ---------- OpenAI Apps SDK widget ----------
// Renders search_businesses results as cards inside ChatGPT. Claude and other
// plain-MCP clients ignore the extra `_meta` fields below, so this is purely
// additive and does not change behaviour for existing connectors.

const BUSINESS_WIDGET_URI = "ui://widget/business-results.html";

const businessWidgetMeta = {
	"openai/outputTemplate": BUSINESS_WIDGET_URI,
	"openai/toolInvocation/invoking": "Searching Muyiribi directory…",
	"openai/toolInvocation/invoked": "Found matching businesses",
	"openai/widgetAccessible": true,
	"openai/resultCanProduceWidget": true,
} as const;

const BUSINESS_WIDGET_HTML = /* html */ `
<div id="muyiribi-root"></div>
<style>
  #muyiribi-root { font-family: -apple-system, system-ui, sans-serif; }
  .mb-card {
    border: 1px solid #e2e2e2; border-radius: 12px; padding: 14px 16px;
    margin-bottom: 10px; background: #fff;
  }
  .mb-name { font-weight: 600; font-size: 15px; margin: 0 0 4px; }
  .mb-meta { color: #666; font-size: 13px; margin: 0 0 6px; }
  .mb-desc { font-size: 13px; margin: 0 0 8px; line-height: 1.4; }
  .mb-contact a { color: #2563eb; text-decoration: none; font-size: 13px; margin-right: 10px; }
  .mb-empty { color: #777; font-size: 14px; padding: 8px 0; }
</style>
<script>
  (function () {
    function render(data) {
      var root = document.getElementById("muyiribi-root");
      var rows = (data && data.results) || [];
      if (!rows.length) {
        root.innerHTML = '<div class="mb-empty">No matching businesses found in the Muyiribi directory.</div>';
        return;
      }
      root.innerHTML = rows.map(function (b) {
        var contacts = [];
        if (b.phone) contacts.push('<a href="tel:' + b.phone + '">' + b.phone + '</a>');
        if (b.whatsapp) contacts.push('<a href="https://wa.me/' + b.whatsapp.replace(/[^0-9]/g, '') + '">WhatsApp</a>');
        if (b.website) contacts.push('<a href="' + b.website + '" target="_blank" rel="noopener">Website</a>');
        return '' +
          '<div class="mb-card">' +
            '<p class="mb-name">' + (b.business_name || '') + '</p>' +
            '<p class="mb-meta">' + (b.category || '') + (b.district ? ' · ' + b.district : '') + '</p>' +
            '<p class="mb-desc">' + (b.description || '') + '</p>' +
            '<p class="mb-contact">' + contacts.join('') + '</p>' +
          '</div>';
      }).join('');
    }
    render(window.openai && window.openai.toolOutput);
    window.addEventListener('openai:set_globals', function (e) {
      if (e.detail && e.detail.toolOutput) render(e.detail.toolOutput);
    });
  })();
</script>
`;

function createServer(sql: Sql) {
	const server = new McpServer({ name: "Muyiribi", version: "1.0.0" });

	server.registerResource(
		"business-results-widget",
		BUSINESS_WIDGET_URI,
		{
			description: "Card list of Muyiribi business listings",
			mimeType: "text/html+skybridge",
			_meta: businessWidgetMeta,
		},
		async () => ({
			contents: [
				{
					uri: BUSINESS_WIDGET_URI,
					mimeType: "text/html+skybridge",
					text: BUSINESS_WIDGET_HTML,
					_meta: businessWidgetMeta,
				},
			],
		}),
	);

	server.registerTool(
		"search_businesses",
		{
			description:
				"Search the Muyiribi Uganda business directory by keyword, category, and/or district, and show the matches as a card list.",
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
			_meta: businessWidgetMeta,
		},
		async ({ keyword, category, district, limit }) => {
			const rows = await searchListings(sql, { keyword, category, district, limit });
			return {
				content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
				structuredContent: { results: rows },
				_meta: businessWidgetMeta,
			};
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

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
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
 * DB. On completion it only marks the payment paid. The OTP is not sent here, because the
 * user has not yet confirmed the verification number (it is entered on the OTP step).
 * No-ops if not pending or not found.
 */
async function checkTierPayment(sql: Sql, env: Env, payment: TierPayment) {
	if (payment.payment_status !== "pending" || !payment.payment_ref) return;

	const txStatus = await getPesapalTransactionStatus(env, payment.payment_ref);
	if (isCompletedStatus(txStatus.status)) {
		await markTierPaymentPaid(sql, payment.id);
	} else if (txStatus.status === "FAILED" || txStatus.status === "INVALID") {
		await markTierPaymentFailed(sql, payment.id);
	}
	// Any other status (pending, etc.): leave as-is.
}

/**
 * Maps the latest tier payment to the single view state the status page renders.
 * Shared by the status page and the polling endpoint so they always agree.
 */
async function tierStateFor(sql: Sql, userId: number) {
	const latest = await findLatestTierPayment(sql, userId);
	if (!latest) return { latest: null, state: "none" as const };
	if (latest.verified_at) return { latest, state: "done" as const };
	if (latest.payment_status === "failed") return { latest, state: "failed" as const };
	if (latest.payment_status === "paid") {
		// Paid, number not yet submitted for OTP -> otp. Code sent -> otp_sent.
		const sent = !!latest.otp_hash && !!latest.otp_expires_at &&
			new Date(latest.otp_expires_at) > new Date();
		return { latest, state: sent ? ("otp_sent" as const) : ("otp" as const) };
	}
	return { latest, state: "paying" as const };
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

		// A payment still in flight goes to its status page instead of starting another.
		const { state } = await tierStateFor(sql, sessionUser.id);
		if (state !== "none" && state !== "failed" && state !== "done") {
			return redirect("/pricing/status");
		}

		return html(
			pricingPage(sessionUser, tiers, {
				currentTierCode: profile.tier_code,
				phoneVerified: profile.phone_verified,
			}),
		);
	}

	// Starts a payment: creates the order, then shows the status page with PesaPal's checkout
	// in an iframe. We pass the phone number the user registered with so PesaPal pre-fills
	// it; the user can still change the mobile money number used to pay on PesaPal's page.
	if (path === "/pricing/start" && method === "POST") {
		const sessionUser = await currentUser(request, sql);
		if (!sessionUser) return redirect("/login");

		const f = await readForm(request);
		const tiers = await listTiers(sql);
		const tier = tiers.find((t) => t.code === f.tier);
		if (!tier || tier.price_ugx <= 0) return redirect("/pricing");

		const id = await createTierPayment(sql, sessionUser.id, tier.code, tier.price_ugx);

		try {
			const origin = new URL(request.url).origin;
			const order = await submitVerificationOrder(env, origin, {
				merchantRef: `tier-${id}`,
				amountUgx: tier.price_ugx,
				description: `Muyiribi ${tier.name} tier`,
				phone: sessionUser.phone,
			});
			await setTierPaymentRef(sql, id, order.order_tracking_id, order.redirect_url);
			return redirect("/pricing/status");
		} catch (err) {
			await markTierPaymentFailed(sql, id);
			const message = err instanceof Error ? err.message : "Could not start the payment.";
			return html(
				tierPaymentStatusPage(sessionUser, {
					kind: "failed",
					tierName: tier.name,
					error: message,
				}),
				502,
			);
		}
	}

	// The one screen for a payment in progress, and the redirect target for every state.
	if (path === "/pricing/status" && method === "GET") {
		const sessionUser = await currentUser(request, sql);
		if (!sessionUser) return redirect("/login");

		const { latest, state } = await tierStateFor(sql, sessionUser.id);
		if (!latest) return redirect("/pricing");
		const tiers = await listTiers(sql);
		const tierName = tiers.find((t) => t.code === latest.tier_code)?.name ?? latest.tier_code;

		if (state === "done") {
			return html(
				tierPaymentStatusPage(sessionUser, {
					kind: "done",
					tierName,
					phone: latest.phone ?? "",
				}),
			);
		}
		if (state === "failed") {
			return html(tierPaymentStatusPage(sessionUser, { kind: "failed", tierName }));
		}
		if (state === "otp" || state === "otp_sent") {
			return html(
				tierPaymentStatusPage(sessionUser, {
					kind: state === "otp_sent" ? "otp_sent" : "otp",
					tierName,
					// Prefill with the account's business contact number, or login phone.
					phone: latest.phone ?? (await getUserProfile(sql, sessionUser.id))?.phone ?? "",
				}),
			);
		}
		// paying: the PesaPal checkout URL was stored when the order was created.
		return html(
			tierPaymentStatusPage(sessionUser, {
				kind: "paying",
				tierName,
				amountUgx: latest.amount_ugx,
				redirectUrl: latest.redirect_url ?? "",
			}),
		);
	}

	// JSON state for the polling script on the paying screen. It only reads the DB, plus one
	// GetTransactionStatus check so the state is not stale while polling.
	if (path === "/pricing/check" && method === "GET") {
		const sessionUser = await currentUser(request, sql);
		if (!sessionUser) {
			const wantHtml = request.headers.get("Accept")?.includes("text/html");
			return wantHtml ? redirect("/login") : json({ state: "signed_out" }, 401);
		}

		const latest = await findLatestTierPayment(sql, sessionUser.id);
		if (latest && !latest.verified_at) {
			try {
				await checkTierPayment(sql, env, latest);
			} catch (err) {
				console.error("pricing/check error:", err);
			}
		}
		const { state } = await tierStateFor(sql, sessionUser.id);

		// Browser request (e.g. user tapped "Check status"): redirect to the status page so
		// they see a proper UI after we've refreshed the payment state from PesaPal.
		const wantHtml = request.headers.get("Accept")?.includes("text/html");
		if (wantHtml) return redirect("/pricing/status");

		return json({ state });
	}

	// Phone number confirmed on the OTP step: validate it, store it against this payment,
	// and send the code. Sending only happens here, so the number is always the one shown.
	if (path === "/pricing/send-code" && method === "POST") {
		const sessionUser = await currentUser(request, sql);
		if (!sessionUser) return redirect("/login");

		const latest = await findLatestTierPayment(sql, sessionUser.id);
		if (!latest || latest.verified_at || latest.payment_status !== "paid")
			return redirect("/pricing/status");

		const tiers = await listTiers(sql);
		const tierName = tiers.find((t) => t.code === latest.tier_code)?.name ?? latest.tier_code;
		const f = await readForm(request);
		const phone = normalisePhone(f.phone ?? "");
		if (!phone) {
			return html(
				tierPaymentStatusPage(sessionUser, {
					kind: "otp",
					tierName,
					phone: f.phone ?? "",
					error: "Enter a valid Uganda phone number.",
				}),
				400,
			);
		}

		const otp = generateOtp();
		const otpHash = await hashToken(otp);
		await setTierPaymentOtp(sql, latest.id, phone, otpHash, new Date(Date.now() + OTP_TTL_MS));

		const sms = await sendSms(
			env,
			phone,
			`Your Muyiribi verification code is ${otp}. It expires in 30 minutes.`,
		);
		if (!sms.success) {
			return html(
				tierPaymentStatusPage(sessionUser, {
					kind: "otp",
					tierName,
					phone,
					error: "We couldn't send the code just now. Try again in a moment.",
				}),
				502,
			);
		}

		return html(
			tierPaymentStatusPage(sessionUser, { kind: "otp_sent", tierName, phone }),
		);
	}

	// Code entry. Checks the hash, enforces attempts, then grants the tier.
	if (path === "/pricing/confirm" && method === "POST") {
		const sessionUser = await currentUser(request, sql);
		if (!sessionUser) return redirect("/login");

		const latest = await findLatestTierPayment(sql, sessionUser.id);
		if (!latest || latest.verified_at || latest.payment_status !== "paid")
			return redirect("/pricing/status");
		if (!latest.otp_hash || !latest.otp_expires_at || !latest.phone) {
			return redirect("/pricing/status");
		}
		if (new Date(latest.otp_expires_at) <= new Date()) {
			return redirect("/pricing/status");
		}

		const f = await readForm(request);
		const codeHash = await hashToken((f.code ?? "").trim());
		const tiers = await listTiers(sql);
		const tierName = tiers.find((t) => t.code === latest.tier_code)?.name ?? latest.tier_code;

		if (codeHash !== latest.otp_hash) {
			const attempts = await recordOtpAttempt(sql, latest.id);
			if (attempts >= MAX_OTP_ATTEMPTS) {
				await invalidateOtp(sql, latest.id);
				return redirect("/pricing/status");
			}
			return html(
				tierPaymentStatusPage(sessionUser, {
					kind: "otp_sent",
					tierName,
					phone: latest.phone,
					error: `Incorrect code. ${MAX_OTP_ATTEMPTS - attempts} attempt(s) left.`,
				}),
				400,
			);
		}

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

	// Where PesaPal sends the user after payment (redirect_mode PARENT_WINDOW, so this loads
	// in the page that holds the iframe). Status is not trusted from the URL; we check it.
	if (path === "/pricing/callback") {
		const orderTrackingId = url.searchParams.get("OrderTrackingId");
		if (orderTrackingId) {
			try {
				const payment = await findTierPaymentByRef(sql, orderTrackingId);
				if (payment) await checkTierPayment(sql, env, payment);
			} catch (err) {
				console.error("pricing/callback error:", err);
			}
		}
		return redirect("/pricing/status");
	}

	// PesaPal IPN, server-to-server, no session. Matched by payment_ref. PesaPal expects a
	// 200 OK regardless of the outcome of our handling.
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

		if (notificationType) return new Response("OK", { status: 200 });
		return redirect("/pricing/status");
	}

	// Old "check status now" route, kept as a redirect so bookmarks and in-flight pages land
	// on the single status screen.
	if (path === "/pricing/confirm" && method === "GET") return redirect("/pricing/status");
	if (path === "/pricing/check-status" || path === "/pricing/check") {
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