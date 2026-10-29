// The marketplace widget is separate from the Muyiribi business-directory widget.
export const MARKETPLACE_WIDGET_URI = "ui://widget/marketplace-results-v1.html";
const IMAGE_ORIGIN = "https://pictures-uganda.jijistatic.com";

export const marketplaceWidgetMeta = {
	ui: {
		resourceUri: MARKETPLACE_WIDGET_URI,
		csp: { resourceDomains: [IMAGE_ORIGIN] },
	},
	"openai/outputTemplate": MARKETPLACE_WIDGET_URI,
	"openai/toolInvocation/invoking": "Searching Jiji marketplace…",
	"openai/toolInvocation/invoked": "Found marketplace listings",
	"openai/widgetAccessible": true,
	"openai/resultCanProduceWidget": true,
	"openai/widgetCSP": {
		connect_domains: [],
		resource_domains: [IMAGE_ORIGIN],
	},
} as const;

// Untrusted listing text is inserted with textContent, never innerHTML.
// Only images from Jiji's known CDN and listing links on jiji.ug are rendered.
export const MARKETPLACE_WIDGET_HTML = /* html */ `
<div id="marketplace-results"></div>
<style>
  #marketplace-results { font-family: -apple-system, system-ui, sans-serif; }
  .marketplace-card { display: flex; gap: 12px; padding: 12px; border: 1px solid #e2e2e2; border-radius: 12px; margin: 0 0 10px; background: #fff; }
  .marketplace-photo { width: 110px; height: 110px; flex: 0 0 110px; border-radius: 8px; object-fit: cover; background: #f4f4f4; }
  .marketplace-body { min-width: 0; }
  .marketplace-title { font-size: 15px; font-weight: 600; margin: 0 0 6px; }
  .marketplace-price { font-weight: 600; margin: 0 0 6px; }
  .marketplace-meta { color: #555; font-size: 13px; margin: 0 0 8px; }
  .marketplace-link { color: #2563eb; font-size: 13px; }
  .marketplace-empty { color: #666; padding: 12px; }
</style>
<script>
(function () {
  var root = document.getElementById('marketplace-results');
  function allowedUrl(value, hostname) {
    try {
      var url = new URL(value);
      return url.protocol === 'https:' && url.hostname === hostname ? url.href : null;
    } catch (_) { return null; }
  }
  function addText(parent, tag, className, value) {
    var el = document.createElement(tag);
    el.className = className;
    el.textContent = value || '';
    parent.appendChild(el);
  }
  function render(data) {
    root.replaceChildren();
    if (data && data.error) { addText(root, 'p', 'marketplace-empty', data.error); return; }
    var rows = data && Array.isArray(data.listings) ? data.listings : [];
    if (!rows.length) { addText(root, 'p', 'marketplace-empty', 'No matching marketplace listings found.'); return; }
    rows.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'marketplace-card';
      var image = allowedUrl(item.image, 'pictures-uganda.jijistatic.com');
      if (image) {
        var img = document.createElement('img');
        img.className = 'marketplace-photo';
        img.src = image;
        img.alt = item.title || 'Marketplace product';
        img.loading = 'lazy';
        card.appendChild(img);
      }
      var body = document.createElement('div');
      body.className = 'marketplace-body';
      addText(body, 'p', 'marketplace-title', item.title);
      addText(body, 'p', 'marketplace-price', item.price);
      addText(body, 'p', 'marketplace-meta', [item.condition, item.region].filter(Boolean).join(' · '));
      var link = allowedUrl(item.listing_url, 'jiji.ug');
      if (link) {
        var a = document.createElement('a');
        a.className = 'marketplace-link';
        a.href = link;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = 'View original listing';
        body.appendChild(a);
      }
      card.appendChild(body);
      root.appendChild(card);
    });
  }
  render(window.openai && window.openai.toolOutput);
  window.addEventListener('openai:set_globals', function (event) {
    if (event.detail && event.detail.toolOutput) render(event.detail.toolOutput);
  });
})();
</script>
`;
