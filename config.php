<?php
/**
 * Configuration globale ORI.
 *
 * La clé API Anthropic est lue depuis 3 sources, dans l'ordre :
 *   1. variable d'environnement ANTHROPIC_API_KEY
 *   2. fichier config/secrets.php (NON commité, NE PAS upload publiquement)
 *   3. fallback vide (le backend renverra "api_key_not_configured")
 */

define('APP_NAME', 'ORI - L\'Etudiant');
define('APP_VERSION', '0.2.0');
define('APP_BASE_URL', '/');
define('USE_FAKE_RESPONSES', false); // backend PHP actif

// ----- Clé API Anthropic ---------------------------------------------------

$apiKey = getenv('ANTHROPIC_API_KEY') ?: '';

if ($apiKey === '' && file_exists(__DIR__ . '/secrets.php')) {
    $secrets = require __DIR__ . '/secrets.php';
    if (is_array($secrets) && isset($secrets['anthropic_api_key'])) {
        $apiKey = (string) $secrets['anthropic_api_key'];
    }
}

define('CLAUDE_API_KEY', $apiKey);

// ----- Helpers -------------------------------------------------------------

function url($path = '') {
    return APP_BASE_URL . ltrim($path, '/');
}
