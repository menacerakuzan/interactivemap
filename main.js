import { initLenis, initInteractions } from './js/globalEffects.js';
import { initMap } from './js/mapInit.js';
import { dataService } from './js/dataService.js';
import { COMMUNITIES_BY_DISTRICT, DISTRICT_CENTERS } from './js/communities.js';

const translations = {
  uk: {
    page_title: 'Одеська область',
    hero_subtitle: 'КАРТА БЕЗБАРʼЄРНИХ МАРШРУТІВ РЕГІОНУ',
    hero_description:
      'Єдина система моніторингу доступності в Одеській області: точки інфраструктури, маршрути спеціалістів та перевірені польові описи.',
    swipe_hint: 'СВАЙП АБО КЛІК ДЛЯ ПЕРЕХОДУ',
    app_title: 'ОДЕСЬКА ОБЛАСТЬ',
    app_subtitle: 'РЕЄСТР БЕЗБАРʼЄРНИХ МАРШРУТІВ',
    search_placeholder: 'Пошук...',
    news_link: 'НОВИНИ',
    login_btn: 'УВІЙТИ &rarr;',
    filters: 'Фільтри',
    filter_all: "Всі об'єкти",
    filter_ramps: 'Пандуси',
    filter_elevators: 'Ліфти',
    filter_toilets: 'Туалети',
    filter_parking: 'Паркування',
    filter_certified: 'Сертифіковані ✦',
    show_partners: 'ПОКАЗАТИ ПАРТНЕРІВ',
    hide_btn: 'ПРИХОВАТИ',
    news_title: 'ОСТАННІ НОВИНИ',
    login_title: 'Вхід для спеціалістів',
    email_label: 'Email або логін',
    password_label: 'Пароль',
    submit_btn: 'УВІЙТИ ДО СИСТЕМИ',
    forgot_pw: 'Забули пароль?',
    access_problem: 'Проблеми з доступом?',
  },
  en: {
    page_title: 'Odesa Region',
    hero_subtitle: 'ACCESSIBILITY ROUTE MAP OF THE REGION',
    hero_description:
      'A single accessibility monitoring system for Odesa region: infrastructure points, specialist routes, and verified field reports.',
    swipe_hint: 'SWIPE OR CLICK TO ENTER',
    app_title: 'ODESA REGION',
    app_subtitle: 'ACCESSIBILITY ROUTE REGISTRY',
    search_placeholder: 'Search...',
    news_link: 'NEWS',
    login_btn: 'LOGIN &rarr;',
    filters: 'Filters',
    filter_all: 'All objects',
    filter_ramps: 'Ramps',
    filter_elevators: 'Elevators',
    filter_toilets: 'Toilets',
    filter_parking: 'Parking',
    filter_certified: 'Certified ✦',
    show_partners: 'SHOW PARTNERS',
    hide_btn: 'HIDE',
    news_title: 'LATEST NEWS',
    login_title: 'Specialist Login',
    email_label: 'Email or login',
    password_label: 'Password',
    submit_btn: 'LOG IN TO SYSTEM',
    forgot_pw: 'Forgot password?',
    access_problem: 'Access issues?',
  },
};

let currentLang = 'uk';
let authToken = localStorage.getItem('odesaAuthToken') || '';
let authUser = JSON.parse(localStorage.getItem('odesaAuthUser') || 'null');
let mapController = null;

let dashboardPoints = [];
let dashboardRoutes = [];
let dashboardNews = [];
let pointTypes = [];
let editingRouteId = null;
let editingPointId = null;
let editingNewsId = null;
let routeEditorPoints = [];
let routeOrderHistory = [];
let routeSearchTerm = '';
let pointSearchTerm = '';
let routePage = 1;
let pointPage = 1;
const PAGE_SIZE = 5;
const UI_STATE_KEY = 'odesaSpecialistUiState';
let selectedDistrict = '';
let selectedCommunity = '';
let currentSpecialistAction = 'menu';
const dashboardBlockIds = [
  'dashboard-kpi-block',
  'dashboard-routes-block',
  'dashboard-review-block',
  'dashboard-points-block',
  'dashboard-activity-block',
];
const editorActionToBlockId = {
  'add-point': 'editor-add-point-block',
  'route-editor': 'editor-route-block',
  'edit-point': 'editor-edit-point-block',
  'news-editor': 'editor-news-block',
};

function updateLanguage(lang) {
  currentLang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (translations[lang][key]) {
      el.innerHTML = translations[lang][key];
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (translations[lang][key]) {
      el.placeholder = translations[lang][key];
    }
  });
  document.body.setAttribute('lang', lang);
}

async function apiRequest(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  return dataService.request(path, { ...options, headers });
}

function setSpecialistMessage(text, isError = false) {
  const message = document.getElementById('specialist-message');
  if (!message) {
    return;
  }
  message.textContent = text;
  message.style.color = isError ? 'var(--c-vermillion)' : 'var(--c-text-secondary)';
}

async function runWithButtonState(button, pendingText, action) {
  if (!button) return action();
  const prev = button.innerText;
  button.disabled = true;
  button.innerText = pendingText;
  try {
    return await action();
  } finally {
    button.disabled = false;
    button.innerText = prev;
  }
}

function formatIsoDate(isoString) {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return date.toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isValidHttpUrl(value) {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_e) {
    return false;
  }
}

function getActiveSpecialistTab() {
  return currentSpecialistAction;
}

function saveUiState() {
  try {
    localStorage.setItem(
      UI_STATE_KEY,
      JSON.stringify({
        activeTab: getActiveSpecialistTab(),
        routeSearchTerm,
        pointSearchTerm,
        routePage,
        pointPage,
        editingRouteId,
        editingNewsId,
        selectedDistrict,
        selectedCommunity,
      })
    );
  } catch (_e) {
    // ignore storage errors
  }
}

function loadUiState() {
  try {
    return JSON.parse(localStorage.getItem(UI_STATE_KEY) || '{}');
  } catch (_e) {
    return {};
  }
}

function applySavedUiState() {
  const saved = loadUiState();

  routeSearchTerm = saved.routeSearchTerm || '';
  pointSearchTerm = saved.pointSearchTerm || '';
  routePage = Number(saved.routePage) > 0 ? Number(saved.routePage) : 1;
  pointPage = Number(saved.pointPage) > 0 ? Number(saved.pointPage) : 1;
  editingRouteId = Number(saved.editingRouteId) > 0 ? Number(saved.editingRouteId) : null;
  editingNewsId = Number(saved.editingNewsId) > 0 ? Number(saved.editingNewsId) : null;
  selectedDistrict = saved.selectedDistrict || '';
  selectedCommunity = saved.selectedCommunity || '';

  const routeSearch = document.getElementById('route-search');
  const pointSearch = document.getElementById('point-search');
  if (routeSearch) routeSearch.value = routeSearchTerm;
  if (pointSearch) pointSearch.value = pointSearchTerm;

  setActiveSpecialistTab(saved.activeTab || 'menu');
}

