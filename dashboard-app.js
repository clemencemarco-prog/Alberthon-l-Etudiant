/**
 * Dashboard ORI — script principal de la page dashboard.php.
 * Charge les données via /api/dashboard/list.php et hydrate les 4 zones.
 */
(function () {
    'use strict';

    const API = {
        list:           '/api/dashboard/list.php',
        savePiste:      '/api/dashboard/save-piste.php',
        saveAction:     '/api/dashboard/save-action.php',
        saveDoc:        '/api/dashboard/save-document.php',
        updatePiste:    '/api/dashboard/update-piste.php',
        updateAction:   '/api/dashboard/update-action.php',
        updateDoc:      '/api/dashboard/update-document.php',
        deletePiste:    '/api/dashboard/delete-piste.php',
        deleteAction:   '/api/dashboard/delete-action.php',
        deleteDoc:      '/api/dashboard/delete-document.php',
        sendReminders:  '/api/dashboard/send-reminders.php',
        logout:         '/api/logout.php',
    };

    // ------------------------------------------------------------
    // State
    // ------------------------------------------------------------
    const state = {
        pistes: [],
        actions: [],
        documents: [],
        stats: {},
    };

    // ------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------
    async function apiPost(url, body = {}) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Erreur ' + res.status);
        return data;
    }

    async function apiGet(url) {
        const res = await fetch(url, { credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Erreur ' + res.status);
        return data;
    }

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function daysUntil(dateStr) {
        if (!dateStr) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const d = new Date(dateStr + 'T00:00:00');
        return Math.round((d - today) / 86400000);
    }

    function formatRelativeDays(n) {
        if (n === null) return 'Date inconnue';
        if (n < 0) return `En retard de ${-n} jour${-n > 1 ? 's' : ''}`;
        if (n === 0) return "Aujourd'hui";
        if (n === 1) return 'Demain';
        if (n < 7) return `Dans ${n} jours`;
        if (n < 30) return `Dans ${n} jours`;
        return `Dans ${n} jours`;
    }

    function deadlineUrgencyClass(n) {
        if (n === null) return 'deadline-card--later';
        if (n < 0) return 'deadline-card--overdue';
        if (n < 7) return 'deadline-card--urgent';
        if (n < 30) return 'deadline-card--soon';
        return 'deadline-card--later';
    }

    function statutLabel(s) {
        return ({
            active:        'Active',
            en_suspens:    'En suspens',
            abandonnee:    'Abandonnée',
            a_faire:       'À faire',
            en_cours:      'En cours',
            fait:          'Fait',
            a_preparer:    'À préparer',
            pret:          'Prêt',
        })[s] || s;
    }

    function categorieLabel(c) {
        return ({
            dossier_scolaire:  '📂 Dossier scolaire',
            lettre_motivation: '✉️ Lettres de motivation',
            justificatif:     '📋 Justificatifs',
            formulaire:       '📝 Formulaires',
            autre:            '📎 Autres',
        })[c] || c;
    }

    function showToast(message, kind = 'success') {
        const el = document.getElementById('toast');
        if (!el) return;
        el.textContent = message;
        el.className = 'toast toast--' + kind;
        el.hidden = false;
        requestAnimationFrame(() => el.classList.add('is-visible'));
        setTimeout(() => {
            el.classList.remove('is-visible');
            setTimeout(() => { el.hidden = true; }, 250);
        }, 2500);
    }

    // ------------------------------------------------------------
    // Fetch + render
    // ------------------------------------------------------------
    async function loadAndRender() {
        try {
            const data = await apiGet(API.list);
            state.pistes = data.pistes || [];
            state.actions = data.actions || [];
            state.documents = data.documents || [];
            state.stats = data.stats || {};
            renderAll();
        } catch (err) {
            console.error(err);
            showToast('Impossible de charger ton tableau de bord', 'error');
        }
    }

    function renderAll() {
        renderStats();
        renderPistes();
        renderDeadlines();
        renderDocuments();
    }

    function renderStats() {
        const el = document.getElementById('dashboard-stats');
        if (!el) return;
        const s = state.stats;
        const items = [];
        items.push(`<span class="stat-pill">📍 <strong>${s.nb_pistes_actives ?? 0}</strong>&nbsp;pistes actives</span>`);
        if (s.nb_overdue) {
            items.push(`<span class="stat-pill stat-pill--urgent">⏰ <strong>${s.nb_overdue}</strong>&nbsp;en retard</span>`);
        }
        items.push(`<span class="stat-pill">📅 <strong>${s.nb_deadlines_7d ?? 0}</strong>&nbsp;dans 7 jours</span>`);
        items.push(`<span class="stat-pill">🗓️ <strong>${s.nb_deadlines_30d ?? 0}</strong>&nbsp;dans 30 jours</span>`);
        items.push(`<span class="stat-pill">📂 <strong>${state.documents.length}</strong>&nbsp;documents</span>`);
        el.innerHTML = items.join('');
    }

    function renderPistes() {
        const el = document.getElementById('pistes-list');
        if (!el) return;
        if (!state.pistes.length) {
            el.innerHTML = `<p class="zone__empty">Aucune piste pour l'instant. Pose une question à ORI dans le chat puis clique sur 📌 Sauvegarder pour créer ta première piste.</p>`;
            return;
        }
        el.innerHTML = state.pistes.map(renderPisteCard).join('');
        wirePisteCards(el);
    }

    // Mémorise quelles pistes sont actuellement déroulées / en édition (persistance UX)
    const expandedPistes = new Set();
    const editingPistes  = new Set();

    function renderPisteCard(p) {
        const actionsForPiste = state.actions.filter(a => a.piste_id == p.id);
        const docsForPiste = state.documents.filter(d => d.piste_id == p.id);
        const created = p.created_at ? p.created_at.split(' ')[0] : '';
        const isExpanded = expandedPistes.has(p.id);
        const isEditing  = editingPistes.has(p.id);

        // Mode édition : on remplace l'en-tête par un formulaire avec bouton 💾 Sauvegarder
        const headerHtml = isEditing
            ? `<div class="piste-edit-form">
                   <label class="piste-edit-label">Titre de la piste</label>
                   <input type="text" class="piste-edit-titre" value="${escapeHtml(p.titre)}" placeholder="Ex : Médecine à Paris" maxlength="255">
                   <label class="piste-edit-label">Description (optionnel)</label>
                   <textarea class="piste-edit-desc" placeholder="Pourquoi cette piste t'intéresse, ce que tu en sais déjà…" rows="3">${escapeHtml(p.description || '')}</textarea>
                   <div class="piste-edit-actions">
                       <button class="piste-edit-save" data-action="save-edit">💾 Sauvegarder</button>
                       <button class="piste-edit-cancel" data-action="cancel-edit">Annuler</button>
                   </div>
               </div>`
            : `<header class="piste-card__header" data-action="toggle-expand">
                   <span class="piste-card__statut-dot piste-card__statut-dot--${p.statut}" title="${statutLabel(p.statut)}"></span>
                   <h3 class="piste-card__titre">${escapeHtml(p.titre)}</h3>
                   <span class="piste-card__chevron">▾</span>
               </header>
               ${p.description ? `<p class="piste-card__description">${escapeHtml(p.description)}</p>` : ''}`;

        return `
            <article class="piste-card piste-card--${p.statut} ${isExpanded ? 'is-expanded' : ''} ${isEditing ? 'is-editing' : ''}" data-piste-id="${p.id}">
                ${headerHtml}
                <div class="piste-card__meta">
                    <span class="piste-card__meta-item">📅 ${actionsForPiste.length} action${actionsForPiste.length > 1 ? 's' : ''}</span>
                    <span class="piste-card__meta-item">📂 ${docsForPiste.length} document${docsForPiste.length > 1 ? 's' : ''}</span>
                    <span class="piste-card__meta-item">⏱ Créée le ${created}</span>
                </div>
                <div class="piste-card__actions">
                    <button class="piste-action-mini ${p.statut === 'active' ? 'is-active' : ''}" data-action="set-statut" data-statut="active">Active</button>
                    <button class="piste-action-mini ${p.statut === 'en_suspens' ? 'is-active' : ''}" data-action="set-statut" data-statut="en_suspens">En suspens</button>
                    <button class="piste-action-mini ${p.statut === 'abandonnee' ? 'is-active' : ''}" data-action="set-statut" data-statut="abandonnee">Abandonnée</button>
                    <button class="piste-action-mini" data-action="edit">✏️ Modifier</button>
                    <button class="piste-action-mini" data-action="delete">🗑 Supprimer</button>
                    <label class="piste-action-mini piste-compare-toggle" data-action="compare-toggle" title="Cocher pour comparer cette piste avec d'autres">
                        <input type="checkbox" class="piste-compare-checkbox" data-piste-id="${p.id}">
                        📊 Comparer
                    </label>
                </div>

                <!-- Section déroulable : synthèse complète -->
                <div class="piste-card__details" ${isExpanded ? '' : 'hidden'}>
                    <div class="piste-detail-section">
                        <h4 class="piste-detail-title">📅 Deadlines & actions (${actionsForPiste.length})</h4>
                        ${actionsForPiste.length === 0
                            ? `<p class="piste-detail-empty">Aucune action liée pour le moment.</p>`
                            : `<ul class="piste-detail-list">${actionsForPiste.map(a => `
                                <li class="piste-detail-item">
                                    <input type="checkbox" data-action="toggle-action" data-action-id="${a.id}" ${a.statut === 'fait' ? 'checked' : ''}>
                                    <span class="${a.statut === 'fait' ? 'is-done' : ''}">
                                        ${escapeHtml(a.titre)}
                                        ${a.date_echeance ? `<small class="piste-detail-date">📆 ${a.date_echeance}</small>` : ''}
                                    </span>
                                    <button class="piste-detail-del" data-action="delete-action" data-action-id="${a.id}" title="Supprimer">×</button>
                                </li>`).join('')}</ul>`}
                        <button class="piste-detail-add" data-action="add-action-here">+ Ajouter une deadline</button>
                    </div>

                    <div class="piste-detail-section">
                        <h4 class="piste-detail-title">📂 Documents (${docsForPiste.length})</h4>
                        ${docsForPiste.length === 0
                            ? `<p class="piste-detail-empty">Aucun document lié pour le moment.</p>`
                            : `<ul class="piste-detail-list">${docsForPiste.map(d => `
                                <li class="piste-detail-item">
                                    <input type="checkbox" data-action="toggle-doc" data-doc-id="${d.id}" ${d.statut === 'pret' ? 'checked' : ''}>
                                    <span class="${d.statut === 'pret' ? 'is-done' : ''}">
                                        ${escapeHtml(d.titre)}
                                    </span>
                                    <select class="piste-detail-cat" data-action="change-cat" data-doc-id="${d.id}">
                                        ${['dossier_scolaire','lettre_motivation','justificatif','formulaire','autre']
                                            .map(c => `<option value="${c}" ${c === d.categorie ? 'selected' : ''}>${categorieShortLabel(c)}</option>`).join('')}
                                    </select>
                                    <button class="piste-detail-del" data-action="delete-doc" data-doc-id="${d.id}" title="Supprimer">×</button>
                                </li>`).join('')}</ul>`}
                        <button class="piste-detail-add" data-action="add-doc-here">+ Ajouter un document</button>
                    </div>
                </div>
            </article>
        `;
    }

    function wirePisteCards(container) {
        container.querySelectorAll('.piste-card').forEach(card => {
            const id = parseInt(card.dataset.pisteId, 10);

            // Checkbox "Comparer" : connecte au ComparisonManager partagé
            const compareCb = card.querySelector('.piste-compare-checkbox');
            if (compareCb && window.ComparisonManager) {
                const piste = state.pistes.find(p => p.id == id);
                const optionId = `piste::${id}`;
                if (window.ComparisonManager.has(optionId)) {
                    compareCb.checked = true;
                    card.classList.add('piste-card--selected-compare');
                }
                compareCb.addEventListener('change', (e) => {
                    e.stopPropagation();
                    if (e.target.checked) {
                        const ok = window.ComparisonManager.add({
                            id:      optionId,
                            type:    'piste',
                            title:   piste?.titre || 'Piste',
                            context: piste?.description || '',
                            url:     '',
                            source:  '',
                        });
                        if (!ok) { e.target.checked = false; return; }
                        card.classList.add('piste-card--selected-compare');
                    } else {
                        window.ComparisonManager.remove(optionId);
                        card.classList.remove('piste-card--selected-compare');
                    }
                });
            }
            // Empêche le toggle-expand quand on clique sur le label compare
            const compareLabel = card.querySelector('.piste-compare-toggle');
            if (compareLabel) {
                compareLabel.addEventListener('click', (e) => e.stopPropagation());
            }

            // Toggle expand/collapse au clic sur le header
            const header = card.querySelector('[data-action="toggle-expand"]');
            if (header) {
                header.addEventListener('click', (e) => {
                    if (e.target.tagName === 'BUTTON') return; // ne pas toggle si on clic sur un bouton interne
                    if (expandedPistes.has(id)) expandedPistes.delete(id);
                    else expandedPistes.add(id);
                    card.classList.toggle('is-expanded');
                    const details = card.querySelector('.piste-card__details');
                    if (details) details.hidden = !expandedPistes.has(id);
                });
            }

            // Boutons d'action
            card.querySelectorAll('[data-action]').forEach(btn => {
                if (btn === header) return;
                const action = btn.dataset.action;

                if (action === 'set-statut') {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        try {
                            await apiPost(API.updatePiste, { id, statut: btn.dataset.statut });
                            showToast('Statut mis à jour');
                            await loadAndRender();
                        } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
                    });
                }
                else if (action === 'delete') {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (!confirm('Supprimer cette piste et toutes ses actions/documents associés ?')) return;
                        try {
                            await apiPost(API.deletePiste, { id });
                            showToast('Piste supprimée');
                            expandedPistes.delete(id);
                            editingPistes.delete(id);
                            await loadAndRender();
                        } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
                    });
                }
                else if (action === 'edit') {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        editingPistes.add(id);
                        renderPistes();
                        // Focus auto sur l'input titre une fois rendu
                        const input = document.querySelector(`.piste-card[data-piste-id="${id}"] .piste-edit-titre`);
                        if (input) { input.focus(); input.select(); }
                    });
                }
                else if (action === 'cancel-edit') {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        editingPistes.delete(id);
                        renderPistes();
                    });
                }
                else if (action === 'save-edit') {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const titreInput = card.querySelector('.piste-edit-titre');
                        const descInput  = card.querySelector('.piste-edit-desc');
                        const newTitre   = (titreInput?.value || '').trim();
                        const newDesc    = (descInput?.value || '').trim();
                        if (!newTitre) {
                            showToast('Le titre ne peut pas être vide', 'error');
                            titreInput?.focus();
                            return;
                        }
                        try {
                            await apiPost(API.updatePiste, {
                                id,
                                titre: newTitre,
                                description: newDesc,
                            });
                            showToast('Piste sauvegardée');
                            editingPistes.delete(id);
                            await loadAndRender();
                        } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
                    });
                }
                else if (action === 'add-action-here') {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        await quickAddAction(id);
                    });
                }
                else if (action === 'add-doc-here') {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        await quickAddDocument(id);
                    });
                }
                else if (action === 'toggle-action') {
                    btn.addEventListener('change', async (e) => {
                        e.stopPropagation();
                        const aid = parseInt(btn.dataset.actionId, 10);
                        const newStatut = btn.checked ? 'fait' : 'a_faire';
                        try {
                            await apiPost(API.updateAction, { id: aid, statut: newStatut });
                            await loadAndRender();
                        } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
                    });
                }
                else if (action === 'toggle-doc') {
                    btn.addEventListener('change', async (e) => {
                        e.stopPropagation();
                        const did = parseInt(btn.dataset.docId, 10);
                        const newStatut = btn.checked ? 'pret' : 'a_preparer';
                        try {
                            await apiPost(API.updateDoc, { id: did, statut: newStatut });
                            await loadAndRender();
                        } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
                    });
                }
                else if (action === 'change-cat') {
                    btn.addEventListener('change', async (e) => {
                        e.stopPropagation();
                        const did = parseInt(btn.dataset.docId, 10);
                        try {
                            await apiPost(API.updateDoc, { id: did, categorie: btn.value });
                            showToast('Catégorie mise à jour');
                            await loadAndRender();
                        } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
                    });
                }
                else if (action === 'delete-action') {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const aid = parseInt(btn.dataset.actionId, 10);
                        if (!confirm('Supprimer cette action ?')) return;
                        try {
                            await apiPost(API.deleteAction, { id: aid });
                            showToast('Action supprimée');
                            await loadAndRender();
                        } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
                    });
                }
                else if (action === 'delete-doc') {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const did = parseInt(btn.dataset.docId, 10);
                        if (!confirm('Supprimer ce document ?')) return;
                        try {
                            await apiPost(API.deleteDoc, { id: did });
                            showToast('Document supprimé');
                            await loadAndRender();
                        } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
                    });
                }
            });
        });
    }

    function categorieShortLabel(c) {
        return ({
            dossier_scolaire: 'Dossier scolaire',
            lettre_motivation: 'Lettre motivation',
            justificatif: 'Justificatif',
            formulaire: 'Formulaire',
            autre: 'Autre',
        })[c] || c;
    }

    /**
     * Parse la chaîne CSV des jours de rappel ("1,5,30" → [1, 5, 30]).
     * Renvoie un Set pour faciliter les .has(n).
     */
    function parseReminderDays(csv) {
        if (!csv || typeof csv !== 'string') return new Set();
        return new Set(
            csv.split(',')
                .map(s => parseInt(s.trim(), 10))
                .filter(n => Number.isInteger(n) && n >= 1 && n <= 365)
        );
    }

    // ----- Mode pré-migration : on stocke en localStorage en attendant la BDD -----
    const REMINDER_STORAGE_KEY = 'ori_reminders_v1';

    function readStoredReminders() {
        try {
            return JSON.parse(localStorage.getItem(REMINDER_STORAGE_KEY) || '{}') || {};
        } catch { return {}; }
    }
    function getReminderCsv(action) {
        // Priorité 1 : si la colonne BDD existe (post-migration), on l'utilise
        if ('reminder_days_before' in action && action.reminder_days_before) {
            return action.reminder_days_before;
        }
        // Priorité 2 : localStorage (pré-migration ou fallback)
        const stored = readStoredReminders();
        return stored[action.id] || '';
    }
    function saveReminderCsv(actionId, csv) {
        // Persiste en localStorage immédiatement (toujours)
        const stored = readStoredReminders();
        if (!csv || csv === '') {
            delete stored[actionId];
        } else {
            stored[actionId] = csv;
        }
        try {
            localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(stored));
        } catch {}
        // Tente aussi le backend (best-effort : si la colonne n'existe pas
        // encore, le backend skip silencieusement, pas d'erreur affichée)
        apiPost(API.updateAction, { id: actionId, reminder_days_before: csv })
            .catch(err => console.warn('[reminders] backend skip:', err.message));
    }

    /**
     * Calcule la date concrète à laquelle un rappel J-X sera envoyé.
     * Renvoie un format français court "24 mars" + l'année si différente.
     */
    function formatReminderDate(deadlineStr, daysBefore) {
        if (!deadlineStr) return '';
        const deadline = new Date(deadlineStr + 'T00:00:00');
        deadline.setDate(deadline.getDate() - daysBefore);
        const today = new Date();
        const months = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin',
                        'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
        const day = deadline.getDate();
        const month = months[deadline.getMonth()];
        const year = deadline.getFullYear();
        const sameYear = year === today.getFullYear();
        return sameYear ? `${day} ${month}` : `${day} ${month} ${year}`;
    }

    function renderReminderToggles(action) {
        const days = parseReminderDays(getReminderCsv(action));
        const presets = [1, 5, 30];
        const customs = [...days].filter(n => !presets.includes(n));
        const hasAny = days.size > 0;

        const presetButtons = presets.map(n => {
            const active = days.has(n) ? 'is-active' : '';
            return `<button type="button" class="reminder-toggle ${active}"
                            data-action="reminder-toggle" data-days="${n}">J-${n}</button>`;
        }).join('');

        const customButtons = customs.map(n =>
            `<button type="button" class="reminder-toggle is-active reminder-toggle--custom"
                     data-action="reminder-toggle" data-days="${n}" title="Cliquer pour retirer">J-${n} ×</button>`
        ).join('');

        // Historisation : pour chaque rappel actif, on calcule et affiche la date d'envoi
        const sortedDays = [...days].sort((a, b) => b - a); // J-30, J-5, J-1
        const scheduledChips = sortedDays.map(n => {
            const date = formatReminderDate(action.date_echeance, n);
            return `<span class="reminder-scheduled">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Mail prévu le <strong>${date}</strong> <em>(J-${n})</em>
            </span>`;
        }).join('');

        const scheduledBlock = hasAny
            ? `<div class="reminder-scheduled-list">${scheduledChips}</div>`
            : '';

        return `
            <div class="deadline-card__reminders">
                <div class="reminder-header">
                    <span class="reminder-header__title">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                        Rappels mail
                    </span>
                    <span class="reminder-header__status ${hasAny ? 'is-active' : ''}">
                        ${hasAny ? `${days.size} actif${days.size > 1 ? 's' : ''}` : 'Aucun'}
                    </span>
                </div>
                <div class="reminder-toggles">
                    ${presetButtons}
                    ${customButtons}
                    <button type="button" class="reminder-toggle reminder-toggle--add" data-action="reminder-add" title="Ajouter un rappel personnalisé">+ J-?</button>
                </div>
                ${scheduledBlock}
            </div>
        `;
    }

    function renderDeadlines() {
        const el = document.getElementById('deadlines-list');
        if (!el) return;
        // On ne montre que les actions avec date_echeance, pas "fait", triées par date
        const upcoming = state.actions
            .filter(a => a.date_echeance)
            .map(a => ({ ...a, _days: daysUntil(a.date_echeance) }))
            .sort((a, b) => (a._days ?? 9999) - (b._days ?? 9999));

        if (!upcoming.length) {
            el.innerHTML = `<p class="zone__empty">Aucune deadline pour l'instant.</p>`;
            return;
        }
        el.innerHTML = upcoming.map(a => {
            const piste = state.pistes.find(p => p.id == a.piste_id);
            const cls = deadlineUrgencyClass(a._days) + (a.statut === 'fait' ? ' deadline-card--done' : '');
            return `
                <div class="deadline-card ${cls}" data-action-id="${a.id}">
                    <div class="deadline-card__when">${escapeHtml(formatRelativeDays(a._days))} · ${a.date_echeance}</div>
                    <div class="deadline-card__titre">${escapeHtml(a.titre)}</div>
                    ${piste ? `<div class="deadline-card__piste">→ ${escapeHtml(piste.titre)}</div>` : ''}
                    <label class="deadline-card__check">
                        <input type="checkbox" ${a.statut === 'fait' ? 'checked' : ''}>
                        <span>${a.statut === 'fait' ? 'Fait' : 'Marquer comme fait'}</span>
                    </label>
                    ${renderReminderToggles(a)}
                </div>
            `;
        }).join('');

        el.querySelectorAll('.deadline-card').forEach(card => {
            const id = parseInt(card.dataset.actionId, 10);
            const action = state.actions.find(a => a.id == id);

            // Toggle "Marquer comme fait"
            const cb = card.querySelector('.deadline-card__check input[type="checkbox"]');
            if (cb) cb.addEventListener('change', async (e) => {
                const newStatut = e.target.checked ? 'fait' : 'a_faire';
                try {
                    await apiPost(API.updateAction, { id, statut: newStatut });
                    await loadAndRender();
                } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
            });

            // Toggles rappels J-X (cocher/décocher les presets ou les customs)
            card.querySelectorAll('[data-action="reminder-toggle"]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const n = parseInt(btn.dataset.days, 10);
                    const current = parseReminderDays(getReminderCsv(action));
                    if (current.has(n)) current.delete(n);
                    else current.add(n);
                    const csv = [...current].sort((a, b) => a - b).join(',');
                    saveReminderCsv(id, csv);
                    showToast(current.size > 0 ? `Rappel J-${n} ${current.has(n) ? 'activé' : 'retiré'}` : 'Rappel retiré');
                    // Re-render seulement les deadlines (pas tout le dashboard)
                    renderDeadlines();
                });
            });

            // Bouton + jour custom : prompt simple, validation 1-365
            const addBtn = card.querySelector('[data-action="reminder-add"]');
            if (addBtn) {
                addBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const ans = prompt('Combien de jours avant la deadline ? (entre 1 et 365)\nExemples : 14 pour J-14, 60 pour J-60');
                    if (!ans) return;
                    const n = parseInt(ans.trim(), 10);
                    if (!Number.isInteger(n) || n < 1 || n > 365) {
                        showToast('Nombre invalide (entre 1 et 365)', 'error');
                        return;
                    }
                    const current = parseReminderDays(getReminderCsv(action));
                    current.add(n);
                    const csv = [...current].sort((a, b) => a - b).join(',');
                    saveReminderCsv(id, csv);
                    showToast(`Rappel J-${n} ajouté`);
                    renderDeadlines();
                });
            }
        });
    }

    function renderDocuments() {
        const el = document.getElementById('documents-list');
        if (!el) return;
        if (!state.documents.length) {
            el.innerHTML = `<p class="zone__empty">Aucun document à préparer pour l'instant.</p>`;
            return;
        }
        // Group par catégorie
        const byCat = {};
        state.documents.forEach(d => {
            const c = d.categorie || 'autre';
            (byCat[c] = byCat[c] || []).push(d);
        });
        const order = ['dossier_scolaire', 'lettre_motivation', 'justificatif', 'formulaire', 'autre'];
        const sorted = order.filter(c => byCat[c] && byCat[c].length);

        el.innerHTML = sorted.map(cat => `
            <div class="doc-category">
                <h3 class="doc-category__title">${categorieLabel(cat)}</h3>
                ${byCat[cat].map(d => {
                    const piste = state.pistes.find(p => p.id == d.piste_id);
                    return `
                        <div class="doc-row doc-row--${d.statut}" data-doc-id="${d.id}">
                            <input type="checkbox" class="doc-row__check" ${d.statut === 'pret' ? 'checked' : ''}>
                            <div class="doc-row__titre">${escapeHtml(d.titre)}</div>
                            <span class="doc-row__statut-pill">${statutLabel(d.statut)}</span>
                            <span class="doc-row__piste">${piste ? escapeHtml(piste.titre) : ''}</span>
                            <button class="doc-row__delete" title="Supprimer">×</button>
                        </div>
                    `;
                }).join('')}
            </div>
        `).join('');

        el.querySelectorAll('.doc-row').forEach(row => {
            const id = parseInt(row.dataset.docId, 10);
            const cb = row.querySelector('.doc-row__check');
            const del = row.querySelector('.doc-row__delete');
            if (cb) cb.addEventListener('change', async (e) => {
                const newStatut = e.target.checked ? 'pret' : 'a_preparer';
                try {
                    await apiPost(API.updateDoc, { id, statut: newStatut });
                    await loadAndRender();
                } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
            });
            if (del) del.addEventListener('click', async () => {
                if (!confirm('Supprimer ce document ?')) return;
                try {
                    await apiPost(API.deleteDoc, { id });
                    showToast('Document supprimé');
                    await loadAndRender();
                } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
            });
        });
    }

    // ------------------------------------------------------------
    // Modale d'ajout (réutilise les classes .save-* de css/save.css,
    // donc même DA que la modale "Sauvegarder dans le dashboard" du chat)
    // ------------------------------------------------------------

    /**
     * Ouvre la modale avec un set de champs et résoud avec les valeurs
     * saisies (ou null si annulation).
     *
     * cfg = {
     *   title:       string,
     *   subtitle:    string (optionnel),
     *   fields:      [{ name, label, type, placeholder?, options?, value?, required? }]
     *   submitLabel: string (défaut 'Sauvegarder')
     * }
     * type ∈ 'text' | 'date' | 'textarea' | 'select'
     */
    function openDashboardModal(cfg) {
        return new Promise((resolve) => {
            const overlay  = document.getElementById('dashboard-form-overlay');
            if (!overlay) {
                // Fallback ultime si le HTML modale n'a pas été uploadé : prompt
                console.warn('[dashboard] modale absente, fallback prompt');
                const v = {};
                for (const f of cfg.fields) {
                    const ans = prompt(f.label + ' :', f.value || '');
                    if (ans === null) { resolve(null); return; }
                    v[f.name] = ans.trim();
                }
                resolve(v);
                return;
            }

            const titleEl    = document.getElementById('dashboard-form-title');
            const subtitleEl = document.getElementById('dashboard-form-subtitle');
            const fieldsEl   = document.getElementById('dashboard-form-fields');
            const form       = document.getElementById('dashboard-form');
            const submitBtn  = document.getElementById('dashboard-form-submit');
            const cancelBtn  = document.getElementById('dashboard-form-cancel');
            const closeBtn   = document.getElementById('dashboard-form-close');

            titleEl.textContent    = cfg.title || 'Ajouter';
            subtitleEl.textContent = cfg.subtitle || '';
            subtitleEl.style.display = cfg.subtitle ? '' : 'none';
            submitBtn.textContent  = cfg.submitLabel || 'Sauvegarder';

            // Construit les champs en classes save-field (déjà stylées)
            fieldsEl.innerHTML = cfg.fields.map(f => {
                const labelHtml = `<span>${escapeHtml(f.label)}${f.required ? ' *' : ''}</span>`;
                if (f.type === 'select') {
                    const opts = (f.options || []).map(o =>
                        `<option value="${escapeHtml(o.value)}" ${o.value === (f.value || '') ? 'selected' : ''}>${escapeHtml(o.label)}</option>`
                    ).join('');
                    return `<label class="save-field">${labelHtml}<select data-name="${escapeHtml(f.name)}" class="save-row-cat" style="padding:8px 12px;font-size:13.5px;">${opts}</select></label>`;
                }
                if (f.type === 'textarea') {
                    return `<label class="save-field">${labelHtml}<textarea data-name="${escapeHtml(f.name)}" placeholder="${escapeHtml(f.placeholder || '')}" rows="3">${escapeHtml(f.value || '')}</textarea></label>`;
                }
                const inputType = f.type === 'date' ? 'date' : 'text';
                return `<label class="save-field">${labelHtml}<input type="${inputType}" data-name="${escapeHtml(f.name)}" placeholder="${escapeHtml(f.placeholder || '')}" value="${escapeHtml(f.value || '')}" maxlength="255"></label>`;
            }).join('');

            // Affichage
            overlay.classList.add('is-open');
            setTimeout(() => {
                const first = fieldsEl.querySelector('input, textarea, select');
                if (first) { first.focus(); if (first.select) first.select(); }
            }, 80);

            const cleanup = () => {
                overlay.classList.remove('is-open');
                document.removeEventListener('keydown', escHandler);
                form.removeEventListener('submit', onSubmit);
                cancelBtn.removeEventListener('click', onCancel);
                closeBtn.removeEventListener('click', onCancel);
                overlay.removeEventListener('click', onOverlayClick);
            };

            const onCancel = () => { cleanup(); resolve(null); };
            const onOverlayClick = (e) => { if (e.target === overlay) onCancel(); };
            const escHandler = (e) => { if (e.key === 'Escape') onCancel(); };

            const onSubmit = (e) => {
                e.preventDefault();
                const values = {};
                for (const f of cfg.fields) {
                    const el = fieldsEl.querySelector(`[data-name="${f.name}"]`);
                    values[f.name] = el ? el.value.trim() : '';
                }
                for (const f of cfg.fields) {
                    if (f.required && !values[f.name]) {
                        showToast(`Le champ « ${f.label} » est obligatoire`, 'error');
                        const el = fieldsEl.querySelector(`[data-name="${f.name}"]`);
                        if (el) el.focus();
                        return;
                    }
                }
                cleanup();
                resolve(values);
            };

            form.addEventListener('submit', onSubmit);
            cancelBtn.addEventListener('click', onCancel);
            closeBtn.addEventListener('click', onCancel);
            overlay.addEventListener('click', onOverlayClick);
            document.addEventListener('keydown', escHandler);
        });
    }

    // ----- 3 actions d'ajout, désormais via openDashboardModal -----
    async function quickAddPiste() {
        const v = await openDashboardModal({
            title: 'Nouvelle piste d\'orientation',
            subtitle: 'Crée une piste pour suivre une école, un métier ou une voie qui t\'intéresse.',
            fields: [
                { name: 'titre', label: 'Titre de la piste', type: 'text', placeholder: 'Ex : Médecine à Paris', required: true },
                { name: 'description', label: 'Description (optionnel)', type: 'textarea', placeholder: 'Pourquoi cette piste t\'intéresse, ce que tu en sais déjà…' },
            ],
            submitLabel: 'Créer la piste',
        });
        if (!v) return;
        try {
            await apiPost(API.savePiste, { titre: v.titre, description: v.description });
            showToast('Piste créée');
            await loadAndRender();
        } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
    }

    async function quickAddDocument(pisteId) {
        const fields = [
            { name: 'titre', label: 'Nom du document', type: 'text', placeholder: 'Ex : Bulletins de Terminale', required: true },
            { name: 'categorie', label: 'Catégorie', type: 'select', value: 'autre', options: [
                { value: 'dossier_scolaire',  label: 'Dossier scolaire' },
                { value: 'lettre_motivation', label: 'Lettre de motivation' },
                { value: 'justificatif',      label: 'Justificatif' },
                { value: 'formulaire',        label: 'Formulaire' },
                { value: 'autre',             label: 'Autre' },
            ]},
        ];
        if (!pisteId && state.pistes.length > 0) {
            fields.push({
                name: 'piste_id', label: 'Rattacher à une piste (optionnel)', type: 'select', value: '',
                options: [
                    { value: '', label: '— Aucune piste —' },
                    ...state.pistes.map(p => ({ value: String(p.id), label: p.titre })),
                ],
            });
        }
        const v = await openDashboardModal({
            title: 'Ajouter un document à préparer',
            fields, submitLabel: 'Ajouter le document',
        });
        if (!v) return;
        const payload = { titre: v.titre, categorie: v.categorie || 'autre' };
        if (pisteId) payload.piste_id = pisteId;
        else if (v.piste_id) payload.piste_id = parseInt(v.piste_id, 10);
        try {
            await apiPost(API.saveDoc, payload);
            showToast('Document ajouté');
            await loadAndRender();
        } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
    }

    async function quickAddAction(pisteId) {
        const fields = [
            { name: 'titre', label: 'Titre de la deadline', type: 'text', placeholder: 'Ex : Dépôt du dossier Sciences Po', required: true },
            { name: 'date_echeance', label: 'Date limite (optionnel)', type: 'date' },
        ];
        if (!pisteId && state.pistes.length > 0) {
            fields.push({
                name: 'piste_id', label: 'Rattacher à une piste (optionnel)', type: 'select', value: '',
                options: [
                    { value: '', label: '— Aucune piste —' },
                    ...state.pistes.map(p => ({ value: String(p.id), label: p.titre })),
                ],
            });
        }
        const v = await openDashboardModal({
            title: 'Ajouter une deadline',
            subtitle: 'Crée un rappel daté que tu retrouveras dans la colonne Deadlines.',
            fields, submitLabel: 'Ajouter la deadline',
        });
        if (!v) return;
        const payload = { titre: v.titre };
        if (v.date_echeance) payload.date_echeance = v.date_echeance;
        if (pisteId) payload.piste_id = pisteId;
        else if (v.piste_id) payload.piste_id = parseInt(v.piste_id, 10);
        try {
            await apiPost(API.saveAction, payload);
            showToast('Deadline ajoutée');
            await loadAndRender();
        } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
    }

    async function logout() {
        if (!confirm('Te déconnecter ?')) return;
        try {
            await apiPost(API.logout, {});
        } catch {}
        window.location.href = '/';
    }

    // ------------------------------------------------------------
    // Init
    // ------------------------------------------------------------
    document.addEventListener('DOMContentLoaded', () => {
        loadAndRender();
        document.getElementById('add-piste-btn')?.addEventListener('click', quickAddPiste);
        document.getElementById('add-doc-btn')?.addEventListener('click', () => quickAddDocument());
        document.getElementById('add-deadline-btn')?.addEventListener('click', () => quickAddAction());
        document.getElementById('logout-btn')?.addEventListener('click', logout);
    });
})();
