<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

/**
 * Authentification ORI : sessions par token aléatoire en cookie HttpOnly.
 *
 * Flow :
 *  - register() / login()    → crée un token + INSERT sessions + setcookie
 *  - current_user()          → lit le cookie + JOIN sessions/users si valide
 *  - logout()                → DELETE sessions + clear cookie
 *
 * Sécurité :
 *  - mot de passe : password_hash(PASSWORD_BCRYPT)
 *  - token         : 32 bytes random hex (256 bits d'entropie)
 *  - cookie         : HttpOnly + Secure (HTTPS) + SameSite=Lax
 */

const PASSWORD_MIN_LENGTH = 8;

// =============================================================================
// API publique
// =============================================================================

/** Crée un compte. Renvoie ['user', 'profile'=>null]. Throws si invalide. */
function register(string $email, string $password): array
{
    $email = trim(strtolower($email));

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('Email invalide.');
    }
    if (strlen($password) < PASSWORD_MIN_LENGTH) {
        throw new RuntimeException('Le mot de passe doit faire au moins 8 caractères.');
    }
    if (db_one('SELECT id FROM users WHERE email = ?', [$email]) !== null) {
        throw new RuntimeException('Cet email est déjà utilisé.');
    }

    $hash = password_hash($password, PASSWORD_BCRYPT);
    db_run('INSERT INTO users (email, password_hash) VALUES (?, ?)', [$email, $hash]);
    $userId = db_last_id();

    cleanup_expired_sessions();
    create_session_for_user($userId);

    return [
        'user' => ['id' => $userId, 'email' => $email],
        'profile' => null,
    ];
}

