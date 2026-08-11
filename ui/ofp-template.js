/**
 * ofp-template.js
 * Renders a computed flight-prep result into a print-style OFP HTML
 * fragment (navy/white dispatch-document look, distinct from the MCDU
 * input theme). Pure function — returns an HTML string with a scoped
 * <style> block, meant to be injected via `container.innerHTML = ...`.
 *
 * Not a full standalone document (no <html>/<head>/<body>) so it can sit
 * inside ui/index.html without clashing with the cockpit-style input UI.
 *
 * Expected `payload` shape:
 * {
 *   aircraftKey, aircraftData,      // from data/aircraft.json
 *   depAirport, arrAirport,          // resolved records from data/airports.json
 *   paxMode,                          // 'auto' | 'manual'
 *   paxValue,                          // manual pax count (or null if auto)
 *   paxRecommendation,                  // output of pax-recommender.js (or null if manual)
 *   distanceResult,                      // output of route-parser.js
 *   calcResult,                           // output of calc.js computeFullPrep()
 *   generatedAt                            // ISO timestamp string
 * }
 */

function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Math.round(n).toLocaleString('id-ID');
}
function fmt1(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return n.toLocaleString('id-ID', { maximumFractionDigits: 1 });
}
function marginStatus(margin) {
  if (margin === null || margin === undefined) return { tag: '—', cls: '' };
  if (margin < 0) return { tag: 'OVER LIMIT', cls: 'ofp-red' };
  if (margin < 1500) return { tag: 'MARGIN TIPIS', cls: 'ofp-amber' };
  return { tag: 'AMAN', cls: 'ofp-green' };
}

function renderWaypointTable(waypoints) {
  const rows = waypoints.map(w => `
    <tr><td>${w.name}</td><td>${w.headingDeg !== null ? w.headingDeg + '°' : '—'}</td><td>${w.legDistNm} NM</td><td>${w.altRaw || '—'}</td></tr>
  `).join('');
  const total = waypoints.reduce((s, w) => s + w.legDistNm, 0);
  return `
    <table class="ofp-table">
      <tr><th>Waypoint</th><th>HDG</th><th>Leg Dist</th><th>Alt</th></tr>
      ${rows}
      <tr class="ofp-hl"><td colspan="2">TOTAL</td><td>${Math.round(total * 10) / 10} NM</td><td>—</td></tr>
    </table>
  `;
}

