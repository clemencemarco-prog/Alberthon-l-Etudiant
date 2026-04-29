    /**
     * Comparaison interactive — Module 3 du livrable.
     * Permet à l'étudiant de cocher 2-3 popups (formation/métier/école/livre/salon)
     * et d'afficher un tableau comparatif côte-à-côte généré par Claude.
     */
    const ComparisonManager = (() => {
        const MAX = 3;
        const MIN = 2;
        const selected = new Map(); // id -> { id, type, title, url, source }

        function refreshBar() {
            const bar = document.getElementById('compare-bar');
            const count = document.getElementById('compare-bar-count');
            const btn = document.getElementById('compare-bar-action');
            if (!bar) return;

            // Vocabulaire adapté au contexte (dashboard = "piste", chat = "option")
            const onDashboard = /dashboard\.php/.test(location.pathname);
            const word = onDashboard ? 'piste' : 'option';
            const wordPlural = onDashboard ? 'pistes' : 'options';

            const n = selected.size;
            if (n >= 1) {
                bar.classList.add('is-visible');
                if (count) {
                    count.textContent = n === 1
                        ? `1 ${word} sélectionnée`
                        : `${n} ${wordPlural} sélectionnées`;
                }
                if (btn) {
                    btn.disabled = n < MIN;
                    btn.textContent = n < MIN
                        ? `Sélectionne au moins ${MIN} ${wordPlural}`
                        : `Comparer maintenant`;
                }
            } else {
                bar.classList.remove('is-visible');
            }
        }

        function add(option) {
            if (selected.size >= MAX) {
                alert(`Tu peux comparer au maximum ${MAX} options à la fois. Décoche-en une avant d'en ajouter une autre.`);
                return false;
            }
            selected.set(option.id, option);
            refreshBar();
            return true;
        }

        function remove(id) {
            selected.delete(id);
            refreshBar();
        }

        function has(id) {
            return selected.has(id);
        }

        function clear() {
            selected.clear();
            refreshBar();
            // Décoche les checkboxes côté chat (popups) ET côté dashboard (pistes)
            document.querySelectorAll('.popup__compare-checkbox').forEach(cb => {
                cb.checked = false;
                cb.closest('.popup')?.classList.remove('popup--selected-compare');
            });
            document.querySelectorAll('.piste-compare-checkbox').forEach(cb => {
                cb.checked = false;
                cb.closest('.piste-card')?.classList.remove('piste-card--selected-compare');
            });
        }

        function getList() {
            return Array.from(selected.values());
        }

        // ----------------- Modale de comparaison -----------------
        async function openModal() {
            if (selected.size < MIN) return;

            const overlay  = document.getElementById('compare-overlay');
            const inner    = document.getElementById('compare-modal');
            const closeBtn = document.getElementById('compare-close');
            const body     = document.getElementById('compare-body');
            if (!overlay || !inner || !body) {
                console.error('[compare] Modale absente du DOM');
                return;
            }

            // Loader pendant l'appel API
            body.innerHTML = renderLoader();
            overlay.classList.add('is-open');
            document.body.style.overflow = 'hidden';

            // Récupération du profil (si dispo dans le store local)
            let profile = null;
            try {
                if (window.ProfileStore && typeof window.ProfileStore.get === 'function') {
                    profile = window.ProfileStore.get();
                }
            } catch { /* best effort */ }

            const optionsToCompare = getList();

            try {
                const res = await fetch('/api/compare.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        options: optionsToCompare,
                        profile: profile,
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.message || 'Erreur ' + res.status);
                body.innerHTML = renderTable(data, optionsToCompare);
            } catch (err) {
                console.error('[compare]', err);
                body.innerHTML = renderError(err.message);
            }

            // Wire close handlers (réattachés à chaque ouverture pour éviter les doublons)
            const closeFn = () => closeModal();
            closeBtn.onclick = closeFn;
            overlay.onclick = (e) => { if (e.target === overlay) closeFn(); };
            document.addEventListener('keydown', escHandler);
        }

        function closeModal() {
            const overlay = document.getElementById('compare-overlay');
            if (overlay) overlay.classList.remove('is-open');
            document.body.style.overflow = '';
            document.removeEventListener('keydown', escHandler);
        }

        function escHandler(e) {
            if (e.key === 'Escape') closeModal();
        }

        function escapeHtml(s) {
            return String(s ?? '').replace(/[&<>"']/g, c => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[c]));
        }

        function renderLoader() {
            return `
                <div class="compare-loader">
                    <div class="compare-spinner"></div>
                    <p class="compare-loader__text">ORI compare les options…</p>
                    <p class="compare-loader__sub">Ça peut prendre 20-40 secondes — Claude croise les sources sur Onisep, France Travail et L'Etudiant.</p>
                </div>
            `;
        }

        function renderError(msg) {
            return `
                <div class="compare-error">
                    <p><strong>Comparaison impossible</strong></p>
                    <p class="compare-error__msg">${escapeHtml(msg || 'Erreur inconnue')}</p>
                    <button type="button" class="compare-retry" onclick="ComparisonManager.openModal()">Réessayer</button>
                </div>
            `;
        }

        function renderTable(data, options) {
            const criteria = Array.isArray(data.criteria) ? data.criteria : [];
            const synthesis = data.synthesis || '';

            // Cas dégradé : pas de critères mais une synthèse → on affiche au moins la synthèse
            if (criteria.length === 0) {
                const optionsList = options.map(o =>
                    `<li><strong>${escapeHtml(o.title)}</strong>${o.source ? ` <em>(${escapeHtml(o.source)})</em>` : ''}</li>`
                ).join('');
                return `
                    <div class="compare-fallback">
                        <p class="compare-fallback__intro">Tableau structuré indisponible pour cette comparaison, mais ORI a tout de même une analyse :</p>
                        <ul class="compare-fallback__options">${optionsList}</ul>
                    </div>
                    <div class="compare-synthesis">
                        <div class="compare-synthesis__label">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                            L'avis d'ORI
                        </div>
                        <p class="compare-synthesis__text">${escapeHtml(synthesis)}</p>
                    </div>
                    <button type="button" class="compare-retry" onclick="ComparisonManager.openModal()" style="margin-top:14px;">Retenter pour obtenir un tableau structuré</button>
                `;
            }

            // En-tête : 1 colonne par option
            const headerCells = options.map(o => `
                <th class="compare-table__head">
                    <div class="compare-table__head-title">${escapeHtml(o.title)}</div>
                    <div class="compare-table__head-source">${escapeHtml(o.source || '')}</div>
                    ${o.url ? `<a class="compare-table__head-link" href="${escapeHtml(o.url)}" target="_blank" rel="noopener noreferrer">Voir la source ↗</a>` : ''}
                </th>
            `).join('');

            // Lignes critères
            const rows = criteria.map(c => {
                const cells = c.values.map(v => `<td class="compare-table__cell">${escapeHtml(v)}</td>`).join('');
                return `
                    <tr>
                        <th class="compare-table__row-label">${escapeHtml(c.label)}</th>
                        ${cells}
                    </tr>
                `;
            }).join('');

            const synthesisHtml = synthesis ? `
                <div class="compare-synthesis">
                    <div class="compare-synthesis__label">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                        L'avis d'ORI
                    </div>
                    <p class="compare-synthesis__text">${escapeHtml(synthesis)}</p>
                </div>
            ` : '';

            return `
                <div class="compare-table-wrap">
                    <table class="compare-table">
                        <thead>
                            <tr>
                                <th class="compare-table__row-label compare-table__head--corner">Critère</th>
                                ${headerCells}
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                ${synthesisHtml}
            `;
        }

        // ---- Modale "Comparer librement" : l'utilisateur tape 2-3 noms d'options ----
        function openFreeFormModal() {
            const overlay  = document.getElementById('compare-overlay');
            const inner    = document.getElementById('compare-modal');
            const closeBtn = document.getElementById('compare-close');
            const body     = document.getElementById('compare-body');
            if (!overlay || !inner || !body) {
                console.error('[compare] Modale absente du DOM');
                return;
            }

            body.innerHTML = `
                <div class="compare-form">
                    <p class="compare-form__intro">
                        Tape 2 ou 3 options à comparer (formations, métiers, écoles, livres…).
                        ORI cherchera les infos sur les sources de confiance et générera un tableau côte-à-côte.
                    </p>
                    <label class="compare-form__field">
                        <span>Option 1 *</span>
                        <input type="text" id="compare-free-1" placeholder="Ex : PASS médecine" maxlength="120" required>
                    </label>
                    <label class="compare-form__field">
                        <span>Option 2 *</span>
                        <input type="text" id="compare-free-2" placeholder="Ex : BUT Carrières sociales" maxlength="120" required>
                    </label>
                    <label class="compare-form__field">
                        <span>Option 3 (optionnel)</span>
                        <input type="text" id="compare-free-3" placeholder="Ex : BTS SP3S" maxlength="120">
                    </label>
                    <div class="compare-form__actions">
                        <button type="button" class="compare-form__cancel" id="compare-free-cancel">Annuler</button>
                        <button type="button" class="compare-form__submit" id="compare-free-submit">Lancer la comparaison</button>
                    </div>
                </div>
            `;

            overlay.classList.add('is-open');
            document.body.style.overflow = 'hidden';

            setTimeout(() => {
                const first = document.getElementById('compare-free-1');
                if (first) first.focus();
            }, 100);

            const closeFn = () => closeModal();
            closeBtn.onclick = closeFn;
            overlay.onclick = (e) => { if (e.target === overlay) closeFn(); };
            document.addEventListener('keydown', escHandler);

            document.getElementById('compare-free-cancel').onclick = closeFn;
            document.getElementById('compare-free-submit').onclick = async () => {
                const v1 = (document.getElementById('compare-free-1').value || '').trim();
                const v2 = (document.getElementById('compare-free-2').value || '').trim();
                const v3 = (document.getElementById('compare-free-3').value || '').trim();

                if (!v1 || !v2) {
                    alert('Au moins 2 options sont nécessaires pour comparer.');
                    return;
                }

                // Construit la liste d'options "libres" et les met dans le manager
                clear();
                const opts = [
                    { id: 'free::1', type: 'libre', title: v1, url: '', source: '' },
                    { id: 'free::2', type: 'libre', title: v2, url: '', source: '' },
                ];
                if (v3) opts.push({ id: 'free::3', type: 'libre', title: v3, url: '', source: '' });
                opts.forEach(o => selected.set(o.id, o));

                // Lance la comparaison comme d'habitude
                await openModal();
            };
        }

        // ---- API publique ----
        return { add, remove, has, clear, getList, openModal, openFreeFormModal, closeModal };
    })();

    // Init : wire le bouton de la floating bar
    document.addEventListener('DOMContentLoaded', () => {
        const actionBtn = document.getElementById('compare-bar-action');
        const closeBar  = document.getElementById('compare-bar-close');
        if (actionBtn) {
            actionBtn.addEventListener('click', () => ComparisonManager.openModal());
        }
        if (closeBar) {
            closeBar.addEventListener('click', () => ComparisonManager.clear());
        }
    });

    window.ComparisonManager = ComparisonManager;
