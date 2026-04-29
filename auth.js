/**
 * AuthModal — modale connexion / inscription en overlay.
 * Utilise ProfileStore pour les appels API.
 */
const AuthModal = (() => {
    let overlay = null;
    let mode = 'register';   // 'register' | 'login'
    let onSuccess = null;

    function ensureMounted() {
        if (overlay) return;
        overlay = document.createElement('div');
        overlay.className = 'auth-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = `
            <div class="auth-modal" role="dialog" aria-labelledby="auth-title">
                <button class="auth-close" type="button" aria-label="Fermer">×</button>
                <h2 id="auth-title" class="auth-title">Sauvegarder mon profil</h2>
                <p class="auth-subtitle">Crée ton compte en 30 secondes pour retrouver ton profil à chaque visite.</p>
                <form class="auth-form" novalidate>
                    <label class="auth-field">
                        <span>Email</span>
                        <input type="email" name="email" required autocomplete="email" />
                    </label>
                    <label class="auth-field">
                        <span>Mot de passe</span>
                        <input type="password" name="password" required minlength="8" autocomplete="new-password" />
                        <small class="auth-hint">8 caractères minimum</small>
                    </label>
                    <p class="auth-error" hidden></p>
                    <button type="submit" class="auth-submit">Créer mon compte</button>
                </form>
                <p class="auth-switch">
                    <span class="auth-switch-text">Tu as déjà un compte ?</span>
                    <button type="button" class="auth-switch-btn">Connecte-toi</button>
                </p>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
        overlay.querySelector('.auth-close').addEventListener('click', close);
        overlay.querySelector('.auth-form').addEventListener('submit', onSubmit);
        overlay.querySelector('.auth-switch-btn').addEventListener('click', toggleMode);
    }

    function applyMode() {
        const title = overlay.querySelector('.auth-title');
        const subtitle = overlay.querySelector('.auth-subtitle');
        const submit = overlay.querySelector('.auth-submit');
        const switchText = overlay.querySelector('.auth-switch-text');
        const switchBtn = overlay.querySelector('.auth-switch-btn');
        const passwordInput = overlay.querySelector('input[name="password"]');
        const hint = overlay.querySelector('.auth-hint');

        if (mode === 'register') {
            title.textContent = 'Sauvegarder mon profil';
            subtitle.textContent = 'Crée ton compte en 30 secondes pour retrouver ton profil à chaque visite.';
            submit.textContent = 'Créer mon compte';
            switchText.textContent = 'Tu as déjà un compte ?';
            switchBtn.textContent = 'Connecte-toi';
            passwordInput.setAttribute('autocomplete', 'new-password');
            passwordInput.setAttribute('minlength', '8');
            hint.style.display = '';
        } else {
            title.textContent = 'Connexion';
            subtitle.textContent = 'Retrouve ton profil et tes conversations précédentes.';
            submit.textContent = 'Se connecter';
            switchText.textContent = 'Pas encore de compte ?';
            switchBtn.textContent = 'Inscris-toi';
            passwordInput.setAttribute('autocomplete', 'current-password');
            passwordInput.removeAttribute('minlength');
            hint.style.display = 'none';
        }
    }

    function toggleMode() {
        mode = mode === 'register' ? 'login' : 'register';
        applyMode();
        showError('');
    }

    function showError(msg) {
        const err = overlay.querySelector('.auth-error');
        if (msg) {
            err.textContent = msg;
            err.hidden = false;
        } else {
            err.textContent = '';
            err.hidden = true;
        }
    }

    async function onSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const email = form.email.value.trim();
        const password = form.password.value;
        const submit = form.querySelector('.auth-submit');

        showError('');
        if (!email || !password) {
            showError('Email et mot de passe requis.');
            return;
        }
        submit.disabled = true;
        submit.textContent = mode === 'register' ? 'Création…' : 'Connexion…';

        try {
            if (mode === 'register') {
                await ProfileStore.register(email, password);
            } else {
                await ProfileStore.login(email, password);
            }
            close();
            if (typeof onSuccess === 'function') onSuccess();
        } catch (err) {
            showError(err.message || 'Erreur, réessaye.');
        } finally {
            submit.disabled = false;
            submit.textContent = mode === 'register' ? 'Créer mon compte' : 'Se connecter';
        }
    }

    function open(opts = {}) {
        ensureMounted();
        mode = opts.mode || 'register';
        onSuccess = opts.onSuccess || null;
        applyMode();
        showError('');
        overlay.querySelector('.auth-form').reset();
        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');
        setTimeout(() => overlay.querySelector('input[name="email"]').focus(), 50);
    }

    function close() {
        if (!overlay) return;
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden', 'true');
    }

    return { open, close };
})();

window.AuthModal = AuthModal;
