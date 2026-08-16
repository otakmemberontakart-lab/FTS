import fs from 'fs';
import { JSDOM } from 'jsdom';
import { buildAirportIndex, resolveAirport } from '../engine/airport-resolver.js';
import { recommendPax } from '../engine/pax-recommender.js';
import { computeFullPrep } from '../engine/calc.js';
import { parseSimpleDistance, parseWaypointRows } from '../engine/route-parser.js';
import { planAltitude } from '../engine/altitude-planner.js';

// fpl-import.js needs DOMParser -- inject jsdom's before importing it
const dom = new JSDOM('');
global.DOMParser = dom.window.DOMParser;
const { parseFplXml } = await import('../engine/fpl-import.js');

const airports = JSON.parse(fs.readFileSync('./data/airports.json', 'utf-8'));
const aircraftAll = JSON.parse(fs.readFileSync('./data/aircraft.json', 'utf-8'));
const paxRules = JSON.parse(fs.readFileSync('./data/pax-rules.json', 'utf-8'));
const index = buildAirportIndex(airports);

let failures = 0;
function check(label, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + label);
  if (!cond) failures++;
}

console.log('=== 1. Aircraft count ===');
check('23 aircraft loaded', Object.keys(aircraftAll).length === 23);
check('777F removed', !('777F' in aircraftAll));
check('A321-200 flap terminology renamed', aircraftAll['A321-200'].vref.flap_takeoff === 'Flaps 2');
check('B737-800 flap has degree symbol', aircraftAll['B737-800'].vref.flap_takeoff.includes('°'));
check('A380-800 exists with correct MTOW', aircraftAll['A380-800'].mtow === 575000);

console.log('\n=== 2. route-parser.js — Model 1 unchanged ===');
const simple = parseSimpleDistance('337');
check('simple distance parses', simple.valid && simple.totalDistanceNm === 337);

console.log('\n=== 3. route-parser.js — Model 2 table rows (structured, not text) ===');
const tableRows = [
  { name: 'RW05', hdg: '45', legDistNm: '0', alt: '0' },
  { name: 'DE',   hdg: '45', legDistNm: '12', alt: '5022' },
  { name: 'TOC',  hdg: '118', legDistNm: '99', alt: '35000' },
  { name: '', hdg: '', legDistNm: '', alt: '' }, // empty row (user added but never filled)
];
const tableResult = parseWaypointRows(tableRows);
check('table parses, ignores empty row', tableResult.valid && tableResult.waypoints.length === 3);
check('total distance = 111', tableResult.totalDistanceNm === 111);
check('RW05 alt=0 classified as ground', tableResult.waypoints[0].altStatus === 'ground');
check('highest alt = 35000', tableResult.highestAltFt === 35000);

console.log('\n=== 4. fpl-import.js — real Infinite Flight file ===');
const fplXml = fs.readFileSync('/mnt/user-data/uploads/FlightPlan_WIMM_WSSS.fpl', 'utf-8');
const fplResult = parseFplXml(fplXml);
check('fpl parses OK', fplResult.valid);
check('16 waypoints', fplResult.rows.length === 16);
check('total distance ~419.2 NM', Math.abs(fplResult.meta.totalDistanceNm - 419.2) < 1);
check('AKPAG alt = 30000 ft (elevation 9144m converted)', fplResult.rows.find(r => r.name === 'AKPAG').alt === 30000);
check('RW20R alt = 0 (no elevation in file)', fplResult.rows.find(r => r.name === 'RW20R').alt === 0);
check('ASUNA alt = 0 (no elevation, not RW-named)', fplResult.rows.find(r => r.name === 'ASUNA').alt === 0);

// feed the imported rows straight into parseWaypointRows, like the UI would
const importedTable = parseWaypointRows(fplResult.rows);
check('imported rows re-parse OK', importedTable.valid);
check('imported total matches', Math.abs(importedTable.totalDistanceNm - 419.2) < 1);
check('imported highest alt = 30000', importedTable.highestAltFt === 30000);
check('imported ASUNA -> not_mandatory', importedTable.waypoints.find(w => w.name === 'ASUNA').altStatus === 'not_mandatory');
check('imported RW20R -> ground', importedTable.waypoints.find(w => w.name === 'RW20R').altStatus === 'ground');

