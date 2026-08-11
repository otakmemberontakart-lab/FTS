import fs from 'fs';
import { buildAirportIndex, resolveAirport } from './engine/airport-resolver.js';
import { recommendPax } from './engine/pax-recommender.js';
import { computeFullPrep } from './engine/calc.js';
import { parseWaypointList } from './engine/route-parser.js';

const airports = JSON.parse(fs.readFileSync('./data/airports.json', 'utf-8'));
const aircraftAll = JSON.parse(fs.readFileSync('./data/aircraft.json', 'utf-8'));
const paxRules = JSON.parse(fs.readFileSync('./data/pax-rules.json', 'utf-8'));

const index = buildAirportIndex(airports);

console.log('=== 1. AIRPORT RESOLVER ===');
const tests = ['WIBB', 'sin', 'Pekanbaru', 'Singapore Changi', 'nonexistentxyz'];
for (const q of tests) {
  const r = resolveAirport(q, index);
  console.log(`"${q}" ->`, r.matchType, r.best ? `${r.best.icao} (${r.best.name}, tier=${r.best.tier})` : 'NOT FOUND');
}

console.log('\n=== 2. PAX RECOMMENDER (WIBB -> WSSS, A321-200) ===');
const dep = resolveAirport('WIBB', index).best;
const arr = resolveAirport('WSSS', index).best;
const aircraft = aircraftAll['A321-200'];
const paxRec = recommendPax(dep, arr, aircraft, paxRules);
console.log(paxRec);

console.log('\n=== 3. FULL CALC PIPELINE (using recommended pax) ===');
const result = computeFullPrep({
  aircraftData: aircraft,
  pax: paxRec.recommendedPax,
  distanceNm: 162,
  maxRunwayFt: dep.max_runway_ft
});
console.log('Cargo total:', result.cargo.total, 'kg');
console.log('Meal total:', result.meal.total.toFixed(1), 'kg');
console.log('Fuel range:', result.fuel.fuelRangeLow, '-', result.fuel.fuelRangeHigh, 'kg');
console.log('ZFW/TOW/LW:', Math.round(result.wb.zfw), '/', Math.round(result.wb.tow), '/', Math.round(result.wb.lw), 'kg');
console.log('V-speeds:', result.vspeeds);

console.log('\n=== 4. ROUTE PARSER sanity re-check ===');
const wp = `WIBB : 180 : 0 NM : 102ft
TOC : 118 : 73 NM : FL220
TOD : 118 : 18 NM : FL220
WSSS : 203 : 70 NM : 22ft`;
console.log(parseWaypointList(wp));
