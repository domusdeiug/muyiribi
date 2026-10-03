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
		? `<a href="/add">Add listing</a><a href="/logout">Log out (${esc(user.phone)})</a>`
		: `<a href="/login">Log in</a><a href="/signup">Sign up</a>`;
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Muyiribi</title>
<style>${STYLE}</style></head>
<body>
<nav><a href="/"><strong>Muyiribi</strong></a>${nav}</nav>
${body}
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
	return layout("Home", `
<h1>Find and list businesses in Uganda</h1>
<p>Muyiribi is a directory of businesses and services across Uganda. Anyone can search it, and AI assistants can use it too.</p>
<p>Create a free account with your phone number and password, then list your business. Free accounts can list one business. Paid tiers let you list more and appear higher in results.</p>
${user ? `<p><a href="/add"><button>Add a listing</button></a></p>` : `<p><a href="/signup"><button>Sign up</button></a> <a href="/login"><button class="secondary">Log in</button></a></p>`}
`, user);
}

function passwordField(id: string, label: string, autocomplete: string): string {
	return `<label for="${id}">${esc(label)}</label>
<div class="pw"><input id="${id}" name="${id}" type="password" autocomplete="${autocomplete}" required minlength="8">
<button type="button" class="secondary" data-toggle-pw="${id}">Show</button></div>`;
}

export function authPage(mode: "signup" | "login", error?: string): string {
	const isSignup = mode === "signup";
	return layout(isSignup ? "Sign up" : "Log in", `
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
${isSignup
	? `<p>Already have an account? <a href="/login">Log in</a></p>`
	: `<p>New here? <a href="/signup">Sign up</a></p>`}
`);
}

export const DESCRIPTION_MIN = 40;

export function addListingPage(
	user: { phone: string },
	categories: string[],
	opts: { error?: string; success?: boolean; atLimit?: boolean; count?: number; limit?: number | null },
): string {
	if (opts.atLimit) {
		return layout("Listing limit reached", `
<h1>Listing limit reached</h1>
<div class="msg err">Your plan allows ${opts.limit} listing${opts.limit === 1 ? "" : "s"}. You have ${opts.count}. Upgrade your plan to add more.</div>`, user);
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
