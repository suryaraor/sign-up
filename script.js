// Configuration
const LEGACY_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyhwIdqNKoconoY2MhM6YJWb6ZSJvBhbLMOlHyQEXet5AocCmwGF9GZOlrsGLpKbKwPLA/exec';
const PREVIOUS_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyf2Uj1h_4piNgHzOzlTDmqgImP-J4HwIhRwL6RuQD4VJqHdAqAvhUxrp8Jzg1pkwjo/exec';
const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw1qlmlAGnqmMOn9UVmX42Z5thkY0oMnILYrvRlVLybYAhMzYt45piOVwqy0vaqinWzDA/exec';

let storedAppsScriptUrl = localStorage.getItem('walkathon_appsScriptUrl') || '';
if (storedAppsScriptUrl === LEGACY_APPS_SCRIPT_URL || storedAppsScriptUrl === PREVIOUS_APPS_SCRIPT_URL) {
    storedAppsScriptUrl = DEFAULT_APPS_SCRIPT_URL;
    localStorage.setItem('walkathon_appsScriptUrl', storedAppsScriptUrl);
}

let CONFIG = {
    sheetId: localStorage.getItem('walkathon_sheetId') || '1hPqe8WZtfOKQqJLzIoS5QwpdFThXCdMrp_ymdhLy5Ms',
    appsScriptUrl: storedAppsScriptUrl || DEFAULT_APPS_SCRIPT_URL,
    sheetName: 'material'
};

let materialsData = [];
let currentUserName = '';
let jsonpCounter = 0;

function buildAppsScriptUrl(params) {
    const query = new URLSearchParams(params).toString();
    return `${CONFIG.appsScriptUrl}?${query}`;
}

function jsonpRequest(params) {
    return new Promise((resolve, reject) => {
        const callbackName = `walkathonJsonpCb_${Date.now()}_${jsonpCounter++}`;
        const script = document.createElement('script');
        const cleanup = () => {
            delete window[callbackName];
            if (script.parentNode) {
                script.parentNode.removeChild(script);
            }
        };

        const timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error('Request timed out'));
        }, 15000);

        window[callbackName] = (data) => {
            clearTimeout(timeoutId);
            cleanup();
            resolve(data);
        };

        script.onerror = () => {
            clearTimeout(timeoutId);
            cleanup();
            reject(new Error('Unable to reach Apps Script endpoint'));
        };

        script.src = buildAppsScriptUrl({
            ...params,
            callback: callbackName
        });

        document.body.appendChild(script);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    wireUiEvents();
    initializeApp();
});

function wireUiEvents() {
    document.getElementById('searchInput').addEventListener('input', () => {
        renderMaterialList();
    });

    document.getElementById('createItemBtn').addEventListener('click', async () => {
        const item = document.getElementById('itemInput').value.trim();
        const location = document.getElementById('locationInput').value.trim();

        if (!item || !location) {
            showError('Please provide both item and location');
            return;
        }

        try {
            showLoading(true);
            await jsonpRequest({
                sheetId: CONFIG.sheetId,
                sheetName: CONFIG.sheetName,
                action: 'createMaterial',
                item,
                location,
                createdBy: currentUserName
            });

            document.getElementById('itemInput').value = '';
            document.getElementById('locationInput').value = '';
            await loadMaterialsData();
            showLoading(false);
        } catch (error) {
            showLoading(false);
            showError(`Failed to create item: ${error.message}`);
        }
    });

    document.getElementById('saveNameBtn').addEventListener('click', () => {
        const value = document.getElementById('userNameInput').value.trim();
        if (!value) {
            showError('Please enter your name');
            return;
        }

        currentUserName = value;
        localStorage.setItem('walkathon_userName', currentUserName);
        hideNamePrompt();
        renderMaterialList();
    });
}

async function initializeApp() {
    if (!CONFIG.sheetId || !CONFIG.appsScriptUrl) {
        showSetupInstructions();
        return;
    }

    ensureUserName();

    showLoading(true);
    try {
        await loadMaterialsData();
        showLoading(false);
    } catch (error) {
        showError(`Failed to load data: ${error.message}`);
        showLoading(false);
        showSetupInstructions();
    }
}

function ensureUserName() {
    currentUserName = (localStorage.getItem('walkathon_userName') || '').trim();

    if (!currentUserName) {
        const modal = document.getElementById('nameModal');
        modal.style.display = 'flex';
        document.getElementById('userNameInput').focus();
    } else {
        hideNamePrompt();
    }
}

function hideNamePrompt() {
    document.getElementById('nameModal').style.display = 'none';
}

async function loadMaterialsData() {
    const data = await jsonpRequest({
        sheetId: CONFIG.sheetId,
        sheetName: CONFIG.sheetName,
        action: 'getMaterials'
    });

    if (!data.success) {
        throw new Error(data.error || 'Failed to load materials');
    }

    materialsData = data.data || [];
    updateCount();
    renderMaterialList();
}

