/**
 * pax-recommender.js
 * Recommends a pax count using a transparent, tunable heuristic: airport
 * "tier" (mega/major/medium/regional, from data/airports.json) on both ends
 * of the route selects a load-factor range from data/pax-rules.json,
 * applied to the aircraft's typical seat count.
 *
 * IMPORTANT: this is NOT real route statistics — no free public dataset
 * exists for actual historical load factors per route. It's a rule-of-thumb
 * system. Tune the numbers in pax-rules.json, not this file.
 */

function tierPairKey(tierA, tierB, tierRank) {
  const [hi, lo] = [tierA, tierB].sort(
    (x, y) => (tierRank[y] || 0) - (tierRank[x] || 0)
  );
  return `${hi}-${lo}`;
}

/**
 * depAirport / arrAirport: records from airports.json (must have `.tier`)
 * aircraftData: record from aircraft.json (must have `.seats_typical`)
 * paxRules: parsed pax-rules.json
 */
export function recommendPax(depAirport, arrAirport, aircraftData, paxRules) {
  if (!depAirport || !arrAirport) {
    return { valid: false, error: 'Butuh data bandara ADEP dan ADES yang sudah resolved.' };
  }
  if (!depAirport.tier || !arrAirport.tier) {
    return { valid: false, error: 'Data bandara tidak punya field tier.' };
  }

  const key = tierPairKey(depAirport.tier, arrAirport.tier, paxRules.tierRank);
  const range = paxRules.loadFactorMatrix[key];

  if (!range) {
    return { valid: false, error: `Tidak ada aturan load factor untuk pasangan tier: ${key}` };
  }

  const seats = aircraftData.seats_typical;
  const midLf = (range.min + range.max) / 2;
  const recommendedPax = Math.round(seats * (midLf / 100));

  return {
    valid: true,
    tierPair: key,
    depTier: depAirport.tier,
    arrTier: arrAirport.tier,
    loadFactorRangePercent: range,
    recommendedLoadFactorPercent: Math.round(midLf * 10) / 10,
    seatsTypical: seats,
    recommendedPax,
    paxRangeMin: Math.round(seats * (range.min / 100)),
    paxRangeMax: Math.round(seats * (range.max / 100)),
    disclaimer: 'Heuristik tier pasangan bandara, bukan data load factor rute riil.'
  };
}
