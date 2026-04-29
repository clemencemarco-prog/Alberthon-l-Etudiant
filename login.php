<?php
declare(strict_types=1);
require_once __DIR__ . '/../auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('method_not_allowed', 'POST requis.', 405);
}

$body     = read_json_body();
$email    = trim((string)($body['email'] ?? ''));
$password = (string)($body['password'] ?? '');

try {
    $result = login($email, $password);
    json_response($result);
} catch (RuntimeException $e) {
    json_error('invalid_credentials', $e->getMessage(), 401);
} catch (Throwable $e) {
    error_log('[ORI] login error: ' . $e->getMessage());
    json_error('server_error', 'Erreur serveur, réessaye plus tard.', 500);
}
