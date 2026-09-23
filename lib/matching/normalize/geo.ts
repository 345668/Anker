/**
 * Location → country → macro-region, matched on whole words (doc 11 §4.5).
 *
 * The substring matcher this replaces placed 1,648 non-US firms in the US —
 * "la" (Los Angeles) inside "Netherlands", "Switzerland", "Poland", "Lagos".
 */
import { PhraseMap, normPhrase } from "./text"

export type Region = "north_america" | "europe" | "mea" | "apac" | "latam"
export const REGION_LABELS: Record<Region, string> = {
  north_america: "North America", europe: "Europe", mea: "Middle East & Africa", apac: "Asia-Pacific", latam: "Latin America & Caribbean",
}

/** ISO 3166-1 alpha-2 → [display name, region, …aliases]. */
const COUNTRIES: Record<string, [string, Region, ...string[]]> = {
  US: ["United States", "north_america", "usa", "us", "u s", "u s a", "united states of america", "america", "puerto rico"],
  CA: ["Canada", "north_america"],
  GB: ["United Kingdom", "europe", "uk", "u k", "great britain", "britain", "england", "scotland", "wales", "northern ireland"],
  IE: ["Ireland", "europe", "republic of ireland"],
  FR: ["France", "europe"], DE: ["Germany", "europe", "deutschland"], NL: ["Netherlands", "europe", "the netherlands", "holland"],
  BE: ["Belgium", "europe"], LU: ["Luxembourg", "europe"], CH: ["Switzerland", "europe", "schweiz", "suisse"],
  AT: ["Austria", "europe"], IT: ["Italy", "europe", "italia"], ES: ["Spain", "europe", "espana"], PT: ["Portugal", "europe"],
  SE: ["Sweden", "europe"], NO: ["Norway", "europe"], DK: ["Denmark", "europe"], FI: ["Finland", "europe"], IS: ["Iceland", "europe"],
  PL: ["Poland", "europe"], CZ: ["Czech Republic", "europe", "czechia"], SK: ["Slovakia", "europe"], HU: ["Hungary", "europe"],
  RO: ["Romania", "europe"], BG: ["Bulgaria", "europe"], GR: ["Greece", "europe"], HR: ["Croatia", "europe"], SI: ["Slovenia", "europe"],
  RS: ["Serbia", "europe"], EE: ["Estonia", "europe"], LV: ["Latvia", "europe"], LT: ["Lithuania", "europe"], UA: ["Ukraine", "europe"],
  CY: ["Cyprus", "europe"], MT: ["Malta", "europe"], MC: ["Monaco", "europe"], LI: ["Liechtenstein", "europe"],
  JE: ["Jersey", "europe"], GG: ["Guernsey", "europe"], IM: ["Isle of Man", "europe"], GI: ["Gibraltar", "europe"], TR: ["Turkey", "europe", "turkiye"],
  AE: ["United Arab Emirates", "mea", "uae", "u a e", "emirates"], SA: ["Saudi Arabia", "mea", "ksa", "saudi"], QA: ["Qatar", "mea"],
  BH: ["Bahrain", "mea"], KW: ["Kuwait", "mea"], OM: ["Oman", "mea"], IL: ["Israel", "mea"], EG: ["Egypt", "mea"], JO: ["Jordan", "mea"],
  LB: ["Lebanon", "mea"], MA: ["Morocco", "mea"], TN: ["Tunisia", "mea"], DZ: ["Algeria", "mea"], NG: ["Nigeria", "mea"], KE: ["Kenya", "mea"],
  ZA: ["South Africa", "mea"], GH: ["Ghana", "mea"], RW: ["Rwanda", "mea"], ET: ["Ethiopia", "mea"], UG: ["Uganda", "mea"],
  TZ: ["Tanzania", "mea"], SN: ["Senegal", "mea"], CI: ["Ivory Coast", "mea", "cote d ivoire"], MU: ["Mauritius", "mea"],
  CN: ["China", "apac"], HK: ["Hong Kong", "apac"], TW: ["Taiwan", "apac"], JP: ["Japan", "apac"], KR: ["South Korea", "apac", "korea", "republic of korea"],
  SG: ["Singapore", "apac"], MY: ["Malaysia", "apac"], ID: ["Indonesia", "apac"], TH: ["Thailand", "apac"], VN: ["Vietnam", "apac", "viet nam"],
  PH: ["Philippines", "apac"], IN: ["India", "apac"], PK: ["Pakistan", "apac"], BD: ["Bangladesh", "apac"], LK: ["Sri Lanka", "apac"],
  NP: ["Nepal", "apac"], AU: ["Australia", "apac"], NZ: ["New Zealand", "apac"], KZ: ["Kazakhstan", "apac"], UZ: ["Uzbekistan", "apac"],
  MX: ["Mexico", "latam"], BR: ["Brazil", "latam", "brasil"], AR: ["Argentina", "latam"], CL: ["Chile", "latam"], CO: ["Colombia", "latam"],
  PE: ["Peru", "latam"], UY: ["Uruguay", "latam"], PY: ["Paraguay", "latam"], BO: ["Bolivia", "latam"], EC: ["Ecuador", "latam"],
  VE: ["Venezuela", "latam"], CR: ["Costa Rica", "latam"], PA: ["Panama", "latam"], GT: ["Guatemala", "latam"], DO: ["Dominican Republic", "latam"],
  JM: ["Jamaica", "latam"], KY: ["Cayman Islands", "latam", "cayman"], BM: ["Bermuda", "latam"], BS: ["Bahamas", "latam"],
  BB: ["Barbados", "latam"], VG: ["British Virgin Islands", "latam", "bvi"],
}

