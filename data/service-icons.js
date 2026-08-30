/* Service code → icon URL override.
   Only codes that DON'T have a working icon on SmsBower's CDN need entries here.
   Everything else uses the primary source: smsbower.app/img/svg/services/{code}.svg
   
   Sources:
   - Simple Icons CDN (cdn.simpleicons.org/{slug}/{color})
   - Brand-specific CDN URLs for services without a Simple Icons entry */

const SI = (slug, color) => `https://cdn.simpleicons.org/${slug}/${color || '000000'}`;

const OVERRIDES = {
  // Known SmsBower service codes that are missing from their icon CDN
  sf:  SI('spotify', '1DB954'),
  pt:  SI('pinterest', 'BD081C'),
  aez: SI('signal', '3A76F0'),
  aiw: SI('airbnb', 'FF5A5F'),
  zm:  SI('zoom', '0B5CFF'),
  bo:  SI('bolt', '34D186'),
  cy:  SI('codecademy', '1F4056'),
  pn:  SI('protonmail', '6D4AFF'),
  dc:  SI('docusign', 'FFCD00'),
  zi:  SI('zelle', '6D1ED4'),
  ho:  SI('hootsuite', '143059'),
  cp:  SI('cloudflare', 'F38020'),
  yr:  SI('yelp', 'FF1A1A'),

  // Common sms-activate compatible codes with known brands
  // (only needed if SmsBower's CDN doesn't serve them)
  ew:  SI('nike', '111111'),
  ab:  SI('alibabacloud', 'FF6A00'),
  cd:  SI('codepen', '000000'),
  gh:  SI('github', '181717'),
  lj:  SI('livejournal', '00B0EA'),
  ob:  SI('opera', 'FF1B2D'),
};

function iconUrl(code) {
  if (OVERRIDES[code]) return OVERRIDES[code];
  return `https://smsbower.app/img/svg/services/${encodeURIComponent(code)}.svg`;
}

module.exports = { iconUrl, OVERRIDES };
