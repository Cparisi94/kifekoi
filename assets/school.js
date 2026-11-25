/* Vacances scolaires — zones A, B et C — année 2026-2027
   Source : education.gouv.fr (calendrier scolaire officiel 2026-2027).
   Les dates de fin correspondent au dernier jour sans classe. */

const COMMON = [
  { label: 'Vacances de la Toussaint', start: '2026-10-17', end: '2026-11-01' },
  { label: 'Vacances de Noël', start: '2026-12-19', end: '2027-01-03' },
  { label: "Vacances d'été", start: '2027-07-03', end: '2027-08-31' },
];

export const SCHOOL_ZONES = {
  A: [
    ...COMMON,
    { label: "Vacances d'hiver", start: '2027-02-13', end: '2027-02-28' },
    { label: 'Vacances de printemps', start: '2027-04-10', end: '2027-04-25' },
  ],
  B: [
    ...COMMON,
    { label: "Vacances d'hiver", start: '2027-02-20', end: '2027-03-07' },
    { label: 'Vacances de printemps', start: '2027-04-17', end: '2027-05-02' },
  ],
  C: [
    ...COMMON,
    { label: "Vacances d'hiver", start: '2027-02-06', end: '2027-02-21' },
    { label: 'Vacances de printemps', start: '2027-04-03', end: '2027-04-18' },
  ],
};

/** Période de vacances contenant cette date (ou null). */
export function schoolHoliday(dateISO, zone = 'C') {
  if (!dateISO) return null;
  const list = SCHOOL_ZONES[zone] || SCHOOL_ZONES.C;
  for (const h of list) {
    if (dateISO >= h.start && dateISO <= h.end) return h;
  }
  return null;
}
