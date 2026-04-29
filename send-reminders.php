<?php
declare(strict_types=1);
@set_time_limit(120);

require_once __DIR__ . '/../../auth.php';
require_once __DIR__ . '/../../mailer.php';

/**
 * Endpoint de déclenchement des rappels email.
 *
 * 2 modes d'autorisation :
 *  - Utilisateur connecté → on traite uniquement SES rappels
 *  - Header secret correct (cron Bookmyname) → on traite TOUS les rappels
 */

if ($_SERVER['REQUEST_METHOD'] !== 'POST' && $_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_error('method_not_allowed', 'POST ou GET.', 405);
}

$body = read_json_body();
$secretGiven = $body['secret'] ?? ($_GET['secret'] ?? '');

$cu = current_user();
$userIdFilter = null;

if ($cu !== null) {
    // Utilisateur connecté : ne traite que ses propres rappels
    $userIdFilter = (int) $cu['user']['id'];
} elseif (REMINDERS_SECRET !== '' && hash_equals(REMINDERS_SECRET, (string)$secretGiven)) {
    // Cron protégé par secret : traite tous les utilisateurs
    $userIdFilter = null;
} else {
    json_error('unauthorized', 'Connexion ou secret requis.', 401);
}

try {
    $result = process_pending_reminders($userIdFilter);
    json_response([
        'ok'    => true,
        'scope' => $userIdFilter === null ? 'all_users' : 'current_user',
        'stats' => $result,
    ]);
} catch (Throwable $e) {
    error_log('[ORI] send-reminders error: ' . $e->getMessage());
    json_error('server_error', 'Erreur lors du traitement des rappels.', 500);
}
