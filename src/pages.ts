import type { TierInfo } from "./db";

export function esc(s: unknown): string {
	return String(s ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

const STYLE = `
body{font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:24px;color:#1a1a1a;line-height:1.5}
nav{display:flex;gap:16px;margin-bottom:24px}
nav a{color:#0a58ca;text-decoration:none}
h1{font-size:28px} h2{font-size:20px;margin-top:32px}
input,select,textarea{width:100%;padding:8px;margin:4px 0 12px;border:1px solid #ccc;border-radius:6px;font:inherit;box-sizing:border-box}
label{font-size:14px;font-weight:600}
button{background:#0a58ca;color:#fff;border:0;padding:10px 18px;border-radius:6px;font:inherit;cursor:pointer}
button.secondary{background:#eee;color:#1a1a1a}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pw{position:relative}
.pw button{position:absolute;right:6px;top:10px;background:none;color:#0a58ca;padding:4px 8px;font-size:13px}
.msg{padding:10px;border-radius:6px;margin-bottom:16px}
.err{background:#fde8e8;color:#8a1c1c}
.ok{background:#e7f6ec;color:#1d5c2e}
.hint{font-size:13px;color:#666;margin-top:-8px;margin-bottom:12px}
`;

export function layout(title: string, body: string, user?: { phone: string } | null): string {
	const nav = user
		? `<a href="/add">Add listing</a><a href="/pricing">Pricing</a><a href="/logout">Log out (${esc(user.phone)})</a>`
		: `<a href="/login">Log in</a><a href="/signup">Sign up</a>`;
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Muyiribi</title>
<style>${STYLE}</style></head>
<body>
<nav><a href="/"><strong>Muyiribi</strong></a>${nav}</nav>
${body}
<hr style="margin-top:48px;border:0;border-top:1px solid #eee">
<footer style="font-size:13px;color:#666;display:flex;gap:16px;padding:16px 0">
<a href="/info">About</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/support">Support</a>
</footer>
<script>
document.querySelectorAll('[data-toggle-pw]').forEach(function(btn){
  btn.addEventListener('click', function(){
    var input = document.getElementById(btn.getAttribute('data-toggle-pw'));
    var show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.textContent = show ? 'Hide' : 'Show';
  });
});
</script>
</body></html>`;
}

export function landingPage(user: { phone: string } | null): string {
	return layout(
		"Home",
		`
<h1>Find and list businesses in Uganda</h1>
<p>Muyiribi is a directory of businesses and services across Uganda. Anyone can search it, and AI assistants can use it too.</p>
<p>Create a free account with your phone number and password, then list your business. Free accounts can list one business. Paid tiers let you list more and appear higher in results.</p>
${user ? `<p><a href="/add"><button>Add a listing</button></a></p>` : `<p><a href="/signup"><button>Sign up</button></a> <a href="/login"><button class="secondary">Log in</button></a></p>`}
`,
		user,
	);
}

export function termsPage(): string {
	return layout(
		"Terms of Service",
		`
<h1>Terms of Service</h1>
<p><em>Last updated: ${new Date().toISOString().slice(0, 10)}</em></p>
<p>Muyiribi ("we", "us") operates a public directory of businesses and service providers in Uganda. By using this site, the API, or the MCP server, you agree to the following:</p>
<h2>Listings</h2>
<p>Anyone may search the directory. Business owners may create an account and submit a listing. You confirm that information you submit about a business is accurate and that you are authorised to list it. We may remove any listing that is false, abusive, or violates these terms.</p>
<h2>Paid tiers</h2>
<p>Paid tiers affect ranking and listing limits as described on the <a href="/pricing">pricing page</a>. Payments are processed by a third-party provider; refunds are handled on a case-by-case basis — contact <a href="/support">support</a>.</p>
<h2>AI access</h2>
<p>This directory is also exposed to AI assistants (e.g. via MCP, or app connectors) so that users of those assistants can search it. The same listing data shown on this site is what such assistants can see and return.</p>
<h2>No warranty</h2>
<p>Listings are provided by third parties. We do not verify every business and make no guarantee of quality, availability, or accuracy. Use of any listed business or service is at your own risk.</p>
<h2>Changes</h2>
<p>We may update these terms at any time; continued use after a change means you accept the update.</p>
<h2>Contact</h2>
<p>Questions about these terms: see the <a href="/support">support page</a>.</p>
`,
	);
}

export function privacyPage(): string {
	return layout(
		"Privacy Policy",
		`
<h1>Privacy Policy</h1>
<p><em>Last updated: ${new Date().toISOString().slice(0, 10)}</em></p>
<h2>What we collect</h2>
<p>When you create an account: your phone number and a hashed password. When you add a listing: the business details you submit (name, category, district, description, contact info). When you pay for a tier: payment status and reference IDs from our payment provider — we do not store your card or mobile money PIN.</p>
<h2>How we use it</h2>
<p>To operate the directory: authenticate you, display your listing, rank listings by tier, and process payments. We do not sell personal data to third parties.</p>
<h2>AI assistants</h2>
<p>Listing data (business name, category, district, description, and the contact details you chose to make public) is retrievable through our public search API and MCP server, which AI assistants such as Claude and ChatGPT may query on behalf of their users. Only data you submitted as part of a public listing is exposed this way — account passwords and private payment details are never exposed through these interfaces.</p>
<h2>Retention</h2>
<p>We keep account and listing data for as long as your account is active. You can request deletion — see <a href="/support">support</a>.</p>
<h2>Contact</h2>
<p>For privacy questions or data deletion requests, see the <a href="/support">support page</a>.</p>
`,
	);
}

export function supportPage(): string {
	return layout(
		"Support",
		`
<h1>Support</h1>
<p>Need help with your account, a listing, a payment, or something you found through an AI assistant using this directory?</p>
<p><strong>Email:</strong> <a href="mailto:domusdeiug@gmail.com">domusdeiug@gmail.com</a></p>
<p><strong>WhatsApp / Phone:</strong> <a href="https://wa.me/256784786467">+256 784 786467</a></p>
<h2>Common requests</h2>
<ul>
<li>Report an incorrect or outdated listing</li>
<li>Request removal of your business from the directory</li>
<li>Payment or tier issues</li>
<li>Report misuse via an AI assistant connector</li>
</ul>
<p>We aim to respond within 2 business days.</p>
`,
	);
}

export function infoPage(): string {
	return layout(
		"About Muyiribi",
		`
<h1>About Muyiribi</h1>
<p>Muyiribi is a directory of businesses and service providers across Uganda — built so that people (and increasingly, AI assistants acting on their behalf) can find a real business by what it does, where it is, or what it's called.</p>
<h2>How it works</h2>
<p>Business owners create a free account and add a listing: category, district, description, and contact details. Visitors search by keyword, category, or district. Listings can also be found through AI assistants such as Claude and ChatGPT, which can query the directory directly via MCP.</p>
<h2>Tiers</h2>
<p>Free accounts can list one business. Paid tiers allow more listings and better ranking in search results — see <a href="/pricing">pricing</a>.</p>
<h2>Operator</h2>
<p>Muyiribi is operated by Domus Dei Uganda. Contact details are on the <a href="/support">support page</a>.</p>
`,
	);
}

function passwordField(id: string, label: string, autocomplete: string): string {
	return `<label for="${id}">${esc(label)}</label>
<div class="pw"><input id="${id}" name="${id}" type="password" autocomplete="${autocomplete}" required minlength="8">
<button type="button" class="secondary" data-toggle-pw="${id}">Show</button></div>`;
}

export function authPage(mode: "signup" | "login", error?: string): string {
	const isSignup = mode === "signup";
	return layout(
		isSignup ? "Sign up" : "Log in",
		`
<h1>${isSignup ? "Create an account" : "Log in"}</h1>
${error ? `<div class="msg err">${esc(error)}</div>` : ""}
<form method="post" action="/${mode}">
<label for="phone">Phone number</label>
<input id="phone" name="phone" type="tel" placeholder="0700 000 000" autocomplete="tel" required>
<div class="hint">Uganda numbers. Example: 0700123456 or +256700123456</div>
${passwordField("password", "Password", isSignup ? "new-password" : "current-password")}
${isSignup ? `<div class="hint">At least 8 characters.</div>` : ""}
<button type="submit">${isSignup ? "Sign up" : "Log in"}</button>
</form>
${
	isSignup
		? `<p>Already have an account? <a href="/login">Log in</a></p>`
		: `<p>New here? <a href="/signup">Sign up</a></p>`
}
`,
	);
}

export const DESCRIPTION_MIN = 40;

export function addListingPage(
	user: { phone: string },
	categories: string[],
	opts: {
		error?: string;
		success?: boolean;
		atLimit?: boolean;
		count?: number;
		limit?: number | null;
	},
): string {
	if (opts.atLimit) {
		return layout(
			"Listing limit reached",
			`
<h1>Listing limit reached</h1>
<div class="msg err">Your plan allows ${opts.limit} listing${opts.limit === 1 ? "" : "s"}. You have ${opts.count}. Upgrade your plan to add more.</div>`,
			user,
		);
	}

	const body = `
<h1>Add a listing</h1>
${opts.success ? `<div class="msg ok">Your business has been listed.</div>` : ""}
${opts.error ? `<div class="msg err">${esc(opts.error)}</div>` : ""}
<form method="post" action="/add">
<div class="row">
  <div><label for="business_name">Business name *</label><input id="business_name" name="business_name" required></div>
  <div><label for="owner_name">Owner name (optional)</label><input id="owner_name" name="owner_name"></div>
</div>

<label for="category">Category *</label>
<select id="category" name="category" required>
  <option value="">Select a category</option>
  ${categories.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
</select>

<label for="description">Description *</label>
<textarea id="description" name="description" rows="4" required minlength="${DESCRIPTION_MIN}"></textarea>
<div class="hint">At least ${DESCRIPTION_MIN} characters. Describe what you do, your services and specialities, and who you serve. This is what people and AI assistants use to find you.</div>

<div class="row">
  <div><label for="district">District *</label><input id="district" name="district" required></div>
  <div><label for="location">Location (optional)</label><input id="location" name="location" placeholder="Landmark, street or area"></div>
</div>

<h2>Contact</h2>
<label for="phone">Phone *</label>
<input id="phone" name="phone" type="tel" value="${esc(user.phone)}" required>

<label><input type="checkbox" id="whatsapp_same" style="width:auto;margin-right:6px"> This number is on WhatsApp</label>
<label for="whatsapp">WhatsApp number (optional)</label>
<input id="whatsapp" name="whatsapp" type="tel" placeholder="Leave blank if none">

<div class="row">
  <div><label for="email">Email (optional)</label><input id="email" name="email" type="email"></div>
  <div><label for="website">Website (optional)</label><input id="website" name="website"></div>
</div>

<p><button type="submit">Add business</button></p>
</form>
<script>
(function(){
  var same = document.getElementById('whatsapp_same');
  var phone = document.getElementById('phone');
  var wa = document.getElementById('whatsapp');
  function sync(){ if (same.checked) { wa.value = phone.value; wa.readOnly = true; } else { wa.readOnly = false; } }
  same.addEventListener('change', sync);
  phone.addEventListener('input', function(){ if (same.checked) wa.value = phone.value; });
  document.querySelector('form').addEventListener('submit', sync);
})();
</script>`;
	return layout("Add listing", body, user);
}

// ---------- pricing & tier payments ----------

function featureLines(t: TierInfo): string[] {
	const lines: string[] = [];
	lines.push(
		t.max_listings === null
			? "Unlimited listings"
			: `Create up to ${t.max_listings} listing${t.max_listings === 1 ? "" : "s"}`,
	);
	lines.push(
		t.show_limit === null
			? "All your listings appear in search"
			: `Up to ${t.show_limit} listing${t.show_limit === 1 ? "" : "s"} shown in search`,
	);
	if (t.rank > 0) {
		lines.push("Verifies your business contact number (SMS code)");
		lines.push("Higher search ranking than lower tiers");
	}
	return lines;
}

export function pricingPage(
	user: { phone: string } | null,
	tiers: TierInfo[],
	opts: {
		currentTierCode?: string;
		phoneVerified?: boolean;
		defaultPhone?: string;
		error?: string;
	} = {},
): string {
	const cards = tiers
		.map((t) => {
			const isFree = t.price_ugx === 0;
			const isCurrent = opts.currentTierCode === t.code;
			const features = featureLines(t)
				.map((f) => `<li>${esc(f)}</li>`)
				.join("");

			let cta: string;
			if (!user) {
				cta = isFree ? "" : `<a href="/signup"><button>Sign up to subscribe</button></a>`;
			} else if (isFree) {
				cta = isCurrent ? `<p class="hint">Your current plan</p>` : "";
			} else if (isCurrent) {
				cta = `<p class="hint">Your current plan${opts.phoneVerified ? " · phone verified" : ""}</p>`;
			} else {
				cta = `<form method="post" action="/pricing/start">
<input type="hidden" name="tier" value="${esc(t.code)}">
<button type="submit">Get ${esc(t.name)} · UGX ${t.price_ugx.toLocaleString()}/${esc(t.billing_period)}</button>
</form>`;
			}

			return `<div class="msg" style="border:1px solid #ddd">
<h2 style="margin-top:0">${esc(t.name)}${isCurrent ? " ✓" : ""}</h2>
<p><strong>${isFree ? "Free" : `UGX ${t.price_ugx.toLocaleString()} / ${esc(t.billing_period)}`}</strong></p>
<ul>${features}</ul>
${cta}
</div>`;
		})
		.join("");

	return layout(
		"Pricing",
		`<h1>Pricing</h1>
<p>Paid tiers let you list more businesses, rank higher in search, and verify your business contact number by SMS.</p>
${opts.error ? `<div class="msg err">${esc(opts.error)}</div>` : ""}
${cards}`,
		user,
	);
}

export type TierPaymentViewState =
	| { kind: "paying"; tierName: string; amountUgx: number; redirectUrl: string }
	| { kind: "otp"; tierName: string; phone: string; error?: string }
	| { kind: "otp_sent"; tierName: string; phone: string; error?: string }
	| { kind: "done"; tierName: string; phone: string }
	| { kind: "failed"; tierName: string; error?: string };

/**
 * The single screen the user sits on for a paid tier. It moves through states in place:
 * paying (PesaPal checkout in an iframe, polling for status) -> otp (confirm/edit number,
 * send code) -> code entry -> done. Polling only reads state; the server decides every
 * transition, and status always comes from GetTransactionStatus.
 */
export function tierPaymentStatusPage(
	user: { phone: string },
	state: TierPaymentViewState,
): string {
	if (state.kind === "done") {
		return layout(
			"Pricing",
			`<h1>You're all set</h1>
<div class="msg ok">You're now on ${esc(state.tierName)}. ${esc(state.phone)} is verified.</div>
<p><a href="/add"><button>Manage listings</button></a> <a href="/pricing"><button class="secondary">Back to pricing</button></a></p>`,
			user,
		);
	}

	if (state.kind === "failed") {
		return layout(
			"Pricing",
			`<h1>Payment didn't go through</h1>
<div class="msg err">${esc(state.error ?? "The payment wasn't completed. You can try again.")}</div>
<p><a href="/pricing"><button>Back to pricing</button></a></p>`,
			user,
		);
	}

	if (state.kind === "paying") {
		return layout(
			"Pricing · payment",
			`<h1>Pay for ${esc(state.tierName)}</h1>
<p>UGX ${state.amountUgx.toLocaleString()}. Tap the button below to complete your payment on PesaPal. You will be brought back here automatically when it's done.</p>
<p><a href="${esc(state.redirectUrl)}"><button>Go to payment page &rarr;</button></a></p>
<p id="pay-status" class="hint">Already paid? <a href="/pricing/check">Check status</a>.</p>`,
			user,
		);
	}

	// otp and otp_sent share the verification form. Number is prefilled and editable.
	const phone = state.kind === "otp" || state.kind === "otp_sent" ? state.phone : "";
	const sent = state.kind === "otp_sent";
	return layout(
		"Pricing · verify number",
		`<h1>Verify your business number</h1>
<p>Payment received for ${esc(state.tierName)}. Confirm the number that should receive your verification code.</p>
${state.kind === "otp" && state.error ? `<div class="msg err">${esc(state.error)}</div>` : ""}
${sent ? `<div class="msg ok">We sent a 6-digit code by SMS to ${esc(phone)}. It's valid for 30 minutes.</div>` : ""}
<form method="post" action="/pricing/send-code">
<label for="phone">Verification number</label>
<input id="phone" name="phone" type="tel" value="${esc(phone)}" required>
<button type="submit" class="secondary">${sent ? "Send a new code" : "Send code"}</button>
</form>
${sent ? `<form method="post" action="/pricing/confirm" style="margin-top:16px">
<label for="code">Code</label>
<input id="code" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required>
<button type="submit">Verify</button>
</form>` : ""}`,
		user,
	);
}

/**
 * Polls /pricing/check (JSON) every few seconds while paying. Stops after 10 minutes and
 * offers a manual check. On `paid` it moves to the OTP step by navigating to /pricing/status.
 */
function pollScript(checkUrl: string, nextUrl: string): string {
	return `<script>
(function () {
  var started = Date.now(), MAX_MS = 10 * 60 * 1000, statusEl = document.getElementById("pay-status");
  function tick() {
    if (Date.now() - started > MAX_MS) {
      statusEl.textContent = "Still waiting. Refresh this page to check again.";
      return;
    }
    fetch("${checkUrl}", { headers: { Accept: "application/json" }, credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.state === "paid" || j.state === "otp" || j.state === "otp_sent" || j.state === "done") {
          window.location.href = "${nextUrl}";
        } else if (j.state === "failed") {
          window.location.href = "${nextUrl}";
        } else {
          setTimeout(tick, 4000);
        }
      })
      .catch(function () { setTimeout(tick, 6000); });
  }
  setTimeout(tick, 4000);
})();
</script>`;
}
