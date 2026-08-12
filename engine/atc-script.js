/**
 * atc-script.js
 * Builds a step-by-step ATC communication sequence for Infinite Flight,
 * based on IF's own "ATC Communication" guide — summarized and paraphrased
 * into our own wording (this is procedural/functional info: which
 * facility to contact when, and which quick-transmission option applies).
 *
 * Only meaningful for the Infinite Flight platform. RFS and MSFS use
 * different (or no) built-in ATC systems, so this module is skipped for
 * those — the UI never calls it when platform !== 'infinite_flight'.
 *
 * Runway numbers are left as a placeholder ("sesuai assignment ATC")
 * because we don't have per-runway assignment data — the active runway
 * in-sim depends on real-time wind/ATC, not something this static tool
 * can know in advance.
 */

export function buildAtcScript({ depAirport, arrAirport, approachMode }) {
  const arrivalCallType = approachMode === 'manual'
    ? 'inbound on the Visual, RWY [sesuai assignment ATC]'
    : 'inbound on the ILS, RWY [sesuai assignment ATC]';

  return {
    departureIcao: depAirport.icao,
    arrivalIcao: arrAirport.icao,

    departure: [
      {
        facility: 'Ground',
        when: 'Siap pushback atau taxi',
        say: 'Request pushback (kalau perlu) lalu request taxi ke runway aktif',
        note: 'Kalau Ground nggak online, boleh pushback & taxi sendiri tanpa izin — pastikan aja jalurnya aman. Nggak perlu kontak Tower sampai siap takeoff.'
      },
      {
        facility: 'Tower',
        when: 'Di-handoff dari Ground, atau setelah diinstruksikan "taxi to RWY XX, contact Tower when ready"',
        say: 'Request takeoff',
        note: null
      },
      {
        facility: 'Radar (Departure/Center)',
        when: 'Di-handoff dari Tower setelah takeoff, atau begitu masuk airspace controller (kalau field-nya nggak ada Tower)',
        say: '"Check In [IFR]"',
        note: null
      }
    ],

    enroute: {
      centerHandoffNote: 'Kalau Center yang lagi berfungsi sebagai Approach: check in begitu masuk airspace-nya, lalu kirim "requesting descent via [STAR] arrival" mendekati TOD. Approach request yang spesifik (ILS/Visual/dst) baru dikirim setelah tembus FL180.',
      controllerChangeNote: 'Kalau ada pergantian controller (sempat kosong beberapa saat), lanjut terbang normal aja — clearance yang udah dikasih tetap berlaku. Controller baru bisa lihat log komunikasi sebelumnya, jadi nggak perlu request ulang.'
    },

    arrival: [
      {
        facility: 'Radar (Approach/Center)',
        when: 'Di-handoff dari radar controller lain, atau begitu masuk airspace-nya',
        say: '"Check In [IFR]" ATAU langsung request approach spesifik (ILS/Visual/GPS RWY XX) kalau lagi dengan Approach',
        note: 'Kalau udah connect ke Approach, cukup satu request approach — jangan kirim "Check In" lagi setelahnya, itu dianggap 2 request terpisah.'
      },
      {
        facility: 'Tower',
        when: 'Di-handoff dari Radar, atau inbound tanpa radar service (dalam 25nm & di bawah 10.000ft AAL)',
        say: `"${arrivalCallType}"`,
        note: 'Frasa "inbound on the ILS/Visual" CUMA dipakai kalau udah dapat approach clearance dari Radar. Kalau nggak dapat clearance (misal langsung connect ke Tower tanpa lewat Radar), bilang "inbound for landing" aja.'
      },
      {
        facility: 'Ground',
        when: 'Di-handoff dari Tower (biasanya lewat instruksi exit runway tertentu), atau setelah keluar runway tanpa instruksi',
        say: 'Request taxi to parking',
        note: null
      }
    ],

    commonMistakes: [
      'Bilang "inbound on the ILS/GPS/Visual" padahal belum dapat approach clearance dari Radar — kalau belum, cukup "inbound for landing".',
      'Kirim "Check In [IFR]" ke Approach padahal cuma perlu langsung request approach spesifik.',
      'Minta "descent via [STAR] arrival" ke Approach — request ini seharusnya cuma ke Center, bukan Approach.',
      'Kirim "Check In [IFR]" lalu "Flight Following [VFR]" ke Radar yang sama — itu 2 request berbeda buat 2 flight rules berbeda, pilih salah satu aja.',
      'Bilang "remaining in the pattern" pas departure padahal nggak niat terbang pattern — kalau langsung pergi, cukup sebutkan arah keberangkatan.'
    ],

    disclaimer: 'Dirangkum ulang dari panduan resmi "ATC Communication" Infinite Flight, dengan kata-kata sendiri — bukan kutipan langsung. Frasa & urutan bisa sedikit beda tergantung controller yang online dan situasi real-time di sim.'
  };
}