const US_STATES: Record<string, string> = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california", CO: "colorado", CT: "connecticut", DE: "delaware",
  FL: "florida", GA: "georgia", HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa", KS: "kansas", KY: "kentucky",
  LA: "louisiana", ME: "maine", MD: "maryland", MA: "massachusetts", MI: "michigan", MN: "minnesota", MS: "mississippi", MO: "missouri",
  MT: "montana", NE: "nebraska", NV: "nevada", NH: "new hampshire", NJ: "new jersey", NM: "new mexico", NY: "new york", NC: "north carolina",
  ND: "north dakota", OH: "ohio", OK: "oklahoma", OR: "oregon", PA: "pennsylvania", RI: "rhode island", SC: "south carolina",
  SD: "south dakota", TN: "tennessee", TX: "texas", UT: "utah", VT: "vermont", VA: "virginia", WA: "washington", WV: "west virginia",
  WI: "wisconsin", WY: "wyoming", DC: "district of columbia",
}

/** Cities that settle a country on their own. Ambiguous names (Cambridge, Greenwich) are left out. */
const CITIES: Record<string, string[]> = {
  US: ["new york city", "nyc", "manhattan", "brooklyn", "san francisco", "bay area", "sf bay area", "silicon valley", "palo alto", "menlo park",
    "mountain view", "los angeles", "santa monica", "san diego", "seattle", "boston", "chicago", "austin", "dallas", "houston", "denver",
    "boulder", "miami", "atlanta", "washington dc", "washington d c", "philadelphia", "pittsburgh", "salt lake city", "lehi", "provo",
    "park city", "phoenix", "scottsdale", "las vegas", "portland", "minneapolis", "detroit", "nashville", "raleigh", "durham", "charlotte",
    "st louis", "saint louis", "kansas city", "columbus", "cleveland", "cincinnati", "indianapolis", "baltimore", "new haven", "stamford",
    "princeton", "san jose", "oakland", "berkeley", "irvine", "redwood city", "sunnyvale", "cupertino", "san mateo", "tampa", "orlando",
    "honolulu", "boise", "omaha", "milwaukee", "sacramento", "san juan"],
  CA: ["toronto", "vancouver", "montreal", "calgary", "ottawa", "waterloo", "edmonton"],
  GB: ["london", "manchester", "edinburgh", "glasgow", "birmingham", "bristol", "oxford", "leeds", "belfast"],
  FR: ["paris", "lyon"], DE: ["berlin", "munich", "munchen", "hamburg", "frankfurt", "cologne", "koln", "dusseldorf", "stuttgart"],
  NL: ["amsterdam", "rotterdam", "the hague", "eindhoven", "utrecht"], BE: ["brussels", "antwerp"],
  CH: ["zurich", "geneva", "basel", "lausanne", "zug"], AT: ["vienna", "wien"], IT: ["milan", "milano", "rome", "roma", "turin", "torino"],
  ES: ["madrid", "barcelona", "valencia"], PT: ["lisbon", "porto"], SE: ["stockholm", "gothenburg"], NO: ["oslo"], DK: ["copenhagen"],
  FI: ["helsinki", "espoo"], IS: ["reykjavik"], PL: ["warsaw", "krakow"], CZ: ["prague"], HU: ["budapest"], RO: ["bucharest"],
  BG: ["sofia"], GR: ["athens"], HR: ["zagreb"], SI: ["ljubljana"], RS: ["belgrade"], EE: ["tallinn"], LV: ["riga"], LT: ["vilnius"],
  UA: ["kyiv", "kiev"], IE: ["dublin"], CY: ["nicosia", "limassol"], MT: ["valletta"], TR: ["istanbul", "ankara"],
  AE: ["dubai", "abu dhabi"], SA: ["riyadh", "jeddah"], QA: ["doha"], BH: ["manama"], KW: ["kuwait city"], OM: ["muscat"],
  IL: ["tel aviv", "jerusalem", "herzliya"], EG: ["cairo"], JO: ["amman"], LB: ["beirut"], MA: ["casablanca"], TN: ["tunis"],
  NG: ["lagos", "abuja"], KE: ["nairobi"], ZA: ["cape town", "johannesburg"], GH: ["accra"], RW: ["kigali"], ET: ["addis ababa"],
  UG: ["kampala"], TZ: ["dar es salaam"], SN: ["dakar"], CI: ["abidjan"],
  CN: ["beijing", "shanghai", "shenzhen", "hangzhou", "guangzhou"], TW: ["taipei"], JP: ["tokyo", "osaka", "kyoto"], KR: ["seoul", "busan"],
  MY: ["kuala lumpur"], ID: ["jakarta"], TH: ["bangkok"], VN: ["ho chi minh city", "hanoi"], PH: ["manila"],
  IN: ["mumbai", "bombay", "bangalore", "bengaluru", "delhi", "new delhi", "gurgaon", "gurugram", "noida", "hyderabad", "pune", "chennai", "kolkata", "ahmedabad"],
  PK: ["karachi", "lahore", "islamabad"], BD: ["dhaka"], LK: ["colombo"], NP: ["kathmandu"],
  AU: ["sydney", "melbourne", "brisbane", "perth", "adelaide"], NZ: ["auckland", "wellington"], KZ: ["almaty"],
  MX: ["mexico city", "monterrey", "guadalajara"], BR: ["sao paulo", "rio de janeiro"], AR: ["buenos aires"], CL: ["santiago"],
  CO: ["bogota", "medellin"], PE: ["lima"], UY: ["montevideo"], EC: ["quito"], VE: ["caracas"], PA: ["panama city"],
}