function filterMaterials() {
    const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
    if (!searchTerm) {
        return materialsData;
    }

    return materialsData.filter((material) => {
        return [material.item, material.location, material.volunteer]
            .map(value => String(value || '').toLowerCase())
            .some(value => value.includes(searchTerm));
    });
}

function groupByLocation(materials) {
    const grouped = {};
    materials.forEach((material) => {
        const location = material.location || 'Unassigned';
        if (!grouped[location]) {
            grouped[location] = [];
        }
        grouped[location].push(material);
    });
    return grouped;
}

function renderMaterialList() {
    const filtered = filterMaterials();
    const grouped = groupByLocation(filtered);
    const resultsList = document.getElementById('resultsList');
    const noResults = document.getElementById('noResults');
    const searchInfo = document.getElementById('searchInfo');

    resultsList.innerHTML = '';

    if (filtered.length === 0) {
        noResults.style.display = 'block';
        searchInfo.textContent = '';
        return;
    }

    noResults.style.display = 'none';
    searchInfo.textContent = `Found ${filtered.length} item(s) in ${Object.keys(grouped).length} location(s)`;

    Object.keys(grouped)
        .sort((a, b) => a.localeCompare(b))
        .forEach((location) => {
            const groupContainer = document.createElement('div');
            groupContainer.className = 'family-group';

            const header = document.createElement('div');
            header.className = 'family-header';
            const groupItems = grouped[location];
            const takenCount = groupItems.filter((m) => !!m.volunteer).length;
            header.innerHTML = `
                <div class="family-header-name">${escapeHtml(location)}</div>
                <div class="family-header-count">${takenCount}/${groupItems.length} claimed</div>
            `;

            const membersContainer = document.createElement('div');
            membersContainer.className = 'family-members';

            groupItems.forEach((material) => {
                const itemRow = document.createElement('div');
                itemRow.className = `participant ${material.volunteer ? 'checked-in' : ''}`;

                const info = document.createElement('div');
                info.className = 'participant-info';
                info.innerHTML = `
                    <div class="participant-name">${escapeHtml(material.item || 'Untitled item')}</div>
                    <div class="participant-id">Volunteer: ${escapeHtml(material.volunteer || 'Unclaimed')}</div>
                `;

                const status = document.createElement('div');
                status.className = 'status-ticks';
                status.innerHTML = buildStatusTicks(material);

                const actions = document.createElement('div');
                actions.className = 'participant-actions';
                renderActions(actions, material);

                itemRow.appendChild(info);
                itemRow.appendChild(status);
                itemRow.appendChild(actions);
                membersContainer.appendChild(itemRow);
            });

            groupContainer.appendChild(header);
            groupContainer.appendChild(membersContainer);
            resultsList.appendChild(groupContainer);
        });
}

function buildStatusTicks(material) {
    const tick1 = !!material.volunteer;
    const tick2 = !!material.accepted;
    const tick3 = !!material.loaded;

    return `
        <span class="tick ${tick1 ? 'on' : ''}" title="Signed up">✓</span>
        <span class="tick ${tick2 ? 'on' : ''}" title="Accepted bringing">✓</span>
        <span class="tick ${tick3 ? 'on' : ''}" title="Loaded / brought">✓</span>
    `;
}

function renderActions(container, material) {
    const myItem = material.volunteer && sameName(material.volunteer, currentUserName);

    if (!material.volunteer) {
        const signupBtn = document.createElement('button');
        signupBtn.className = 'btn-check';
        signupBtn.textContent = 'Sign Up';
        signupBtn.onclick = () => signupForItem(material);
        container.appendChild(signupBtn);
        return;
    }

    if (!myItem) {
        const occupiedBtn = document.createElement('button');
        occupiedBtn.className = 'btn-secondary';
        occupiedBtn.textContent = 'Taken';
        occupiedBtn.disabled = true;
        container.appendChild(occupiedBtn);
        return;
    }

    if (!material.accepted) {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'btn-check';
        acceptBtn.textContent = 'Accept';
        acceptBtn.onclick = () => updateMyItemStatus(material, true, false);
        container.appendChild(acceptBtn);
    }

    if (material.accepted && !material.loaded) {
        const loadedBtn = document.createElement('button');
        loadedBtn.className = 'btn-primary';
        loadedBtn.textContent = 'Loaded';
        loadedBtn.onclick = () => updateMyItemStatus(material, true, true);
        container.appendChild(loadedBtn);
    }

    const releaseBtn = document.createElement('button');
    releaseBtn.className = 'btn-undo';
    releaseBtn.textContent = 'Release';
    releaseBtn.onclick = () => releaseItem(material);
    container.appendChild(releaseBtn);
}

