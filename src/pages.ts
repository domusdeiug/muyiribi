import type { Listing, TierInfo, UserProfile } from "./db";

export function esc(s: unknown): string {
	return String(s ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

const STYLE = `
:root{--ink:#17251e;--muted:#66736b;--line:#dfe7e1;--surface:#fff;--wash:#f4f8f4;--brand:#176b42;--brand-dark:#0f5232;--accent:#e8f5ec;--warn:#9b3b2d;--shadow:0 14px 40px rgba(28,55,38,.08)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--wash);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.55}
a{color:var(--brand);text-underline-offset:3px}.shell{width:min(1080px,calc(100% - 32px));margin:0 auto}.site-header{position:sticky;top:0;z-index:10;background:rgba(244,248,244,.94);border-bottom:1px solid rgba(223,231,225,.9);backdrop-filter:blur(12px)}
nav{min-height:68px;display:flex;align-items:center;gap:22px}.brand{display:flex;align-items:center;gap:10px;margin-right:auto;color:var(--ink);font-size:20px;font-weight:800;text-decoration:none}.brand-logo{width:38px;height:38px;border-radius:11px;object-fit:cover;box-shadow:0 3px 10px rgba(23,37,30,.12)}.nav-links{display:flex;align-items:center;gap:18px}.nav-links a{color:#435149;font-size:14px;font-weight:650;text-decoration:none}.nav-links a:hover{color:var(--brand)}
main{min-height:calc(100vh - 160px);padding:48px 0 64px}h1{font-size:clamp(32px,5vw,52px);line-height:1.08;letter-spacing:-.035em;margin:0 0 16px}h2{font-size:23px;line-height:1.25;letter-spacing:-.015em;margin:32px 0 12px}h3{margin:0 0 6px;font-size:18px}p{margin:0 0 16px}.lead{font-size:19px;color:#526058;max-width:680px}.eyebrow{color:var(--brand);font-size:13px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;margin-bottom:12px}
.hero{padding:48px 0 28px}.hero-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(310px,.85fr);gap:52px;align-items:center}.search-card{background:#fff;padding:28px;border:1px solid var(--line);border-radius:24px;box-shadow:var(--shadow)}.search-card h2{margin:0 0 8px;font-size:26px}.search-card input{margin-bottom:12px}.search-card button{width:100%}.search-form{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(180px,.7fr) minmax(180px,.8fr) auto;gap:12px;align-items:end}.search-form label{margin-bottom:5px}.search-form input,.search-form select{margin:0}.search-form button{white-space:nowrap}.search-summary{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:30px 0 18px}.search-summary h2{margin:0}.contact-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:auto}.contact-actions a{font-size:13px;font-weight:700;text-decoration:none}.result-card{display:flex;flex-direction:column;gap:12px}.result-card .name-line h3{font-size:20px}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin:24px 0}.button,button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:44px;padding:10px 17px;border:1px solid var(--brand);border-radius:10px;background:var(--brand);color:#fff;font:inherit;font-weight:700;text-decoration:none;cursor:pointer;transition:.15s ease}.button:hover,button:hover{background:var(--brand-dark);border-color:var(--brand-dark);transform:translateY(-1px)}.button.secondary,button.secondary{background:#fff;color:var(--ink);border-color:var(--line)}.button.secondary:hover,button.secondary:hover{background:#f8faf8;border-color:#c8d4cb}.button.small{min-height:38px;padding:7px 13px;font-size:14px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:24px;box-shadow:0 4px 18px rgba(28,55,38,.04)}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.feature-card{padding:24px}.feature-icon{display:grid;place-items:center;width:42px;height:42px;margin-bottom:18px;border-radius:12px;background:var(--accent);color:var(--brand);font-weight:900}
.page-head{display:flex;align-items:end;justify-content:space-between;gap:24px;margin-bottom:28px}.page-head h1{font-size:38px}.muted{color:var(--muted)}.stat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:20px 0 30px}.stat{background:#fff;border:1px solid var(--line);border-radius:15px;padding:18px}.stat strong{display:block;font-size:25px;line-height:1.2}.stat span{color:var(--muted);font-size:13px}.listing-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.listing-card{display:flex;flex-direction:column;gap:12px}.listing-card .actions{margin:auto 0 0}.name-line{display:flex;align-items:center;gap:6px}.name-line h3{margin:0}.tier-mark{display:inline-block;width:19px;height:19px;flex:0 0 19px;object-fit:contain;vertical-align:-3px}.listing-meta{display:flex;flex-wrap:wrap;gap:7px;color:var(--muted);font-size:13px}.badge{display:inline-flex;align-items:center;width:max-content;padding:4px 9px;border-radius:999px;background:var(--accent);color:var(--brand-dark);font-size:12px;font-weight:750;text-transform:capitalize}.empty{text-align:center;padding:52px 24px}.empty-icon{font-size:32px;margin-bottom:10px}
.form-card{max-width:820px}.form-section{padding-bottom:8px}.form-section+.form-section{border-top:1px solid var(--line);margin-top:24px;padding-top:4px}form h2{font-size:18px}.row{display:grid;grid-template-columns:1fr 1fr;gap:16px}label{display:block;font-size:14px;font-weight:720;margin-bottom:6px}input,select,textarea{width:100%;padding:11px 12px;margin:0 0 16px;border:1px solid #cbd6ce;border-radius:10px;background:#fff;color:var(--ink);font:inherit;outline:none}textarea{resize:vertical;min-height:122px}input:focus,select:focus,textarea:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(23,107,66,.12)}.check-label{display:flex;align-items:center;gap:8px;font-weight:500;margin:-3px 0 10px}.check-label input{width:auto;margin:0}.hint{font-size:13px;color:var(--muted);margin:-10px 0 15px}.pw{position:relative}.pw button{position:absolute;right:6px;top:5px;min-height:34px;background:transparent;border:0;color:var(--brand);padding:4px 8px;font-size:13px}.msg{padding:13px 15px;border-radius:11px;margin-bottom:18px;border:1px solid transparent}.err{background:#fff0ed;color:#812e22;border-color:#f4d4ce}.ok{background:#eaf7ee;color:#185f37;border-color:#cce9d5}
.auth-wrap{max-width:480px;margin:0 auto}.auth-wrap h1{font-size:38px}.pricing-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.pricing-card{display:flex;flex-direction:column}.pricing-card .name-line h2{margin:0}.pricing-card .tier-mark{width:24px;height:24px;flex-basis:24px}.pricing-card ul{padding-left:20px;flex:1}.price{font-size:27px;font-weight:800}.site-footer{border-top:1px solid var(--line);background:#fff}.footer-inner{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:24px 0;color:var(--muted);font-size:13px}.footer-links{display:flex;flex-wrap:wrap;gap:16px}
@media(max-width:900px){.search-form{grid-template-columns:1fr 1fr}.search-form button{width:100%}}
@media(max-width:760px){.shell{width:min(100% - 24px,1080px)}.site-header{position:static}nav{align-items:flex-start;flex-wrap:wrap;padding:14px 0;gap:12px}.brand{min-height:36px}.nav-links{width:100%;overflow-x:auto;gap:16px;padding-bottom:2px}.nav-links a{white-space:nowrap}main{padding-top:30px}.hero{padding-top:18px}.hero-grid,.grid,.listing-grid,.pricing-grid{grid-template-columns:1fr}.search-card{padding:22px}.page-head{align-items:flex-start;flex-direction:column}.page-head .actions{margin:0}.stat-grid{grid-template-columns:1fr 1fr}.row{grid-template-columns:1fr}.footer-inner{align-items:flex-start;flex-direction:column}}
@media(max-width:560px){.search-form{grid-template-columns:1fr}.search-summary{align-items:flex-start;flex-direction:column}}
@media(max-width:430px){.stat-grid{grid-template-columns:1fr}h1{font-size:36px}.page-head h1{font-size:32px}}
`;

export function layout(title: string, body: string, user?: { phone: string } | null): string {
	const nav = user
		? `<a href="/search">Find businesses</a><a href="/dashboard">Dashboard</a><a href="/add">Add business</a><a href="/pricing">Business plans</a><a href="/logout">Log out</a>`
		: `<a href="/search">Find businesses</a><a href="/info">About</a><a href="/login">Log in</a><a href="/signup">List your business</a>`;
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · UgOnline · Muyiribi</title>
<meta name="description" content="Find Ugandan businesses and list your own with Muyiribi, the business directory from UgOnline.">
<meta property="og:image" content="https://ug-online.domus-dei-tech.workers.dev/logo.png">
<link rel="icon" href="/logo.png" type="image/png">
<link rel="apple-touch-icon" href="/logo.png">
<style>${STYLE}</style></head>
<body>
<header class="site-header"><nav class="shell"><a class="brand" href="/"><img class="brand-logo" src="/logo.png" alt="">UgOnline · Muyiribi</a><div class="nav-links">${nav}</div></nav></header>
<main class="shell">${body}</main>
<footer class="site-footer"><div class="shell footer-inner"><span>© ${new Date().getFullYear()} UgOnline · Muyiribi · Built by Domus Dei Uganda</span><div class="footer-links"><a href="/info">About</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/support">Support</a></div></div></footer>
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
		`<section class="hero"><div class="hero-grid"><div><p class="eyebrow">The Muyiribi business directory by UgOnline</p><h1>Help customers find your business.</h1><p class="lead">Search Ugandan businesses by what they offer and where they work. Own one? List it for free so people and AI assistants can discover and contact you.</p><div class="actions">${user ? `<a class="button" href="/dashboard">Open your dashboard</a><a class="button secondary" href="/add">Add a business</a>` : `<a class="button" href="/signup">List your business free</a><a class="button secondary" href="/search">Find businesses</a>`}</div><p class="muted">Business listings are separate from product adverts on external marketplaces.</p></div><aside class="search-card"><p class="eyebrow">Search businesses</p><h2>Which business or service do you need?</h2><p class="muted">Search by business name or service, such as “solar installation” or “phone repair”. Add a district to narrow the results.</p><form method="get" action="/search"><label for="home-keyword">Business or service</label><input id="home-keyword" name="keyword" placeholder="e.g. phone repair" required><label for="home-district">District or town</label><input id="home-district" name="district" placeholder="e.g. Kampala"><button type="submit">Search businesses →</button></form></aside></div></section><section style="padding:38px 0"><p class="eyebrow">How it helps</p><div class="grid"><article class="card feature-card"><div class="feature-icon">01</div><h3>Find local businesses</h3><p class="muted">Browse businesses by service, category, or district.</p></article><article class="card feature-card"><div class="feature-icon">02</div><h3>Get discovered</h3><p class="muted">Create a free business listing that customers and AI assistants can find.</p></article><article class="card feature-card"><div class="feature-icon">03</div><h3>Keep details current</h3><p class="muted">Use your dashboard to update your business information.</p></article></div><div class="card" style="margin-top:20px"><h3>Looking for a product instead?</h3><p class="muted">UgOnline · Muyiribi also helps you compare marketplace listings through your AI assistant. This website's search is for businesses, not individual products.</p><a href="/info">How UgOnline works →</a></div></section>`,
		user,
	);
}

export function termsPage(): string {
	return layout(
		"Terms of Service",
		`
<h1>Terms of Service</h1>
<p><em>Last updated: 29 October 2026</em></p>
<p>Domus Dei Uganda operates UgOnline · Muyiribi: this website's public Ugandan business directory and an AI-accessible tool that searches external marketplace listings. By using the site or MCP server, you agree to the following:</p>
<h2>Listings</h2>
<p>Anyone may search the directory. Business owners may create an account and submit a listing. You confirm that information you submit about a business is accurate and that you are authorised to list it. We may remove any listing that is false, abusive, or violates these terms.</p>
<h2>Paid tiers</h2>
<p>Paid tiers affect ranking and listing limits as described on the <a href="/pricing">pricing page</a>. Payments are processed by a third-party provider; refunds are handled on a case-by-case basis — contact <a href="/support">support</a>.</p>
<h2>AI access and marketplace searches</h2>
<p>AI assistants can search the business directory and retrieve public business contact details. They can also search product adverts from supported external marketplaces. Marketplace listings, prices, photos and seller details come from those third parties, may change or be unavailable, and do not become Muyiribi business listings. Comparisons are unsponsored and are not a guarantee of the lowest price or best purchase. Follow the original marketplace link to check details and contact the seller; we do not buy, reserve, or reveal protected seller contacts for you.</p>
<h2>No warranty</h2>
<p>Business information is supplied by business owners; product adverts are supplied by external marketplaces. We do not verify every listing or guarantee quality, authenticity, accuracy, pricing, availability, or delivery. Use your judgment and confirm details with the business or seller before a transaction.</p>
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
<p><em>Last updated: 29 October 2026</em></p>
<h2>What we collect</h2>
<p>When you create an account: your phone number and a hashed password. When you add a listing: the business details you submit (name, category, district, description, contact info). When you pay for a tier: payment status and reference IDs from our payment provider — we do not store your card or mobile money PIN.</p>
<h2>How we use it</h2>
<p>To operate the directory: authenticate you, display your listing, rank listings by tier, and process payments. We do not sell personal data to third parties.</p>
<h2>AI assistants and marketplace searches</h2>
<p>Public business details you choose to list (including contact details) can be retrieved through our public search and MCP tools by AI assistants. Account passwords and private payment details are not exposed through these interfaces. Product searches through the AI tool send your search terms and applicable filters to external marketplaces; their responses may include adverts, prices, links, and images. Search results are cached for up to 20 minutes by our Worker, and product images may load from the marketplace's image provider in your client. External marketplaces may process requests under their own privacy policies.</p>
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
<p>Need help with your account, a business listing, a payment, or a marketplace result you found through the AI assistant?</p>
<p><strong>Email:</strong> <a href="mailto:domusdeiug@gmail.com">domusdeiug@gmail.com</a></p>
<p><strong>WhatsApp / Phone:</strong> <a href="https://wa.me/256784786467">+256 784 786467</a></p>
<h2>Common requests</h2>
<ul>
<li>Report an incorrect business listing or an issue with a marketplace search result (for a seller's advert, also contact the original marketplace)</li>
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
		"About",
		`
<h1>About UgOnline · Muyiribi</h1>
<p>UgOnline helps people in Uganda find what they need. Muyiribi is our local name for the experience: you can discuss products with your AI assistant while it searches available marketplace listings and helps you compare options. This website focuses on our own business directory, where people find local businesses and owners make themselves discoverable.</p>
<h2>Search and compare products with AI</h2>
<p>Describe the item, your budget, and the details that matter to you. The UgOnline · Muyiribi AI connector searches supported marketplace listings and returns links to the original adverts for your comparison. It does not cover every seller or guarantee the lowest price. Always confirm price, condition, availability, delivery and purchase terms with the seller on the original marketplace. We do not handle purchases or reveal protected seller contact information.</p>
<h2>Find or list a business</h2>
<p>The <a href="/search">website search</a> finds businesses by name, service, category or district; it does not search individual marketplace products. Owners can <a href="/signup">list a business for free</a>, add contact details and manage their listing. Businesses can also be found by AI assistants through the directory tools. A business listing here does not publish products to other marketplaces.</p>
<h2>Business plans</h2>
<p>Optional <a href="/pricing">paid business plans</a> allow more directory listings and affect business-directory search order. Product comparisons are unsponsored; business plan status is not a recommendation of a marketplace product.</p>
<h2>Operator</h2>
<p>UgOnline · Muyiribi is operated by Domus Dei Uganda. Contact details are on the <a href="/support">support page</a>.</p>
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
		`<section class="auth-wrap"><p class="eyebrow">${isSignup ? "Join Muyiribi" : "Welcome back"}</p>
<h1>${isSignup ? "Create your account" : "Log in"}</h1>
<p class="muted">${isSignup ? "Start with a free business listing. You can upgrade whenever you need more reach." : "Manage your business listings and keep your details current."}</p>
${error ? `<div class="msg err">${esc(error)}</div>` : ""}
<form class="card" method="post" action="/${mode}">
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
</section>`,
	);
}

export const DESCRIPTION_MIN = 40;

function tierMark(tierCode: string): string {
	const marks: Record<string, { file: string; label: string }> = {
		basic: { file: "basic.png", label: "Basic" },
		pro: { file: "pro.png", label: "Pro" },
		premium: { file: "premium.png", label: "Premium" },
	};
	const mark = marks[tierCode];
	return mark
		? `<img class="tier-mark" src="/${mark.file}" alt="${mark.label} verified" title="${mark.label} verified business">`
		: "";
}

export interface PublicSearchQuery {
	keyword: string;
	district: string;
	category: string;
}

function safeWebsite(value: string | null): string | null {
	if (!value) return null;
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
	} catch {
		return null;
	}
}

