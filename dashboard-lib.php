<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

/**
 * Couche métier "Tableau de bord" : pistes, actions, documents.
 * Toutes les fonctions prennent un $userId déjà authentifié — la vérification
 * d'auth se fait dans les endpoints qui appellent ces helpers.
 *
 * Note : ce fichier s'appelait autrefois dashboard.php mais a été renommé
 * en dashboard-lib.php pour ne pas entrer en conflit avec dashboard.php
 * qui est la PAGE HTML du tableau de bord.
 */

const VALID_PISTE_STATUTS    = ['active', 'en_suspens', 'abandonnee'];
const VALID_ACTION_STATUTS   = ['a_faire', 'en_cours', 'fait'];
const VALID_DOC_STATUTS      = ['a_preparer', 'en_cours', 'pret'];
const VALID_DOC_CATEGORIES   = ['dossier_scolaire', 'lettre_motivation', 'justificatif', 'formulaire', 'autre'];

// =============================================================================
// PISTES
// =============================================================================

function dashboard_save_piste(int $userId, array $data): array
{
    $titre = trim((string)($data['titre'] ?? ''));
    if ($titre === '') throw new RuntimeException('Le titre est obligatoire.');

    $description    = isset($data['description']) ? trim((string)$data['description']) : null;
    $notes          = isset($data['notes']) ? trim((string)$data['notes']) : null;
    $statut         = in_array($data['statut'] ?? null, VALID_PISTE_STATUTS, true) ? $data['statut'] : 'active';
    $convId         = isset($data['conversation_id']) ? mb_substr((string)$data['conversation_id'], 0, 64) : null;
    $sourceMessage  = isset($data['source_message']) ? mb_substr(trim((string)$data['source_message']), 0, 1000) : null;

    db_run(
        'INSERT INTO dashboard_pistes
            (user_id, titre, description, notes, statut, conversation_id, source_message)
         VALUES (?, ?, ?, ?, ?, ?, ?)',
        [$userId, $titre, $description, $notes, $statut, $convId, $sourceMessage]
    );
    return dashboard_get_piste($userId, db_last_id());
}

function dashboard_get_piste(int $userId, int $pisteId): array
{
    $row = db_one(
        'SELECT * FROM dashboard_pistes WHERE id = ? AND user_id = ?',
        [$pisteId, $userId]
    );
    if ($row === null) throw new RuntimeException('Piste introuvable.');
    return $row;
}

function dashboard_update_piste(int $userId, int $pisteId, array $data): array
{
    dashboard_get_piste($userId, $pisteId); // vérifie ownership

    $sets = []; $params = [];
    if (isset($data['titre'])) {
        $titre = trim((string)$data['titre']);
        if ($titre === '') throw new RuntimeException('Le titre ne peut pas être vide.');
        $sets[] = 'titre = ?';        $params[] = $titre;
    }
    if (array_key_exists('description', $data)) {
        $sets[] = 'description = ?';   $params[] = $data['description'] !== null ? trim((string)$data['description']) : null;
    }
    if (array_key_exists('notes', $data)) {
        $sets[] = 'notes = ?';         $params[] = $data['notes'] !== null ? trim((string)$data['notes']) : null;
    }
    if (in_array($data['statut'] ?? null, VALID_PISTE_STATUTS, true)) {
        $sets[] = 'statut = ?';        $params[] = $data['statut'];
    }
    if (empty($sets)) return dashboard_get_piste($userId, $pisteId);

    $params[] = $pisteId;
    $params[] = $userId;
    db_run(
        'UPDATE dashboard_pistes SET ' . implode(', ', $sets) .
        ' WHERE id = ? AND user_id = ?',
        $params
    );
    return dashboard_get_piste($userId, $pisteId);
}

function dashboard_delete_piste(int $userId, int $pisteId): void
{
    db_run('DELETE FROM dashboard_pistes WHERE id = ? AND user_id = ?', [$pisteId, $userId]);
}

