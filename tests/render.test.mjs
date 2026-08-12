import fs from 'fs';
import { buildAirportIndex, resolveAirport } from '../engine/airport-resolver.js';
import { recommendPax } from '../engine/pax-recommender.js';
import { computeFullPrep } from '../engine/calc.js';
import { parseWaypointList } from '../engine/route-parser.js';
import { renderOfpHtml } from '../ui/ofp-template.js';

const airports = JSON.parse(fs.readFileSync(new URL('../data/airports.json', import.meta.url)));
const aircraftAll = JSON.parse(fs.readFileSync(new URL('../data/aircraft.json', import.meta.url)));
const paxRules = JSON.parse(fs.readFileSync(new URL('../data/pax-rules.json', import.meta.url)));

const index = buildAirportIndex(airports);
const depAirport = resolveAirport('WIBB', index).best;
const arrAirport = resolveAirport('WSSS', index).best;
const aircraftKey = 'A321-200';
const aircraftData = aircraftAll[aircraftKey];

const paxRecommendation = recommendPax(depAirport, arrAirport, aircraftData, paxRules);
const distanceResult = parseWaypointList(`WIBB : 180 : 0 NM : 102ft
TOC : 118 : 73 NM : FL220
TOD : 118 : 18 NM : FL220
WSSS : 203 : 70 NM : 22ft`);

const calcResult = computeFullPrep({
  aircraftData,
  pax: paxRecommendation.recommendedPax,
  distanceNm: distanceResult.totalDistanceNm,
  depAirport, arrAirport,
  approachMode: 'ils'
});

const payload = {
  aircraftKey, aircraftData,
  depAirport, arrAirport,
  paxMode: 'auto', paxValue: null, paxRecommendation,
  distanceResult, calcResult,
  generatedAt: new Date().toISOString()
};

const html = renderOfpHtml(payload);

const problems = [];
if (html.includes('undefined')) problems.push('mengandung "undefined"');
if (html.includes('NaN')) problems.push('mengandung "NaN"');
if (!html.includes('ALTITUDE')) problems.push('section altitude plan tidak muncul');
if (!html.includes('APPROACH PROFILE')) problems.push('section approach profile tidak muncul');
if (!html.includes('MISSED APPROACH')) problems.push('section missed approach tidak muncul');

console.log('HTML length:', html.length, 'chars');
console.log(problems.length === 0 ? 'PASS — tidak ada undefined/NaN, semua section baru ada' : 'FAIL: ' + problems.join(', '));

fs.writeFileSync(new URL('../_preview_ofp_ils.html', import.meta.url),
  `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="background:#222;padding:20px;">${html}</body></html>`);

// also render the manual-approach variant for comparison
const calcResultManual = computeFullPrep({
  aircraftData,
  pax: paxRecommendation.recommendedPax,
  distanceNm: distanceResult.totalDistanceNm,
  depAirport, arrAirport,
  approachMode: 'manual'
});
const htmlManual = renderOfpHtml({ ...payload, calcResult: calcResultManual });
fs.writeFileSync(new URL('../_preview_ofp_manual.html', import.meta.url),
  `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="background:#222;padding:20px;">${htmlManual}</body></html>`);

console.log('Preview files written (ILS + Manual variants).');