export function searchPage(
	user: { phone: string } | null,
	categories: string[],
	results: Listing[],
	query: PublicSearchQuery,
): string {
	const hasFilters = Boolean(query.keyword || query.district || query.category);
	const cards = results
		.map((listing) => {
			const website = safeWebsite(listing.website);
			const whatsapp = listing.whatsapp?.replace(/[^0-9]/g, "") ?? "";
			const location = listing.location ? ` · ${esc(listing.location)}` : "";
			const contacts = [
				`<a class="button small" href="tel:${esc(listing.phone)}">Call ${esc(listing.phone)}</a>`,
				whatsapp
					? `<a class="button secondary small" href="https://wa.me/${whatsapp}" target="_blank" rel="noopener">WhatsApp</a>`
					: "",
				website
					? `<a class="button secondary small" href="${esc(website)}" target="_blank" rel="noopener">Website</a>`
					: "",
			].join("");
			return `<article class="card result-card"><div><div class="name-line"><h3>${esc(listing.business_name)}</h3>${tierMark(listing.tier_code)}</div><div class="listing-meta"><span>${esc(listing.category)}</span><span>·</span><span>${esc(listing.district)}${location}</span></div></div><p class="muted">${esc(listing.description)}</p><div class="contact-actions">${contacts}</div></article>`;
		})
		.join("");

	return layout(
		"Search businesses",
		`<p class="eyebrow">Public directory</p><h1>Find a business</h1><p class="lead">Search by business name, service, category, or location. No account required.</p><form class="card search-form" method="get" action="/search"><div><label for="keyword">Business or service</label><input id="keyword" name="keyword" value="${esc(query.keyword)}" placeholder="e.g. solar installation"></div><div><label for="district">District or town</label><input id="district" name="district" value="${esc(query.district)}" placeholder="e.g. Kampala"></div><div><label for="category">Category</label><select id="category" name="category"><option value="">All categories</option>${categories.map((category) => `<option value="${esc(category)}"${category === query.category ? " selected" : ""}>${esc(category)}</option>`).join("")}</select></div><button type="submit">Search</button></form><div class="search-summary"><h2>${hasFilters ? "Search results" : "Browse businesses"}</h2><span class="muted">${results.length} ${results.length === 1 ? "business" : "businesses"} found</span></div>${cards ? `<div class="listing-grid">${cards}</div>` : `<section class="card empty"><div class="empty-icon">⌕</div><h2 style="margin-top:0">No businesses found</h2><p class="muted">Try fewer words, another category, or a nearby district.</p><a href="/search">Clear search</a></section>`}`,
		user,
	);
}