/** Region-only phrases; "latin america" must win over "america" → US, so these are longer than any alias they contain. */
const REGION_PHRASES: Record<string, Region> = {
  "north america": "north_america", "latin america": "latam", "south america": "latam", "central america": "latam", "caribbean": "latam",
  "europe": "europe", "european union": "europe", "eu": "europe", "emea": "europe", "nordics": "europe", "nordic": "europe", "dach": "europe",
  "benelux": "europe", "cee": "europe", "central and eastern europe": "europe", "western europe": "europe",
  "middle east": "mea", "mena": "mea", "gcc": "mea", "gulf": "mea", "africa": "mea", "sub saharan africa": "mea",
  "asia": "apac", "apac": "apac", "asia pacific": "apac", "southeast asia": "apac", "sea": "apac", "south asia": "apac", "oceania": "apac", "anz": "apac",
}
const GLOBAL = new Set(["global", "worldwide", "international", "anywhere", "remote"])

type Hit = { country?: string; region?: Region; global?: true }
const MAP = new PhraseMap<Hit>()
for (const [code, [name, , ...aliases]] of Object.entries(COUNTRIES)) for (const n of [name, ...aliases]) MAP.set(n, { country: code })
for (const [, name] of Object.entries(US_STATES)) MAP.set(name, { country: "US" })
for (const [code, cities] of Object.entries(CITIES)) for (const c of cities) MAP.set(c, { country: code })
for (const [p, r] of Object.entries(REGION_PHRASES)) MAP.set(p, { region: r })
for (const g of GLOBAL) MAP.set(g, { global: true })
// "new york" is both a state and the city; "georgia" is treated as the US state.
MAP.set("new york", { country: "US" })