async function signupForItem(material) {
    if (!currentUserName) {
        ensureUserName();
        return;
    }

    try {
        showLoading(true);
        const response = await jsonpRequest({
            sheetId: CONFIG.sheetId,
            sheetName: CONFIG.sheetName,
            action: 'signupMaterial',
            rowIndex: material.rowIndex,
            volunteer: currentUserName
        });

        if (!response.success) {
            throw new Error(response.error || 'Failed to sign up');
        }

        await loadMaterialsData();
        showLoading(false);
    } catch (error) {
        showLoading(false);
        showError(`Failed to sign up: ${error.message}`);
    }
}

async function updateMyItemStatus(material, accepted, loaded) {
    try {
        showLoading(true);
        const response = await jsonpRequest({
            sheetId: CONFIG.sheetId,
            sheetName: CONFIG.sheetName,
            action: 'updateMaterialStatus',
            rowIndex: material.rowIndex,
            volunteer: currentUserName,
            accepted: accepted ? 'true' : 'false',
            loaded: loaded ? 'true' : 'false'
        });

        if (!response.success) {
            throw new Error(response.error || 'Failed to update status');
        }

        await loadMaterialsData();
        showLoading(false);
    } catch (error) {
        showLoading(false);
        showError(`Failed to update status: ${error.message}`);
    }
}

async function releaseItem(material) {
    try {
        showLoading(true);
        const response = await jsonpRequest({
            sheetId: CONFIG.sheetId,
            sheetName: CONFIG.sheetName,
            action: 'releaseMaterial',
            rowIndex: material.rowIndex,
            volunteer: currentUserName
        });

        if (!response.success) {
            throw new Error(response.error || 'Failed to release');
        }

        await loadMaterialsData();
        showLoading(false);
    } catch (error) {
        showLoading(false);
        showError(`Failed to release item: ${error.message}`);
    }
}

function sameName(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function updateCount() {
    const claimed = materialsData.filter((m) => !!m.volunteer).length;
    document.getElementById('claimedCount').textContent = claimed;
    document.getElementById('totalCount').textContent = materialsData.length;
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showSetupInstructions() {
    document.getElementById('setupInstructions').innerHTML = `
        <h3>Configuration Required</h3>
        <p>Please configure your Google Sheet connection:</p>
        <label for="sheetId"><strong>Google Sheet ID:</strong></label>
        <input type="text" id="sheetId" value="${CONFIG.sheetId}" placeholder="e.g., 1abc123xyz456def" class="config-input">
        <label for="appsScriptUrl"><strong>Apps Script URL:</strong></label>
        <input type="text" id="appsScriptUrl" value="${CONFIG.appsScriptUrl}" placeholder="https://script.google.com/macros/s/.../exec" class="config-input">
        <button onclick="saveConfiguration()" class="btn-primary" style="width: 100%; margin-top: 10px;">Save Configuration</button>
        <p class="setup-hint" style="margin-top: 15px;"><a href="#" onclick="showSetupGuide(); return false;">Click here for setup instructions</a></p>
    `;
    document.getElementById('setupInstructions').style.display = 'block';
}

function saveConfiguration() {
    const sheetId = document.getElementById('sheetId').value.trim();
    const appsScriptUrl = document.getElementById('appsScriptUrl').value.trim();

    if (!sheetId || !appsScriptUrl) {
        showError('Please fill in both Sheet ID and Apps Script URL');
        return;
    }

    CONFIG.sheetId = sheetId;
    CONFIG.appsScriptUrl = appsScriptUrl;

    localStorage.setItem('walkathon_sheetId', sheetId);
    localStorage.setItem('walkathon_appsScriptUrl', appsScriptUrl);

    document.getElementById('setupInstructions').style.display = 'none';
    initializeApp();
}

function showSetupGuide() {
    const guide = `
SETUP GUIDE - Google Apps Script Backend

STEP 1: Get Apps Script Code
- Open apps-script.js
- Copy all code and paste in Google Apps Script

STEP 2: Deploy as web app
- Deploy > New deployment > Web app
- Execute as: Your account
- Who has access: Anyone

STEP 3: Use sheet tab named: material
Required columns: ID, Item, Volunteer, location
Recommended columns: Accepted, Loaded, CreatedBy, UpdatedAt

STEP 4: Paste deployment URL in this app and save configuration
    `;
    alert(guide);
}

function showLoading(show) {
    document.getElementById('loadingIndicator').style.display = show ? 'block' : 'none';
}

function showError(message) {
    const errorElement = document.getElementById('errorMessage');
    errorElement.innerHTML = `
        <span>${message}</span>
        <button class="error-close" onclick="this.parentElement.style.display='none'">x</button>
    `;
    errorElement.style.display = 'flex';

    setTimeout(() => {
        errorElement.style.display = 'none';
    }, 5000);
}