console.log('\n=== 5. altitude-planner.js — priority chain ===');
const p1 = planAltitude({ distanceNm: 419.2, userFL: 350, tableHighestAltFt: 30000, destElevFt: 22 });
check('userFL wins over table', p1.source === 'user_field' && p1.cruiseFL === 350);

const p2 = planAltitude({ distanceNm: 419.2, tableHighestAltFt: 30000, destElevFt: 22 });
check('table wins when userFL empty', p2.source === 'table_highest' && p2.cruiseFL === 300);

const p3 = planAltitude({ distanceNm: 419.2, destElevFt: 22 });
check('auto-recommend when both empty', p3.source === 'recommended');

console.log('\n=== 6. Full pipeline — WIMM -> WSSS, A321-200 (matches hand-calculated dummy) ===');
const dep = resolveAirport('WIMM', index).best;
const arr = resolveAirport('WSSS', index).best;
check('WIMM resolved', !!dep);
check('WSSS resolved', !!arr);

const aircraft = aircraftAll['A321-200'];
const paxRec = recommendPax(dep, arr, aircraft, paxRules);
console.log('  PAX recommendation:', paxRec.recommendedPax, '(tier', paxRec.tierPair + ')');

const result = computeFullPrep({
  aircraftData: aircraft,
  pax: paxRec.recommendedPax,
  distanceNm: importedTable.totalDistanceNm,
  depAirport: dep,
  arrAirport: arr,
  tableHighestAltFt: importedTable.highestAltFt,
  approachMode: 'ils',
  platform: 'infinite_flight',
  includeAtc: false
});

check('cruise FL = 300 (from table highest)', result.altitudePlan.cruiseFL === 300);
check('altitude source = table_highest', result.altitudePlan.source === 'table_highest');
console.log('  TOW:', Math.round(result.wb.tow), 'kg | Block fuel:', result.fuel.fuelRangeLow, '-', result.fuel.fuelRangeHigh, 'kg');
console.log('  V1/VR/V2:', result.vspeeds.v1, result.vspeeds.vr, result.vspeeds.v2, '| flap:', result.vspeeds.flapRecommendation);
console.log('  VAPP:', result.approach.vapp, 'kt');
console.log('  Trim: RFS', result.trim.rfsValue, '| IF', result.trim.ifPercent);

console.log('\n=== 7. approach-profile.js — ARM APPR position + VAPP explicit ===');
const armRow = result.approach.rows.find(r => r.action.includes('ARM APPR'));
check('ARM APPR exists', !!armRow);
check('ARM APPR at 10NM (merged with Flaps 2/Gear)', armRow && armRow.distanceNm === 10);
check('ARM APPR row also has Flaps 2 + Gear text', armRow && armRow.action.includes('Flaps 2') && armRow.action.includes('GEAR DOWN'));
const stableRow = result.approach.rows.find(r => r.action.includes('STABLE GATE'));
check('stable gate row tagged isVapp', stableRow && stableRow.isVapp === true);
check('stable gate speedKt is numeric VAPP value', stableRow && stableRow.speedKt === result.approach.vapp);

console.log('\n=== 7b. THE BUG FIX — full TOD-to-landing coverage, no gap ===');
const todRow = result.approach.rows.find(r => r.action.includes('TOD'));
check('TOD row exists in approach.rows (was completely missing before)', !!todRow);
check('TOD row distance matches altitudePlan.todDistanceNm', todRow && todRow.distanceNm === result.altitudePlan.todDistanceNm);
const has10k = result.approach.rows.some(r => r.altitudeFt === 10000);
check('10,000ft crossing row exists', has10k);
const allDistances = result.approach.rows.map(r => r.distanceNm).filter(d => d !== null).sort((a,b) => b-a);
console.log('  All checkpoint distances (should descend smoothly, no huge gap):', allDistances);
let maxGap = 0;
for (let i = 1; i < allDistances.length; i++) maxGap = Math.max(maxGap, allDistances[i-1] - allDistances[i]);
check(`no gap larger than ~35NM between consecutive checkpoints (max gap: ${maxGap})`, maxGap < 35);
check('every row has a vs (V/S) field now', result.approach.rows.every(r => r.vs));

