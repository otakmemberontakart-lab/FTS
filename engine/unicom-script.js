/**
 * unicom-script.js
 * Builds a Unicom self-announce sequence for Infinite Flight's CASUAL
 * server — NOT real ATC. Casual has no human controllers, so pilots
 * self-announce position/intent to each other (same idea as CTAF at an
 * uncontrolled airport in real life). Confirmed against user's own
 * documented Q&A log studying this exact feature.
 *
 * This REPLACES atc-script.js as the default ATC output (that module
 * modeled a controlled-server ATC hierarchy — Ground/Tower/Radar/Center —
 * which doesn't exist on Casual at all. Kept in the repo for reference /
 * possible future use, but calc.js no longer calls it by default).
 *
 * Key rules confirmed with the user before building this:
 *   - Left/Right traffic is from the PILOT's own POV in the cockpit — if
 *     the runway is on your left as you fly the pattern, that's left
 *     traffic. NOT the ground observer's / ATC's POV.
 *   - Straight-in approach (skip downwind/base, go straight to "Final")
 *     applies when the arrival track already lines up with the landing
 *     runway direction.
 *   - Report Position always uses the LANDING runway identifier (e.g.
 *     25R), never the reciprocal (07L), even if you approached from the
 *     07L threshold's side of the airport.
 *   - ARM APPR is a cockpit action, NOT a Unicom call — it's deliberately
 *     never mentioned here (it already lives in approach-profile.js's
 *     descent table, which is the right place for it).
 *
 * What CAN be computed automatically (Model 2 — table/import, has HDG per
 * leg) vs what CANNOT (kept as a rule for the user to apply themselves,
 * per user's explicit call — "biar aman"):
 *   - Straight-in vs pattern-needed: computed by comparing the heading of
 *     the last two legs. Reliable enough from heading data alone.
 *   - Left vs Right traffic: NOT computed. Determining this correctly
 *     needs the aircraft's position relative to the runway centerline,
 *     which heading-only data (no lat/lon) can't give reliably. We print
 *     the rule instead of guessing.
 */

const CARDINALS = [
  { name: 'North', deg: 0 }, { name: 'East', deg: 90 },
  { name: 'South', deg: 180 }, { name: 'West', deg: 270 }
];

function nearestCardinal(hdg) {
  let best = CARDINALS[0], bestDiff = 361;
  for (const d of CARDINALS) {
    let diff = Math.abs(hdg - d.deg);
    if (diff > 180) diff = 360 - diff;
    if (diff < bestDiff) { bestDiff = diff; best = d; }
  }
  return best.name;
}

function headingDiff(a, b) {
  let diff = Math.abs(a - b);
  if (diff > 180) diff = 360 - diff;
  return diff;
}

const LEFT_RIGHT_RULE = 'Left/Right Traffic itu dari POV KAMU sendiri di kokpit, bukan POV ATC/ground. Kalau runway ada di sisi KIRI kamu pas terbang di pattern → LEFT TRAFFIC. Kalau di KANAN → RIGHT TRAFFIC. Tool ini nggak coba nebak ini (butuh data posisi relatif ke runway centerline yang nggak kita punya dari heading doang) — tentukan sendiri pas terbang.';

const OPTIONAL_NOTES = [
  'CROSS RUNWAY / HOLD SHORT — situasional, tergantung layout airport & traffic real-time saat itu, dipakai kalau perlu aja.',
  'GO AROUND — dipakai kalau batalin landing (runway belum clear, approach berantakan, dll), broadcast begitu keputusan diambil.',
  'REQUEST TRAFFIC ADVISORIES — opsional pas/abis Announce Inbound, buat cek kondisi traffic sebelum masuk approach.',
  'SEND TRAFFIC ADVISORIES — dipakai buat jawab pilot lain yang REQUEST, kalau kamu tau kondisi traffic di runway itu (ini valid dilakuin pilot ke pilot, bukan cuma ATC — konsep gotong-royong Unicom).'
];

