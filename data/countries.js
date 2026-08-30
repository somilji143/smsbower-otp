/* Country english name → ISO 3166-1 alpha-2 code, for flag rendering.
   Keys are normalized: lowercase, letters only. */

const MAP = {
  afghanistan: 'af', albania: 'al', algeria: 'dz', angola: 'ao', anguilla: 'ai',
  antiguaandbarbuda: 'ag', argentina: 'ar', armenia: 'am', aruba: 'aw', australia: 'au',
  austria: 'at', azerbaijan: 'az', bahamas: 'bs', bahrain: 'bh', bangladesh: 'bd',
  barbados: 'bb', belarus: 'by', belgium: 'be', belize: 'bz', benin: 'bj',
  bermuda: 'bm', bhutan: 'bt', bolivia: 'bo', bosniaandherzegovina: 'ba', botswana: 'bw',
  brazil: 'br', britishvirginislands: 'vg', brunei: 'bn', bulgaria: 'bg', burkinafaso: 'bf',
  burundi: 'bi', cambodia: 'kh', cameroon: 'cm', canada: 'ca', capeverde: 'cv',
  caymanislands: 'ky', centralafricanrepublic: 'cf', chad: 'td', chile: 'cl', china: 'cn',
  colombia: 'co', comoros: 'km', congo: 'cg', drcongo: 'cd', democraticrepublicofthecongo: 'cd',
  costarica: 'cr', croatia: 'hr', cuba: 'cu', curacao: 'cw', cyprus: 'cy',
  czechrepublic: 'cz', czechia: 'cz', denmark: 'dk', djibouti: 'dj', dominica: 'dm',
  dominicanrepublic: 'do', easttimor: 'tl', timorleste: 'tl', ecuador: 'ec', egypt: 'eg',
  elsalvador: 'sv', england: 'gb', unitedkingdom: 'gb', uk: 'gb', greatbritain: 'gb',
  equatorialguinea: 'gq', eritrea: 'er', estonia: 'ee', eswatini: 'sz', swaziland: 'sz',
  ethiopia: 'et', fiji: 'fj', finland: 'fi', france: 'fr', frenchguiana: 'gf',
  frenchpolynesia: 'pf', gabon: 'ga', gambia: 'gm', georgia: 'ge', germany: 'de',
  ghana: 'gh', gibraltar: 'gi', greece: 'gr', greenland: 'gl', grenada: 'gd',
  guadeloupe: 'gp', guam: 'gu', guatemala: 'gt', guinea: 'gn', guineabissau: 'gw',
  guyana: 'gy', haiti: 'ht', honduras: 'hn', hongkong: 'hk', hungary: 'hu',
  iceland: 'is', india: 'in', indonesia: 'id', iran: 'ir', iraq: 'iq',
  ireland: 'ie', israel: 'il', italy: 'it', ivorycoast: 'ci', cotedivoire: 'ci',
  jamaica: 'jm', japan: 'jp', jordan: 'jo', kazakhstan: 'kz', kenya: 'ke',
  kosovo: 'xk', kuwait: 'kw', kyrgyzstan: 'kg', laos: 'la', latvia: 'lv',
  lebanon: 'lb', lesotho: 'ls', liberia: 'lr', libya: 'ly', liechtenstein: 'li',
  lithuania: 'lt', luxembourg: 'lu', macau: 'mo', madagascar: 'mg', malawi: 'mw',
  malaysia: 'my', maldives: 'mv', mali: 'ml', malta: 'mt', martinique: 'mq',
  mauritania: 'mr', mauritius: 'mu', mayotte: 'yt', mexico: 'mx', moldova: 'md',
  monaco: 'mc', mongolia: 'mn', montenegro: 'me', montserrat: 'ms', morocco: 'ma',
  mozambique: 'mz', myanmar: 'mm', burma: 'mm', namibia: 'na', nepal: 'np',
  netherlands: 'nl', newcaledonia: 'nc', newzealand: 'nz', nicaragua: 'ni', niger: 'ne',
  nigeria: 'ng', northkorea: 'kp', northmacedonia: 'mk', macedonia: 'mk', norway: 'no',
  oman: 'om', pakistan: 'pk', palestine: 'ps', panama: 'pa', papuanewguinea: 'pg',
  paraguay: 'py', peru: 'pe', philippines: 'ph', poland: 'pl', portugal: 'pt',
  puertorico: 'pr', qatar: 'qa', reunion: 're', romania: 'ro', russia: 'ru',
  russianfederation: 'ru', rwanda: 'rw', saintkittsandnevis: 'kn', saintlucia: 'lc',
  saintvincentandthegrenadines: 'vc', salvador: 'sv', samoa: 'ws', sanmarino: 'sm',
  saotomeandprincipe: 'st', saudiarabia: 'sa', senegal: 'sn', serbia: 'rs',
  seychelles: 'sc', sierraleone: 'sl', singapore: 'sg', slovakia: 'sk', slovenia: 'si',
  solomonislands: 'sb', somalia: 'so', southafrica: 'za', southkorea: 'kr', korea: 'kr',
  southsudan: 'ss', spain: 'es', srilanka: 'lk', sudan: 'sd', suriname: 'sr',
  sweden: 'se', switzerland: 'ch', syria: 'sy', taiwan: 'tw', tajikistan: 'tj',
  tanzania: 'tz', thailand: 'th', togo: 'tg', tonga: 'to', trinidadandtobago: 'tt',
  tunisia: 'tn', turkey: 'tr', turkmenistan: 'tm', turksandcaicos: 'tc', uganda: 'ug',
  ukraine: 'ua', unitedarabemirates: 'ae', uae: 'ae', unitedstates: 'us', usa: 'us',
  unitedstatesofamerica: 'us', uruguay: 'uy', uzbekistan: 'uz', vanuatu: 'vu',
  venezuela: 've', vietnam: 'vn', yemen: 'ye', zambia: 'zm', zimbabwe: 'zw',
};

function isoForCountry(name) {
  if (!name) return null;
  const key = String(name).toLowerCase().replace(/[^a-z]/g, '');
  return MAP[key] || null;
}

module.exports = { isoForCountry };