// =============================================================================
// ACTIONS
// =============================================================================

function dashboard_save_action(int $userId, array $data): array
{
    $titre = trim((string)($data['titre'] ?? ''));
    if ($titre === '') throw new RuntimeException('Le titre est obligatoire.');

    $pisteId    = isset($data['piste_id']) && (int)$data['piste_id'] > 0 ? (int)$data['piste_id'] : null;
    $description = isset($data['description']) ? trim((string)$data['description']) : null;
    $dateEch    = parse_date_or_null($data['date_echeance'] ?? null);
    $statut     = in_array($data['statut'] ?? null, VALID_ACTION_STATUTS, true) ? $data['statut'] : 'a_faire';
    $url        = isset($data['url_externe']) ? mb_substr(trim((string)$data['url_externe']), 0, 500) : null;
    if ($url !== null && !filter_var($url, FILTER_VALIDATE_URL)) $url = null;
    $autoGen    = !empty($data['auto_generated']) ? 1 : 0;
    $reminderDays = parse_reminder_days($data['reminder_days_before'] ?? null);

    if ($pisteId !== null) {
        $check = db_one('SELECT id FROM dashboard_pistes WHERE id = ? AND user_id = ?', [$pisteId, $userId]);
        if ($check === null) throw new RuntimeException('Piste invalide.');
    }

    // Migration-tolerant : si la colonne reminder_days_before n'existe pas
    // (migration SQL non encore lancée), on insère sans elle.
    if (dashboard_actions_has_reminder_column()) {
        db_run(
            'INSERT INTO dashboard_actions
                (user_id, piste_id, titre, description, date_echeance, statut, url_externe, auto_generated, reminder_days_before)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$userId, $pisteId, $titre, $description, $dateEch, $statut, $url, $autoGen, $reminderDays]
        );
    } else {
        db_run(
            'INSERT INTO dashboard_actions
                (user_id, piste_id, titre, description, date_echeance, statut, url_externe, auto_generated)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$userId, $pisteId, $titre, $description, $dateEch, $statut, $url, $autoGen]
        );
    }
    return dashboard_get_action($userId, db_last_id());
}

function dashboard_get_action(int $userId, int $actionId): array
{
    $row = db_one('SELECT * FROM dashboard_actions WHERE id = ? AND user_id = ?', [$actionId, $userId]);
    if ($row === null) throw new RuntimeException('Action introuvable.');
    return $row;
}

function dashboard_update_action(int $userId, int $actionId, array $data): array
{
    dashboard_get_action($userId, $actionId);
    $sets = []; $params = [];
    if (isset($data['titre'])) {
        $t = trim((string)$data['titre']);
        if ($t === '') throw new RuntimeException('Le titre ne peut pas être vide.');
        $sets[] = 'titre = ?';        $params[] = $t;
    }
    if (array_key_exists('description', $data)) {
        $sets[] = 'description = ?';   $params[] = $data['description'] !== null ? trim((string)$data['description']) : null;
    }
    if (array_key_exists('date_echeance', $data)) {
        $sets[] = 'date_echeance = ?'; $params[] = parse_date_or_null($data['date_echeance']);
    }
    if (in_array($data['statut'] ?? null, VALID_ACTION_STATUTS, true)) {
        $sets[] = 'statut = ?';        $params[] = $data['statut'];
    }
    if (array_key_exists('url_externe', $data)) {
        $u = $data['url_externe'] !== null ? mb_substr(trim((string)$data['url_externe']), 0, 500) : null;
        if ($u !== null && !filter_var($u, FILTER_VALIDATE_URL)) $u = null;
        $sets[] = 'url_externe = ?';   $params[] = $u;
    }
    // Migration-tolerant : on ne touche à reminder_days_before
    // que si la colonne existe déjà en base.
    if (array_key_exists('reminder_days_before', $data) && dashboard_actions_has_reminder_column()) {
        $sets[] = 'reminder_days_before = ?';
        $params[] = parse_reminder_days($data['reminder_days_before']);
    }
    if (empty($sets)) return dashboard_get_action($userId, $actionId);

    $params[] = $actionId; $params[] = $userId;
    db_run('UPDATE dashboard_actions SET ' . implode(', ', $sets) .
           ' WHERE id = ? AND user_id = ?', $params);
    return dashboard_get_action($userId, $actionId);
}