/** Connecte un user existant. Renvoie ['user', 'profile']. Throws si KO. */
function login(string $email, string $password): array
{
    $email = trim(strtolower($email));
    $row = db_one(
        'SELECT id, email, password_hash FROM users WHERE email = ?',
        [$email]
    );
    if ($row === null || !password_verify($password, $row['password_hash'])) {
        throw new RuntimeException('Email ou mot de passe incorrect.');
    }
    $userId = (int) $row['id'];

    db_run('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [$userId]);

    cleanup_expired_sessions();
    create_session_for_user($userId);

    return [
        'user' => ['id' => $userId, 'email' => $row['email']],
        'profile' => load_profile_for_user($userId),
    ];
}

/** Invalide le token courant et clear le cookie. */
function logout(): void
{
    $token = $_COOKIE[SESSION_COOKIE_NAME] ?? null;
    if (is_string($token) && $token !== '') {
        db_run('DELETE FROM sessions WHERE token = ?', [$token]);
    }
    setcookie(SESSION_COOKIE_NAME, '', [
        'expires'  => time() - 3600,
        'path'     => '/',
        'secure'   => IS_HTTPS,
        'httponly' => true,
        // SameSite=None requis pour que le cookie marche dans un iframe
        // cross-origin (mode widget embeddé sur un autre domaine).
        // Requiert Secure=true (HTTPS), sinon les navigateurs refusent.
        // Fallback Lax si HTTP local (dev).
        'samesite' => IS_HTTPS ? 'None' : 'Lax',
    ]);
}

/** Renvoie ['user', 'profile'] si connecté, null sinon. */
function current_user(): ?array
{
    $token = $_COOKIE[SESSION_COOKIE_NAME] ?? null;
    if (!is_string($token) || strlen($token) !== 64) {
        return null;
    }
    $row = db_one(
        'SELECT u.id, u.email
         FROM sessions s
         INNER JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > NOW()
         LIMIT 1',
        [$token]
    );
    if ($row === null) {
        return null;
    }
    // Update last_seen_at (best effort, on ignore les erreurs)
    try {
        db_run('UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token = ?', [$token]);
    } catch (Throwable $e) { /* ignore */ }

    $userId = (int) $row['id'];
    return [
        'user' => ['id' => $userId, 'email' => $row['email']],
        'profile' => load_profile_for_user($userId),
    ];
}

/** Force l'auth ou renvoie 401 + exit. */
function require_auth(): array
{
    $cu = current_user();
    if ($cu === null) {
        json_error('not_authenticated', 'Connexion requise.', 401);
    }
    return $cu;
}

// =============================================================================
// Profile CRUD
// =============================================================================

/** Renvoie le profil de l'utilisateur ou null si pas encore créé. */
function load_profile_for_user(int $userId): ?array
{
    $row = db_one(
        'SELECT niveau, niveau_detail, filiere, specialites,
                projet_type, projet_focus, contraintes, gouts, updated_at
         FROM user_profiles WHERE user_id = ?',
        [$userId]
    );
    if ($row === null) {
        return null;
    }
    foreach (['specialites', 'contraintes', 'gouts'] as $field) {
        $val = $row[$field] ?? null;
        if (is_string($val) && $val !== '') {
            $decoded = json_decode($val, true);
            $row[$field] = is_array($decoded) ? $decoded : [];
        } else {
            $row[$field] = [];
        }
    }
    return $row;
}

/** Insert ou update le profil. Renvoie le profil normalisé. */
function save_profile(int $userId, array $profile): array
{
    $valid_niveaux  = ['college', 'lycee', 'sup', 'actif', 'autre'];
    $valid_filieres = ['generale', 'techno', 'pro'];
    $valid_projets  = ['precis', 'explorer', 'flou', 'reorientation', 'autre'];

    $niveau       = in_array($profile['niveau'] ?? null, $valid_niveaux, true)
                    ? $profile['niveau'] : null;
    $niveauDetail = is_string($profile['niveau_detail'] ?? null)
                    ? mb_substr(trim($profile['niveau_detail']), 0, 100) : null;
    $filiere      = in_array($profile['filiere'] ?? null, $valid_filieres, true)
                    ? $profile['filiere'] : null;
    $projetType   = in_array($profile['projet_type'] ?? null, $valid_projets, true)
                    ? $profile['projet_type'] : null;
    $projetFocus  = is_string($profile['projet_focus'] ?? null)
                    ? mb_substr(trim($profile['projet_focus']), 0, 1000) : null;
    $specialites  = is_array($profile['specialites'] ?? null)
                    ? array_values(array_filter($profile['specialites'], 'is_string')) : [];
    $contraintes  = is_array($profile['contraintes'] ?? null)
                    ? array_values(array_filter($profile['contraintes'], 'is_string')) : [];
    $gouts        = is_array($profile['gouts'] ?? null)
                    ? array_values(array_filter($profile['gouts'], 'is_string')) : [];

    db_run(
        'INSERT INTO user_profiles
            (user_id, niveau, niveau_detail, filiere, specialites,
             projet_type, projet_focus, contraintes, gouts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            niveau         = VALUES(niveau),
            niveau_detail  = VALUES(niveau_detail),
            filiere        = VALUES(filiere),
            specialites    = VALUES(specialites),
            projet_type    = VALUES(projet_type),
            projet_focus   = VALUES(projet_focus),
            contraintes    = VALUES(contraintes),
            gouts          = VALUES(gouts)',
        [
            $userId, $niveau, $niveauDetail, $filiere,
            json_encode($specialites, JSON_UNESCAPED_UNICODE),
            $projetType, $projetFocus,
            json_encode($contraintes, JSON_UNESCAPED_UNICODE),
            json_encode($gouts, JSON_UNESCAPED_UNICODE),
        ]
    );

    return load_profile_for_user($userId) ?? [];
}

// =============================================================================
// Internes
// =============================================================================

function create_session_for_user(int $userId): string
{
    $token     = bin2hex(random_bytes(32));
    $userAgent = mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255);
    $expires   = (new DateTimeImmutable('+' . SESSION_LIFETIME_DAYS . ' days'))
                    ->format('Y-m-d H:i:s');

    db_run(
        'INSERT INTO sessions (token, user_id, expires_at, user_agent)
         VALUES (?, ?, ?, ?)',
        [$token, $userId, $expires, $userAgent]
    );
    setcookie(SESSION_COOKIE_NAME, $token, [
        'expires'  => time() + SESSION_LIFETIME_DAYS * 86400,
        'path'     => '/',
        'secure'   => IS_HTTPS,
        'httponly' => true,
        // SameSite=None requis pour que le cookie marche dans un iframe
        // cross-origin (mode widget embeddé sur un autre domaine).
        // Requiert Secure=true (HTTPS), sinon les navigateurs refusent.
        // Fallback Lax si HTTP local (dev).
        'samesite' => IS_HTTPS ? 'None' : 'Lax',
    ]);
    return $token;
}

function cleanup_expired_sessions(): void
{
    try {
        db_run('DELETE FROM sessions WHERE expires_at < NOW()');
    } catch (Throwable $e) { /* ignore */ }
}
