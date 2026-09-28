/**
 * Bibliothèque pédagogique — contenus contextualisés par classe.
 *
 * Chaque ressource porte les métadonnées du référentiel :
 *   pays, programme (curriculum via `grade`+`level`), niveau, matière, chapitre,
 *   objectifs, prérequis, difficulté, langue, version, sources, type et statut.
 *
 * Les contenus ci-dessous sont ORIGINAUX (inspirés du format, pas des annales
 * officielles) : `contentType: 'original'`. Les ressources de type examen citent
 * leurs sources officielles ; `checkedAt` reste `null` tant que la vérification
 * humaine/session n'a pas été faite (jamais déclarée faite à tort).
 *
 * Contrainte de qualité (testée) : la 6ème et la 3ème ne partagent pas des
 * contenus identiques. Une même notion peut revenir, mais avec une progression
 * explicite (prérequis et difficulté différents), jamais une simple duplication.
 */

const q = (text, options, answer, explanation) => ({ text, options, answer, explanation });

const EDUSCOL = { label: 'Éduscol — programmes de collège', url: 'https://eduscol.education.fr/', session: null, checkedAt: null };
const MINISTERE = { label: 'Ministère de l’Éducation nationale — textes officiels', url: 'https://www.education.gouv.fr/', session: null, checkedAt: null };

