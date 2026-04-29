<?php
declare(strict_types=1);

@set_time_limit(120);
@ini_set('max_execution_time', '120');
ini_set('display_errors', '0');

require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../claude.php';
require_once __DIR__ . '/../dashboard-lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('method_not_allowed', 'POST requis.', 405);
}

$body     = read_json_body();
$messages = to_anthropic_messages($body);

if (empty($messages)) {
    json_error('no_message', 'Aucun message reçu.', 400);
}

// Profil :
//   - si user connecté → DB (autorité)
//   - sinon → body.profile (mode invité, frontend conserve son profil en localStorage)
$profile = null;
$cu = current_user();
if ($cu !== null && !empty($cu['profile'])) {
    $profile = $cu['profile'];
} elseif (isset($body['profile']) && is_array($body['profile'])) {
    $profile = $body['profile'];
}

// Dashboard context : seulement si user connecté.
// On charge la synthèse pour que Claude soit aware des pistes/deadlines/docs
// déjà sauvegardés par l'étudiant et personnalise sa réponse en conséquence.
$dashboardCtx = null;
if ($cu !== null) {
    try {
        $dashboardCtx = dashboard_summary_for_chat((int)$cu['user']['id']);
    } catch (Throwable $e) {
        // best effort : si la lecture du dashboard échoue, on continue sans
        error_log('[ORI] dashboard_summary failed: ' . $e->getMessage());
    }
}

try {
    $result = claude_chat($messages, $profile, $dashboardCtx);
    json_response([
        'answer'       => $result['answer'],
        'popups'       => $result['popups'],
        'model'        => 'claude-opus-4-7',
        'stop_reason'  => $result['stop_reason'],
        'search_count' => $result['search_count'],
        'has_profile'  => $profile !== null,
        'has_dashboard_context' => $dashboardCtx !== null,
        'is_logged_in' => $cu !== null,
    ]);
} catch (Throwable $e) {
    error_log('[ORI] chat error: ' . $e->getMessage());
    json_error('claude_error', $e->getMessage(), 500);
}

/** Convertit le body en messages au format Anthropic. */
function to_anthropic_messages(array $body): array
{
    if (isset($body['messages']) && is_array($body['messages'])) {
        $out = [];
        foreach ($body['messages'] as $m) {
            if (!is_array($m)) continue;
            $role    = $m['role']    ?? null;
            $content = $m['content'] ?? null;
            if (in_array($role, ['user', 'assistant'], true)
                && is_string($content) && trim($content) !== ''
            ) {
                $out[] = ['role' => $role, 'content' => $content];
            }
        }
        return $out;
    }
    if (isset($body['message']) && is_string($body['message']) && trim($body['message']) !== '') {
        return [['role' => 'user', 'content' => $body['message']]];
    }
    return [];
}