function dashboard_delete_action(int $userId, int $actionId): void
{
    db_run('DELETE FROM dashboard_actions WHERE id = ? AND user_id = ?', [$actionId, $userId]);
}

// =============================================================================
// DOCUMENTS
// =============================================================================

function dashboard_save_document(int $userId, array $data): array
{
    $titre = trim((string)($data['titre'] ?? ''));
    if ($titre === '') throw new RuntimeException('Le titre est obligatoire.');

    $pisteId     = isset($data['piste_id']) && (int)$data['piste_id'] > 0 ? (int)$data['piste_id'] : null;
    $description = isset($data['description']) ? trim((string)$data['description']) : null;
    $categorie   = in_array($data['categorie'] ?? null, VALID_DOC_CATEGORIES, true) ? $data['categorie'] : 'autre';
    $statut      = in_array($data['statut'] ?? null, VALID_DOC_STATUTS, true) ? $data['statut'] : 'a_preparer';
    $autoGen     = !empty($data['auto_generated']) ? 1 : 0;

    if ($pisteId !== null) {
        $check = db_one('SELECT id FROM dashboard_pistes WHERE id = ? AND user_id = ?', [$pisteId, $userId]);
        if ($check === null) throw new RuntimeException('Piste invalide.');
    }

    db_run(
        'INSERT INTO dashboard_documents
            (user_id, piste_id, titre, description, categorie, statut, auto_generated)
         VALUES (?, ?, ?, ?, ?, ?, ?)',
        [$userId, $pisteId, $titre, $description, $categorie, $statut, $autoGen]
    );
    return dashboard_get_document($userId, db_last_id());
}

function dashboard_get_document(int $userId, int $docId): array
{
    $row = db_one('SELECT * FROM dashboard_documents WHERE id = ? AND user_id = ?', [$docId, $userId]);
    if ($row === null) throw new RuntimeException('Document introuvable.');
    return $row;
}

function dashboard_update_document(int $userId, int $docId, array $data): array
{
    dashboard_get_document($userId, $docId);
    $sets = []; $params = [];
    if (isset($data['titre'])) {
        $t = trim((string)$data['titre']);
        if ($t === '') throw new RuntimeException('Le titre ne peut pas être vide.');
        $sets[] = 'titre = ?'; $params[] = $t;
    }
    if (array_key_exists('description', $data)) {
        $sets[] = 'description = ?'; $params[] = $data['description'] !== null ? trim((string)$data['description']) : null;
    }
    if (in_array($data['categorie'] ?? null, VALID_DOC_CATEGORIES, true)) {
        $sets[] = 'categorie = ?'; $params[] = $data['categorie'];
    }
    if (in_array($data['statut'] ?? null, VALID_DOC_STATUTS, true)) {
        $sets[] = 'statut = ?'; $params[] = $data['statut'];
    }
    if (empty($sets)) return dashboard_get_document($userId, $docId);

    $params[] = $docId; $params[] = $userId;
    db_run('UPDATE dashboard_documents SET ' . implode(', ', $sets) .
           ' WHERE id = ? AND user_id = ?', $params);
    return dashboard_get_document($userId, $docId);
}

function dashboard_delete_document(int $userId, int $docId): void
{
    db_run('DELETE FROM dashboard_documents WHERE id = ? AND user_id = ?', [$docId, $userId]);
}

// =============================================================================
// LIST + STATS
// =============================================================================

