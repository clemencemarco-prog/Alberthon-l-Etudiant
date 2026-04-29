/**
 * Base de fausses réponses pour la démo Alberthon.
 * Détection par mots-clés -> sélectionne un scénario A / B / C / défaut.
 *
 * Chaque scénario contient :
 *   - reply : texte ORI affiché en effet machine à écrire
 *   - popups : liste de cartes à afficher (type, données)
 *
 * Types de popup supportés (cf. popups.js) :
 *   - 'job'      : fiche métier (titre + bullets + CTA "En savoir plus")
 *   - 'event'    : salon (titre + bullets + CTA "En savoir plus")
 *   - 'video'    : vidéo de pro (miniature rouge + titre + CTA "Regarder la vidéo")
 *   - 'article'  : article (titre + CTA "Lire l'article")
 * Toute carte peut porter `positive: true` + `badge: "Étiquette"` pour signaler
 * une suggestion d'élargissement d'horizon (badge orange).
 */

const FAKE_RESPONSES = {
    /* ============ SCENARIO A : DATA ============ */
    data: {
        keywords: ['data', 'données', 'donnees', 'data analyst', 'data scientist', 'analyste'],
        reply: "Excellente curiosité ! La data, c'est un secteur en pleine explosion avec des métiers très variés selon ton profil. Que tu sois plutôt analyse, ingénierie ou business, il y a forcément une voie pour toi. Voici quelques ressources pour explorer.",
        popups: [
            {
                type: 'job',
                kind: 'Fiche Métier',
                icon: '📊',
                title: 'Data Analyst',
                bullets: [
                    'Analyse et interprète des données complexes',
                    'Maîtrise SQL, Python, outils de visualisation (Tableau, Power BI)',
                    'Salaire moyen 38 000 à 45 000 €/an en début de carrière'
                ],
                cta: 'En savoir plus'
            },
            {
                type: 'event',
                kind: 'Salon de l\'Étudiant',
                icon: '📅',
                title: 'Salon de l\'Étudiant',
                bullets: [
                    'Rencontre 50+ écoles spécialisées en data',
                    'Conférences avec des pros de la data',
                    'Prochaines dates : Paris (mars), Lyon (avril)'
                ],
                cta: 'En savoir plus'
            },
            {
                type: 'video',
                kind: 'Vidéo de Pro',
                title: 'Découvre une journée type d\'un Data Analyst chez Decathlon',
                cta: 'Regarder la vidéo'
            },
            {
                type: 'article',
                kind: 'Article',
                icon: '📄',
                title: 'Quel Bac et quelle prépa pour travailler dans la data ?',
                cta: 'Lire l\'article'
            }
        ]
    },

    /* ============ SCENARIO B : MEDECINE + BUDGET ============ */
    medecine: {
        keywords: ['médecine', 'medecine', 'médecin', 'medecin', 'santé', 'sante'],
        // Mots-clés secondaires "budget" : déclenche le biais positif
        secondary: ['cher', 'payer', 'argent', 'bourse', 'parents', 'modeste', 'coût', 'cout', 'financier'],
        reply: "La médecine, ça se fait pas qu'à Paris ! Et il y a plein de dispositifs pour les étudiants boursiers. Voici des pistes que beaucoup ignorent.",
        popups: [
            {
                type: 'job',
                kind: 'Fiche Métier',
                icon: '📊',
                title: 'Médecin généraliste',
                bullets: [
                    'Voie PASS (Parcours Accès Santé Spécifique) ou LAS',
                    '9 à 11 ans d\'études après le bac',
                    'Forte demande, surtout en zones sous-dotées'
                ],
                cta: 'En savoir plus'
            },
            {
                type: 'article',
                kind: 'Article',
                icon: '📄',
                title: 'PASS en région : 15 facs où étudier médecine moins cher qu\'à Paris',
                positive: true,
                badge: 'Alternative géographique',
                cta: 'Lire l\'article'
            },
            {
                type: 'article',
                kind: 'Article',
                icon: '📄',
                title: 'Bourses CROUS pour études de santé : jusqu\'à 6 000 €/an',
                positive: true,
                badge: 'Alternative financière',
                cta: 'Lire l\'article'
            },
            {
                type: 'video',
                kind: 'Vidéo de Pro',
                title: 'J\'ai quitté Paris pour faire médecine à Reims, voici pourquoi',
                cta: 'Regarder la vidéo'
            }
        ]
    },

    /* ============ SCENARIO C : INGENIEUR ============ */
    ingenieur: {
        keywords: ['ingénieur', 'ingenieur', 'ingé', 'inge', 'prépa', 'prepa', 'école d\'ingé', 'ecole d\'inge'],
        reply: "Bonne nouvelle : la prépa n'est plus la seule voie ! Les écoles d'ingénieur post-bac et l'alternance se développent fortement, avec d'excellents débouchés.",
        popups: [
            {
                type: 'article',
                kind: 'Article',
                icon: '📄',
                title: 'Les écoles d\'ingé post-bac : INSA, UT, Polytech et les autres',
                cta: 'Lire l\'article'
            },
            {
                type: 'job',
                kind: 'Fiche Métier',
                icon: '📊',
                title: 'Ingénieur en développement logiciel',
                bullets: [
                    'Conçoit et développe des applications',
                    'Salaire débutant : 38 000 à 50 000 €/an',
                    'Très forte demande, métier en tension'
                ],
                cta: 'En savoir plus'
            },
            {
                type: 'article',
                kind: 'Article',
                icon: '📄',
                title: 'L\'alternance en école d\'ingé : la voie qui change tout',
                positive: true,
                badge: 'Voie alternative',
                cta: 'Lire l\'article'
            },
            {
                type: 'video',
                kind: 'Vidéo de Pro',
                title: 'Ingénieur sans prépa : mon parcours en alternance',
                cta: 'Regarder la vidéo'
            }
        ]
    },

    /* ============ SCENARIO PAR DEFAUT ============ */
    default: {
        reply: "Pour mieux te conseiller, peux-tu me préciser : quel niveau d'études tu vises (Bac, Bac+2, Bac+3...) ou quel domaine t'intéresse ?",
        popups: []
    }
};

/**
 * Détecte le scénario à utiliser à partir d'une question utilisateur.
 * @param {string} question
 * @returns {{key:string, reply:string, popups:Array}}
 */
function pickScenario(question) {
    const q = (question || '').toLowerCase().trim();
    if (!q) return { key: 'default', ...FAKE_RESPONSES.default };

    const matches = (list) => list.some(kw => q.includes(kw.toLowerCase()));

    // Ordre de priorité : medecine > data > ingenieur (medecine/budget est très spécifique)
    if (matches(FAKE_RESPONSES.medecine.keywords)) {
        // Variante budget : si pas de mot "budget" on garde quand même le scénario médecine
        return { key: 'medecine', ...FAKE_RESPONSES.medecine };
    }
    if (matches(FAKE_RESPONSES.data.keywords)) {
        return { key: 'data', ...FAKE_RESPONSES.data };
    }
    if (matches(FAKE_RESPONSES.ingenieur.keywords)) {
        return { key: 'ingenieur', ...FAKE_RESPONSES.ingenieur };
    }
    return { key: 'default', ...FAKE_RESPONSES.default };
}

window.FAKE_RESPONSES = FAKE_RESPONSES;
window.pickScenario = pickScenario;
