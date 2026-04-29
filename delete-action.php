<?php
declare(strict_types=1);
require_once __DIR__ . '/../../auth.php';
require_once __DIR__ . '/../../dashboard-lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('method_not_allowed', 'POST requis.', 405);
$cu = require_auth();
$userId = (int)$cu['user']['id'];

$id = (int)(read_json_body()['id'] ?? 0);
if ($id <= 0) json_error('validation', 'ID manquant.', 400);

try {
    dashboard_delete_action($userId, $id);
    json_response(['ok' => true]);
} catch (Throwable $e) {
    error_log('[ORI] delete-action error: ' . $e->getMessage());
    json_error('server_error', 'Erreur serveur.', 500);
}