console.log('\n=== 7c. Manual mode gets the SAME upper descent completeness ===');
const resultManualCheck = computeFullPrep({
  aircraftData: aircraft, pax: paxRec.recommendedPax, distanceNm: importedTable.totalDistanceNm,
  depAirport: dep, arrAirport: arr, tableHighestAltFt: importedTable.highestAltFt,
  approachMode: 'manual', platform: 'infinite_flight'
});
const todRowManual = resultManualCheck.approach.rows.find(r => r.action.includes('TOD'));
check('Manual mode ALSO has TOD row (same completeness as ILS)', !!todRowManual);
check('Manual mode has same number of upper-descent rows as ILS',
  resultManualCheck.approach.rows.filter(r => r.altitudeFt >= 10000).length === result.approach.rows.filter(r => r.altitudeFt >= 10000).length);

console.log('\n=== 8. climb-profile.js — physics-appropriate ROC, positive rate, lights ===');
const climbRows = result.climb.rows;
check('has positive rate row', climbRows.some(r => r.action.includes('POSITIVE RATE')));
check('has landing lights ON at liftoff', climbRows.some(r => r.action.includes('Landing lights ON')));
check('has landing lights OFF at 10000ft', climbRows.some(r => r.action.includes('Landing lights OFF')));
check('has seatbelt OFF callout', climbRows.some(r => r.action.includes('Seatbelt sign OFF')));
check('final row reaches actual cruise FL300 (not generic tier label)', climbRows[climbRows.length-1].action.includes('FL300'));
check('final row distance matches climbDistanceNm', climbRows[climbRows.length-1].distanceNm === result.altitudePlan.climbDistanceNm);
console.log('  Climb ROC decreases with altitude (physics check):');
climbRows.filter(r => r.altitudeFt !== null).forEach(r => console.log('   ', r.distanceNm, 'NM |', r.altitudeFt, 'ft | V/S:', r.vs));

console.log('\n=== 9. trim.js ===');
check('RFS format 0.00-1.00', result.trim.rfsValue >= 0 && result.trim.rfsValue <= 1);
check('IF format has % and sign', /^[+-]\d+%$/.test(result.trim.ifPercent));

console.log('\n=== 10. New aircraft spot-check (A380-800, 787-9) ===');
const a380 = aircraftAll['A380-800'];
const b789 = aircraftAll['787-9'];
const arrA380 = resolveAirport('WSSS', index).best;
const depA380 = resolveAirport('WIMM', index).best;
const resultA380 = computeFullPrep({
  aircraftData: a380, pax: 400, distanceNm: 419.2,
  depAirport: depA380, arrAirport: arrA380, userFL: 350,
  approachMode: 'ils', platform: 'rfs'
});
check('A380 pipeline runs without error', resultA380.wb.tow > 0);
check('A380 atc is null on RFS platform', resultA380.atc === null);
console.log('  A380 TOW:', Math.round(resultA380.wb.tow), 'kg | VAPP:', resultA380.approach.vapp, 'kt | Trim IF:', resultA380.trim.ifPercent);

