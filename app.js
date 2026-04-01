// ==========================================
// --- VARIABLES GLOBALES (SÉCURITÉ D'INITIALISATION) ---
// ==========================================
let isHardCascade = false;
let clipboardStints = null;
let currentFileName = "";
let liveTimer = null;
let liveTimerActive = false;
let lastTimerTick = 0;
let animationFrameId = null;
let strategySplits = [];
let pitModalTarget = null;
let undoPitModalTarget = null;
let rowToDelete = null;
let fuelModalTarget = null;
let lastActiveStint = localStorage.getItem('lastActiveStint') || null;
// 🚀 NOUVEAU : Empreinte d'état (Remplace le boolean needsStrategyUpdate)
let lastCalculatedState = null;

// ==========================================
// --- MENU ET ERGONOMIE GLOBALE ---
// ==========================================
function toggleMenu() {
    document.getElementById('nav-links').classList.toggle('show-menu');
}

document.addEventListener('focusin', function (e) {
    if (e.target.tagName === 'INPUT' && (e.target.type === 'text' || e.target.type === 'number')) {
        e.target.select();
    }

    let tr = e.target.closest('tr[data-stint]');
    if (tr) {
        document.querySelectorAll('.active-stint').forEach(el => el.classList.remove('active-stint'));
        document.querySelectorAll('.active-relay').forEach(el => el.classList.remove('active-relay'));
        tr.classList.add('active-stint');

        let block = tr.closest('.split-block');
        if (block) {
            let relayId = block.getAttribute('data-relay');
            if (relayId) {
                document.querySelectorAll(`.split-block[data-relay="${relayId}"]`).forEach(el => el.classList.add('active-relay'));
            } else {
                block.classList.add('active-relay');
            }
        }

        let stintId = tr.dataset.stint;
        localStorage.setItem('lastActiveStint', stintId);
        lastActiveStint = stintId;
    }
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        e.target.blur();
    }
});

document.addEventListener('change', function (e) {
    if (e.target.type === 'number') {
        let val = parseFloat(e.target.value);
        if (val < 0) e.target.value = (e.target.id === 'race-laps' || e.target.id === 'total-splits' || e.target.classList.contains('table-input')) ? 1 : 0;
    }
});

document.addEventListener('click', function (e) {
    // 🚀 AXE 1 : Fermeture du menu "Rejoindre" au clic extérieur
    const joinContainer = document.getElementById('join-race-container');
    const joinSelect = document.getElementById('join-race-select');
    const joinBtn = document.getElementById('btn-show-join');
    if (joinContainer && !joinContainer.contains(e.target)) {
        if (joinSelect && !joinSelect.classList.contains('hidden')) {
            joinSelect.classList.add('hidden');
            joinBtn.classList.remove('hidden');
            joinSelect.value = "";
        }
    }
    let tr = e.target.closest('tr[data-stint]');
    if (tr && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
        document.querySelectorAll('.active-stint').forEach(el => el.classList.remove('active-stint'));
        document.querySelectorAll('.active-relay').forEach(el => el.classList.remove('active-relay'));
        tr.classList.add('active-stint');

        let block = tr.closest('.split-block');
        if (block) {
            let relayId = block.getAttribute('data-relay');
            if (relayId) {
                document.querySelectorAll(`.split-block[data-relay="${relayId}"]`).forEach(el => el.classList.add('active-relay'));
            } else {
                block.classList.add('active-relay');
            }
        }

        let stintId = tr.dataset.stint;
        localStorage.setItem('lastActiveStint', stintId);
        lastActiveStint = stintId;
    }
});

// ==========================================
// --- SAUVEGARDE & STATUS ---
// ==========================================
function setSaveBadge(isSaved) {
    const badge = document.getElementById('save-status-badge');
    if (!badge) return;
    if (isSaved) {
        badge.classList.remove('unsaved');
        badge.classList.add('saved');
        badge.innerHTML = '<span class="material-symbols-outlined icon-sm">lock</span>';
    } else {
        badge.classList.remove('saved');
        badge.classList.add('unsaved');
        badge.innerHTML = '<span class="material-symbols-outlined icon-sm">lock_open</span>';
    }
}

function saveFormState() {
    if (window.isInitializingDOM) return;

    const state = {};
    document.querySelectorAll('input:not(#pit-modal-lap):not(#undo-pit-modal-lap):not(#fuel-modal-input):not(#stop-timer-input):not(#save-config-name):not(#import-config-file):not(#quick-save-name), select, textarea').forEach(el => {
        if (el.id && !el.closest('#tab-strategy') && !el.closest('#tab-export')) {
            state[el.id] = el.type === 'checkbox' ? el.checked : el.value;
        }
    });
    localStorage.setItem('stratefreez-form-state', JSON.stringify(state));
    localStorage.setItem('stratefreez-data', JSON.stringify(strategySplits));
    setSaveBadge(false);

    // 🚀 ÉTAPE 1 : SYNCHRONISATION FIREBASE (CLOUD)
    if (currentRaceId && isRaceActive) {
        // On vérifie si le chrono tourne pour la catégorisation
        let timerStr = localStorage.getItem('stratefreez-timer');
        let isTimerRunning = timerStr ? JSON.parse(timerStr).active : false;

        db.collection('races').doc(currentRaceId).set({
            id: currentRaceId,
            pin: currentRacePin,
            name: state['race-name-input'] || 'Course sans nom',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            isActive: true,
            isTimerRunning: isTimerRunning, // 🚀 L'INFO VITALE POUR LE TRI
            formState: state,
            strategyData: strategySplits
        }).catch(err => console.error("Erreur de synchro Cloud :", err));
    }
}

let globalSaveTimeout = null;

document.addEventListener('input', (e) => {
    if (['stop-timer-input', 'save-config-name', 'import-config-file', 'quick-save-name'].includes(e.target.id)) return;

    // 🚀 CORRECTION : Ajout de 'race-duration' pour que le calcul se lance à chaque frappe !
    if (['race-duration', 'race-duration-hh', 'race-duration-mm', 'race-laps', 'total-splits'].includes(e.target.id)) {
        calculateSplit();
    }

    clearTimeout(globalSaveTimeout);
    globalSaveTimeout = setTimeout(() => {
        saveFormState();
    }, 500);
});

document.addEventListener('change', (e) => {
    if (['stop-timer-input', 'save-config-name', 'import-config-file', 'quick-save-name'].includes(e.target.id)) return;

    clearTimeout(globalSaveTimeout);
    saveFormState();

    if (e.target.id === 'enable-pit-window' || e.target.id === 'pit-window-mode-tours') {
        togglePitWindowUI();
    }
});

window.hasGlobalAlert = false;
window.globalAlertText = "";

function updateAlertVisibility() {
    const banner = document.getElementById('global-alert-banner');
    let activeTab = localStorage.getItem('stratefreez-current-tab') || 'tab-params';

    const lockIcons = document.querySelectorAll('.lock-icon');
    const exportBtns = document.querySelectorAll('#btn-export-print, #btn-export-csv, #btn-export-copy, #btn-export-json');
    const btnCheck = document.getElementById('btn-check-rules');

    if (window.hasGlobalAlert) {
        if (activeTab === 'tab-strategy' || activeTab === 'tab-live') {
            document.body.classList.add('global-alert-active');
            banner.classList.remove('hidden');
        } else {
            document.body.classList.remove('global-alert-active');
            banner.classList.add('hidden');
        }
        lockIcons.forEach(icon => icon.classList.remove('hidden'));
        exportBtns.forEach(btn => btn.classList.add('locked-export-btn'));
        if (btnCheck) {
            btnCheck.classList.remove('btn-success');
            btnCheck.classList.add('btn-danger');
        }
    } else {
        document.body.classList.remove('global-alert-active');
        banner.classList.add('hidden');
        lockIcons.forEach(icon => icon.classList.add('hidden'));
        exportBtns.forEach(btn => btn.classList.remove('locked-export-btn'));
        if (btnCheck) {
            btnCheck.classList.remove('btn-danger');
            btnCheck.classList.add('btn-success');
        }
    }
}

function openTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabId).classList.remove('hidden');
    document.querySelector(`button[onclick="openTab('${tabId}')"]`)?.classList.add('active');
    localStorage.setItem('stratefreez-current-tab', tabId);

    const navLinks = document.getElementById('nav-links');
    if (navLinks) navLinks.classList.remove('show-menu');

    updateAlertVisibility();

    const fab = document.getElementById('fab-top');
    if (fab) {
        fab.classList.toggle('hidden', !['tab-params', 'tab-tech', 'tab-strategy'].includes(tabId));
    }

    if (tabId === 'tab-strategy') {
        saveFormState();
        let currentState = localStorage.getItem('stratefreez-form-state');

        if (currentState !== lastCalculatedState) {
            initStrategyData();
            cascadeFixPitWindows();
            renderStrategy();
            lastCalculatedState = currentState;
        }

        setTimeout(() => {
            let targetEl = null;
            let timerStr = localStorage.getItem('stratefreez-timer');
            let timerState = timerStr ? JSON.parse(timerStr) : null;

            if (timerState && timerState.active) {
                targetEl = document.querySelector('.active-live-stint');
            }
            if (!targetEl) {
                targetEl = document.querySelector('.active-stint');
            }
            if (!targetEl) {
                targetEl = document.querySelector('tr[data-stint]:not(.is-historical)');
            }

            if (targetEl) {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }, 150);
    }

    if (tabId === 'tab-export') {
        generateIARequest();
    }
}

// ==========================================
// --- REINITIALISATIONS ET IMPORT/EXPORT ---
// ==========================================

function openResetTab1Modal() { document.getElementById('reset-tab1-modal').classList.remove('hidden'); }
function closeResetTab1Modal() { document.getElementById('reset-tab1-modal').classList.add('hidden'); }
function confirmResetTab1() {
    document.getElementById('form-params').reset();
    document.getElementById('num-drivers').value = 1;
    document.getElementById('num-spotters').value = 1;
    document.getElementById('total-splits').value = 1;
    updateDynamicFields();
    toggleRaceGoal();
    toggleSpotters();
    ['T', 'M', 'D', 'I', 'P'].forEach(t => toggleTireOptions(t));
    saveFormState();
    closeResetTab1Modal();
}

function openResetTab2Modal() { document.getElementById('reset-tab2-modal').classList.remove('hidden'); }
function closeResetTab2Modal() { document.getElementById('reset-tab2-modal').classList.add('hidden'); }
function confirmResetTab2() {
    document.getElementById('form-tech').reset();
    let pt = document.getElementById('personalize-drivers-toggle');
    if (pt) {
        pt.checked = false;
        toggleDriverPersonalization();
    }
    saveFormState();
    closeResetTab2Modal();
}

function syncFileName(val) {
    currentFileName = val;
    let modalInp = document.getElementById('quick-save-name');
    let raceInp = document.getElementById('race-name-input');

    if (modalInp && modalInp.value !== val) modalInp.value = val;
    if (raceInp && raceInp.value !== val) raceInp.value = val;
}

function openQuickSaveModal() {
    let modalInp = document.getElementById('quick-save-name');
    if (modalInp) modalInp.value = currentFileName;
    document.getElementById('quick-save-modal').classList.remove('hidden');
    setTimeout(() => { if (modalInp) modalInp.focus(); }, 50);
}
function closeQuickSaveModal() { document.getElementById('quick-save-modal').classList.add('hidden'); }
function confirmQuickSave() {
    closeQuickSaveModal();
    executeSave();
}

function executeSave() {
    let name = currentFileName.trim();

    if (!name) {
        alert("❌ EXPORT IMPOSSIBLE SANS NOM");
        return;
    }

    let stateStr = localStorage.getItem('stratefreez-form-state');
    let stratStr = localStorage.getItem('stratefreez-data');

    let config = {
        formState: stateStr ? JSON.parse(stateStr) : {},
        strategyData: stratStr ? JSON.parse(stratStr) : []
    };

    let blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    let a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.json`;
    a.click();
    setSaveBadge(true);
}

// 🚀 AXE 2 : Fonction de Duplication
function openDuplicateErrorModal() { document.getElementById('duplicate-error-modal').classList.remove('hidden'); }
function closeDuplicateErrorModal() { document.getElementById('duplicate-error-modal').classList.add('hidden'); }

function duplicateRace() {
    let name = document.getElementById('save-config-name').value.trim();
    let currentName = document.getElementById('race-name-input').value.trim();

    // Vérifie si vide OU si identique au nom actuel
    if (!name || name === currentName) {
        openDuplicateErrorModal();
        return;
    }

    let stateStr = localStorage.getItem('stratefreez-form-state');
    let stratStr = localStorage.getItem('stratefreez-data');
    let config = {
        formState: stateStr ? JSON.parse(stateStr) : {},
        strategyData: stratStr ? JSON.parse(stratStr) : []
    };

    if (config.formState['race-name-input']) config.formState['race-name-input'] = name;

    let blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    let a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.json`;
    a.click();

    document.getElementById('save-config-name').value = '';
}

function loadConfig(event) {
    const file = event.target.files[0];
    if (!file) return;

    let fileName = file.name.replace(/\.[^/.]+$/, "");
    syncFileName(fileName);

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.formState && data.strategyData) {
                data.strategyData.forEach(split => {
                    if (split.stints) {
                        split.stints.forEach(stint => {
                            if (stint.fuelStrat === 'normal') stint.fuelStrat = 'push';
                            if (stint.laps === undefined || stint.laps === null) stint.laps = 1;
                        });
                    }
                });

                localStorage.setItem('stratefreez-form-state', JSON.stringify(data.formState));
                localStorage.setItem('stratefreez-data', JSON.stringify(data.strategyData));
                strategySplits = data.strategyData;

                applyFormStateToDOM(data.formState);

                let strTimer = localStorage.getItem('stratefreez-timer');
                let needsCatchup = false;
                if (strTimer) {
                    let timerState = JSON.parse(strTimer);
                    if (timerState && timerState.active) {
                        let elapsed = Math.floor((Date.now() - timerState.startTimeReal) / 1000);
                        for (let i = 0; i < strategySplits.length; i++) {
                            if (timerState.type === 'online' && i !== timerState.splitIdx) continue;
                            for (let j = 0; j < strategySplits[i].stints.length; j++) {
                                let stint = strategySplits[i].stints[j];
                                if (!stint.isPitted && stint.endSec !== undefined && elapsed >= (stint.endSec + 300)) {
                                    stint.isPitted = true;
                                    stint.lockedTimeSec = stint.endSec;
                                    needsCatchup = true;
                                }
                            }
                        }
                    }
                }

                // 🚀 CORRECTION VITESSE 3 : On supprime 'isHardCascade' pour 
                // laisser le moteur respecter les choix "Hors Fenêtre" du fichier.
                cascadeFixPitWindows();
                if (needsCatchup) cascadeFixPitWindows();

                // 🚀 CORRECTION D'IMPORT : On sauvegarde et on verrouille le "Cerveau" 
                // pour que l'onglet ne tente pas de recalculer ou d'écraser la strat importée.
                saveFormState();
                lastCalculatedState = localStorage.getItem('stratefreez-form-state');

                // 🚀 CORRECTION D'IMPORT : Forçage de l'affichage immédiat du tableau.
                // Cela mettra aussi à jour instantanément la ligne verte si le chrono est lancé !
                renderStrategy();

                setSaveBadge(true);
                openTab('tab-strategy');

            } else {
                alert("Fichier non valide : structure incorrecte.");
            }
        } catch (err) {
            console.error("Erreur Import:", err);
            alert("Erreur de lecture du fichier : " + err.message);
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

function applyFormStateToDOM(state) {
    if (!state) return;

    window.isInitializingDOM = true;

    // 🚀 TRY-FINALLY : Le bouclier sera levé à la fin quoiqu'il arrive
    try {
        let pitWindowCheckbox = document.getElementById('enable-pit-window');
        if (pitWindowCheckbox && state['enable-pit-window'] !== undefined) {
            pitWindowCheckbox.checked = state['enable-pit-window'];
            let drvs = parseInt(state['num-drivers']) || 1;
            let rt = state['race-type'] || 'irl';
            pitWindowCheckbox.dataset.lastMode = (drvs > 1 && rt !== 'online') ? 'irl-multi' : 'other';
        }

        ['num-drivers', 'total-splits', 'has-spotter', 'num-spotters'].forEach(id => {
            if (state[id] !== undefined) {
                let el = document.getElementById(id);
                if (el) {
                    if (el.type === 'checkbox') el.checked = state[id];
                    else el.value = state[id];
                }
            }
        });

        updateDynamicFields();
        if (state['has-spotter'] !== undefined) toggleSpotters();

        for (const [id, value] of Object.entries(state)) {
            const el = document.getElementById(id);
            if (el) {
                if (el.type === 'checkbox') el.checked = value;
                else el.value = value;
            }
        }

        toggleRaceGoal();
        ['T', 'M', 'D', 'I', 'P'].forEach(t => toggleTireOptions(t));

        let pToggle = document.getElementById('personalize-drivers-toggle');
        if (pToggle && pToggle.checked) {
            document.getElementById('drivers-tech-fieldset').classList.remove('hidden');
        } else {
            document.getElementById('drivers-tech-fieldset').classList.add('hidden');
        }

        calculateSplit();

        let numD = parseInt(document.getElementById('num-drivers').value) || 1;
        for (let i = 1; i <= numD; i++) {
            let val = document.getElementById(`driver-name-input-${i}`)?.value;
            const title = document.getElementById(`driver-card-title-${i}`);
            if (title) title.innerText = val || `Pilote ${i}`;
        }
    } finally {
        // Désactivation du bouclier (la page est prête)
        window.isInitializingDOM = false;
    }
}

// ==========================================
// --- NOUVELLES VARIABLES GLOBALES (AXE 1) ---
// ==========================================
let currentRaceId = localStorage.getItem('stratefreez-current-race-id') || null;
let currentRacePin = localStorage.getItem('stratefreez-current-race-pin') || null;
let isRaceActive = localStorage.getItem('stratefreez-is-race-active') === 'true';
let pendingSwitchRaceId = null;

// ==========================================
// --- INITIALISATION INTELLIGENTE (F5) ---
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    bindGlobalSyncEvents();

    let timerStr = localStorage.getItem('stratefreez-timer');
    let isTimerRunning = timerStr ? JSON.parse(timerStr).active : false;

    // La course est "en cours" si elle n'a pas été finie OU si le chrono tourne
    let shouldResumeRace = isRaceActive || isTimerRunning;

    if (shouldResumeRace && currentRaceId) {
        // --- CAS A : REPRISE DE COURSE ---
        const stateStr = localStorage.getItem('stratefreez-form-state');
        if (stateStr) {
            let parsedState = JSON.parse(stateStr);
            applyFormStateToDOM(parsedState);
            if (parsedState['race-name-input']) syncFileName(parsedState['race-name-input']);
        }

        const stratData = localStorage.getItem('stratefreez-data');
        if (stratData) strategySplits = JSON.parse(stratData);

        cascadeFixPitWindows();
        loadTimerState();
        updatePinDisplay();
        updateSnapshotDropdown();
        listenToCloudRace(); // 🚀 AJOUT ICI : Relance l'écoute après un F5

        // Focus intelligent : On force l'onglet 3 si on était sur les paramétrages au moment du crash
        let savedTab = localStorage.getItem('stratefreez-current-tab') || 'tab-strategy';
        if (savedTab === 'tab-params' || savedTab === 'tab-tech') savedTab = 'tab-strategy';
        openTab(savedTab);
        setSaveBadge(false);

    } else {
        // --- CAS B : NOUVELLE SESSION (Course vierge ou terminée) ---
        clearCurrentRaceData();
        updateDynamicFields();
        populateJoinDropdown();
        openTab('tab-params');
    }
});

// ==========================================
// --- AXE 1 : GESTION LOBBY (Nouvelle / Rejoindre Course) ---
// ==========================================
function updatePinDisplay() {
    const pinBlock = document.getElementById('race-pin-display');
    const pinValue = document.getElementById('race-pin-value');
    if (currentRacePin && currentRaceId) {
        if (pinValue) pinValue.innerText = currentRacePin;
        if (pinBlock) pinBlock.classList.remove('hidden');
    } else {
        if (pinBlock) pinBlock.classList.add('hidden');
    }
}

function clearCurrentRaceData() {
    currentRaceId = null;
    currentRacePin = null;
    isRaceActive = false;
    localStorage.removeItem('stratefreez-current-race-id');
    localStorage.removeItem('stratefreez-current-race-pin');
    localStorage.setItem('stratefreez-is-race-active', 'false');

    document.getElementById('form-params').reset();
    document.getElementById('form-tech').reset();
    strategySplits = [];

    document.getElementById('num-drivers').value = 1;
    document.getElementById('num-spotters').value = 1;
    document.getElementById('total-splits').value = 1;
    // 🚀 AXE 2 : On s'assure de vider le champ de duplication dans l'onglet Data
    let duplicateInput = document.getElementById('save-config-name');
    if (duplicateInput) duplicateInput.value = '';
    updatePinDisplay();
    updateSnapshotDropdown();
    // 🚀 AJOUT ICI : On coupe l'écoute du cloud si on vide la course
    if (unsubscribeCloud) { unsubscribeCloud(); unsubscribeCloud = null; }
}

