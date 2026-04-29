# ORI — L'Étudiant (Hackathon Alberthon)

Assistant d'orientation **ORI** enrichi par des **pop-ups de suggestion proactive** et un **dashboard de profil** pour aider les lycéens et étudiants à explorer leur orientation post-bac.

## Prérequis

- **PHP 8.1+** avec extensions `pdo_mysql`, `curl`, `mbstring`
- **Python 3.11+**
- **MySQL / MariaDB 10.4+**
- Une **clé Mistral AI**

Cible : **`letudiant.marco84.fr`** (mutualisé Bookmyname, PHP 8 + MariaDB).

## Architecture

```
LETUDIANT/
├── frontend/                # PHP + JS — déployé sur letudiant.marco84.fr
│   ├── index.php            # Point d'entrée + chat
│   ├── dashboard.php        # Dashboard profil utilisateur
│   ├── auth.php             # Inscription / login
│   ├── api/                 # Endpoints REST (chat, login, profile, health…)
│   ├── includes/            # Header, sidebar, chat, footer
│   ├── config/              # config.php (charge .env)
│   ├── css/ + js/           # Front statique
│   ├── sql/                 # schema.sql, dashboard.sql, migrations
│   └── widget.html          # Widget embeddable sur un site tiers
│
├── backend/                 # FastAPI + Claude API + web search
│   ├── main.py              # Endpoint /chat avec whitelist de domaines
│   ├── catalog.json         # Catalogue de fiches métier / formations
│   └── requirements.txt
│
└── ori-projet/              # Pont vers le Reasoning Engine de L'Étudiant
    └── index.py             # Vertex AI (Google Cloud)
```

## Fonctionnalités

- **Chat ORI** avec réponses sourcées (web search restreint aux sites de confiance)
- **Pop-ups proactives** : fiches métier, salons, vidéos de pro, articles — animées slide-in
- **Biais positif** d'élargissement d'horizon (alternatives géographiques, financières, voies post-bac alternatives) signalées par un badge orange
- **Dashboard profil** : KPIs personnalisés, historique de conversations
- **Onboarding** progressif pour construire le profil utilisateur
- **Comparaison** de formations / métiers
- **Deadlines & rappels email** (Parcoursup, concours…)
- **Widget embeddable** pour intégration sur sites partenaires