console.log('\n=== 11. unicom-script.js — validated against user\'s own WICA->WAHI log example ===');
const { buildUnicomSequence } = await import('../engine/unicom-script.js');
const wicaRows = [
  { name: 'WICA', hdg: '', legDistNm: '0', alt: '' },
  { name: 'PALIM', hdg: '107', legDistNm: '14.9', alt: '' },
  { name: 'LACAP', hdg: '122', legDistNm: '18.9', alt: '' },
  { name: 'CLP', hdg: '152', legDistNm: '50.0', alt: '' },
  { name: 'HK402', hdg: '103', legDistNm: '54.4', alt: '' },
  { name: 'HK401', hdg: '109', legDistNm: '3.5', alt: '' },
  { name: 'WAHI', hdg: '109', legDistNm: '4.0', alt: '' }
];
const wicaParsed = parseWaypointRows(wicaRows);
check('WICA->WAHI total = 145.7 NM (matches log)', wicaParsed.totalDistanceNm === 145.7);
const wicaResult = buildUnicomSequence({
  depAirport: { icao: 'WICA' }, arrAirport: { icao: 'WAHI' },
  routeMode: 'waypoints', waypoints: wicaParsed.waypoints, totalDistanceNm: wicaParsed.totalDistanceNm
});
check('straight-in detected TRUE (matches log)', wicaResult.straightIn === true);
check('announce inbound at ~7.5NM near HK402 (matches log, not some arbitrary far waypoint)', wicaResult.announceDistanceNm === 7.5);
check('departing East for 107° heading (matches log)', wicaResult.steps.find(s => s.action === 'TAKEOFF').say.includes('East'));
check('ARM APPR never mentioned (confirmed NOT part of Unicom per log)', !JSON.stringify(wicaResult).includes('ARM APPR'));
check('has 5 steps: Taxi, Takeoff, Announce Inbound, Report Final, Clear of Runways', wicaResult.steps.length === 5);

console.log('\n=== 12. unicom-script.js — pattern-needed case (sharp heading change near arrival) ===');
const patternRows = [
  { name: 'WIMM', hdg: '', legDistNm: '0', alt: '' },
  { name: 'ENROUTE1', hdg: '180', legDistNm: '200', alt: '' },
  { name: 'APPR_FIX', hdg: '270', legDistNm: '15', alt: '' },
  { name: 'WIII', hdg: '90', legDistNm: '5', alt: '' }
];
const patternParsed = parseWaypointRows(patternRows);
const patternResult = buildUnicomSequence({
  depAirport: { icao: 'WIMM' }, arrAirport: { icao: 'WIII' },
  routeMode: 'waypoints', waypoints: patternParsed.waypoints, totalDistanceNm: patternParsed.totalDistanceNm
});
check('straight-in detected FALSE (sharp heading change)', patternResult.straightIn === false);
check('has Downwind/Base/Final report position steps', patternResult.steps.some(s => s.action.includes('Downwind')) && patternResult.steps.some(s => s.action.includes('Base')));
check('left/right rule is printed, not guessed', patternResult.leftRightRule.includes('POV KAMU'));

console.log('\n=== 13. unicom-script.js — Model 1 (simple) fallback: generic distance cues only ===');
const simpleUnicom = buildUnicomSequence({
  depAirport: { icao: 'WIMM' }, arrAirport: { icao: 'WIII' },
  routeMode: 'simple', waypoints: null, totalDistanceNm: 337
});
check('Model 1 has no straight-in determination (null)', simpleUnicom.straightIn === null);
check('Model 1 still has all 5 phase steps', simpleUnicom.steps.length === 5);

console.log('\n=== 14. Full pipeline includes unicom atc output correctly ===');
const resultUnicom = computeFullPrep({
  aircraftData: aircraft, pax: paxRec.recommendedPax, distanceNm: importedTable.totalDistanceNm,
  depAirport: dep, arrAirport: arr, tableHighestAltFt: importedTable.highestAltFt,
  approachMode: 'ils', platform: 'infinite_flight', includeAtc: true,
  routeMode: 'waypoints', waypoints: importedTable.waypoints
});
check('atc.steps exists (unicom structure, not old atc-script structure)', Array.isArray(resultUnicom.atc.steps));
check('old atc-script fields (departure/arrival arrays) are gone', resultUnicom.atc.departure === undefined);

console.log('\n=== SUMMARY ===');
console.log(failures === 0 ? `ALL CHECKS PASSED` : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