function openNewRaceModal() {
    document.getElementById('new-race-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('new-race-input').focus(), 50);
}

function closeNewRaceModal() {
    document.getElementById('new-race-modal').classList.add('hidden');
}

function confirmNewRace() {
    let raceName = document.getElementById('new-race-input').value.trim();
    if (!raceName) return alert("Veuillez saisir un nom pour l'épreuve.");

    // 🚀 AXE 1 : Vérification anti-doublon (Nom de la course active)
    let currentName = document.getElementById('race-name-input')?.value.trim();
    if (raceName === currentName) {
        return alert("Ce nom est déjà utilisé par la course actuellement ouverte.");
    }

    // (Optionnel) Vérification anti-doublon dans le menu déroulant des courses
    let select = document.getElementById('join-race-select');
    if (select) {
        let options = Array.from(select.options).map(opt => opt.text);
        if (options.includes(raceName)) {
            return alert("Ce nom est déjà utilisé par une autre course existante.");
        }
    }

    clearCurrentRaceData(); // Purge avant création

    // Génération du Token de session
    currentRaceId = 'race_' + Date.now();
    currentRacePin = Math.floor(1000 + Math.random() * 9000).toString();
    isRaceActive = true;

    localStorage.setItem('stratefreez-current-race-id', currentRaceId);
    localStorage.setItem('stratefreez-current-race-pin', currentRacePin);
    localStorage.setItem('stratefreez-is-race-active', 'true');

    closeNewRaceModal();
    document.getElementById('race-name-input').value = raceName;
    syncFileName(raceName);

    updateDynamicFields();
    updatePinDisplay();
    saveFormState();

    openTab('tab-params');
}

function showJoinDropdown() {
    const btn = document.getElementById('btn-show-join');
    const select = document.getElementById('join-race-select');

    btn.classList.add('hidden');
    select.classList.remove('hidden');

    // 🚀 ÉTAPE 2 : Recherche Cloud au moment du clic
    populateJoinDropdown();
}

// 🚀 NOUVEAU : Fermeture fluide pour les mobiles
function hideJoinDropdown() {
    setTimeout(() => {
        document.getElementById('join-race-select').classList.add('hidden');
        document.getElementById('btn-show-join').classList.remove('hidden');
    }, 200);
}

// 🚀 FONCTION ASYNCHRONE CLOUD (Les 3 catégories)
async function populateJoinDropdown() {
    const select = document.getElementById('join-race-select');
    select.innerHTML = '<option value="">⏳ Recherche de courses...</option>';

    try {
        const snapshot = await db.collection('races').get();

        if (snapshot.empty) {
            select.innerHTML = '<option value="" disabled>Aucune course dans la base</option>';
            return;
        }

        let enCours = [];
        let pretes = [];
        let terminees = [];

        // 1. Tri dans les 3 catégories
        snapshot.forEach(doc => {
            let data = doc.data();
            if (data.id !== currentRaceId) { // Exclut la course actuellement ouverte
                if (!data.isActive) {
                    terminees.push(data);
                } else if (data.isTimerRunning) {
                    enCours.push(data);
                } else {
                    pretes.push(data);
                }
            }
        });

        // 2. Tri par date (le plus récent en haut)
        const sortByDate = (a, b) => (b.updatedAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || 0);
        enCours.sort(sortByDate);
        pretes.sort(sortByDate);
        terminees.sort(sortByDate);

        // 3. Construction des balises HTML <optgroup>
        select.innerHTML = '<option value="">-- Choisir une course --</option>';

        if (enCours.length > 0) {
            let groupEnCours = document.createElement('optgroup');
            groupEnCours.label = "🟢 COURSES EN COURS";
            enCours.forEach(d => groupEnCours.insertAdjacentHTML('beforeend', `<option value="${d.id}">▶ ${d.name}</option>`));
            select.appendChild(groupEnCours);
        }

        if (pretes.length > 0) {
            let groupPretes = document.createElement('optgroup');
            groupPretes.label = "🟠 COURSES PRÊTES";
            pretes.forEach(d => groupPretes.insertAdjacentHTML('beforeend', `<option value="${d.id}">⏸ ${d.name}</option>`));
            select.appendChild(groupPretes);
        }

        if (terminees.length > 0) {
            let groupTerminees = document.createElement('optgroup');
            groupTerminees.label = "🏁 COURSES TERMINÉES";
            terminees.forEach(d => groupTerminees.insertAdjacentHTML('beforeend', `<option value="${d.id}">▪ ${d.name}</option>`));
            select.appendChild(groupTerminees);
        }

    } catch (error) {
        console.error("Erreur de récupération Firestore :", error);
        select.innerHTML = '<option value="">-- Erreur de connexion au serveur --</option>';
    }
}

function triggerSwitchRace(raceId) {
    if (!raceId) return;
    pendingSwitchRaceId = raceId;
    let select = document.getElementById('join-race-select');
    let btn = document.getElementById('btn-show-join');

    document.getElementById('switch-race-name').innerText = select.options[select.selectedIndex].text;
    document.getElementById('switch-race-modal').classList.remove('hidden');

    // On referme le menu immédiatement après le choix
    select.value = "";
    select.classList.add('hidden');
    if (btn) btn.classList.remove('hidden');
}

function cancelSwitchRace() {
    pendingSwitchRaceId = null;
    document.getElementById('switch-race-modal').classList.add('hidden');
}

// 🚀 NOUVELLE VARIABLE GLOBALE POUR L'ÉCOUTE
let unsubscribeCloud = null;

async function confirmSwitchRace() {
    if (!pendingSwitchRaceId) return;

    document.getElementById('switch-race-modal').classList.add('hidden');

    // 1. On purge la course locale actuelle
    clearCurrentRaceData();

    // 2. On configure les identifiants
    currentRaceId = pendingSwitchRaceId;
    localStorage.setItem('stratefreez-current-race-id', currentRaceId);

    // 3. TÉLÉCHARGEMENT INITIAL DEPUIS LE CLOUD
    try {
        const doc = await db.collection('races').doc(currentRaceId).get();
        if (doc.exists) {
            const data = doc.data();

            currentRacePin = data.pin;
            isRaceActive = data.isActive;
            localStorage.setItem('stratefreez-current-race-pin', currentRacePin);
            localStorage.setItem('stratefreez-is-race-active', isRaceActive);

            // On applique les données du Cloud à l'application
            if (data.strategyData) {
                strategySplits = data.strategyData;
                localStorage.setItem('stratefreez-data', JSON.stringify(strategySplits));
            }
            if (data.formState) applyFormStateToDOM(data.formState);

            updatePinDisplay();
            renderStrategy();

            // 🚀 4. ON BRANCHE L'ÉCOUTE EN TEMPS RÉEL
            listenToCloudRace();

            openTab('tab-strategy');
        } else {
            alert("Cette course n'existe plus sur le serveur.");
            clearCurrentRaceData();
            openTab('tab-params');
        }
    } catch (e) {
        console.error("Erreur de chargement : ", e);
    }

    pendingSwitchRaceId = null;
}

// 🚀 FONCTION D'ÉCOUTE MAGIQUE (Le Multijoueur)
function listenToCloudRace() {
    if (unsubscribeCloud) unsubscribeCloud(); // Coupe l'ancienne écoute si on change de course
    if (!currentRaceId) return;

    unsubscribeCloud = db.collection('races').doc(currentRaceId).onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();

            // Si l'utilisateur est en train de taper dans un input, on ne met pas à jour 
            // l'onglet 1 et 2 pour ne pas effacer ce qu'il tape en cours de route.
            let isTyping = (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT');

            // On met TOUJOURS à jour la stratégie visuelle
            if (data.strategyData) {
                strategySplits = data.strategyData;
                localStorage.setItem('stratefreez-data', JSON.stringify(strategySplits));
                renderStrategy();
            }

            // On met à jour le formulaire seulement si on ne tape pas dedans
            if (data.formState && !isTyping) {
                applyFormStateToDOM(data.formState);
            }
        }
    });
}

// ==========================================
// --- ONGLET 1 & 2 : FONCTIONS MÉTIER ---
// ==========================================

function togglePitWindowUI() {
    const isEnabled = document.getElementById('enable-pit-window')?.checked;
    const settingsArea = document.getElementById('window-settings-area');
    const raceType = document.getElementById('race-type')?.value;
    const numDrivers = parseInt(document.getElementById('num-drivers')?.value) || 1;

    if (settingsArea) settingsArea.classList.toggle('hidden', !isEnabled);

    const isSoloOrOnline = (numDrivers <= 1 || raceType === 'online');

    const cbTiresOnly = document.getElementById('pit-tires-only');
    if (cbTiresOnly) cbTiresOnly.closest('div').classList.toggle('hidden', isSoloOrOnline);

    const inputReqPits = document.getElementById('global-req-pit-stops');
    if (inputReqPits) inputReqPits.closest('.d-flex').classList.toggle('hidden', !isSoloOrOnline);

    if (isEnabled) {
        document.getElementById('ui-solo-window')?.classList.toggle('hidden', !isSoloOrOnline);
        document.getElementById('ui-multi-window')?.classList.toggle('hidden', isSoloOrOnline);
        if (isSoloOrOnline) updateSoloInputs();
    } else {
        document.querySelectorAll('#window-settings-area input[type="text"], #window-settings-area input[type="number"]').forEach(inp => {
            inp.value = '';
        });
        const modeSwitch = document.getElementById('pit-window-mode-tours');
        if (modeSwitch) modeSwitch.checked = false;
        updateSoloInputs();
    }
}

function updateSoloInputs() {
    const isLapMode = document.getElementById('pit-window-mode-tours')?.checked;
    document.getElementById('pit-window-solo-time')?.classList.toggle('hidden', isLapMode);
    document.getElementById('pit-window-solo-laps')?.classList.toggle('hidden', !isLapMode);
}

function toggleRaceGoal() {
    let goalEl = document.getElementById('race-goal');
    if (!goalEl) return;

    let goal = goalEl.value;
    let isTime = (goal === 'time');

    // 🚀 CORRECTION : Utilisation de tes VRAIS IDs HTML ('-block' au lieu de '-inputs')
    let timeBlock = document.getElementById('goal-time-block');
    if (timeBlock) timeBlock.classList.toggle('hidden', !isTime);

    let lapsBlock = document.getElementById('goal-laps-block');
    if (lapsBlock) lapsBlock.classList.toggle('hidden', isTime);

    // --- NETTOYAGE : On vide les champs de l'option masquée ---
    if (isTime) {
        let lapsInput = document.getElementById('race-laps');
        if (lapsInput) lapsInput.value = '';
    } else {
        // Sécurité maximale : on gère à la fois ton champ unique et les éventuels champs hh/mm
        let durInput = document.getElementById('race-duration');
        let hhInput = document.getElementById('race-duration-hh');
        let mmInput = document.getElementById('race-duration-mm');

        if (durInput) durInput.value = '';
        if (hhInput) hhInput.value = '';
        if (mmInput) mmInput.value = '';
    }

    calculateSplit();
}

function toggleSpotters() {
    const isChecked = document.getElementById('has-spotter').checked;
    document.getElementById('spotters-config').classList.toggle('hidden', !isChecked);
    if (isChecked) updateSpotterNames();
}

function updateSpotterNames() {
    const num = parseInt(document.getElementById('num-spotters')?.value) || 1;
    const container = document.getElementById('spotter-names-container');
    while (container.children.length < num) {
        let i = container.children.length + 1;
        // 🚀 LECTURE DU LOCALSTORAGE POUR GARDER LES NOMS
        let stateStr = localStorage.getItem('stratefreez-form-state');
        let savedVal = "";
        if (stateStr) {
            let state = JSON.parse(stateStr);
            savedVal = state[`spotter-name-input-${i}`] || "";
        }
        container.insertAdjacentHTML('beforeend', `<div class="input-cell"><label class="sub-label">Spotter ${i}</label><input type="text" class="spotter-name" id="spotter-name-input-${i}" value="${savedVal}" placeholder="Nom"></div>`);
    }
    while (container.children.length > num) { container.lastElementChild.remove(); }
}

function updateDynamicFields() {
    const drivers = parseInt(document.getElementById('num-drivers')?.value) || 1;
    const raceType = document.getElementById('race-type')?.value || 'irl';
    let splits = parseInt(document.getElementById('total-splits')?.value) || 1;

    const drvContainer = document.getElementById('driver-names-container');
    while (drvContainer.children.length < drivers) {
        let i = drvContainer.children.length + 1;
        // 🚀 LECTURE DU LOCALSTORAGE POUR GARDER LES NOMS DES PILOTES
        let stateStr = localStorage.getItem('stratefreez-form-state');
        let savedVal = "";
        if (stateStr) {
            let state = JSON.parse(stateStr);
            savedVal = state[`driver-name-input-${i}`] || "";
        }
        drvContainer.insertAdjacentHTML('beforeend', `<div class="input-cell"><label class="sub-label">Pilote ${i}</label><input type="text" class="drv-name" id="driver-name-input-${i}" value="${savedVal}" placeholder="Nom" onchange="syncDriverNameTitle(${i}, this.value)"></div>`);
    }
    while (drvContainer.children.length > drivers) { drvContainer.lastElementChild.remove(); }

    document.getElementById('race-type-container').classList.toggle('hidden', drivers <= 1);
    document.getElementById('splits-container').classList.toggle('hidden', drivers <= 1);
    document.getElementById('relay-gap-container').classList.toggle('hidden', !(drivers > 1 && raceType === 'online'));

    document.getElementById('driver-rules-block').classList.toggle('hidden', drivers <= 1);
    document.getElementById('max-consecutive-container').classList.toggle('hidden', !(drivers > 1 && raceType === 'irl'));

    document.getElementById('solo-race-block').classList.toggle('hidden', drivers !== 1);
    document.getElementById('calc-split-container').classList.toggle('hidden', drivers <= 1);
    document.getElementById('personalize-drivers-block').classList.toggle('hidden', drivers <= 1);

    if (drivers === 1) {
        let elMandatory = document.getElementById('mandatory-splits'); if (elMandatory) elMandatory.value = '';
        let elMaxCons = document.getElementById('max-consecutive-splits'); if (elMaxCons) elMaxCons.value = '';
        let elGap = document.getElementById('relay-gap'); if (elGap) elGap.value = '';
    } else {
        if (raceType === 'irl') {
            let elGap = document.getElementById('relay-gap'); if (elGap) elGap.value = '';
        } else if (raceType === 'online') {
            let elMaxCons = document.getElementById('max-consecutive-splits'); if (elMaxCons) elMaxCons.value = '';
        }
    }

    let isSolo = (drivers === 1);
    let isOnline = (raceType === 'online');

    let pitWindowCheckbox = document.getElementById('enable-pit-window');
    if (pitWindowCheckbox) {
        let currentMajorMode = (!isSolo && !isOnline) ? 'irl-multi' : 'other';
        if (pitWindowCheckbox.dataset.lastMode !== currentMajorMode) {
            pitWindowCheckbox.checked = (currentMajorMode === 'irl-multi');
            pitWindowCheckbox.dataset.lastMode = currentMajorMode;
        }
    }

    togglePitWindowUI();

    const soloLines = document.querySelectorAll('.hide-on-solo');
    soloLines.forEach(line => line.classList.toggle('hidden', drivers === 1));

    const termPlural = (raceType === 'online') ? 'relais' : 'splits';
    const termPluralCap = (raceType === 'online') ? 'Relais' : 'Splits';

    let lblMandatory = document.getElementById('lbl-mandatory-splits');
    if (lblMandatory) {
        lblMandatory.innerText = `${termPluralCap} obligatoires par pilote`;
    }

    const mandatoryInput = document.getElementById('mandatory-splits');
    if (mandatoryInput && splits > 1 && mandatoryInput.dataset.touched !== 'true') {
        mandatoryInput.value = Math.floor(splits / drivers);
    }

    if (drivers === 1) {
        splits = 1;
        if (document.getElementById('total-splits')) document.getElementById('total-splits').value = 1;
        document.getElementById('drivers-tech-fieldset').classList.add('hidden');
        let pt = document.getElementById('personalize-drivers-toggle');
        if (pt) { pt.checked = false; toggleDriverPersonalization(); }
    } else {
        document.getElementById('label-total-splits').innerText = `En combien de ${termPlural}`;
        document.querySelectorAll('.lbl-tire-full').forEach(el => {
            el.innerText = `Obligation en ${termPlural} complets ?`;
        });
    }

    let termSingle = (raceType === 'online') ? 'relais' : 'split';
    if (document.getElementById('text-split-calc')) {
        document.getElementById('text-split-calc').innerText = termSingle;
    }

    const timeContainer = document.getElementById('start-time-container');
    let neededTimes = (drivers === 1 || raceType === 'irl') ? 1 : splits;
    const term = (raceType === 'online') ? 'Relais' : 'Split';

    while (timeContainer.children.length < neededTimes) {
        let i = timeContainer.children.length + 1;
        let labelText = (neededTimes === 1) ? "Heure de départ prévue" : `Départ ${term} ${i}`;
        timeContainer.insertAdjacentHTML('beforeend', `<div class="time-input-wrapper input-cell"><label>${labelText}</label><input type="text" class="format-hhmm dyn-time base-start-time" id="start-time-${i}" placeholder="HH:MM" onchange="autoFillStartTimes()"></div>`);
    }
    while (timeContainer.children.length > neededTimes) { timeContainer.lastElementChild.remove(); }

    Array.from(timeContainer.children).forEach((child, index) => {
        let label = child.querySelector('label');
        if (label) label.innerText = (neededTimes === 1) ? "Heure de départ prévue" : `Départ ${term} ${index + 1}`;
    });

    updateTechDrivers(drivers);
    syncTiresVisibility();
    applyFormatters();
    calculateSplit();
}

function autoFillStartTimes() {
    let raceType = document.getElementById('race-type')?.value;
    let drivers = parseInt(document.getElementById('num-drivers').value) || 1;
    let splitsCount = parseInt(document.getElementById('total-splits').value) || 1;

    if (raceType !== 'online' || drivers <= 1 || splitsCount <= 1) return;

    let baseSec = timeStringToSeconds(document.getElementById('start-time-1')?.value || "00:00");
    let gapMin = parseInt(document.getElementById('relay-gap')?.value) || 0;
    let gapSec = gapMin * 60;
    let splitDurSec = getRaceDurationSeconds() / splitsCount;

    for (let i = 1; i < splitsCount; i++) {
        let s = baseSec + (i * splitDurSec) + (i * gapSec);
        let h = String(Math.floor(s / 3600) % 24).padStart(2, '0');
        let m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
        let el = document.getElementById(`start-time-${i + 1}`);
        if (el) { el.value = `${h}:${m}`; el.dataset.formatted = "true"; }
    }
    saveFormState();
    renderStrategy();
}

// 🚀 REPARATION DU CRASH SILENCIEUX QUI BLOQUAIT LA RESTAURATION !
function getRaceDurationSeconds() {
    let hhEl = document.getElementById('race-duration-hh');
    let mmEl = document.getElementById('race-duration-mm');

    if (hhEl || mmEl) {
        let hh = parseInt(hhEl?.value) || 0;
        let mm = parseInt(mmEl?.value) || 0;
        if (hh > 0 || mm > 0) {
            return (hh * 3600) + (mm * 60);
        }
    }

    // Au cas où l'ancien champ unique existe encore
    let val = document.getElementById('race-duration')?.value?.replace(/\D/g, '') || "";
    if (val.length === 4) return parseInt(val.substring(0, 2)) * 3600 + parseInt(val.substring(2, 4)) * 60;
    if (val.length === 3) return parseInt(val.substring(0, 1)) * 3600 + parseInt(val.substring(1, 3)) * 60;
    if (val.length <= 2 && val.length > 0) return parseInt(val) * 3600;
    return 0;
}

function calculateSplit() {
    const splits = parseInt(document.getElementById('total-splits')?.value) || 1;
    const goal = document.getElementById('race-goal')?.value;
    const resultSpan = document.getElementById('calc-split-duration');
    if (!resultSpan) return;

    if (goal === 'time') {
        let totalSeconds = getRaceDurationSeconds();
        if (totalSeconds > 0) {
            let exact = totalSeconds / splits;
            let h = String(Math.floor(exact / 3600)).padStart(2, '0');
            let m = String(Math.floor((exact % 3600) / 60)).padStart(2, '0');
            let s = String(Math.floor(exact % 60)).padStart(2, '0');
            if (!Number.isInteger(exact)) { resultSpan.innerHTML = `${h}:${m}:${s} <span class="alert-text">⚠️ Ne tombe pas juste !</span>`; }
            else { resultSpan.innerText = `${h}:${m}:${s}`; }
        } else { resultSpan.innerText = "..."; }
        autoFillStartTimes();
    } else {
        const laps = parseInt(document.getElementById('race-laps')?.value);
        if (laps > 0) {
            let exact = laps / splits;
            if (!Number.isInteger(exact)) { resultSpan.innerHTML = `${Math.floor(exact)} tours <span class="alert-text">⚠️ Reste ${laps % splits} tour(s) non divisible(s) !</span>`; }
            else { resultSpan.innerText = `${exact} tours`; }
        } else { resultSpan.innerText = "..."; }
    }
}

function syncDriverNameTitle(index, val) {
    const title = document.getElementById(`driver-card-title-${index}`);
    if (title) title.innerText = val || `Pilote ${index}`;
}

function toggleDriverPersonalization() {
    const isChecked = document.getElementById('personalize-drivers-toggle')?.checked;
    const fieldset = document.getElementById('drivers-tech-fieldset');
    if (fieldset) {
        fieldset.classList.toggle('hidden', !isChecked);
        if (isChecked) {
            ['eco', 'push'].forEach(f => {
                let gVal = document.getElementById(`cons-${f}`)?.value;
                if (gVal) { document.querySelectorAll(`.driver-fuel-${f}`).forEach(inp => { if (!inp.value) inp.value = gVal; }); }
            });
            ['T', 'M', 'D', 'I', 'P'].forEach(t => {
                let gPush = document.getElementById(`global-time-push-${t}`)?.value;
                let gEco = document.getElementById(`global-time-eco-${t}`)?.value;
                let gLife = document.getElementById(`global-life-${t}`)?.value;
                if (gPush) { document.querySelectorAll(`.driver-lap-time-push[data-tire="${t}"]`).forEach(inp => { if (!inp.value) { inp.value = gPush; inp.dispatchEvent(new Event('blur')); } }); }
                if (gEco) { document.querySelectorAll(`.driver-lap-time-eco[data-tire="${t}"]`).forEach(inp => { if (!inp.value) { inp.value = gEco; inp.dispatchEvent(new Event('blur')); } }); }
                if (gLife) { document.querySelectorAll(`.driver-tire-life[data-tire="${t}"]`).forEach(inp => { if (!inp.value) inp.value = gLife; }); }
            });
        } else {
            document.querySelectorAll('#drivers-tech-container input').forEach(inp => { inp.value = ''; });
        }
    }
}

function updateTechDrivers(numDrivers) {
    const container = document.getElementById('drivers-tech-container');
    if (!container) return;

    while (container.children.length < numDrivers) {
        let i = container.children.length + 1;
        const name = document.getElementById(`driver-name-input-${i}`)?.value || `Pilote ${i}`;
        container.insertAdjacentHTML('beforeend', generateDriverCardHTML(i, name));
    }
    while (container.children.length > numDrivers) { container.lastElementChild.remove(); }
    applyFormatters();
}

function generateDriverCardHTML(index, name) {
    return `
        <div class="driver-tech-card" id="driver-card-${index}">
            <h4 id="driver-card-title-${index}">${name}</h4>
            <div class="multi-input-group tire-row mb-10">
                <div class="tire-label"><strong>Carburant</strong></div>
                <div class="input-cell"><label class="sub-label">Conso Attack</label><input type="text" id="drv-${index}-fuel-push" class="format-lpt sync-driver-fuel driver-fuel-push" data-fuel="push" placeholder="L/t"></div>
                <div class="input-cell"><label class="sub-label">Conso Éco</label><input type="text" id="drv-${index}-fuel-eco" class="format-lpt sync-driver-fuel driver-fuel-eco" data-fuel="eco" placeholder="L/t"></div>
            </div>
            <div class="driver-tires-container">
                <div class="multi-input-group tire-row driver-tire-T hidden"><div class="tire-label"><strong>Tendres (T)</strong></div><div class="input-cell"><label class="sub-label">Chrono ATTACK</label><input type="text" id="drv-${index}-time-push-T" class="format-mss000 driver-lap-time-push" data-tire="T" placeholder="MM:SS.000"></div><div class="input-cell"><label class="sub-label">Chrono ÉCO</label><input type="text" id="drv-${index}-time-eco-T" class="format-mss000 driver-lap-time-eco" data-tire="T" placeholder="MM:SS.000"></div><div class="input-cell"><label class="sub-label">Durée de vie</label><input type="number" id="drv-${index}-life-T" class="driver-tire-life" data-tire="T" placeholder="Nb Tours"></div></div>
                <div class="multi-input-group tire-row driver-tire-M hidden"><div class="tire-label"><strong>Mediums (M)</strong></div><div class="input-cell"><label class="sub-label">Chrono ATTACK</label><input type="text" id="drv-${index}-time-push-M" class="format-mss000 driver-lap-time-push" data-tire="M" placeholder="MM:SS.000"></div><div class="input-cell"><label class="sub-label">Chrono ÉCO</label><input type="text" id="drv-${index}-time-eco-M" class="format-mss000 driver-lap-time-eco" data-tire="M" placeholder="MM:SS.000"></div><div class="input-cell"><label class="sub-label">Durée de vie</label><input type="number" id="drv-${index}-life-M" class="driver-tire-life" data-tire="M" placeholder="Nb Tours"></div></div>
                <div class="multi-input-group tire-row driver-tire-D hidden"><div class="tire-label"><strong>Durs (D)</strong></div><div class="input-cell"><label class="sub-label">Chrono ATTACK</label><input type="text" id="drv-${index}-time-push-D" class="format-mss000 driver-lap-time-push" data-tire="D" placeholder="MM:SS.000"></div><div class="input-cell"><label class="sub-label">Chrono ÉCO</label><input type="text" id="drv-${index}-time-eco-D" class="format-mss000 driver-lap-time-eco" data-tire="D" placeholder="MM:SS.000"></div><div class="input-cell"><label class="sub-label">Durée de vie</label><input type="number" id="drv-${index}-life-D" class="driver-tire-life" data-tire="D" placeholder="Nb Tours"></div></div>
                <div class="multi-input-group tire-row driver-tire-I hidden"><div class="tire-label"><strong>Inter. (I)</strong></div><div class="input-cell"><label class="sub-label">Chrono ATTACK</label><input type="text" id="drv-${index}-time-push-I" class="format-mss000 driver-lap-time-push" data-tire="I" placeholder="MM:SS.000"></div><div class="input-cell"><label class="sub-label">Chrono ÉCO</label><input type="text" id="drv-${index}-time-eco-I" class="format-mss000 driver-lap-time-eco" data-tire="I" placeholder="MM:SS.000"></div><div class="input-cell"><label class="sub-label">Durée de vie</label><input type="number" id="drv-${index}-life-I" class="driver-tire-life" data-tire="I" placeholder="Nb Tours"></div></div>
                <div class="multi-input-group tire-row driver-tire-P hidden"><div class="tire-label"><strong>Pluie (P)</strong></div><div class="input-cell"><label class="sub-label">Chrono ATTACK</label><input type="text" id="drv-${index}-time-push-P" class="format-mss000 driver-lap-time-push" data-tire="P" placeholder="MM:SS.000"></div><div class="input-cell"><label class="sub-label">Chrono ÉCO</label><input type="text" id="drv-${index}-time-eco-P" class="format-mss000 driver-lap-time-eco" data-tire="P" placeholder="MM:SS.000"></div><div class="input-cell"><label class="sub-label">Durée de vie</label><input type="number" id="drv-${index}-life-P" class="driver-tire-life" data-tire="P" placeholder="Nb Tours"></div></div>
            </div>
        </div>
    `;
}