function populateCommunitiesSelect() {
  const select = document.getElementById('community-select');
  if (!select) return;

  const options = ['<option value="">Усі громади / райони</option>'];
  Object.entries(COMMUNITIES_BY_DISTRICT).forEach(([district, communities]) => {
    options.push(`<optgroup label="${district}">`);
    options.push(`<option value="district::${district}">• ${district}</option>`);
    communities.forEach((community) => {
      options.push(
        `<option value="community::${district}::${community}">${community}</option>`
      );
    });
    options.push('</optgroup>');
  });

  select.innerHTML = options.join('');

  if (selectedCommunity) {
    const target = `community::${selectedDistrict}::${selectedCommunity}`;
    if (select.querySelector(`option[value="${CSS.escape(target)}"]`)) {
      select.value = target;
      return;
    }
  }
  if (selectedDistrict) {
    const target = `district::${selectedDistrict}`;
    if (select.querySelector(`option[value="${CSS.escape(target)}"]`)) {
      select.value = target;
    }
  }
}

async function geocodeCommunity(district, community) {
  const cacheKey = `geo::${district}::${community}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (_e) {
      localStorage.removeItem(cacheKey);
    }
  }

  try {
    const query = encodeURIComponent(`${community}, ${district}, Odesa Oblast, Ukraine`);
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${query}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data) || !data.length) return null;
    const result = { lat: Number(data[0].lat), lng: Number(data[0].lon), zoom: 12 };
    localStorage.setItem(cacheKey, JSON.stringify(result));
    return result;
  } catch (_e) {
    return null;
  }
}

function setActiveSpecialistTab(tabName) {
  if (tabName === 'editor') tabName = 'route-editor';
  if (tabName === 'dashboard') tabName = 'dashboard';
  if (!tabName) tabName = 'menu';
  const actionButtons = document.querySelectorAll('[data-specialist-action]');
  const backButton = document.getElementById('btn-specialist-back');
  const dashboard = document.getElementById('specialist-dashboard');
  const editor = document.getElementById('specialist-editor');
  const focusBlocks = document.querySelectorAll(
    [...dashboardBlockIds.map((id) => `#${id}`), ...Object.values(editorActionToBlockId).map((id) => `#${id}`)].join(
      ', '
    )
  );
  focusBlocks.forEach((el) => el.classList.remove('action-focus'));
  const setVisible = (id, isVisible) => {
    const node = document.getElementById(id);
    if (!node) return;
    node.style.display = isVisible ? '' : 'none';
  };

  const action = tabName;
  currentSpecialistAction = action;
  actionButtons.forEach((b) => b.classList.toggle('active', b.getAttribute('data-specialist-action') === action));
  const modeLabel = document.getElementById('specialist-mode-label');
  const modeMap = {
    menu: 'РЕЖИМ: МЕНЮ',
    dashboard: 'РЕЖИМ: ОГЛЯД',
    'add-point': 'РЕЖИМ: ДОДАТИ ТОЧКУ',
    'edit-point': 'РЕЖИМ: РЕДАГУВАТИ ТОЧКУ',
    'route-editor': 'РЕЖИМ: МАРШРУТИ',
    'news-editor': 'РЕЖИМ: НОВИНИ',
  };
  if (modeLabel) {
    modeLabel.textContent = modeMap[action] || 'РЕЖИМ: МЕНЮ';
  }

  if (dashboard && editor && backButton) {
    if (action === 'menu') {
      dashboard.classList.remove('active');
      editor.classList.remove('active');
      backButton.style.display = 'none';
      dashboardBlockIds.forEach((id) => setVisible(id, true));
      Object.values(editorActionToBlockId).forEach((id) => setVisible(id, false));
    } else if (action === 'dashboard') {
      dashboard.classList.add('active');
      editor.classList.remove('active');
      backButton.style.display = 'block';
      dashboardBlockIds.forEach((id) => setVisible(id, true));
      Object.values(editorActionToBlockId).forEach((id) => setVisible(id, false));
    } else {
      dashboard.classList.remove('active');
      editor.classList.add('active');
      backButton.style.display = 'block';
      dashboardBlockIds.forEach((id) => setVisible(id, false));
      Object.entries(editorActionToBlockId).forEach(([actionName, id]) => {
        setVisible(id, actionName === action);
      });
      const focusId = editorActionToBlockId[action];
      if (focusId) document.getElementById(focusId)?.classList.add('action-focus');
    }
  }
  saveUiState();
}

function renderRoutePointOrder() {
  const container = document.getElementById('route-point-order');
  if (!container) return;

  if (!routeEditorPoints.length) {
    container.innerHTML = '<div class="activity-item t-body text-muted">Додайте точки до маршруту</div>';
    return;
  }

  container.innerHTML = routeEditorPoints
    .map(
      (p, index) => `
      <div class="route-point-item" draggable="true" data-index="${index}">
        <span class="t-body">${index + 1}. ${p.title}</span>
        <button class="btn-flat" data-action="remove-route-point" data-point-id="${p.pointId}">Remove</button>
      </div>
    `
    )
    .join('');

  let dragFrom = null;
  container.querySelectorAll('.route-point-item').forEach((item) => {
    item.addEventListener('dragstart', (e) => {
      dragFrom = Number(item.dataset.index);
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      const dragTo = Number(item.dataset.index);
      if (dragFrom === null || dragTo === dragFrom) return;

      routeOrderHistory.push(routeEditorPoints.map((p) => ({ ...p })));
      const moved = routeEditorPoints.splice(dragFrom, 1)[0];
      routeEditorPoints.splice(dragTo, 0, moved);
      renderRoutePointOrder();
    });
  });
}

function refreshRouteSelectors() {
  const routeEditSelect = document.getElementById('route-edit-select');
  const routePointAdd = document.getElementById('route-point-add');
  const editPointSelect = document.getElementById('edit-point-select');
  const newsEditSelect = document.getElementById('news-edit-select');

  if (routeEditSelect) {
    routeEditSelect.innerHTML = [
      '<option value="">Оберіть маршрут...</option>',
      ...dashboardRoutes.map((r) => `<option value="${r.id}">${r.name} (${r.status})</option>`),
    ].join('');
  }

  if (routePointAdd) {
    routePointAdd.innerHTML = dashboardPoints
      .map((p) => `<option value="${p.id}">${p.title} (${p.pointType.labelUk})</option>`)
      .join('');
  }

  if (editPointSelect) {
    editPointSelect.innerHTML = [
      '<option value="">Оберіть точку...</option>',
      ...dashboardPoints.map((p) => `<option value="${p.id}">${p.title} (${p.pointType.labelUk})</option>`),
    ].join('');
    if (editingPointId) {
      editPointSelect.value = String(editingPointId);
    }
  }

  if (newsEditSelect) {
    newsEditSelect.innerHTML = [
      '<option value="">Оберіть новину...</option>',
      ...dashboardNews.map((n) => `<option value="${n.id}">${n.title}</option>`),
    ].join('');
    if (editingNewsId) {
      newsEditSelect.value = String(editingNewsId);
    }
  }

  renderRoutePointOrder();
}

function populatePointTypeOptions() {
  const createTypeSelect = document.getElementById('point-type');
  const editTypeSelect = document.getElementById('edit-point-type');

  const options = pointTypes
    .map((pt) => `<option value="${pt.code}">${pt.labelUk}</option>`)
    .join('');

  if (createTypeSelect) createTypeSelect.innerHTML = options;
  if (editTypeSelect) editTypeSelect.innerHTML = options;
}

