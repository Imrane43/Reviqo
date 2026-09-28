// Additional seed content: extra quizzes (French-heavy) and flashcard decks.
// Kept separate from db.js so the content grows without bloating the schema code.

function q(text, options, answer, explanation) {
  return { text, options, answer, explanation };
}

export const EXTRA_QUIZZES = [
  // ---------------- FRANÇAIS ----------------
  {
    subject: 'francais', title: 'Conjugaison : le présent de l’indicatif', difficulty: 'easy', questions: [
      q('« Nous (finir) nos devoirs. » Choisis la bonne forme.', ['finissons', 'finons', 'finissions', 'finons'], 0, 'Les verbes du 2e groupe font -issons au présent : nous finissons.'),
      q('« Ils (aller) au collège. » ', ['allons', 'allez', 'vont', 'va'], 2, 'Aller est irrégulier : ils vont.'),
      q('« Je (être) prêt. »', ['suis', 'es', 'est', 'sont'], 0, 'Être : je suis, tu es, il est.'),
      q('« Vous (prendre) le train. »', ['prendons', 'prenez', 'prendez', 'prends'], 1, 'Prendre : vous prenez.'),
      q('« Elle (pouvoir) venir. »', ['peut', 'peux', 'pouvons', 'peuvent'], 0, 'Pouvoir : je peux, tu peux, il/elle peut.'),
    ],
  },
  {
    subject: 'francais', title: 'Le passé composé', difficulty: 'medium', questions: [
      q('Quel auxiliaire utilise-t-on pour « aller » au passé composé ?', ['avoir', 'être', 'faire', 'aucun'], 1, 'Aller se conjugue avec être : je suis allé(e).'),
      q('« J’(manger) une pomme. »', ['ai mangé', 'suis mangé', 'avais mangé', 'mangeais'], 0, 'Manger se conjugue avec avoir : j’ai mangé.'),
      q('Accord : « Elle est (partir). »', ['parti', 'partie', 'partis', 'parties'], 1, 'Avec être, le participe s’accorde avec le sujet : parties → partie.'),
      q('« Nous (voir) ce film. »', ['avons vu', 'sommes vus', 'avons voir', 'voyons'], 0, 'Voir se conjugue avec avoir : nous avons vu.'),
    ],
  },
  {
    subject: 'francais', title: 'Orthographe : les homophones', difficulty: 'easy', questions: [
      q('Il __ un chat. (avoir)', ['a', 'à', 'as', 'ah'], 0, '« a » est le verbe avoir ; « à » est une préposition.'),
      q('Je vais __ Paris.', ['a', 'à', 'as', 'ha'], 1, 'On écrit « à » quand on peut remplacer par « dans » ou « vers ».'),
      q('__ vas-tu ?', ['Ou', 'Où', 'Oux', 'Oùx'], 1, '« Où » marque le lieu ; « ou » marque le choix.'),
      q('Ils __ partis.', ['son', 'sont', 's’ont', 'sons'], 1, '« sont » est le verbe être ; « son » est un déterminant possessif.'),
      q('Prends __ manteau.', ['son', 'sont', 's’on', 'sons'], 0, '« son » = son propre manteau (possession).'),
    ],
  },
  {
    subject: 'francais', title: 'Les figures de style', difficulty: 'medium', questions: [
      q('« Je meurs de faim » est :', ['une métaphore', 'une hyperbole', 'une comparaison', 'un euphémisme'], 1, 'L’hyperbole exagère volontairement.'),
      q('« Il est fort comme un lion » est :', ['une métaphore', 'une comparaison', 'une métonymie', 'une anaphore'], 1, 'La comparaison utilise un outil : « comme ».'),
      q('« Cette femme est un soleil » est :', ['une métaphore', 'une comparaison', 'une litote', 'une anaphore'], 0, 'La métaphore rapproche deux réalités sans outil de comparaison.'),
      q('« Va, je ne te hais point » (Corneille) est :', ['une hyperbole', 'une litote', 'une antiphrase', 'une gradation'], 1, 'La litote dit moins pour suggérer plus.'),
      q('Répétition d’un mot en début de phrase :', ['anaphore', 'chiasme', 'oxymore', 'zeugme'], 0, 'L’anaphore répète un mot en tête de vers ou de phrase.'),
    ],
  },
  {
    subject: 'francais', title: 'Les grands auteurs français', difficulty: 'medium', questions: [
      q('Qui a écrit « Le Rouge et le Noir » ?', ['Stendhal', 'Balzac', 'Flaubert', 'Zola'], 0, 'Stendhal publie Le Rouge et le Noir en 1830.'),
      q('Qui a écrit « Madame Bovary » ?', ['Gustave Flaubert', 'Victor Hugo', 'Baudelaire', 'Lamartine'], 0, 'Madame Bovary paraît en 1857.'),
      q('Qui a écrit « Les Fleurs du mal » ?', ['Rimbaud', 'Verlaine', 'Baudelaire', 'Mallarmé'], 2, 'Charles Baudelaire publie Les Fleurs du mal en 1857.'),
      q('Qui a écrit « L’Étranger » ?', ['Albert Camus', 'Jean-Paul Sartre', 'André Gide', 'Marcel Proust'], 0, 'L’Étranger paraît en 1942.'),
      q('Molière est célèbre pour :', ['ses romans', 'ses pièces de théâtre', 'sa poésie', 'ses essais'], 1, 'Molière est un dramaturge (L’Avare, Le Malade imaginaire…).'),
    ],
  },
  {
    subject: 'francais', title: 'Accord du participe passé', difficulty: 'hard', questions: [
      q('« Les lettres que j’ai (écrire). »', ['écrit', 'écrite', 'écrits', 'écrites'], 3, 'Le COD « les lettres » est placé avant : accord au féminin pluriel.'),
      q('« Elle a (manger) une pizza. »', ['mangé', 'mangée', 'mangés', 'mangées'], 0, 'Le COD suit le verbe : pas d’accord.'),
      q('« Ils se sont (parler). » (verbe réciproque, COD « se »)', ['parlé', 'parlés', 'parlée', 'parlées'], 0, 'Ici « se » est COI : pas d’accord.'),
      q('« Les fleurs sont (fleurir). »', ['fleuri', 'fleurie', 'fleuris', 'fleuries'], 3, 'Avec être, le participe s’accorde avec le sujet féminin pluriel.'),
    ],
  },
  {
    subject: 'francais', title: 'Le subjonctif', difficulty: 'hard', questions: [
      q('« Il faut que tu (être) à l’heure. »', ['es', 'sois', 'seras', 'serais'], 1, 'Après « il faut que », on emploie le subjonctif : que tu sois.'),
      q('« Je veux qu’il (faire) ses devoirs. »', ['fait', 'fasse', 'fera', 'ferait'], 1, 'Le subjonctif de faire : que je fasse.'),
      q('Après « bien que », on utilise :', ['l’indicatif', 'le subjonctif', 'le conditionnel', 'l’infinitif'], 1, '« Bien que » introduit le subjonctif.'),
      q('« Qu’il (venir) demain ! »', ['vient', 'vienne', 'viendra', 'viendrait'], 1, 'L’ordre (impératif) au subjonctif : qu’il vienne.'),
    ],
  },
  {
    subject: 'francais', title: 'Les temps du récit', difficulty: 'medium', questions: [
      q('Quel temps exprime une action de fond, qui dure ?', ['passé simple', 'imparfait', 'passé composé', 'futur'], 1, 'L’imparfait décrit le décor et les actions en cours.'),
      q('Quel temps exprime une action ponctuelle dans un récit écrit ?', ['imparfait', 'passé simple', 'présent', 'conditionnel'], 1, 'Le passé simple marque les actions de premier plan.'),
      q('« Il marchait quand soudain il tomba. » Quel temps est « tomba » ?', ['imparfait', 'passé simple', 'passé composé', 'plus-que-parfait'], 1, 'Passé simple : action brève et achevée.'),
      q('Comment appelle-t-on le cas où différents temps de verbes sont mélangés de façon incohérente ?', ['une concordance', 'un anachronisme', 'une incohérence temporelle', 'une ellipse'], 2, 'On parle d’incohérence (ou rupture) temporelle.'),
    ],
  },
  {
    subject: 'francais', title: 'Versification et poésie', difficulty: 'medium', questions: [
      q('Combien de syllabes dans un alexandrin ?', ['10', '12', '8', '14'], 1, 'L’alexandrin compte 12 syllabes.'),
      q('Une rime entre « lumière » et « terre » est :', ['riche', 'suffisante', 'pauvre', 'plate'], 2, 'La rime pauvre ne réunit qu’un seul son.'),
      q('Un sonnet compte :', ['10 vers', '14 vers', '16 vers', '12 vers'], 1, 'Le sonnet : 2 quatrains + 2 tercets = 14 vers.'),
      q('Quand la phrase déborde d’un vers sur le suivant, c’est :', ['une césure', 'un enjambement', 'une diérèse', 'une rime'], 1, 'L’enjambement continue la phrase au vers suivant.'),
    ],
  },
  {
    subject: 'francais', title: 'Registres de langue', difficulty: 'easy', questions: [
      q('« Ouais, c’est cool » appartient au registre :', ['soutenu', 'courant', 'familier', 'poétique'], 2, 'Le registre familier est relâché et oral.'),
      q('« Je vais me sustenter » est de registre :', ['familier', 'courant', 'soutenu', 'vulgaire'], 2, 'Le registre soutenu emploie un vocabulaire recherché.'),
      q('Quel registre utilise-t-on à l’écrit formel ?', ['familier', 'soutenu', 'argotique', 'oral'], 1, 'Un écrit formel utilise le registre soutenu.'),
    ],
  },
  {
    subject: 'francais', title: 'Lexique : synonymes et antonymes', difficulty: 'easy', questions: [
      q('Un synonyme de « heureux » ?', ['triste', 'content', 'fatigué', 'furieux'], 1, 'Content est un synonyme de heureux (joie).'),
      q('L’antonyme de « généreux » ?', ['avare', 'doux', 'riche', 'aimable'], 0, 'Avare s’oppose à généreux.'),
      q('L’antonyme de « courageux » ?', ['vaillant', 'lâche', 'fort', 'sage'], 1, 'Lâche s’oppose à courageux.'),
      q('Un synonyme de « éphémère » ?', ['durable', 'fugace', 'éternel', 'solide'], 1, 'Fugace signifie qui dure très peu de temps.'),
    ],
  },
  {
    subject: 'francais', title: 'Analyse : narration et point de vue', difficulty: 'hard', isPremium: 1, questions: [
      q('Un narrateur qui dit « je » est :', ['omniscient', 'personnage', 'externe', 'objectif'], 1, 'Le narrateur interne (homodiégétique) raconte sa propre histoire.'),
      q('Le narrateur omniscient :', ['sait tout', 'ne sait rien', 'est un personnage', 'est absent'], 0, 'Il connaît les pensées de tous les personnages.'),
      q('Le point de vue externe :', ['entre dans les pensées', 'décrit seulement les faits visibles', 'est toujours au « je »', 'est omniscient'], 1, 'Le narrateur externe observe de l’extérieur, sans pensées.'),
      q('« Il était une fois » indique :', ['un récit réaliste', 'un conte', 'une autobiographie', 'un dialogue'], 1, 'C’est une formule d’ouverture du conte.'),
    ],
  },

  // ---------------- MATHÉMATIQUES ----------------
  {
    subject: 'maths', title: 'Fractions et nombres rationnels', difficulty: 'easy', questions: [
      q('1/2 + 1/4 = ?', ['2/6', '3/4', '2/4', '1/6'], 1, '1/2 = 2/4, donc 2/4 + 1/4 = 3/4.'),
      q('Simplifie 12/18.', ['2/3', '3/4', '6/9', '1/2'], 0, '12 et 18 divisibles par 6 : 12/18 = 2/3.'),
      q('2/5 de 30 = ?', ['12', '10', '15', '6'], 0, '30 ÷ 5 = 6, × 2 = 12.'),
      q('Quelle fraction est la plus grande ?', ['3/7', '2/5', '1/2', '4/9'], 2, '1/2 = 0,5 ; les autres sont inférieures à 0,5.'),
    ],
  },
  {
    subject: 'maths', title: 'Pourcentages et proportions', difficulty: 'easy', questions: [
      q('20 % de 250 = ?', ['40', '50', '25', '20'], 1, '250 × 0,20 = 50.'),
      q('Un article de 80 € augmente de 25 %. Nouveau prix ?', ['100 €', '105 €', '95 €', '110 €'], 0, '80 × 1,25 = 100 €.'),
      q('Un prix baisse de 50 % puis remonte de 50 %. On revient au prix initial ?', ['oui', 'non, il est plus bas', 'non, il est plus haut', 'cela dépend'], 1, 'Multiplier par 0,5 puis 1,5 donne ×0,75 : le prix a baissé.'),
      q('15 % de 200 = ?', ['30', '15', '45', '20'], 0, '200 × 0,15 = 30.'),
    ],
  },
  {
    subject: 'maths', title: 'Théorèmes de Pythagore et Thalès', difficulty: 'medium', questions: [
      q('Dans un triangle rectangle, le théorème de Pythagore dit :', ['a+b=c', 'a²+b²=c²', 'a²−b²=c²', 'a×b=c'], 1, 'Le carré de l’hypoténuse égale la somme des carrés des autres côtés.'),
      q('Côtés 3 et 4 : hypoténuse ?', ['5', '6', '7', '12'], 0, '3²+4² = 9+16 = 25, racine = 5.'),
      q('Le théorème de Thalès sert à :', ['calculer une aire', 'calculer des longueurs avec des droites parallèles', 'résoudre une équation', 'tracer un cercle'], 1, 'Il s’applique à des droites parallèles coupées par des sécantes.'),
      q('Un triangle 6-8-10 est :', ['isocèle', 'rectangle', 'équilatéral', 'quelconque'], 1, '6²+8² = 36+64 = 100 = 10².'),
    ],
  },
  {
    subject: 'maths', title: 'Fonctions affines et linéaires', difficulty: 'medium', questions: [
      q('Une fonction affine s’écrit :', ['f(x)=ax+b', 'f(x)=ax²', 'f(x)=a/x', 'f(x)=√x'], 0, 'La forme affine est ax + b.'),
      q('Pour f(x) = 3x + 2, f(4) = ?', ['12', '14', '10', '18'], 1, '3×4 + 2 = 14.'),
      q('Dans f(x) = ax + b, a représente :', ['l’ordonnée à l’origine', 'le coefficient directeur', 'la racine', 'l’image'], 1, '« a » est la pente (coefficient directeur).'),
      q('Une fonction linéaire passe par :', ['(0;b)', 'l’origine (0;0)', 'toujours (1;1)', 'nulle part'], 1, 'Une fonction linéaire (b=0) passe par l’origine.'),
    ],
  },
  {
    subject: 'maths', title: 'Statistiques et probabilités', difficulty: 'medium', questions: [
      q('La médiane d’une série est :', ['la plus fréquente', 'la valeur du milieu', 'la moyenne', 'l’étendue'], 1, 'Elle partage la série en deux moitiés.'),
      q('La probabilité d’obtenir pile avec une pièce équilibrée est :', ['0', '1/2', '1', '1/4'], 1, 'Deux issues équiprobables.'),
      q('La moyenne de 4, 8, 12 est :', ['8', '6', '10', '24'], 0, '(4+8+12)/3 = 8.'),
      q('L’étendue d’une série est :', ['max − min', 'la moyenne', 'la médiane', 'la somme'], 0, 'L’étendue = valeur maximale − valeur minimale.'),
    ],
  },

  // ---------------- ANGLAIS ----------------
  {
    subject: 'anglais', title: 'Irregular verbs', difficulty: 'easy', questions: [
      q('Past of "to see"', ['saw', 'seen', 'seed', 'sawed'], 0, 'See → saw (simple past) → seen (past participle).'),
      q('Past participle of "to write"', ['wrote', 'writed', 'written', 'writing'], 2, 'Write → wrote → written.'),
      q('Past of "to take"', ['taked', 'took', 'taken', 'tooken'], 1, 'Take → took → taken.'),
      q('Past participle of "to break"', ['broke', 'breaked', 'broken', 'breaking'], 2, 'Break → broke → broken.'),
    ],
  },
  {
    subject: 'anglais', title: 'Tenses: present & past', difficulty: 'medium', questions: [
      q('"She ___ to school every day."', ['go', 'goes', 'going', 'gone'], 1, 'Third person singular adds -s: she goes.'),
      q('"They ___ TV when I arrived."', ['watch', 'watched', 'were watching', 'watches'], 2, 'Past continuous for an action in progress.'),
      q('"I ___ never been to London."', ['has', 'have', 'had', 'am'], 1, 'Present perfect: I have never been.'),
      q('"If it rains, I ___ at home."', ['stay', 'will stay', 'stayed', 'staying'], 1, 'First conditional: if + present, will + verb.'),
    ],
  },
  {
    subject: 'anglais', title: 'Vocabulary: school & daily life', difficulty: 'easy', questions: [
      q('"Homework" means:', ['les devoirs', 'la maison', 'le travail à l’école', 'le ménage'], 0, 'Homework = devoirs.'),
      q('"Breakfast" is eaten:', ['in the evening', 'in the morning', 'at night', 'at noon'], 1, 'Breakfast = petit-déjeuner, le matin.'),
      q('"Library" is a place to:', ['buy food', 'borrow books', 'play sports', 'sleep'], 1, 'A library is where you borrow books.'),
      q('"Cheap" is the opposite of:', ['small', 'expensive', 'fast', 'easy'], 1, 'Cheap ↔ expensive.'),
    ],
  },

  // ---------------- HISTOIRE ----------------
  {
    subject: 'histoire', title: 'La Première Guerre mondiale', difficulty: 'medium', questions: [
      q('En quelle année débute la Première Guerre mondiale ?', ['1912', '1914', '1918', '1920'], 1, 'Elle débute en 1914.'),
      q('Quel événement déclenche le conflit ?', ['la Révolution russe', 'l’attentat de Sarajevo', 'la chute du mur', 'Waterloo'], 1, 'L’attentat de Sarajevo (28 juin 1914) déclenche l’engrenage.'),
      q('En quelle année prend-elle fin ?', ['1917', '1918', '1919', '1921'], 1, 'L’armistice est signé le 11 novembre 1918.'),
      q('Quel traité met fin à la guerre en 1919 ?', ['traité de Versailles', 'traité de Rome', 'traité de Vienne', 'traité de Berlin'], 0, 'Le traité de Versailles est signé en 1919.'),
    ],
  },
  {
    subject: 'histoire', title: 'La Seconde Guerre mondiale', difficulty: 'medium', questions: [
      q('En quelle année débute la Seconde Guerre mondiale ?', ['1937', '1939', '1941', '1945'], 1, 'Elle débute en 1939.'),
      q('Qui dirige l’Allemagne nazie ?', ['Mussolini', 'Hitler', 'Staline', 'Franco'], 1, 'Adolf Hitler dirige l’Allemagne nazie.'),
      q('En quelle année a lieu le Débarquement en Normandie ?', ['1943', '1944', '1945', '1942'], 1, 'Le 6 juin 1944.'),
      q('La Shoah désigne :', ['une bataille', 'le génocide des Juifs', 'un traité', 'une alliance'], 1, 'La Shoah est le génocide des Juifs d’Europe.'),
    ],
  },
  {
    subject: 'histoire', title: 'Antiquité : Grèce et Rome', difficulty: 'easy', questions: [
      q('La démocratie naît dans quelle cité grecque ?', ['Sparte', 'Athènes', 'Rome', 'Thèbes'], 1, 'Athènes invente la démocratie vers le Ve siècle av. J.-C.'),
      q('Qui était Jules César ?', ['un roi grec', 'un général romain', 'un philosophe', 'un empereur chinois'], 1, 'Jules César était un général et homme d’État romain.'),
      q('La citoyenneté romaine était :', ['accordée à tous', 'réservée à certains', 'interdite', 'héréditaire seulement'], 1, 'Elle était limitée puis progressivement étendue.'),
    ],
  },
  {
    subject: 'histoire', title: 'Le Moyen Âge', difficulty: 'easy', questions: [
      q('La féodalité repose sur :', ['la démocratie', 'la hiérarchie et l’hommage', 'le commerce', 'l’écriture'], 1, 'Seigneurs et vassaux sont liés par des obligations.'),
      q('Qui couronne Charlemagne en 800 ?', ['le roi de France', 'le pape', 'l’empereur byzantin', 'un évêque anglais'], 1, 'Le pape Léon III le couronne empereur en 800.'),
      q('Les croisades visent à :', ['conquérir l’Amérique', 'reprendre Jérusalem', 'découvrir l’Afrique', 'unifier l’Europe'], 1, 'Elles visent la Terre sainte / Jérusalem.'),
    ],
  },

  // ---------------- GÉOGRAPHIE ----------------
  {
    subject: 'geographie', title: 'Climats et zones climatiques', difficulty: 'easy', questions: [
      q('Le climat méditerranéen se caractérise par :', ['des hivers froids et secs', 'des étés chauds et secs', 'des pluies constantes', 'un froid polaire'], 1, 'Étés chauds et secs, hivers doux et humides.'),
      q('La zone intertropicale est :', ['froide', 'chaude et humide', 'sèche toute l’année', 'tempérée'], 1, 'Elle est chaude avec de fortes précipitations.'),
      q('Le climat océanique est marqué par :', ['de faibles amplitudes', 'de fortes amplitudes', 'l’aridité', 'la mousson'], 0, 'L’océan adoucit les températures.'),
    ],
  },
  {
    subject: 'geographie', title: 'Mondialisation et échanges', difficulty: 'medium', questions: [
      q('La mondialisation désigne :', ['la fermeture des frontières', 'l’intensification des échanges mondiaux', 'une guerre', 'un traité'], 1, 'C’est la mise en relation croissante des territoires.'),
      q('Les principaux pôles de la mondialisation sont :', ['les déserts', 'les métropoles et façades maritimes', 'les montagnes', 'les campagnes isolées'], 1, 'Les métropoles et littoraux concentrent les échanges.'),
      q('Un pays émergent :', ['est sans industrie', 'connaît une croissance rapide', 'a une économie figée', 'n’échange pas'], 1, 'Croissance forte et intégration progressive à l’économie mondiale.'),
    ],
  },

  // ---------------- PHYSIQUE / CHIMIE ----------------
  {
    subject: 'physique', title: 'Forces et mouvement', difficulty: 'medium', questions: [
      q('L’unité de la force est :', ['le joule', 'le newton', 'le watt', 'l’ampère'], 1, 'La force se mesure en newtons (N).'),
      q('La gravité terrestre vaut environ :', ['9,8 N/kg', '3,6 N/kg', '100 N/kg', '0,5 N/kg'], 0, 'g ≈ 9,8 N/kg à la surface de la Terre.'),
      q('Deux forces opposées de même intensité :', ['s’annulent', 's’additionnent', 'se multiplient', 'disparaissent'], 0, 'Leur somme vectorielle est nulle.'),
    ],
  },
  {
    subject: 'physique', title: 'Lumière et optique', difficulty: 'medium', questions: [
      q('La vitesse de la lumière dans le vide est :', ['300 000 km/s', '340 m/s', '1 000 km/s', '30 000 km/s'], 0, 'Environ 300 000 km/s (3×10⁸ m/s).'),
      q('Un miroir plan donne une image :', ['renversée', 'symétrique', 'toujours floue', 'agrandie'], 1, 'L’image est symétrique par rapport au miroir.'),
      q('La lumière blanche se décompose avec :', ['un prisme', 'un aimant', 'une balance', 'un volcan'], 0, 'Un prisme décompose la lumière blanche (arc-en-ciel).'),
    ],
  },
  {
    subject: 'chimie', title: 'Atomes et tableau périodique', difficulty: 'medium', questions: [
      q('Le symbole de l’oxygène est :', ['Ox', 'O', 'Og', 'Xy'], 1, 'Oxygène = O.'),
      q('Un atome est composé de :', ['protéons et électrons', 'protons, neutrons et électrons', 'molécules', 'ions seulement'], 1, 'Noyau (protons + neutrons) et électrons.'),
      q('Le symbole de l’or est :', ['Go', 'Or', 'Au', 'Ag'], 2, 'Or = Au (du latin aurum).'),
      q('Le numéro atomique indique :', ['le nombre de neutrons', 'le nombre de protons', 'la masse', 'les électrons libres'], 1, 'Z = nombre de protons.'),
    ],
  },
  {
    subject: 'chimie', title: 'Réactions chimiques', difficulty: 'medium', questions: [
      q('Une réaction chimique :', ['crée la matière', 'transforme des réactifs en produits', 'ne change rien', 'détruit les atomes'], 1, 'Les réactifs se transforment en produits.'),
      q('L’équation 2H₂ + O₂ → 2H₂O est :', ['non équilibrée', 'équilibrée', 'impossible', 'incomplète'], 1, 'Autant d’atomes de chaque côté : équilibrée.'),
      q('Un catalyseur :', ['ralentit', 'accélère une réaction', 'est un produit', 'est un atome'], 1, 'Il accélère sans être consommé.'),
    ],
  },

  // ---------------- BIOLOGIE ----------------
  {
    subject: 'biologie', title: 'Génétique et hérédité', difficulty: 'medium', questions: [
      q('L’ADN est contenu dans :', ['le noyau', 'la membrane', 'le cytoplasme', 'la vacuole'], 0, 'L’ADN est dans le noyau des cellules eucaryotes.'),
      q('Un gène porte :', ['des lipides', 'une information héréditaire', 'de l’eau', 'des sels'], 1, 'Un gène est une séquence d’ADN porteuse d’information.'),
      q('Les chromosomes humains sont au nombre de :', ['23', '46', '48', '92'], 1, '23 paires, soit 46 chromosomes.'),
      q('Un allèle dominant :', ['s’exprime toujours', 'ne s’exprime jamais', 's’exprime parfois', 'n’existe pas'], 0, 'L’allèle dominant s’exprime s’il est présent.'),
    ],
  },
  {
    subject: 'biologie', title: 'Le corps humain : digestion et respiration', difficulty: 'easy', questions: [
      q('Où commence la digestion ?', ['dans l’estomac', 'dans la bouche', 'dans l’intestin', 'dans le foie'], 1, 'Elle commence dans la bouche (mastication, salive).'),
      q('Les alvéoles pulmonaires servent à :', ['filtrer le sang', 'échanger les gaz', 'digérer', 'stocker l’air'], 1, 'Échanges gazeux O₂ / CO₂.'),
      q('L’intestin grêle absorbe :', ['l’air', 'les nutriments', 'les déchets', 'l’eau seulement'], 1, 'Il absorbe les nutriments.'),
    ],
  },
  {
    subject: 'biologie', title: 'Écosystèmes et biodiversité', difficulty: 'easy', questions: [
      q('Un écosystème comprend :', ['seulement des animaux', 'un milieu et ses êtres vivants', 'seulement des plantes', 'un climat'], 1, 'Biotope + biocénose.'),
      q('Un producteur primaire est :', ['un herbivore', 'un végétal chlorophyllien', 'un carnivore', 'un champignon'], 1, 'Il produit de la matière organique par photosynthèse.'),
      q('La biodiversité désigne :', ['une espèce', 'la variété du vivant', 'un climat', 'un sol'], 1, 'La diversité des espèces, gènes et écosystèmes.'),
    ],
  },

  // ---------------- PHILOSOPHIE / INFO / CULTURE ----------------
  {
    subject: 'philosophie', title: 'Notions de philosophie', difficulty: 'hard', questions: [
      q('« Cogito ergo sum » est de :', ['Platon', 'Descartes', 'Kant', 'Nietzsche'], 1, 'Descartes : « Je pense donc je suis ».'),
      q('La liberté, pour Sartre, c’est :', ['ne rien faire', 'une responsabilité', 'une illusion', 'obéir'], 1, 'Nous sommes « condamnés à être libres » et responsables.'),
      q('L’éthique étudie :', ['les astres', 'les normes du bien et du mal', 'la matière', 'les nombres'], 1, 'L’éthique interroge les valeurs et la conduite.'),
    ],
  },
  {
    subject: 'informatique', title: 'Algorithmes et données', difficulty: 'medium', questions: [
      q('Un algorithme est :', ['un matériel', 'une suite d’instructions', 'un virus', 'un fichier'], 1, 'Une suite finie d’instructions pour résoudre un problème.'),
      q('Un tableau (array) sert à :', ['stocker une collection', 'dessiner', 'imprimer', 'réseauter'], 0, 'Il stocke plusieurs valeurs indexées.'),
      q('La complexité O(n) signifie :', ['temps constant', 'temps proportionnel à n', 'temps quadratique', 'temps nul'], 1, 'Le temps croît linéairement avec n.'),
      q('En binaire, 1010 vaut :', ['8', '10', '12', '20'], 1, '1×8 + 0×4 + 1×2 + 0×1 = 10.'),
    ],
  },
  {
    subject: 'culture', title: 'Arts, sport et culture générale', difficulty: 'easy', questions: [
      q('Qui a peint la Joconde ?', ['Michel-Ange', 'Léonard de Vinci', 'Raphaël', 'Picasso'], 1, 'La Joconde est de Léonard de Vinci.'),
      q('Combien de joueurs dans une équipe de football sur le terrain ?', ['9', '10', '11', '12'], 2, 'Onze joueurs par équipe.'),
      q('La Tour Eiffel a été construite pour :', ['une guerre', 'l’Exposition universelle de 1889', 'un mariage', 'un film'], 1, 'Pour l’Exposition universelle de 1889.'),
      q('Combien de continents ?', ['5', '6', '7', '8'], 2, 'Généralement 7 continents.'),
    ],
  },
];

