/* Vacances scolaires — zone C — année 2026-2027
   Source : education.gouv.fr (calendrier scolaire officiel).
   Les dates de fin correspondent au dernier jour sans classe. */

export const SCHOOL_HOLIDAYS = [
  { label: 'Vacances de la Toussaint', start: '2026-10-17', end: '2026-11-01' },
  { label: 'Vacances de Noël', start: '2026-12-19', end: '2027-01-03' },
  { label: "Vacances d'hiver", start: '2027-02-06', end: '2027-02-21' },
  { label: 'Vacances de printemps', start: '2027-04-03', end: '2027-04-18' },
  { label: "Vacances d'été", start: '2027-07-03', end: '2027-08-31' },
];

/** Période de vacances contenant cette date (ou null). */
export function schoolHoliday(dateISO) {
  if (!dateISO) return null;
  for (const h of SCHOOL_HOLIDAYS) {
    if (dateISO >= h.start && dateISO <= h.end) return h;
  }
  return null;
}