function renderLegend() {
  const legend = document.getElementById('map-legend');
  if (!legend) return;

  if (!pointTypes.length) {
    legend.innerHTML = '<div class="t-data text-muted">Немає типів точок</div>';
    return;
  }

  legend.innerHTML = [
    '<div class="t-data text-muted">ЛЕГЕНДА ТОЧОК</div>',
    ...pointTypes.map(
      (pt) =>
        `<div class="legend-item"><span class="legend-dot" style="background:${pt.color}"></span><span>${pt.labelUk}</span></div>`
    ),
    '<div class="legend-item"><span class="legend-dot" style="background:#C5A059"></span><span>Сертифікована точка</span></div>',
  ].join('');
}

function renderNews() {
  const newsList = document.getElementById('news-list');
  if (!newsList) return;

  if (!dashboardNews.length) {
    newsList.innerHTML = '<div class="card news-card"><p class="t-body text-muted">Новин поки немає.</p></div>';
    return;
  }

  newsList.innerHTML = dashboardNews
    .map(
      (item) => `
      <div class="card reveal news-card">
        <div class="t-data text-muted" style="margin-bottom: 16px;">${formatIsoDate(item.createdAt)}</div>
        <h3 class="t-h3" style="font-family: var(--font-display); font-size: 20px; font-weight: 400; margin-bottom: 12px;">${item.title}</h3>
        <p class="t-body text-muted" style="margin-bottom: 24px;">${item.summary}</p>
        <a href="${item.link || '#'}" ${item.link ? 'target="_blank" rel="noopener noreferrer"' : ''} class="t-body" style="color: var(--c-cerulean); text-decoration: none;">Читати &rarr;</a>
      </div>
    `
    )
    .join('');
}

function renderDashboard(points, routes) {
  const certifiedPoints = points.filter((p) => p.isCertified).length;
  const publishedRoutes = routes.filter((r) => r.status === 'published').length;

  const kpiPoints = document.getElementById('kpi-points');
  const kpiCertified = document.getElementById('kpi-certified');
  const kpiRoutes = document.getElementById('kpi-routes');
  const kpiPublished = document.getElementById('kpi-published');
  const routeList = document.getElementById('route-list');
  const reviewList = document.getElementById('review-list');
  const pointList = document.getElementById('point-list');
  const activityList = document.getElementById('activity-list');

  if (kpiPoints) kpiPoints.textContent = String(points.length);
  if (kpiCertified) kpiCertified.textContent = String(certifiedPoints);
  if (kpiRoutes) kpiRoutes.textContent = String(routes.length);
  if (kpiPublished) kpiPublished.textContent = String(publishedRoutes);

  if (routeList) {
    const filteredRoutes = routes.filter((r) =>
      r.name.toLowerCase().includes(routeSearchTerm.toLowerCase())
    );
    const routePageCount = Math.max(1, Math.ceil(filteredRoutes.length / PAGE_SIZE));
    routePage = Math.min(routePage, routePageCount);
    const routeStart = (routePage - 1) * PAGE_SIZE;
    const routeSlice = filteredRoutes.slice(routeStart, routeStart + PAGE_SIZE);
    const routePageLabel = document.getElementById('route-page-label');
    if (routePageLabel) routePageLabel.textContent = `${routePage} / ${routePageCount}`;

    routeList.innerHTML =
      routeSlice.length > 0
        ? routeSlice
            .map(
              (r) => `
          <article class="route-item">
            <div class="route-meta">
              <strong class="t-body">${r.name}</strong>
              <span class="route-status ${r.status}">${r.status}</span>
            </div>
            <div class="t-data text-muted">${r.points.length} точок • ${formatIsoDate(r.updatedAt || r.createdAt)}</div>
            <div class="route-actions">
              <button class="btn-flat" data-action="edit-route" data-route-id="${r.id}">Edit</button>
              <button class="btn-flat" data-action="advance-route" data-route-id="${r.id}">Next status</button>
            </div>
          </article>
        `
            )
            .join('')
        : '<div class="activity-item t-body text-muted">Поки немає маршрутів</div>';
  }

  if (reviewList) {
    const queue = routes.filter((r) => r.status === 'draft' || r.status === 'review');
    reviewList.innerHTML =
      queue.length > 0
        ? queue
            .map(
              (r) => `
          <article class="activity-item">
            <div class="route-meta">
              <strong class="t-body">${r.name}</strong>
              <span class="route-status ${r.status}">${r.status}</span>
            </div>
            <div class="route-actions">
              <button class="btn-flat" data-action="set-route-status" data-route-id="${r.id}" data-status="review">To review</button>
              <button class="btn-flat" data-action="set-route-status" data-route-id="${r.id}" data-status="published">Publish</button>
            </div>
          </article>
        `
            )
            .join('')
        : '<div class="activity-item t-body text-muted">Черга порожня</div>';
  }

  if (pointList) {
    const filteredPoints = points.filter((p) =>
      p.title.toLowerCase().includes(pointSearchTerm.toLowerCase())
    );
    const pointPageCount = Math.max(1, Math.ceil(filteredPoints.length / PAGE_SIZE));
    pointPage = Math.min(pointPage, pointPageCount);
    const pointStart = (pointPage - 1) * PAGE_SIZE;
    const pointSlice = filteredPoints.slice(pointStart, pointStart + PAGE_SIZE);
    const pointPageLabel = document.getElementById('point-page-label');
    if (pointPageLabel) pointPageLabel.textContent = `${pointPage} / ${pointPageCount}`;

    pointList.innerHTML =
      pointSlice.length > 0
        ? pointSlice
            .map(
              (p) => `
          <article class="route-item">
            <div class="route-meta">
              <strong class="t-body">${p.title}</strong>
              <span class="route-status ${p.isCertified ? 'published' : 'draft'}">${p.pointType.labelUk}</span>
            </div>
            <div class="route-actions">
              <button class="btn-flat" data-action="edit-point" data-point-id="${p.id}">Edit</button>
            </div>
          </article>
        `
            )
            .join('')
        : '<div class="activity-item t-body text-muted">Поки немає точок</div>';
  }

  if (activityList) {
    const pointEvents = points.map((p) => ({
      title: `Точка: ${p.title}`,
      time: p.updatedAt || p.createdAt,
      meta: p.pointType.labelUk,
    }));
    const routeEvents = routes.map((r) => ({
      title: `Маршрут: ${r.name}`,
      time: r.updatedAt || r.createdAt,
      meta: r.status,
    }));
    const events = [...pointEvents, ...routeEvents]
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 10);

    activityList.innerHTML =
      events.length > 0
        ? events
            .map(
              (e) => `
          <article class="activity-item">
            <div class="t-body">${e.title}</div>
            <div class="t-data text-muted">${e.meta} • ${formatIsoDate(e.time)}</div>
          </article>
        `
            )
            .join('')
        : '<div class="activity-item t-body text-muted">Поки немає активності</div>';
  }
  saveUiState();
}

