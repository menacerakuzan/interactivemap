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
const MAX_POINT_SECTION_COUNT = 12;
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

function setSpecialistMessage(text, isError = false, variant = 'info') {
  const message = document.getElementById('specialist-message');
  if (!message) {
    return;
  }
  const prefix = isError ? 'Помилка' : variant === 'success' ? 'Готово' : 'Статус';
  message.textContent = `${prefix}: ${text}`;
  message.classList.remove('is-error', 'is-success');
  if (isError) {
    message.classList.add('is-error');
  } else if (variant === 'success') {
    message.classList.add('is-success');
  }
}

function setSpecialistSuccess(text) {
  setSpecialistMessage(text, false, 'success');
}

function setSpecialistGuide(action) {
  const guide = document.getElementById('specialist-action-guide');
  if (!guide) return;
  const hints = {
    menu: 'Оберіть режим роботи. Після кожної дії знизу зʼявиться статус результату.',
    dashboard: 'Огляд: перевіряйте маршрути/точки, відкривайте потрібний обʼєкт і переходьте до редагування.',
    'add-point': 'Додавання точки: заповніть назву, тип, координати, головне фото та за потреби додайте розділи з фото.',
    'edit-point': 'Редагування точки: виберіть точку зі списку, змініть дані, фото або розділи та натисніть «Зберегти точку».',
    'route-editor': 'Маршрути: оберіть існуючий маршрут або створіть новий, додайте точки, збережіть або видаліть.',
    'news-editor': 'Новини: створюйте новини з коротким описом і посиланням, або редагуйте/видаляйте існуючі.',
  };
  guide.textContent = hints[action] || hints.menu;
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

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function makePointSectionMarkup(section = {}, idx = 0) {
  const title = escapeHtml(section.title || '');
  const description = escapeHtml(section.description || '');
  const photoUrl = escapeHtml(section.photoUrl || '');
  const previewStyle = photoUrl ? ` style="background-image:url('${photoUrl}');"` : '';
  return `
    <article class="point-section-item" data-section-index="${idx}">
      <div class="point-section-head">
        <div class="t-data text-muted">Розділ ${idx + 1}</div>
        <button class="btn-flat" type="button" data-action="remove-point-section">Видалити</button>
      </div>
      <input type="text" data-field="title" placeholder="Короткий заголовок" value="${title}" />
      <textarea data-field="description" placeholder="Опис розділу">${description}</textarea>
      <div class="point-section-grid">
        <input type="file" data-field="photo-file" accept="image/*" />
        <input type="text" data-field="photo-url" placeholder="URL фото (опційно)" value="${photoUrl}" />
      </div>
      <div class="point-section-preview"${previewStyle}></div>
    </article>
  `;
}

function updateSectionPreview(item) {
  if (!item) return;
  const preview = item.querySelector('.point-section-preview');
  const urlInput = item.querySelector('[data-field="photo-url"]');
  if (!preview || !urlInput) return;
  const url = (urlInput.value || '').trim();
  preview.style.backgroundImage = url ? `url('${url}')` : '';
}

function renumberPointSections(listEl) {
  if (!listEl) return;
  listEl.querySelectorAll('.point-section-item').forEach((item, idx) => {
    item.dataset.sectionIndex = String(idx);
    const label = item.querySelector('.point-section-head .t-data');
    if (label) label.textContent = `Розділ ${idx + 1}`;
  });
}

function renderPointSectionsEditor(listEl, sections = []) {
  if (!listEl) return;
  const rows = sections.length ? sections : [{}];
  listEl.innerHTML = rows.slice(0, MAX_POINT_SECTION_COUNT).map((section, idx) => makePointSectionMarkup(section, idx)).join('');
  renumberPointSections(listEl);
}

function bindPointSectionsEditor(listEl, addBtn) {
  if (!listEl) return;
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const count = listEl.querySelectorAll('.point-section-item').length;
      if (count >= MAX_POINT_SECTION_COUNT) {
        setSpecialistMessage(`Максимум ${MAX_POINT_SECTION_COUNT} розділів`, true);
        return;
      }
      listEl.insertAdjacentHTML('beforeend', makePointSectionMarkup({}, count));
      renumberPointSections(listEl);
    });
  }
  listEl.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('button[data-action="remove-point-section"]');
    if (!removeBtn) return;
    const item = removeBtn.closest('.point-section-item');
    if (!item) return;
    item.remove();
    if (!listEl.querySelector('.point-section-item')) {
      listEl.insertAdjacentHTML('beforeend', makePointSectionMarkup({}, 0));
    }
    renumberPointSections(listEl);
  });
  listEl.addEventListener('input', (e) => {
    if (e.target.matches('[data-field="photo-url"]')) {
      updateSectionPreview(e.target.closest('.point-section-item'));
    }
  });
}

