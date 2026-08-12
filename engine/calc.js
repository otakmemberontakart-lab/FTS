/**
 * calc.js
 * Core flight-prep calculations: cargo weight, meal weight, fuel planning,
 * weight & balance, V-speeds, altitude/TOD plan, and detailed approach
 * profile. Migrated from the original flight-prep-calculator.html into
 * pure, DOM-free functions so the UI layer can change independently.
 */

import { computeVSpeeds } from './vspeed.js';
import { planAltitude } from './altitude-planner.js';
import { buildApproachProfile } from './approach-profile.js';
import { buildAtcScript } from './atc-script.js';

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
  counts[counts.length - 1] += (pax - sumCount); // fix rounding remainder
  let total = 0;
  buckets.forEach((b, i) => total += counts[i] * b.kg);
  return { buckets, counts, total };
}

export function computeMeal(pax, mealWeightKg = 0.45) {
  const count = Math.round(pax * 0.475);
  const total = count * mealWeightKg;
  return { count, mealWeightKg, total };
}

/**
 * climbDistanceNm / todDistanceNm now come from altitude-planner.js (real
 * FL-based estimate) instead of a fixed distance-band assumption, so the
 * cruise-fuel portion reflects the actual chosen/recommended cruise level.
 */
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

export function climbRows(tier) {
  return [
    ['Liftoff → 1.500 ft', 'V2+10–15 kt', '+2.000 to +2.500 fpm'],
    ['1.500 – 3.000 ft (flap retract)', 'Accelerating', '+2.000 to +2.500 fpm'],
    ['3.000 – 10.000 ft', '230–250 kt IAS (max 250 di bawah FL100)', '+1.800 to +2.200 fpm'],
    ['Passing 10.000 ft', 'Accelerate → 290–300 kt IAS', '+1.500 to +1.800 fpm'],
    ['10.000 ft → Crossover (~FL280-300)', '290–300 kt IAS', '+1.200 to +1.800 fpm'],
    [`Crossover → TOC (${tier.alt})`, 'Mach 0.78', 'Reduce → 0 saat level off']
  ];
}

/**
 * Orchestrator — runs the full calculation pipeline for one flight prep.
 *
 * input = {
 *   aircraftData,        // record from aircraft.json
 *   pax,                  // integer
 *   paxWeightKg,           // default 84
 *   mealWeightKg,            // default 0.45
 *   distanceNm,               // integer/float, total route distance
 *   depAirport,                // resolved record from airports.json (needs max_runway_ft)
 *   arrAirport,                 // resolved record from airports.json (needs elev_ft, likely_has_ils)
 *   userFL,                      // optional — user-specified cruise FL (e.g. 220). Omit to auto-recommend.
 *   approachMode,                  // 'ils' | 'manual' — which approach profile to build
 *   platform,                       // 'infinite_flight' | 'rfs' | 'msfs' — default 'infinite_flight'
 *   includeAtc                       // boolean — only builds ATC script if platform is 'infinite_flight' AND this is true
 * }
 */
export function computeFullPrep(input) {
  const {
    aircraftData, pax, paxWeightKg = 84, mealWeightKg = 0.45,
    distanceNm, depAirport, arrAirport, userFL, approachMode = 'ils',
    platform = 'infinite_flight', includeAtc = false
  } = input;

  const tier = pickFuelTier(distanceNm);
  const cargo = computeCargo(pax);
  const meal = computeMeal(pax, mealWeightKg);

  const altitudePlan = planAltitude({
    distanceNm,
    userFL,
    destElevFt: arrAirport.elev_ft || 0
  });

  const fuel = computeFuel(distanceNm, tier, altitudePlan.climbDistanceNm, altitudePlan.todDistanceNm);
  const wb = computeWeightAndBalance(
    aircraftData, pax, paxWeightKg, cargo.total, meal.total, fuel.fuelBase, fuel.tripFuel
  );
  const vspeeds = computeVSpeeds(aircraftData, wb.tow, depAirport.max_runway_ft);
  const approach = buildApproachProfile(approachMode, aircraftData, arrAirport, wb.lw);

  const atc = (platform === 'infinite_flight' && includeAtc)
    ? buildAtcScript({ depAirport, arrAirport, approachMode })
    : null;

  return {
    tier, cargo, meal, fuel, wb, vspeeds, altitudePlan, approach, atc, platform,
    climb: climbRows(tier)
  };
}