async function refreshDashboardData() {
  if (!authToken || !authUser || !['admin', 'specialist'].includes(authUser.role)) {
    return;
  }

  const [news, typeRows, pointRows, routeRows] = await Promise.all([
    apiRequest('/api/news'),
    apiRequest('/api/point-types'),
    apiRequest('/api/points'),
    apiRequest('/api/routes'),
  ]);
  dashboardNews = news || [];
  pointTypes = typeRows || [];
  dashboardPoints = pointRows || [];
  dashboardRoutes = routeRows || [];
  renderDashboard(dashboardPoints, dashboardRoutes);
  renderNews();
  populatePointTypeOptions();
  renderLegend();
  refreshRouteSelectors();

  if (editingRouteId && !routeEditorPoints.length) {
    openRouteInEditor(editingRouteId, { silent: true });
  }
}

async function refreshPublicData() {
  try {
    const [news, typeRows] = await Promise.all([
      apiRequest('/api/news'),
      apiRequest('/api/point-types'),
    ]);
    dashboardNews = news || [];
    pointTypes = typeRows || [];
    renderNews();
    renderLegend();
    populatePointTypeOptions();
  } catch (_e) {
    // Keep UI functional even if public data fails
  }
}

function setAuthState(token, user) {
  authToken = token;
  authUser = user;

  if (token && user) {
    localStorage.setItem('odesaAuthToken', token);
    localStorage.setItem('odesaAuthUser', JSON.stringify(user));
  } else {
    localStorage.removeItem('odesaAuthToken');
    localStorage.removeItem('odesaAuthUser');
  }

  const panel = document.getElementById('specialist-panel');
  const userLabel = document.getElementById('specialist-user');
  const authBadge = document.getElementById('auth-state-badge');
  const btnAuth = document.getElementById('btn-auth');
  if (panel) {
    const canEdit = authUser && ['admin', 'specialist'].includes(authUser.role);
    panel.classList.toggle('active', Boolean(canEdit));
  }
  if (userLabel) {
    userLabel.textContent = authUser ? `${authUser.fullName} • ${authUser.role}` : 'offline';
  }
  if (authBadge) {
    authBadge.textContent = authUser
      ? `УВІЙШЛИ: ${authUser.fullName} (${authUser.role})`
      : 'НЕ АВТОРИЗОВАНО';
  }
  if (btnAuth) {
    btnAuth.innerHTML = authUser ? 'ВИЙТИ' : translations[currentLang].login_btn;
  }
  if (!authUser) {
    editingPointId = null;
    editingRouteId = null;
    resetNewsEditor();
  }
}

function bindSpecialistTabs() {
  const actionButtons = document.querySelectorAll('[data-specialist-action]');
  const backButton = document.getElementById('btn-specialist-back');
  if (!actionButtons.length) return;
  const actionMessages = {
    dashboard: 'Відкрито панель огляду',
    'add-point': 'Режим: додавання точки',
    'edit-point': 'Режим: редагування точки',
    'route-editor': 'Режим: редактор маршрутів',
    'news-editor': 'Режим: редактор новин',
  };

  actionButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-specialist-action');
      setActiveSpecialistTab(action);
      if (action === 'edit-point' && !editingPointId) {
        setSpecialistMessage('Оберіть точку зі списку та натисніть "Завантажити точку"');
      } else if (actionMessages[action]) {
        setSpecialistMessage(actionMessages[action]);
      }
    });
  });

  if (backButton) {
    backButton.addEventListener('click', () => {
      setActiveSpecialistTab('menu');
      setSpecialistMessage('Повернення до меню дій');
    });
  }
}

function resetRouteEditor() {
  editingRouteId = null;
  routeEditorPoints = [];
  routeOrderHistory = [];
  document.getElementById('route-name').value = '';
  document.getElementById('route-description').value = '';
  document.getElementById('route-status').value = 'draft';
  renderRoutePointOrder();
  mapController?.clearRouteHighlight?.();
  saveUiState();
}

function openRouteInEditor(routeId, options = {}) {
  const route = dashboardRoutes.find((r) => r.id === Number(routeId));
  if (!route) return;

  editingRouteId = route.id;
  document.getElementById('route-name').value = route.name;
  document.getElementById('route-description').value = route.description || '';
  document.getElementById('route-status').value = route.status;
  routeEditorPoints = route.points.map((p) => ({ pointId: p.id, title: p.title }));
  routeOrderHistory = [];
  renderRoutePointOrder();
  mapController?.highlightRoute?.(route);
  setActiveSpecialistTab('route-editor');
  if (!options.silent) {
    setSpecialistMessage(`Редагування маршруту: ${route.name}`);
  }
  saveUiState();
}

function openPointInEditor(pointId) {
  const point = dashboardPoints.find((p) => p.id === Number(pointId));
  if (!point) return;

  editingPointId = point.id;
  document.getElementById('edit-point-title').value = point.title;
  document.getElementById('edit-point-type').value = point.pointType.code;
  document.getElementById('edit-point-district').value = point.district || '';
  document.getElementById('edit-point-description').value = point.description || '';
  document.getElementById('edit-point-photo-url').value = point.photoUrl || '';
  document.getElementById('edit-point-certified').checked = Boolean(point.isCertified);
  const editPointSelect = document.getElementById('edit-point-select');
  if (editPointSelect) {
    editPointSelect.value = String(point.id);
  }
  setActiveSpecialistTab('edit-point');
  setSpecialistMessage(`Редагування точки: ${point.title}`);
  saveUiState();
}

function resetNewsEditor() {
  editingNewsId = null;
  const title = document.getElementById('news-title-input');
  const summary = document.getElementById('news-summary-input');
  const link = document.getElementById('news-link-input');
  const select = document.getElementById('news-edit-select');
  if (title) title.value = '';
  if (summary) summary.value = '';
  if (link) link.value = '';
  if (select) select.value = '';
}

function openNewsInEditor(newsId) {
  const news = dashboardNews.find((n) => n.id === Number(newsId));
  if (!news) return;
  editingNewsId = news.id;
  const title = document.getElementById('news-title-input');
  const summary = document.getElementById('news-summary-input');
  const link = document.getElementById('news-link-input');
  const select = document.getElementById('news-edit-select');
  if (title) title.value = news.title || '';
  if (summary) summary.value = news.summary || '';
  if (link) link.value = news.link || '';
  if (select) select.value = String(news.id);
  setActiveSpecialistTab('news-editor');
  setSpecialistMessage(`Редагування новини: ${news.title}`);
}

function nextRouteStatus(currentStatus) {
  if (currentStatus === 'draft') return 'review';
  if (currentStatus === 'review') return 'published';
  return 'review';
}

function bindDashboardActions() {
  const panel = document.getElementById('specialist-panel');
  if (!panel) return;

  panel.addEventListener('click', async (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const routeId = button.dataset.routeId;
    const pointId = button.dataset.pointId;

    try {
      if (action === 'edit-route') {
        openRouteInEditor(routeId);
      }

      if (action === 'advance-route') {
        const route = dashboardRoutes.find((r) => r.id === Number(routeId));
        if (!route) return;
        await apiRequest(`/api/routes/${route.id}`, {
          method: 'PUT',
          body: JSON.stringify({ status: nextRouteStatus(route.status) }),
        });
        await refreshDashboardData();
        setSpecialistMessage('Статус маршруту оновлено');
      }

      if (action === 'set-route-status') {
        await apiRequest(`/api/routes/${Number(routeId)}`, {
          method: 'PUT',
          body: JSON.stringify({ status: button.dataset.status }),
        });
        await refreshDashboardData();
        setSpecialistMessage('Маршрут перенесено в новий статус');
      }

      if (action === 'edit-point') {
        openPointInEditor(pointId);
      }

      if (action === 'remove-route-point') {
        routeEditorPoints = routeEditorPoints.filter((p) => p.pointId !== Number(pointId));
        renderRoutePointOrder();
        saveUiState();
      }
    } catch (error) {
      setSpecialistMessage(error.message, true);
    }
  });
}

