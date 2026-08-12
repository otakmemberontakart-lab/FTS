import fs from 'fs';
import { buildAirportIndex, resolveAirport } from '../engine/airport-resolver.js';
import { recommendPax } from '../engine/pax-recommender.js';
import { computeFullPrep } from '../engine/calc.js';
import { parseWaypointList } from '../engine/route-parser.js';
import { planAltitude, recommendCruiseFL } from '../engine/altitude-planner.js';

const airports = JSON.parse(fs.readFileSync('./data/airports.json', 'utf-8'));
const aircraftAll = JSON.parse(fs.readFileSync('./data/aircraft.json', 'utf-8'));
const paxRules = JSON.parse(fs.readFileSync('./data/pax-rules.json', 'utf-8'));

const index = buildAirportIndex(airports);

console.log('=== 1. AIRPORT RESOLVER ===');
for (const q of ['WIBB', 'sin', 'Pekanbaru', 'Singapore Changi', 'nonexistentxyz']) {
  const r = resolveAirport(q, index);
  console.log(`"${q}" ->`, r.matchType, r.best ? `${r.best.icao} (tier=${r.best.tier}, ILS-likely=${r.best.likely_has_ils})` : 'NOT FOUND');
}

const dep = resolveAirport('WIBB', index).best;
const arr = resolveAirport('WSSS', index).best;
const aircraft = aircraftAll['A321-200'];

console.log('\n=== 2. PAX RECOMMENDER ===');
const paxRec = recommendPax(dep, arr, aircraft, paxRules);
console.log(paxRec);

console.log('\n=== 3. ALTITUDE PLANNER — no user FL (auto recommend) ===');
const autoFL = planAltitude({ distanceNm: 162, destElevFt: arr.elev_ft });
console.log(autoFL);

console.log('\n=== 4. ALTITUDE PLANNER — user FL 220 (feasible) ===');
const userFL220 = planAltitude({ distanceNm: 162, userFL: 220, destElevFt: arr.elev_ft });
console.log(userFL220);

console.log('\n=== 5. ALTITUDE PLANNER — user FL 370 on a 162NM route (should warn) ===');
const userFL370 = planAltitude({ distanceNm: 162, userFL: 370, destElevFt: arr.elev_ft });
console.log(userFL370);

console.log('\n=== 6. FULL CALC PIPELINE — ILS mode, auto FL ===');
const resultIls = computeFullPrep({
  aircraftData: aircraft,
  pax: paxRec.recommendedPax,
  distanceNm: 162,
  depAirport: dep,
  arrAirport: arr,
  approachMode: 'ils'
});
console.log('Cruise FL used:', resultIls.altitudePlan.cruiseFL, '(source:', resultIls.altitudePlan.source + ')');
console.log('TOD:', resultIls.altitudePlan.todDistanceNm, 'NM before destination');
console.log('Fuel range:', resultIls.fuel.fuelRangeLow, '-', resultIls.fuel.fuelRangeHigh, 'kg');
console.log('TOW/LW:', Math.round(resultIls.wb.tow), '/', Math.round(resultIls.wb.lw), 'kg');
console.log('V-speeds:', resultIls.vspeeds.v1, resultIls.vspeeds.vr, resultIls.vspeeds.v2, 'flap:', resultIls.vspeeds.flapRecommendation);
console.log('Approach mode:', resultIls.approach.mode, '| VAPP:', resultIls.approach.vapp, '| DA:', resultIls.approach.decisionAltitudeFt);
console.log('Approach rows:', resultIls.approach.rows.length, 'stages');
resultIls.approach.rows.forEach(r => console.log('  ', r.distanceNm, 'NM |', r.altitudeFt, 'ft |', r.speedKt, 'kt |', r.action));

console.log('\n=== 7. FULL CALC PIPELINE — Manual mode, user FL 220 ===');
const resultManual = computeFullPrep({
  aircraftData: aircraft,
  pax: paxRec.recommendedPax,
  distanceNm: 162,
  depAirport: dep,
  arrAirport: arr,
  userFL: 220,
  approachMode: 'manual'
});
console.log('Cruise FL used:', resultManual.altitudePlan.cruiseFL, '(source:', resultManual.altitudePlan.source + ')');
console.log('Approach mode:', resultManual.approach.mode, '| VAPP:', resultManual.approach.vapp, '| Stable gate:', resultManual.approach.stableGateFt, 'ft');

console.log('\n=== 9. PLATFORM / ATC — Infinite Flight + ATC included ===');
const resultIfAtc = computeFullPrep({
  aircraftData: aircraft, pax: paxRec.recommendedPax, distanceNm: 162,
  depAirport: dep, arrAirport: arr, approachMode: 'ils',
  platform: 'infinite_flight', includeAtc: true
});
console.log('platform:', resultIfAtc.platform, '| atc present:', !!resultIfAtc.atc);
console.log('atc.arrival[1].say (Tower):', resultIfAtc.atc.arrival[1].say);

console.log('\n=== 10. PLATFORM / ATC — Infinite Flight but ATC NOT included ===');
const resultIfNoAtc = computeFullPrep({
  aircraftData: aircraft, pax: paxRec.recommendedPax, distanceNm: 162,
  depAirport: dep, arrAirport: arr, approachMode: 'ils',
  platform: 'infinite_flight', includeAtc: false
});
console.log('platform:', resultIfNoAtc.platform, '| atc present:', !!resultIfNoAtc.atc, '(harus false)');

console.log('\n=== 11. PLATFORM / ATC — RFS (ATC harus selalu null walau includeAtc true) ===');
const resultRfs = computeFullPrep({
  aircraftData: aircraft, pax: paxRec.recommendedPax, distanceNm: 162,
  depAirport: dep, arrAirport: arr, approachMode: 'ils',
  platform: 'rfs', includeAtc: true
});
console.log('platform:', resultRfs.platform, '| atc present:', !!resultRfs.atc, '(harus false, RFS gak pakai ATC script)');

console.log('\n=== 12. PLATFORM / ATC — Manual approach mode -> arrival call harus "Visual" ===');
const resultVisualAtc = computeFullPrep({
  aircraftData: aircraft, pax: paxRec.recommendedPax, distanceNm: 162,
  depAirport: dep, arrAirport: arr, approachMode: 'manual',
  platform: 'infinite_flight', includeAtc: true
});
console.log('atc.arrival[1].say (Tower, manual mode):', resultVisualAtc.atc.arrival[1].say);

console.log('\n=== 8. ROUTE PARSER sanity re-check ===');
const wp = `WIBB : 180 : 0 NM : 102ft
TOC : 118 : 73 NM : FL220
TOD : 118 : 18 NM : FL220
WSSS : 203 : 70 NM : 22ft`;
console.log(parseWaypointList(wp));