function toggleTireOptions(id) {
    const isChecked = document.getElementById(`use-${id}`)?.checked;
    document.getElementById(`options-${id}`).classList.toggle('hidden', !isChecked);
    if (!isChecked) {
        document.querySelectorAll(`#options-${id} input`).forEach(inp => {
            if (inp.type === 'checkbox') inp.checked = false;
            else { inp.value = ''; handleTireValue(inp); }
        });
    }
    syncTiresVisibility();
}

// 🚀 SÉCURITÉ ABSOLUE : On vérifie si l'élément parent existe pour ne pas faire crasher le script
function handleTireCondition(cb) {
    if (!cb) return;
    let parent = cb.closest('.tire-condition');
    if (parent) {
        let input = parent.querySelector('.cond-val');
        if (input) {
            if (cb.checked && !input.value) input.value = 1;
            else if (!cb.checked) input.value = '';
        }
    }
}

function handleTireValue(input) {
    if (!input) return;
    let parent = input.closest('.tire-condition');
    if (parent) {
        let cb = parent.querySelector('.cond-check');
        if (cb) cb.checked = (input.value !== '' && parseFloat(input.value) > 0);
    }
}

function syncTiresVisibility() {
    const tires = ['T', 'M', 'D', 'I', 'P'];
    let anyChecked = false;
    tires.forEach(t => {
        const checked = document.getElementById(`use-${t}`)?.checked;
        if (checked) anyChecked = true;
        if (document.getElementById(`global-tire-${t}`)) document.getElementById(`global-tire-${t}`).classList.toggle('hidden', !checked);
        document.querySelectorAll(`.driver-tire-${t}`).forEach(row => row.classList.toggle('hidden', !checked));
    });
    if (document.getElementById('no-tire-warning')) document.getElementById('no-tire-warning').classList.toggle('hidden', anyChecked);
}

function applyFormatters() {
    document.querySelectorAll('.format-hhmm:not([data-formatted])').forEach(input => {
        input.addEventListener('blur', function () {
            let val = this.value.replace(/\D/g, '');
            if (val.length >= 3) {
                let m = val.slice(-2);
                let h = val.slice(0, -2).padStart(2, '0');
                this.value = `${h}:${m}`;
            } else if (val.length > 0) {
                this.value = `${val.padStart(2, '0')}:00`;
            }
        });
        input.addEventListener('focus', function () { this.value = this.value.replace(/:/g, ''); });
        input.dataset.formatted = "true";
    });
    document.querySelectorAll('.format-liters:not([data-formatted])').forEach(input => {
        input.addEventListener('blur', function () { let val = this.value.replace(/\D/g, ''); if (val !== '') this.value = val + " L"; });
        input.addEventListener('focus', function () { this.value = this.value.replace(' L', ''); });
        input.dataset.formatted = "true";
    });
    document.querySelectorAll('.format-lps:not([data-formatted])').forEach(input => {
        input.addEventListener('blur', function () { let val = this.value.replace(',', '.'); if (val !== '' && !isNaN(parseFloat(val))) this.value = parseFloat(val) + " L/s"; });
        input.addEventListener('focus', function () { this.value = this.value.replace(' L/s', ''); });
        input.dataset.formatted = "true";
    });
    document.querySelectorAll('.format-lpt:not([data-formatted])').forEach(input => {
        input.addEventListener('blur', function () { let val = this.value.replace(',', '.'); if (val !== '' && !isNaN(parseFloat(val))) this.value = parseFloat(val) + " L/t"; });
        input.addEventListener('focus', function () { this.value = this.value.replace(' L/t', ''); });
        input.dataset.formatted = "true";
    });
    document.querySelectorAll('.format-sec:not([data-formatted])').forEach(input => {
        input.addEventListener('blur', function () {
            let val = this.value.replace(',', '.');
            let match = val.match(/(\d+(\.\d+)?)/);
            if (match) {
                this.value = match[0] + " s";
            }
        });
        input.addEventListener('focus', function () {
            this.value = this.value.replace(' s', '');
        });
        input.dataset.formatted = "true";
    });
    document.querySelectorAll('.format-mss000:not([data-formatted])').forEach(input => {
        input.addEventListener('blur', function () {
            let val = this.value.replace(/\D/g, '');
            if (val.length >= 4) {
                let ms = val.slice(-3); let s = val.slice(-5, -3).padStart(2, '0'); let m = val.slice(0, -5) || '0';
                this.value = `${m}:${s}.${ms}`;
            }
        });
        input.addEventListener('focus', function () { this.value = this.value.replace(/[:.]/g, ''); });
        input.dataset.formatted = "true";
    });
}

function bindGlobalSyncEvents() {
    ['eco', 'push'].forEach(f => {
        const globalInput = document.getElementById(`cons-${f}`);
        if (globalInput) {
            globalInput.addEventListener('blur', function () {
                document.querySelectorAll(`.driver-fuel-${f}`).forEach(drv => { drv.value = this.value; });
                saveFormState();
            });
        }
    });
    ['T', 'M', 'D', 'I', 'P'].forEach(t => {
        const gp = document.getElementById(`global-time-push-${t}`);
        const ge = document.getElementById(`global-time-eco-${t}`);
        const gl = document.getElementById(`global-life-${t}`);

        if (gp) { gp.addEventListener('blur', function () { document.querySelectorAll(`.driver-lap-time-push[data-tire="${t}"]`).forEach(drv => { drv.value = this.value; }); saveFormState(); }); }
        if (ge) { ge.addEventListener('blur', function () { document.querySelectorAll(`.driver-lap-time-eco[data-tire="${t}"]`).forEach(drv => { drv.value = this.value; }); saveFormState(); }); }
        if (gl) { gl.addEventListener('blur', function () { document.querySelectorAll(`.driver-tire-life[data-tire="${t}"]`).forEach(drv => { drv.value = this.value; }); saveFormState(); }); }
    });
}

// ==========================================
// --- MOTEUR LIVE TIMING & SPOTTER (requestAnimationFrame) ---
// ==========================================

function startLiveTimer(splitIdx) {
    let goal = document.getElementById('race-goal')?.value;
    let raceType = document.getElementById('race-type')?.value || 'irl';
    let isOnline = (raceType === 'online');

    let totalSecRace = getRaceDurationSeconds();
    let splitsCount = parseInt(document.getElementById('total-splits').value) || 1;
    let splitDurSec = totalSecRace / splitsCount;

    let targetSec = (goal === 'laps') ? Infinity : (isOnline ? splitDurSec : totalSecRace);

    let now = new Date();
    let h = String(now.getHours()).padStart(2, '0');
    let m = String(now.getMinutes()).padStart(2, '0');

    let idToUpdate = isOnline ? `start-time-${splitIdx + 1}` : `start-time-1`;
    let el = document.getElementById(idToUpdate);
    if (el) {
        el.value = `${h}:${m}`;
        el.dataset.formatted = "true";
    }

    autoFillStartTimes();

    let timerState = {
        active: true,
        type: isOnline ? 'online' : 'irl',
        splitIdx: splitIdx,
        targetSec: targetSec,
        startTimeReal: Date.now()
    };
    localStorage.setItem('stratefreez-timer', JSON.stringify(timerState));

    saveFormState();
    renderStrategy();
    runTimerLoop();
}

function runTimerLoop() {
    liveTimerActive = true;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    function loop(timestamp) {
        if (!liveTimerActive) return;

        if (timestamp - lastTimerTick >= 1000) {
            timerTick();
            lastTimerTick = timestamp;
        }
        animationFrameId = requestAnimationFrame(loop);
    }
    animationFrameId = requestAnimationFrame(loop);
}

document.addEventListener("visibilitychange", function () {
    if (!document.hidden && liveTimerActive) {
        timerTick();
    }
});

function timerTick() {
    let str = localStorage.getItem('stratefreez-timer');
    if (!str) return;
    let timerState = JSON.parse(str);
    if (!timerState || !timerState.active) return;

    let elapsed = Math.floor((Date.now() - timerState.startTimeReal) / 1000);
    let targetSec = timerState.targetSec;
    let isOvertime = elapsed >= targetSec;

    let navTitle = document.getElementById('nav-brand-text');
    if (navTitle) {
        let eh = String(Math.floor(elapsed / 3600)).padStart(2, '0');
        let em = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
        let es = String(Math.floor(elapsed % 60)).padStart(2, '0');
        navTitle.innerText = `${eh}:${em}:${es}`;
        navTitle.className = 'nav-brand chrono-active';
        // 🚀 Le chrono passe en rouge si on dépasse le temps cible
        if (isOvertime) navTitle.classList.add('text-danger');
    }

    // 🚀 La marge de grâce de 5 minutes (300 secondes)
    if (elapsed >= targetSec + 300) {
        // Validation silencieuse de la fin de course
        if (timerState.type === 'online') {
            if (strategySplits[timerState.splitIdx]) strategySplits[timerState.splitIdx].isFinished = true;
        } else {
            strategySplits.forEach(s => s.isFinished = true);
        }
        saveFormState();
        stopTimer(true);
        return;
    }

    let firstUnpitted = null;
    for (let i = 0; i < strategySplits.length; i++) {
        if (timerState.type === 'online' && i !== timerState.splitIdx) continue;
        for (let j = 0; j < strategySplits[i].stints.length; j++) {
            if (!strategySplits[i].stints[j].isPitted) {
                firstUnpitted = { i, j, stint: strategySplits[i].stints[j] };
                break;
            }
        }
        if (firstUnpitted) break;
    }

    document.querySelectorAll('.active-live-stint').forEach(el => el.classList.remove('active-live-stint'));

    if (firstUnpitted && firstUnpitted.stint.startSec !== undefined) {
        // 🚀 CORRECTION : On applique la surbrillance instantanément au prochain relais à faire (firstUnpitted)
        // sans attendre que le chrono n'atteigne mathématiquement la fin de l'arrêt aux stands !
        let tr = document.querySelector(`tr[data-stint="${firstUnpitted.i}-${firstUnpitted.j}"]`);
        if (tr) tr.classList.add('active-live-stint');

        // On auto-pit seulement si on n'est pas en overtime (on laisse le spotter gérer la fin)
        if (elapsed >= firstUnpitted.stint.endSec + 300 && !isOvertime) {
            strategySplits[firstUnpitted.i].stints[firstUnpitted.j].isPitted = true;
            strategySplits[firstUnpitted.i].stints[firstUnpitted.j].lockedTimeSec = firstUnpitted.stint.endSec;
            cascadeFixPitWindows();
            saveFormState();
            renderStrategy();
            return;
        }
    }

    updateLiveSpotter(elapsed, timerState);
}

function updateLiveSpotter(elapsed, timerState) {
    const offlineMsg = document.getElementById('live-offline-msg');
    const dashboard = document.getElementById('live-dashboard');

    if (!timerState || !timerState.active) {
        if (offlineMsg) offlineMsg.classList.remove('hidden');
        if (dashboard) dashboard.classList.add('hidden');
        return;
    }

    let activeStint = null;
    let nextStint = null;
    let nextStintDriver = null;

    // 🚀 1. RECHERCHE DU PREMIER STINT NON TERMINÉ
    let firstUnpittedI = -1;
    let firstUnpittedJ = -1;

    for (let i = 0; i < strategySplits.length; i++) {
        if (timerState.type === 'online' && i !== timerState.splitIdx) continue;
        for (let j = 0; j < strategySplits[i].stints.length; j++) {
            if (!strategySplits[i].stints[j].isPitted) {
                firstUnpittedI = i;
                firstUnpittedJ = j;
                break;
            }
        }
        if (firstUnpittedI !== -1) break;
    }

    // 🚀 2. DÉTECTION DE LA "ZONE TAMPON" (Le Pit Buffer avec marge de 5s)
    let pitBufferStint = null;

    if (firstUnpittedI !== -1) {
        let prevI = firstUnpittedI;
        let prevJ = firstUnpittedJ - 1;

        if (prevJ < 0) {
            prevI--;
            if (prevI >= 0 && timerState.type !== 'online') {
                prevJ = strategySplits[prevI].stints.length - 1;
            }
        }

        if (prevI >= 0 && prevJ >= 0) {
            let pStint = strategySplits[prevI].stints[prevJ];
            if (pStint.isPitted && pStint.lockedTimeSec !== null && !pStint.pitExitForced) {
                let timeSincePit = elapsed - pStint.lockedTimeSec;
                let pitDuration = pStint.nextPitTime || 0;
                // Protection pour ne pas faire de buffer sur le drapeau à damier
                let isVeryLast = (timerState.type === 'online') ?
                    (prevJ === strategySplits[prevI].stints.length - 1) :
                    (prevI === strategySplits.length - 1 && prevJ === strategySplits[prevI].stints.length - 1);

                if (!isVeryLast && timeSincePit < pitDuration + 5) {
                    pitBufferStint = pStint;
                    pitBufferStint.splitIdx = prevI;
                    pitBufferStint.stintIdx = prevJ;
                    pitBufferStint.driverName = strategySplits[prevI].driver;
                    pitBufferStint.timeSincePit = timeSincePit;
                }
            }
        }
    }

    let isPitBufferMode = (pitBufferStint !== null);

    // 🚀 3. ATTRIBUTION DU STINT ACTIF (Gelé ou Normal)
    if (isPitBufferMode) {
        activeStint = pitBufferStint;
        nextStint = strategySplits[firstUnpittedI].stints[firstUnpittedJ];
        nextStintDriver = strategySplits[firstUnpittedI].driver;
    } else {
        if (firstUnpittedI !== -1) {
            activeStint = strategySplits[firstUnpittedI].stints[firstUnpittedJ];
            activeStint.splitIdx = firstUnpittedI;
            activeStint.stintIdx = firstUnpittedJ;
            activeStint.driverName = strategySplits[firstUnpittedI].driver;

            if (firstUnpittedJ + 1 < strategySplits[firstUnpittedI].stints.length) {
                nextStint = strategySplits[firstUnpittedI].stints[firstUnpittedJ + 1];
                nextStint.splitIdx = firstUnpittedI;         // 🚀 NOUVEAU
                nextStint.stintIdx = firstUnpittedJ + 1;     // 🚀 NOUVEAU
                nextStintDriver = strategySplits[firstUnpittedI].driver;
            } else if (firstUnpittedI + 1 < strategySplits.length && timerState.type !== 'online') {
                nextStint = strategySplits[firstUnpittedI + 1].stints[0];
                nextStint.splitIdx = firstUnpittedI + 1;     // 🚀 NOUVEAU
                nextStint.stintIdx = 0;                      // 🚀 NOUVEAU
                nextStintDriver = strategySplits[firstUnpittedI + 1].driver;
            }
        }
    }

    // 🚀 4. MISE À JOUR VISUELLE
    if (activeStint && activeStint.startSec !== undefined) {
        if (offlineMsg) offlineMsg.classList.add('hidden');
        if (dashboard) dashboard.classList.remove('hidden');

        let driverEl = document.getElementById('live-driver');
        if (driverEl) driverEl.innerText = activeStint.driverName;

        let tireEl = document.getElementById('live-tire');
        if (tireEl) tireEl.innerHTML = `<span class="tire-circle bg-tire-${activeStint.tire}">${activeStint.tire}</span>`;

        let fStrat = activeStint.fuelStrat.toUpperCase();
        let fuelRate = getDriverFuelRate(activeStint.driverName, activeStint.fuelStrat);

        let fuelPill = document.getElementById('live-fuel-pill');
        if (fuelPill) fuelPill.className = `live-fuel-pill ${fStrat === 'PUSH' ? 'bg-fuel-push' : 'bg-fuel-eco'}`;

        let fuelStratEl = document.getElementById('live-fuel-strat');
        if (fuelStratEl) {
            fuelStratEl.innerText = fuelRate.toFixed(2) + " L/t";
            // 🚀 NOUVEAU : Ajout de cursor-pointer et de l'événement onclick
            fuelStratEl.className = fStrat === 'PUSH' ? 'text-push cursor-pointer ml-8' : 'text-eco cursor-pointer ml-8';
            fuelStratEl.onclick = () => toggleStintFuelStrat(activeStint.splitIdx, activeStint.stintIdx);
        }

        let timeInStint = elapsed - activeStint.startSec;
        if (activeStint.lockedTimeSec !== null && activeStint.isPitted) {
            timeInStint = activeStint.lockedTimeSec - activeStint.startSec; // Fige le chrono global pendant l'arrêt
        }
        if (timeInStint < 0) timeInStint = 0;
        let lapSec = activeStint.lapSec || 120;

        let currentEstimatedLap = (activeStint.startLap || 0) + Math.floor(timeInStint / lapSec) + 1;
        let curLapEl = document.getElementById('live-current-lap');
        if (curLapEl) curLapEl.innerText = currentEstimatedLap;

        // NOUVEAU : Nombre de tours du relais en cours
        let stintLapsEl = document.getElementById('live-current-stint-laps');
        if (stintLapsEl) {
            stintLapsEl.innerText = `${activeStint.laps} tours`;
            stintLapsEl.className = `fs-1-2 font-weight-bold mb-5 ${fStrat === 'PUSH' ? 'text-push' : 'text-eco'}`;
        }

        let tgtLapEl = document.getElementById('live-target-lap');
        if (tgtLapEl) tgtLapEl.innerText = activeStint.endLap || 0;

        let targetH = String(Math.floor((activeStint.endSec) / 3600)).padStart(2, '0');
        let targetM = String(Math.floor((activeStint.endSec % 3600) / 60)).padStart(2, '0');
        let targetS = String(Math.floor((activeStint.endSec) % 60)).padStart(2, '0');
        let tgtTimeEl = document.getElementById('live-target-time');
        if (tgtTimeEl) tgtTimeEl.innerText = `${targetH}:${targetM}:${targetS}`;

        let timeRem = activeStint.endSec - elapsed;
        if (activeStint.isPitted && activeStint.lockedTimeSec !== null) timeRem = 0; // Fige à 0 pendant l'arrêt
        let sign = timeRem < 0 ? "+" : "-";
        let absRem = Math.abs(timeRem);
        let rh = String(Math.floor(absRem / 3600)).padStart(2, '0');
        let rm = String(Math.floor((absRem % 3600) / 60)).padStart(2, '0');
        let rs = String(Math.floor(absRem % 60)).padStart(2, '0');
        let remStr = (rh !== '00' ? `${rh}:` : '') + `${rm}:${rs}`;

        let hourglassIcon = sign === "+" ? "hourglass_bottom" : "hourglass_top";
        let countdownEl = document.getElementById('live-countdown');
        if (countdownEl) {
            countdownEl.innerHTML = `<span class="material-symbols-outlined live-grey-icon mr-15">${hourglassIcon}</span> ${sign} ${remStr}`;
            countdownEl.className = "live-countdown";
            if (sign === "+") countdownEl.classList.add("text-danger");
            else if (absRem <= 120) countdownEl.classList.add("text-warning");
            else countdownEl.classList.add("text-success");
        }

        let isUltimateStint = false;
        if (timerState.type === 'online') {
            isUltimateStint = (activeStint.stintIdx === strategySplits[activeStint.splitIdx].stints.length - 1);
        } else {
            isUltimateStint = (activeStint.splitIdx === strategySplits.length - 1 && activeStint.stintIdx === strategySplits[activeStint.splitIdx].stints.length - 1);
        }

        let nextBox = document.getElementById('live-next-box');
        let finishBox = document.getElementById('live-finish-box');
        let pitBtn = document.getElementById('live-btn-pitin');

        if (isUltimateStint && !isPitBufferMode) {
            // DRAPEAU À DAMIER CONSERVÉ
            if (nextBox) nextBox.classList.add('hidden');
            if (finishBox) {
                finishBox.classList.remove('hidden');
                let finishContent = finishBox.querySelector('.live-card-content');
                if (finishContent) finishContent.innerHTML = '<div class="large-finish-flag">🏁</div>';
            }
            if (pitBtn) pitBtn.classList.add('hidden');
        } else {
            if (pitBtn) pitBtn.classList.remove('hidden');

            if (finishBox) {
                let finishContent = finishBox.querySelector('.live-card-content');
                if (finishContent) finishContent.innerHTML = '<p class="finish-msg">Dernier stint</p>';
            }

            if (nextStint) {
                if (nextBox) nextBox.classList.remove('hidden');
                if (finishBox) finishBox.classList.add('hidden');

                let nextDrvEl = document.getElementById('live-next-driver');
                if (nextDrvEl) nextDrvEl.innerText = nextStintDriver;

                let tireContainer = document.getElementById('live-next-tire-container');
                if (tireContainer) {
                    if (nextStint.changeTires) {
                        tireContainer.innerHTML = `<span class="tire-circle bg-tire-${nextStint.tire}">${nextStint.tire}</span>`;
                    } else {
                        tireContainer.innerHTML = `<span class="text-grey font-weight-bold fs-1-2">Conserver ${activeStint.tire}</span>`;
                    }
                }

                let targetFuel = nextStint.cachedTargetFuel || 100;
                if (nextStint.manualFuel !== null && nextStint.manualFuel !== undefined) targetFuel = parseFloat(nextStint.manualFuel);
                if (targetFuel > 100) targetFuel = 100;

                let fuelEl = document.getElementById('live-next-fuel');
                let fuelToAdd = activeStint.fuelToAddForNext || 0;
                if (fuelEl) {
                    // 🚀 NOUVEAU : Détection de forçage manuel pour le style visuel
                    let isManual = (nextStint.manualFuel !== null && nextStint.manualFuel !== undefined);
                    let manualClass = isManual ? "manual-override-text" : "";

                    if (fuelToAdd > 0) {
                        fuelEl.innerText = `${targetFuel.toFixed(1)} L`;
                        fuelEl.className = `fuel-highlight text-warning ml-8 cursor-pointer ${manualClass}`;
                    } else {
                        fuelEl.innerText = `NON`;
                        fuelEl.className = `pit-no-fuel text-success ml-8 cursor-pointer ${manualClass}`;
                    }
                    // 🚀 NOUVEAU : Action pour ouvrir la modale
                    fuelEl.onclick = () => openFuelModal(nextStint.splitIdx, nextStint.stintIdx, nextStint.cachedTargetFuel);
                }

                let pitTimeEl = document.getElementById('live-next-pit-time');
                let nextBoxTitle = nextBox.querySelector('.live-card-title');

                if (isPitBufferMode) {
                    if (nextBoxTitle) nextBoxTitle.innerText = "ARRÊT EN COURS";
                    nextBox.classList.add('pit-buffer-active');

                    // Calcul propre du compte à rebours
                    let timeRemaining = Math.max(0, Math.ceil(activeStint.nextPitTime - activeStint.timeSincePit));
                    if (pitTimeEl) pitTimeEl.innerText = `${timeRemaining}s`;

                    if (pitBtn) {
                        pitBtn.innerHTML = `<span class="material-symbols-outlined icon-xl mr-15">sports_score</span> PIT OUT`;
                        pitBtn.className = "live-giant-btn btn-success";
                        pitBtn.onclick = () => { forcePitOut(activeStint.splitIdx, activeStint.stintIdx); };
                    }
                } else {
                    if (nextBoxTitle) nextBoxTitle.innerText = "CONSIGNES PIT";
                    nextBox.classList.remove('pit-buffer-active');

                    // 🚀 CORRECTION : Math.ceil ici aussi pour une harmonisation absolue
                    if (pitTimeEl) pitTimeEl.innerText = `${Math.ceil(activeStint.nextPitTime || 0)}s`;

                    if (pitBtn) {
                        pitBtn.innerHTML = `<span class="material-symbols-outlined icon-xl mr-15">flag</span> PIT IN`;
                        pitBtn.className = "live-giant-btn";
                        pitBtn.onclick = () => { openPitModal(activeStint.splitIdx, activeStint.stintIdx); };
                    }
                }

            } else {
                if (nextBox) nextBox.classList.add('hidden');
                if (finishBox) finishBox.classList.remove('hidden');
            }
        }

    } else {
        // MESSAGE DE FIN DE COURSE CONSERVÉ
        if (offlineMsg) {
            offlineMsg.classList.remove('hidden');
            offlineMsg.innerHTML = `<span class="material-symbols-outlined icon-huge-grey text-success">sports_score</span><h2 class="text-huge-spaced text-success">COURSE TERMINÉE</h2><p class="help-text fs-1-2">Tous les relais ont été validés.</p>`;
        }
        if (dashboard) dashboard.classList.add('hidden');
    }
}

// 🚀 NOUVELLE FONCTION : Bypass du Buffer Manuel
function forcePitOut(splitIdx, stintIdx) {
    if (strategySplits[splitIdx] && strategySplits[splitIdx].stints[stintIdx]) {
        strategySplits[splitIdx].stints[stintIdx].pitExitForced = true;
        saveFormState();
        timerTick(); // Force le rafraîchissement visuel immédiat
    }
}