export const GRADED_QUIZZES = [
  /* ----------------------------- 6ème ----------------------------- */
  {
    subject: 'maths', countryCode: 'FR', level: 'college', grade: '6eme',
    title: '6ème · Nombres décimaux', chapter: 'Nombres et calculs — décimaux', difficulty: 'easy',
    description: 'Lire, écrire et comparer les nombres décimaux (vocabulaire de 6ème).',
    objectives: ['Écrire un décimal sous forme de fraction décimale', 'Comparer deux nombres décimaux'],
    prerequisites: [], language: 'fr', version: 1, contentType: 'original', sources: [EDUSCOL],
    questions: [
      q('Combien de dixièmes y a-t-il dans 2,4 ?', ['4', '24', '0,4', '2'], 1, '2,4 = 24/10 : il y a donc 24 dixièmes.'),
      q('Quel nombre est égal à 0,5 ?', ['1/2', '1/5', '5/1', '1/50'], 0, '0,5 = 5/10 = 1/2.'),
      q('Quel est le plus grand nombre ?', ['1,02', '1,2', '1,022', '1,002'], 1, 'On compare d’abord les dixièmes : 2 dixièmes > 0 dixième.'),
      q('Écris 7/10 en nombre décimal.', ['0,7', '7,10', '0,07', '70'], 0, '7/10 = 0,7 (sept dixièmes).'),
    ],
  },
  {
    subject: 'maths', countryCode: 'FR', level: 'college', grade: '6eme',
    title: '6ème · Fractions simples', chapter: 'Nombres et calculs — fractions', difficulty: 'easy',
    description: 'Première approche des fractions : partages, égalités et comparaisons simples.',
    objectives: ['Associer une fraction à un partage', 'Comparer des fractions de même numérateur'],
    prerequisites: ['Nombres entiers', 'Partages simples'], language: 'fr', version: 1, contentType: 'original', sources: [EDUSCOL],
    questions: [
      q('Quelle fraction correspond à « trois quarts » ?', ['3/4', '4/3', '1/4', '3/3'], 0, '« Trois quarts » s’écrit 3/4.'),
      q('1/2 + 1/2 = ?', ['1/4', '1', '2/4', '1/2'], 1, 'Deux moitiés forment un tout : 1/2 + 1/2 = 1.'),
      q('Quelle fraction est égale à 1 ?', ['2/3', '3/3', '1/3', '3/1'], 1, '3/3 = 1 : numérateur et dénominateur égaux.'),
      q('Compare 1/3 et 1/2.', ['1/3 > 1/2', '1/3 < 1/2', 'Elles sont égales', 'On ne peut pas comparer'], 1, 'Plus le dénominateur est grand, plus la part est petite : 1/3 < 1/2.'),
    ],
  },
  {
    subject: 'francais', countryCode: 'FR', level: 'college', grade: '6eme',
    title: '6ème · Les classes de mots', chapter: 'Grammaire — nature des mots', difficulty: 'easy',
    description: 'Reconnaître nom, verbe, adjectif, adverbe et déterminant dans une phrase simple.',
    objectives: ['Identifier la classe grammaticale d’un mot', 'Distinguer adjectif et adverbe'],
    prerequisites: ['Lire une phrase simple'], language: 'fr', version: 1, contentType: 'original', sources: [EDUSCOL],
    questions: [
      q('Dans « le chat dort », quel mot est le verbe ?', ['chat', 'dort', 'le', 'aucun'], 1, '« Dort » exprime l’action : c’est le verbe conjugué.'),
      q('« rapide » est un…', ['nom', 'adjectif', 'verbe', 'adverbe'], 1, '« Rapide » qualifie un nom : c’est un adjectif.'),
      q('« vite » est un…', ['adjectif', 'adverbe', 'nom', 'préposition'], 1, '« Vite » modifie le verbe : c’est un adverbe.'),
      q('Dans « une belle maison », « maison » est un…', ['adjectif', 'nom', 'verbe', 'déterminant'], 1, '« Maison » désigne un objet : c’est un nom commun.'),
    ],
  },
  {
    subject: 'francais', countryCode: 'FR', level: 'college', grade: '6eme',
    title: '6ème · Présent des verbes du 1er groupe', chapter: 'Conjugaison — présent', difficulty: 'easy',
    description: 'Former le présent de l’indicatif des verbes en -er.',
    objectives: ['Appliquer les terminaisons du présent du 1er groupe'],
    prerequisites: ['Reconnaître l’infinitif d’un verbe'], language: 'fr', version: 1, contentType: 'original', sources: [EDUSCOL],
    questions: [
      q('Conjugue « chanter » à la 1re personne du singulier au présent.', ['je chante', 'je chantes', 'j’ai chanté', 'je chantais'], 0, 'Au présent : je chante.'),
      q('« Nous (manger) » au présent :', ['nous mangons', 'nous mangeons', 'nous mangions', 'nous mangerons'], 1, 'On garde le « e » après « g » devant « ons » : nous mangeons.'),
      q('Quelle est la terminaison de « tu » au présent (1er groupe) ?', ['-e', '-es', '-s', '-ez'], 1, 'On écrit « tu chantes » : la terminaison est -es.'),
    ],
  },

  /* ----------------------------- 3ème ----------------------------- */
  {
    subject: 'maths', countryCode: 'FR', level: 'college', grade: '3eme',
    title: '3ème · Calcul littéral : développer et factoriser', chapter: 'Nombres et calculs — calcul littéral', difficulty: 'hard',
    description: 'Double distributivité, identités remarquables et réduction d’expressions littérales.',
    objectives: ['Développer un produit de deux binômes', 'Factoriser une différence de carrés', 'Réduire une expression littérale'],
    prerequisites: ['Distributivité simple', 'Nombres relatifs', 'Réduire une expression'], language: 'fr', version: 1, contentType: 'original', sources: [EDUSCOL],
    questions: [
      q('Développe (x + 3)(x − 2).', ['x² + x − 6', 'x² − x − 6', 'x² + 5x − 6', 'x² − 6'], 0, 'Double distributivité : x² − 2x + 3x − 6 = x² + x − 6.'),
      q('Factorise x² − 9.', ['(x − 3)²', '(x − 3)(x + 3)', '(x − 9)(x + 1)', 'x(x − 9)'], 1, 'Différence de deux carrés : x² − 9 = (x − 3)(x + 3).'),
      q('Réduis 2x + 3x − x.', ['4x', '5x', '6x', '3x'], 0, '2 + 3 − 1 = 4, donc 4x.'),
      q('Développe −2(x − 5).', ['−2x − 10', '−2x + 10', '2x − 10', '−2x − 5'], 1, '−2 × x = −2x et −2 × (−5) = +10.'),
    ],
  },
  {
    subject: 'maths', countryCode: 'FR', level: 'college', grade: '3eme',
    title: '3ème · Théorème de Thalès', chapter: 'Géométrie — Thalès', difficulty: 'hard',
    description: 'Configurations de Thalès et calcul de longueurs dans un triangle.',
    objectives: ['Reconnaître une configuration de Thalès', 'Calculer une longueur avec l’égalité de Thalès'],
    prerequisites: ['Théorème de Pythagore', 'Proportionnalité', 'Droites parallèles'], language: 'fr', version: 1, contentType: 'original', sources: [EDUSCOL],
    questions: [
      q('Que permet de calculer le théorème de Thalès ?', ['Des longueurs avec des droites parallèles coupées par deux sécantes', 'Des angles', 'L’aire d’un disque', 'Des volumes'], 0, 'Thalès relie des longueurs dès qu’il y a des droites parallèles.'),
      q('Si (BC) ∥ (DE), laquelle de ces égalités est correcte ?', ['AB/AD = AC/AE = BC/DE', 'AB/AD = DE/BC', 'AB × AD = AC × AE', 'AB + AD = AC + AE'], 0, 'Les rapports de longueurs correspondants sont égaux.'),
      q('Quelle condition est indispensable pour appliquer Thalès ?', ['Deux droites parallèles', 'Un triangle rectangle', 'Un cercle', 'Un angle droit'], 0, 'Sans droites parallèles, Thalès ne s’applique pas.'),
    ],
  },
  {
    subject: 'maths', countryCode: 'FR', level: 'college', grade: '3eme',
    title: '3ème · Fractions, puissances et racines', chapter: 'Nombres et calculs — fractions et puissances', difficulty: 'hard',
    description: 'Calculer avec des fractions, des puissances et des racines carrées — prolongement du travail de 6ème.',
    objectives: ['Multiplier et diviser des fractions', 'Calculer avec des puissances', 'Simplifier une racine carrée simple'],
    prerequisites: ['fractions simples (6ème)', 'Nombres relatifs', 'Carrés parfaits'], language: 'fr', version: 1, contentType: 'original', sources: [EDUSCOL],
    questions: [
      q('2/3 × 3/4 = ?', ['1/2', '6/7', '5/12', '2/4'], 0, '(2×3)/(3×4) = 6/12 = 1/2.'),
      q('10³ = ?', ['30', '100', '1000', '300'], 2, '10³ = 10 × 10 × 10 = 1000.'),
      q('√25 = ?', ['5', '12,5', '625', '2,5'], 0, '5 × 5 = 25, donc √25 = 5.'),
      q('2⁻² = ?', ['4', '−4', '1/4', '−1/4'], 2, 'a⁻ⁿ = 1/aⁿ, donc 2⁻² = 1/4.'),
    ],
  },
  {
    subject: 'francais', countryCode: 'FR', level: 'college', grade: '3eme',
    title: '3ème · Les propositions subordonnées', chapter: 'Grammaire — phrase complexe', difficulty: 'hard',
    description: 'Distinguer subordonnée relative et conjonctive, et identifier leur rôle.',
    objectives: ['Identifier une proposition subordonnée', 'Distinguer relative et conjonctive'],
    prerequisites: ['Phrase simple et phrase complexe', 'Propositions indépendantes', 'Classes de mots'], language: 'fr', version: 1, contentType: 'original', sources: [EDUSCOL],
    questions: [
      q('Dans « Je pense qu’il viendra », la subordonnée est :', ['« qu’il viendra »', '« Je pense »', '« il viendra »', 'aucune'], 0, 'La subordonnée est introduite par « que » et complète « penser ».'),
      q('Une proposition subordonnée relative est introduite par :', ['un pronom relatif (qui, que, dont…)', 'une conjonction de coordination', 'un adverbe de temps', 'un déterminant'], 0, 'Le pronom relatif introduit la relative et reprend l’antécédent.'),
      q('Nature de « que » dans « Je sais qu’il part » ?', ['Pronom relatif', 'Conjonction de subordination', 'Adverbe', 'Préposition'], 1, 'Ici « que » introduit une complétive : c’est une conjonction de subordination.'),
    ],
  },
  {
    subject: 'francais', countryCode: 'FR', level: 'college', grade: '3eme',
    title: '3ème · Brevet : compréhension et argumentation', chapter: 'Brevet — méthode de l’épreuve', difficulty: 'hard',
    description: 'Exercices originaux inspirés du format du Brevet (compréhension, lexique, argumentation).',
    objectives: ['Construire une réponse argumentée', 'Repérer un champ lexical', 'Identifier un point de vue narratif'],
    prerequisites: ['Lire et comprendre un texte littéraire', 'Connaître les figures de style de base'], language: 'fr', version: 1, contentType: 'original', sources: [MINISTERE, EDUSCOL],
    questions: [
      q('Dans une réponse argumentée au Brevet, il faut :', ['une thèse, des arguments et des exemples du texte', 'seulement une opinion personnelle', 'recopier le texte', 'une liste de mots'], 0, 'On attend une thèse appuyée par des arguments et des exemples précis du texte.'),
      q('Un champ lexical est :', ['un ensemble de mots se rapportant à une même notion', 'une faute de grammaire', 'une figure de style', 'un type de phrase'], 0, 'Les mots d’un champ lexical renvoient à une même idée (ex. la peur).'),
      q('Le point de vue (focalisation) interne signifie :', ['on voit et sait ce que ressent un personnage', 'le narrateur sait tout', 'le narrateur ne sait rien', 'il n’y a pas de narrateur'], 0, 'La focalisation interne restreint l’information au point de vue d’un personnage.'),
      q('Ces exercices sont :', ['des sujets officiels du Brevet', 'des exercices originaux inspirés du format', 'des annales corrigées', 'une simulation notée'], 1, 'Il s’agit d’exercices originaux : ils ne remplacent pas les sujets officiels.'),
    ],
  },
];

