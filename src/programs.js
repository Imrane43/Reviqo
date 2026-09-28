/**
 * Référentiel des programmes scolaires.
 *
 * Décrit, par pays et par système, les niveaux (Collège / Lycée / Étudiant),
 * les classes, les voies et séries, les domaines étudiants, ainsi que les
 * examens associés. C'est la source unique utilisée pour :
 *   - alimenter la table `curricula` en base (seed idempotent) ;
 *   - résoudre le programme d'un utilisateur depuis son profil ;
 *   - calculer les onglets d'examen (Brevet uniquement en 3ème, Bac de
 *     Français uniquement en Première, Bac uniquement en Terminale…).
 *
 * `content_status` :
 *   - 'published'    : programme entièrement configuré ET contenu dédié disponible ;
 *   - 'partial'      : référentiel + matières + onglets prêts, contenu générique
 *                      en attendant le contenu spécifique à la classe ;
 *   - 'unavailable'  : structure connue mais aucun contenu pour ce programme —
 *                      l'application affiche « Contenu non encore disponible
 *                      pour ce programme » au lieu de servir un autre pays.
 */

export const COUNTRIES = [
  { code: 'FR', label: 'France', system: 'fr', flag: '🇫🇷' },
  { code: 'BE', label: 'Belgique', system: 'be', flag: '🇧🇪' },
  { code: 'CH', label: 'Suisse', system: 'ch', flag: '🇨🇭' },
  { code: 'CA', label: 'Canada', system: 'ca', flag: '🇨🇦' },
  { code: 'MA', label: 'Maroc', system: 'ma', flag: '🇲🇦' },
  { code: 'DZ', label: 'Algérie', system: 'dz', flag: '🇩🇿' },
  { code: 'TN', label: 'Tunisie', system: 'tn', flag: '🇹🇳' },
  { code: 'SN', label: 'Sénégal', system: 'sn', flag: '🇸🇳' },
  { code: 'XX', label: 'Autre', system: 'other', flag: '🌍' },
];

export const PROGRAM_NOTICE = 'Contenu non encore disponible pour ce programme';
export const PROGRAM_GENERIC_NOTE = 'Contenu générique : les fiches propres à ta classe arrivent à l’étape suivante.';

const TECHNO_SERIES = ['STMG', 'STI2D', 'ST2S', 'STL', 'STD2A', 'S2TMD', 'STHR'];

