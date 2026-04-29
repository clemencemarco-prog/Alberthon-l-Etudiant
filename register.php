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
    $result = register($email, $password);
    json_response($result, 201);
} catch (RuntimeException $e) {
    json_error('validation', $e->getMessage(), 400);
} catch (Throwable $e) {
    error_log('[ORI] register error: ' . $e->getMessage());
    json_error('server_error', 'Erreur serveur, réessaye plus tard.', 500);
}
