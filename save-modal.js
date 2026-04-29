/**
 * SaveModal — modale "Sauvegarder dans mon tableau de bord".
 *
 * Flow :
 *  1. SaveModal.open({lastAssistantMessage, conversationHistory})
 *  2. Affichage en mode "loading" pendant que /api/dashboard/extract-from-chat.php tourne
 *  3. Pré-remplissage avec les suggestions Claude (titre, description, actions, documents)
 *  4. L'utilisateur édite + coche / décoche
 *  5. Au submit : POST piste, puis POST chaque action / document cochés
 *  6. Toast de confirmation, fermeture
 */
const SaveModal = (() => {
    let overlay = null;
    let suggestions = null;
    let context = null;     // {lastAssistantMessage, conversationHistory}

    function ensureMounted() {
        if (overlay) return;
        overlay = document.createElement('div');
        overlay.className = 'save-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = `
            <div class="save-modal" role="dialog" aria-labelledby="save-title">
                <button class="save-close" type="button" aria-label="Fermer">×</button>
                <h2 id="save-title" class="save-title">📌 Sauvegarder dans mon tableau de bord</h2>
                <p class="save-subtitle">ORI analyse la conversation pour pré-remplir tes éléments à sauvegarder.</p>

                <div class="save-loading" id="save-loading">
                    <span class="save-spinner"></span>
                    <p>ORI extrait les pistes, actions et documents…</p>
                </div>

                <form class="save-form" id="save-form" hidden novalidate>
                    <fieldset class="save-section">
                        <legend>Piste de réflexion</legend>
                        <label class="save-field">
                            <span>Titre</span>
                            <input type="text" name="piste_titre" required maxlength="200">
                        </label>
                        <label class="save-field">
                            <span>Description</span>
                            <textarea name="piste_description" rows="2" maxlength="800"></textarea>
                        </label>
                    </fieldset>

                    <fieldset class="save-section save-section--actions">
                        <legend>Actions à faire</legend>
                        <p class="save-hint">ORI a détecté ces actions. Décoche celles que tu ne veux pas, édite les autres.</p>
                        <div class="save-suggestions" id="save-actions"></div>
                        <button type="button" class="save-add-btn" id="save-add-action">+ Ajouter une action</button>
                    </fieldset>

                    <fieldset class="save-section save-section--docs">
                        <legend>Documents à préparer</legend>
                        <p class="save-hint">ORI a détecté ces documents pour cette piste.</p>
                        <div class="save-suggestions" id="save-documents"></div>
                        <button type="button" class="save-add-btn" id="save-add-doc">+ Ajouter un document</button>
                    </fieldset>

                    <p class="save-error" hidden></p>
                    <div class="save-buttons">
                        <button type="button" class="save-btn save-btn--ghost" id="save-cancel">Annuler</button>
                        <button type="submit" class="save-btn save-btn--primary" id="save-submit">💾 Enregistrer</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('.save-close').addEventListener('click', close);
        overlay.querySelector('#save-cancel').addEventListener('click', close);
        overlay.querySelector('#save-form').addEventListener('submit', onSubmit);
        overlay.querySelector('#save-add-action').addEventListener('click', () => addActionRow({}));
        overlay.querySelector('#save-add-doc').addEventListener('click', () => addDocRow({}));
    }

    function showLoading(yes) {
        overlay.querySelector('#save-loading').hidden = !yes;
        overlay.querySelector('#save-form').hidden = yes;
    }

    function showError(msg) {
        const err = overlay.querySelector('.save-error');
        if (msg) {
            err.textContent = msg;
            err.hidden = false;
        } else {
            err.textContent = '';
            err.hidden = true;
        }
    }

    function addActionRow(data) {
        const container = overlay.querySelector('#save-actions');
        const row = document.createElement('div');
        row.className = 'save-suggestion-row';
        row.innerHTML = `
            <input type="checkbox" class="save-row-check" ${data.titre ? 'checked' : ''}>
            <div class="save-row-fields">
                <input type="text" placeholder="Action à faire (ex: Confirmer mes vœux)" class="save-row-titre" value="${escapeAttr(data.titre || '')}" maxlength="200">
                <div class="save-row-meta">
                    <input type="date" class="save-row-date" value="${escapeAttr(data.date_echeance || '')}">
                    <input type="url" placeholder="URL (optionnel)" class="save-row-url" value="${escapeAttr(data.url_externe || '')}">
                </div>
            </div>
            <button type="button" class="save-row-remove" aria-label="Retirer">×</button>
        `;
        row.querySelector('.save-row-remove').addEventListener('click', () => row.remove());
        container.appendChild(row);
    }

    function addDocRow(data) {
        const container = overlay.querySelector('#save-documents');
        const row = document.createElement('div');
        row.className = 'save-suggestion-row';
        const cats = [
            ['dossier_scolaire',  'Dossier scolaire'],
            ['lettre_motivation', 'Lettre de motivation'],
            ['justificatif',      'Justificatif'],
            ['formulaire',        'Formulaire'],
            ['autre',             'Autre'],
        ];
        const opts = cats.map(([v, l]) =>
            `<option value="${v}" ${data.categorie === v ? 'selected' : ''}>${l}</option>`
        ).join('');
        row.innerHTML = `
            <input type="checkbox" class="save-row-check" ${data.titre ? 'checked' : ''}>
            <div class="save-row-fields">
                <input type="text" placeholder="Document à préparer" class="save-row-titre" value="${escapeAttr(data.titre || '')}" maxlength="200">
                <select class="save-row-cat">${opts}</select>
            </div>
            <button type="button" class="save-row-remove" aria-label="Retirer">×</button>
        `;
        row.querySelector('.save-row-remove').addEventListener('click', () => row.remove());
        container.appendChild(row);
    }

    function escapeAttr(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    async function open(opts = {}) {
        ensureMounted();
        context = opts;
        suggestions = null;
        showLoading(true);
        showError('');
        // Reset form
        overlay.querySelector('input[name="piste_titre"]').value = '';
        overlay.querySelector('textarea[name="piste_description"]').value = '';
        overlay.querySelector('#save-actions').innerHTML = '';
        overlay.querySelector('#save-documents').innerHTML = '';

        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');

        try {
            const res = await fetch('/api/dashboard/extract-from-chat.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    messages: opts.conversationHistory || [],
                    last_assistant_message: opts.lastAssistantMessage || '',
                }),
            });
            const data = await res.json().catch(() => ({}));
            suggestions = data;
        } catch (e) {
            console.warn('[ORI] extract failed', e);
            suggestions = { suggested_piste: null, suggested_actions: [], suggested_documents: [] };
        }
        populateForm();
        showLoading(false);
    }

    function populateForm() {
        const sp = suggestions?.suggested_piste;
        if (sp) {
            overlay.querySelector('input[name="piste_titre"]').value = sp.titre || '';
            overlay.querySelector('textarea[name="piste_description"]').value = sp.description || '';
        }
        const sa = Array.isArray(suggestions?.suggested_actions) ? suggestions.suggested_actions : [];
        sa.forEach(a => addActionRow(a));
        const sd = Array.isArray(suggestions?.suggested_documents) ? suggestions.suggested_documents : [];
        sd.forEach(d => addDocRow(d));
        // Au moins une ligne vide si vide pour pouvoir ajouter facilement
        if (!sa.length) addActionRow({});
        if (!sd.length) addDocRow({});
        setTimeout(() => {
            overlay.querySelector('input[name="piste_titre"]').focus();
            overlay.querySelector('input[name="piste_titre"]').select();
        }, 50);
    }

    /**
     * Wrapper fetch + parse JSON tolérant.
     * Si la réponse est du HTML (endpoint absent / erreur PHP), renvoie une
     * erreur explicite mentionnant l'URL en cause.
     */
    async function postJson(url, body) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
        });
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
            const preview = (await res.text()).slice(0, 80);
            throw new Error(
                `Endpoint ${url} non disponible (status ${res.status}). ` +
                `Réponse non-JSON : "${preview.replace(/\s+/g, ' ')}…". ` +
                `Vérifie que le fichier est bien uploadé sur Bookmyname.`
            );
        }
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.message || `Erreur HTTP ${res.status} sur ${url}`);
        }
        return data;
    }

    async function onSubmit(e) {
        e.preventDefault();
        showError('');
        const titre = overlay.querySelector('input[name="piste_titre"]').value.trim();
        const description = overlay.querySelector('textarea[name="piste_description"]').value.trim();
        if (!titre) {
            showError('Le titre de la piste est obligatoire.');
            return;
        }
        const submit = overlay.querySelector('#save-submit');
        submit.disabled = true;
        submit.textContent = 'Sauvegarde…';

        try {
            // 1. Save piste
            const pisteData = await postJson('/api/dashboard/save-piste.php', {
                titre,
                description,
                source_message: (context?.lastAssistantMessage || '').slice(0, 1000),
                conversation_id: context?.conversationId || null,
            });
            if (!pisteData.piste) throw new Error('Réponse sans piste');
            const pisteId = pisteData.piste.id;

            // 2. Save chaque action cochée
            const actionRows = overlay.querySelectorAll('#save-actions .save-suggestion-row');
            for (const row of actionRows) {
                if (!row.querySelector('.save-row-check').checked) continue;
                const t = row.querySelector('.save-row-titre').value.trim();
                if (!t) continue;
                const date = row.querySelector('.save-row-date').value || null;
                const url = row.querySelector('.save-row-url').value.trim() || null;
                await postJson('/api/dashboard/save-action.php', {
                    piste_id: pisteId,
                    titre: t,
                    date_echeance: date,
                    url_externe: url,
                    auto_generated: true,
                });
            }

            // 3. Save chaque document coché
            const docRows = overlay.querySelectorAll('#save-documents .save-suggestion-row');
            for (const row of docRows) {
                if (!row.querySelector('.save-row-check').checked) continue;
                const t = row.querySelector('.save-row-titre').value.trim();
                if (!t) continue;
                const cat = row.querySelector('.save-row-cat').value;
                await postJson('/api/dashboard/save-document.php', {
                    piste_id: pisteId,
                    titre: t,
                    categorie: cat,
                    auto_generated: true,
                });
            }

            close();
            // Toast léger via window.ChatBanner si disponible
            if (window.ChatBanner && typeof ChatBanner.refresh === 'function') {
                ChatBanner.refresh();
            }
            if (window.OriToast) OriToast.show('✅ Sauvegardé dans ton tableau de bord');
            else alert('Sauvegardé dans ton tableau de bord !');
        } catch (err) {
            showError(err.message || 'Erreur lors de la sauvegarde.');
        } finally {
            submit.disabled = false;
            submit.textContent = '💾 Enregistrer';
        }
    }

    function close() {
        if (!overlay) return;
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden', 'true');
    }

    return { open, close };
})();

window.SaveModal = SaveModal;


// =============================================================================
// OriToast — petit toast de confirmation utilisé par save-modal et chat
// =============================================================================
const OriToast = (() => {
    let el = null;
    function ensure() {
        if (el) return;
        el = document.createElement('div');
        el.className = 'ori-toast';
        document.body.appendChild(el);
    }
    function show(message, kind = 'success', duration = 2500) {
        ensure();
        el.textContent = message;
        el.className = 'ori-toast ori-toast--' + kind + ' is-visible';
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove('is-visible'), duration);
    }
    return { show };
})();
window.OriToast = OriToast;