export const SYSTEMS = {
  fr: {
    label: 'France',
    status: 'partial',
    levels: [
      {
        level: 'college', label: 'Collège',
        grades: [
          { grade: '6eme', label: '6ème', subjects: ['maths', 'francais', 'anglais', 'histoire', 'geographie', 'physique', 'biologie', 'culture'] },
          { grade: '5eme', label: '5ème', subjects: ['maths', 'francais', 'anglais', 'histoire', 'geographie', 'physique', 'chimie', 'biologie'] },
          { grade: '4eme', label: '4ème', subjects: ['maths', 'francais', 'anglais', 'histoire', 'geographie', 'physique', 'chimie', 'biologie', 'informatique'] },
          {
            grade: '3eme', label: '3ème',
            subjects: ['maths', 'francais', 'anglais', 'histoire', 'geographie', 'physique', 'chimie', 'biologie', 'informatique'],
            exam: {
              code: 'brevet', label: 'Révisions Brevet',
              subjects: ['francais', 'maths', 'histoire', 'geographie', 'physique', 'chimie', 'biologie'],
              options: ['fiches_synthese', 'sujets_entrainement', 'methodologie', 'simulations_chronometrees'],
            },
          },
        ],
      },
      {
        level: 'lycee', label: 'Lycée',
        grades: [
          { grade: '2nde', label: 'Seconde', subjects: ['maths', 'francais', 'anglais', 'histoire', 'geographie', 'physique', 'chimie', 'biologie', 'informatique', 'culture'] },
          {
            grade: '1ere', label: 'Première',
            tracks: [
              {
                track: 'general', label: 'Voie générale',
                subjects: ['maths', 'francais', 'anglais', 'histoire', 'geographie', 'physique', 'chimie', 'biologie', 'informatique'],
                exam: {
                  code: 'bac_francais', label: 'Révisions Bac de Français',
                  subjects: ['francais'],
                  options: ['ecrit', 'oral', 'methodologie', 'textes', 'oeuvres', 'prise_de_parole'],
                },
              },
              {
                track: 'techno', label: 'Voie technologique', series: TECHNO_SERIES,
                subjects: ['maths', 'francais', 'anglais', 'histoire', 'geographie', 'informatique'],
                exam: {
                  code: 'bac_francais', label: 'Révisions Bac de Français',
                  subjects: ['francais'],
                  options: ['ecrit', 'oral', 'methodologie'],
                },
              },
            ],
          },
          {
            grade: 'terminale', label: 'Terminale',
            tracks: [
              {
                track: 'general', label: 'Voie générale',
                subjects: ['maths', 'francais', 'anglais', 'histoire', 'geographie', 'physique', 'chimie', 'biologie', 'philosophie', 'informatique'],
                exam: {
                  code: 'bac', label: 'Révisions Bac',
                  subjects: ['philosophie', 'francais', 'maths', 'histoire', 'geographie', 'physique', 'chimie', 'biologie'],
                  options: ['philosophie', 'grand_oral', 'specialites'],
                },
              },
              {
                track: 'techno', label: 'Voie technologique', series: TECHNO_SERIES,
                subjects: ['maths', 'francais', 'anglais', 'histoire', 'geographie', 'philosophie', 'informatique'],
                exam: {
                  code: 'bac', label: 'Révisions Bac',
                  subjects: ['philosophie', 'francais', 'maths', 'histoire', 'geographie'],
                  options: ['philosophie', 'grand_oral', 'specialites'],
                },
              },
            ],
          },
        ],
      },
      {
        level: 'etudiant', label: 'Étudiant',
        domains: [
          { domain: 'droit', label: 'Droit', subjects: [] },
          { domain: 'sante', label: 'Médecine et santé', subjects: ['biologie', 'chimie'] },
          { domain: 'informatique', label: 'Informatique', subjects: ['informatique', 'maths'] },
          { domain: 'economie', label: 'Économie', subjects: ['culture'] },
          { domain: 'gestion', label: 'Gestion et commerce', subjects: [] },
          { domain: 'sciences', label: 'Sciences', subjects: ['maths', 'physique', 'chimie', 'biologie'] },
          { domain: 'lettres', label: 'Lettres et langues', subjects: ['francais', 'anglais'] },
          { domain: 'sciences_humaines', label: 'Sciences humaines', subjects: ['histoire', 'geographie', 'philosophie'] },
          { domain: 'autre', label: 'Autre parcours', subjects: [], needsDetail: true },
        ],
      },
    ],
  },

  be: {
    label: 'Belgique', status: 'unavailable',
    levels: [
      { level: 'secondaire', label: 'Secondaire', grades: [
        { grade: '1re', label: '1re secondaire', subjects: ['maths', 'francais', 'anglais', 'histoire', 'geographie', 'biologie'] },
        { grade: '2e', label: '2e secondaire', subjects: ['maths', 'francais', 'anglais', 'histoire', 'geographie', 'physique'] },
        { grade: '3e', label: '3e secondaire', subjects: ['maths', 'francais', 'anglais', 'histoire', 'geographie', 'physique', 'chimie'] },
        { grade: '4e', label: '4e secondaire', subjects: ['maths', 'francais', 'anglais', 'histoire', 'physique', 'chimie'] },
        { grade: '5e', label: '5e secondaire', subjects: ['maths', 'francais', 'anglais', 'histoire', 'physique', 'chimie'] },
        { grade: '6e', label: '6e secondaire', subjects: ['maths', 'francais', 'anglais', 'histoire', 'philosophie'], exam: { code: 'cess', label: 'Révisions CESS', subjects: ['francais', 'maths', 'histoire'], options: [] } },
      ] },
    ],
  },

  ch: {
    label: 'Suisse', status: 'unavailable',
    levels: [
      { level: 'secondaire', label: 'Secondaire', grades: [
        { grade: '9e', label: '9e année', subjects: ['maths', 'francais', 'anglais', 'histoire', 'geographie', 'physique'] },
        { grade: '10e', label: '10e année', subjects: ['maths', 'francais', 'anglais', 'histoire', 'geographie', 'chimie'] },
        { grade: '11e', label: '11e année', subjects: ['maths', 'francais', 'anglais', 'histoire', 'physique', 'chimie'] },
        { grade: 'maturite', label: 'Maturité', subjects: ['maths', 'francais', 'anglais', 'histoire', 'philosophie', 'biologie'], exam: { code: 'maturite', label: 'Révisions Maturité', subjects: ['francais', 'maths', 'philosophie'], options: [] } },
      ] },
    ],
  },

  ca: {
    label: 'Canada', status: 'unavailable',
    levels: [
      { level: 'secondaire', label: 'Secondaire', grades: [
        { grade: 'sec1', label: 'Secondaire 1', subjects: ['maths', 'francais', 'anglais', 'histoire', 'geographie', 'biologie'] },
        { grade: 'sec2', label: 'Secondaire 2', subjects: ['maths', 'francais', 'anglais', 'histoire', 'geographie', 'physique'] },
        { grade: 'sec3', label: 'Secondaire 3', subjects: ['maths', 'francais', 'anglais', 'histoire', 'physique', 'chimie'] },
        { grade: 'sec4', label: 'Secondaire 4', subjects: ['maths', 'francais', 'anglais', 'histoire', 'physique', 'chimie'] },
        { grade: 'sec5', label: 'Secondaire 5', subjects: ['maths', 'francais', 'anglais', 'histoire', 'philosophie'], exam: { code: 'des', label: 'Révisions DES', subjects: ['francais', 'maths', 'histoire'], options: [] } },
      ] },
    ],
  },

  ma: {
    label: 'Maroc', status: 'unavailable',
    levels: [
      { level: 'college', label: 'Collège', grades: [
        { grade: '1ac', label: '1re année collège', subjects: ['maths', 'francais', 'anglais', 'histoire', 'geographie', 'biologie'] },
        { grade: '2ac', label: '2e année collège', subjects: ['maths', 'francais', 'anglais', 'histoire', 'geographie', 'physique'] },
        { grade: '3ac', label: '3e année collège', subjects: ['maths', 'francais', 'anglais', 'histoire', 'physique', 'chimie'], exam: { code: 'brevet_ma', label: 'Examen régional', subjects: ['francais', 'maths', 'histoire'], options: [] } },
      ] },
      { level: 'lycee', label: 'Lycée', grades: [
        { grade: 'tronc_commun', label: 'Tronc commun', subjects: ['maths', 'francais', 'anglais', 'histoire', 'physique', 'biologie'] },
        { grade: '1bac', label: '1re année Bac', subjects: ['maths', 'francais', 'anglais', 'physique', 'chimie', 'philosophie'] },
        { grade: '2bac', label: '2e année Bac', subjects: ['maths', 'francais', 'anglais', 'physique', 'chimie', 'philosophie'], exam: { code: 'bac_ma', label: 'Révisions Bac', subjects: ['francais', 'maths', 'philosophie'], options: ['specialites'] } },
      ] },
    ],
  },

  dz: {
    label: 'Algérie', status: 'unavailable',
    levels: [
      { level: 'moyen', label: 'Enseignement moyen', grades: [
        { grade: '1am', label: '1re année moyenne', subjects: ['maths', 'francais', 'anglais', 'histoire', 'geographie', 'biologie'] },
        { grade: '2am', label: '2e année moyenne', subjects: ['maths', 'francais', 'anglais', 'histoire', 'physique'] },
        { grade: '3am', label: '3e année moyenne', subjects: ['maths', 'francais', 'anglais', 'histoire', 'physique', 'chimie'] },
        { grade: '4am', label: '4e année moyenne', subjects: ['maths', 'francais', 'anglais', 'histoire', 'physique', 'chimie'], exam: { code: 'bem', label: 'Révisions BEM', subjects: ['francais', 'maths', 'physique'], options: [] } },
      ] },
      { level: 'secondaire', label: 'Secondaire', grades: [
        { grade: '1as', label: '1re année secondaire', subjects: ['maths', 'francais', 'anglais', 'histoire', 'physique', 'biologie'] },
        { grade: '2as', label: '2e année secondaire', subjects: ['maths', 'francais', 'anglais', 'physique', 'chimie', 'philosophie'] },
        { grade: '3as', label: '3e année secondaire', subjects: ['maths', 'francais', 'anglais', 'physique', 'philosophie'], exam: { code: 'bac_dz', label: 'Révisions Bac', subjects: ['francais', 'maths', 'philosophie'], options: ['specialites'] } },
      ] },
    ],
  },

  tn: {
    label: 'Tunisie', status: 'unavailable',
    levels: [
      { level: 'college', label: 'Collège', grades: [
        { grade: '7e', label: '7e année', subjects: ['maths', 'francais', 'anglais', 'histoire', 'geographie', 'biologie'] },
        { grade: '8e', label: '8e année', subjects: ['maths', 'francais', 'anglais', 'histoire', 'physique'] },
        { grade: '9e', label: '9e année', subjects: ['maths', 'francais', 'anglais', 'histoire', 'physique', 'chimie'], exam: { code: 'diplome9', label: 'Diplôme de fin d’études de base', subjects: ['francais', 'maths'], options: [] } },
      ] },
      { level: 'lycee', label: 'Lycée', grades: [
        { grade: '1ere', label: '1re année', subjects: ['maths', 'francais', 'anglais', 'histoire', 'physique'] },
        { grade: '2eme', label: '2e année', subjects: ['maths', 'francais', 'anglais', 'physique', 'philosophie'] },
        { grade: '3eme', label: '3e année', subjects: ['maths', 'francais', 'anglais', 'physique', 'philosophie'], exam: { code: 'bac_tn', label: 'Révisions Bac', subjects: ['francais', 'maths', 'philosophie'], options: ['specialites'] } },
        { grade: '4eme', label: '4e année', subjects: ['maths', 'francais', 'anglais', 'physique', 'philosophie'], exam: { code: 'bac_tn', label: 'Révisions Bac', subjects: ['francais', 'maths', 'philosophie'], options: ['specialites'] } },
      ] },
    ],
  },

  sn: {
    label: 'Sénégal', status: 'unavailable',
    levels: [
      { level: 'college', label: 'Collège', grades: [
        { grade: '6e', label: '6ème', subjects: ['maths', 'francais', 'anglais', 'histoire', 'geographie', 'biologie'] },
        { grade: '5e', label: '5ème', subjects: ['maths', 'francais', 'anglais', 'histoire', 'physique'] },
        { grade: '4e', label: '4ème', subjects: ['maths', 'francais', 'anglais', 'histoire', 'physique', 'chimie'] },
        { grade: '3e', label: '3ème', subjects: ['maths', 'francais', 'anglais', 'histoire', 'physique', 'chimie'], exam: { code: 'bfem', label: 'Révisions BFEM', subjects: ['francais', 'maths', 'physique'], options: [] } },
      ] },
      { level: 'lycee', label: 'Lycée', grades: [
        { grade: '2nde', label: 'Seconde', subjects: ['maths', 'francais', 'anglais', 'histoire', 'physique', 'biologie'] },
        { grade: '1ere', label: 'Première', subjects: ['maths', 'francais', 'anglais', 'histoire', 'physique', 'philosophie'] },
        { grade: 'terminale', label: 'Terminale', subjects: ['maths', 'francais', 'anglais', 'philosophie'], exam: { code: 'bac_sn', label: 'Révisions Bac', subjects: ['francais', 'maths', 'philosophie'], options: ['specialites'] } },
      ] },
    ],
  },

  other: {
    label: 'Autre', status: 'unavailable',
    levels: [
      { level: 'autre', label: 'Autre système', grades: [
        { grade: 'autre', label: 'Niveau non précisé', subjects: [] },
      ] },
    ],
  },
};