function bindAuthFlow() {
  const btnAuth = document.getElementById('btn-auth');
  const btnAuthSubmit = document.getElementById('btn-auth-submit');
  const btnLogout = document.getElementById('btn-logout');
  const authView = document.getElementById('auth-view');
  const authError = document.getElementById('auth-error');
  const filterMenu = document.getElementById('filter-menu');

  const clearAuthError = () => {
    if (authError) authError.textContent = '';
  };

  const setAuthError = (message) => {
    if (authError) authError.textContent = message || 'Помилка входу';
  };
  const setFilterMenuHidden = (isHidden) => {
    if (!filterMenu) return;
    if (isHidden) {
      filterMenu.classList.remove('active');
      filterMenu.style.display = 'none';
    } else {
      filterMenu.style.display = '';
    }
  };

  if (btnAuth && authView) {
    btnAuth.addEventListener('click', () => {
      if (authUser) {
        dataService.logout().catch(() => null);
        setAuthState('', null);
        pointTypes = [];
        dashboardPoints = [];
        dashboardRoutes = [];
        dashboardNews = [];
        renderDashboard([], []);
        renderNews();
        resetRouteEditor();
        setSpecialistMessage('Сесію завершено');
        return;
      }
      clearAuthError();
      setFilterMenuHidden(true);
      authView.style.display = 'flex';
      if (window.gsap) {
        gsap.fromTo(
          authView,
          { opacity: 0, backdropFilter: 'blur(0px)' },
          { opacity: 1, backdropFilter: 'blur(6px)', duration: 0.5, ease: 'power2.out' }
        );
        gsap.fromTo(
          authView.querySelector('.auth-card'),
          { y: 40, opacity: 0, filter: 'blur(6px)' },
          { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.7, ease: 'power3.out', delay: 0.1 }
        );
      } else {
        authView.style.opacity = '1';
      }
    });

    authView.addEventListener('click', (e) => {
      if (e.target === authView) {
        if (window.gsap) {
          gsap.to(authView, {
            opacity: 0,
            duration: 0.4,
            onComplete: () => {
              authView.style.display = 'none';
              setFilterMenuHidden(false);
            },
          });
        } else {
          authView.style.display = 'none';
          setFilterMenuHidden(false);
        }
      }
    });
  }

  const submitAuth = async () => {
      const email = document.getElementById('auth-email')?.value?.trim();
      const password = document.getElementById('auth-password')?.value || '';
      clearAuthError();

      if (!email || !password) {
        setAuthError('Введіть email і пароль');
        return;
      }

      try {
        const data = await apiRequest('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });

        setAuthState(data.token, data.user);
        clearAuthError();

        if (authView) authView.style.display = 'none';
        setFilterMenuHidden(false);
        setSpecialistMessage(`Вхід виконано: ${data.user.fullName}`);
        setActiveSpecialistTab(data.user.role === 'viewer' ? 'menu' : 'dashboard');

        try {
          await refreshDashboardData();
        } catch (dashboardError) {
          setSpecialistMessage(
            `Вхід виконано, але є помилка завантаження даних: ${dashboardError.message}`,
            true
          );
        }
      } catch (error) {
        const uiMessage =
          error.message === 'Load failed' || error.message === 'Failed to fetch'
            ? 'Немає зʼєднання з Supabase або заблоковано мережевий запит.'
            : error.message;
        setAuthError(uiMessage);
        setSpecialistMessage(uiMessage, true);
      }
  };

  if (btnAuthSubmit) {
    btnAuthSubmit.addEventListener('click', submitAuth);
  }

  const authPassword = document.getElementById('auth-password');
  const authEmail = document.getElementById('auth-email');
  [authEmail, authPassword].forEach((input) => {
    if (!input) return;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitAuth();
      }
    });
  });

  const forgotLink = document.getElementById('forgot-password-link');
  if (forgotLink) {
    forgotLink.addEventListener('click', (e) => {
      e.preventDefault();
      setAuthError('Скидання пароля: зверніться до адміністратора');
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      dataService.logout().catch(() => null);
      setAuthState('', null);
      pointTypes = [];
      dashboardPoints = [];
      dashboardRoutes = [];
      dashboardNews = [];
      renderDashboard([], []);
      renderNews();
      resetRouteEditor();
      setSpecialistMessage('Сесію завершено');
    });
  }
}

function bindFilterMenu() {
  const filterMenu = document.getElementById('filter-menu');
  const btnToggleFilters = document.getElementById('btn-toggle-filters');
  const communitySelect = document.getElementById('community-select');

  populateCommunitiesSelect();

  if (filterMenu && btnToggleFilters) {
    btnToggleFilters.addEventListener('click', () => {
      filterMenu.classList.toggle('active');
    });

    filterMenu.querySelectorAll('.btn-flat').forEach((btn) => {
      btn.addEventListener('click', async () => {
        filterMenu.querySelectorAll('.btn-flat').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        filterMenu.classList.remove('active');

        const key = btn.getAttribute('data-filter');
        if (!mapController || !key) return;

        if (key === 'all') {
          await mapController.setFilter({ type: 'all', certified: false });
          return;
        }
        if (key === 'certified') {
          await mapController.setFilter({ type: 'all', certified: true });
          return;
        }
        await mapController.setFilter({ type: key, certified: false });
      });
    });
  }

  if (communitySelect) {
    communitySelect.addEventListener('change', async () => {
      const value = communitySelect.value;
      selectedDistrict = '';
      selectedCommunity = '';

      if (!value) {
        await mapController?.setFilter({ district: '', community: '' });
        saveUiState();
        return;
      }

      if (value.startsWith('district::')) {
        const district = value.split('::')[1];
        selectedDistrict = district;
        await mapController?.setFilter({ district, community: '' });
        const center = DISTRICT_CENTERS[district];
        if (center) {
          mapController?.focusLocation?.(center.lat, center.lng, center.zoom || 10);
        }
        setSpecialistMessage(`Фокус на: ${district}`);
      }

      if (value.startsWith('community::')) {
        const [, district, community] = value.split('::');
        selectedDistrict = district;
        selectedCommunity = community;
        await mapController?.setFilter({ district, community });

        const geo = await geocodeCommunity(district, community);
        if (geo) {
          mapController?.focusLocation?.(geo.lat, geo.lng, geo.zoom || 12);
        } else if (DISTRICT_CENTERS[district]) {
          const center = DISTRICT_CENTERS[district];
          mapController?.focusLocation?.(center.lat, center.lng, center.zoom || 10);
        }
        setSpecialistMessage(`Фокус на громаді: ${community}`);
      }
      saveUiState();
    });
  }
}

