/**
 * ofp-template.js
 * Renders a computed flight-prep result into a print-style OFP HTML
 * fragment (navy/white dispatch-document look, distinct from the MCDU
 * input theme). Pure function — returns an HTML string with a scoped
 * <style> block, meant to be injected via `container.innerHTML = ...`.
 *
 * Expected `payload` shape:
 * {
 *   aircraftKey, aircraftData,
 *   depAirport, arrAirport,
 *   paxMode, paxValue, paxRecommendation,
 *   distanceResult,
 *   calcResult,             // output of calc.js computeFullPrep()
 *   approachModeLabel,       // 'ILS' | 'Manual/Visual' (for display)
 *   generatedAt
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

function renderApproachRows(rows) {
  return rows.map(r => `
    <tr>
      <td>${fmt1(r.distanceNm)} NM</td>
      <td>${fmt(r.altitudeFt)} ft</td>
      <td>${r.isVapp ? `VAPP (${r.speedKt} kt)` : `${r.speedKt}${typeof r.speedKt === 'number' ? ' kt' : ''}`}</td>
      <td>${r.vs || '—'}</td>
      <td>${r.action}</td>
    </tr>`).join('');
}

function renderClimbRows(rows) {
  return rows.map(r => `
    <tr>
      <td>${r.distanceLabel || (r.distanceNm !== null ? fmt1(r.distanceNm) + ' NM' : '—')}</td>
      <td>${r.altitudeFt !== null ? fmt(r.altitudeFt) + ' ft' : '—'}</td>
      <td>${r.speedKt}</td>
      <td>${r.vs}</td>
      <td>${r.action}</td>
    </tr>`).join('');
}

export function renderOfpHtml(payload) {
  const {
    aircraftKey, aircraftData,
    depAirport, arrAirport,
    paxMode, paxValue, paxRecommendation,
    distanceResult, calcResult, generatedAt
  } = payload;

  const pax = paxMode === 'auto' ? paxRecommendation.recommendedPax : paxValue;
  const { tier, cargo, meal, fuel, wb, vspeeds, altitudePlan, approach, atc, platform, climb, trim } = calcResult;

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

  const flSourceLabels = {
    user_field: 'FL dipilih manual oleh user (field Cruise FL).',
    table_highest: 'FL diambil dari ALT tertinggi di tabel Model 2 (field Cruise FL dikosongkan).',
    recommended: 'FL direkomendasikan otomatis oleh sistem (FL tertinggi yang masih menyisakan cruise segment).'
  };
  const flSourceNote = flSourceLabels[altitudePlan.source] || '';

  const approachModeLabel = approach.mode === 'manual' ? 'MANUAL / VISUAL' : 'ILS';

  const platformLabels = { infinite_flight: 'Infinite Flight', rfs: 'Real Flight Simulator (RFS)', msfs: 'MSFS' };
  const platformLabel = platformLabels[platform] || platform;

  const atcSection = atc ? `
  <div class="ofp-st-g">ATC COMMUNICATION SEQUENCE — INFINITE FLIGHT</div>
  <div class="ofp-note">${atc.disclaimer}</div>
  <table class="ofp-table">
    <tr><th>Fase</th><th>Facility</th><th>Kapan</th><th>Yang Disampaikan</th></tr>
    ${atc.departure.map(s => `
      <tr>
        <td>DEPARTURE</td><td><b>${s.facility}</b></td><td>${s.when}</td>
        <td>${s.say}${s.note ? `<br><span style="color:#8a5a00;">⚠ ${s.note}</span>` : ''}</td>
      </tr>`).join('')}
    ${atc.arrival.map(s => `
      <tr>
        <td>ARRIVAL</td><td><b>${s.facility}</b></td><td>${s.when}</td>
        <td>${s.say}${s.note ? `<br><span style="color:#8a5a00;">⚠ ${s.note}</span>` : ''}</td>
      </tr>`).join('')}
  </table>
  <div class="ofp-note">
    <b>En-route (Center sebagai Approach):</b> ${atc.enroute.centerHandoffNote}<br><br>
    <b>Kalau ada pergantian controller:</b> ${atc.enroute.controllerChangeNote}
  </div>
  <div class="ofp-st-g" style="background:#5a3d00;">HINDARI KESALAHAN UMUM</div>
  <div class="ofp-note">
    ${atc.commonMistakes.map(m => `• ${m}`).join('<br>')}
  </div>
  ` : '';

  return `
<style>
  .ofp-doc{background:#fff;color:#111;font-family:'Courier New',Courier,monospace;font-size:11px;line-height:1.45;padding:22px 26px;border-radius:6px;}
  .ofp-doc *{box-sizing:border-box;}
  .ofp-hdr{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #002b6e;padding-bottom:7px;margin-bottom:11px;}
  .ofp-brand{font-size:15px;font-weight:900;font-family:Arial,sans-serif;color:#002b6e;letter-spacing:1.5px;}
  .ofp-sub{font-size:8.5px;color:#888;font-family:Arial,sans-serif;}
  .ofp-right{font-size:9px;color:#666;text-align:right;}
  .ofp-st{background:#002b6e;color:#fff;padding:3px 8px;font-size:9.5px;font-weight:bold;font-family:Arial,sans-serif;letter-spacing:1px;margin:12px 0 5px;}
  .ofp-st-g{background:#1b5e2e;color:#fff;padding:3px 8px;font-size:9.5px;font-weight:bold;font-family:Arial,sans-serif;letter-spacing:1px;margin:12px 0 5px;}
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
  .ofp-note-g{background:#f0fff4;border:1px solid #2e7d32;padding:5px 9px;font-size:9px;margin:4px 0;font-family:Arial,sans-serif;line-height:1.6;}
  .ofp-note-r{background:#fff0f0;border:1px solid #c00;padding:5px 9px;font-size:9px;margin:4px 0;font-family:Arial,sans-serif;line-height:1.6;}
  .ofp-red{color:#b71c1c;} .ofp-amber{color:#c47900;} .ofp-green{color:#1b5e2e;}
  .ofp-vspeed-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:6px 0;}
  .ofp-vspeed-item{border:1px solid #ccc;padding:7px;text-align:center;}
  .ofp-vspeed-val{font-size:20px;font-weight:bold;color:#002b6e;display:block;}
  .ofp-vspeed-lbl{font-size:8px;color:#666;font-family:Arial,sans-serif;display:block;margin-top:1px;}
  .ofp-strip{display:flex;border:1px solid #002b6e;margin:6px 0;}
  .ofp-si{flex:1;padding:5px 6px;border-right:1px solid #002b6e;text-align:center;}
  .ofp-si:last-child{border-right:none;}
  .ofp-si-l{font-size:8px;color:#888;font-family:Arial,sans-serif;display:block;}
  .ofp-si-v{font-size:15px;font-weight:bold;color:#002b6e;font-family:Arial,sans-serif;display:block;}
  .ofp-badge{display:inline-block;padding:1px 8px;border-radius:10px;font-size:8.5px;font-family:Arial,sans-serif;font-weight:bold;}
  .ofp-badge-ils{background:#1b5e2e;color:#fff;}
  .ofp-badge-manual{background:#8a5a00;color:#fff;}
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
      AIRCRAFT: ${aircraftKey} (${aircraftData.manufacturer} ${aircraftData.family}) · PLATFORM: ${platformLabel}
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

  <div class="ofp-st">ALTITUDE &amp; TOP OF DESCENT PLAN</div>
  <div class="ofp-strip">
    <div class="ofp-si"><span class="ofp-si-l">CRUISE FL</span><span class="ofp-si-v">FL${altitudePlan.cruiseFL}</span></div>
    <div class="ofp-si"><span class="ofp-si-l">CLIMB DIST</span><span class="ofp-si-v">${altitudePlan.climbDistanceNm} NM</span></div>
    <div class="ofp-si"><span class="ofp-si-l">CRUISE SEG</span><span class="ofp-si-v">${fmt1(altitudePlan.cruiseSegmentNm)} NM</span></div>
    <div class="ofp-si"><span class="ofp-si-l">TOD</span><span class="ofp-si-v">${altitudePlan.todDistanceNm} NM before dest</span></div>
  </div>
  <div class="ofp-note">${flSourceNote} ${altitudePlan.disclaimer}</div>
  ${altitudePlan.warning ? `<div class="ofp-note-r">⚠ ${altitudePlan.warning}</div>` : ''}

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
  <div class="ofp-note">Load %: ${fmt1(wb.loadPct)}% dari MTOW.</div>

  <div class="ofp-st">TRIM TAKEOFF</div>
  <div class="ofp-strip">
    <div class="ofp-si"><span class="ofp-si-l">RFS (0.00–1.00)</span><span class="ofp-si-v">${trim.rfsValue}</span></div>
    <div class="ofp-si"><span class="ofp-si-l">INFINITE FLIGHT</span><span class="ofp-si-v">${trim.ifPercent}</span></div>
  </div>
  <div class="ofp-note">⚠ ${trim.disclaimer}</div>

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
    <tr><th>Dist. dari DEP</th><th>Altitude</th><th>Speed</th><th>V/S</th><th>Aksi</th></tr>
    ${renderClimbRows(climb.rows)}
  </table>
  <div class="ofp-note">⚠ ${climb.disclaimer}</div>

  <div class="ofp-st-g">DESCENT &amp; APPROACH PROFILE (TOD → LANDING) — <span class="ofp-badge ${approach.mode === 'manual' ? 'ofp-badge-manual' : 'ofp-badge-ils'}">${approachModeLabel}</span></div>
  ${approach.mode === 'ils' ? `
    <div class="${arrAirport.likely_has_ils ? 'ofp-note-g' : 'ofp-note-r'}">${approach.ilsDataQuality}</div>
    <div class="ofp-strip">
      <div class="ofp-si"><span class="ofp-si-l">CATEGORY</span><span class="ofp-si-v" style="font-size:11px;">${approach.category}</span></div>
      <div class="ofp-si"><span class="ofp-si-l">DA</span><span class="ofp-si-v">${fmt(approach.decisionAltitudeFt)} ft</span></div>
      <div class="ofp-si"><span class="ofp-si-l">DH</span><span class="ofp-si-v">${approach.decisionHeightFt} ft</span></div>
      <div class="ofp-si"><span class="ofp-si-l">G/S ANGLE</span><span class="ofp-si-v">${approach.glideslopeAngleDeg}°</span></div>
      <div class="ofp-si"><span class="ofp-si-l">VAPP</span><span class="ofp-si-v">${approach.vapp} kt</span></div>
    </div>
  ` : `
    <div class="ofp-note">${approach.visualDecisionNote}</div>
    <div class="ofp-strip">
      <div class="ofp-si"><span class="ofp-si-l">STABLE GATE</span><span class="ofp-si-v">${approach.stableGateFt} ft AFE</span></div>
      <div class="ofp-si"><span class="ofp-si-l">VAPP</span><span class="ofp-si-v">${approach.vapp} kt</span></div>
    </div>
  `}
  <table class="ofp-table">
    <tr><th>Dist. to THR</th><th>Altitude</th><th>Speed</th><th>V/S</th><th>Action</th></tr>
    ${renderApproachRows(approach.rows)}
  </table>
  <div class="ofp-st-g" style="background:#5a3d00;">MISSED APPROACH</div>
  <div class="ofp-note">
    <b>${approach.missedApproach.initialAction}</b><br>
    ${approach.missedApproach.headingNote}<br>
    ${approach.missedApproach.note}
  </div>
  <div class="ofp-note">⚠ ${approach.disclaimer}</div>
  ${atcSection}

  <div class="ofp-footer">
    ESTIMASI — DIBANGUN DARI HEURISTIK, BUKAN DATA PERFORMA/OFP OFFICIAL AIRLINE.<br>
    FLIGHT PREP TOOL · ${aircraftKey} · ${depAirport.icao} → ${arrAirport.icao}
  </div>
</div>
`;
}
