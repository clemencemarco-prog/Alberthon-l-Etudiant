<?php
declare(strict_types=1);
require_once __DIR__ . '/../../auth.php';
require_once __DIR__ . '/../../dashboard-lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('method_not_allowed', 'POST requis.', 405);
}
$cu = require_auth();
$userId = (int)$cu['user']['id'];

try {
    $piste = dashboard_save_piste($userId, read_json_body());
    json_response(['piste' => $piste], 201);
} catch (RuntimeException $e) {
    json_error('validation', $e->getMessage(), 400);
} catch (Throwable $e) {
    error_log('[ORI] save-piste error: ' . $e->getMessage());
    json_error('server_error', 'Erreur serveur.', 500);
}