export const GRADED_DECKS = [
  {
    subject: 'maths', countryCode: 'FR', level: 'college', grade: '6eme',
    deck: '6ème · Fractions simples', chapter: 'Nombres et calculs — fractions', difficulty: 'easy',
    objectives: ['Associer fraction et partage'], prerequisites: ['Nombres entiers'],
    language: 'fr', version: 1, contentType: 'original', sources: [EDUSCOL],
    cards: [
      ['Un demi', '1/2 : on partage en 2 parts égales et on en prend 1.'],
      ['Un quart', '1/4 : le tout partagé en 4 parts égales.'],
      ['3/4 de 20', '15 (20 ÷ 4 = 5, puis 5 × 3 = 15).'],
      ['Comparer 1/3 et 1/2', '1/3 < 1/2 : plus le dénominateur est grand, plus la part est petite.'],
    ],
  },
  {
    subject: 'francais', countryCode: 'FR', level: 'college', grade: '6eme',
    deck: '6ème · Classes de mots', chapter: 'Grammaire — nature des mots', difficulty: 'easy',
    objectives: ['Nommer la classe d’un mot'], prerequisites: ['Lire une phrase simple'],
    language: 'fr', version: 1, contentType: 'original', sources: [EDUSCOL],
    cards: [
      ['Adjectif', 'Mot qui qualifie le nom : « un petit chat ».'],
      ['Adverbe', 'Mot invariable qui modifie un verbe : « il court vite ».'],
      ['Déterminant', 'Mot placé devant le nom : le, la, un, mon…'],
      ['Verbe conjugué', 'Mot qui exprime l’action et change de forme : « il dort ».'],
      ['Conjonction de coordination', 'Mot qui relie deux éléments : mais, ou, et, donc, or, ni, car.'],
    ],
  },
  {
    subject: 'maths', countryCode: 'FR', level: 'college', grade: '3eme',
    deck: '3ème · Calcul littéral', chapter: 'Nombres et calculs — calcul littéral', difficulty: 'hard',
    objectives: ['Développer et factoriser'], prerequisites: ['Distributivité simple', 'Nombres relatifs'],
    language: 'fr', version: 1, contentType: 'original', sources: [EDUSCOL],
    cards: [
      ['(a + b)²', 'a² + 2ab + b² (identité remarquable).'],
      ['a² − b²', '(a − b)(a + b) — différence de deux carrés.'],
      ['Double distributivité', '(a + b)(c + d) = ac + ad + bc + bd.'],
      ['Réduire 5x − 2x + x', '4x : on additionne les coefficients des termes semblables.'],
    ],
  },
  {
    subject: 'francais', countryCode: 'FR', level: 'college', grade: '3eme',
    deck: '3ème · Propositions subordonnées', chapter: 'Grammaire — phrase complexe', difficulty: 'hard',
    objectives: ['Distinguer relative et conjonctive'], prerequisites: ['Phrase complexe'],
    language: 'fr', version: 1, contentType: 'original', sources: [EDUSCOL],
    cards: [
      ['Subordonnée relative', 'Introduite par un pronom relatif (qui, que, dont…) ; complète un nom.'],
      ['Subordonnée conjonctive', 'Introduite par « que » ; complète un verbe (complétive).'],
      ['Propositions relatives', '« Le livre que tu lis » : « que tu lis » est la relative.'],
      ['Différence clé', 'Relative = remplace/complète un nom ; conjonctive = complète un verbe.'],
      ['Test rapide', 'Si « que » reprend un nom → relative ; s’il introduit une complétive → conjonctive.'],
    ],
  },
];

export const CONTENT_STATUSES = ['draft', 'to_validate', 'published', 'archived'];
export const OFFICIAL_SOURCES = [EDUSCOL, MINISTERE];