function bindSpecialistTools() {
  const btnPickOnMap = document.getElementById('btn-pick-on-map');
  const btnCreatePoint = document.getElementById('btn-create-point');
  const btnCreateRoute = document.getElementById('btn-create-route');
  const btnSaveRoute = document.getElementById('btn-save-route');
  const btnLoadRoute = document.getElementById('btn-load-route');
  const btnNewRoute = document.getElementById('btn-new-route');
  const btnAddRoutePoint = document.getElementById('btn-add-route-point');
  const btnSavePoint = document.getElementById('btn-save-point');
  const btnUndoRouteOrder = document.getElementById('btn-undo-route-order');
  const btnCreateNews = document.getElementById('btn-create-news');
  const btnSaveNews = document.getElementById('btn-save-news');
  const btnDeleteNews = document.getElementById('btn-delete-news');
  const btnLoadNews = document.getElementById('btn-load-news');
  const btnNewNews = document.getElementById('btn-new-news');
  const btnCreateDemoRoute = document.getElementById('btn-create-demo-route');
  const btnLoadPoint = document.getElementById('btn-load-point');
  const btnMapFullscreen = document.getElementById('btn-map-fullscreen');

  if (btnPickOnMap) {
    btnPickOnMap.addEventListener('click', () => {
      if (!mapController) {
        setSpecialistMessage('Карта ще не готова', true);
        return;
      }
      setSpecialistMessage('Клікніть на карті для вибору координат');
      mapController.enablePointPicking(({ lat, lng }) => {
        document.getElementById('point-lat').value = lat.toFixed(6);
        document.getElementById('point-lng').value = lng.toFixed(6);
        setSpecialistMessage('Координати вибрано');
      });
    });
  }

  if (btnAddRoutePoint) {
    btnAddRoutePoint.addEventListener('click', () => {
      const select = document.getElementById('route-point-add');
      const pointId = Number(select.value);
      const point = dashboardPoints.find((p) => p.id === pointId);
      if (!point) return;
      if (routeEditorPoints.some((p) => p.pointId === pointId)) return;

      routeOrderHistory.push(routeEditorPoints.map((p) => ({ ...p })));
      routeEditorPoints.push({ pointId: point.id, title: point.title });
      renderRoutePointOrder();
      saveUiState();
    });
  }

  if (btnUndoRouteOrder) {
    btnUndoRouteOrder.addEventListener('click', () => {
      const prev = routeOrderHistory.pop();
      if (!prev) {
        setSpecialistMessage('Немає що скасувати', true);
        return;
      }
      routeEditorPoints = prev;
      renderRoutePointOrder();
      setSpecialistMessage('Останню зміну скасовано');
      saveUiState();
    });
  }

  if (btnCreatePoint) {
    btnCreatePoint.addEventListener('click', async () => {
      if (!authToken) {
        setSpecialistMessage('Потрібно увійти як спеціаліст', true);
        return;
      }

      const payload = {
        title: document.getElementById('point-title').value.trim(),
        pointTypeCode: document.getElementById('point-type').value,
        lat: Number(document.getElementById('point-lat').value),
        lng: Number(document.getElementById('point-lng').value),
        district: document.getElementById('point-district').value.trim(),
        description: document.getElementById('point-description').value.trim(),
        photoUrl: document.getElementById('point-photo-url').value.trim() || null,
        isCertified: document.getElementById('point-certified').checked,
      };

      if (!payload.title || !payload.pointTypeCode || !Number.isFinite(payload.lat) || !Number.isFinite(payload.lng)) {
        setSpecialistMessage('Заповніть назву, тип і координати точки', true);
        return;
      }
      if (payload.lat < -90 || payload.lat > 90 || payload.lng < -180 || payload.lng > 180) {
        setSpecialistMessage('Координати поза допустимим діапазоном', true);
        return;
      }
      if (!isValidHttpUrl(payload.photoUrl)) {
        setSpecialistMessage('URL фото має починатися з http:// або https://', true);
        return;
      }

      await runWithButtonState(btnCreatePoint, 'Збереження...', async () => {
        try {
          const pointPhotoFile = document.getElementById('point-photo-file')?.files?.[0];
          if (pointPhotoFile) {
            try {
              payload.photoUrl = await dataService.uploadPointPhoto(pointPhotoFile);
            } catch (uploadError) {
              setSpecialistMessage(`Фото не завантажено: ${uploadError.message}`, true);
            }
          }
          await apiRequest('/api/points', { method: 'POST', body: JSON.stringify(payload) });
          await mapController.refresh();
          await refreshDashboardData();
          setSpecialistMessage('Точку додано');
        } catch (error) {
          setSpecialistMessage(error.message, true);
        }
      });
    });
  }

  if (btnCreateRoute) {
    btnCreateRoute.addEventListener('click', async () => {
      if (!authToken) {
        setSpecialistMessage('Потрібно увійти як спеціаліст', true);
        return;
      }

      const payload = {
        name: document.getElementById('route-name').value.trim(),
        description: document.getElementById('route-description').value.trim(),
        status: document.getElementById('route-status').value,
        points: routeEditorPoints.map((p) => ({ pointId: p.pointId })),
      };
      if (!payload.name) {
        setSpecialistMessage('Вкажіть назву маршруту', true);
        return;
      }

      await runWithButtonState(btnCreateRoute, 'Створення...', async () => {
        try {
          const created = await apiRequest('/api/routes', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
          await refreshDashboardData();
          openRouteInEditor(created.id);
          setSpecialistMessage('Маршрут створено');
        } catch (error) {
          setSpecialistMessage(error.message, true);
        }
      });
    });
  }

  if (btnSaveRoute) {
    btnSaveRoute.addEventListener('click', async () => {
      if (!editingRouteId) {
        setSpecialistMessage('Спочатку виберіть маршрут для редагування', true);
        return;
      }

      const payload = {
        name: document.getElementById('route-name').value.trim(),
        description: document.getElementById('route-description').value.trim(),
        status: document.getElementById('route-status').value,
        points: routeEditorPoints.map((p) => ({ pointId: p.pointId })),
      };
      if (!payload.name) {
        setSpecialistMessage('Вкажіть назву маршруту', true);
        return;
      }

      await runWithButtonState(btnSaveRoute, 'Оновлення...', async () => {
        try {
          await apiRequest(`/api/routes/${editingRouteId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          });
          await refreshDashboardData();
          setSpecialistMessage('Маршрут оновлено');
          saveUiState();
        } catch (error) {
          setSpecialistMessage(error.message, true);
        }
      });
    });
  }

  if (btnLoadRoute) {
    btnLoadRoute.addEventListener('click', () => {
      const routeId = Number(document.getElementById('route-edit-select').value);
      if (!routeId) {
        setSpecialistMessage('Оберіть маршрут', true);
        return;
      }
      openRouteInEditor(routeId);
      saveUiState();
    });
  }

  if (btnNewRoute) {
    btnNewRoute.addEventListener('click', () => {
      resetRouteEditor();
      setSpecialistMessage('Режим створення нового маршруту');
      saveUiState();
    });
  }

  if (btnSavePoint) {
    btnSavePoint.addEventListener('click', async () => {
      if (!editingPointId) {
        setSpecialistMessage('Оберіть точку з dashboard для редагування', true);
        return;
      }

      const payload = {
        title: document.getElementById('edit-point-title').value.trim(),
        pointTypeCode: document.getElementById('edit-point-type').value,
        district: document.getElementById('edit-point-district').value.trim(),
        description: document.getElementById('edit-point-description').value.trim(),
        photoUrl: document.getElementById('edit-point-photo-url').value.trim() || null,
        isCertified: document.getElementById('edit-point-certified').checked,
      };
      const existingPoint = dashboardPoints.find((p) => p.id === editingPointId);
      if (!payload.title || !payload.pointTypeCode) {
        setSpecialistMessage('Назва і тип точки обовʼязкові', true);
        return;
      }
      if (!isValidHttpUrl(payload.photoUrl)) {
        setSpecialistMessage('URL фото має починатися з http:// або https://', true);
        return;
      }

      await runWithButtonState(btnSavePoint, 'Оновлення...', async () => {
        try {
          const pointPhotoFile = document.getElementById('edit-point-photo-file')?.files?.[0];
          if (pointPhotoFile) {
            try {
              payload.photoUrl = await dataService.uploadPointPhoto(pointPhotoFile);
            } catch (uploadError) {
              setSpecialistMessage(`Фото не завантажено: ${uploadError.message}`, true);
            }
          }
          if (!payload.photoUrl && existingPoint?.photoUrl) {
            try {
              await dataService.deletePointPhoto(existingPoint.photoUrl);
            } catch (_e) {
              // no-op, point will still be updated without photo
            }
          }
          await apiRequest(`/api/points/${editingPointId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          });
          await mapController.refresh();
          await refreshDashboardData();
          setSpecialistMessage('Точку оновлено');
        } catch (error) {
          setSpecialistMessage(error.message, true);
        }
      });
    });
  }

  if (btnLoadPoint) {
    btnLoadPoint.addEventListener('click', () => {
      const pointId = Number(document.getElementById('edit-point-select').value);
      if (!pointId) {
        setSpecialistMessage('Оберіть точку зі списку', true);
        return;
      }
      openPointInEditor(pointId);
    });
  }

  if (btnMapFullscreen) {
    const fullscreenNode = document.querySelector('.map-container .map-view') || document.getElementById('map');
    const updateFullscreenLabel = () => {
      btnMapFullscreen.textContent = document.fullscreenElement ? 'Вийти з повного екрана' : 'На весь екран';
    };

    btnMapFullscreen.addEventListener('click', async () => {
      if (!fullscreenNode) return;
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else {
          await fullscreenNode.requestFullscreen();
        }
      } catch (_e) {
        setSpecialistMessage('Не вдалося змінити режим екрана', true);
      } finally {
        updateFullscreenLabel();
      }
    });

    document.addEventListener('fullscreenchange', updateFullscreenLabel);
    updateFullscreenLabel();
  }

  if (btnCreateNews) {
    btnCreateNews.addEventListener('click', async () => {
      const payload = {
        title: document.getElementById('news-title-input').value.trim(),
        summary: document.getElementById('news-summary-input').value.trim(),
        link: document.getElementById('news-link-input').value.trim() || null,
      };

      if (!payload.title || !payload.summary) {
        setSpecialistMessage('Заповніть заголовок і опис новини', true);
        return;
      }
      if (!isValidHttpUrl(payload.link)) {
        setSpecialistMessage('Посилання новини має бути http:// або https://', true);
        return;
      }

      await runWithButtonState(btnCreateNews, 'Публікація...', async () => {
        try {
          await apiRequest('/api/news', { method: 'POST', body: JSON.stringify(payload) });
          resetNewsEditor();
          await refreshDashboardData();
          setSpecialistMessage('Новину додано');
        } catch (error) {
          setSpecialistMessage(error.message, true);
        }
      });
    });
  }

  if (btnLoadNews) {
    btnLoadNews.addEventListener('click', () => {
      const newsId = Number(document.getElementById('news-edit-select').value);
      if (!newsId) {
        setSpecialistMessage('Оберіть новину зі списку', true);
        return;
      }
      openNewsInEditor(newsId);
    });
  }

  if (btnNewNews) {
    btnNewNews.addEventListener('click', () => {
      resetNewsEditor();
      setSpecialistMessage('Режим створення нової новини');
    });
  }

  if (btnSaveNews) {
    btnSaveNews.addEventListener('click', async () => {
      if (!editingNewsId) {
        setSpecialistMessage('Спочатку завантажте новину для редагування', true);
        return;
      }
      const payload = {
        title: document.getElementById('news-title-input').value.trim(),
        summary: document.getElementById('news-summary-input').value.trim(),
        link: document.getElementById('news-link-input').value.trim() || null,
      };
      if (!payload.title || !payload.summary) {
        setSpecialistMessage('Заповніть заголовок і опис новини', true);
        return;
      }
      if (!isValidHttpUrl(payload.link)) {
        setSpecialistMessage('Посилання новини має бути http:// або https://', true);
        return;
      }
      await runWithButtonState(btnSaveNews, 'Оновлення...', async () => {
        try {
          await apiRequest(`/api/news/${editingNewsId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          });
          await refreshDashboardData();
          setSpecialistMessage('Новину оновлено');
        } catch (error) {
          setSpecialistMessage(error.message, true);
        }
      });
    });
  }

  if (btnDeleteNews) {
    btnDeleteNews.addEventListener('click', async () => {
      if (!editingNewsId) {
        setSpecialistMessage('Оберіть новину для видалення', true);
        return;
      }
      await runWithButtonState(btnDeleteNews, 'Видалення...', async () => {
        try {
          await apiRequest(`/api/news/${editingNewsId}`, { method: 'DELETE' });
          resetNewsEditor();
          await refreshDashboardData();
          setSpecialistMessage('Новину видалено');
        } catch (error) {
          setSpecialistMessage(error.message, true);
        }
      });
    });
  }

  if (btnCreateDemoRoute) {
    btnCreateDemoRoute.addEventListener('click', async () => {
      if (!authToken) {
        setSpecialistMessage('Потрібно увійти як спеціаліст', true);
        return;
      }

      const demoPoints = [
        ['Оперний театр (вхід)', 46.4851, 30.7405],
        ['Приморський бульвар', 46.4857, 30.7417],
        ['Потьомкінські сходи (верх)', 46.4863, 30.7429],
        ['Думська площа', 46.4859, 30.7423],
        ['Міський сад', 46.4846, 30.7327],
        ['Дерибасівська (центр)', 46.4838, 30.7321],
        ['Соборна площа', 46.4832, 30.7268],
        ['Одеська філармонія', 46.4789, 30.7442],
        ['Вокзал Одеса-Головна', 46.4665, 30.7392],
        ['Парк Шевченка', 46.4777, 30.7535],
      ];

      await runWithButtonState(btnCreateDemoRoute, 'Генерація...', async () => {
        try {
          const createdPointIds = [];
          for (let i = 0; i < demoPoints.length; i += 1) {
            const [title, lat, lng] = demoPoints[i];
            const created = await apiRequest('/api/points', {
              method: 'POST',
              body: JSON.stringify({
                title: `${title} [DEMO]`,
                lat,
                lng,
                district: 'Одеський район',
                pointTypeCode: i % 2 === 0 ? 'ramp' : 'entrance',
                description: 'Тестова DEMO точка для перевірки маршруту.',
                isCertified: i % 3 === 0,
              }),
            });
            createdPointIds.push({ pointId: created.id });
          }

          const route = await apiRequest('/api/routes', {
            method: 'POST',
            body: JSON.stringify({
              name: `DEMO маршрут Одеса (10 точок) ${new Date().toLocaleTimeString('uk-UA')}`,
              status: 'draft',
              description: 'Автоматично створений тестовий маршрут по Одесі.',
              points: createdPointIds,
            }),
          });

          await mapController.refresh();
          await refreshDashboardData();
          openRouteInEditor(route.id);
          setSpecialistMessage('DEMO маршрут на 10 точок створено');
        } catch (error) {
          setSpecialistMessage(error.message, true);
        }
      });
    });
  }
}

function bindSearchAndPager() {
  const routeSearch = document.getElementById('route-search');
  const pointSearch = document.getElementById('point-search');
  const routePrev = document.getElementById('route-prev');
  const routeNext = document.getElementById('route-next');
  const pointPrev = document.getElementById('point-prev');
  const pointNext = document.getElementById('point-next');

  if (routeSearch) {
    routeSearch.addEventListener('input', () => {
      routeSearchTerm = routeSearch.value.trim();
      routePage = 1;
      renderDashboard(dashboardPoints, dashboardRoutes);
      saveUiState();
    });
  }
  if (pointSearch) {
    pointSearch.addEventListener('input', () => {
      pointSearchTerm = pointSearch.value.trim();
      pointPage = 1;
      renderDashboard(dashboardPoints, dashboardRoutes);
      saveUiState();
    });
  }

  if (routePrev) {
    routePrev.addEventListener('click', () => {
      routePage = Math.max(1, routePage - 1);
      renderDashboard(dashboardPoints, dashboardRoutes);
      saveUiState();
    });
  }
  if (routeNext) {
    routeNext.addEventListener('click', () => {
      routePage += 1;
      renderDashboard(dashboardPoints, dashboardRoutes);
      saveUiState();
    });
  }
  if (pointPrev) {
    pointPrev.addEventListener('click', () => {
      pointPage = Math.max(1, pointPage - 1);
      renderDashboard(dashboardPoints, dashboardRoutes);
      saveUiState();
    });
  }
  if (pointNext) {
    pointNext.addEventListener('click', () => {
      pointPage += 1;
      renderDashboard(dashboardPoints, dashboardRoutes);
      saveUiState();
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const isMapApp = document.querySelector('.app-interface');

  initLenis();
  initInteractions();

  const btnEnter = document.getElementById('btn-enter');
  const heroSection = document.querySelector('.hero');
  const appInterface = document.querySelector('.app-interface');
  let isTransitioning = false;

  const initMapAndTools = async () => {
    mapController = await initMap({
      fetchPoints: async (filter) => {
        const query = new URLSearchParams();
        if (filter.type && filter.type !== 'all') {
          query.set('type', filter.type);
        }
        if (filter.certified) {
          query.set('certified', 'true');
        }
        return apiRequest(`/api/points${query.toString() ? `?${query.toString()}` : ''}`);
      },
    });
    bindFilterMenu();
    bindSpecialistTools();
    bindSpecialistTabs();
    bindDashboardActions();
    bindSearchAndPager();
    applySavedUiState();
    await refreshPublicData();

    if (authUser && ['admin', 'specialist'].includes(authUser.role)) {
      setAuthState(authToken, authUser);
      await refreshDashboardData();
    } else {
      renderDashboard([], []);
      resetRouteEditor();
    }

    if (selectedDistrict || selectedCommunity) {
      await mapController?.setFilter({
        district: selectedDistrict,
        community: selectedCommunity,
      });
      populateCommunitiesSelect();
    }
  };

  const transitionToMap = () => {
    if (isTransitioning || !heroSection || heroSection.style.display === 'none') return;
    isTransitioning = true;

    gsap.to('.hero', {
      opacity: 0,
      y: -30,
      duration: 0.4,
      ease: 'power2.inOut',
      onComplete: async () => {
        heroSection.style.display = 'none';
        appInterface.style.display = 'flex';

        gsap.to(appInterface, { opacity: 1, duration: 0.5, ease: 'power2.out' });
        gsap.from('.header, .filter-menu', {
          y: -10,
          opacity: 0,
          duration: 0.5,
          stagger: 0.05,
          ease: 'power2.out',
        });

        await initMapAndTools();
        window.dispatchEvent(new Event('resize'));
      },
    });
  };

  if (btnEnter) {
    btnEnter.addEventListener('click', transitionToMap);

    window.addEventListener(
      'wheel',
      (e) => {
        if (e.deltaY > 50 && heroSection.style.display !== 'none') transitionToMap();
      },
      { passive: true }
    );

    let touchStartY = 0;
    window.addEventListener(
      'touchstart',
      (e) => {
        touchStartY = e.touches[0].clientY;
      },
      { passive: true }
    );

    window.addEventListener(
      'touchend',
      (e) => {
        if (touchStartY - e.changedTouches[0].clientY > 50 && heroSection.style.display !== 'none') {
          transitionToMap();
        }
      },
      { passive: true }
    );
  } else if (isMapApp) {
    await initMapAndTools();
  }

  const btnHidePartners = document.getElementById('btn-hide-partners');
  const btnShowPartners = document.getElementById('btn-show-partners');
  const partnerPanel = document.getElementById('partner-panel');

  if (btnHidePartners && btnShowPartners && partnerPanel) {
    btnHidePartners.addEventListener('click', () => {
      gsap.to(partnerPanel, {
        y: 20,
        opacity: 0,
        scale: 0.95,
        duration: 0.8,
        ease: 'power3.inOut',
        onComplete: () => {
          partnerPanel.style.display = 'none';
          btnShowPartners.style.display = 'block';
          gsap.fromTo(
            btnShowPartners,
            { opacity: 0, y: 10 },
            { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
          );
        },
      });
    });

    btnShowPartners.addEventListener('click', () => {
      btnShowPartners.style.display = 'none';
      partnerPanel.style.display = 'flex';
      gsap.fromTo(
        partnerPanel,
        { y: 20, opacity: 0, scale: 0.95 },
        { y: 0, opacity: 1, scale: 1, duration: 0.8, ease: 'power3.out' }
      );
    });
  }

  const btnLangToggle = document.getElementById('btn-lang-toggle');
  const btnNewsScroll = document.getElementById('btn-news-scroll');
  if (btnLangToggle) {
    btnLangToggle.addEventListener('click', (e) => {
      e.preventDefault();
      const nextLang = currentLang === 'uk' ? 'en' : 'uk';
      updateLanguage(nextLang);
      setAuthState(authToken, authUser);
    });
  }

  if (btnNewsScroll) {
    btnNewsScroll.addEventListener('click', (e) => {
      e.preventDefault();
      const newsSection = document.getElementById('news-section');
      if (newsSection) {
        newsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  updateLanguage(currentLang);
  bindAuthFlow();
});