export type ListingFormValues = Partial<
	Pick<
		Listing,
		| "business_name"
		| "owner_name"
		| "category"
		| "description"
		| "district"
		| "location"
		| "phone"
		| "whatsapp"
		| "email"
		| "website"
	>
>;

function listingForm(
	categories: string[],
	values: ListingFormValues,
	action: string,
	submitLabel: string,
): string {
	const value = (key: keyof ListingFormValues) => esc(values[key] ?? "");
	return `<form class="card form-card" method="post" action="${esc(action)}">
<div class="form-section"><h2>Business details</h2><div class="row">
  <div><label for="business_name">Business name *</label><input id="business_name" name="business_name" value="${value("business_name")}" autocomplete="organization" required></div>
  <div><label for="owner_name">Owner or contact name</label><input id="owner_name" name="owner_name" value="${value("owner_name")}" autocomplete="name"></div>
</div>
<label for="category">Category *</label><select id="category" name="category" required><option value="">Select a category</option>${categories.map((c) => `<option value="${esc(c)}"${values.category === c ? " selected" : ""}>${esc(c)}</option>`).join("")}</select>
<label for="description">What does your business offer? *</label><textarea id="description" name="description" rows="5" required minlength="${DESCRIPTION_MIN}" maxlength="1200">${value("description")}</textarea>
<div class="hint">At least ${DESCRIPTION_MIN} characters. Mention your main services, specialities, and customers so search tools can match you accurately.</div>
<div class="row"><div><label for="district">District *</label><input id="district" name="district" value="${value("district")}" autocomplete="address-level1" required></div><div><label for="location">Area or landmark</label><input id="location" name="location" value="${value("location")}" placeholder="e.g. Kisementi, near Acacia Mall" autocomplete="street-address"></div></div></div>
<div class="form-section"><h2>How customers reach you</h2><div class="row"><div><label for="phone">Phone *</label><input id="phone" name="phone" type="tel" value="${value("phone")}" autocomplete="tel" required></div><div><label for="whatsapp">WhatsApp number</label><input id="whatsapp" name="whatsapp" type="tel" value="${value("whatsapp")}" autocomplete="tel" placeholder="Leave blank if none"></div></div>
<label class="check-label"><input type="checkbox" id="whatsapp_same"> Use the phone number above for WhatsApp</label>
<div class="row"><div><label for="email">Email</label><input id="email" name="email" type="email" value="${value("email")}" autocomplete="email"></div><div><label for="website">Website</label><input id="website" name="website" type="url" value="${value("website")}" placeholder="https://example.com" autocomplete="url"></div></div></div>
<div class="actions"><button type="submit">${esc(submitLabel)}</button><a class="button secondary" href="/dashboard">Cancel</a></div>
</form><script>(function(){var same=document.getElementById('whatsapp_same'),phone=document.getElementById('phone'),wa=document.getElementById('whatsapp');if(!same||!phone||!wa)return;function sync(){if(same.checked){wa.value=phone.value;wa.readOnly=true}else{wa.readOnly=false}}same.addEventListener('change',sync);phone.addEventListener('input',function(){if(same.checked)wa.value=phone.value});})();</script>`;
}

