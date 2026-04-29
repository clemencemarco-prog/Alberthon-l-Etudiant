/**
 * ProfileStore — état du profil étudiant + sync avec le backend.
 *
 * Trois sources de vérité possibles, dans l'ordre :
 *   1. Utilisateur connecté → DB (via /api/me.php au chargement, /api/profile.php pour sauvegarde)
 *   2. Utilisateur anonyme → localStorage (clé: ori_profile_v1)
 *   3. Aucun profil → null
 *
 * Lorsqu'un utilisateur s'inscrit alors qu'il avait un profil anonyme,
 * celui-ci est automatiquement migré en DB après inscription.
 */
const ProfileStore = (() => {
    const LS_PROFILE_KEY = 'ori_profile_v1';

    let _user = null;       // {id, email} ou null si pas connecté
    let _profile = null;    // {niveau, filiere, specialites, ...} ou null
    let _onChange = [];     // listeners (mini-card, etc.)

    function notify() {
        _onChange.forEach(fn => { try { fn(); } catch (e) { console.warn(e); } });
    }

    function isProfileFilled(p) {
        if (!p || typeof p !== 'object') return false;
        return Boolean(p.niveau || p.projet_type
            || (Array.isArray(p.contraintes) && p.contraintes.length)
            || (Array.isArray(p.gouts) && p.gouts.length));
    }

    return {
        /** À appeler au chargement de la page. Tente l'auto-login + récup profil. */
        async init() {
            // 1. Restaure profil anonyme depuis localStorage
            try {
                const raw = localStorage.getItem(LS_PROFILE_KEY);
                if (raw) _profile = JSON.parse(raw);
            } catch {}

            // 2. Tente l'auto-login via cookie /api/me.php
            try {
                const res = await fetch('/api/me.php', { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    _user = data.user;
                    if (data.profile) _profile = data.profile;
                }
            } catch {}

            notify();
        },

        getUser()        { return _user; },
        getProfile()     { return _profile; },
        isLoggedIn()     { return _user !== null; },
        hasProfile()     { return isProfileFilled(_profile); },

        onChange(fn)     { _onChange.push(fn); },

        /** Met à jour le profil et persiste (DB si connecté, localStorage sinon). */
        async saveProfile(profile) {
            if (_user) {
                const res = await fetch('/api/profile.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(profile)
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.message || 'Erreur sauvegarde profil');
                }
                const data = await res.json();
                _profile = data.profile;
            } else {
                _profile = profile;
                try { localStorage.setItem(LS_PROFILE_KEY, JSON.stringify(profile)); } catch {}
            }
            notify();
            return _profile;
        },

        async login(email, password) {
            const res = await fetch('/api/login.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Échec de connexion');
            _user = data.user;
            if (data.profile) _profile = data.profile;
            try { localStorage.removeItem(LS_PROFILE_KEY); } catch {}
            notify();
            return data;
        },

        /** Inscription. Si un profil anonyme existe, on le migre en DB après. */
        async register(email, password) {
            const anonProfile = isProfileFilled(_profile) ? _profile : null;
            const res = await fetch('/api/register.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Échec d\'inscription');
            _user = data.user;
            _profile = data.profile;
            // Migration du profil anonyme en DB
            if (anonProfile) {
                try { await this.saveProfile(anonProfile); } catch (e) { console.warn(e); }
            }
            try { localStorage.removeItem(LS_PROFILE_KEY); } catch {}
            notify();
            return data;
        },

        async logout() {
            try {
                await fetch('/api/logout.php', { method: 'POST', credentials: 'include' });
            } catch {}
            _user = null;
            _profile = null;
            try { localStorage.removeItem(LS_PROFILE_KEY); } catch {}
            notify();
        },

        /** Renvoie le profil sous la forme attendue par /api/chat.php (sans wrapping user). */
        getProfileForChat() {
            return _profile;
        }
    };
})();

window.ProfileStore = ProfileStore;
