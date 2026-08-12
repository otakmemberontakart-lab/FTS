/**
 * fpl-import.js
 * Parses an Infinite Flight flight-plan (.fpl) XML file — the Garmin
 * FlightPlan/v1 schema — into rows ready for the Model 2 waypoint table.
 *
 * IMPORTANT — Infinite Flight ONLY. RFS and MSFS don't use this format /
 * workflow, so the UI never offers this import outside platform='infinite_flight'.
 *
 * What the file actually contains (confirmed against 6 real exported .fpl
 * files):
 *   - waypoint-table: identifier, type, lat, lon, and an OPTIONAL
 *     <elevation> in METERS (present only when that waypoint carries a
 *     hard altitude constraint, e.g. from a SID/STAR).
 *   - NO heading or distance fields — those are computed here from lat/lon
 *     (haversine + bearing), same method used elsewhere in this tool.
 *   - route section also carries <proc>/<proc-type> (which SID/STAR/
 *     approach a point belongs to) — parsed but not required for the
 *     table; exposed in case a future version wants to show it.
 *
 * Uses the browser's native DOMParser — no external XML library needed.
 */

function haversineNm(lat1, lon1, lat2, lon2) {
  const R = 3440.065;
  const toRad = d => d * Math.PI / 180;
  const dphi = toRad(lat2 - lat1);
  const dlambda = toRad(lon2 - lon1);
  const a = Math.sin(dphi / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dlambda / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function bearingDeg(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180;
  const dlambda = toRad(lon2 - lon1);
  const y = Math.sin(dlambda) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dlambda);
  const theta = Math.atan2(y, x);
  return (theta * 180 / Math.PI + 360) % 360;
}

/**
 * xmlText: raw string content of the uploaded .fpl file.
 * Returns { valid, error? , rows, meta } where rows match the shape
 * route-parser.js's parseWaypointRows() expects as input (name, hdg,
 * legDistNm, alt), so the UI can feed the result straight into the table.
 */
export function parseFplXml(xmlText) {
  let doc;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) {
      return { valid: false, error: 'File .fpl tidak valid (XML gagal di-parse).' };
    }
  } catch (e) {
    return { valid: false, error: `Gagal baca file: ${e.message}` };
  }

  const waypointEls = Array.from(doc.getElementsByTagName('waypoint'))
    .filter(el => el.getElementsByTagName('identifier').length > 0);

  if (waypointEls.length < 2) {
    return { valid: false, error: 'File .fpl ini nggak punya minimal 2 waypoint di waypoint-table.' };
  }

  const waypoints = waypointEls.map(el => {
    const get = tag => {
      const node = el.getElementsByTagName(tag)[0];
      return node ? node.textContent.trim() : null;
    };
    const elevM = get('elevation');
    return {
      identifier: get('identifier'),
      type: get('type'),
      lat: parseFloat(get('lat')),
      lon: parseFloat(get('lon')),
      elevationM: elevM !== null ? parseFloat(elevM) : null
    };
  });

  const rows = waypoints.map((wp, i) => {
    let hdg = null, legDistNm = 0;
    if (i > 0) {
      const prev = waypoints[i - 1];
      legDistNm = Math.round(haversineNm(prev.lat, prev.lon, wp.lat, wp.lon) * 10) / 10;
      hdg = Math.round(bearingDeg(prev.lat, prev.lon, wp.lat, wp.lon));
    }
    // meters -> feet, only when the file actually specifies elevation
    const altFt = wp.elevationM !== null ? Math.round(wp.elevationM / 0.3048) : 0;

    return {
      name: wp.identifier,
      hdg,
      legDistNm,
      alt: altFt,
      _sourceType: wp.type // kept for reference, not required by the table
    };
  });

  const totalDistanceNm = Math.round(rows.reduce((s, r) => s + r.legDistNm, 0) * 10) / 10;

  return {
    valid: true,
    rows,
    meta: {
      waypointCount: rows.length,
      totalDistanceNm,
      departureIdentifier: waypoints[0].identifier,
      arrivalIdentifier: waypoints[waypoints.length - 1].identifier
    }
  };
}