/** 'Collège' / 'Lycée' / 'Étudiant' → code de niveau du système concerné. */
export function genericLevelToSystem(levelLabel, system) {
  const def = SYSTEMS[system];
  if (!def) return null;
  const codes = def.levels.map((l) => l.level);
  const label = String(levelLabel || '').toLowerCase();
  const pick = (candidates, fallback) => candidates.find((c) => codes.includes(c)) || fallback;
  if (!label) return codes[0] || null;
  if (label.includes('collège') || label.includes('college')) return pick(['college'], codes[0] || null);
  if (label.includes('lycée') || label.includes('lycee')) return pick(['lycee'], codes[0] || null);
  if (label.includes('étudiant') || label.includes('etudiant') || label.includes('supérieur') || label.includes('superieur')) return pick(['etudiant'], codes[codes.length - 1] || null);
  if (label.includes('secondaire')) return pick(['secondaire'], codes[0] || null);
  return codes[0] || null;
}

export function subjectsFromCurriculum(cur) {
  if (!cur) return [];
  const raw = cur.subjects;
  return Array.isArray(raw) ? raw : (typeof raw === 'string' && raw ? JSON.parse(raw) : []);
}

export function countryByLabel(label) {
  const wanted = String(label || '').trim().toLowerCase();
  if (!wanted) return null;
  return COUNTRIES.find((c) => c.label.toLowerCase() === wanted)
    || COUNTRIES.find((c) => c.code.toLowerCase() === wanted)
    || null;
}