export function renderOfpHtml(payload) {
  const {
    aircraftKey, aircraftData,
    depAirport, arrAirport,
    paxMode, paxValue, paxRecommendation,
    distanceResult, calcResult, generatedAt
  } = payload;

  const pax = paxMode === 'auto' ? paxRecommendation.recommendedPax : paxValue;
  const { tier, cargo, meal, fuel, wb, vspeeds, climb, descent } = calcResult;

  const zfwStatus = marginStatus(wb.zfwMargin);
  const towStatus = marginStatus(wb.towMargin);
  const lwStatus = marginStatus(wb.lwMargin);

  const routeSection = distanceResult.mode === 'waypoints'
    ? renderWaypointTable(distanceResult.waypoints)
    : `<div class="ofp-note">Model jarak: total NM langsung (tanpa daftar waypoint). Total distance: <b>${fmt1(distanceResult.totalDistanceNm)} NM</b>.</div>`;

  const paxNote = paxMode === 'auto'
    ? `Direkomendasikan otomatis — tier pasangan <b>${paxRecommendation.tierPair}</b>
       (${depAirport.tier} ↔ ${arrAirport.tier}), load factor ${paxRecommendation.recommendedLoadFactorPercent}%
       dari ${paxRecommendation.seatsTypical} kursi tipikal. ${paxRecommendation.disclaimer}`
    : `Diisi manual oleh user.`;

  return `
<style>
  .ofp-doc{background:#fff;color:#111;font-family:'Courier New',Courier,monospace;font-size:11px;line-height:1.45;padding:22px 26px;border-radius:6px;}
  .ofp-doc *{box-sizing:border-box;}
  .ofp-hdr{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #002b6e;padding-bottom:7px;margin-bottom:11px;}
  .ofp-brand{font-size:15px;font-weight:900;font-family:Arial,sans-serif;color:#002b6e;letter-spacing:1.5px;}
  .ofp-sub{font-size:8.5px;color:#888;font-family:Arial,sans-serif;}
  .ofp-right{font-size:9px;color:#666;text-align:right;}
  .ofp-st{background:#002b6e;color:#fff;padding:3px 8px;font-size:9.5px;font-weight:bold;font-family:Arial,sans-serif;letter-spacing:1px;margin:12px 0 5px;}
  .ofp-deparr{display:flex;align-items:center;gap:10px;background:#f4f7ff;border:1px solid #c0cadd;padding:9px 14px;margin:8px 0;}
  .ofp-ac{font-size:24px;font-weight:900;font-family:Arial,sans-serif;color:#002b6e;letter-spacing:3px;}
  .ofp-an{font-size:9px;color:#666;}
  .ofp-arr{font-size:22px;color:#002b6e;padding:0 10px;}
  table.ofp-table{width:100%;border-collapse:collapse;margin:4px 0;}
  table.ofp-table th{background:#002b6e;color:#fff;padding:3px 6px;text-align:left;font-family:Arial,sans-serif;font-size:9px;font-weight:bold;border:1px solid #002b6e;}
  table.ofp-table td{padding:3px 6px;border:1px solid #ccc;font-size:10px;}
  table.ofp-table tr:nth-child(even) td{background:#f0f4ff;}
  tr.ofp-hl td{background:#fff9c4;font-weight:bold;}
  .ofp-fb{border:1px solid #002b6e;padding:7px 9px;}
  .ofp-fr{display:flex;justify-content:space-between;padding:2px 0;font-size:10px;border-bottom:1px dotted #ddd;}
  .ofp-fr:last-child{border-bottom:none;}
  .ofp-fr.tot{border-top:2px solid #333;font-weight:bold;font-size:12px;margin-top:3px;padding-top:5px;}
  .ofp-note{background:#fff8e1;border:1px solid #ffa000;padding:5px 9px;font-size:9px;margin:4px 0;font-family:Arial,sans-serif;line-height:1.6;}
  .ofp-red{color:#b71c1c;} .ofp-amber{color:#c47900;} .ofp-green{color:#1b5e2e;}
  .ofp-vspeed-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:6px 0;}
  .ofp-vspeed-item{border:1px solid #ccc;padding:7px;text-align:center;}
  .ofp-vspeed-val{font-size:20px;font-weight:bold;color:#002b6e;display:block;}
  .ofp-vspeed-lbl{font-size:8px;color:#666;font-family:Arial,sans-serif;display:block;margin-top:1px;}
  .ofp-footer{border-top:1px solid #ccc;padding-top:6px;margin-top:14px;text-align:center;font-size:8.5px;color:#999;font-family:Arial,sans-serif;}
</style>
<div class="ofp-doc">
  <div class="ofp-hdr">
    <div>
      <div class="ofp-brand">✈ FLIGHT PREP TOOL</div>
      <div class="ofp-sub">GENERATED OFP · INFINITE FLIGHT COMPANION</div>
    </div>
    <div class="ofp-right">
      GENERATED: ${new Date(generatedAt).toLocaleString('id-ID')}<br>
      AIRCRAFT: ${aircraftKey}
    </div>
  </div>

  <div class="ofp-deparr">
    <div>
      <div class="ofp-ac">${depAirport.icao}</div>
      <div class="ofp-an">${depAirport.iata || '—'} · ${depAirport.name}</div>
      <div class="ofp-an" style="color:#aaa;">${depAirport.city || ''}, ${depAirport.country || ''} · tier: ${depAirport.tier}</div>
    </div>
    <div class="ofp-arr">→</div>
    <div>
      <div class="ofp-ac">${arrAirport.icao}</div>
      <div class="ofp-an">${arrAirport.iata || '—'} · ${arrAirport.name}</div>
      <div class="ofp-an" style="color:#aaa;">${arrAirport.city || ''}, ${arrAirport.country || ''} · tier: ${arrAirport.tier}</div>
    </div>
  </div>

  <div class="ofp-st">ROUTE</div>
  ${routeSection}
  <div class="ofp-note">Cruise altitude estimasi (dari tier jarak): <b>${tier.alt}</b></div>

  <div class="ofp-st">PENUMPANG &amp; PAYLOAD</div>
  <div class="ofp-note">Total PAX: <b>${pax}</b>. ${paxNote}</div>
  <table class="ofp-table">
    <tr><th>Berat</th><th>Prob.</th><th>Jml Pax</th><th>Subtotal</th></tr>
    ${cargo.buckets.map((b, i) => `<tr><td>${b.kg} kg</td><td>${Math.round(b.p * 100)}%</td><td>${cargo.counts[i]} pax</td><td>${fmt(cargo.counts[i] * b.kg)} kg</td></tr>`).join('')}
    <tr class="ofp-hl"><td colspan="3">TOTAL CARGO</td><td>${fmt(cargo.total)} kg</td></tr>
  </table>
  <div class="ofp-note">Meal: ${meal.count} pax dilayani (~47,5%) × ${meal.mealWeightKg} kg/tray = <b>${fmt1(meal.total)} kg</b></div>

  <div class="ofp-st">FUEL PLANNING</div>
  <div class="ofp-fb">
    <div class="ofp-fr"><span>Climb Fuel</span><span>${fmt(tier.climbFuel)} kg</span></div>
    <div class="ofp-fr"><span>Cruise Fuel (${fmt1(fuel.cruiseDist)} NM)</span><span>${fmt(fuel.cruiseFuel)} kg</span></div>
    <div class="ofp-fr"><span>Descent Fuel</span><span>${fmt(tier.descentFuel)} kg</span></div>
    <div class="ofp-fr"><span>Trip Fuel (total)</span><span><b>${fmt(fuel.tripFuel)} kg</b></span></div>
    <div class="ofp-fr"><span>Taxi</span><span>${fmt(fuel.taxi)} kg</span></div>
    <div class="ofp-fr"><span>Contingency (5%)</span><span>${fmt(fuel.contingency)} kg</span></div>
    <div class="ofp-fr"><span>Alternate</span><span>${fmt(fuel.alternate)} kg</span></div>
    <div class="ofp-fr"><span>Final Reserve</span><span>${fuel.finalReserve} kg</span></div>
    <div class="ofp-fr"><span>Extra/Discretionary</span><span>${fuel.extra} kg</span></div>
    <div class="ofp-fr tot"><span>BLOCK FUEL (rekomendasi input)</span><span>${fmt(fuel.fuelRangeLow)}–${fmt(fuel.fuelRangeHigh)} kg</span></div>
  </div>

  <div class="ofp-st">WEIGHT &amp; BALANCE</div>
  <table class="ofp-table">
    <tr><th>ELEMENT</th><th>ACTUAL</th><th>MAX LIM</th><th>STATUS</th></tr>
    <tr><td>Operating Empty Weight (OEW)</td><td>${fmt(aircraftData.oew)} kg</td><td>—</td><td>—</td></tr>
    <tr><td>Payload (pax+cargo+meal)</td><td>${fmt(wb.zfw - aircraftData.oew)} kg</td><td>—</td><td>—</td></tr>
    <tr><td><b>Zero Fuel Weight (ZFW)</b></td><td><b>${fmt(wb.zfw)} kg</b></td><td>${fmt(aircraftData.mzfw)} kg</td><td class="${zfwStatus.cls}">${zfwStatus.tag}</td></tr>
    <tr><td>Block Fuel</td><td>${fmt(fuel.fuelBase)} kg</td><td>—</td><td>—</td></tr>
    <tr class="ofp-hl"><td><b>Takeoff Weight (TOW)</b></td><td><b>${fmt(wb.tow)} kg</b></td><td>${fmt(aircraftData.mtow)} kg</td><td class="${towStatus.cls}">${towStatus.tag}</td></tr>
    <tr><td>Less: Trip Fuel</td><td>−${fmt(fuel.tripFuel)} kg</td><td>—</td><td>—</td></tr>
    <tr><td><b>Est Landing Weight (LW)</b></td><td><b>${fmt(wb.lw)} kg</b></td><td>${fmt(aircraftData.mlw)} kg</td><td class="${lwStatus.cls}">${lwStatus.tag}</td></tr>
  </table>
  <div class="ofp-note">Load %: ${fmt1(wb.loadPct)}% dari MTOW. V.TRIM heuristik (Load% ÷ 3): <b>${wb.vtrimHeuristic.toFixed(2)}</b> — rule komunitas, bukan physics resmi Airbus.</div>

  <div class="ofp-st">V-SPEEDS &amp; TAKEOFF CONFIG</div>
  ${vspeeds.valid ? `
  <div class="ofp-vspeed-grid">
    <div class="ofp-vspeed-item"><span class="ofp-vspeed-val">${vspeeds.v1}</span><span class="ofp-vspeed-lbl">V1 (kt)</span></div>
    <div class="ofp-vspeed-item"><span class="ofp-vspeed-val">${vspeeds.vr}</span><span class="ofp-vspeed-lbl">VR (kt)</span></div>
    <div class="ofp-vspeed-item"><span class="ofp-vspeed-val">${vspeeds.v2}</span><span class="ofp-vspeed-lbl">V2 (kt)</span></div>
  </div>
  <div class="ofp-note">Flap takeoff disarankan: <b>${vspeeds.flapRecommendation}</b> (${vspeeds.flapNote})<br>
  Scale factor dari referensi ${fmt(vspeeds.refWeightKg)} kg: ${vspeeds.scaleFactor}<br>
  ⚠ ${vspeeds.disclaimer}</div>
  ` : `<div class="ofp-note">V-speed tidak bisa dihitung: ${vspeeds.error}</div>`}

  <div class="ofp-st">CLIMB PROFILE</div>
  <table class="ofp-table">
    <tr><th>Fase</th><th>Speed</th><th>V/S</th></tr>
    ${climb.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}
  </table>

  <div class="ofp-st">DESCENT PROFILE</div>
  <table class="ofp-table">
    <tr><th>Fase</th><th>Speed</th><th>V/S</th></tr>
    ${descent.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}
  </table>

  <div class="ofp-footer">
    ESTIMASI — DIBANGUN DARI HEURISTIK, BUKAN DATA PERFORMA/OFP OFFICIAL AIRLINE.<br>
    FLIGHT PREP TOOL · ${aircraftKey} · ${depAirport.icao} → ${arrAirport.icao}
  </div>
</div>
`;
}
