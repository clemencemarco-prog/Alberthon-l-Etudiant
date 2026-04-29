<?php
declare(strict_types=1);

/**
 * Liste des deadlines administratives officielles connues.
 * Utilisée par claude_extract_from_chat() pour injecter les bonnes dates,
 * et par le frontend pour des suggestions automatiques.
 *
 * À mettre à jour au début de chaque cycle (Parcoursup ouvre en janvier).
 */

const KNOWN_DEADLINES = [
    [
        'id'          => 'parcoursup_voeux_cloture',
        'keys'        => ['parcoursup', 'voeu', 'pass', 'las', 'post-bac', 'but', 'cpge', 'prepa'],
        'titre'       => 'Parcoursup — Clôture de la formulation des vœux',
        'date'        => '2027-03-13',
        'url'         => 'https://www.parcoursup.gouv.fr',
        'description' => 'Dernier jour pour ajouter ou modifier tes vœux sur Parcoursup.',
    ],
    [
        'id'          => 'parcoursup_voeux_confirmation',
        'keys'        => ['parcoursup', 'voeu', 'confirmation', 'pass', 'las', 'post-bac', 'but'],
        'titre'       => 'Parcoursup — Confirmation des vœux',
        'date'        => '2027-04-03',
        'url'         => 'https://www.parcoursup.gouv.fr',
        'description' => 'Date limite pour confirmer définitivement tes vœux et finaliser ton dossier.',
    ],
    [
        'id'          => 'crous_dse',
        'keys'        => ['crous', 'bourse', 'dse', 'aide financière', 'logement crous'],
        'titre'       => 'CROUS — Dossier Social Étudiant (bourse + logement)',
        'date'        => '2026-05-31',
        'url'         => 'https://www.messervices.etudiant.gouv.fr/envole/',
        'description' => 'Dernier jour pour déposer ton DSE pour la bourse et/ou le logement étudiant.',
    ],
    [
        'id'          => 'mon_master_candidatures',
        'keys'        => ['master', 'm1', 'monmaster', 'mon master'],
        'titre'       => 'Mon Master — Clôture des candidatures',
        'date'        => '2027-03-24',
        'url'         => 'https://www.monmaster.gouv.fr',
        'description' => 'Date limite pour candidater en M1 via la plateforme Mon Master.',
    ],
    [
        'id'          => 'mon_master_admission',
        'keys'        => ['master', 'm1', 'monmaster'],
        'titre'       => 'Mon Master — Phase principale d\'admission',
        'date'        => '2027-06-04',
        'url'         => 'https://www.monmaster.gouv.fr',
        'description' => 'Début des réponses des formations Master.',
    ],
];

/** Renvoie les deadlines qui matchent le texte (titre ou description d'une piste). */
function get_known_deadlines_for_text(string $text): array
{
    $needle = mb_strtolower($text);
    $matches = [];
    foreach (KNOWN_DEADLINES as $dl) {
        foreach ($dl['keys'] as $kw) {
            if (mb_strpos($needle, mb_strtolower($kw)) !== false) {
                $matches[] = $dl;
                break;
            }
        }
    }
    return $matches;
}

/** Représentation textuelle compacte pour injection dans le prompt Claude. */
function known_deadlines_for_prompt(): string
{
    $lines = [];
    foreach (KNOWN_DEADLINES as $dl) {
        $lines[] = sprintf(
            '- "%s" → date_echeance: %s, url: %s',
            $dl['titre'], $dl['date'], $dl['url']
        );
    }
    return implode("\n", $lines);
}
