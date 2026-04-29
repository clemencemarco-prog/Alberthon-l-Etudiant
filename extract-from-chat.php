<?php
declare(strict_types=1);
@set_time_limit(60);
@ini_set('max_execution_time', '60');

require_once __DIR__ . '/../../auth.php';
require_once __DIR__ . '/../../claude.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('method_not_allowed', 'POST requis.', 405);
}
$cu = require_auth();

$body = read_json_body();
$messages = is_array($body['messages'] ?? null) ? $body['messages'] : [];
$lastAssistant = trim((string)($body['last_assistant_message'] ?? ''));

if ($lastAssistant === '') {
    json_error('validation', 'last_assistant_message requis.', 400);
}

// Sanitize messages au format Anthropic
$cleanMessages = [];
foreach ($messages as $m) {
    if (!is_array($m)) continue;
    $role = $m['role'] ?? null;
    $content = $m['content'] ?? null;
    if (in_array($role, ['user', 'assistant'], true) && is_string($content) && trim($content) !== '') {
        $cleanMessages[] = ['role' => $role, 'content' => $content];
    }
}

try {
    $extracted = claude_extract_from_chat($cleanMessages, $lastAssistant);
    json_response($extracted);
} catch (Throwable $e) {
    error_log('[ORI] extract-from-chat error: ' . $e->getMessage());
    // Fallback : pas d'extraction, le frontend laisse l'utilisateur saisir
    json_response([
        'suggested_piste'     => null,
        'suggested_actions'   => [],
        'suggested_documents' => [],
        'extract_error'       => 'fallback',
    ]);
}
