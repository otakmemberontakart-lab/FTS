/**
 * airport-resolver.js
 * Resolves a user-typed ADEP/ADES string (ICAO, IATA, or city/airport name)
 * to one or more matching airport records from data/airports.json.
 *
 * Pure functions — no fetch/DOM. Caller loads airports.json once, builds
 * the index with buildAirportIndex(), then reuses it for every lookup.
 */

export function buildAirportIndex(airportsArray) {
  const byIcao = new Map();
  const byIata = new Map();
  for (const a of airportsArray) {
    if (a.icao) byIcao.set(a.icao.toUpperCase(), a);
    if (a.iata) byIata.set(a.iata.toUpperCase(), a);
  }
  return { list: airportsArray, byIcao, byIata };
}

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

const TIER_RANK = { mega: 4, major: 3, medium: 2, regional: 1 };

/**
 * Returns: { matchType, confidence (0-1), best, candidates[] }
 * matchType: 'icao_exact' | 'iata_exact' | 'fuzzy' | 'none'
 */
export function resolveAirport(query, index) {
  const raw = (query || '').trim();
  if (!raw) return { matchType: 'none', confidence: 0, best: null, candidates: [] };

  const upper = raw.toUpperCase();

  // 1. Exact ICAO (4 letters)
  if (/^[A-Z]{4}$/.test(upper) && index.byIcao.has(upper)) {
    const a = index.byIcao.get(upper);
    return { matchType: 'icao_exact', confidence: 1, best: a, candidates: [a] };
  }

  // 2. Exact IATA (3 letters)
  if (/^[A-Z]{3}$/.test(upper) && index.byIata.has(upper)) {
    const a = index.byIata.get(upper);
    return { matchType: 'iata_exact', confidence: 1, best: a, candidates: [a] };
  }

  // 3. Fuzzy match on airport name / city
  const q = normalize(raw);
  if (!q) return { matchType: 'none', confidence: 0, best: null, candidates: [] };

  const scored = [];
  for (const a of index.list) {
    const name = normalize(a.name);
    const city = normalize(a.city);
    let score = 0;
    if (name === q || city === q) score = 100;
    else if (name.startsWith(q) || city.startsWith(q)) score = 80;
    else if (name.includes(q) || city.includes(q)) score = 60;
    if (score > 0) {
      score += (TIER_RANK[a.tier] || 0); // tie-break: bigger airport wins
      scored.push({ a, score });
    }
  }

  if (scored.length === 0) {
    return { matchType: 'none', confidence: 0, best: null, candidates: [] };
  }

  scored.sort((x, y) => y.score - x.score);
  const candidates = scored.slice(0, 5).map(s => s.a);
  const confidence = Math.min(scored[0].score / 100, 1);

  return {
    matchType: 'fuzzy',
    confidence: Math.round(confidence * 100) / 100,
    best: candidates[0],
    candidates
  };
}