const DISCLAIMER = 'Ini Unicom (self-announce), BUKAN clearance ATC beneran — Casual server nggak punya controller manusia. Nomor runway pakai placeholder karena kita nggak punya data assignment runway real-time.';

/**
 * Model 2 (table/import) — full sequence with computed straight-in vs
 * pattern, using actual leg headings.
 */
function buildFromWaypoints(depAirport, arrAirport, waypoints) {
  const steps = [];

  steps.push({
    phase: 'GROUND', action: 'TAXI',
    trigger: 'Begitu siap gerak dari parking',
    say: `Taxi → Runway [sesuai assignment] (${depAirport.icao})`
  });

  const firstLeg = waypoints.find((w, i) => i > 0 && w.headingDeg !== null);
  const departDir = firstLeg ? nearestCardinal(firstLeg.headingDeg) : null;
  steps.push({
    phase: 'DEPARTURE', action: 'TAKEOFF',
    trigger: 'Di runway, siap lepas landas',
    say: departDir
      ? `Takeoff → Runway [sesuai assignment] → Departing ${departDir}`
      : `Takeoff → Runway [sesuai assignment] → Departing [tentukan arah sesuai track pertama]`
  });

  // cumulative distance from start -> remaining distance to destination per waypoint
  let cum = 0;
  const cumFromStart = waypoints.map(w => { cum += w.legDistNm; return cum; });
  const total = cum;
  const remaining = cumFromStart.map(c => Math.round((total - c) * 10) / 10);

  // pick the waypoint whose remaining-to-destination distance is CLOSEST
  // to a sensible "far out" call target (~10NM) — matches the log's own
  // worked example (WICA->WAHI picked HK402 at ~7.5NM out, not some much
  // farther waypoint that merely happened to clear a fixed threshold)
  const ANNOUNCE_TARGET_NM = 10;
  let announceIdx = 0, bestDiff = Infinity;
  for (let i = 0; i < waypoints.length; i++) {
    const diff = Math.abs(remaining[i] - ANNOUNCE_TARGET_NM);
    if (diff < bestDiff) { bestDiff = diff; announceIdx = i; }
  }
  const announceWp = waypoints[announceIdx];
  const announceRemaining = remaining[announceIdx];

  // straight-in check: compare heading of the last two legs with headings
  const legsWithHdg = waypoints.filter(w => w.headingDeg !== null);
  let straightIn = null;
  if (legsWithHdg.length >= 2) {
    const lastLeg = legsWithHdg[legsWithHdg.length - 1];
    const secondLastLeg = legsWithHdg[legsWithHdg.length - 2];
    straightIn = headingDiff(lastLeg.headingDeg, secondLastLeg.headingDeg) <= 45;
  }

  if (straightIn === true) {
    steps.push({
      phase: 'ARRIVAL', action: 'ANNOUNCE INBOUND',
      trigger: `Sekitar ${announceRemaining} NM sebelum ${arrAirport.icao} (dekat waypoint ${announceWp.name}) — track udah segaris arah landing`,
      say: 'Announce Inbound → Landing → Runway [sesuai assignment] → Straight In'
    });
    steps.push({
      phase: 'ARRIVAL', action: 'REPORT POSITION',
      trigger: 'Begitu established segaris runway (~3-5 NM final) — skip downwind/base, langsung final',
      say: 'Report Position → Final → Runway [sesuai assignment]'
    });
  } else if (straightIn === false) {
    steps.push({
      phase: 'ARRIVAL', action: 'ANNOUNCE INBOUND',
      trigger: `Sekitar ${announceRemaining} NM sebelum ${arrAirport.icao} (dekat waypoint ${announceWp.name}) — track berubah arah, butuh masuk pattern`,
      say: 'Announce Inbound → Landing → Runway [sesuai assignment] → [Left/Right Traffic — tentukan sendiri, lihat aturan di bawah]'
    });
    steps.push({ phase: 'ARRIVAL', action: 'REPORT POSITION (Downwind)', trigger: 'Sejajar runway, arah kebalikan landing', say: 'Report Position → [Left/Right] Downwind → Runway [sesuai assignment]' });
    steps.push({ phase: 'ARRIVAL', action: 'REPORT POSITION (Base)', trigger: 'Mulai belok 90° menuju runway', say: 'Report Position → [Left/Right] Base → Runway [sesuai assignment]' });
    steps.push({ phase: 'ARRIVAL', action: 'REPORT POSITION (Final)', trigger: 'Udah segaris runway, siap landing', say: 'Report Position → Final → Runway [sesuai assignment]' });
  } else {
    // not enough heading data to determine
    steps.push({
      phase: 'ARRIVAL', action: 'ANNOUNCE INBOUND',
      trigger: `Sekitar ${announceRemaining} NM sebelum ${arrAirport.icao}`,
      say: 'Announce Inbound → Landing → Runway [sesuai assignment] → [Straight In / Left / Right Traffic — data HDG kurang lengkap buat nentuin otomatis, cek sendiri track kamu]'
    });
    steps.push({
      phase: 'ARRIVAL', action: 'REPORT POSITION',
      trigger: 'Sesuai posisi kamu di pattern (atau langsung Final kalau straight-in)',
      say: 'Report Position → [Downwind/Base/Final sesuai posisi] → Runway [sesuai assignment]'
    });
  }

  steps.push({
    phase: 'ARRIVAL', action: 'CLEAR OF ALL RUNWAYS',
    trigger: 'Begitu fully vacate runway setelah landing (nggak ada bagian pesawat nyentuh runway lagi)',
    say: 'Clear of All Runways'
  });

  return { steps, straightIn, announceDistanceNm: announceRemaining };
}

