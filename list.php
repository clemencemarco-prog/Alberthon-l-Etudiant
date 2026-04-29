<?php
declare(strict_types=1);
require_once __DIR__ . '/../../auth.php';
require_once __DIR__ . '/../../dashboard-lib.php';

$cu = require_auth();
$userId = (int)$cu['user']['id'];

try {
    json_response(dashboard_list_for_user($userId));
} catch (Throwable $e) {
    error_log('[ORI] dashboard list error: ' . $e->getMessage());
    json_error('server_error', 'Erreur serveur.', 500);
}