// Flashcard decks: [front, back] pairs per subject.
export const FLASHCARD_DECKS = [
  {
    subject: 'francais', deck: 'Français — bases', cards: [
      ['Hyperbole', 'Figure de style qui exagère (ex. « je meurs de faim »).'],
      ['Litote', 'Dire moins pour suggérer plus (ex. « je ne te hais point »).'],
      ['Anaphore', 'Répétition d’un mot en début de phrase ou de vers.'],
      ['Passé simple', 'Temps du récit écrit pour les actions ponctuelles.'],
      ['Imparfait', 'Temps du décor et des actions qui durent.'],
      ['COD', 'Complément d’objet direct : répond à « qui ? quoi ? ».'],
      ['Subjonctif', 'Mode employé après « il faut que », « bien que ».'],
      ['Alexandrin', 'Vers de 12 syllabes.'],
      ['Antonyme', 'Mot de sens contraire.'],
      ['Registre soutenu', 'Vocabulaire recherché, adapté à l’écrit formel.'],
    ],
  },
  {
    subject: 'maths', deck: 'Maths — formules clés', cards: [
      ['Théorème de Pythagore', 'Dans un triangle rectangle : a² + b² = c².'],
      ['Fonction affine', 'f(x) = ax + b.'],
      ['Coefficient directeur', 'La pente « a » dans f(x) = ax + b.'],
      ['Aire du disque', 'π × r².'],
      ['Périmètre du cercle', '2 × π × r.'],
      ['Probabilité', 'Nombre de cas favorables ÷ nombre de cas possibles.'],
      ['Médiane', 'Valeur du milieu d’une série ordonnée.'],
      ['Étendue', 'Valeur maximale − valeur minimale.'],
      ['Volume du cylindre', 'π × r² × h.'],
      ['Pourcentage', 'Proportion pour cent (ex. 20 % = 20/100 = 0,2).'],
    ],
  },
  {
    subject: 'anglais', deck: 'English — essentials', cards: [
      ['to go', 'go / went / gone (aller).'],
      ['to write', 'write / wrote / written (écrire).'],
      ['Present perfect', 'have/has + past participle (I have seen).'],
      ['First conditional', 'If + present simple, will + base verb.'],
      ['Since', 'Depuis (point de départ).'],
      ['For', 'Pendant (durée).'],
      ['Although', 'Bien que.'],
      ['Expensive', 'Cher (≠ cheap).'],
      ['Homework', 'Les devoirs.'],
      ['Library', 'La bibliothèque.'],
    ],
  },
  {
    subject: 'histoire', deck: 'Histoire — repères', cards: [
      ['1789', 'Début de la Révolution française.'],
      ['14 juillet 1789', 'Prise de la Bastille.'],
      ['1914-1918', 'Première Guerre mondiale.'],
      ['11 novembre 1918', 'Armistice de la Première Guerre mondiale.'],
      ['1939-1945', 'Seconde Guerre mondiale.'],
      ['6 juin 1944', 'Débarquement de Normandie.'],
      ['800', 'Couronnement de Charlemagne.'],
      ['Athènes', 'Berceau de la démocratie.'],
      ['Traité de Versailles', 'Traité de 1919 mettant fin à la Première Guerre mondiale.'],
      ['Shoah', 'Génocide des Juifs d’Europe pendant la Seconde Guerre mondiale.'],
    ],
  },
  {
    subject: 'geographie', deck: 'Géographie — notions', cards: [
      ['Climat méditerranéen', 'Étés chauds et secs, hivers doux et humides.'],
      ['Climat océanique', 'Faibles amplitudes thermiques, pluies fréquentes.'],
      ['Mondialisation', 'Intensification des échanges à l’échelle mondiale.'],
      ['Métropole', 'Grande ville qui concentre les fonctions de commandement.'],
      ['Pays émergent', 'Pays à forte croissance économique récente.'],
      ['Densité de population', 'Nombre d’habitants par km².'],
      ['Biodiversité', 'Variété du vivant (espèces, gènes, écosystèmes).'],
      ['Développement durable', 'Développement qui répond aux besoins du présent sans compromettre l’avenir.'],
    ],
  },
  {
    subject: 'physique', deck: 'Physique — essentiels', cards: [
      ['Force', 'Grandeur en newtons (N), modélisée par un vecteur.'],
      ['g (gravité)', '≈ 9,8 N/kg à la surface de la Terre.'],
      ['Vitesse de la lumière', '≈ 300 000 km/s dans le vide.'],
      ['Loi d’Ohm', 'U = R × I.'],
      ['Énergie cinétique', 'Ec = ½ m v².'],
      ['Puissance', 'P = U × I (en watts).'],
      ['Prisme', 'Décompose la lumière blanche.'],
      ['Masse volumique', 'ρ = m / V.'],
    ],
  },
  {
    subject: 'chimie', deck: 'Chimie — essentiels', cards: [
      ['Atome', 'Noyau (protons + neutrons) et électrons.'],
      ['Numéro atomique Z', 'Nombre de protons d’un atome.'],
      ['Symbole de l’or', 'Au.'],
      ['Symbole de l’oxygène', 'O.'],
      ['Réaction chimique', 'Transformation des réactifs en produits.'],
      ['Catalyseur', 'Accélère une réaction sans être consommé.'],
      ['Mélange homogène', 'Composants non distinguables à l’œil nu.'],
      ['Ion', 'Atome ayant gagné ou perdu des électrons.'],
    ],
  },
  {
    subject: 'biologie', deck: 'Biologie — essentiels', cards: [
      ['ADN', 'Molécule porteuse de l’information génétique, dans le noyau.'],
      ['Chromosomes humains', '46 (23 paires).'],
      ['Photosynthèse', 'Les plantes produisent de la matière organique grâce à la lumière.'],
      ['Alvéoles pulmonaires', 'Lieu des échanges gazeux O₂ / CO₂.'],
      ['Intestin grêle', 'Absorbe les nutriments.'],
      ['Allèle dominant', 'S’exprime toujours lorsqu’il est présent.'],
      ['Écosystème', 'Un milieu (biotope) et ses êtres vivants (biocénose).'],
      ['Biodiversité', 'Variété des espèces, des gènes et des écosystèmes.'],
    ],
  },
  {
    subject: 'philosophie', deck: 'Philosophie — repères', cards: [
      ['Cogito ergo sum', 'Descartes : « Je pense donc je suis ».'],
      ['Liberté (Sartre)', 'Nous sommes condamnés à être libres et responsables.'],
      ['Éthique', 'Réflexion sur les normes du bien et du mal.'],
      ['Raison', 'Faculté de penser et de juger logiquement.'],
      ['Socrate', 'Philosophe grec, méthode de la maïeutique.'],
      ['Empirisme', 'La connaissance vient de l’expérience sensible.'],
    ],
  },
  {
    subject: 'informatique', deck: 'Informatique — bases', cards: [
      ['Algorithme', 'Suite finie d’instructions pour résoudre un problème.'],
      ['Tableau (array)', 'Structure stockant plusieurs valeurs indexées.'],
      ['Complexité O(n)', 'Temps d’exécution proportionnel à la taille n.'],
      ['Binaire 1010', 'Vaut 10 en décimal.'],
      ['Variable', 'Espace nommé qui stocke une valeur.'],
      ['Boucle for', 'Répète un bloc un nombre de fois donné.'],
      ['Bug', 'Erreur dans un programme.'],
    ],
  },
  {
    subject: 'culture', deck: 'Culture générale', cards: [
      ['La Joconde', 'Tableau de Léonard de Vinci.'],
      ['Tour Eiffel', 'Construite pour l’Exposition universelle de 1889.'],
      ['Football', '11 joueurs par équipe sur le terrain.'],
      ['Continents', '7 continents généralement reconnus.'],
      ['Baudelaire', 'Auteur des Fleurs du mal (1857).'],
      ['Victor Hugo', 'Auteur des Misérables (1862).'],
    ],
  },
];