/**
 * Model 1 (simple total NM) — no heading data at all, so generic
 * distance-based cues only. Confirmed scope with user: "kasih aba-aba
 * aja, kapan harus command apa, pas sekitar berapa NM ke tujuan".
 */
function buildFromSimpleDistance(depAirport, arrAirport, totalDistanceNm) {
  const steps = [
    {
      phase: 'GROUND', action: 'TAXI',
      trigger: 'Begitu siap gerak dari parking',
      say: `Taxi → Runway [sesuai assignment] (${depAirport.icao})`
    },
    {
      phase: 'DEPARTURE', action: 'TAKEOFF',
      trigger: 'Di runway, siap lepas landas',
      say: 'Takeoff → Runway [sesuai assignment] → Departing [tentukan arah sesuai rencana rute]'
    },
    {
      phase: 'ARRIVAL', action: 'ANNOUNCE INBOUND',
      trigger: `Sekitar 10-15 NM sebelum ${arrAirport.icao}`,
      say: 'Announce Inbound → Landing → Runway [sesuai assignment] → [Straight In / Left / Right Traffic — tentukan sendiri dari track kamu, Model 1 nggak punya data heading]'
    },
    {
      phase: 'ARRIVAL', action: 'REPORT POSITION',
      trigger: 'Sesuai posisi kamu di pattern (atau langsung Final kalau straight-in) — umumnya 3-5 NM final',
      say: 'Report Position → [Downwind/Base/Final sesuai posisi] → Runway [sesuai assignment]'
    },
    {
      phase: 'ARRIVAL', action: 'CLEAR OF ALL RUNWAYS',
      trigger: 'Begitu fully vacate runway setelah landing',
      say: 'Clear of All Runways'
    }
  ];
  return { steps, straightIn: null, announceDistanceNm: null };
}

/**
 * Main entry point used by calc.js.
 * routeMode: 'simple' | 'waypoints'
 * waypoints: only needed/used when routeMode === 'waypoints'
 */
export function buildUnicomSequence({ depAirport, arrAirport, routeMode, waypoints, totalDistanceNm }) {
  const built = routeMode === 'waypoints' && waypoints && waypoints.length >= 2
    ? buildFromWaypoints(depAirport, arrAirport, waypoints)
    : buildFromSimpleDistance(depAirport, arrAirport, totalDistanceNm);

  return {
    ...built,
    leftRightRule: LEFT_RIGHT_RULE,
    optionalNotes: OPTIONAL_NOTES,
    disclaimer: DISCLAIMER
  };
}