export function addListingPage(
	user: { phone: string },
	categories: string[],
	opts: {
		error?: string;
		success?: boolean;
		atLimit?: boolean;
		count?: number;
		limit?: number | null;
		values?: ListingFormValues;
	},
): string {
	if (opts.atLimit) {
		return layout(
			"Listing limit reached",
			`<p class="eyebrow">Your businesses</p><h1>Listing limit reached</h1>
<div class="msg err">Your plan allows ${opts.limit} listing${opts.limit === 1 ? "" : "s"}. You currently have ${opts.count}.</div><div class="actions"><a class="button" href="/pricing">View upgrade options</a><a class="button secondary" href="/dashboard">Back to dashboard</a></div>`,
			user,
		);
	}

	const body = `<p class="eyebrow">Your businesses</p><h1>Add a business</h1><p class="lead">Share enough detail to help the right customers find and contact you.</p>
${opts.error ? `<div class="msg err">${esc(opts.error)}</div>` : ""}
	${listingForm(categories, { phone: user.phone, ...opts.values }, "/add", "Publish business")}`;
	return layout("Add listing", body, user);
}

export function editListingPage(
	user: { phone: string },
	categories: string[],
	listing: ListingFormValues & { id: number },
	opts: { error?: string } = {},
): string {
	return layout(
		"Edit listing",
		`<p class="eyebrow">Your businesses</p><h1>Edit listing</h1><p class="lead">Keep your information accurate so customers always know what you offer and how to reach you.</p>${opts.error ? `<div class="msg err">${esc(opts.error)}</div>` : ""}${listingForm(categories, listing, `/listings/${listing.id}/edit`, "Save changes")}`,
		user,
	);
}

