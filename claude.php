<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/deadlines.php';

/**
 * Wrapper Claude API en cURL natif (sans SDK Anthropic, sans Composer).
 *
 * Une seule fonction publique : claude_chat($messages, $profile)
 *  - construit le system prompt (avec injection profil étudiant si fourni)
 *  - POST https://api.anthropic.com/v1/messages
 *  - parse le JSON renvoyé par Claude
 *  - filtre défensivement les popups (whitelist URLs)
 */

const CLAUDE_API_URL     = 'https://api.anthropic.com/v1/messages';
const CLAUDE_API_VERSION = '2023-06-01';
const CLAUDE_MODEL       = 'claude-opus-4-7';

/**
 * Whitelist élargie de sources de confiance pour le recoupement journalistique.
 * Organisée en 4 catégories : éditorial, officiel, statistiques, médias.
 *
 * Si Anthropic ne peut pas crawler un domaine (paywall ou robots.txt), il sera
 * silencieusement ignoré côté API — pas grave, on garde la liste large pour
 * que Claude puisse choisir.
 */
const TRUSTED_DOMAINS = [
    // --- Éditorial L'Étudiant + alliés
    'letudiant.fr',
    'diplomeo.com',
    'orientation.com',

    // --- Sources officielles France
    'onisep.fr',
    'francetravail.fr',
    'service-public.fr',
    'etudiant.gouv.fr',
    'parcoursup.gouv.fr',
    'monmaster.gouv.fr',
    'eduscol.education.fr',
    'enseignementsup-recherche.gouv.fr',
    'campusfrance.org',

    // --- Statistiques et études
    'apec.fr',
    'cidj.com',
    'insee.fr',

    // NB : studyrama.com, lemonde.fr, lefigaro.fr et lesechos.fr ont été retirés
    // car le crawler Anthropic n'y a pas accès (robots.txt / paywall) et l'API
    // renvoie une 400 invalid_request_error si on les met dans allowed_domains.
];

const ORI_SYSTEM_PROMPT_CORE = <<<'PROMPT'
Tu es ORI, l'assistant d'orientation officiel de L'Etudiant. Tu fonctionnes selon une éthique journalistique : croisement des sources, sourcing transparent, biais éditorial assumé pour la mobilité sociale.

Tu réponds aux étudiants français (études, métiers, écoles, financement, vie étudiante). Ton chaleureux, accessible, tutoiement systématique. Tu retiens le prénom et le contexte (niveau, filière, projet, contraintes, goûts, géographie) que l'étudiant te confie et tu personnalises toutes tes réponses suivantes.

═══════════════════════════════════════════════════════════════
DÉCIDE D'ABORD : faut-il lancer web_search ?
═══════════════════════════════════════════════════════════════

NE PAS lancer (réponds directement, popups: []) :
- Salutations, présentation, remerciements, clarifications conversationnelles
- Échanges émotionnels (rassure, pose une question pour comprendre)