function handleNavClick() {
    let str = localStorage.getItem('stratefreez-timer');
    if (str) {
        let timerState = JSON.parse(str);
        if (timerState && timerState.active) {
            let inp = document.getElementById('stop-timer-input');
            if (inp) inp.value = '';
            checkStopTimerInput();
            document.getElementById('stop-timer-modal').classList.remove('hidden');
            setTimeout(() => { if (inp) inp.focus(); }, 50);
        }
    }
}

function checkStopTimerInput() {
    let val = document.getElementById('stop-timer-input')?.value.toLowerCase();
    let btn = document.getElementById('btn-confirm-stop');
    if (btn) {
        if (val === 'stop') {
            btn.disabled = false;
            btn.classList.remove('btn-disabled');
        } else {
            btn.disabled = true;
            btn.classList.add('btn-disabled');
        }
    }
}

function closeStopTimerModal() {
    document.getElementById('stop-timer-modal').classList.add('hidden');
}

function confirmStopTimer() {
    closeStopTimerModal();
    stopTimer(false);
}

function stopTimer(isRaceEnd) {
    liveTimerActive = false;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    localStorage.removeItem('stratefreez-timer');

    let navTitle = document.getElementById('nav-brand-text');
    if (navTitle) {
        navTitle.innerText = "STRATEFREEZ";
        navTitle.classList.remove('chrono-active');
    }
    document.querySelectorAll('.active-live-stint').forEach(el => el.classList.remove('active-live-stint'));

    renderStrategy();
    updateLiveSpotter(0, null);

    if (isRaceEnd) {
        localStorage.setItem('stratefreez-is-race-active', 'false'); // 🚀 AXE 1 : Marque la course comme terminée
        isRaceActive = false; // Mise à jour de la variable globale
        // 🚀 ÉTAPE 1 : On désactive la course dans le Cloud pour la cacher du menu "Rejoindre"
        if (currentRaceId) {
            db.collection('races').doc(currentRaceId).update({ isActive: false }).catch(e => console.error(e));
        }
    }
}

function loadTimerState() {
    let str = localStorage.getItem('stratefreez-timer');
    if (str) {
        let timerState = JSON.parse(str);
        if (timerState && timerState.active) {
            runTimerLoop();
        }
    } else {
        updateLiveSpotter(0, null);
    }
}

// ==========================================
// --- ONGLET 3 : MOTEUR STRATÉGIE VASE COMMUNICANT ---
// ==========================================

function openExcessModal(msg) {
    let msgEl = document.getElementById('excess-stint-msg');
    if (msgEl && msg) msgEl.innerHTML = msg;

    // 🚀 DÉSACTIVÉ TEMPORAIREMENT À TA DEMANDE (S'affiche uniquement en console pour debug)
    console.warn("Alerte Moteur :", msg || "Capacité maximale des gommes atteinte.");

    // document.getElementById('excess-stint-modal').classList.remove('hidden');
}

function closeExcessModal() {
    document.getElementById('excess-stint-modal').classList.add('hidden');
}

// 🚀 NOUVELLE FONCTION : Le Vrai Reset (Relancer la course)
function openRestartModal() { document.getElementById('restart-modal').classList.remove('hidden'); }
function closeRestartModal() { document.getElementById('restart-modal').classList.add('hidden'); }

function confirmRestartRace() {
    strategySplits.forEach(split => {
        split.isFinished = false; // On retire le drapeau de fin
        split.stints.forEach(stint => {
            stint.isPitted = false;
            stint.lockedTimeSec = null;
            stint.manualFuel = null; // Vrai reset des calculs auto
        });
    });

    localStorage.removeItem('stratefreez-timer');
    liveTimerActive = false;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    let navTitle = document.getElementById('nav-brand-text');
    if (navTitle) {
        navTitle.innerText = "STRATEFREEZ";
        navTitle.className = 'nav-brand';
    }

    cascadeFixPitWindows();
    saveFormState();
    renderStrategy();
    updateLiveSpotter(0, null);
    closeRestartModal();
}

function openClearModal() { document.getElementById('clear-modal').classList.remove('hidden'); }
function closeClearModal() { document.getElementById('clear-modal').classList.add('hidden'); }
function confirmClearStrategy() {
    strategySplits = [];
    closeClearModal();
    initStrategyData();
    renderStrategy();
}

function openBilanModal() { document.getElementById('bilan-modal').classList.remove('hidden'); }
function closeBilanModal() { document.getElementById('bilan-modal').classList.add('hidden'); }

// 🚀 NOUVELLE FONCTION : Bascule rapide Eco/Attack depuis l'onglet Live
function toggleStintFuelStrat(i, j) {
    if (strategySplits[i] && strategySplits[i].stints[j]) {
        let stint = strategySplits[i].stints[j];
        stint.fuelStrat = (stint.fuelStrat === 'push') ? 'eco' : 'push';
        cascadeFixPitWindows();
        saveFormState();
        renderStrategy();
        if (liveTimerActive) timerTick(); // Rafraîchissement visuel instantané
    }
}
function openFuelModal(i, j, calcValue) {
    fuelModalTarget = { i, j };
    document.getElementById('fuel-modal-calc').innerText = calcValue.toFixed(1);
    let currentManual = strategySplits[i].stints[j].manualFuel;
    document.getElementById('fuel-modal-input').value = (currentManual !== null && currentManual !== undefined) ? currentManual : '';
    document.getElementById('fuel-modal').classList.remove('hidden');
    setTimeout(() => { document.getElementById('fuel-modal-input').focus(); }, 50);
}

function closeFuelModal() {
    document.getElementById('fuel-modal').classList.add('hidden');
    fuelModalTarget = null;
}

function confirmFuelOverride() {
    if (fuelModalTarget) {
        let val = document.getElementById('fuel-modal-input').value;
        strategySplits[fuelModalTarget.i].stints[fuelModalTarget.j].manualFuel = (val === '' || isNaN(val)) ? null : parseFloat(val);
        cascadeFixPitWindows();
        saveFormState();
        renderStrategy();
        if (liveTimerActive) timerTick(); // 🚀 NOUVEAU : Met à jour le Spotter instantanément
        closeFuelModal();
    }
}

function clearFuelOverride() {
    if (fuelModalTarget) {
        strategySplits[fuelModalTarget.i].stints[fuelModalTarget.j].manualFuel = null;
        cascadeFixPitWindows();
        saveFormState();
        renderStrategy();
        if (liveTimerActive) timerTick(); // 🚀 NOUVEAU : Met à jour le Spotter instantanément
        closeFuelModal();
    }
}

function getAvailableDrivers() {
    let d = []; document.querySelectorAll('.drv-name').forEach((inp, i) => { if (inp.value) d.push(inp.value); else d.push(`Pilote ${i + 1}`); });
    return d.length ? d : ["Pilote 1"];
}
function getAvailableSpotters() {
    let s = [];
    if (document.getElementById('has-spotter').checked) { document.querySelectorAll('.spotter-name').forEach((inp, i) => { if (inp.value) s.push(inp.value); else s.push(`Spotter ${i + 1}`); }); }
    return s;
}
function getAvailableTires() {
    let t = [];['T', 'M', 'D', 'I', 'P'].forEach(c => { if (document.getElementById(`use-${c}`)?.checked) t.push(c); });
    return t;
}
function getDriverFuelRate(driverName, strat) {
    if (!strat) strat = 'push';
    let drvIndex = getAvailableDrivers().indexOf(driverName) + 1;
    let drivers = parseInt(document.getElementById('num-drivers').value) || 1;
    if (drivers > 1 && document.getElementById('personalize-drivers-toggle')?.checked) {
        let val = parseFloat(document.getElementById(`drv-${drvIndex}-fuel-${strat}`)?.value?.replace(/[^\d.]/g, ''));
        if (!isNaN(val)) return val;
    }
    return parseFloat(document.getElementById(`cons-${strat}`)?.value?.replace(/[^\d.]/g, '')) || 3.0;
}
function getDriverLapSeconds(driverName, tire, strat) {
    if (!strat) strat = 'push';
    let drvIndex = getAvailableDrivers().indexOf(driverName) + 1;
    let drivers = parseInt(document.getElementById('num-drivers').value) || 1;
    let timeStr = "";

    if (drivers > 1 && document.getElementById('personalize-drivers-toggle')?.checked) {
        timeStr = document.getElementById(`drv-${drvIndex}-time-${strat}-${tire}`)?.value;
    }
    if (!timeStr) timeStr = document.getElementById(`global-time-${strat}-${tire}`)?.value;
    if (!timeStr) return 120;

    let parts = timeStr.split(':');
    if (parts.length === 2) {
        return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
    } else if (parts.length === 3) {
        return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
    }
    return 120;
}
function getDriverTireLife(driverName, tire) {
    let drvIndex = getAvailableDrivers().indexOf(driverName) + 1;
    let drivers = parseInt(document.getElementById('num-drivers').value) || 1;
    if (drivers > 1 && document.getElementById('personalize-drivers-toggle')?.checked) {
        let val = parseInt(document.getElementById(`drv-${drvIndex}-life-${tire}`)?.value);
        if (!isNaN(val)) return val;
    }
    return parseInt(document.getElementById(`global-life-${tire}`)?.value) || 999;
}