export function dashboardPage(
	user: { phone: string },
	profile: UserProfile,
	tier: TierInfo,
	listings: Listing[],
	limit: number | null,
	saved: boolean,
): string {
	const remaining = limit === null ? "Unlimited" : String(Math.max(limit - listings.length, 0));
	const cards = listings
		.map(
			(listing) =>
				`<article class="card listing-card"><div><span class="badge">${esc(listing.status ?? "approved")}</span></div><div><div class="name-line"><h3>${esc(listing.business_name)}</h3>${tierMark(listing.tier_code)}</div><div class="listing-meta"><span>${esc(listing.category)}</span><span>·</span><span>${esc(listing.district)}</span></div></div><p class="muted">${esc(listing.description.length > 145 ? `${listing.description.slice(0, 145)}…` : listing.description)}</p><div class="actions"><a class="button small" href="/listings/${listing.id}/edit">Edit details</a></div></article>`,
		)
		.join("");
	return layout(
		"Dashboard",
		`<div class="page-head"><div><p class="eyebrow">Business dashboard</p><h1>Your businesses</h1><p class="muted">Signed in as ${esc(user.phone)}</p></div>${limit === null || listings.length < limit ? `<div class="actions"><a class="button" href="/add">+ Add business</a></div>` : ""}</div>${saved ? `<div class="msg ok">Your changes have been saved.</div>` : ""}<section class="stat-grid" aria-label="Account overview"><div class="stat"><strong>${listings.length}</strong><span>Business${listings.length === 1 ? "" : "es"} listed</span></div><div class="stat"><strong>${esc(tier.name)}</strong><span>${profile.phone_verified ? "Verified" : "Current"} plan</span></div><div class="stat"><strong>${remaining}</strong><span>Listing spaces remaining</span></div></section>${listings.length ? `<div class="listing-grid">${cards}</div>` : `<section class="card empty"><div class="empty-icon">◌</div><h2 style="margin-top:0">Add your first business</h2><p class="muted">Create a listing customers and AI assistants can discover.</p><div class="actions" style="justify-content:center"><a class="button" href="/add">Create a listing</a></div></section>`}${limit !== null && listings.length >= limit ? `<div class="card" style="margin-top:20px"><h3>Need room for another business?</h3><p class="muted">Your ${esc(tier.name)} plan is using all ${limit} listing spaces.</p><a href="/pricing">Compare plans →</a></div>` : ""}`,
		user,
	);
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
		lines.push(`${t.name} verification mark beside your business name`);
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
				cta = isFree
					? `<a class="button secondary" href="/signup">Start free</a>`
					: `<a class="button" href="/signup">Sign up to subscribe</a>`;
			} else if (isFree) {
				cta = isCurrent ? `<span class="badge">Current plan</span>` : "";
			} else if (isCurrent) {
				cta = `<span class="badge">Current plan${opts.phoneVerified ? " · verified" : ""}</span>`;
			} else {
				cta = `<form method="post" action="/pricing/start">
<input type="hidden" name="tier" value="${esc(t.code)}">
<button type="submit">Get ${esc(t.name)} · UGX ${t.price_ugx.toLocaleString()}/${esc(t.billing_period)}</button>
</form>`;
			}

			return `<article class="card pricing-card">
<div class="name-line"><h2 style="margin-top:0">${esc(t.name)}</h2>${tierMark(t.code)}</div>
<p class="price">${isFree ? "Free" : `UGX ${t.price_ugx.toLocaleString()}`} ${isFree ? "" : `<small class="muted" style="font-size:13px">/ ${esc(t.billing_period)}</small>`}</p>
<ul>${features}</ul>
${cta}
</article>`;
		})
		.join("");

	return layout(
		"Pricing",
		`<p class="eyebrow">Simple plans</p><h1>Grow your reach</h1>
<p class="lead">Business-directory plans let you list more businesses, rank higher in directory search, and verify a business contact number. They do not affect product recommendations.</p>
${opts.error ? `<div class="msg err">${esc(opts.error)}</div>` : ""}
<div class="pricing-grid">${cards}</div>`,
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
<div class="actions"><a class="button" href="/dashboard">Go to dashboard</a><a class="button secondary" href="/pricing">Back to pricing</a></div>`,
			user,
		);
	}

	if (state.kind === "failed") {
		return layout(
			"Pricing",
			`<h1>Payment didn't go through</h1>
<div class="msg err">${esc(state.error ?? "The payment wasn't completed. You can try again.")}</div>
<a class="button" href="/pricing">Back to pricing</a>`,
			user,
		);
	}

	if (state.kind === "paying") {
		return layout(
			"Pricing · payment",
			`<h1>Pay for ${esc(state.tierName)}</h1>
<p>UGX ${state.amountUgx.toLocaleString()}. Tap the button below to complete your payment on PesaPal. You will be brought back here automatically when it's done.</p>
<p><a class="button" href="${esc(state.redirectUrl)}">Go to payment page →</a></p>
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
${state.error ? `<div class="msg err">${esc(state.error)}</div>` : ""}
${sent ? `<div class="msg ok">We sent a 6-digit code by SMS to ${esc(phone)}. It's valid for 30 minutes.</div>` : ""}
<form method="post" action="/pricing/send-code">
<label for="phone">Verification number</label>
<input id="phone" name="phone" type="tel" value="${esc(phone)}" required>
<button type="submit" class="secondary">${sent ? "Send a new code" : "Send code"}</button>
</form>
${
	sent
		? `<form method="post" action="/pricing/confirm" style="margin-top:16px">
<label for="code">Code</label>
<input id="code" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required>
<button type="submit">Verify</button>
</form>`
		: ""
}`,
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