async function collectPointSectionsPayload(listEl) {
  if (!listEl) return [];
  const rows = Array.from(listEl.querySelectorAll('.point-section-item'));
  const sections = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const title = row.querySelector('[data-field="title"]')?.value?.trim() || '';
    const description = row.querySelector('[data-field="description"]')?.value?.trim() || '';
    let photoUrl = row.querySelector('[data-field="photo-url"]')?.value?.trim() || '';
    const file = row.querySelector('[data-field="photo-file"]')?.files?.[0];

    if (photoUrl && !isValidHttpUrl(photoUrl)) {
      throw new Error(`Розділ ${i + 1}: URL фото має починатися з http:// або https://`);
    }
    if (file) {
      if (!file.type.startsWith('image/')) {
        throw new Error(`Розділ ${i + 1}: файл має бути зображенням`);
      }
      if (file.size > 8 * 1024 * 1024) {
        throw new Error(`Розділ ${i + 1}: фото завелике (макс 8MB)`);
      }
      photoUrl = await dataService.uploadPointPhoto(file);
    }

    if (!title && !description && !photoUrl) continue;
    sections.push({ title, description, photoUrl: photoUrl || null });
  }
  return sections;
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
  const actionSelect = document.getElementById('specialist-action-select');
  if (actionSelect && actionSelect.value !== action) {
    actionSelect.value = action;
  }
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
  setSpecialistGuide(action);

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
  const undoBtn = document.getElementById('btn-undo-route-order');
  if (undoBtn) {
    undoBtn.style.display = routeOrderHistory.length ? '' : 'none';
  }

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
  syncEditorActionButtons();
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
        <div class="news-cover" style="background: ${
          item.imageUrl
            ? `url('${item.imageUrl}') center/cover`
            : 'linear-gradient(120deg, rgba(11,37,69,0.18), rgba(197,160,89,0.2))'
        };"></div>
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

  if (currentSpecialistAction === 'route-editor' && editingRouteId && !routeEditorPoints.length) {
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
    if (!canEdit) {
      panel.classList.remove('collapsed');
      panel.style.display = '';
      const btnHideSpecialist = document.getElementById('btn-hide-specialist');
      if (btnHideSpecialist) btnHideSpecialist.textContent = '⟨';
    }
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
  const actionSelect = document.getElementById('specialist-action-select');
  const backButton = document.getElementById('btn-specialist-back');
  const actionMessages = {
    dashboard: 'Відкрито панель огляду',
    'add-point': 'Режим: додавання точки',
    'edit-point': 'Режим: редагування точки',
    'route-editor': 'Режим: редактор маршрутів',
    'news-editor': 'Режим: редактор новин',
  };

  const openAction = (action) => {
    if (!action) return;
    setActiveSpecialistTab(action);
    if (action === 'edit-point' && !editingPointId) {
      setSpecialistMessage('Оберіть точку зі списку');
    } else if (actionMessages[action]) {
      setSpecialistMessage(actionMessages[action]);
    }
  };

  if (actionSelect) {
    actionSelect.addEventListener('change', () => openAction(actionSelect.value));
  } else if (actionButtons.length) {
    actionButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        openAction(btn.getAttribute('data-specialist-action'));
      });
    });
  }

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
  syncEditorActionButtons();
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
  syncEditorActionButtons();
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
  renderPointSectionsEditor(document.getElementById('edit-point-sections-list'), point.sections || []);
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
  const imageUrl = document.getElementById('news-image-url-input');
  const select = document.getElementById('news-edit-select');
  if (title) title.value = '';
  if (summary) summary.value = '';
  if (link) link.value = '';
  if (imageUrl) imageUrl.value = '';
  if (select) select.value = '';
  syncEditorActionButtons();
}