function curriculumRow({ country, system, level, grade, track, domain, def }) {
  const labelParts = [def.label];
  if (track) labelParts.push(track.label);
  if (domain) labelParts.push(domain.label);
  const exam = def.exam || track?.exam || null;
  return {
    country_code: country.code,
    country_label: country.label,
    system,
    level: level.level,
    grade: grade?.grade || '',
    track: track?.track || '',
    domain: domain?.domain || '',
    label: labelParts.join(' — '),
    subjects: [...(domain?.subjects || track?.subjects || grade?.subjects || [])],
    exam_code: exam?.code || null,
    exam_label: exam?.label || null,
    exam_subjects: [...(exam?.subjects || [])],
    exam_options: [...(exam?.options || [])],
    series: [...(track?.series || [])],
    content_status: SYSTEMS[system]?.status || 'unavailable',
    needs_detail: !!(domain?.needsDetail),
    sort_order: 0,
  };
}

/** Liste plate de tous les programmes du référentiel. */
export function listCurricula() {
  const rows = [];
  let order = 0;
  for (const [system, def] of Object.entries(SYSTEMS)) {
    const country = COUNTRIES.find((c) => c.system === system) || { code: 'XX', label: def.label };
    for (const level of def.levels) {
      if (level.grades) {
        for (const grade of level.grades) {
          if (grade.tracks) {
            for (const track of grade.tracks) rows.push({ ...curriculumRow({ country, system, level, grade, track, def: grade }), sort_order: ++order });
          } else {
            rows.push({ ...curriculumRow({ country, system, level, grade, def: grade }), sort_order: ++order });
          }
        }
      }
      if (level.domains) {
        for (const domain of level.domains) {
          // Étudiant: one row per (level=etudiant, domain)
          const fakeGrade = { grade: '', label: '' };
          const row = curriculumRow({ country, system, level, grade: fakeGrade, domain, def: domain });
          row.grade = '';
          row.label = `Étudiant — ${domain.label}`;
          row.curriculum_level = 'etudiant';
          rows.push({ ...row, sort_order: ++order });
        }
      }
    }
  }
  return rows;
}

