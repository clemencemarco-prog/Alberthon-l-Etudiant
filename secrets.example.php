<?php
/**
 * Modèle de fichier secrets — copie ce fichier vers `secrets.php` et remplis
 * la clé API. Le vrai `secrets.php` ne doit JAMAIS être commité ni poussé
 * sur un dépôt git public.
 *
 * Sur Bookmyname : upload `secrets.php` via FTP ; il sera lu par config.php
 * mais pas accessible en HTTP grâce au .htaccess de config/.
 */

return [
    'anthropic_api_key' => 'sk-ant-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
];
