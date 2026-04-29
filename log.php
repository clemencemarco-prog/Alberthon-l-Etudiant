<?php
require_once '../config/config.php';

header('Content-Type: application/json');

// TODO: persister les conversations en base (MySQL en prod sur letudiant.marco84.fr)
// Pour le hackathon : pas de persistance côté serveur, tout reste en mémoire navigateur.

echo json_encode([
    'status' => 'not_implemented',
    'message' => 'Endpoint de log à brancher (MySQL) après le hackathon.'
]);
