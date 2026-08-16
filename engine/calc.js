/**
 * calc.js
 * Core flight-prep calculations: cargo weight, meal weight, fuel planning,
 * weight & balance, V-speeds, trim, altitude/TOD plan, climb profile, and
 * detailed approach profile. Orchestrates all engine modules into one
 * pipeline the UI calls once per EXEC.
 */

import { computeVSpeeds } from './vspeed.js';
import { planAltitude } from './altitude-planner.js';
import { buildApproachProfile } from './approach-profile.js';
import { buildClimbProfile } from './climb-profile.js';
import { buildAtcScript } from './atc-script.js'; // kept for reference; not called by default anymore (see below)
import { buildUnicomSequence } from './unicom-script.js';
import { computeTrim } from './trim.js';

export const FUEL_TIERS = [
  { max:180,      alt:'FL220–250', climbFuel:1300, descentFuel:450, cruiseRate:5.3, taxi:250, alternate:900  },
  { max:350,      alt:'FL320–350', climbFuel:1700, descentFuel:550, cruiseRate:4.8, taxi:280, alternate:1000 },
  { max:550,      alt:'FL350–360', climbFuel:1850, descentFuel:650, cruiseRate:4.6, taxi:300, alternate:1100 },
  { max:750,      alt:'FL360–370', climbFuel:2000, descentFuel:700, cruiseRate:4.5, taxi:300, alternate:1200 },
  { max:Infinity, alt:'FL370',     climbFuel:2200, descentFuel:780, cruiseRate:4.4, taxi:320, alternate:1300 }
];

export function pickFuelTier(distanceNm) {
  return FUEL_TIERS.find(t => distanceNm <= t.max);
}

export function computeCargo(pax) {
  const buckets = [
    { kg:7, p:0.20 }, { kg:8, p:0.30 }, { kg:9, p:0.30 }, { kg:10, p:0.20 }
  ];
  const counts = buckets.map(b => Math.round(pax * b.p));
  const sumCount = counts.reduce((a, b) => a + b, 0);
  counts[counts.length - 1] += (pax - sumCount);
  let total = 0;
  buckets.forEach((b, i) => total += counts[i] * b.kg);
  return { buckets, counts, total };
}

export function computeMeal(pax, mealWeightKg = 0.45) {
  const count = Math.round(pax * 0.475);
  const total = count * mealWeightKg;
  return { count, mealWeightKg, total };
}

export function computeFuel(distanceNm, tier, climbDistanceNm, todDistanceNm) {
  const cruiseDist = Math.max(distanceNm - climbDistanceNm - todDistanceNm, 0);
  const cruiseFuel = cruiseDist * tier.cruiseRate;
  const tripFuel = tier.climbFuel + cruiseFuel + tier.descentFuel;
  const contingency = tripFuel * 0.05;
  const totalRaw = tier.taxi + tripFuel + contingency + tier.alternate + 700 + 200;
  const base = Math.round(totalRaw / 50) * 50;
  return {
    cruiseDist, cruiseFuel, tripFuel, contingency,
    taxi: tier.taxi, alternate: tier.alternate,
    finalReserve: 700, extra: 200,
    fuelRangeLow: base, fuelRangeHigh: base + 100,
    fuelBase: base
  };
}

export function computeWeightAndBalance(aircraftData, pax, paxWeightKg, cargoTotal, mealTotal, fuelBase, tripFuel) {
  const zfw = aircraftData.oew + (pax * paxWeightKg) + cargoTotal + mealTotal;
  const tow = zfw + fuelBase;
  const lw = tow - tripFuel;
  const loadPct = (tow / aircraftData.mtow) * 100;
  const vtrimHeuristic = (loadPct / 3) / 100;

  return {
    zfw, tow, lw, loadPct, vtrimHeuristic,
    zfwMargin: aircraftData.mzfw - zfw,
    towMargin: aircraftData.mtow - tow,
    lwMargin: aircraftData.mlw - lw
  };
}

/**
 * Orchestrator — runs the full calculation pipeline for one flight prep.
 *
 * input = {
 *   aircraftData, pax, paxWeightKg, mealWeightKg,
 *   distanceNm,                 // total route distance (from Model 1 or Model 2 table)
 *   depAirport, arrAirport,      // resolved records from airports.json
 *   userFL,                       // optional — explicit "Cruise FL" field
 *   tableHighestAltFt,             // optional — highest ALT found in Model 2 table (fallback if userFL empty)
 *   approachMode,                    // 'ils' | 'manual'
 *   platform, includeAtc,              // 'infinite_flight' | 'rfs' | 'msfs', boolean
 *   routeMode, waypoints                // 'simple' | 'waypoints', + the waypoint array (Model 2) — needed by
 *                                         // unicom-script.js to compute straight-in vs pattern-needed
 * }
 */
export function computeFullPrep(input) {
  const {
    aircraftData, pax, paxWeightKg = 84, mealWeightKg = 0.45,
    distanceNm, depAirport, arrAirport, userFL, tableHighestAltFt,
    approachMode = 'ils', platform = 'infinite_flight', includeAtc = false,
    routeMode = 'simple', waypoints = null
  } = input;

  const tier = pickFuelTier(distanceNm);
  const cargo = computeCargo(pax);
  const meal = computeMeal(pax, mealWeightKg);

  const altitudePlan = planAltitude({
    distanceNm,
    userFL,
    tableHighestAltFt,
    destElevFt: arrAirport.elev_ft || 0
  });

  const fuel = computeFuel(distanceNm, tier, altitudePlan.climbDistanceNm, altitudePlan.todDistanceNm);
  const wb = computeWeightAndBalance(
    aircraftData, pax, paxWeightKg, cargo.total, meal.total, fuel.fuelBase, fuel.tripFuel
  );
  const vspeeds = computeVSpeeds(aircraftData, wb.tow, depAirport.max_runway_ft);
  const approach = buildApproachProfile(
    approachMode, aircraftData, arrAirport, wb.lw,
    altitudePlan.cruiseFt, altitudePlan.todDistanceNm
  );
  const climb = buildClimbProfile(aircraftData, depAirport, altitudePlan.cruiseFt, altitudePlan.climbDistanceNm);
  const trim = computeTrim(wb.vtrimHeuristic);

  // Default ATC output is Unicom (Casual server) — confirmed with user this
  // is what's needed for now. atc-script.js (controlled-server hierarchy)
  // stays in the repo but isn't called here anymore.
  const atc = (platform === 'infinite_flight' && includeAtc)
    ? buildUnicomSequence({ depAirport, arrAirport, routeMode, waypoints, totalDistanceNm: distanceNm })
    : null;

  return {
    tier, cargo, meal, fuel, wb, vspeeds, altitudePlan, approach, climb, trim, atc, platform
  };
}
