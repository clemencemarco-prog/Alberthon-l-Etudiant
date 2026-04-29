<?php
declare(strict_types=1);
require_once __DIR__ . '/../auth.php';

$cu = require_auth();
$userId = (int) $cu['user']['id'];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    json_response(['profile' => $cu['profile']]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = read_json_body();
    try {
        $profile = save_profile($userId, $body);
        json_response(['profile' => $profile]);
    } catch (Throwable $e) {
        error_log('[ORI] profile save error: ' . $e->getMessage());
        json_error('server_error', 'Erreur lors de la sauvegarde du profil.', 500);
    }
}

json_error('method_not_allowed', 'GET ou POST requis.', 405);
