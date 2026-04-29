<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

/**
 * Envoi des rappels deadlines.
 * Utilise mail() natif PHP. Si non configuré sur le serveur, fallback en
 * "simulated" : on log dans email_reminders sans envoyer pour de vrai.
 *
 * Logique :
 *  - 7 jours avant échéance : 1 rappel envoyé une seule fois (UNIQUE constraint en SQL)
 *  - 1 jour avant échéance  : idem
 *  - À chaque appel de process_pending_reminders, on cherche les actions à rappeler
 */

/**
 * Parcourt les deadlines à rappeler aujourd'hui.
 * @param int|null $userIdFilter null = tous les users, sinon filtre sur un user.
 * @return array stats
 */
function process_pending_reminders(?int $userIdFilter = null): array
{
    $stats = [
        'checked'   => 0,
        'sent'      => 0,
        'simulated' => 0,
        'failed'    => 0,
        'skipped'   => 0,
    ];

    // Migration-tolerant : si la colonne reminder_days_before n'existe pas
    // (migration SQL non encore lancée), on ne fait rien — pas de mail.
    require_once __DIR__ . '/dashboard-lib.php';
    if (!dashboard_actions_has_reminder_column()) {
        return $stats + ['note' => 'reminder_days_before column missing — run migration first'];
    }

    $today = new DateTimeImmutable('today');

    // Récupère TOUTES les actions avec une deadline future + reminder_days_before configuré.
    // On scanne ensuite côté PHP pour savoir si aujourd'hui correspond à un J-X demandé.
    $sql = 'SELECT a.*, u.email AS user_email
            FROM dashboard_actions a
            INNER JOIN users u ON u.id = a.user_id
            WHERE a.date_echeance IS NOT NULL
              AND a.date_echeance >= ?
              AND a.statut <> "fait"
              AND a.reminder_days_before IS NOT NULL
              AND a.reminder_days_before <> ""';
    $params = [$today->format('Y-m-d')];
    if ($userIdFilter !== null) {
        $sql .= ' AND a.user_id = ?';
        $params[] = $userIdFilter;
    }

    foreach (db_all($sql, $params) as $action) {
        $deadline = DateTimeImmutable::createFromFormat('Y-m-d', $action['date_echeance']);
        if ($deadline === false) continue;

        $daysUntil = (int) $today->diff($deadline)->format('%r%a');
        $configuredDays = array_filter(array_map('intval', explode(',', $action['reminder_days_before'])));

        if (!in_array($daysUntil, $configuredDays, true)) continue;

        $stats['checked']++;

        // Type unique par J-X pour respecter la contrainte UNIQUE (action_id, type)
        $type = 'reminder_' . $daysUntil . 'd';

        // A-t-on déjà envoyé ce rappel ?
        $alreadySent = db_one(
            'SELECT id FROM email_reminders WHERE action_id = ? AND type = ?',
            [(int)$action['id'], $type]
        );
        if ($alreadySent !== null) {
            $stats['skipped']++;
            continue;
        }

        $result = send_reminder_email($action, $type, $daysUntil);

        if ($result['status'] !== 'skipped') {
            try {
                db_run(
                    'INSERT INTO email_reminders
                        (user_id, action_id, type, delivery_status, error_message)
                     VALUES (?, ?, ?, ?, ?)',
                    [
                        (int)$action['user_id'],
                        (int)$action['id'],
                        $type,
                        $result['status'],
                        $result['error']
                    ]
                );
            } catch (Throwable $e) {
                error_log('[ORI] reminder log error: ' . $e->getMessage());
            }
        }
        $stats[$result['status']] = ($stats[$result['status']] ?? 0) + 1;
    }

    return $stats;
}

/**
 * Construit + envoie un email de rappel pour 1 action.
 * Renvoie ['status' => 'sent'|'simulated'|'failed'|'skipped', 'error' => null|string].
 */
function send_reminder_email(array $action, string $type, ?int $daysUntil = null): array
{
    $email = $action['user_email'] ?? null;
    if (!is_string($email) || $email === '') {
        return ['status' => 'failed', 'error' => 'no_email_for_user'];
    }

    $piste = null;
    if (!empty($action['piste_id'])) {
        $piste = db_one('SELECT titre FROM dashboard_pistes WHERE id = ?', [(int)$action['piste_id']]);
    }

    // Label humain en fonction du nombre de jours
    if ($daysUntil === null) {
        // rétro-compat avec types figés
        $daysLabel = $type === 'reminder_1d' ? 'demain' : 'dans 7 jours';
    } elseif ($daysUntil === 0) {
        $daysLabel = "aujourd'hui";
    } elseif ($daysUntil === 1) {
        $daysLabel = 'demain';
    } else {
        $daysLabel = 'dans ' . $daysUntil . ' jours';
    }

    $subject = '[ORI] Rappel — ' . $action['titre'] . ' (' . $daysLabel . ')';
    $body    = build_reminder_body($action, $piste, $daysLabel);

    $name = explode('@', $email)[0];

    $headers  = "From: " . MAIL_FROM . "\r\n";
    $headers .= "Reply-To: " . MAIL_FROM . "\r\n";
    $headers .= "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $headers .= "X-Mailer: ORI/1.0\r\n";

    // Tentative d'envoi
    if (function_exists('mail')) {
        $sent = @mail($email, $subject, $body, $headers, '-f' . MAIL_FROM);
        if ($sent) {
            return ['status' => 'sent', 'error' => null];
        }
        return ['status' => 'simulated', 'error' => 'mail_returned_false'];
    }
    return ['status' => 'simulated', 'error' => 'mail_function_not_available'];
}

function build_reminder_body(array $action, ?array $piste, string $daysLabel): string
{
    $pisteTitre = $piste ? $piste['titre'] : '(piste non liée)';
    $url = $action['url_externe'] ?? '';
    $date = $action['date_echeance'] ?? '';
    $description = $action['description'] ?? '';

    $body  = "Bonjour,\n\n";
    $body .= "Tu as une deadline qui approche ($daysLabel) :\n";
    $body .= "  ▸ " . $action['titre'] . "\n";
    $body .= "  ▸ Date limite : $date\n";
    $body .= "  ▸ Piste associée : $pisteTitre\n";
    if ($description !== '') {
        $body .= "\n$description\n";
    }
    if ($url !== '') {
        $body .= "\nLien officiel : $url\n";
    }
    $body .= "\nRetrouve ton tableau de bord : https://letudiant.marco84.fr/dashboard.php\n\n";
    $body .= "— ORI, ton assistant d'orientation\n";

    return $body;
}