function timeStringToSeconds(str) {
    if (!str) return 0;
    if (str.includes(':')) {
        let p = str.split(':');
        if (p.length === 3) return parseInt(p[0] || 0) * 3600 + parseInt(p[1] || 0) * 60 + parseInt(p[2] || 0);
        if (p.length === 2) return parseInt(p[0] || 0) * 3600 + parseInt(p[1] || 0) * 60;
    } else {
        let val = str.replace(/\D/g, '');
        if (val.length === 6) return parseInt(val.substring(0, 2)) * 3600 + parseInt(val.substring(2, 4)) * 60 + parseInt(val.substring(4, 6));
        if (val.length === 4) return parseInt(val.substring(0, 2)) * 3600 + parseInt(val.substring(2, 4)) * 60;
        if (val.length <= 2 && val.length > 0) return parseInt(val) * 3600;
    }
    return 0;
}
function formatTime(seconds) {
    let h = String(Math.floor(seconds / 3600)).padStart(2, '0');
    let m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    let s = String(Math.floor(seconds % 60)).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function initStrategyData() {
    let maxConsecutive = Math.max(1, parseInt(document.getElementById('max-consecutive-splits')?.value) || 1);
    const numSplits = parseInt(document.getElementById('total-splits')?.value) || 1;
    if (strategySplits.length === numSplits) return;

    let drivers = getAvailableDrivers();
    let spotters = getAvailableSpotters();
    let tires = getAvailableTires();

    let raceType = document.getElementById('race-type')?.value || 'irl';
    let isOnline = (raceType === 'online');
    let isSolo = (drivers.length === 1);

    if (isOnline || isSolo) maxConsecutive = 1;

    let hasPitWindow = document.getElementById('enable-pit-window')?.checked;
    let isLapMode = document.getElementById('pit-window-mode-tours')?.checked;
    let winO_lap = parseInt(document.getElementById('lap-pit-window-open')?.value) || 0;
    let winO_time = timeStringToSeconds(document.getElementById('time-pit-window-open')?.value || "");

    let newSplits = [];
    for (let i = 0; i < numSplits; i++) {
        if (strategySplits[i]) {
            newSplits.push(strategySplits[i]);
        } else {
            let drvIndex = Math.floor(i / maxConsecutive) % drivers.length;
            let drv = drivers[drvIndex];

            // --- Sélection du Spotter groupée et filtrée ---
            let availableSpotters = spotters.filter(s => s !== drv);
            let sptIndex = Math.floor(i / maxConsecutive) % Math.max(1, availableSpotters.length);
            let spt = availableSpotters.length > 0 ? availableSpotters[sptIndex] : "";

            let bestStartTire = tires[0] || "";
            if (hasPitWindow && (isSolo || isOnline) && tires.length > 1) {
                for (let t of tires) {
                    let maxLapsTire = getDriverTireLife(drv, t);
                    if (isLapMode) {
                        if (winO_lap === 0 || maxLapsTire >= winO_lap) { bestStartTire = t; break; }
                    } else {
                        let avgLapSec = getDriverLapSeconds(drv, t, 'eco');
                        if (winO_time === 0 || (maxLapsTire * avgLapSec) >= winO_time) { bestStartTire = t; break; }
                    }
                }
            }

            // 🚀 CORRECTION A : Génération intelligente des arrêts en Solo/Online
            let reqPits = (isSolo || isOnline) ? (parseInt(document.getElementById('global-req-pit-stops')?.value) || 0) : 0;
            let initialStintsCount = Math.max(1, reqPits + 1);
            let generatedStints = [];

            let avgLapSec = getDriverLapSeconds(drv, bestStartTire, 'push') || 120;

            for (let k = 0; k < initialStintsCount; k++) {
                let defaultLaps = 1;

                if (hasPitWindow && reqPits > 0 && (isSolo || isOnline)) {
                    let secO = timeStringToSeconds(document.getElementById('time-pit-window-open')?.value || "");
                    let secC = timeStringToSeconds(document.getElementById('time-pit-window-close')?.value || "");
                    let lapO = parseInt(document.getElementById('lap-pit-window-open')?.value) || 0;
                    let lapC = parseInt(document.getElementById('lap-pit-window-close')?.value) || 0;

                    if (k < reqPits) {
                        // 🚀 REPARTITION CENTRÉE : On divise la fenêtre en (reqPits + 1) pour créer des marges de sécurité
                        if (isLapMode && lapO > 0 && lapC > 0) {
                            let step = (lapC - lapO) / (reqPits + 1);
                            let targetTotalLaps = Math.round(lapO + ((k + 1) * step));
                            let lapsAlreadyAssigned = generatedStints.reduce((sum, s) => sum + s.laps, 0);
                            defaultLaps = Math.max(1, targetTotalLaps - lapsAlreadyAssigned);
                        } else if (!isLapMode && secO > 0 && secC > 0) {
                            let step = (secC - secO) / (reqPits + 1);
                            let targetTotalSec = secO + ((k + 1) * step);
                            // Math.round au lieu de Math.floor pour viser le tour le plus proche du centre
                            let targetTotalLaps = Math.round(targetTotalSec / avgLapSec);
                            let lapsAlreadyAssigned = generatedStints.reduce((sum, s) => sum + s.laps, 0);
                            defaultLaps = Math.max(1, targetTotalLaps - lapsAlreadyAssigned);
                        }
                    }
                }

                generatedStints.push({
                    tire: bestStartTire,
                    fuelStrat: "push",
                    laps: defaultLaps,
                    changeTires: true,
                    isPitted: false,
                    lockedTimeSec: null,
                    manualFuel: null
                });
            }

            newSplits.push({
                driver: drv,
                spotter: spt,
                stints: generatedStints
            });
        }
    }
    strategySplits = newSplits;

    isHardCascade = true;
    cascadeFixPitWindows();
    applyRegulatoryTires();

    strategySplits.forEach(split => {
        let reqPits = (isSolo || isOnline) ? (parseInt(document.getElementById('global-req-pit-stops')?.value) || 0) : 0;
        let minStints = reqPits + 1;

        for (let j = split.stints.length - 2; j >= 0; j--) {
            let current = split.stints[j];
            let next = split.stints[j + 1];

            // 🚀 CORRECTION B : On interdit la fusion si cela supprime un arrêt obligatoire
            let preventMerge = (isSolo || isOnline) && (split.stints.length <= minStints);

            if (!preventMerge && !current.isPitted && !next.isPitted && current.tire === next.tire && current.fuelStrat === next.fuelStrat) {
                current.laps += next.laps;
                split.stints.splice(j + 1, 1);
            }
        }
    });

    cascadeFixPitWindows();
    isHardCascade = false;

    saveFormState();
}

function updateSplitData(splitIdx, field, val) {
    strategySplits[splitIdx][field] = val;
    if (field === 'driver') {
        isHardCascade = true;
        cascadeFixPitWindows();
        isHardCascade = false;
    }
    saveFormState();
    renderStrategy();
}

function updateStintData(splitIdx, stintIdx, field, val) {
    strategySplits[splitIdx].userDeniedAutoStint = false;
    let isLapIncrease = false;

    let oldLaps = strategySplits[splitIdx].stints[stintIdx].laps || 1;
    let oldTarget = strategySplits[splitIdx].windowTarget;

    if (field === 'changeTires') val = (val === true);

    // 🚀 INTERCEPTION PNEUS : On interdit de décocher si on dépasse la gomme
    if (field === 'changeTires' && val === false && stintIdx > 0) {
        let split = strategySplits[splitIdx];
        let currentStint = split.stints[stintIdx];
        let prevStint = split.stints[stintIdx - 1];
        let targetTire = prevStint.tire;

        let maxTireLife = getDriverTireLife(split.driver, targetTire);

        let usedLaps = 0;
        for (let k = stintIdx - 1; k >= 0; k--) {
            usedLaps += split.stints[k].laps;
            if (split.stints[k].changeTires || k === 0) break;
        }
        usedLaps += currentStint.laps;

        if (usedLaps > maxTireLife) {
            openExcessModal(`Impossible de conserver ces gommes (${targetTire}).<br>Elles auraient ${usedLaps} tours cumulés (Max: ${maxTireLife}).`);
            renderStrategy(); // Force le DOM à recocher la case visuellement
            return; // ⛔ On stoppe tout, pas de cascade.
        }
    }

    if (field === 'laps') {
        val = Math.max(1, parseInt(val) || 1);
        isLapIncrease = (val > oldLaps);

        // 🚀 CORRECTION A : On ne décoche la cible QUE si on modifie le TOUT DERNIER stint du split
        if (stintIdx === strategySplits[splitIdx].stints.length - 1) {
            if (strategySplits[splitIdx].windowTarget) {
                strategySplits[splitIdx].windowTarget = null;
            }
        }
    }

    if (field === 'manualFuel') {
        strategySplits[splitIdx].stints[stintIdx].manualFuel = (val === '' || isNaN(val)) ? null : parseFloat(val);
    } else {
        strategySplits[splitIdx].stints[stintIdx][field] = val;
    }

    if (field === 'changeTires' && val === false) {
        let nextStint = strategySplits[splitIdx].stints[stintIdx + 1];
        if (nextStint) {
            nextStint.tire = strategySplits[splitIdx].stints[stintIdx].tire;
        }
    }

    // Le moteur s'exécute et nous bloque si nécessaire
    cascadeFixPitWindows(isLapIncrease, splitIdx, stintIdx);

    // 🚀 LOGIQUE INTELLIGENTE : Évaluation post-cascade
    if (field === 'laps' && stintIdx === strategySplits[splitIdx].stints.length - 1 && oldTarget) {
        let newLaps = parseInt(strategySplits[splitIdx].stints[stintIdx].laps);
        if (newLaps !== parseInt(oldLaps)) {
            // Le moteur a AUTORISÉ le changement (tu as navigué dans la marge).
            // Tu abandonnes donc la ligne de sécurité stricte = la case se décoche.
            strategySplits[splitIdx].windowTarget = null;
        } else {
            // Le moteur a ANNULÉ le changement (tu t'es écrasé sur le mur absolu).
            // La cible est toujours active = la case reste cochée.
            strategySplits[splitIdx].windowTarget = oldTarget;
        }
    }

    saveFormState();
    renderStrategy();
}

// 🚀 NOUVELLE FONCTION : Cible de fenêtre
function setWindowTarget(splitIdx, target) {
    strategySplits[splitIdx].windowTarget = target;
    cascadeFixPitWindows();
    saveFormState();
    renderStrategy();
}

function addStintRow(splitIdx) {
    strategySplits[splitIdx].userDeniedAutoStint = false;
    let tires = getAvailableTires();
    let stints = strategySplits[splitIdx].stints;
    let lastStintIdx = stints.length - 1;
    let lastStint = stints[lastStintIdx];

    // 1. Recherche du stint actuellement en piste (premier non validé globalement)
    let firstUnpittedI = -1;
    let firstUnpittedJ = -1;
    for (let i = 0; i < strategySplits.length; i++) {
        for (let j = 0; j < strategySplits[i].stints.length; j++) {
            if (!strategySplits[i].stints[j].isPitted) {
                firstUnpittedI = i;
                firstUnpittedJ = j;
                break;
            }
        }
        if (firstUnpittedI !== -1) break;
    }

    // 2. Le dernier stint de CE split est-il le stint actuellement en piste ?
    let isLastStintActive = (firstUnpittedI === splitIdx && firstUnpittedJ === lastStintIdx);

    // 3. Transfert mathématique : on lui retire 1 tour (s'il en a au moins 2)
    if (lastStint.laps > 1) {
        lastStint.laps -= 1;
    }

    // 4. Création du relais d'urgence (1 tour)
    let newStint = {
        tire: lastStint.tire || tires[0],
        fuelStrat: "push",
        laps: 1,
        changeTires: true,
        isPitted: false,
        lockedTimeSec: null,
        manualFuel: null
    };

    // 5. L'Insertion Intelligente
    if (isLastStintActive) {
        // Cas A : Le pilote est déjà dans son dernier relais. On ajoute la péripétie APRÈS.
        stints.push(newStint);
    } else {
        // Cas B : Le relais est dans le futur. On ajoute la péripétie AVANT ce dernier relais.
        // L'ancien dernier relais reste donc le "dernier", il subira les corrections de la cascade.
        stints.splice(lastStintIdx, 0, newStint);
    }

    // 6. On lance la Cascade vierge : le Cerveau recalcule tout et réajuste
    // le dernier relais par rapport à tes cibles sans croire à un forçage manuel !
    cascadeFixPitWindows();
    saveFormState();
    renderStrategy();
}

function openDeleteModal(splitIdx, stintIdx) {
    rowToDelete = { splitIdx, stintIdx };
    document.getElementById('delete-modal').classList.remove('hidden');
}
function closeDeleteModal() { document.getElementById('delete-modal').classList.add('hidden'); rowToDelete = null; }

function confirmDeleteRow() {
    if (rowToDelete) {
        strategySplits[rowToDelete.splitIdx].stints.splice(rowToDelete.stintIdx, 1);
        if (strategySplits[rowToDelete.splitIdx].stints.length === 0) {
            let tires = getAvailableTires();
            strategySplits[rowToDelete.splitIdx].stints.push({ tire: tires[0], fuelStrat: "push", laps: 1, changeTires: true, isPitted: false, lockedTimeSec: null, manualFuel: null });
        }

        // 🚀 CORRECTION : Appel vierge pour laisser le moteur appliquer ses cibles !
        cascadeFixPitWindows();
        saveFormState();
        renderStrategy();
        closeDeleteModal();
    }
}

function openPitModal(i, j) {
    let stint = strategySplits[i].stints[j];
    pitModalTarget = { splitIdx: i, stintIdx: j, startLap: stint.startLap };

    let estimatedLap = stint.endLap;
    let isOvertime = false;

    // 🚀 LECTURE DU TEMPS RÉEL
    let str = localStorage.getItem('stratefreez-timer');
    if (str) {
        let timerState = JSON.parse(str);
        if (timerState && timerState.active) {
            let elapsed = Math.floor((Date.now() - timerState.startTimeReal) / 1000);

            // Calcul du tour estimé
            let timeInStint = elapsed - stint.startSec;
            if (timeInStint < 0) timeInStint = 0;
            let lapSec = stint.lapSec || 120;
            let calcLap = (stint.startLap || 0) + Math.floor(timeInStint / lapSec) + 1;

            // Plafond de sécurité : On ne propose jamais plus que la fin prévue
            estimatedLap = Math.min(calcLap, stint.endLap);

            // Détection du retard (Pour afficher le bouton Forcer)
            if (elapsed >= stint.endSec) {
                isOvertime = true;
            }
        }
    }

    const input = document.getElementById('pit-modal-lap');
    input.value = estimatedLap || '';

    // Affichage conditionnel du bouton Forcer ET de son texte explicatif
    const forceBtn = document.getElementById('modal-btn-force-pit');
    const forceText = document.getElementById('modal-force-pit-text');
    if (forceBtn) forceBtn.classList.toggle('hidden', !isOvertime);
    if (forceText) forceText.classList.toggle('hidden', !isOvertime);

    document.getElementById('pit-modal').classList.remove('hidden');
    setTimeout(() => { input.focus(); input.select(); }, 50);
}

// 🚀 NOUVELLE FONCTION : Remplace l'ancienne forceAutoPit globale
function confirmForceAutoPit() {
    if (pitModalTarget) {
        let sIdx = pitModalTarget.splitIdx;
        let stIdx = pitModalTarget.stintIdx;
        let stint = strategySplits[sIdx].stints[stIdx];

        // On cale le relais rigoureusement sur sa théorie
        stint.isPitted = true;
        stint.lockedTimeSec = stint.endSec;

        cascadeFixPitWindows();
        saveFormState();
        renderStrategy();
        if (liveTimerActive) timerTick();
        closePitModal();
    }
}

function closePitModal() {
    document.getElementById('pit-modal').classList.add('hidden');
    pitModalTarget = null;
}

function confirmPitIn() {
    if (pitModalTarget) {
        let inputLap = parseInt(document.getElementById('pit-modal-lap').value);
        if (inputLap && inputLap > pitModalTarget.startLap) {
            let realLaps = inputLap - pitModalTarget.startLap;
            let sIdx = pitModalTarget.splitIdx;
            let stIdx = pitModalTarget.stintIdx;

            strategySplits[sIdx].stints[stIdx].laps = realLaps;
            strategySplits[sIdx].stints[stIdx].isPitted = true;

            let str = localStorage.getItem('stratefreez-timer');
            if (str) {
                let timerState = JSON.parse(str);
                if (timerState && timerState.active) {
                    let elapsed = Math.floor((Date.now() - timerState.startTimeReal) / 1000);
                    strategySplits[sIdx].stints[stIdx].lockedTimeSec = elapsed;
                } else {
                    strategySplits[sIdx].stints[stIdx].lockedTimeSec = null;
                }
            } else {
                strategySplits[sIdx].stints[stIdx].lockedTimeSec = null;
            }

            cascadeFixPitWindows();
            saveFormState();
            renderStrategy();
            closePitModal();
        } else {
            alert("Le tour d'arrêt doit être strictement supérieur au tour de départ du relais.");
        }
    }
}

function openUndoPitModal(i, j, currentLaps) {
    undoPitModalTarget = { splitIdx: i, stintIdx: j };
    const input = document.getElementById('undo-pit-modal-lap');
    input.value = currentLaps || '';
    document.getElementById('undo-pit-modal').classList.remove('hidden');
    setTimeout(() => { input.focus(); input.select(); }, 50);
}

function closeUndoPitModal() {
    document.getElementById('undo-pit-modal').classList.add('hidden');
    undoPitModalTarget = null;
}

function confirmUndoPit() {
    if (undoPitModalTarget) {
        let inputLaps = parseInt(document.getElementById('undo-pit-modal-lap').value);
        if (inputLaps && inputLaps > 0) {
            let sIdx = undoPitModalTarget.splitIdx;
            let stIdx = undoPitModalTarget.stintIdx;

            strategySplits[sIdx].stints[stIdx].laps = inputLaps;
            strategySplits[sIdx].stints[stIdx].isPitted = false;
            strategySplits[sIdx].stints[stIdx].lockedTimeSec = null;

            cascadeFixPitWindows();
            saveFormState();
            renderStrategy();
        }
        closeUndoPitModal();
    }
}

function copySplit(idx) {
    clipboardStints = JSON.parse(JSON.stringify(strategySplits[idx].stints));
    clipboardStints.forEach(s => { s.isPitted = false; s.lockedTimeSec = null; });
    renderStrategy();
}

function pasteSplit(idx) {
    if (clipboardStints) {
        strategySplits[idx].stints = JSON.parse(JSON.stringify(clipboardStints));
        isHardCascade = true;
        cascadeFixPitWindows();
        isHardCascade = false;
        saveFormState();
        renderStrategy();
    }
}

function applyRegulatoryTires() {
    let reqTireChange = document.getElementById('global-req-tire-change')?.checked;
    let tires = getAvailableTires();
    if (tires.length < 2) return;

    // 🚀 CORRECTION : La règle de type de gomme s'applique à la course entière pour tous les modes !
    if (reqTireChange && strategySplits.length > 0) {
        let lastSplit = strategySplits[strategySplits.length - 1];
        if (lastSplit.stints.length > 0) {
            if (!lastSplit.stints[lastSplit.stints.length - 1].isPitted) {
                let startTire = strategySplits[0].stints[0].tire;
                let diffTire = tires.find(t => t !== startTire) || tires[1];
                lastSplit.stints[lastSplit.stints.length - 1].tire = diffTire;
                lastSplit.stints[lastSplit.stints.length - 1].changeTires = true;
            }
        }
    }

    tires.forEach(t => {
        if (document.getElementById(`use-${t}`)?.checked) {

            // 1. Règle des SPLITS COMPLETS obligatoires
            let reqFull = parseInt(document.getElementById(`val-${t}-1`)?.value) || 0;
            let hasFull = document.getElementById(`cb-${t}-1`)?.checked;
            if (hasFull && reqFull > 0) {
                let applied = 0;
                for (let i = 0; i < strategySplits.length && applied < reqFull; i++) {
                    let isDedicated = strategySplits[i].stints.every(s => s.tire !== tires[0]);
                    if (!isDedicated) {
                        strategySplits[i].stints.forEach(s => { if (!s.isPitted) { s.tire = t; s.changeTires = true; } });
                        applied++;
                    }
                }
            }

            // 2. Règle du MINIMUM de trains
            let reqMin = parseInt(document.getElementById(`val-${t}-2`)?.value) || 0;
            let hasMin = document.getElementById(`cb-${t}-2`)?.checked;
            if (hasMin && reqMin > 0) {
                let applied = 0;
                for (let i = strategySplits.length - 1; i >= 0 && applied < reqMin; i--) {
                    for (let j = strategySplits[i].stints.length - 1; j >= 0 && applied < reqMin; j--) {
                        if (strategySplits[i].stints[j].tire === tires[0] && !strategySplits[i].stints[j].isPitted) {
                            strategySplits[i].stints[j].tire = t;
                            strategySplits[i].stints[j].changeTires = true;
                            applied++;
                        }
                    }
                }
            }

            // 🚀 3. NOUVELLE LOGIQUE : Application globale du MAXIMUM de trains (Écrêtage Équitable)
            let reqMax = parseInt(document.getElementById(`val-${t}-3`)?.value) || 0;
            let hasMax = document.getElementById(`cb-${t}-3`)?.checked;

            if (hasMax && reqMax > 0) {
                let currentUsage = 0;

                let raceType = document.getElementById('race-type')?.value;
                let isOnline = (raceType === 'online');
                let isSolo = (parseInt(document.getElementById('num-drivers')?.value) === 1);

                // A. Comptage global pour savoir si on est en excédent
                for (let i = 0; i < strategySplits.length; i++) {
                    for (let j = 0; j < strategySplits[i].stints.length; j++) {
                        let stint = strategySplits[i].stints[j];
                        let isAbsFirst = (i === 0 && j === 0) || ((isOnline || isSolo) && j === 0);
                        if ((stint.changeTires || isAbsFirst) && stint.tire === t) {
                            currentUsage++;
                        }
                    }
                }

                // B. Si on dépasse le quota, on active l'algorithme "Robin des Bois"
                if (currentUsage > reqMax) {
                    let excess = currentUsage - reqMax;
                    let currentIndex = tires.indexOf(t);

                    // Gomme de secours (T -> M -> D...)
                    let fallbackTire = tires[currentIndex + 1] || tires[0];
                    if (fallbackTire === t) fallbackTire = tires.find(other => other !== t) || t;

                    let safetyLoop = 1000; // Anti-boucle infinie

                    // Tant qu'il y a un excédent à taxer
                    while (excess > 0 && safetyLoop-- > 0) {

                        let splitWealth = [];
                        let globalMaxWealth = 0;

                        // 1. Calcul de la richesse de chaque relais (en gommes cibles MODIFIABLES)
                        for (let i = 0; i < strategySplits.length; i++) {
                            let changeableCount = 0;
                            for (let j = 0; j < strategySplits[i].stints.length; j++) {
                                let stint = strategySplits[i].stints[j];
                                let isAbsFirst = (i === 0 && j === 0) || ((isOnline || isSolo) && j === 0);
                                if (!stint.isPitted && (stint.changeTires || isAbsFirst) && stint.tire === t) {
                                    changeableCount++;
                                }
                            }
                            splitWealth.push(changeableCount);
                            if (changeableCount > globalMaxWealth) {
                                globalMaxWealth = changeableCount;
                            }
                        }

                        // Si plus aucun pneu n'est modifiable (ex: ils sont tous validés en piste), on arrête tout
                        if (globalMaxWealth === 0) break;

                        // 2. Trouver le relais le plus riche (On part de la FIN pour privilégier le départ en cas d'égalité)
                        let targetSplitIdx = -1;
                        for (let i = strategySplits.length - 1; i >= 0; i--) {
                            if (splitWealth[i] === globalMaxWealth) {
                                targetSplitIdx = i;
                                break;
                            }
                        }

                        // 3. Taxer ce relais (On transforme sa DERNIÈRE gomme cible en gomme de secours)
                        if (targetSplitIdx !== -1) {
                            for (let j = strategySplits[targetSplitIdx].stints.length - 1; j >= 0; j--) {
                                let stint = strategySplits[targetSplitIdx].stints[j];
                                let isAbsFirst = (targetSplitIdx === 0 && j === 0) || ((isOnline || isSolo) && j === 0);

                                if (!stint.isPitted && (stint.changeTires || isAbsFirst) && stint.tire === t) {
                                    stint.tire = fallbackTire;
                                    excess--;
                                    break; // Relais taxé, on quitte cette boucle pour relancer un scan complet
                                }
                            }
                        }
                    }
                }
            }

        }
    });
}

function cascadeFixPitWindows(isLapIncrease = false, manualSplitIdx = -1, manualStintIdx = -1) {
    window.pendingExcessData = null;

    let raceType = document.getElementById('race-type')?.value;
    let isOnline = (raceType === 'online');
    let isSolo = (parseInt(document.getElementById('num-drivers')?.value) === 1);
    let goal = document.getElementById('race-goal')?.value;

    let winOpen = parseInt(document.getElementById('pit-window-open')?.value) || 0;
    let winClose = parseInt(document.getElementById('pit-window-close')?.value) || 0;
    let hasPitWindow = document.getElementById('enable-pit-window')?.checked;

    let isLapMode = document.getElementById('pit-window-mode-tours')?.checked;
    let winC_lap = parseInt(document.getElementById('lap-pit-window-close')?.value) || 0;
    let winC_time_str = document.getElementById('time-pit-window-close')?.value || "";
    let secC = winC_time_str !== "" ? timeStringToSeconds(winC_time_str) : 0;

    let totalSecRace = getRaceDurationSeconds();
    let targetLapsRace = parseInt(document.getElementById('race-laps')?.value) || 0;
    let splitsCount = parseInt(document.getElementById('total-splits')?.value) || 1;
    let splitDurSec = splitsCount > 0 ? totalSecRace / splitsCount : 0;
    let targetPerRelayLaps = splitsCount > 0 ? Math.floor(targetLapsRace / splitsCount) : 0;

    let initialFuel = parseFloat(document.getElementById('fuel-start')?.value.replace(/[^\d.]/g, '')) || 100;
    let fillSpeed = parseFloat(document.getElementById('fuel-speed')?.value.replace(',', '.').replace(/[^\d.]/g, '')) || 5;
    let pitLossBase = parseFloat(document.getElementById('pit-loss-time')?.value.replace(',', '.').replace(/[^\d.]/g, '')) || 35;
    let pitTireBase = parseFloat(document.getElementById('pit-tire-time')?.value.replace(',', '.').replace(/[^\d.]/g, '')) || 6;
    let safetyRes = parseFloat(document.getElementById('fuel-reserve')?.value.replace(/[^\d.]/g, '')) || 0;

    if (goal === 'time' && totalSecRace <= 0) return;
    if (goal === 'laps' && targetLapsRace <= 0) return;

    const perfCache = {};
    const getCachedPerf = (driver, tire, strat) => {
        const key = `${driver}-${tire}-${strat}`;
        if (!perfCache[key]) {
            perfCache[key] = {
                tireLife: getDriverTireLife(driver, tire),
                fuelRate: getDriverFuelRate(driver, strat),
                lapSec: Math.max(1, getDriverLapSeconds(driver, tire, strat))
            };
        }
        return perfCache[key];
    };

    const updateTimeline = () => {
        for (let i = 0; i < strategySplits.length; i++) {
            let globalSecLoop = 0;
            let globalLapsLoop = 0;
            let residualTankLoop = initialFuel;

            if (!isOnline && !isSolo && i > 0) {
                let prevSplit = strategySplits[i - 1];
                let prevStint = prevSplit.stints[prevSplit.stints.length - 1];
                globalSecLoop = prevStint.endSec;
                globalLapsLoop = prevStint.endLap;
                residualTankLoop = prevStint.residualAtEnd;
            }

            for (let j = 0; j < strategySplits[i].stints.length; j++) {
                let stint = strategySplits[i].stints[j];
                let isAbsFirst = (i === 0 && j === 0) || ((isOnline || isSolo) && j === 0);
                let laps = parseInt(stint.laps) || 0;

                let perf = getCachedPerf(strategySplits[i].driver, stint.tire, stint.fuelStrat);
                let fuelRate = perf.fuelRate;

                let requiredFuel = laps * fuelRate;
                let targetFuel = requiredFuel + safetyRes;
                if (stint.manualFuel !== null && stint.manualFuel !== undefined) targetFuel = parseFloat(stint.manualFuel);
                if (targetFuel > 100) targetFuel = 100;

                let pitTime = 0;
                if (isAbsFirst) {
                    residualTankLoop = initialFuel;
                    stint.fuelAddedAtStart = 0;
                } else {
                    pitTime = pitLossBase;
                    if (stint.changeTires) pitTime += pitTireBase;
                    let fuelToAdd = Math.max(0, targetFuel - residualTankLoop);
                    stint.fuelAddedAtStart = fuelToAdd;
                    if (fuelToAdd > 0) pitTime += (fuelToAdd / fillSpeed);
                    residualTankLoop += fuelToAdd;
                    globalSecLoop += pitTime;
                }

                stint.startSec = globalSecLoop;
                stint.startLap = globalLapsLoop;
                stint.pitTime = pitTime;
                stint.cachedTargetFuel = targetFuel;
                stint.fuelRate = fuelRate;
                stint.lapSec = perf.lapSec;

                residualTankLoop -= requiredFuel;

                if (stint.isPitted && stint.lockedTimeSec !== null) {
                    globalSecLoop = stint.lockedTimeSec;
                } else {
                    globalSecLoop += (laps * stint.lapSec);
                }

                globalLapsLoop += laps;
                stint.endSec = globalSecLoop;
                stint.endLap = globalLapsLoop;
                stint.residualAtEnd = residualTankLoop;

                let nextStint = null, nextDriver = null;
                if (j + 1 < strategySplits[i].stints.length) {
                    nextStint = strategySplits[i].stints[j + 1];
                    nextDriver = strategySplits[i].driver;
                } else if (i + 1 < strategySplits.length && !isOnline && !isSolo) {
                    nextStint = strategySplits[i + 1].stints[0];
                    nextDriver = strategySplits[i + 1].driver;
                }

                let fuelToAddForNext = 0, nextPitTime = 0;
                if (nextStint) {
                    let nLaps = parseInt(nextStint.laps) || 0;
                    let nPerf = getCachedPerf(nextDriver, nextStint.tire, nextStint.fuelStrat);
                    let nTargetFuel = (nLaps * nPerf.fuelRate) + safetyRes;
                    if (nextStint.manualFuel !== null && nextStint.manualFuel !== undefined) nTargetFuel = parseFloat(nextStint.manualFuel);
                    if (nTargetFuel > 100) nTargetFuel = 100;

                    fuelToAddForNext = Math.max(0, nTargetFuel - residualTankLoop);
                    nextPitTime = pitLossBase;
                    if (nextStint.changeTires) nextPitTime += pitTireBase;
                    if (fuelToAddForNext > 0) nextPitTime += (fuelToAddForNext / fillSpeed);
                }
                stint.fuelToAddForNext = fuelToAddForNext;
                stint.nextPitTime = nextPitTime;
            }
        }
    };

    const getStintCapacity = (sIdx, stIdx, useEco) => {
        let split = strategySplits[sIdx];
        let stint = split.stints[stIdx];
        let driver = split.driver;
        let tireLife = getDriverTireLife(driver, stint.tire);
        let fuelStrat = useEco ? 'eco' : stint.fuelStrat;
        let fuelRate = getDriverFuelRate(driver, fuelStrat);

        let usedTireLaps = 0;
        if (!stint.changeTires && !(sIdx === 0 && stIdx === 0)) {
            let currS = sIdx, currSt = stIdx - 1;
            while (currS >= 0) {
                if (currSt < 0) {
                    currS--;
                    if (currS >= 0) currSt = strategySplits[currS].stints.length - 1;
                    else break;
                }
                let checkStint = strategySplits[currS].stints[currSt];
                usedTireLaps += checkStint.laps;
                if (checkStint.changeTires || (currS === 0 && currSt === 0)) break;
                currSt--;
            }
        }
        let fS = sIdx, fSt = stIdx + 1;
        while (fS < strategySplits.length) {
            if (fSt >= strategySplits[fS].stints.length) {
                fS++; fSt = 0;
                if (fS >= strategySplits.length) break;
            }
            let checkStint = strategySplits[fS].stints[fSt];
            if (checkStint.changeTires) break;
            usedTireLaps += checkStint.laps;
            fSt++;
        }

        let tireRem = Math.max(0, tireLife - usedTireLaps);
        let fuelRem = Math.floor((100 - safetyRes) / fuelRate);
        return Math.max(1, Math.min(tireRem, fuelRem));
    };

    // 🚀 ÉTAPE 0 : Nettoyage
    for (let i = 0; i < strategySplits.length; i++) {
        for (let j = 0; j < strategySplits[i].stints.length; j++) {
            strategySplits[i].stints[j].laps = parseInt(strategySplits[i].stints[j].laps) || 1;
            if (strategySplits[i].stints[j].fuelStrat === 'normal') strategySplits[i].stints[j].fuelStrat = 'push';
        }
    }
    updateTimeline();

    // 🚀 ÉTAPE 1 : Plafonnement Physique
    for (let i = 0; i < strategySplits.length; i++) {
        for (let j = 0; j < strategySplits[i].stints.length; j++) {
            let stint = strategySplits[i].stints[j];
            if (stint.isPitted) continue;

            let pushCap = getStintCapacity(i, j, false);

            if (stint.laps > pushCap) {
                let ecoCap = getStintCapacity(i, j, true);
                if (ecoCap > pushCap && stint.laps > pushCap) {
                    stint.fuelStrat = 'eco';
                    stint.laps = Math.min(stint.laps, ecoCap);
                } else {
                    stint.fuelStrat = 'push';
                    stint.laps = pushCap;
                }
            }
        }
    }

    let cascadeHalted = false;
    let haltedAtSplit = -1;

    // 🚀 ÉTAPE 2 : La Cascade Multi-Passes Rigoureuse
    for (let i = 0; i < strategySplits.length; i++) {
        if (cascadeHalted) break;

        let split = strategySplits[i];
        split.targetFailed = false; // Réinitialisation de l'état d'échec

        let isLastSplit = (i === strategySplits.length - 1);

        let relayStartIdx = i;
        while (relayStartIdx > 0 && strategySplits[relayStartIdx - 1].driver === split.driver && !isOnline && !isSolo) {
            relayStartIdx--;
        }

        let regOpenSec = 0, regCloseSec = 0, secOpenSec = 0, secCloseSec = 0;
        if (!isOnline && !isSolo && hasPitWindow && splitDurSec > 0) {
            regOpenSec = (i + 1) * splitDurSec - (winOpen * 60);
            regCloseSec = (i + 1) * splitDurSec + (winClose * 60);
            secOpenSec = regOpenSec + 5;
            secCloseSec = regCloseSec - 30;
        }

        // 🚦 ANALYSE RÉGLEMENTAIRE (Les Murs Absolus)
        let isRelayEnd = false;
        let tireChanged = false;
        let reqTireOnWindow = document.getElementById('pit-tires-only')?.checked;

        if (!isLastSplit && !isOnline && !isSolo) {
            let nextSplit = strategySplits[i + 1];
            isRelayEnd = (split.driver !== nextSplit.driver);
            tireChanged = (split.stints[split.stints.length - 1].tire !== nextSplit.stints[0].tire);
        }

        let isWindowMandatory = isRelayEnd || (reqTireOnWindow && tireChanged && !isSolo && !isOnline);
        let isStartTarget = (split.windowTarget === 'start');
        let isEndTarget = (split.windowTarget === 'end') || (isHardCascade && hasPitWindow && !isOnline && !isSolo);
        let isIntermediateFree = (!isLastSplit && !isStartTarget && !isEndTarget && !isWindowMandatory);

        const adjustLaps = () => {
            let safetyLimit = 500;
            while (safetyLimit-- > 0) {
                updateTimeline();
                let currentSec = split.stints[split.stints.length - 1].endSec;
                let currentLap = split.stints[split.stints.length - 1].endLap;
                let lsTime = split.stints[split.stints.length - 1].lapSec;
                let action = 'none';

                if (isOnline || isSolo) {
                    let relativeSec = currentSec - split.stints[0].startSec;
                    let relativeLap = currentLap - split.stints[0].startLap;
                    // 🚀 CORRECTION : En Online, CHAQUE split doit atteindre sa cible (pas seulement le dernier de la liste)
                    if ((isLastSplit || isOnline) && goal === 'time') {
                        if (relativeSec < totalSecRace / splitsCount) action = 'add';
                        else if (relativeSec - lsTime >= totalSecRace / splitsCount) action = 'remove'; // Anti Ping-Pong
                    } else if ((isLastSplit || isOnline) && goal === 'laps') {
                        if (relativeLap < targetPerRelayLaps) action = 'add';
                        else if (relativeLap - 1 >= targetPerRelayLaps) action = 'remove'; // Anti Ping-Pong
                    } else if (hasPitWindow) {
                        if (isLapMode && winC_lap > 0) {
                            if (relativeLap < winC_lap) action = 'add';
                            if (relativeLap > winC_lap) action = 'remove';
                        } else if (!isLapMode && secC > 0) {
                            if (relativeSec + lsTime <= secC) action = 'add';
                            if (relativeSec > secC) action = 'remove';
                        }
                    } else if (isHardCascade) {
                        if (goal === 'time' && relativeSec < totalSecRace / splitsCount) action = 'add';
                        else if (goal === 'laps' && relativeLap < targetPerRelayLaps) action = 'add';
                    }
                } else {
                    // 🚀 LOGIQUE DESCENDANTE STRICTE
                    if (isLastSplit && goal === 'time') {
                        if (currentSec < totalSecRace) action = 'add';
                        else if (currentSec - lsTime >= totalSecRace) action = 'remove'; // Anti Ping-Pong
                    } else if (isLastSplit && goal === 'laps') {
                        if (currentLap < targetLapsRace) action = 'add';
                        else if (currentLap - 1 >= targetLapsRace) action = 'remove'; // Anti Ping-Pong
                    } else if (isStartTarget) {
                        if (currentSec < secOpenSec) action = 'add';
                        else if (currentSec > secOpenSec + lsTime) action = 'remove';
                    } else if (isEndTarget) {
                        if (currentSec + lsTime <= secCloseSec) action = 'add';
                        else if (currentSec > secCloseSec) action = 'remove';
                    } else if (isWindowMandatory) {
                        if (currentSec < secOpenSec) action = 'add';
                        else if (currentSec > secCloseSec) action = 'remove';
                    } else if (isIntermediateFree && hasPitWindow) {
                        if (i === manualSplitIdx) {
                            action = 'none'; // Laxisme autorisé par l'ingénieur
                        } else {
                            if (currentSec < secOpenSec) action = 'add';
                            else if (currentSec > secCloseSec) action = 'remove';
                        }
                    }
                }

                if (action === 'none') break;

                let modified = false;
                if (action === 'add') {
                    for (let s = i; s >= relayStartIdx; s--) {
                        if (s < i && hasPitWindow && !isOnline && !isSolo) {
                            let sCloseSec = ((s + 1) * splitDurSec) + (winClose * 60) - 30;
                            let sCurrentEnd = strategySplits[s].stints[strategySplits[s].stints.length - 1].endSec;
                            let sLapSec = strategySplits[s].stints[strategySplits[s].stints.length - 1].lapSec;
                            if (sCurrentEnd + sLapSec > sCloseSec) continue;
                        }

                        for (let st = strategySplits[s].stints.length - 1; st >= 0; st--) {
                            if (s === manualSplitIdx && st === manualStintIdx) continue;
                            let stint = strategySplits[s].stints[st];
                            if (stint.isPitted) continue;

                            // 🚀 CORRECTION C1 (Poussée) : Ne jamais pousser un pit hors de la fenêtre en ajoutant des tours
                            if ((isSolo || isOnline) && hasPitWindow && st < strategySplits[s].stints.length - 1) {
                                let futureEndSec = stint.endSec + stint.lapSec;
                                let futureEndLap = stint.endLap + 1;
                                if (isLapMode && winC_lap > 0 && futureEndLap > winC_lap) continue;
                                if (!isLapMode && secC > 0 && futureEndSec > secC) continue;
                            }

                            if (stint.laps < getStintCapacity(s, st, false)) { stint.laps++; modified = true; break; }
                        }
                        if (modified) break;
                    }
                    if (!modified) {
                        for (let s = i; s >= relayStartIdx; s--) {
                            if (s < i && hasPitWindow && !isOnline && !isSolo) {
                                let sCloseSec = ((s + 1) * splitDurSec) + (winClose * 60) - 30;
                                let sCurrentEnd = strategySplits[s].stints[strategySplits[s].stints.length - 1].endSec;
                                let sLapSec = strategySplits[s].stints[strategySplits[s].stints.length - 1].lapSec;
                                if (sCurrentEnd + sLapSec > sCloseSec) continue;
                            }
                            for (let st = strategySplits[s].stints.length - 1; st >= 0; st--) {
                                if (s === manualSplitIdx && st === manualStintIdx) continue;
                                let stint = strategySplits[s].stints[st];
                                if (stint.isPitted) continue;

                                // 🚀 CORRECTION C1 (Éco) : Ne jamais pousser un pit hors de la fenêtre en ajoutant des tours
                                if ((isSolo || isOnline) && hasPitWindow && st < strategySplits[s].stints.length - 1) {
                                    let futureEndSec = stint.endSec + stint.lapSec;
                                    let futureEndLap = stint.endLap + 1;
                                    if (isLapMode && winC_lap > 0 && futureEndLap > winC_lap) continue;
                                    if (!isLapMode && secC > 0 && futureEndSec > secC) continue;
                                }

                                if (stint.fuelStrat !== 'eco') {
                                    let pushCap = getStintCapacity(s, st, false);
                                    let ecoCap = getStintCapacity(s, st, true);
                                    if (ecoCap > pushCap && stint.laps < ecoCap) {
                                        stint.fuelStrat = 'eco';
                                        stint.laps++;
                                        modified = true;
                                        break;
                                    }
                                }
                            }
                            if (modified) break;
                        }
                    }
                } else if (action === 'remove') {
                    for (let s = i; s >= relayStartIdx; s--) {
                        if (s < i && hasPitWindow && !isOnline && !isSolo) {
                            let sOpenSec = ((s + 1) * splitDurSec) - (winOpen * 60) + 5;
                            let sCurrentEnd = strategySplits[s].stints[strategySplits[s].stints.length - 1].endSec;
                            let sLapSec = strategySplits[s].stints[strategySplits[s].stints.length - 1].lapSec;
                            if (sCurrentEnd - sLapSec < sOpenSec) continue;
                        }

                        for (let st = strategySplits[s].stints.length - 1; st >= 0; st--) {
                            if (s === manualSplitIdx && st === manualStintIdx) continue;
                            let stint = strategySplits[s].stints[st];

                            // 🚀 CORRECTION C2 (Retrait) : Ne jamais tirer un pit hors de la fenêtre en retirant des tours
                            if ((isSolo || isOnline) && hasPitWindow && st < strategySplits[s].stints.length - 1) {
                                let futureEndSec = stint.endSec - stint.lapSec;
                                let futureEndLap = stint.endLap - 1;
                                let winO_lap = parseInt(document.getElementById('lap-pit-window-open')?.value) || 0;
                                let secO = timeStringToSeconds(document.getElementById('time-pit-window-open')?.value || "");

                                if (isLapMode && winO_lap > 0 && futureEndLap < winO_lap) continue;
                                if (!isLapMode && secO > 0 && futureEndSec < secO) continue;
                            }

                            if (!stint.isPitted && stint.laps > 1) { stint.laps--; modified = true; break; }
                        }
                        if (modified) break;
                    }
                }
                if (!modified) break;
            }
        };

        adjustLaps();

        // 🩹 PERMIS DE CONSTRUIRE (Soumis à l'OBLIGATION d'atteindre un mur)
        let canCreateStint = (i === manualSplitIdx) || isHardCascade;
        // 🚀 CORRECTION : En Online, chaque fin de split est un Mur Absolu
        let mustReachWall = (isLastSplit || isOnline || isStartTarget || isEndTarget || isWindowMandatory);

        if (canCreateStint && mustReachWall) {
            updateTimeline();
            let fSec = split.stints[split.stints.length - 1].endSec;
            let fLap = split.stints[split.stints.length - 1].endLap;
            let lsTime = split.stints[split.stints.length - 1].lapSec;
            let missingSec = 0;
            let missingLaps = 0;

            if (isOnline || isSolo) {
                let relativeSec = fSec - split.stints[0].startSec;
                let relativeLap = fLap - split.stints[0].startLap;
                if ((isLastSplit || isOnline) && goal === 'time') {
                    if (relativeSec < totalSecRace / splitsCount) missingSec = (totalSecRace / splitsCount) - relativeSec;
                } else if ((isLastSplit || isOnline) && goal === 'laps') {
                    if (relativeLap < targetPerRelayLaps) missingLaps = targetPerRelayLaps - relativeLap;
                } else if (hasPitWindow) {
                    if (isLapMode && winC_lap > 0) {
                        if (relativeLap < winC_lap) missingLaps = winC_lap - relativeLap;
                    } else if (!isLapMode && secC > 0) {
                        if (relativeSec + lsTime <= secC) missingSec = secC - relativeSec;
                    }
                } else if (isHardCascade) {
                    if (goal === 'time' && relativeSec < totalSecRace / splitsCount) missingSec = (totalSecRace / splitsCount) - relativeSec;
                    else if (goal === 'laps' && relativeLap < targetPerRelayLaps) missingLaps = targetPerRelayLaps - relativeLap;
                }
            } else {
                if (isLastSplit && goal === 'time') {
                    if (fSec < totalSecRace) missingSec = totalSecRace - fSec;
                } else if (isLastSplit && goal === 'laps') {
                    if (fLap < targetLapsRace) missingLaps = targetLapsRace - fLap;
                } else if (isStartTarget) {
                    if (fSec < secOpenSec) missingSec = secOpenSec - fSec;
                } else if (isEndTarget) {
                    if (fSec < secCloseSec - lsTime) missingSec = secCloseSec - fSec;
                } else if (isWindowMandatory && fSec < regOpenSec) {
                    missingSec = secOpenSec - fSec; // Sauvetage du mur obligatoire
                }
            }

            let lapsToAdd = missingLaps > 0 ? missingLaps : (missingSec > 0 ? Math.ceil(missingSec / lsTime) : 0);

            // 🚀 CORRECTION B : Boucle de création itérative (respect du plafond physique)
            let lastStint = split.stints[split.stints.length - 1];
            let pushCap = getStintCapacity(i, split.stints.length - 1, false);
            let ecoCap = getStintCapacity(i, split.stints.length - 1, true);
            let maxPhysicalCap = Math.max(pushCap, ecoCap);

            let safetyLoop = 20; // Bouclier anti-boucle infinie
            let hasAddedStints = false;

            // Tant qu'il manque des tours ET que le dernier relais est plein à craquer
            while (lapsToAdd > 0 && lastStint.laps >= maxPhysicalCap && safetyLoop-- > 0) {
                hasAddedStints = true;

                // 1. On crée le nouveau relais temporairement avec 1 tour
                split.stints.push({
                    tire: lastStint.tire,
                    fuelStrat: 'push',
                    laps: 1,
                    changeTires: true,
                    isPitted: false,
                    lockedTimeSec: null,
                    manualFuel: null
                });

                let newStintIdx = split.stints.length - 1;

                // 2. On évalue la VRAIE capacité physique de ce tout nouveau relais
                let newPushCap = getStintCapacity(i, newStintIdx, false);
                let newEcoCap = getStintCapacity(i, newStintIdx, true);
                let newMaxCap = Math.max(newPushCap, newEcoCap);

                // 3. On lui attribue les tours manquants, dans la limite stricte de sa gomme
                let lapsForThisStint = Math.min(lapsToAdd, newMaxCap);
                split.stints[newStintIdx].laps = lapsForThisStint;

                // 4. On soustrait et on met à jour les références pour le tour de boucle suivant
                lapsToAdd -= lapsForThisStint;
                lastStint = split.stints[newStintIdx];
                maxPhysicalCap = newMaxCap;

                updateTimeline();
            }

            if (hasAddedStints) {
                adjustLaps(); // Lissage post-création globale
            }
        }

        // 🛡️ LE PARE-FEU ABSOLU (Alertes, Murs et Blocage)
        // La cascade NE DÉCOCHE PLUS JAMAIS les cibles, elle fige le calcul et lève une erreur.
        updateTimeline();
        let finalSec = split.stints[split.stints.length - 1].endSec;
        let finalLap = split.stints[split.stints.length - 1].endLap;
        let lsTime = split.stints[split.stints.length - 1].lapSec;
        let haltMsg = "";

        if (!isOnline && !isSolo) {
            if (isLastSplit) {
                if (goal === 'time' && finalSec < totalSecRace) {
                    split.targetFailed = true;
                    haltMsg = `Capacité insuffisante pour atteindre la fin de course (Relais ${i + 1}).`;
                } else if (goal === 'laps' && finalLap < targetLapsRace) {
                    split.targetFailed = true;
                    haltMsg = `Capacité insuffisante pour atteindre le tour cible (Relais ${i + 1}).`;
                }
            } else if (isStartTarget && finalSec < secOpenSec) {
                split.targetFailed = true;
                haltMsg = `Cible "Début" inatteignable (Relais ${i + 1}).`;
            } else if (isEndTarget && finalSec < secCloseSec - lsTime && !isHardCascade) {
                split.targetFailed = true;
                haltMsg = `Cible "Fin" inatteignable (Relais ${i + 1}).`;
            } else if (isWindowMandatory && hasPitWindow && splitDurSec > 0) {
                if (finalSec < regOpenSec || finalSec > regCloseSec) {
                    split.targetFailed = true;
                    haltMsg = `Le Relais ${i + 1} rate sa fenêtre obligatoire (Mur Absolu).`;
                }
            }
        }

        if (split.targetFailed) {
            cascadeHalted = true;
            haltedAtSplit = i;
            if (!window.pendingExcessMsg && !isHardCascade) {
                window.pendingExcessMsg = `🚨 PARE-FEU : ${haltMsg} Cascade bloquée.`;
                setTimeout(() => openExcessModal(window.pendingExcessMsg), 100);
            }
            break; // ⛔ Le mur est percuté, on gèle le futur.
        }
    }

    window.pendingExcessMsg = null;
}

function checkGlobalRules() {
    let rulesErrors = [];
    let splitCount = {};
    let tireTrains = { T: 0, M: 0, D: 0, I: 0, P: 0 };
    let tireFullSplits = { T: 0, M: 0, D: 0, I: 0, P: 0 };
    let currentTrainTire = null;

    let reqTireChange = document.getElementById('global-req-tire-change')?.checked;
    let reqTireOnWindow = document.getElementById('pit-tires-only')?.checked;
    let reqPits = parseInt(document.getElementById('global-req-pit-stops')?.value) || 0;

    let raceType = document.getElementById('race-type')?.value;
    let isOnline = raceType === 'online';
    let isSolo = parseInt(document.getElementById('num-drivers').value) === 1;

    let hasPitWindow = document.getElementById('enable-pit-window')?.checked;
    let isLapMode = document.getElementById('pit-window-mode-tours')?.checked;

    let winOpen = parseInt(document.getElementById('pit-window-open')?.value) || 0;
    let winClose = parseInt(document.getElementById('pit-window-close')?.value) || 0;
    let winO_time = timeStringToSeconds(document.getElementById('time-pit-window-open')?.value || "");
    let winC_time = timeStringToSeconds(document.getElementById('time-pit-window-close')?.value || "");
    let winO_lap = parseInt(document.getElementById('lap-pit-window-open')?.value) || 0;
    let winC_lap = parseInt(document.getElementById('lap-pit-window-close')?.value) || 0;

    let splitsCount = parseInt(document.getElementById('total-splits').value) || 1;
    let totalSecRace = getRaceDurationSeconds();
    let splitDurSec = splitsCount > 0 ? totalSecRace / splitsCount : 0;

    let bilanHTML = "<ul class='list-unstyled'>";
    let tireFails = { T: [], M: [], D: [], I: [], P: [] };

    let lastTireUsed = null;

    function isPitInWindow(pitSec, pitLap, relayStartSec, relayStartLap) {
        if (!hasPitWindow) return true;
        if (isSolo || isOnline) {
            let relativeLap = pitLap - relayStartLap;
            let relativeSec = pitSec - relayStartSec;
            if (isLapMode) {
                if (winO_lap === 0 && winC_lap === 0) return true;
                return (relativeLap >= winO_lap && relativeLap <= winC_lap);
            } else {
                if (winO_time === 0 && winC_time === 0) return true;
                return (relativeSec >= winO_time && relativeSec <= winC_time);
            }
        } else {
            let winOpenSec = winOpen * 60;
            let winCloseSec = winClose * 60;
            for (let k = 0; k < splitsCount; k++) {
                let targetSec = (k + 1) * splitDurSec;
                if (pitSec >= targetSec - winOpenSec && pitSec <= targetSec + winCloseSec) return true;
            }
            return false;
        }
    }

    for (let i = 0; i < strategySplits.length; i++) {
        let split = strategySplits[i];
        splitCount[split.driver] = (splitCount[split.driver] || 0) + 1;
        let splitTires = new Set();
        let pitsInSplit = split.stints.length - 1;

        if (isOnline && !isSolo) {
            // 🚀 CORRECTION : La gomme s'applique à la course entière, on ne check QUE les arrêts ici
            if (reqPits > 0) {
                let ok = pitsInSplit >= reqPits;
                let colClass = ok ? 'text-success' : 'text-danger';
                bilanHTML += `<li>Relais ${i + 1} - Arrêts : <span class="${colClass}">${pitsInSplit} / ${reqPits}</span></li>`;
                if (!ok) rulesErrors.push(`Relais ${i + 1}: ${reqPits} arrêt(s) requis.`);
            }
        }

        for (let j = 0; j < split.stints.length; j++) {
            let stint = split.stints[j];
            let isAbsFirst = (i === 0 && j === 0) || ((isOnline || isSolo) && j === 0);

            let actualTire = stint.tire;
            if (!stint.changeTires && !isAbsFirst && currentTrainTire) actualTire = currentTrainTire;

            if (!isOnline || isSolo) splitTires.add(actualTire);

            if (stint.changeTires || isAbsFirst) {
                if (actualTire) tireTrains[actualTire]++;
                currentTrainTire = actualTire;
            }

            let isPit = !isAbsFirst;
            if (isPit && hasPitWindow) {
                let prevStint = (j > 0) ? split.stints[j - 1] : strategySplits[i - 1].stints[strategySplits[i - 1].stints.length - 1];
                let relayStartSec = split.stints[0].startSec;
                let relayStartLap = split.stints[0].startLap;

                let pitInWindow = isPitInWindow(prevStint.endSec, prevStint.endLap, relayStartSec, relayStartLap);
                let termLabel = (raceType === 'online') ? 'Relais' : 'Split';

                if (isSolo || isOnline) {
                    if (!pitInWindow) {
                        let msg = `Arrêt aux stands hors fenêtre`;
                        rulesErrors.push(`${termLabel} ${i + 1} : ${msg}`);
                        bilanHTML += `<li>${termLabel} ${i + 1} : <span class="text-danger">${msg}</span></li>`;
                    }
                } else {
                    if (!pitInWindow) {
                        let isInterSplit = (j === 0 && i > 0);
                        let isDriverChange = isInterSplit && (strategySplits[i - 1].driver !== split.driver);
                        let isTireChange = (reqTireOnWindow && lastTireUsed && actualTire !== lastTireUsed);

                        // 🚀 L'IMPUTATION TEMPORELLE STRICTE :
                        // Si c'est l'arrêt de fin de relais (isInterSplit), l'action physique appartient au split sortant (i)
                        // Si c'est un arrêt au milieu d'un relais, l'action appartient au split actuel (i + 1)
                        let culpritSplit = isInterSplit ? i : i + 1;

                        if (isDriverChange) {
                            // 🔴 PRIORITÉ 1 : Le changement de pilote
                            let msg = `Changement de pilote hors fenêtre`;
                            rulesErrors.unshift(`${termLabel} ${culpritSplit} : ${msg}`);
                            bilanHTML += `<li>${termLabel} ${culpritSplit} : <span class="text-danger font-weight-bold">${msg}</span></li>`;

                        } else if (isTireChange) {
                            // 🟠 PRIORITÉ 2 : Le changement de gomme (Le "else if" masque automatiquement cette alerte si la Priorité 1 s'active)
                            let msg = `Gomme changée hors fenêtre (${lastTireUsed} ➔ ${actualTire})`;
                            rulesErrors.push(`${termLabel} ${culpritSplit} : ${msg}`);
                            bilanHTML += `<li>${termLabel} ${culpritSplit} : <span class="text-danger">${msg}</span></li>`;
                        }
                    }
                }
            }
            lastTireUsed = actualTire;
        }

        let startedLate = false;
        let endedEarly = false;

        if (hasPitWindow && (!isSolo && !isOnline)) {
            // Pour vérifier si le split a "démarré" à temps, on regarde l'heure d'ENTRÉE au stand 
            // du split précédent (i-1), et non l'heure de sortie (startSec) de celui-ci.
            let pitEntryAtStart = split.stints[0].startSec;
            if (i > 0) {
                let prevSplit = strategySplits[i - 1];
                pitEntryAtStart = prevSplit.stints[prevSplit.stints.length - 1].endSec;
            }

            let endSec = split.stints[split.stints.length - 1].endSec;

            if (splitDurSec > 0) {
                let winOpenSec = winOpen * 60;
                let winCloseSec = winClose * 60;

                // 1. A-t-il démarré trop tard ? (Trou en début de split)
                if (i > 0) {
                    let startTheo = i * splitDurSec;
                    if (pitEntryAtStart > startTheo + winCloseSec) {
                        startedLate = true;
                    }
                }

                // 2. S'est-il terminé trop tôt ? (Trou en fin de split)
                if (i < strategySplits.length - 1) {
                    let endTheo = (i + 1) * splitDurSec;
                    if (endSec < endTheo - winOpenSec) {
                        endedEarly = true;
                    }
                }

                // 🚀 On a supprimé la condition d'erreur "Terminé après fermeture".
                // Si le split finit tard, il a couvert 100% de sa zone, il est donc irréprochable.
            }
        }

        if (splitTires.size === 1) {
            let t = Array.from(splitTires)[0];
            if (t) {
                let finalValidity = true;
                let failDetail = [];

                // Réparation de continuité : s'il a démarré tard, le split précédent doit finir avec la même gomme
                if (startedLate) {
                    let prevHasSameTire = false;
                    if (i > 0) {
                        let prevStints = strategySplits[i - 1].stints;
                        if (prevStints[prevStints.length - 1].tire === t) prevHasSameTire = true;
                    }
                    if (!prevHasSameTire) {
                        finalValidity = false;
                        failDetail.push("Démarré trop tard");
                    }
                }

                // Réparation de continuity : s'il a fini tôt, le split suivant doit démarrer avec la même gomme
                if (endedEarly) {
                    let nextHasSameTire = false;
                    if (i < strategySplits.length - 1) {
                        if (strategySplits[i + 1].stints[0].tire === t) nextHasSameTire = true;
                    }
                    if (!nextHasSameTire) {
                        finalValidity = false;
                        failDetail.push("Terminé trop tôt");
                    }
                }

                if (finalValidity) {
                    tireFullSplits[t]++;
                } else {
                    let termLabel = (raceType === 'online') ? 'Relais' : 'Split';
                    tireFails[t].push(`${termLabel} ${i + 1} (${failDetail.join(' et ')})`);
                }
            }
        }
    }

    // 🚀 CORRECTION : L'audit global des gommes s'applique à TOUS les modes (y compris Online Multi)
    let raceTires = new Set();
    let totalPits = 0;
    strategySplits.forEach(sp => {
        sp.stints.forEach(s => raceTires.add(s.tire));
        totalPits += sp.stints.length;
    });
    totalPits -= strategySplits.length;

    if (reqTireChange) {
        let ok = raceTires.size >= 2;
        let colClass = ok ? 'text-success' : 'text-danger';
        bilanHTML += `<li>Gommes (Course) : <span class="${colClass}">${raceTires.size} / 2 types</span></li>`;
        if (!ok) rulesErrors.push(`Course: 2 types de gommes requis.`);
    }

    // L'audit global des arrêts ne s'applique PAS en Online (il est déjà géré par relais plus haut)
    if (reqPits > 0 && (!isOnline || isSolo)) {
        let ok = totalPits >= reqPits;
        let colClass = ok ? 'text-success' : 'text-danger';
        bilanHTML += `<li>Arrêts (Course) : <span class="${colClass}">${totalPits} / ${reqPits}</span></li>`;
        if (!ok) rulesErrors.push(`Course: ${reqPits} arrêt(s) requis.`);
    }

    let reqSplits = parseInt(document.getElementById('mandatory-splits')?.value) || 0;
    if (reqSplits > 0 && !isSolo) {
        let termName = (raceType === 'online') ? 'relais' : 'splits';
        getAvailableDrivers().forEach(d => {
            let count = splitCount[d] || 0;
            let ok = count >= reqSplits;
            let colClass = ok ? 'text-success' : 'text-danger';
            bilanHTML += `<li>Pilote ${d} : <span class="${colClass}">${count} / ${reqSplits} ${termName}</span></li>`;
            if (!ok) rulesErrors.push(`Pilote ${d} : ${count}/${reqSplits} ${termName}.`);
        });
    }

    bilanHTML += "</ul><div class='mt-15 pt-10 border-top-dashed'><ul class='list-unstyled'>";

    ['T', 'M', 'D', 'I', 'P'].forEach(t => {
        if (document.getElementById(`use-${t}`)?.checked) {
            let reqFull = parseInt(document.getElementById(`val-${t}-1`)?.value);
            let reqMin = parseInt(document.getElementById(`val-${t}-2`)?.value);
            let reqMax = parseInt(document.getElementById(`val-${t}-3`)?.value);
            let hasFull = document.getElementById(`cb-${t}-1`)?.checked && reqFull > 0;
            let hasMin = document.getElementById(`cb-${t}-2`)?.checked && reqMin > 0;
            let hasMax = document.getElementById(`cb-${t}-3`)?.checked && reqMax > 0;

            let term = (raceType === 'online') ? 'Relais' : 'Split';
            bilanHTML += `<li class="mb-5"><strong>Gomme ${t} :</strong><br>`;

            if (!hasFull && !hasMin && !hasMax) {
                bilanHTML += `<span class="text-success">Libre (${tireTrains[t]} train(s) utilisé(s))</span><br>`;
            } else {
                if (hasFull) {
                    let ok = tireFullSplits[t] >= reqFull;
                    let colClass = ok ? 'text-success' : 'text-danger';
                    bilanHTML += `<span class="${colClass}">${term} complets : ${tireFullSplits[t]} / ${reqFull}</span><br>`;
                    if (!ok) {
                        rulesErrors.push(`Gomme ${t} : ${reqFull} ${term} complets requis.`);
                        if (tireFails[t] && tireFails[t].length > 0) {
                            bilanHTML += `<div class="text-warning fs-085 ml-15 mt-5">⚠️ Refusé(s) : ${tireFails[t].join(', ')}</div>`;
                        }
                    }
                }
                if (hasMin) {
                    let ok = tireTrains[t] >= reqMin;
                    let colClass = ok ? 'text-success' : 'text-danger';
                    bilanHTML += `<span class="${colClass}">Trains utilisés : ${tireTrains[t]} / ${reqMin}</span><br>`;
                    if (!ok) rulesErrors.push(`Gomme ${t} : Minimum ${reqMin} trains.`);
                }
                if (hasMax) {
                    let ok = tireTrains[t] <= reqMax;
                    let colClass = ok ? 'text-success' : 'text-danger';
                    bilanHTML += `<span class="${colClass}">Trains limités : ${tireTrains[t]} / ${reqMax}</span><br>`;
                    if (!ok) rulesErrors.push(`Gomme ${t} : Maximum ${reqMax} trains.`);
                }
            }
            bilanHTML += `</li>`;
        }
    });

    bilanHTML += "</ul></div>";
    document.getElementById('bilan-content').innerHTML = bilanHTML;

    window.hasGlobalAlert = (rulesErrors.length > 0);
    window.globalAlertText = rulesErrors.join(" | ");
    updateAlertVisibility();
}

function renderStrategy() {
    const container = document.getElementById('strategy-blocks-container');
    container.innerHTML = '';

    const raceType = document.getElementById('race-type')?.value || 'irl';
    const goal = document.getElementById('race-goal')?.value;
    const isOnline = (raceType === 'online');
    const isSolo = (parseInt(document.getElementById('num-drivers').value) === 1);

    let drvOptsArr = getAvailableDrivers();
    let sptOptsArr = getAvailableSpotters();
    let tireOptsArr = getAvailableTires();
    let initialFuel = parseFloat(document.getElementById('fuel-start').value.replace(/[^\d.]/g, '')) || 100;

    let grandTotalLaps = 0;
    let totalSecRace = getRaceDurationSeconds();
    let splitsCount = parseInt(document.getElementById('total-splits').value) || 1;
    let splitDurSec = splitsCount > 0 ? totalSecRace / splitsCount : 0;

    let relayIndexTracker = 0;

    let strTimer = localStorage.getItem('stratefreez-timer');
    let timerState = strTimer ? JSON.parse(strTimer) : null;

    for (let i = 0; i < strategySplits.length; i++) {
        let split = strategySplits[i];
        let isLastSplit = (i === strategySplits.length - 1);
        let isRelayEnd = isLastSplit || (isOnline ? true : (split.driver !== strategySplits[i + 1].driver));
        let isRelayStart = (i === 0) || (isOnline ? true : (split.driver !== strategySplits[i - 1].driver));

        if (isRelayStart) relayIndexTracker++;

        let relayClass = "";
        if (!isOnline && !isSolo) {
            let prevSame = (i > 0 && split.driver === strategySplits[i - 1].driver);
            let nextSame = (i < strategySplits.length - 1 && split.driver === strategySplits[i + 1].driver);
            let isMulti = prevSame || nextSame;
            if (isMulti) {
                if (!prevSame && nextSame) relayClass = "relay-start multi-relay";
                else if (prevSame && nextSame) relayClass = "relay-middle multi-relay";
                else if (prevSame && !nextSame) relayClass = "relay-end multi-relay";
            }
        }

        let splitTitle = "SPLIT " + (i + 1);
        if (isOnline || isSolo) {
            splitTitle = drvOptsArr.length > 1 ? "RELAIS " + (i + 1) : "COURSE";
        }

        let realStartSec = 0;
        if (isOnline || isSolo) {
            realStartSec = timeStringToSeconds(document.getElementById(`start-time-${i + 1}`)?.value || "00:00");
        } else {
            realStartSec = timeStringToSeconds(document.getElementById(`start-time-1`)?.value || "00:00") + (i * splitDurSec);
        }
        let rsH = String(Math.floor(realStartSec / 3600) % 24).padStart(2, '0');
        let rsM = String(Math.floor((realStartSec % 3600) / 60)).padStart(2, '0');

        let drvOpts = drvOptsArr.map(d => `<option value="${d}" ${d === split.driver ? 'selected' : ''}>${d}</option>`).join('');
        let validSpotters = sptOptsArr.filter(s => s !== split.driver);
        let sptOpts = validSpotters.map(s => `<option value="${s}" ${s === split.spotter ? 'selected' : ''}>${s}</option>`).join('');
        let sptSelectHTML = validSpotters.length ? `<select class="header-spotter" onchange="updateSplitData(${i}, 'spotter', this.value)"><option value="">Sans Spotter</option>${sptOpts}</select>` : '';

        let copyBtn = `<span class="material-symbols-outlined icon-action" title="Copier ce split" onclick="copySplit(${i})">content_copy</span>`;
        let pasteBtn = clipboardStints ? `<span class="material-symbols-outlined icon-action paste-active" title="Coller la stratégie" onclick="pasteSplit(${i})">content_paste</span>` : '';

        let startBtn = '';
        let isFinished = split.isFinished; // 🚀 Lecture du statut de fin

        // 🚀 CORRECTION : On autorise le Live Spotter pour TOUS les objectifs (Temps ET Tours)
        if (!isFinished) {
            if ((!isOnline && i === 0) || isOnline) {
                let isRunning = timerState && timerState.active && ((!isOnline) || (isOnline && timerState.splitIdx === i));
                if (!isRunning) {
                    startBtn = `<button class="action-btn start-btn" onclick="startLiveTimer(${i})"><span class="material-symbols-outlined icon-sm">play_arrow</span> START</button>`;
                }
            }
        }

        let tableRowsHTML = '';

        for (let j = 0; j < split.stints.length; j++) {
            let stint = split.stints[j];
            let isAbsoluteFirst = (i === 0 && j === 0) || ((isOnline || isSolo) && j === 0);
            let isFinalStintOfBlock = (j === split.stints.length - 1);
            let isHistorical = stint.isPitted;
            let disabledAttr = isHistorical ? 'disabled' : '';

            let isLockedStint = false;
            if (!isHistorical) {
                if (isOnline || isSolo) isLockedStint = isFinalStintOfBlock;
                else isLockedStint = (isLastSplit && isFinalStintOfBlock);
            }

            let lockedTire = null;
            if (!isAbsoluteFirst && !stint.changeTires && !isHistorical) {
                let prevStint = (j > 0) ? split.stints[j - 1] : strategySplits[i - 1].stints[strategySplits[i - 1].stints.length - 1];
                lockedTire = prevStint.tire;
            }

            let targetFuelForStint = (stint.manualFuel !== null && stint.manualFuel !== undefined) ? parseFloat(stint.manualFuel) : (stint.cachedTargetFuel || 100);
            // 🚀 CORRECTION : Math.ceil au lieu de toFixed(0) pour matcher avec le Live Spotter
            let pitStr = isAbsoluteFirst ? "Départ" : (stint.pitTime ? Math.ceil(stint.pitTime) + "s" : "-");
            let cbPneusHTML = isAbsoluteFirst ? `<input type="checkbox" disabled checked title="Départ">` : `<input type="checkbox" ${stint.changeTires ? 'checked' : ''} ${disabledAttr} onchange="updateStintData(${i}, ${j}, 'changeTires', this.checked)">`;

            let noFuelFlag = !isAbsoluteFirst && (stint.fuelAddedAtStart === 0);
            let pitDisplay = (!isAbsoluteFirst && noFuelFlag) ? `<span class="pit-no-fuel text-success" title="PIT sans essence">${pitStr}</span>` : pitStr;

            let tOpts = tireOptsArr.map(t => `<option value="${t}" class="bg-tire-${t}" ${t === stint.tire ? 'selected' : ''}>${t}</option>`).join('');
            let tClass = stint.tire ? `bg-tire-${stint.tire}` : '';

            let lockIconText = `<span class="material-symbols-outlined icon-sm ml-5 icon-align-middle">lock</span>`;

            // 🚀 NOUVEAU : Fausse cellule DIV qui hérite de ".table-select" et de ".locked-sim"
            let tireSelectHTML = (lockedTire && !isAbsoluteFirst) ?
                `<div class="table-select locked-sim flex-center">${lockedTire} <span class="material-symbols-outlined icon-sm">lock</span></div>` :
                `<select class="table-select ${tClass}" ${disabledAttr} onchange="updateStintData(${i}, ${j}, 'tire', this.value)">${tOpts}</select>`;

            let endH = String(Math.floor((stint.endSec || 0) / 3600)).padStart(2, '0');
            let endM = String(Math.floor(((stint.endSec || 0) % 3600) / 60)).padStart(2, '0');
            let endS = String(Math.floor((stint.endSec || 0) % 60)).padStart(2, '0');
            let timeStr = `${endH}:${endM}:${endS}`;

            let trClass = lastActiveStint === `${i}-${j}` ? 'active-stint' : '';
            if (isHistorical) trClass += ' is-historical';

            let fuelClass = `bg-fuel-${stint.fuelStrat}`;
            let fuelRateDisplay = (stint.fuelRate || 0).toFixed(2) + " L/t";

            let manualFuelClass = stint.manualFuel !== null ? 'manual-override-text' : '';
            let fuelCellHTML = isAbsoluteFirst ? `<span class="px-5 py-2">${initialFuel.toFixed(1)}<span class="unite"> L</span></span>` : (isHistorical ? `<span class="inline-block px-5 py-2">${targetFuelForStint.toFixed(1)}<span class="unite"> L</span></span>` : `<span class="inline-block cursor-pointer px-5 py-2 border-radius-4 ${manualFuelClass}" onclick="openFuelModal(${i}, ${j}, ${stint.cachedTargetFuel})">${targetFuelForStint.toFixed(1)}<span class="unite"> L</span></span>`);

            let lapsInputHTML = (isLockedStint || isHistorical) ? `<div class="locked-input-container"><input type="number" class="table-input" value="${stint.laps}" disabled><span class="material-symbols-outlined lock-icon-inside" title="Verrouillé">lock</span></div>` : `<input type="number" class="table-input" value="${stint.laps}" onchange="updateStintData(${i}, ${j}, 'laps', this.value)">`;

            // 🚀 CALCUL DU TOUT DERNIER STINT POUR LE DRAPEAU
            let isUltimateStint = false;
            if (isOnline) {
                isUltimateStint = (j === split.stints.length - 1);
            } else {
                isUltimateStint = (isLastSplit && j === split.stints.length - 1);
            }

            let actionBtnHTML = "";
            if (isUltimateStint) {
                // 🚀 HACK VISUEL : C'est un vrai bouton "PIT IN" pour forcer la taille exacte, 
                // mais le CSS masque le texte et peint le damier.
                actionBtnHTML = `<button class="action-btn pit-btn finish-line-placeholder" title="Ligne d'arrivée">PIT<span class="hide-on-mobile"> IN</span></button>`;
            } else {
                actionBtnHTML = isHistorical ? `<button class="action-btn btn-invisible" onclick="openUndoPitModal(${i}, ${j}, ${stint.laps})" title="Annuler le PIT IN">✅ Fait</button>` : `<button class="action-btn magic-btn pit-btn" onclick="openPitModal(${i}, ${j}, ${stint.startLap}, ${stint.endLap})">PIT<span class="hide-on-mobile"> IN</span></button>`;
            }

            let timeClass = isFinalStintOfBlock ? "last-stint-highlight" : "time-cell";

            tableRowsHTML += `
            <tr data-stint="${i}-${j}" data-split-idx="${i}" data-start-sec="${stint.startSec}" data-end-sec="${stint.endSec}" class="${trClass}">
                <td class="zone-pit">${cbPneusHTML}</td>
                <td class="zone-pit fuel-cell">${fuelCellHTML}</td>
                <td class="zone-pit zone-border">${pitDisplay}</td>

                <td class="zone-config"><div class="input-cell">${tireSelectHTML}</div></td>
                <td class="zone-config">
                    <div class="flex-center gap-10">
                        <select class="table-select ${fuelClass} w-100px" ${disabledAttr} onchange="updateStintData(${i}, ${j}, 'fuelStrat', this.value)">
                            <option value="push" class="bg-fuel-push" ${stint.fuelStrat === 'push' ? 'selected' : ''}>Attack</option>
                            <option value="eco" class="bg-fuel-eco" ${stint.fuelStrat === 'eco' ? 'selected' : ''}>Éco</option>
                        </select>
                        <span class="fuel-rate-display ${fuelClass}">${fuelRateDisplay}</span>
                    </div>
                </td>
                <td class="zone-config zone-border"><div class="input-cell">${lapsInputHTML}</div></td>
                
                <td class="zone-end">${actionBtnHTML}</td>
                <td class="zone-end zone-border fin-stint-cell">
                    <div class="fin-stint-wrapper">
                        <div class="tour-block">
                            <span class="blue-arrow-bg"><span class="material-symbols-outlined">arrow_forward</span></span>
                             <span class="tour-number">${stint.endLap}</span>
                        </div>
                        <div class="time-block">
                            <span class="${timeClass}">${timeStr}</span>
                        </div>
                    </div>
                </td>
                
                <td class="delete-cell">
                    ${isHistorical ? `<span class="material-symbols-outlined text-grey fs-20" title="Verrouillé">lock</span>` : `<button class="btn-delete" title="Supprimer ce stint" onclick="openDeleteModal(${i}, ${j})"><span class="material-symbols-outlined fs-20">delete</span></button>`}
                </td>
            </tr>
            `;
            if (i === strategySplits.length - 1 && j === split.stints.length - 1) grandTotalLaps = stint.endLap;
        }

        let goalHTML = "";
        let splitEndSec = split.stints[split.stints.length - 1].endSec || 0;
        let splitLaps = (split.stints[split.stints.length - 1].endLap || 0) - (split.stints[0].startLap || 0);

        if (isOnline || isSolo) {
            if (goal === 'time') {
                let targetSec = totalSecRace / splitsCount;
                let isMet = splitEndSec >= targetSec;
                let colClass = isMet ? 'text-success' : 'text-danger';
                let msg = isMet ? `🏁 Objectif atteint : ${splitLaps} tours en ${formatTime(splitEndSec)}` : `⚠️ Objectif non atteint (Cible: ${formatTime(targetSec)})`;
                goalHTML = `<strong class="${colClass}">${msg}</strong>`;
            } else {
                let targetLaps = parseInt(document.getElementById('race-laps')?.value) || 0;
                let targetPerRelay = Math.floor(targetLaps / splitsCount);
                if (i === strategySplits.length - 1) targetPerRelay = targetLaps - (i * targetPerRelay);
                let isMet = splitLaps >= targetPerRelay;
                let colClass = isMet ? 'text-success' : 'text-danger';
                let msg = isMet ? `🏁 Objectif ${isSolo ? 'atteint' : 'relais'} : ${splitLaps} / ${targetPerRelay} tours` : `⚠️ Objectif ${isSolo ? 'non atteint' : 'relais'} : ${splitLaps} / ${targetPerRelay} tours`;
                goalHTML = `<strong class="${colClass}">${msg}</strong>`;
            }
        } else {
            if (isLastSplit) {
                if (goal === 'time') {
                    let isMet = splitEndSec >= totalSecRace;
                    let colClass = isMet ? 'text-success' : 'text-danger';
                    let msg = `🏁 Fin de course : ${formatTime(splitEndSec)} (Cible: ${formatTime(totalSecRace)})`;
                    goalHTML = `<strong class="${colClass}">${msg}</strong>`;
                } else {
                    let targetLaps = parseInt(document.getElementById('race-laps')?.value) || 0;
                    let isMet = split.stints[split.stints.length - 1].endLap >= targetLaps;
                    let colClass = isMet ? 'text-success' : 'text-danger';
                    let msg = `🏁 Objectif de course : ${split.stints[split.stints.length - 1].endLap} / ${targetLaps} tours`;
                    goalHTML = `<strong class="${colClass}">${msg}</strong>`;
                }
            }
        }

        let hasPitWindow = document.getElementById('enable-pit-window')?.checked;
        let windowHTML = "";

        if (hasPitWindow && (!isLastSplit || isSolo || isOnline)) {
            if (isSolo || isOnline) {
                let isLapMode = document.getElementById('pit-window-mode-tours')?.checked;
                if (isLapMode) {
                    let winO = parseInt(document.getElementById('lap-pit-window-open')?.value) || 0;
                    let winC = parseInt(document.getElementById('lap-pit-window-close')?.value) || 0;
                    if (winO > 0 || winC > 0) {
                        if (split.stints.length > 1) {
                            let allValid = true;
                            let invalidCount = 0;
                            let pitDetails = [];
                            for (let k = 1; k < split.stints.length; k++) {
                                let pitLap = split.stints[k - 1].endLap - split.stints[0].startLap;
                                let isValid = (pitLap >= winO && pitLap <= winC);
                                if (!isValid) { allValid = false; invalidCount++; }

                                // 🚀 Coloration individuelle
                                let colorClass = isValid ? "text-success" : "text-danger";
                                pitDetails.push(`<span class="${colorClass} font-weight-bold">T${pitLap}</span>`);
                            }
                            let statusClass = allValid ? "text-success" : "text-danger";
                            let statusText = allValid ? "Dans la fenêtre" : `⚠️ ${invalidCount} arrêt${invalidCount > 1 ? 's' : ''} hors fenêtre`;

                            // 🚀 Parenthèse sortie de la balise strong globale
                            windowHTML = `<span>Fenêtre de stand (Tours ${winO} à ${winC}) : <strong class="${statusClass}">${statusText}</strong> (Pits: ${pitDetails.join(', ')})</span>`;
                        } else {
                            windowHTML = `<span>Fenêtre de stand (Tours ${winO} à ${winC}) : <strong class="text-warning">Aucun arrêt effectué</strong></span>`;
                        }
                    }
                } else {
                    let winO = document.getElementById('time-pit-window-open')?.value || "";
                    let winC = document.getElementById('time-pit-window-close')?.value || "";
                    if (winO !== "" && winC !== "") {
                        let secO = timeStringToSeconds(winO);
                        let secC = timeStringToSeconds(winC);
                        if (split.stints.length > 1) {
                            let allValid = true;
                            let invalidCount = 0;
                            let pitDetails = [];
                            for (let k = 1; k < split.stints.length; k++) {
                                let pitSec = split.stints[k - 1].endSec - split.stints[0].startSec;
                                let isValid = (pitSec >= secO && pitSec <= secC);
                                if (!isValid) { allValid = false; invalidCount++; }

                                // 🚀 Coloration individuelle
                                let colorClass = isValid ? "text-success" : "text-danger";
                                pitDetails.push(`<span class="${colorClass} font-weight-bold">${formatTime(pitSec)}</span>`);
                            }
                            let statusClass = allValid ? "text-success" : "text-danger";
                            let statusText = allValid ? "Dans la fenêtre" : `⚠️ ${invalidCount} arrêt${invalidCount > 1 ? 's' : ''} hors fenêtre`;

                            // 🚀 Parenthèse sortie de la balise strong globale
                            windowHTML = `<span>Fenêtre de stand (${winO} à ${winC}) : <strong class="${statusClass}">${statusText}</strong> (Pits: ${pitDetails.join(', ')})</span>`;
                        } else {
                            windowHTML = `<span>Fenêtre de stand (${winO} à ${winC}) : <strong class="text-warning">Aucun arrêt effectué</strong></span>`;
                        }
                    }
                }
            } else if (splitDurSec > 0) {
                let winOpen = parseInt(document.getElementById('pit-window-open')?.value) || 0;
                let winClose = parseInt(document.getElementById('pit-window-close')?.value) || 0;
                let regOpenSec = (i + 1) * splitDurSec - (winOpen * 60);
                let regCloseSec = (i + 1) * splitDurSec + (winClose * 60);

                let secOpenSec = regOpenSec + 5;
                let secCloseSec = regCloseSec - 30;

                let lastStint = split.stints[split.stints.length - 1];
                let avgLapSec = lastStint?.lapSec || 120;

                // 🚀 CORRECTION : On base l'affichage sur la ligne SÉCURISÉE
                let diffOpen = secOpenSec - splitEndSec;
                let minLap = (lastStint?.endLap || 0) + Math.ceil(diffOpen / avgLapSec);
                let diffClose = secCloseSec - splitEndSec;
                let maxLap = (lastStint?.endLap || 0) + Math.floor(diffClose / avgLapSec);

                let isSecured = (splitEndSec >= secOpenSec && splitEndSec <= secCloseSec);
                let isRegulatory = (splitEndSec >= regOpenSec && splitEndSec <= regCloseSec);

                // 🚀 DÉBUT DE LA NOUVELLE LOGIQUE VISUELLE DE CIBLAGE
                let reqTireOnWindow = document.getElementById('pit-tires-only')?.checked;
                let tireChanged = false;
                if (i < strategySplits.length - 1) {
                    let nextTire = strategySplits[i + 1].stints[0].tire;
                    let currentTire = split.stints[split.stints.length - 1].tire;
                    if (nextTire !== currentTire) tireChanged = true;
                }

                let startIsTarget = split.windowTarget === 'start';
                let endIsTarget = split.windowTarget === 'end';
                let targetSet = (startIsTarget || endIsTarget);

                // 🚀 CORRECTION : Ajout de 'font-weight-bold' pour forcer le gras même avec le label
                let startLabelClass = (startIsTarget && split.targetFailed) ? 'text-danger font-weight-bold' : (endIsTarget ? 'text-grey font-weight-bold' : 'font-weight-bold');
                let endLabelClass = (endIsTarget && split.targetFailed) ? 'text-danger font-weight-bold' : (startIsTarget ? 'text-grey font-weight-bold' : 'font-weight-bold');
                let arrowClass = targetSet ? 'text-grey' : '';

                let cbStartInput = endIsTarget
                    ? ``
                    : `<input type="checkbox" class="mr-5" onchange="setWindowTarget(${i}, this.checked ? 'start' : null)" ${startIsTarget ? 'checked' : ''}>`;

                let cbEndInput = startIsTarget
                    ? ``
                    : `<input type="checkbox" class="mr-5" onchange="setWindowTarget(${i}, this.checked ? 'end' : null)" ${endIsTarget ? 'checked' : ''}>`;

                let cbStart = `<label class="inline-checkbox-label m-0 ${startLabelClass}">${cbStartInput} Tour ${minLap}</label>`;
                let cbEnd = `<label class="inline-checkbox-label m-0 ${endLabelClass}">${cbEndInput} Tour ${maxLap}</label>`;

                let arrowHTML = `<span class="mx-5 ${arrowClass}">➔</span>`;

                let prefix = !isRelayEnd ? "Fenêtre de stand" : "Changement pilote";
                let respectWord = !isRelayEnd ? "Respectée" : "Respecté";
                let nonRespectWord = !isRelayEnd ? "Non respectée" : "Non respecté";

                let statusHTML = "";

                if (split.windowTarget === 'start' || split.windowTarget === 'end') {
                    let cibleText = split.windowTarget === 'start' ? 'début' : 'fin';
                    if (isSecured) {
                        statusHTML = `🟢 <strong>Cible ${cibleText} de fenêtre</strong>`;
                    } else if (isRegulatory) {
                        statusHTML = `🟠 <strong>Cible ${cibleText} (hors sécurité)</strong>`;
                    } else {
                        statusHTML = `🔴 <strong>${nonRespectWord}</strong>`;
                    }
                } else if (!isRelayEnd) {
                    if (isSecured) {
                        statusHTML = `🟢 <strong>${respectWord}</strong>`;
                    } else if (isRegulatory) {
                        statusHTML = `🟠 <strong>${respectWord} sans sécurité</strong>`;
                    } else {
                        if (reqTireOnWindow && tireChanged) {
                            statusHTML = `🔴 <strong>${nonRespectWord}</strong>`;
                        } else {
                            statusHTML = `🟠 <strong>Hors fenêtre par choix</strong>`;
                        }
                    }
                } else {
                    if (isSecured) {
                        statusHTML = `🟢 <strong>${respectWord}</strong>`;
                    } else if (isRegulatory) {
                        statusHTML = `🟠 <strong>${respectWord} sans sécurité</strong>`;
                    } else {
                        statusHTML = `🔴 <strong>${nonRespectWord}</strong>`;
                    }
                }

                // 🚀 CORRECTION : Ajout d'un span avec la classe mr-5 autour du préfixe
                windowHTML = `<span class="flex-inline-center"><span class="mr-5 unite">${prefix}<span class="unite"> :</span></span> ${cbStart} ${arrowHTML} ${cbEnd} &nbsp;&nbsp;|&nbsp;&nbsp; ${statusHTML}</span>`;
                // 🚀 FIN DE LA NOUVELLE LOGIQUE
            }
        }

        let footerHTML = "";
        if (windowHTML !== "") {
            footerHTML += windowHTML;
        }
        if (goalHTML !== "") {
            footerHTML += footerHTML ? `<br>${goalHTML}` : goalHTML;
        }

        let isSplitActive = lastActiveStint && lastActiveStint.startsWith(`${i}-`);

        let blockHTML = `
        <div class="split-block ${isSplitActive ? 'active-split' : ''} ${relayClass}" data-relay="${relayIndexTracker}">
            <div class="split-header">
                <div class="split-header-left">
                    <span class="split-title">${splitTitle}</span>
                    <select class="header-driver" onchange="updateSplitData(${i}, 'driver', this.value)">${drvOpts}</select>
                    ${sptSelectHTML}
                </div>
                <div class="split-header-right d-flex align-center">
                    <span class="mr-15 depart-irl-txt">Départ IRL : <strong>${rsH}:${rsM}</strong></span>
                    ${copyBtn}
                    ${pasteBtn}
                    ${startBtn}
                </div>
            </div>
            <table class="stint-table">
                <thead>
                    <tr>
                        <th class="zone-pit"><span class="unite">Chg </span>Pneus</th>
                        <th class="zone-pit">Fuel</th>
                        <th class="zone-pit zone-border"><span class="unite">Temps </span>PIT</th>
                        <th class="zone-config">Gomme</th>
                        <th class="zone-config">Strat Fuel</th>
                        <th class="zone-config zone-border">Tours</th>
                        <th class="zone-end">Action</th>
                        <th class="zone-end">FIN DE STINT</th>
                        <th class="delete-cell"></th>
                    </tr>
                </thead>
                <tbody>${tableRowsHTML}</tbody>
            </table>
            <div class="split-footer">
                <div class="pit-window-info">${footerHTML}</div>
                <button class="action-btn fs-08" onclick="addStintRow(${i})">+ Ajouter un Stint</button>
            </div>
            ${isLastSplit ? `<div class="checkered-flag"></div>` : ''}
        </div>
        `;
        container.insertAdjacentHTML('beforeend', blockHTML);
    }

    if (isOnline && goal === 'laps' && !isSolo) {
        let valBlock = document.getElementById('global-team-validation');
        let valText = document.getElementById('global-team-text');
        valBlock.classList.remove('hidden');
        let targetLaps = parseInt(document.getElementById('race-laps')?.value) || 0;

        if (grandTotalLaps >= targetLaps) {
            valBlock.classList.remove('border-danger');
            valBlock.classList.add('border-success');
            valText.innerHTML = `🏁 Objectif d'équipe atteint : ${grandTotalLaps} / ${targetLaps} tours.`;
            valText.className = "validation-text text-success";
        } else {
            valBlock.classList.remove('border-success');
            valBlock.classList.add('border-danger');
            valText.innerHTML = `⚠️ Objectif d'équipe non atteint : Manque ${targetLaps - grandTotalLaps} tours !`;
            valText.className = "validation-text text-danger";
        }
    } else {
        document.getElementById('global-team-validation').classList.add('hidden');
    }

    // 🚀 GESTION DES BOUTONS DE RESET
    let btnClear = document.getElementById('btn-clear-strategy');
    let btnRestart = document.getElementById('btn-restart-race');

    let hasLockedStints = strategySplits.some(split => split.stints.some(stint => stint.isPitted));

    if (liveTimerActive) {
        // Chrono lancé = impossible d'écraser la strat
        if (btnClear) btnClear.classList.add('hidden');
        if (btnRestart) btnRestart.classList.add('hidden');
    } else {
        // Chrono stoppé = on peut vider
        if (btnClear) btnClear.classList.remove('hidden');
        // Et on peut relancer s'il y a des lignes verrouillées
        if (btnRestart) btnRestart.classList.toggle('hidden', !hasLockedStints);
    }

    checkGlobalRules();

    if (strTimer && JSON.parse(strTimer).active && liveTimerActive) timerTick();

    if (window.pendingExcessData) {
        openExcessModal();
    }
}

function checkExportSecurity() {
    if (window.hasGlobalAlert) {
        document.getElementById('export-error-modal').classList.remove('hidden');
        return false;
    }
    return true;
}

function closeExportErrorModal() {
    document.getElementById('export-error-modal').classList.add('hidden');
}

function generateIARequest() {
    let raceType = document.getElementById('race-type')?.value;
    let goal = document.getElementById('race-goal')?.value;

    // Récupération de la variable du fichier prompt.js (ou fallback si introuvable)
    let promptIntro = typeof PROMPT_IA_BASE !== 'undefined' ? PROMPT_IA_BASE : "Analyse ces données de course :";

    let rules = {
        "Epreuve": document.getElementById('race-name-input')?.value || "Non précisé",
        "Voiture": document.getElementById('race-car-input')?.value || "Non précisée",
        "Circuit": document.getElementById('race-track-input')?.value || "Non précisé",
        "Type_de_Course": raceType,
        "Duree_ou_Tours": goal === 'time' ? document.getElementById('race-duration')?.value : document.getElementById('race-laps')?.value,
        "Decoupage": {
            "Nombre_de_Relais": document.getElementById('total-splits')?.value,
            "Changement_Type_Gomme_Uniquement_Sur_Fenetre": document.getElementById('pit-tires-only')?.checked,
            "Changement_Gomme_Obligatoire": document.getElementById('global-req-tire-change')?.checked,
            "Arrets_Stands_Obligatoires": document.getElementById('global-req-pit-stops')?.value
        },
        "Gommes_Regles_Quotas": {},
        "Stands": {
            "Capacite_Reservoir_L": 100,
            "Carburant_Depart_L": document.getElementById('fuel-start')?.value,
            "Vitesse_Remplissage_L_sec": document.getElementById('fuel-speed')?.value,
            "Reserve_Securite_L": document.getElementById('fuel-reserve')?.value,
            "Temps_Perdu_Stand_Base_sec": document.getElementById('pit-loss-time')?.value,
            "Temps_Changement_Pneus_sec": document.getElementById('pit-tire-time')?.value
        },
        "Performances_Moyennes": {
            "Carburant": {
                "Eco": document.getElementById('cons-eco')?.value,
                "Attack": document.getElementById('cons-push')?.value
            },
            "Pneus": {}
        }
    };

    ['T', 'M', 'D', 'I', 'P'].forEach(t => {
        if (document.getElementById(`use-${t}`)?.checked) {
            rules.Gommes_Regles_Quotas[t] = {
                "Obligatoire_sur_relais_complets": document.getElementById(`cb-${t}-1`)?.checked ? document.getElementById(`val-${t}-1`)?.value : 0,
                "Minimum_trains_obligatoires": document.getElementById(`cb-${t}-2`)?.checked ? document.getElementById(`val-${t}-2`)?.value : 0,
                "Maximum_trains_autorises": document.getElementById(`cb-${t}-3`)?.checked ? document.getElementById(`val-${t}-3`)?.value : 99
            };
            rules.Performances_Moyennes.Pneus[t] = {
                "Chrono_Moyen_ATTACK": document.getElementById(`global-time-push-${t}`)?.value,
                "Chrono_Moyen_ECO": document.getElementById(`global-time-eco-${t}`)?.value,
                "Duree_de_vie_Max_Tours": document.getElementById(`global-life-${t}`)?.value
            };
        }
    });

    let finalOutput = promptIntro + "\n\n" + JSON.stringify(rules, null, 4);
    document.getElementById('ia-prompt-preview').value = finalOutput;
}

function copyIARequest() {
    if (!checkExportSecurity()) return;
    let text = document.getElementById('ia-prompt-preview').value;
    navigator.clipboard.writeText(text).then(() => { alert("Requête copiée dans le presse-papier !"); });
}

function downloadIAJson() {
    if (!checkExportSecurity()) return;
    let text = document.getElementById('ia-prompt-preview').value;
    let blob = new Blob([text], { type: "text/plain" });
    let a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "STRATEFREEZ_IA_Request.txt";
    a.click();
}

function printStrategy() {
    if (!checkExportSecurity()) return;

    const printArea = document.getElementById('print-area');
    printArea.innerHTML = `<h2 class="print-title">STRATEFREEZ - SUIVI DE COURSE</h2>`;

    const raceType = document.getElementById('race-type')?.value || 'irl';
    const isOnline = (raceType === 'online');
    const isSolo = (parseInt(document.getElementById('num-drivers').value) === 1);
    const goal = document.getElementById('race-goal')?.value;
    const totalSecRace = getRaceDurationSeconds();
    const splitsCount = parseInt(document.getElementById('total-splits').value) || 1;
    const splitDurSec = splitsCount > 0 ? totalSecRace / splitsCount : 0;
    const targetLapsRace = parseInt(document.getElementById('race-laps')?.value) || 0;
    const initialFuel = parseFloat(document.getElementById('fuel-start').value.replace(/[^\d.]/g, '')) || 100;

    strategySplits.forEach((split, i) => {
        let isLastSplit = (i === strategySplits.length - 1);
        let isRelayEnd = isLastSplit || (isOnline ? true : (split.driver !== strategySplits[i + 1].driver));
        let isRelayStart = (i === 0) || (isOnline ? true : (split.driver !== strategySplits[i - 1].driver));

        let relayClass = "";
        if (!isOnline && !isSolo) {
            if (isRelayStart && !isRelayEnd) relayClass = "relay-start";
            else if (!isRelayStart && !isRelayEnd) relayClass = "relay-middle";
            else if (!isRelayStart && isRelayEnd) relayClass = "relay-end";
        }

        let title = (isOnline || isSolo) ? (getAvailableDrivers().length > 1 ? `RELAIS ${i + 1}` : `COURSE`) : `SPLIT ${i + 1}`;
        let drv = split.driver;
        let spt = split.spotter || 'Aucun';

        let rsH = "00"; let rsM = "00";
        if (split.stints.length > 0) {
            let startSec = split.stints[0].startSec || 0;
            let baseStartSecIRL = timeStringToSeconds(document.getElementById('start-time-1')?.value || "00:00");
            if (isOnline || isSolo) {
                baseStartSecIRL = timeStringToSeconds(document.getElementById(`start-time-${i + 1}`)?.value || "00:00");
                startSec = 0;
            } else {
                startSec = (i * splitDurSec);
            }
            let realTime = baseStartSecIRL + startSec;
            rsH = String(Math.floor(realTime / 3600) % 24).padStart(2, '0');
            rsM = String(Math.floor((realTime % 3600) / 60)).padStart(2, '0');
        }

        let html = `
        <div class="print-split ${relayClass}">
            <div class="print-split-header">
                <span>[ ${title} ] - Départ IRL : ${rsH}:${rsM}</span>
                <span><strong class="fs-1-25">Pilote : ${drv}</strong> &nbsp;&nbsp;|&nbsp;&nbsp; <span class="fs-08">Spotter : ${spt}</span></span>
            </div>
            <table class="print-table">
                <colgroup>
                    <col style="width: 8%;">
                    <col style="width: 15%;">
                    <col style="width: 12%;">
                    <col style="width: 20%;">
                    <col style="width: 10%;">
                    <col style="width: 35%;">
                </colgroup>
                <thead>
                    <tr>
                        <th>STINT</th>
                        <th>PNEUS</th>
                        <th>CARBURANT</th>
                        <th>STRAT.</th>
                        <th>TOURS</th>
                        <th>FIN DE STINT</th>
                    </tr>
                </thead>
                <tbody>
        `;

        split.stints.forEach((stint, j) => {
            let isAbsoluteFirst = (i === 0 && j === 0) || ((isOnline || isSolo) && j === 0);

            let targetFuelForStint = stint.cachedTargetFuel || 100;
            if (isAbsoluteFirst) targetFuelForStint = initialFuel;
            else if (stint.manualFuel !== null && stint.manualFuel !== undefined) {
                targetFuelForStint = parseFloat(stint.manualFuel);
            }

            let targetFuelText = targetFuelForStint.toFixed(1) + " L";

            let endH = String(Math.floor((stint.endSec || 0) / 3600)).padStart(2, '0');
            let endM = String(Math.floor(((stint.endSec || 0) % 3600) / 60)).padStart(2, '0');
            let endS = String(Math.floor((stint.endSec || 0) % 60)).padStart(2, '0');
            let timeStr = `${endH}:${endM}:${endS}`;

            let tireText = stint.tire || '?';
            if (!stint.changeTires && !isAbsoluteFirst) tireText = `↳ ${tireText}`;

            let fuelName = stint.fuelStrat === 'eco' ? "ÉCO" : "ATTACK";
            let fuelStratText = `${fuelName} (${(stint.fuelRate || 0).toFixed(2)} L/t)`;

            html += `
                <tr>
                    <td class="p-bold">${i + 1}.${j + 1}</td>
                    <td class="p-bold">${tireText}</td>
                    <td class="p-bold">${targetFuelText}</td>
                    <td class="text-grey-dark fs-09">${fuelStratText}</td>
                    <td class="p-bold">${stint.laps}</td>
                    <td class="p-tour">➡️ ${stint.endLap || 0} &nbsp;&nbsp;|&nbsp;&nbsp; ${timeStr}</td>
                </tr>
            `;
        });

        let footerHTML = "";
        let splitEndSec = split.stints[split.stints.length - 1]?.endSec || 0;
        let splitLaps = (split.stints[split.stints.length - 1]?.endLap || 0) - (split.stints[0]?.startLap || 0);

        if (isOnline || isSolo) {
            if (goal === 'time') {
                let targetSec = totalSecRace / splitsCount;
                let isMet = splitEndSec >= targetSec;
                let colClass = isMet ? 'text-success' : 'text-danger';
                let msg = isMet ? `🏁 Objectif atteint : ${splitLaps} tours en ${formatTime(splitEndSec)}` : `⚠️ Objectif non atteint (Cible: ${formatTime(targetSec)})`;
                footerHTML = `<span class="${colClass}">${msg}</span>`;
            } else {
                let targetLaps = parseInt(document.getElementById('race-laps')?.value) || 0;
                let targetPerRelay = Math.floor(targetLaps / splitsCount);
                if (i === strategySplits.length - 1) targetPerRelay = targetLaps - (i * targetPerRelay);
                let isMet = splitLaps >= targetPerRelay;
                let colClass = isMet ? 'text-success' : 'text-danger';
                let msg = isMet ? `🏁 Objectif ${isSolo ? 'atteint' : 'relais'} : ${splitLaps} / ${targetPerRelay} tours` : `⚠️ Objectif ${isSolo ? 'non atteint' : 'relais'} : ${splitLaps} / ${targetPerRelay} tours`;
                footerHTML = `<span class="${colClass}">${msg}</span>`;
            }
        } else {
            if (isLastSplit) {
                if (goal === 'time') {
                    let isMet = splitEndSec >= totalSecRace;
                    let colClass = isMet ? 'text-success' : 'text-danger';
                    let msg = `🏁 Fin de course : ${formatTime(splitEndSec)} (Cible: ${formatTime(totalSecRace)})`;
                    footerHTML = `<span class="${colClass}">${msg}</span>`;
                } else {
                    let targetLaps = parseInt(document.getElementById('race-laps')?.value) || 0;
                    let isMet = split.stints[split.stints.length - 1].endLap >= targetLaps;
                    let colClass = isMet ? 'text-success' : 'text-danger';
                    let msg = `🏁 Objectif de course : ${split.stints[split.stints.length - 1].endLap} / ${targetLaps} tours`;
                    footerHTML = `<span class="${colClass}">${msg}</span>`;
                }
            } else if (!document.getElementById('pit-window-block')?.classList.contains('hidden') || !document.getElementById('time-pit-window-block')?.classList.contains('hidden')) {

                let isTimeBasedWindow = (isSolo || isOnline);
                let regOpenSec = 0;
                let regCloseSec = 0;

                if (isTimeBasedWindow) {
                    let winO = document.getElementById('time-pit-window-open')?.value || "";
                    let winC = document.getElementById('time-pit-window-close')?.value || "";
                    if (winO !== "" && winC !== "") {
                        regOpenSec = timeStringToSeconds(winO);
                        regCloseSec = timeStringToSeconds(winC);
                    }
                } else if (splitDurSec > 0) {
                    let winOpen = parseInt(document.getElementById('pit-window-open')?.value) || 0;
                    let winClose = parseInt(document.getElementById('pit-window-close')?.value) || 0;
                    regOpenSec = (i + 1) * splitDurSec - (winOpen * 60);
                    regCloseSec = (i + 1) * splitDurSec + (winClose * 60);
                }

                if (regOpenSec > 0 || regCloseSec > 0) {
                    let secOpenSec = regOpenSec + 5;
                    let secCloseSec = regCloseSec - 30;

                    let lastStint = split.stints[split.stints.length - 1];
                    let avgLapSec = lastStint?.lapSec || 120;

                    // 🚀 CORRECTION : On base l'affichage sur la ligne SÉCURISÉE
                    let diffOpen = secOpenSec - splitEndSec;
                    let minLap = (lastStint?.endLap || 0) + Math.ceil(diffOpen / avgLapSec);
                    let diffClose = secCloseSec - splitEndSec;
                    let maxLap = (lastStint?.endLap || 0) + Math.floor(diffClose / avgLapSec);

                    let isSecured = (splitEndSec >= secOpenSec && splitEndSec <= secCloseSec);
                    let isRegulatory = (splitEndSec >= regOpenSec && splitEndSec <= regCloseSec);

                    if (!isRelayEnd) {
                        if (isSecured || isRegulatory) {
                            footerHTML = `<span>Fenêtre intermédiaire : <strong class="text-success">Dans la fenêtre</strong> (Cible: T ${minLap} à ${maxLap})</span>`;
                        } else {
                            footerHTML = `<span>Fenêtre intermédiaire : <strong class="text-warning">Hors fenêtre</strong> (Cible: T ${minLap} à ${maxLap})</span>`;
                        }
                    } else {
                        if (isSecured) {
                            footerHTML = `<span>Changement Pilote (Estimé) : Tour ${minLap} à ${maxLap} <strong class="text-success">Dans la fenêtre</strong></span>`;
                        } else if (isRegulatory) {
                            footerHTML = `<span>Changement Pilote (Estimé) : Tour ${minLap} à ${maxLap} <strong class="text-warning">Dans la fenêtre réglementaire</strong></span>`;
                        } else {
                            footerHTML = `<span>Changement Pilote (Estimé) : Tour ${minLap} à ${maxLap} <strong class="text-danger">⚠️ HORS FENÊTRE !</strong></span>`;
                        }
                    }
                }
            }
        }

        html += `</tbody></table>`;
        if (footerHTML) {
            html += `<div class="print-split-footer">${footerHTML}</div>`;
        }
        html += `</div>`;

        if (isLastSplit) {
            html += `<div class="print-checkered-flag"></div>`;
        }

        printArea.innerHTML += html;
    });

    window.print();
    setTimeout(() => { printArea.innerHTML = ''; }, 1000);
}

function downloadPlanningCSV() {
    if (!checkExportSecurity()) return;

    let drivers = getAvailableDrivers();
    let spotters = getAvailableSpotters();

    let pureSpotters = spotters.filter(s => !drivers.includes(s));

    let teamColumns = [...drivers, ...pureSpotters];

    const raceType = document.getElementById('race-type')?.value || 'irl';
    const isOnline = (raceType === 'online');
    const isSolo = (parseInt(document.getElementById('num-drivers').value) === 1);

    let col1Title = isOnline ? "Relais" : "Split";

    let csv = `${col1Title};Heure IRL de début;Heure IRL de fin;`;
    teamColumns.forEach(m => csv += `${m};`);
    csv += "\n";

    let baseStartSecIRL = timeStringToSeconds(document.getElementById('start-time-1')?.value || "15:00");
    let totalSecRace = getRaceDurationSeconds();
    let splitsCount = parseInt(document.getElementById('total-splits').value) || 1;

    let splitDurSec = splitsCount > 0 ? totalSecRace / splitsCount : 0;

    for (let i = 0; i < strategySplits.length; i++) {
        let split = strategySplits[i];

        let splitStartIRLSec = 0;
        let splitEndIRLSec = 0;

        if (isOnline || isSolo) {
            splitStartIRLSec = timeStringToSeconds(document.getElementById(`start-time-${i + 1}`)?.value || "00:00");
            let relayDuration = split.stints[split.stints.length - 1].endSec || splitDurSec;
            splitEndIRLSec = splitStartIRLSec + relayDuration;
        } else {
            splitStartIRLSec = baseStartSecIRL + (i * splitDurSec);
            splitEndIRLSec = baseStartSecIRL + ((i + 1) * splitDurSec);
        }

        let sh = String(Math.floor(splitStartIRLSec / 3600) % 24).padStart(2, '0');
        let sm = String(Math.floor((splitStartIRLSec % 3600) / 60)).padStart(2, '0');
        let eh = String(Math.floor(splitEndIRLSec / 3600) % 24).padStart(2, '0');
        let em = String(Math.floor((splitEndIRLSec % 3600) / 60)).padStart(2, '0');

        let splitDrv = split.driver;
        let splitSpt = split.spotter;

        csv += `${i + 1};${sh}:${sm};${eh}:${em};`;

        teamColumns.forEach(m => {
            if (m === splitDrv) {
                csv += "En piste;";
            } else if (m === splitSpt) {
                csv += "Spotter;";
            } else {
                csv += ";";
            }
        });
        csv += "\n";
    }

    let blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    let a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "STRATEFREEZ_Planning_Equipe.csv";
    a.click();
}

// ==========================================
// --- AXE 2 : SUPPRESSION DÉFINITIVE ---
// ==========================================
function openDeleteRaceModal() {
    let input = document.getElementById('delete-race-input');
    if (input) input.value = '';
    checkDeleteRaceInput();
    document.getElementById('delete-race-modal').classList.remove('hidden');
    setTimeout(() => { if (input) input.focus(); }, 50);
}

function closeDeleteRaceModal() {
    document.getElementById('delete-race-modal').classList.add('hidden');
}

function checkDeleteRaceInput() {
    let val = document.getElementById('delete-race-input')?.value.toUpperCase();
    let btn = document.getElementById('btn-confirm-delete-race');
    if (btn) {
        if (val === 'SUPPRIMER') {
            btn.disabled = false;
            btn.classList.remove('btn-disabled');
        } else {
            btn.disabled = true;
            btn.classList.add('btn-disabled');
        }
    }
}

function confirmDeleteRace() {
    closeDeleteRaceModal();
    // 1. On supprime les snapshots associés
    if (currentRaceId) localStorage.removeItem(`stratefreez-snapshots-${currentRaceId}`);

    // 2. On vide tout et on renvoie à l'accueil
    clearCurrentRaceData();
    openTab('tab-params');
}

// ==========================================
// --- AXE 4 : SNAPSHOTS (INSTANTANÉS) ---
// ==========================================
function loadSnapshotsFromStorage() {
    if (!currentRaceId) return [];
    let snaps = localStorage.getItem(`stratefreez-snapshots-${currentRaceId}`);
    return snaps ? JSON.parse(snaps) : [];
}

function saveSnapshotsToStorage(snaps) {
    if (!currentRaceId) return;
    localStorage.setItem(`stratefreez-snapshots-${currentRaceId}`, JSON.stringify(snaps));
}

function updateSnapshotDropdown() {
    let select = document.getElementById('snapshot-select');
    let msg = document.getElementById('no-snapshot-msg');
    if (!select || !msg) return;

    let snaps = loadSnapshotsFromStorage();
    if (snaps.length > 0) {
        select.classList.remove('hidden');
        msg.classList.add('hidden');
        select.innerHTML = '<option value="">-- Charger un instantané --</option>';
        snaps.forEach((snap, idx) => {
            let d = new Date(snap.timestamp);
            let timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
            let label = `📸 ${timeStr} - ${snap.name}`;
            select.insertAdjacentHTML('beforeend', `<option value="${idx}">${label}</option>`);
        });
    } else {
        select.classList.add('hidden');
        msg.classList.remove('hidden');
        select.innerHTML = '<option value="">-- Charger un instantané --</option>';
    }
}

function takeSnapshot() {
    if (!currentRaceId) return alert("Aucune course active.");

    let stateStr = localStorage.getItem('stratefreez-form-state');
    let stratStr = localStorage.getItem('stratefreez-data');
    let raceName = document.getElementById('race-name-input')?.value || 'État sans nom';

    let snap = {
        timestamp: Date.now(),
        name: raceName,
        formState: stateStr ? JSON.parse(stateStr) : {},
        strategyData: stratStr ? JSON.parse(stratStr) : []
    };

    let snaps = loadSnapshotsFromStorage();
    snaps.push(snap);
    saveSnapshotsToStorage(snaps);
    updateSnapshotDropdown();

    // Feedback visuel sur le bouton
    let btn = document.querySelector('#tab-export .btn-import');
    if (btn) {
        let oldHTML = btn.innerHTML;
        btn.innerHTML = `<span class="material-symbols-outlined">check_circle</span> Capturé !`;
        btn.classList.add('btn-success');
        setTimeout(() => {
            btn.innerHTML = oldHTML;
            btn.classList.remove('btn-success');
        }, 2000);
    }
}

function restoreSnapshot(idx) {
    if (idx === "") return;
    let snaps = loadSnapshotsFromStorage();
    let snap = snaps[idx];
    if (!snap) return;

    localStorage.setItem('stratefreez-form-state', JSON.stringify(snap.formState));
    localStorage.setItem('stratefreez-data', JSON.stringify(snap.strategyData));
    strategySplits = snap.strategyData;

    applyFormStateToDOM(snap.formState);
    cascadeFixPitWindows();
    saveFormState();
    renderStrategy();

    document.getElementById('snapshot-select').value = ""; // Reset du select
    openTab('tab-strategy'); // On bascule sur la stratégie pour voir le résultat
}