function dashboard_list_for_user(int $userId): array
{
    $pistes = db_all(
        'SELECT * FROM dashboard_pistes WHERE user_id = ?
         ORDER BY FIELD(statut, "active", "en_suspens", "abandonnee"), updated_at DESC',
        [$userId]
    );
    $actions = db_all(
        'SELECT * FROM dashboard_actions WHERE user_id = ?
         ORDER BY (date_echeance IS NULL), date_echeance ASC, created_at DESC',
        [$userId]
    );
    $documents = db_all(
        'SELECT * FROM dashboard_documents WHERE user_id = ?
         ORDER BY categorie ASC, FIELD(statut, "a_preparer", "en_cours", "pret"), created_at DESC',
        [$userId]
    );
    $stats = dashboard_compute_stats($pistes, $actions);

    return [
        'pistes'    => $pistes,
        'actions'   => $actions,
        'documents' => $documents,
        'stats'     => $stats,
    ];
}

function dashboard_compute_stats(array $pistes, array $actions): array
{
    $today  = (new DateTimeImmutable('today'))->format('Y-m-d');
    $in7d   = (new DateTimeImmutable('+7 days'))->format('Y-m-d');
    $in30d  = (new DateTimeImmutable('+30 days'))->format('Y-m-d');

    $nbPistesActives    = 0;
    foreach ($pistes as $p) if ($p['statut'] === 'active') $nbPistesActives++;

    $nbDeadlines7d  = 0;
    $nbDeadlines30d = 0;
    $nbOverdue      = 0;
    foreach ($actions as $a) {
        if ($a['statut'] === 'fait') continue;
        if (empty($a['date_echeance'])) continue;
        $d = $a['date_echeance'];
        if ($d < $today)        $nbOverdue++;
        elseif ($d <= $in7d)    $nbDeadlines7d++;
        elseif ($d <= $in30d)   $nbDeadlines30d++;
    }

    return [
        'nb_pistes_actives' => $nbPistesActives,
        'nb_deadlines_7d'   => $nbDeadlines7d,
        'nb_deadlines_30d'  => $nbDeadlines30d,
        'nb_overdue'        => $nbOverdue,
    ];
}

// =============================================================================
// Synthèse du dashboard pour injection dans le system prompt Claude
// =============================================================================

/**
 * Renvoie une synthèse texte digestible du dashboard de l'utilisateur,
 * destinée à être injectée dans le system prompt pour que Claude soit aware
 * du contexte projet de l'étudiant et personnalise ses réponses en fonction.
 *
 * @param int $userId
 * @return string|null  null si rien à signaler, sinon synthèse multilignes
 */
