// PesaPal order submission, ported from the reference Deno/Supabase edge function to this
// Cloudflare Worker. Key difference: billing_address.phone_number is filled in, which is
// what makes PesaPal push a mobile-money prompt straight to the phone instead of only
// offering a hosted payment page.
//
// Requires PESAPAL_CONSUMER_KEY / PESAPAL_CONSUMER_SECRET as Worker secrets, and optionally
// PESAPAL_ENV = "live" (defaults to sandbox).

function pesapalBase(env: Env): string {
	return env.PESAPAL_ENV === "live"
		? "https://pay.pesapal.com/v3"
		: "https://cybqa.pesapal.com/pesapalv3";
}

async function getPesapalToken(env: Env): Promise<string> {
	const res = await fetch(`${pesapalBase(env)}/api/Auth/RequestToken`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Accept: "application/json" },
		body: JSON.stringify({
			consumer_key: env.PESAPAL_CONSUMER_KEY,
			consumer_secret: env.PESAPAL_CONSUMER_SECRET,
		}),
	});
	const json = (await res.json()) as Record<string, unknown>;
	if (!json.token) throw new Error(`PesaPal auth failed: ${JSON.stringify(json)}`);
	return json.token as string;
}

async function registerIpn(env: Env, token: string, ipnUrl: string): Promise<string> {
	const res = await fetch(`${pesapalBase(env)}/api/URLSetup/RegisterIPN`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({ url: ipnUrl, ipn_notification_type: "GET" }),
	});
	const json = (await res.json()) as Record<string, unknown>;
	if (!json.ipn_id)
		throw new Error(`Failed to register PesaPal IPN URL: ${JSON.stringify(json)}`);
	return json.ipn_id as string;
}

export interface PesapalOrder {
	order_tracking_id: string;
	redirect_url: string;
}

/**
 * Submits a PesaPal order for a verification payment and pushes a mobile-money prompt
 * to `phone`. `workerBaseUrl` should be the Worker's own origin (e.g. from
 * `new URL(request.url).origin`), used to build the IPN/callback URL.
 */
export async function submitVerificationOrder(
	env: Env,
	workerBaseUrl: string,
	opts: { merchantRef: string; amountUgx: number; phone: string },
): Promise<PesapalOrder> {
	const token = await getPesapalToken(env);
	const callbackUrl = `${workerBaseUrl}/payments/pesapal-ipn`;
	const ipnId = await registerIpn(env, token, callbackUrl);

	const res = await fetch(`${pesapalBase(env)}/api/Transactions/SubmitOrderRequest`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({
			id: opts.merchantRef,
			currency: "UGX",
			amount: opts.amountUgx,
			description: "Muyiribi business verification",
			callback_url: callbackUrl,
			notification_id: ipnId,
			branch: "Muyiribi",
			billing_address: {
				phone_number: opts.phone.replace(/^\+/, ""),
				country_code: "UG",
				email_address: "",
				first_name: "",
				last_name: "",
				line_1: "",
				city: "",
				state: "",
				postal_code: "",
				zip_code: "",
			},
		}),
	});

	const json = (await res.json()) as Record<string, unknown>;
	if (!json.order_tracking_id)
		throw new Error(`PesaPal did not return an order: ${JSON.stringify(json)}`);
	return {
		order_tracking_id: json.order_tracking_id as string,
		redirect_url: (json.redirect_url as string) ?? "",
	};
}

export interface PesapalTransactionStatus {
	status: string; // normalised uppercase, e.g. "COMPLETED", "FAILED", "INVALID"
}

export async function getPesapalTransactionStatus(
	env: Env,
	orderTrackingId: string,
): Promise<PesapalTransactionStatus> {
	const token = await getPesapalToken(env);
	const res = await fetch(
		`${pesapalBase(env)}/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`,
		{
			headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
		},
	);
	const json = (await res.json()) as Record<string, unknown>;
	return { status: String(json.payment_status_description ?? "UNKNOWN").toUpperCase() };
}

export function isCompletedStatus(status: string): boolean {
	return status === "COMPLETED" || status === "SUCCESS";
}
