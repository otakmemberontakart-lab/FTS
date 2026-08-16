import fs from 'fs';
import { buildAirportIndex, resolveAirport } from '../engine/airport-resolver.js';
import { recommendPax } from '../engine/pax-recommender.js';
import { computeFullPrep } from '../engine/calc.js';
import { parseWaypointRows } from '../engine/route-parser.js';
import { renderOfpHtml } from '../ui/ofp-template.js';

const airports = JSON.parse(fs.readFileSync(new URL('../data/airports.json', import.meta.url)));
const aircraftAll = JSON.parse(fs.readFileSync(new URL('../data/aircraft.json', import.meta.url)));
const paxRules = JSON.parse(fs.readFileSync(new URL('../data/pax-rules.json', import.meta.url)));

const index = buildAirportIndex(airports);
const depAirport = resolveAirport('WIMM', index).best;
const arrAirport = resolveAirport('WSSS', index).best;

function testAircraft(aircraftKey, approachMode) {
  const aircraftData = aircraftAll[aircraftKey];
  const paxRecommendation = recommendPax(depAirport, arrAirport, aircraftData, paxRules);
  const distanceResult = parseWaypointRows([
    { name: 'WIMM', hdg: '', legDistNm: '0', alt: '0' },
    { name: 'AKPAG', hdg: '106', legDistNm: '133.4', alt: '30000' },
    { name: 'RW20R', hdg: '203', legDistNm: '281.8', alt: '0' },
    { name: 'WSSS', hdg: '187', legDistNm: '1.6', alt: '0' }
  ]);

  const calcResult = computeFullPrep({
    aircraftData,
    pax: paxRecommendation.recommendedPax,
    distanceNm: distanceResult.totalDistanceNm,
    depAirport, arrAirport,
    tableHighestAltFt: distanceResult.highestAltFt,
    approachMode, platform: 'infinite_flight', includeAtc: true,
    routeMode: distanceResult.mode, waypoints: distanceResult.waypoints
  });

  const html = renderOfpHtml({
    aircraftKey, aircraftData, depAirport, arrAirport,
    paxMode: 'auto', paxValue: null, paxRecommendation,
    distanceResult, calcResult, generatedAt: new Date().toISOString()
  });

  const problems = [];
  if (html.includes('undefined')) problems.push('mengandung "undefined"');
  if (html.includes('NaN')) problems.push('mengandung "NaN"');
  if (!html.includes('TRIM TAKEOFF')) problems.push('section trim tidak muncul');
  if (!html.includes('CLIMB PROFILE')) problems.push('section climb tidak muncul');
  if (!html.includes('POSITIVE RATE')) problems.push('positive rate row tidak muncul');
  if (!html.includes('VAPP (')) problems.push('VAPP tidak eksplisit');
  if (!html.includes('UNICOM SEQUENCE')) problems.push('Unicom section tidak muncul');

  console.log(`${aircraftKey} (${approachMode}): HTML ${html.length} chars —`, problems.length === 0 ? 'PASS' : 'FAIL: ' + problems.join(', '));
  return { html, problems };
}

const r1 = testAircraft('A321-200', 'ils');
const r2 = testAircraft('A380-800', 'manual');
const r3 = testAircraft('787-9', 'ils');
const r4 = testAircraft('737-700', 'manual');

fs.writeFileSync(new URL('../_preview_ofp_full.html', import.meta.url),
  `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="background:#222;padding:20px;">${r1.html}</body></html>`);

const totalProblems = [r1, r2, r3, r4].reduce((s, r) => s + r.problems.length, 0);
console.log('\n' + (totalProblems === 0 ? 'ALL RENDER CHECKS PASSED' : `${totalProblems} PROBLEM(S) FOUND`));
process.exit(totalProblems === 0 ? 0 : 1);