export interface GeoResolution {
  /** ISO alpha-2 of the first country the text names, if any. */
  country: string | null
  region: Region | null
  /** Every country named, in order. */
  countries: string[]
  /** Every region named or implied, in order. */
  regions: Region[]
  global: boolean
}

export function regionOf(country: string | null | undefined): Region | null {
  return country ? COUNTRIES[country]?.[1] ?? null : null
}
export function countryName(code: string | null | undefined): string | null {
  return code ? COUNTRIES[code]?.[0] ?? null : null
}

/**
 * Resolve free-text locations. Explicit country fields go first (e.g.
 * `investors.investor_country`), then the location text. "San Francisco, CA"
 * is read through the two-letter state code after a comma.
 */
export function resolveGeo(...texts: (string | null | undefined)[]): GeoResolution {
  const countries: string[] = [], regions: Region[] = []
  let global = false
  const addCountry = (c: string) => {
    if (!countries.includes(c)) countries.push(c)
    const r = regionOf(c)
    if (r && !regions.includes(r)) regions.push(r)
  }
  for (const t of texts) {
    if (!t) continue
    for (const hit of MAP.findAll(t)) {
      if (hit.country) addCountry(hit.country)
      else if (hit.region && !regions.includes(hit.region)) regions.push(hit.region)
      else if (hit.global) global = true
    }
    // "Austin, TX" / "Boston, MA": an upper-case state code after a comma,
    // only when nothing else placed the text ("Berlin, DE" stays German).
    if (!countries.length) {
      for (const m of t.matchAll(/,\s*([A-Z]{2})\b/g)) if (US_STATES[m[1]]) { addCountry("US"); break }
    }
  }
  const country = countries[0] ?? null
  return { country, region: regionOf(country) ?? regions[0] ?? null, countries, regions, global }
}

/** A list of target places (countries, regions, cities) → the countries and regions it covers. */
export function resolveTargets(targets: string[] | null | undefined): { countries: Set<string>; regions: Set<Region>; global: boolean } {
  const countries = new Set<string>(), regions = new Set<Region>()
  let global = false
  for (const t of targets ?? []) {
    const g = resolveGeo(t)
    g.countries.forEach((c) => countries.add(c))
    if (!g.countries.length) g.regions.forEach((r) => regions.add(r))
    if (g.global) global = true
  }
  return { countries, regions, global }
}

/** Normalised key for a location string, for facets. */
export function geoKey(text: string | null | undefined): string {
  return normPhrase(text ?? "")
}