function openNewsInEditor(newsId) {
  const news = dashboardNews.find((n) => n.id === Number(newsId));
  if (!news) return;
  editingNewsId = news.id;
  const title = document.getElementById('news-title-input');
  const summary = document.getElementById('news-summary-input');
  const link = document.getElementById('news-link-input');
  const imageUrl = document.getElementById('news-image-url-input');
  const select = document.getElementById('news-edit-select');
  if (title) title.value = news.title || '';
  if (summary) summary.value = news.summary || '';
  if (link) link.value = news.link || '';
  if (imageUrl) imageUrl.value = news.imageUrl || '';
  if (select) select.value = String(news.id);
  setActiveSpecialistTab('news-editor');
  setSpecialistMessage(`Редагування новини: ${news.title}`);
  syncEditorActionButtons();
}

function syncEditorActionButtons() {
  const btnCreateRoute = document.getElementById('btn-create-route');
  const btnSaveRoute = document.getElementById('btn-save-route');
  const btnDeleteRoute = document.getElementById('btn-delete-route');
  if (btnCreateRoute && btnSaveRoute) {
    btnCreateRoute.style.display = editingRouteId ? 'none' : '';
    btnSaveRoute.style.display = editingRouteId ? '' : 'none';
  }
  if (btnDeleteRoute) {
    btnDeleteRoute.style.display = editingRouteId ? '' : 'none';
  }

  const btnCreateNews = document.getElementById('btn-create-news');
  const btnSaveNews = document.getElementById('btn-save-news');
  const btnDeleteNews = document.getElementById('btn-delete-news');
  if (btnCreateNews && btnSaveNews && btnDeleteNews) {
    const editMode = Boolean(editingNewsId);
    btnCreateNews.style.display = editMode ? 'none' : '';
    btnSaveNews.style.display = editMode ? '' : 'none';
    btnDeleteNews.style.display = editMode ? '' : 'none';
  }
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
        setSpecialistSuccess('Статус маршруту оновлено');
      }

      if (action === 'set-route-status') {
        await apiRequest(`/api/routes/${Number(routeId)}`, {
          method: 'PUT',
          body: JSON.stringify({ status: button.dataset.status }),
        });
        await refreshDashboardData();
        setSpecialistSuccess('Маршрут перенесено в новий статус');
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
        setSpecialistSuccess('Сесію завершено');
        return;
      }
      clearAuthError();
      setFilterMenuHidden(true);
      authView.style.display = 'flex';
      if (window.gsap) {
        gsap.fromTo(
          authView,
          { opacity: 0, backdropFilter: 'blur(0px)' },
          { opacity: 1, backdropFilter: 'blur(6px)', duration: 0.26, ease: 'power2.out' }
        );
        gsap.fromTo(
          authView.querySelector('.auth-card'),
          { y: 40, opacity: 0, filter: 'blur(6px)' },
          { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.3, ease: 'power2.out', delay: 0.03 }
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
            duration: 0.22,
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
        setSpecialistSuccess(`Вхід виконано: ${data.user.fullName}`);
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
      setSpecialistSuccess('Сесію завершено');
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

    document.addEventListener('click', (e) => {
      if (!filterMenu.contains(e.target)) {
        filterMenu.classList.remove('active');
      }
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

function bindFloatingUiControls() {
  const filterMenu = document.getElementById('filter-menu');
  const specialistPanel = document.getElementById('specialist-panel');
  const btnHideSpecialist = document.getElementById('btn-hide-specialist');
  const legendWrap = document.getElementById('map-legend-wrap');
  const btnToggleLegend = document.getElementById('btn-toggle-legend');
  const btnMapFullscreen = document.getElementById('btn-map-fullscreen');
  const mapContainer = document.querySelector('.map-container');

  if (btnHideSpecialist && specialistPanel) {
    btnHideSpecialist.addEventListener('click', () => {
      const isCollapsed = specialistPanel.classList.toggle('collapsed');
      btnHideSpecialist.textContent = isCollapsed ? '⟩' : '⟨';
    });
  }

  if (btnToggleLegend && legendWrap) {
    btnToggleLegend.addEventListener('click', () => {
      const isCollapsed = legendWrap.classList.toggle('collapsed');
      btnToggleLegend.textContent = isCollapsed ? '⟩' : '⟨';
    });
  }

  const syncFloatingByScroll = () => {
    if (!mapContainer) return;
    const rect = mapContainer.getBoundingClientRect();
    const mapVisible = rect.bottom > 120 && rect.top < window.innerHeight - 80;
    if (!mapVisible) {
      if (filterMenu) filterMenu.style.display = 'none';
      if (legendWrap) legendWrap.style.display = 'none';
      if (btnMapFullscreen) btnMapFullscreen.style.display = 'none';
      if (specialistPanel?.classList.contains('active')) {
        specialistPanel.style.display = 'none';
      }
      return;
    }
    if (filterMenu) filterMenu.style.display = '';
    if (legendWrap) legendWrap.style.display = '';
    if (btnMapFullscreen) btnMapFullscreen.style.display = '';
    if (specialistPanel?.classList.contains('active')) {
      specialistPanel.style.display = 'flex';
    }
  };

  window.addEventListener('scroll', syncFloatingByScroll, { passive: true });
  window.addEventListener('resize', syncFloatingByScroll);
  syncFloatingByScroll();
}

function bindSpecialistTools() {
  const btnPickOnMap = document.getElementById('btn-pick-on-map');
  const btnCreatePoint = document.getElementById('btn-create-point');
  const btnCreateRoute = document.getElementById('btn-create-route');
  const btnSaveRoute = document.getElementById('btn-save-route');
  const btnDeleteRoute = document.getElementById('btn-delete-route');
  const btnNewRoute = document.getElementById('btn-new-route');
  const routeEditSelect = document.getElementById('route-edit-select');
  const btnAddRoutePoint = document.getElementById('btn-add-route-point');
  const btnSavePoint = document.getElementById('btn-save-point');
  const btnDeletePoint = document.getElementById('btn-delete-point');
  const btnUndoRouteOrder = document.getElementById('btn-undo-route-order');
  const btnCreateNews = document.getElementById('btn-create-news');
  const btnSaveNews = document.getElementById('btn-save-news');
  const btnDeleteNews = document.getElementById('btn-delete-news');
  const newsEditSelect = document.getElementById('news-edit-select');
  const btnNewNews = document.getElementById('btn-new-news');
  const editPointSelect = document.getElementById('edit-point-select');
  const btnMapFullscreen = document.getElementById('btn-map-fullscreen');
  const pointSectionsList = document.getElementById('point-sections-list');
  const editPointSectionsList = document.getElementById('edit-point-sections-list');
  const btnAddPointSection = document.getElementById('btn-add-point-section');
  const btnAddEditPointSection = document.getElementById('btn-add-edit-point-section');

  renderPointSectionsEditor(pointSectionsList, []);
  renderPointSectionsEditor(editPointSectionsList, []);
  bindPointSectionsEditor(pointSectionsList, btnAddPointSection);
  bindPointSectionsEditor(editPointSectionsList, btnAddEditPointSection);

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
        setSpecialistSuccess('Координати вибрано');
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
      setSpecialistSuccess('Останню зміну скасовано');
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
            if (!pointPhotoFile.type.startsWith('image/')) {
              setSpecialistMessage('Файл фото має бути зображенням', true);
              return;
            }
            if (pointPhotoFile.size > 8 * 1024 * 1024) {
              setSpecialistMessage('Фото завелике (макс 8MB)', true);
              return;
            }
            try {
              payload.photoUrl = await dataService.uploadPointPhoto(pointPhotoFile);
            } catch (uploadError) {
              setSpecialistMessage(`Фото не завантажено: ${uploadError.message}`, true);
              return;
            }
          }
          payload.sections = await collectPointSectionsPayload(pointSectionsList);
          await apiRequest('/api/points', { method: 'POST', body: JSON.stringify(payload) });
          await mapController.refresh();
          await refreshDashboardData();
          document.getElementById('point-title').value = '';
          document.getElementById('point-lat').value = '';
          document.getElementById('point-lng').value = '';
          document.getElementById('point-district').value = '';
          document.getElementById('point-description').value = '';
          document.getElementById('point-photo-url').value = '';
          document.getElementById('point-photo-file').value = '';
          document.getElementById('point-certified').checked = false;
          renderPointSectionsEditor(pointSectionsList, []);
          setSpecialistSuccess('Точку додано');
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
          setSpecialistSuccess('Маршрут створено');
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
          setSpecialistSuccess('Маршрут оновлено');
          saveUiState();
        } catch (error) {
          setSpecialistMessage(error.message, true);
        }
      });
    });
  }

  if (routeEditSelect) {
    routeEditSelect.addEventListener('change', () => {
      const routeId = Number(routeEditSelect.value);
      if (!routeId) {
        resetRouteEditor();
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
            if (!pointPhotoFile.type.startsWith('image/')) {
              setSpecialistMessage('Файл фото має бути зображенням', true);
              return;
            }
            if (pointPhotoFile.size > 8 * 1024 * 1024) {
              setSpecialistMessage('Фото завелике (макс 8MB)', true);
              return;
            }
            try {
              payload.photoUrl = await dataService.uploadPointPhoto(pointPhotoFile);
            } catch (uploadError) {
              setSpecialistMessage(`Фото не завантажено: ${uploadError.message}`, true);
              return;
            }
          }
          if (!payload.photoUrl && existingPoint?.photoUrl) {
            try {
              await dataService.deletePointPhoto(existingPoint.photoUrl);
            } catch (_e) {
              // no-op, point will still be updated without photo
            }
          }
          payload.sections = await collectPointSectionsPayload(editPointSectionsList);
          await apiRequest(`/api/points/${editingPointId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          });
          const removedSectionPhotos = (existingPoint?.sections || [])
            .map((section) => section.photoUrl)
            .filter(Boolean)
            .filter((url) => !payload.sections.some((next) => next.photoUrl === url));
          for (const url of removedSectionPhotos) {
            try {
              await dataService.deletePointPhoto(url);
            } catch (_e) {
              // ignore storage cleanup errors
            }
          }
          await mapController.refresh();
          await refreshDashboardData();
          openPointInEditor(editingPointId);
          setSpecialistSuccess('Точку оновлено');
        } catch (error) {
          setSpecialistMessage(error.message, true);
        }
      });
    });
  }

  if (editPointSelect) {
    editPointSelect.addEventListener('change', () => {
      const pointId = Number(editPointSelect.value);
      if (!pointId) {
        editingPointId = null;
        document.getElementById('edit-point-title').value = '';
        document.getElementById('edit-point-type').value = pointTypes[0]?.code || '';
        document.getElementById('edit-point-district').value = '';
        document.getElementById('edit-point-description').value = '';
        document.getElementById('edit-point-photo-url').value = '';
        document.getElementById('edit-point-certified').checked = false;
        renderPointSectionsEditor(editPointSectionsList, []);
        return;
      }
      openPointInEditor(pointId);
    });
  }

  if (btnDeletePoint) {
    btnDeletePoint.addEventListener('click', async () => {
      if (!editingPointId) {
        setSpecialistMessage('Оберіть точку для видалення', true);
        return;
      }
      const point = dashboardPoints.find((p) => p.id === editingPointId);
      const ok = window.confirm(
        `Видалити точку "${point?.title || editingPointId}"? Цю дію не можна скасувати.`
      );
      if (!ok) return;

      await runWithButtonState(btnDeletePoint, 'Видалення...', async () => {
        try {
          const prevAction = currentSpecialistAction;
          if (point?.photoUrl) {
            try {
              await dataService.deletePointPhoto(point.photoUrl);
            } catch (_e) {
              // ignore storage delete failure, continue DB delete
            }
          }
          await apiRequest(`/api/points/${editingPointId}`, { method: 'DELETE' });
          editingPointId = null;
          document.getElementById('edit-point-title').value = '';
          document.getElementById('edit-point-type').value = pointTypes[0]?.code || '';
          document.getElementById('edit-point-district').value = '';
          document.getElementById('edit-point-description').value = '';
          document.getElementById('edit-point-photo-url').value = '';
          document.getElementById('edit-point-certified').checked = false;
          document.getElementById('edit-point-photo-file').value = '';
          renderPointSectionsEditor(editPointSectionsList, []);
          await mapController.refresh();
          await refreshDashboardData();
          setActiveSpecialistTab(prevAction || 'edit-point');
          setSpecialistSuccess('Точку видалено');
        } catch (error) {
          setSpecialistMessage(error.message, true);
        }
      });
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
        imageUrl: document.getElementById('news-image-url-input').value.trim() || null,
      };

      if (!payload.title || !payload.summary) {
        setSpecialistMessage('Заповніть заголовок і опис новини', true);
        return;
      }
      if (!isValidHttpUrl(payload.link)) {
        setSpecialistMessage('Посилання новини має бути http:// або https://', true);
        return;
      }
      if (!isValidHttpUrl(payload.imageUrl)) {
        setSpecialistMessage('URL картинки новини має бути http:// або https://', true);
        return;
      }

      await runWithButtonState(btnCreateNews, 'Публікація...', async () => {
        try {
          await apiRequest('/api/news', { method: 'POST', body: JSON.stringify(payload) });
          resetNewsEditor();
          await refreshDashboardData();
          setSpecialistSuccess('Новину додано');
        } catch (error) {
          setSpecialistMessage(error.message, true);
        }
      });
    });
  }

  if (newsEditSelect) {
    newsEditSelect.addEventListener('change', () => {
      const newsId = Number(newsEditSelect.value);
      if (!newsId) {
        resetNewsEditor();
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
        imageUrl: document.getElementById('news-image-url-input').value.trim() || null,
      };
      if (!payload.title || !payload.summary) {
        setSpecialistMessage('Заповніть заголовок і опис новини', true);
        return;
      }
      if (!isValidHttpUrl(payload.link)) {
        setSpecialistMessage('Посилання новини має бути http:// або https://', true);
        return;
      }
      if (!isValidHttpUrl(payload.imageUrl)) {
        setSpecialistMessage('URL картинки новини має бути http:// або https://', true);
        return;
      }
      await runWithButtonState(btnSaveNews, 'Оновлення...', async () => {
        try {
          await apiRequest(`/api/news/${editingNewsId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          });
          await refreshDashboardData();
          setSpecialistSuccess('Новину оновлено');
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
          setSpecialistSuccess('Новину видалено');
        } catch (error) {
          setSpecialistMessage(error.message, true);
        }
      });
    });
  }

  if (btnDeleteRoute) {
    btnDeleteRoute.addEventListener('click', async () => {
      if (!editingRouteId) {
        setSpecialistMessage('Оберіть маршрут для видалення', true);
        return;
      }
      const route = dashboardRoutes.find((r) => r.id === editingRouteId);
      const ok = window.confirm(
        `Видалити маршрут "${route?.name || editingRouteId}"? Цю дію не можна скасувати.`
      );
      if (!ok) return;
      await runWithButtonState(btnDeleteRoute, 'Видалення...', async () => {
        try {
          await apiRequest(`/api/routes/${editingRouteId}`, { method: 'DELETE' });
          resetRouteEditor();
          await refreshDashboardData();
          setSpecialistSuccess('Маршрут видалено');
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
    bindFloatingUiControls();
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
    // Prevent residual page scroll from moving map viewport on touch devices.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const finishTransition = async () => {
      heroSection.style.display = 'none';
      appInterface.style.display = 'flex';
      appInterface.style.opacity = '1';
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;

      if (window.gsap) {
        gsap.to(appInterface, { opacity: 1, duration: 0.22, ease: 'power2.out' });
        gsap.from('.header, .filter-menu', {
          y: -10,
          opacity: 0,
          duration: 0.24,
          stagger: 0.04,
          ease: 'power2.out',
        });
      }

      try {
        await initMapAndTools();
        window.dispatchEvent(new Event('resize'));
        // Extra refresh passes prevent occasional marker drop after first transition.
        await mapController?.refresh?.();
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
          mapController?.refresh?.().catch(() => null);
        }, 260);
      } finally {
        isTransitioning = false;
      }
    };

    if (window.gsap) {
      gsap.to('.hero', {
        opacity: 0,
        y: -30,
        duration: 0.24,
        ease: 'power2.out',
        onComplete: finishTransition,
      });
    } else {
      heroSection.style.opacity = '0';
      heroSection.style.transform = 'translateY(-20px)';
      setTimeout(() => {
        finishTransition().catch(() => {
          isTransitioning = false;
        });
      }, 180);
    }
  };

  if (btnEnter) {
    btnEnter.addEventListener('click', (event) => {
      event.preventDefault();
      transitionToMap();
    });

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
          e.preventDefault?.();
          transitionToMap();
        }
      },
      { passive: false }
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
        duration: 0.26,
        ease: 'power2.out',
        onComplete: () => {
          partnerPanel.style.display = 'none';
          btnShowPartners.style.display = 'block';
          gsap.fromTo(
            btnShowPartners,
            { opacity: 0, y: 10 },
            { opacity: 1, y: 0, duration: 0.24, ease: 'power2.out' }
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
        { y: 0, opacity: 1, scale: 1, duration: 0.26, ease: 'power2.out' }
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