/** Catalogue compact pour construire l'interface de profil. */
export function programsCatalog() {
  const systems = {};
  for (const [system, def] of Object.entries(SYSTEMS)) {
    systems[system] = {
      label: def.label,
      status: def.status,
      levels: def.levels.map((level) => ({
        level: level.level,
        label: level.label,
        grades: (level.grades || []).map((g) => ({
          grade: g.grade,
          label: g.label,
          tracks: (g.tracks || []).map((t) => ({ track: t.track, label: t.label, series: t.series || [] })),
        })),
        domains: (level.domains || []).map((d) => ({ domain: d.domain, label: d.label, needsDetail: !!d.needsDetail })),
      })),
    };
  }
  return { countries: COUNTRIES, systems };
}

/** Onglets d'examen déduits du programme (Brevet en 3ème, Bac en 1ère/Terminale…). */
export function examTabsFor(cur) {
  if (!cur) return [];
  const code = cur.exam_code || cur.examCode;
  if (!code) return [];
  const parse = (v) => (Array.isArray(v) ? v : (typeof v === 'string' && v ? JSON.parse(v) : []));
  return [{
    code,
    label: cur.exam_label || cur.examLabel,
    subjects: parse(cur.exam_subjects ?? cur.examSubjects),
    options: parse(cur.exam_options ?? cur.examOptions),
    contentStatus: cur.content_status || cur.contentStatus,
  }];
}
