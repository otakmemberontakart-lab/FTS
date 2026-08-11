/**
 * route-parser.js
 * Parses flight distance input in two mutually-exclusive models:
 *
 * MODEL 1 (simple): a single total distance in NM.
 *
 * MODEL 2 (waypoint list): one waypoint per line in the format:
 *   NAME : HDG : LEG_DIST_NM : ALT
 * Example:
 *   RW05 : 045° : 0 NM : ---ft
 *   DE   : 045° : 12 NM : 5022ft
 *   TOC  : 118° : 99 NM : FL350
 *   TOD  : 118° : 138 NM : FL350
 *   FI0  : 119° : 87 NM : 5020ft
 *   FI   : 113° : 12 NM : 3020ft
 *   RW02R: 023° : 11 NM : ---ft
 *
 * Each row's distance is the LEG distance from the previous waypoint
 * (not cumulative). Total route distance = sum of all leg distances.
 *
 * This module has no DOM dependency — pure functions only, so it can be
 * reused by the UI, by a future Node build step, or by tests.
 */

export function parseSimpleDistance(nmValue) {
  const nm = parseFloat(nmValue);
  if (!nm || nm <= 0 || !isFinite(nm)) {
    return { valid: false, error: 'Jarak (NM) harus angka lebih dari 0.' };
  }
  return {
    valid: true,
    mode: 'simple',
    totalDistanceNm: Math.round(nm * 10) / 10,
    waypoints: null
  };
}

export function parseWaypointList(text) {
  const lines = (text || '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { valid: false, error: 'Daftar waypoint kosong.' };
  }

  const waypoints = [];
  let totalDistanceNm = 0;

  for (const line of lines) {
    const parts = line.split(':').map(p => p.trim());
    if (parts.length < 4) {
      return {
        valid: false,
        error: `Baris tidak valid: "${line}" — butuh 4 kolom dipisah ":" (NAME : HDG : DIST : ALT)`
      };
    }

    const [name, hdgRaw, distRaw, altRaw] = parts;

    const hdgMatch = hdgRaw.match(/(\d{1,3})/);
    const headingDeg = hdgMatch ? parseInt(hdgMatch[1], 10) : null;

    const distMatch = distRaw.match(/([\d.]+)/);
    if (!distMatch) {
      return { valid: false, error: `Jarak tidak terbaca di baris: "${line}"` };
    }
    const legDistNm = parseFloat(distMatch[1]);

    waypoints.push({
      name,
      headingDeg,
      legDistNm,
      altRaw: altRaw || null
    });

    totalDistanceNm += legDistNm;
  }

  if (waypoints.length < 2) {
    return { valid: false, error: 'Minimal 2 waypoint (titik keberangkatan & kedatangan).' };
  }

  return {
    valid: true,
    mode: 'waypoints',
    totalDistanceNm: Math.round(totalDistanceNm * 10) / 10,
    waypoints
  };
}

/**
 * Convenience dispatcher used by the UI. `mode` is 'simple' or 'waypoints'.
 */
export function parseRoute(mode, rawInput) {
  if (mode === 'simple') return parseSimpleDistance(rawInput);
  if (mode === 'waypoints') return parseWaypointList(rawInput);
  return { valid: false, error: `Mode tidak dikenal: ${mode}` };
}