function dashboard_summary_for_chat(int $userId): ?string
{
    $data = dashboard_list_for_user($userId);
    $pistes = $data['pistes'];
    $actions = $data['actions'];
    $documents = $data['documents'];

    if (empty($pistes) && empty($actions) && empty($documents)) {
        return null;
    }

    $lines = [];
    $today = (new DateTimeImmutable('today'))->format('Y-m-d');

    // ----- Pistes actives (max 5)
    $activePistes = array_filter($pistes, fn($p) => $p['statut'] === 'active');
    if (!empty($activePistes)) {
        $lines[] = "PISTES ACTIVES :";
        foreach (array_slice($activePistes, 0, 5) as $p) {
            $line = "- « " . $p['titre'] . " »";
            if (!empty($p['description'])) {
                $line .= " : " . mb_substr($p['description'], 0, 200);
            }
            $lines[] = $line;
        }
    }

    // ----- Pistes en suspens (mention courte)
    $suspended = array_filter($pistes, fn($p) => $p['statut'] === 'en_suspens');
    if (!empty($suspended)) {
        $titles = array_map(fn($p) => '« ' . $p['titre'] . ' »', $suspended);
        $lines[] = "\nPISTES EN SUSPENS : " . implode(', ', array_slice($titles, 0, 5));
    }

    // ----- Deadlines à venir (max 6, triées par urgence)
    $upcoming = array_values(array_filter(
        $actions,
        fn($a) => $a['statut'] !== 'fait' && !empty($a['date_echeance']) && $a['date_echeance'] >= $today
    ));
    usort($upcoming, fn($a, $b) => strcmp($a['date_echeance'], $b['date_echeance']));
    $overdue = array_values(array_filter(
        $actions,
        fn($a) => $a['statut'] !== 'fait' && !empty($a['date_echeance']) && $a['date_echeance'] < $today
    ));

    if (!empty($overdue)) {
        $lines[] = "\nDEADLINES EN RETARD (urgent !) :";
        foreach (array_slice($overdue, 0, 3) as $a) {
            $lines[] = "- " . $a['date_echeance'] . " : " . $a['titre'];
        }
    }
    if (!empty($upcoming)) {
        $lines[] = "\nPROCHAINES DEADLINES :";
        foreach (array_slice($upcoming, 0, 6) as $a) {
            $lines[] = "- " . $a['date_echeance'] . " : " . $a['titre'];
        }
    }

    // ----- Actions sans deadline (à faire mais pas datées)
    $undated = array_values(array_filter(
        $actions,
        fn($a) => $a['statut'] !== 'fait' && empty($a['date_echeance'])
    ));
    if (!empty($undated)) {
        $lines[] = "\nACTIONS À FAIRE (pas de deadline) :";
        foreach (array_slice($undated, 0, 4) as $a) {
            $lines[] = "- " . $a['titre'];
        }
    }

    // ----- Documents par statut (max 8 à préparer)
    $toPrep = array_filter($documents, fn($d) => $d['statut'] === 'a_preparer');
    if (!empty($toPrep)) {
        $lines[] = "\nDOCUMENTS À PRÉPARER :";
        foreach (array_slice($toPrep, 0, 8) as $d) {
            $cat = $d['categorie'] ? ' [' . $d['categorie'] . ']' : '';
            $lines[] = "- " . $d['titre'] . $cat;
        }
    }

    return implode("\n", $lines);
}


// =============================================================================
// Helpers
// =============================================================================

/**
 * Détecte si la colonne `reminder_days_before` existe sur dashboard_actions.
 * Permet la rétrocompatibilité tant que la migration SQL n'a pas été lancée :
 * si la colonne manque, on dégrade silencieusement (pas de feature mais pas de crash).
 *
 * Cache en static : on ne fait la requête qu'une seule fois par exécution PHP.
 */
function dashboard_actions_has_reminder_column(): bool
{
    static $cached = null;
    if ($cached !== null) return $cached;
    try {
        $row = db_one("SHOW COLUMNS FROM dashboard_actions LIKE 'reminder_days_before'");
        $cached = $row !== null;
    } catch (Throwable $e) {
        $cached = false;
    }
    return $cached;
}

function parse_date_or_null($value): ?string
{
    if (!is_string($value) || trim($value) === '') return null;
    $value = trim($value);
    $d = DateTimeImmutable::createFromFormat('Y-m-d', $value);
    if ($d === false || $d->format('Y-m-d') !== $value) return null;
    return $value;
}

/**
 * Normalise une liste de jours de rappel.
 * Accepte un array [1, 5, 30] ou une string CSV "1,5,30" ou "30,5,1".
 * Renvoie une string CSV triée avec doublons retirés ("1,5,30") ou null.
 * Limite : valeurs entre 1 et 365 jours, max 5 rappels par deadline.
 */
function parse_reminder_days($value): ?string
{
    if ($value === null || $value === '') return null;

    $list = is_array($value)
        ? $value
        : explode(',', (string)$value);

    $clean = [];
    foreach ($list as $v) {
        $n = (int)trim((string)$v);
        if ($n >= 1 && $n <= 365) $clean[$n] = true; // dedup via clé
    }
    if (empty($clean)) return null;

    $days = array_keys($clean);
    sort($days, SORT_NUMERIC);
    if (count($days) > 5) $days = array_slice($days, 0, 5);

    return implode(',', $days);
}