LANCER web_search (jusqu'à 2 recherches) — chaque fois qu'il faut :
- Information factuelle sur un métier, une filière, une école, une formation
- Question Parcoursup / Mon Master / CROUS / démarches administratives
- Question financement (bourses, alternance, prêts)
- Salons, événements, dates, calendrier
- Comparaison entre formations / régions / écoles
- Conseils lecture, témoignages, podcasts d'orientation

═══════════════════════════════════════════════════════════════
SOURCES AUTORISÉES (whitelist élargie)
═══════════════════════════════════════════════════════════════

Tu peux chercher sur ces 14 domaines de confiance :
- ÉDITORIAL : letudiant.fr (prioritaire), diplomeo.com, orientation.com
- OFFICIEL : onisep.fr, francetravail.fr, service-public.fr, etudiant.gouv.fr, parcoursup.gouv.fr, monmaster.gouv.fr, eduscol.education.fr, enseignementsup-recherche.gouv.fr, campusfrance.org
- STATS : apec.fr, cidj.com, insee.fr

PRIVILÉGIE TOUJOURS letudiant.fr d'abord. Pour chiffres/salaires/débouchés : APEC ou France Travail. Pour démarches : sources officielles .gouv.fr.

═══════════════════════════════════════════════════════════════
FORMAT JSON OBLIGATOIRE (rien d'autre)
═══════════════════════════════════════════════════════════════

{
  "answer": "Réponse 3-5 phrases, chaleureuse, tutoiement, personnalisée.",
  "popups": [
    {
      "type": "fiche_metier",
      "title": "Titre EXACT de la page",
      "content": ["puce 1", "puce 2", "puce 3"],
      "url": "URL EXACTE issue de web_search",
      "source": "Nom lisible (ex: letudiant.fr, ONISEP, APEC)",
      "is_biais_positif": false,
      "label": null,
      "cross_check": "verifie"
    }
  ]
}

═══════════════════════════════════════════════════════════════
TYPES DE POPUPS (6 disponibles, varie-les !)
═══════════════════════════════════════════════════════════════

- "fiche_metier" : fiche d'un métier (compétences, salaire, formations) — content : 2-3 puces concises
- "article" : article éditorial, dossier, guide pratique — content : []
- "video_pro" : vidéo (témoignage, présentation métier) — content : []
- "salon" : événement physique (date, lieu, participants) — content : 2-3 puces
- "formation" : cursus précis (école, durée, sélection) — content : 2-3 puces
- "livre" : conseil lecture (essai, biographie, guide orientation) — content : 2-3 puces (résumé + pourquoi pertinent)

DIVERSITÉ : sur 3-4 popups, vise 2-3 types DIFFÉRENTS. Ne renvoie pas QUE des fiches métiers.

═══════════════════════════════════════════════════════════════
PERSONNALISATION FORTE (utilise le PROFIL ÉTUDIANT s'il est fourni)
═══════════════════════════════════════════════════════════════

Si profil disponible :
- NIVEAU : adapte la difficulté (Terminale ≠ Master). Pas de thèses pour un lycéen.
- FILIÈRE/SPÉCIALITÉS : oriente les suggestions vers les métiers/voies cohérents
- PROJET : si "précis", concentre-toi dessus. Si "flou", élargis.
- CONTRAINTES : pousse les biais positifs adaptés (financier → bourses/régions, géo → fac proche, première génération → témoignages d'élèves comme l'étudiant)
- GOÛTS : prioris les popups en lien avec ses centres d'intérêt

═══════════════════════════════════════════════════════════════
RECOUPEMENT JOURNALISTIQUE (clé éditoriale)
═══════════════════════════════════════════════════════════════

Pour chaque popup, évalue le champ "cross_check" :
- "verifie" : tu as croisé l'info sur AU MOINS 2 sources de la whitelist (ex: ONISEP confirme un salaire que letudiant.fr donne aussi)
- "source_unique" : info pertinente mais issue d'une seule source

Vise idéalement 60% de popups "verifie".

═══════════════════════════════════════════════════════════════
MISSION BIAIS POSITIF (cœur éditorial L'Étudiant)
═══════════════════════════════════════════════════════════════

Au moins 1 popup sur les 3-4 doit avoir is_biais_positif=true, avec un label parmi :
- "Alternative géographique" (étudier en région, fac de province)
- "Alternative financière" (bourses, alternance, dispositifs locaux)
- "Voie alternative" (post-bac sans prépa, BUT, BTS+licence pro, apprentissage)
- "Métier adjacent" (métier proche moins connu)

Si l'étudiant a des contraintes explicites (budget serré, première génération, peur de la prépa, zone rurale), pousse 2 popups biais positif sur 4.

═══════════════════════════════════════════════════════════════
RÈGLES DE FORMAT STRICTES
═══════════════════════════════════════════════════════════════

- 3 à 5 popups quand tu as fait des recherches (pas moins de 3 sauf cas extrême)
- Tableau VIDE [] si pas de web_search
- "url" et "title" : OBLIGATOIREMENT issus d'un résultat web_search réel — JAMAIS d'invention
- "label" : null si is_biais_positif=false ; sinon une des 4 valeurs autorisées
- "cross_check" : toujours "verifie" ou "source_unique"
- JSON pur, pas de Markdown, pas de texte avant/après
PROMPT;

// =============================================================================
// API publique
// =============================================================================

/**
 * Appelle Claude. Renvoie ['answer', 'popups', 'search_count', 'stop_reason'].
 * Throws RuntimeException sur erreur réseau ou API.
 *
 * @param array $messages          historique conversationnel
 * @param array|null $profile      profil étudiant (niveau, contraintes, goûts…)
 * @param string|null $dashboardCtx synthèse du tableau de bord (pistes, deadlines, docs)
 */
function claude_chat(array $messages, ?array $profile = null, ?string $dashboardCtx = null): array
{
    if (CLAUDE_API_KEY === '') {
        throw new RuntimeException('CLAUDE_API_KEY absente — vérifie .env');
    }
    if (empty($messages)) {
        throw new RuntimeException('Aucun message à envoyer.');
    }

    $systemPrompt = build_system_prompt($profile, $dashboardCtx);

    $body = [
        'model'      => CLAUDE_MODEL,
        'max_tokens' => 8192,  // bumped depuis 4096 : laisser de la marge pour les longues réponses
        'system'     => [[
            'type'          => 'text',
            'text'          => $systemPrompt,
            'cache_control' => ['type' => 'ephemeral'],
        ]],
        'thinking'      => ['type' => 'adaptive'],
        'output_config' => ['effort' => 'medium'],
        'tools'         => [[
            'type'            => 'web_search_20260209',
            'name'            => 'web_search',
            'allowed_domains' => TRUSTED_DOMAINS,
            // max_uses: 2 → permet à Claude de croiser sa première recherche
            // avec une seconde sur un autre angle (recoupement journalistique).
            'max_uses'        => 2,
        ]],
        'messages' => $messages,
    ];

    $ch = curl_init(CLAUDE_API_URL);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($body, JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'x-api-key: ' . CLAUDE_API_KEY,
            'anthropic-version: ' . CLAUDE_API_VERSION,
        ],
        CURLOPT_TIMEOUT        => 120,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);

    $resp     = curl_exec($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    if ($resp === false || $resp === '') {
        throw new RuntimeException('Erreur cURL Claude : ' . $curlErr);
    }
    if ($httpCode !== 200) {
        throw new RuntimeException('Claude HTTP ' . $httpCode . ' : ' . $resp);
    }

    $data = json_decode($resp, true);
    if (!is_array($data) || !isset($data['content']) || !is_array($data['content'])) {
        throw new RuntimeException('Réponse Claude invalide.');
    }

    // Récupère le DERNIER bloc text + compte les recherches web
    $finalText   = '';
    $searchCount = 0;
    foreach ($data['content'] as $block) {
        if (!is_array($block)) continue;
        $type = $block['type'] ?? null;
        if ($type === 'text' && isset($block['text']) && is_string($block['text'])) {
            $finalText = $block['text'];
        } elseif ($type === 'server_tool_use' && ($block['name'] ?? null) === 'web_search') {
            $searchCount++;
        }
    }

    $parsed = parse_claude_json($finalText);

    return [
        'answer'       => $parsed['answer'],
        'popups'       => $parsed['popups'],
        'search_count' => $searchCount,
        'stop_reason'  => $data['stop_reason'] ?? null,
    ];
}

// =============================================================================
// EXTRACTION pour le tableau de bord
// =============================================================================

const CLAUDE_EXTRACT_MODEL = 'claude-sonnet-4-6';

/**
 * Extrait des données structurées d'un échange de chat pour pré-remplir
 * la modale "Sauvegarder dans mon tableau de bord".
 *
 * Renvoie : ['suggested_piste' => {titre, description}|null,
 *            'suggested_actions' => [...],
 *            'suggested_documents' => [...]]
 */
function claude_extract_from_chat(array $chatMessages, string $lastAssistantMessage): array
{
    if (CLAUDE_API_KEY === '') {
        throw new RuntimeException('CLAUDE_API_KEY absente');
    }

    $deadlinesText = known_deadlines_for_prompt();

    $systemPrompt = <<<PROMPT
Tu es un assistant d'extraction qui transforme une conversation d'orientation en éléments structurés à sauvegarder dans le tableau de bord d'un étudiant.

Tu réponds STRICTEMENT en JSON, sans aucun texte avant/après, sans bloc Markdown.

Format attendu :
{
  "suggested_piste": {
    "titre": "5-10 mots accrocheurs résumant la piste",
    "description": "1-2 phrases qui expliquent ce qui se joue dans cette piste"
  },
  "suggested_actions": [
    {
      "titre": "Action concrète à faire",
      "date_echeance": "YYYY-MM-DD ou null si inconnue",
      "url_externe": "URL officielle ou null",
      "auto_generated": true
    }
  ],
  "suggested_documents": [
    {
      "titre": "Document à préparer",
      "categorie": "dossier_scolaire|lettre_motivation|justificatif|formulaire|autre",
      "auto_generated": true
    }
  ]
}

DEADLINES OFFICIELLES CONNUES (utilise ces dates exactement si pertinentes) :
$deadlinesText

Si la piste mentionne Parcoursup, CROUS/bourse, Mon Master, écoles post-bac, alternance, prépa : utilise les dates officielles ci-dessus.
Pour les écoles privées ou concours spécifiques : si tu connais la deadline officielle, utilise-la. Sinon, mets `date_echeance: null`.

Si la conversation ne propose RIEN de concret à sauvegarder, renvoie :
{"suggested_piste": null, "suggested_actions": [], "suggested_documents": []}

Génère 1 à 4 actions et 2 à 6 documents adaptés à la piste. Les documents doivent être réalistes et concrets (ex: "Bulletins de 1ère et Terminale", "Lettre de motivation projet santé", "Avis fiscal des parents").

RIEN d'autre que le JSON.
PROMPT;

    // On envoie un contexte minimal : les 4 derniers tours + la réponse à analyser
    $contextSnippet = '';
    $tail = array_slice($chatMessages, -4);
    foreach ($tail as $m) {
        if (!is_array($m)) continue;
        $role = $m['role'] ?? '';
        $content = isset($m['content']) ? mb_substr((string)$m['content'], 0, 600) : '';
        $contextSnippet .= "[$role] $content\n";
    }
    $userMessage = "Conversation récente :\n$contextSnippet\n";
    $userMessage .= "Dernière réponse d'ORI à analyser en priorité :\n" . $lastAssistantMessage;

    $body = [
        'model'      => CLAUDE_EXTRACT_MODEL,
        'max_tokens' => 1500,
        'system'     => $systemPrompt,
        'messages'   => [['role' => 'user', 'content' => $userMessage]],
    ];

    $ch = curl_init(CLAUDE_API_URL);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($body, JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'x-api-key: ' . CLAUDE_API_KEY,
            'anthropic-version: ' . CLAUDE_API_VERSION,
        ],
        CURLOPT_TIMEOUT        => 60,
        CURLOPT_CONNECTTIMEOUT => 10,
    ]);
    $resp     = curl_exec($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err      = curl_error($ch);
    curl_close($ch);

    if ($resp === false || $resp === '') {
        throw new RuntimeException('cURL Claude extract: ' . $err);
    }
    if ($httpCode !== 200) {
        throw new RuntimeException("Claude extract HTTP $httpCode: $resp");
    }

    $data = json_decode($resp, true);
    if (!is_array($data) || empty($data['content'])) {
        return ['suggested_piste' => null, 'suggested_actions' => [], 'suggested_documents' => []];
    }
    $finalText = '';
    foreach ($data['content'] as $block) {
        if (is_array($block) && ($block['type'] ?? null) === 'text') {
            $finalText = $block['text'] ?? '';
        }
    }
    return parse_extract_json($finalText);
}

// =============================================================================
// COMPARAISON INTERACTIVE (Module 3 — comparer 2-3 options recommandées)
// =============================================================================

/**
 * Compare 2 ou 3 options proposées dans le chat (formations, métiers, écoles…)
 * et renvoie un tableau structuré avec critères + synthèse personnalisée.
 *
 * @param array      $options  Liste de 2 à 3 popups : [{type, title, url, source}]
 * @param array|null $profile  Profil étudiant pour personnaliser la synthèse
 * @return array     ['criteria' => [{label, values[]}], 'synthesis' => string]
 */
function claude_compare(array $options, ?array $profile = null): array
{
    if (CLAUDE_API_KEY === '') {
        throw new RuntimeException('CLAUDE_API_KEY absente');
    }
    $n = count($options);
    if ($n < 2 || $n > 3) {
        throw new RuntimeException('Il faut 2 ou 3 options à comparer.');
    }

    // Sérialise les options pour Claude
    $optionsText = '';
    foreach ($options as $i => $opt) {
        if (!is_array($opt)) continue;
        $idx = $i + 1;
        $optionsText .= "OPTION $idx :\n";
        $optionsText .= "- Type : "   . ($opt['type']   ?? 'inconnu') . "\n";
        $optionsText .= "- Titre : "  . ($opt['title']  ?? '') . "\n";
        if (!empty($opt['context'])) {
            $optionsText .= "- Contexte : " . trim((string)$opt['context']) . "\n";
        }
        if (!empty($opt['source'])) {
            $optionsText .= "- Source : " . $opt['source'] . "\n";
        }
        if (!empty($opt['url'])) {
            $optionsText .= "- URL : " . $opt['url'] . "\n";
        }
        $optionsText .= "\n";
    }

    $profileText = '';
    if (is_array($profile)) {
        $bits = [];
        if (!empty($profile['niveau']))      $bits[] = 'Niveau : ' . $profile['niveau'];
        if (!empty($profile['filiere']))     $bits[] = 'Filière : ' . $profile['filiere'];
        if (!empty($profile['projet_type'])) $bits[] = 'Projet : ' . $profile['projet_type'];
        if (!empty($profile['contraintes']) && is_array($profile['contraintes'])) {
            $bits[] = 'Contraintes : ' . implode(', ', $profile['contraintes']);
        }
        if (!empty($profile['gouts']) && is_array($profile['gouts'])) {
            $bits[] = 'Goûts : ' . implode(', ', $profile['gouts']);
        }
        if ($bits) $profileText = "\n\nPROFIL DE L'ÉTUDIANT :\n" . implode("\n", $bits);
    }

    $systemPrompt = <<<'PROMPT'
Tu es ORI, l'assistant orientation L'Etudiant. Tu compares 2 ou 3 options (formations, écoles, métiers, livres, salons) de manière structurée pour aider un étudiant à décider.

Tu RÉPONDS STRICTEMENT EN JSON (rien d'autre, pas de Markdown, pas de texte avant/après) :
{
  "criteria": [
    { "label": "Durée",          "values": ["...", "...", "..."] },
    { "label": "Sélectivité",    "values": ["...", "...", "..."] },
    { "label": "Coût annuel",    "values": ["...", "...", "..."] },
    { "label": "Format",         "values": ["...", "...", "..."] },
    { "label": "Débouchés",      "values": ["...", "...", "..."] },
    { "label": "Salaire début",  "values": ["...", "...", "..."] },
    { "label": "Atout principal","values": ["...", "...", "..."] },
    { "label": "Limite à savoir","values": ["...", "...", "..."] }
  ],
  "synthesis": "Synthèse de 3-4 phrases adressée à l'étudiant en 'tu'. Si profil fourni, utilise-le. Indique vers quelle option ORI penche et POURQUOI."
}

RÈGLES STRICTES :
- 5 à 8 critères maximum, dans l'ordre suggéré ci-dessus quand c'est pertinent
- "values" doit avoir EXACTEMENT autant d'éléments que d'options (2 ou 3)
- Chaque cellule : 3 à 10 mots, concrète et chiffrée si possible
- Info inconnue ou non applicable : mets "—" (tiret cadratin)
- Vérifie les chiffres avec web_search sur les sources de confiance (letudiant.fr, onisep.fr, francetravail.fr…)
- La synthèse doit RECOMMANDER, pas juste résumer. Si options équivalentes, donne un critère discriminant
- Ne survends jamais une option, sois honnête sur les limites
- Si une option est un livre ou un salon, adapte les critères (durée de lecture, date du salon, etc.)
PROMPT;

    $userMessage = "Voici les options à comparer :\n\n" . $optionsText . $profileText
        . "\n\nIMPORTANT : ta réponse doit être UNIQUEMENT du JSON valide, "
        . "commençant par { et finissant par }. Aucun texte avant ou après. "
        . "Pas de Markdown, pas de ```json, juste le JSON pur.";

    $body = [
        'model'      => CLAUDE_MODEL,
        'max_tokens' => 8192, // marge confortable : thinking adaptive + tableau + synthèse
        'system'     => [[
            'type'          => 'text',
            'text'          => $systemPrompt,
            'cache_control' => ['type' => 'ephemeral'],
        ]],
        'thinking' => ['type' => 'adaptive'],
        'tools' => [[
            'type'            => 'web_search_20260209',
            'name'            => 'web_search',
            'allowed_domains' => TRUSTED_DOMAINS,
            'max_uses'        => 3,
        ]],
        'messages' => [['role' => 'user', 'content' => $userMessage]],
    ];

    $ch = curl_init(CLAUDE_API_URL);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($body, JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'x-api-key: ' . CLAUDE_API_KEY,
            'anthropic-version: ' . CLAUDE_API_VERSION,
        ],
        CURLOPT_TIMEOUT        => 120,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);
    $resp     = curl_exec($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err      = curl_error($ch);
    curl_close($ch);

    if ($resp === false || $resp === '') {
        throw new RuntimeException('cURL Claude compare: ' . $err);
    }
    if ($httpCode !== 200) {
        throw new RuntimeException("Claude compare HTTP $httpCode: $resp");
    }

    $data = json_decode($resp, true);
    if (!is_array($data) || empty($data['content'])) {
        throw new RuntimeException('Réponse Claude compare invalide.');
    }

    $finalText = '';
    foreach ($data['content'] as $block) {
        if (is_array($block) && ($block['type'] ?? null) === 'text') {
            $finalText = $block['text'] ?? '';
        }
    }

    return parse_compare_json($finalText, $n);
}

function parse_compare_json(string $rawText, int $expectedColumns): array
{
    $cleaned = trim($rawText);

    // 1. Strip ```json...``` éventuels
    if (preg_match('/^```(?:json)?\s*\n?(.*?)\n?```$/s', $cleaned, $m)) {
        $cleaned = trim($m[1]);
    }

    // 2. Cherche le 1er '{' pour démarrer le JSON
    $brace = strpos($cleaned, '{');
    if ($brace === false) {
        // Pas de JSON du tout → log + fallback gracieux (utilise le texte brut comme synthèse)
        error_log('[ORI] compare: pas de { dans la réponse Claude. Texte brut: ' . substr($rawText, 0, 500));
        return [
            'criteria'  => [],
            'synthesis' => $rawText !== ''
                ? trim($rawText)
                : "ORI n'a pas réussi à structurer la comparaison. Réessaye dans un moment, ou reformule tes options.",
        ];
    }
    $cleaned = substr($cleaned, $brace);

    // 3. Tentative de décodage direct
    $data = json_decode($cleaned, true);

    // 4. Tentative en coupant après le dernier '}' si JSON tronqué
    if (!is_array($data)) {
        $lastBrace = strrpos($cleaned, '}');
        if ($lastBrace !== false) {
            $data = json_decode(substr($cleaned, 0, $lastBrace + 1), true);
        }
    }

    // 5. Si toujours pas parsable → log + fallback
    if (!is_array($data)) {
        error_log('[ORI] compare: JSON malformé. Texte brut: ' . substr($rawText, 0, 800));
        // Tentative regex pour récupérer au moins la synthèse
        $synthesis = '';
        if (preg_match('/"synthesis"\s*:\s*"((?:\\\\.|[^"\\\\])*)"/s', $cleaned, $sm)) {
            $synthesis = stripcslashes($sm[1]);
        }
        return [
            'criteria'  => [],
            'synthesis' => $synthesis !== ''
                ? $synthesis
                : "Désolé, le tableau n'a pas pu être structuré. Réessaye — Claude a parfois besoin de 2 tentatives pour ce type de requête.",
        ];
    }

    // 6. JSON ok : on extrait critères et synthèse
    $criteria = [];
    $rawCrit  = $data['criteria'] ?? [];
    if (is_array($rawCrit)) {
        foreach ($rawCrit as $c) {
            if (!is_array($c)) continue;
            $label = trim((string)($c['label'] ?? ''));
            if ($label === '') continue;
            $values = $c['values'] ?? [];
            if (!is_array($values)) continue;
            $values = array_slice(array_map(fn($v) => trim((string)$v), $values), 0, $expectedColumns);
            while (count($values) < $expectedColumns) $values[] = '—';
            $criteria[] = ['label' => $label, 'values' => $values];
        }
    }

    $synthesis = trim((string)($data['synthesis'] ?? ''));
    if ($synthesis === '') {
        $synthesis = 'Comparaison établie. À toi de voir laquelle correspond le mieux à ton projet.';
    }

    return [
        'criteria'  => $criteria,
        'synthesis' => $synthesis,
    ];
}

/**
 * Fallback ultime quand le JSON est cassé/tronqué :
 * extrait le champ "answer" via regex pour avoir au moins une réponse texte
 * propre à afficher, plutôt que balancer tout le JSON brut à l'utilisateur.
 */
function parse_answer_only_fallback(string $cleaned, string $rawText): array
{
    // Cherche "answer": "..." en gérant les guillemets échappés \"
    if (preg_match('/"answer"\s*:\s*"((?:\\\\.|[^"\\\\])*)"/s', $cleaned, $m)) {
        // Décode les échappements JSON courants : \" \\ \n \t \/ \uXXXX
        $answer = $m[1];
        $answer = preg_replace_callback(
            '/\\\\u([0-9a-fA-F]{4})/',
            fn($x) => mb_convert_encoding(pack('H*', $x[1]), 'UTF-8', 'UCS-2BE'),
            $answer
        );
        $answer = strtr($answer, [
            '\\"' => '"',
            '\\\\' => '\\',
            '\\n' => "\n",
            '\\t' => "\t",
            '\\r' => "\r",
            '\\/' => '/',
        ]);
        $answer = trim($answer);
        if ($answer !== '' && !looks_like_raw_json($answer)) {
            error_log('[ORI] JSON malformé, fallback regex sur answer (popups perdus)');
            return ['answer' => $answer, 'popups' => []];
        }
    }
    // Vraiment rien à extraire ou rawText ressemble à du JSON brut → message générique
    error_log('[ORI] Réponse non parseable, on renvoie un message générique. RawText: ' . substr($rawText, 0, 400));
    return [
        'answer' => "Désolé, j'ai eu un souci pour formuler ma réponse cette fois. "
                  . "Reformule ta question ou réessaye dans un instant — c'est généralement temporaire.",
        'popups' => [],
    ];
}

function parse_extract_json(string $rawText): array
{
    $cleaned = trim($rawText);
    if (preg_match('/^```(?:json)?\s*\n?(.*?)\n?```$/s', $cleaned, $m)) {
        $cleaned = trim($m[1]);
    }
    $brace = strpos($cleaned, '{');
    if ($brace === false) {
        return ['suggested_piste' => null, 'suggested_actions' => [], 'suggested_documents' => []];
    }
    $cleaned = substr($cleaned, $brace);
    $data = json_decode($cleaned, true);
    if (!is_array($data)) {
        $lastBrace = strrpos($cleaned, '}');
        if ($lastBrace !== false) {
            $data = json_decode(substr($cleaned, 0, $lastBrace + 1), true);
        }
    }
    if (!is_array($data)) {
        return ['suggested_piste' => null, 'suggested_actions' => [], 'suggested_documents' => []];
    }

    $piste = $data['suggested_piste'] ?? null;
    if (is_array($piste)) {
        $piste = [
            'titre'       => trim((string)($piste['titre'] ?? '')),
            'description' => trim((string)($piste['description'] ?? '')),
        ];
        if ($piste['titre'] === '') $piste = null;
    } else {
        $piste = null;
    }

    $validCats = ['dossier_scolaire', 'lettre_motivation', 'justificatif', 'formulaire', 'autre'];

    $actions = [];
    $rawActions = $data['suggested_actions'] ?? [];
    if (is_array($rawActions)) {
        foreach ($rawActions as $a) {
            if (!is_array($a)) continue;
            $titre = trim((string)($a['titre'] ?? ''));
            if ($titre === '') continue;
            $date = $a['date_echeance'] ?? null;
            if (is_string($date) && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) $date = null;
            $url = $a['url_externe'] ?? null;
            if (is_string($url) && !filter_var($url, FILTER_VALIDATE_URL)) $url = null;
            $actions[] = [
                'titre'          => $titre,
                'date_echeance'  => $date ?: null,
                'url_externe'    => $url ?: null,
                'auto_generated' => true,
            ];
        }
    }

    $documents = [];
    $rawDocs = $data['suggested_documents'] ?? [];
    if (is_array($rawDocs)) {
        foreach ($rawDocs as $d) {
            if (!is_array($d)) continue;
            $titre = trim((string)($d['titre'] ?? ''));
            if ($titre === '') continue;
            $cat = in_array($d['categorie'] ?? null, $validCats, true) ? $d['categorie'] : 'autre';
            $documents[] = [
                'titre'          => $titre,
                'categorie'      => $cat,
                'auto_generated' => true,
            ];
        }
    }

    return [
        'suggested_piste'     => $piste,
        'suggested_actions'   => $actions,
        'suggested_documents' => $documents,
    ];
}

// =============================================================================
// Internes (chat principal)
// =============================================================================

function build_system_prompt(?array $profile, ?string $dashboardCtx = null): string
{
    $base = ORI_SYSTEM_PROMPT_CORE;

    // ---- Injection profil
    if (is_array($profile)) {
        $sections = [];
        if (!empty($profile['niveau'])) {
            $detail = !empty($profile['niveau_detail']) ? ' (' . $profile['niveau_detail'] . ')' : '';
            $sections[] = '- Niveau scolaire : ' . $profile['niveau'] . $detail;
        }
        if (!empty($profile['filiere'])) {
            $sections[] = '- Filière : ' . $profile['filiere'];
        }
        if (!empty($profile['specialites']) && is_array($profile['specialites'])) {
            $sections[] = '- Spécialités : ' . implode(', ', $profile['specialites']);
        }
        if (!empty($profile['projet_type'])) {
            $focus = !empty($profile['projet_focus']) ? ' — ' . $profile['projet_focus'] : '';
            $sections[] = '- Projet : ' . $profile['projet_type'] . $focus;
        }
        if (!empty($profile['contraintes']) && is_array($profile['contraintes'])) {
            $sections[] = '- Contraintes : ' . implode(', ', $profile['contraintes']);
        }
        if (!empty($profile['gouts']) && is_array($profile['gouts'])) {
            $sections[] = '- Goûts/intérêts : ' . implode(', ', $profile['gouts']);
        }
        if (!empty($sections)) {
            $base .= "\n\n=== PROFIL DE L'ÉTUDIANT (à utiliser pour personnaliser) ===\n"
                . implode("\n", $sections)
                . "\n\nAdapte tes réponses à ce profil. Utilise son prénom si tu le connais. "
                . "Si l'étudiant a des contraintes financières ou est première génération, "
                . "pousse encore plus les biais positifs (alternatives géo / financières / voies non-classiques).";
        }
    }

    // ---- Injection synthèse dashboard
    if (is_string($dashboardCtx) && trim($dashboardCtx) !== '') {
        $base .= "\n\n=== TABLEAU DE BORD ACTUEL DE L'ÉTUDIANT ===\n"
            . $dashboardCtx
            . "\n\nL'étudiant a déjà sauvegardé ces éléments dans son tableau de bord. "
            . "Utilise activement ce contexte :\n"
            . "- Si une question est liée à une piste existante, fais-y référence explicitement (ex: « Pour ta piste \"X\"…»)\n"
            . "- Si une deadline approche, mentionne-la (ex: « N'oublie pas que tu as la confirmation Parcoursup le… »)\n"
            . "- Si un document est encore à préparer, rappelle-le subtilement quand c'est pertinent\n"
            . "- Si l'étudiant ajoute une nouvelle info qui complète ou contredit le dashboard, propose-lui de l'enregistrer\n"
            . "- Évite les redites : ne lui suggère pas de pistes/actions/documents qu'il a DÉJÀ dans son dashboard, propose-lui plutôt d'aller plus loin sur ce qu'il a déjà.";
    }

    return $base;
}

/**
 * Détecte si une chaîne est en fait du JSON brut (sortie Claude mal formatée).
 * Utilisé pour ne pas balancer du JSON dans la bulle de chat utilisateur.
 */
function looks_like_raw_json(string $text): bool
{
    $t = trim($text);
    if ($t === '') return false;
    // Démarre par { ou [ ou "
    if (preg_match('/^[{\[]/', $t)) return true;
    // Contient des marqueurs typiques de notre format de popups
    $markers = ['"popups"', '"is_biais_positif"', '"cross_check"', '"label":', '"answer":'];
    foreach ($markers as $m) {
        if (strpos($t, $m) !== false) return true;
    }
    return false;
}

function parse_claude_json(string $rawText): array
{
    $cleaned = trim($rawText);

    // Strip markdown code fences
    if (preg_match('/^```(?:json)?\s*\n?(.*?)\n?```$/s', $cleaned, $m)) {
        $cleaned = trim($m[1]);
    }

    $brace = strpos($cleaned, '{');
    if ($brace === false) {
        return ['answer' => $rawText, 'popups' => []];
    }
    $cleaned = substr($cleaned, $brace);

    // Tentative 1 : décodage direct
    $data = json_decode($cleaned, true);

    // Tentative 2 : trim ce qui suit le dernier `}`
    if (!is_array($data)) {
        $lastBrace = strrpos($cleaned, '}');
        if ($lastBrace !== false) {
            $data = json_decode(substr($cleaned, 0, $lastBrace + 1), true);
        }
    }

    // Tentative 3 (fallback) : si le JSON est cassé/tronqué, extraire au moins
    // le champ "answer" via regex pour ne pas balancer tout le JSON à l'écran.
    if (!is_array($data)) {
        return parse_answer_only_fallback($cleaned, $rawText);
    }

    $answer = $data['answer'] ?? null;
    if (!is_string($answer) || trim($answer) === '') {
        return parse_answer_only_fallback($cleaned, $rawText);
    }

    // Garde-fou paranoïde : si Claude s'est emmêlé et a mis du JSON brut DANS son
    // champ "answer" (markers de popups visibles), on neutralise pour ne pas dump
    // du JSON dans la bulle de chat.
    if (looks_like_raw_json($answer)) {
        error_log('[ORI] Answer contient du JSON brut, on neutralise: ' . substr($answer, 0, 300));
        $answer = "Désolé, j'ai eu un souci pour structurer ma réponse côté texte. "
                . "Les suggestions ci-contre sont valides, n'hésite pas à reformuler ta question pour avoir une réponse plus claire.";
    }

    $popupsRaw = $data['popups'] ?? [];
    if (!is_array($popupsRaw)) $popupsRaw = [];

    // Types élargis : ajout de "formation" et "livre"
    $validTypes  = ['fiche_metier', 'article', 'video_pro', 'salon', 'formation', 'livre'];
    $validLabels = [
        'Alternative géographique', 'Alternative financière',
        'Voie alternative', 'Métier adjacent',
    ];
    $validCrossCheck = ['verifie', 'source_unique'];

    $popups = [];
    foreach ($popupsRaw as $p) {
        if (!is_array($p)) continue;
        $type  = $p['type']  ?? null;
        $title = $p['title'] ?? null;
        $url   = $p['url']   ?? null;
        if (!in_array($type, $validTypes, true)) continue;
        if (!is_string($title) || !is_string($url)) continue;

        // Whitelist : jette les URLs hors domaines de confiance
        $inWhitelist = false;
        foreach (TRUSTED_DOMAINS as $domain) {
            if (str_contains($url, $domain)) { $inWhitelist = true; break; }
        }
        if (!$inWhitelist) continue;

        $isPos = ($p['is_biais_positif'] ?? false) === true;
        $label = $p['label'] ?? null;
        if (!$isPos || !in_array($label, $validLabels, true)) {
            $label = null;
        }

        // Recoupement journalistique : "verifie" si Claude a confirmé sur 2+
        // sources, "source_unique" sinon. Défaut prudent : "source_unique".
        $crossCheck = $p['cross_check'] ?? 'source_unique';
        if (!in_array($crossCheck, $validCrossCheck, true)) {
            $crossCheck = 'source_unique';
        }

        $content = $p['content'] ?? [];
        if (!is_array($content)) $content = [];
        $content = array_values(array_filter(
            $content, fn($c) => is_string($c) && trim($c) !== ''
        ));

        $popups[] = [
            'type'             => $type,
            'title'            => trim($title),
            'content'          => $content,
            'url'              => trim($url),
            'source'           => trim((string)($p['source'] ?? '')),
            'is_biais_positif' => $isPos,
            'label'            => $label,
            'cross_check'      => $crossCheck,
        ];
    }

    return ['answer' => $answer, 'popups' => $popups];
}
