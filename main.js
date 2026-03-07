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
let authSession = (() => {
  try {
    const raw = localStorage.getItem('odesaAuthSession') || '';
    return raw ? JSON.parse(raw) : null;
  } catch (_e) {
    return null;
  }
})();
let mapController = null;

let dashboardPoints = [];
let dashboardRoutes = [];
let dashboardNews = [];
let dashboardProposals = [];
let pointTypes = [];
let editingRouteId = null;
let editingPointId = null;
let editingPointPosition = null;
let editingNewsId = null;
let routeEditorPoints = [];
let routeOrderHistory = [];
let routeSearchTerm = '';
let pointSearchTerm = '';
let routePage = 1;
let pointPage = 1;
let newsPage = 1;
let proposalPage = 1;
const PAGE_SIZE = 5;
const NEWS_PAGE_SIZE = 4;
const PROPOSAL_PAGE_SIZE = 5;
const UI_STATE_KEY = 'odesaSpecialistUiState';
let selectedDistrict = '';
let selectedCommunity = '';
let currentSpecialistAction = 'menu';
let legendPointsSyncBound = false;
const hiddenPointTypeCodes = new Set();
const MAX_POINT_SECTION_COUNT = 12;
const ROUTE_COLOR_KEY = 'odesaRouteColors';
const DEFAULT_ROUTE_COLOR = '#E7C769';
const DEFAULT_NEWS_IMAGE_FOCUS_Y = 50;
const ODESA_START_FOCUS = { lat: 46.4825, lng: 30.7233, zoom: 12 };
const MARKER_FILES = [
  'адміністрація.svg',
  'азс.svg',
  'аптека.svg',
  'банк.svg',
  'вокзал.svg',
  'готель.svg',
  'житло.svg',
  'зупинка А.svg',
  'зупинка П.svg',
  'зупинка Т.svg',
  'кафе.svg',
  'культура.svg',
  'майданчик.svg',
  'мед заклад.svg',
  'навчал заклад.svg',
  'парк.svg',
  'перукарня.svg',
  'пошта.svg',
  'пішохідний перехід.svg',
  'ресторан.svg',
  'соціальні послуги.svg',
  'спорт.svg',
  'укриття.svg',
];
const MARKER_URL_BY_FILE = Object.fromEntries(
  MARKER_FILES.map((fileName) => [fileName, `/markers/${encodeURIComponent(fileName)}`])
);
const CANONICAL_POINT_TYPES = [
  { code: 'school', labelUk: 'Школа', labelEn: 'School', color: '#1D4ED8', markerFile: 'навчал заклад.svg' },
  { code: 'housing', labelUk: 'Житло', labelEn: 'Housing', color: '#2B6CB0', markerFile: 'житло.svg' },
  { code: 'cafe', labelUk: 'Кафе', labelEn: 'Cafe', color: '#A16207', markerFile: 'кафе.svg' },
  { code: 'restaurant', labelUk: 'Ресторан', labelEn: 'Restaurant', color: '#9A3412', markerFile: 'ресторан.svg' },
  {
    code: 'administration',
    labelUk: 'Адміністрація',
    labelEn: 'Administration',
    color: '#13315C',
    markerFile: 'адміністрація.svg',
  },
  {
    code: 'social_services',
    labelUk: 'Соціальні послуги',
    labelEn: 'Social Services',
    color: '#1E3A8A',
    markerFile: 'соціальні послуги.svg',
  },
  { code: 'shelter', labelUk: 'Укриття', labelEn: 'Shelter', color: '#334155', markerFile: 'укриття.svg' },
  { code: 'medical', labelUk: 'Мед заклад', labelEn: 'Medical', color: '#BE123C', markerFile: 'мед заклад.svg' },
  { code: 'pharmacy', labelUk: 'Аптека', labelEn: 'Pharmacy', color: '#B12B2B', markerFile: 'аптека.svg' },
  { code: 'education', labelUk: 'Освіта', labelEn: 'Education', color: '#1D4ED8', markerFile: 'навчал заклад.svg' },
  { code: 'sport', labelUk: 'Спорт', labelEn: 'Sport', color: '#166534', markerFile: 'спорт.svg' },
  { code: 'culture', labelUk: 'Культура', labelEn: 'Culture', color: '#6D28D9', markerFile: 'культура.svg' },
  {
    code: 'hairdresser',
    labelUk: 'Перукарня',
    labelEn: 'Hairdresser',
    color: '#7E22CE',
    markerFile: 'перукарня.svg',
  },
  { code: 'station', labelUk: 'Вокзал', labelEn: 'Station', color: '#2C7A7B', markerFile: 'вокзал.svg' },
  {
    code: 'transport_stop',
    labelUk: 'Транспортна зупинка',
    labelEn: 'Transport Stop',
    color: '#7C2D12',
    markerFile: 'зупинка Т.svg',
  },
  { code: 'bank', labelUk: 'Банк', labelEn: 'Bank', color: '#C5A059', markerFile: 'банк.svg' },
  { code: 'post', labelUk: 'Пошта', labelEn: 'Post', color: '#0E7490', markerFile: 'пошта.svg' },
  { code: 'fuel_station', labelUk: 'АЗС', labelEn: 'Fuel Station', color: '#0B2545', markerFile: 'азс.svg' },
  { code: 'street', labelUk: 'Вулиці', labelEn: 'Street', color: '#3D5263', markerFile: 'пішохідний перехід.svg' },
  { code: 'square', labelUk: 'Площі', labelEn: 'Square', color: '#3D5263', markerFile: 'пішохідний перехід.svg' },
  { code: 'park', labelUk: 'Парк', labelEn: 'Park', color: '#15803D', markerFile: 'парк.svg' },
  { code: 'playground', labelUk: 'Дитячий майданчик', labelEn: 'Playground', color: '#0369A1', markerFile: 'майданчик.svg' },
  { code: 'hotel', labelUk: 'Готель', labelEn: 'Hotel', color: '#2B6CB0', markerFile: 'готель.svg' },
  { code: 'other', labelUk: 'Інше', labelEn: 'Other', color: '#64748B', markerFile: 'соціальні послуги.svg' },
];
const POINT_TYPE_META_BY_CODE = new Map(CANONICAL_POINT_TYPES.map((pt) => [pt.code, pt]));
const LEGACY_POINT_TYPE_ALIAS = {
  ramp: 'social_services',
  elevator: 'social_services',
  toilet: 'medical',
  parking: 'fuel_station',
  entrance: 'administration',
  crossing: 'street',
  stop_a: 'transport_stop',
  stop_p: 'transport_stop',
  stop_t: 'transport_stop',
  transport_stop: 'transport_stop',
};
const POINT_TYPE_MARKER_FILE = {
  ...Object.fromEntries(CANONICAL_POINT_TYPES.map((pt) => [pt.code, pt.markerFile])),
  // Legacy aliases for datasets/backups.
  ...Object.fromEntries(
    Object.entries(LEGACY_POINT_TYPE_ALIAS).map(([legacyCode, canonicalCode]) => [
      legacyCode,
      POINT_TYPE_META_BY_CODE.get(canonicalCode)?.markerFile || 'соціальні послуги.svg',
    ])
  ),
};
const DEFAULT_POINT_MARKER_FILE = 'соціальні послуги.svg';
const dashboardBlockIds = [
  'dashboard-kpi-block',
  'dashboard-routes-block',
  'dashboard-review-block',
  'dashboard-points-block',
  'dashboard-activity-block',
  'dashboard-proposals-block',
];
const editorActionToBlockId = {
  'add-point': 'editor-add-point-block',
  'route-editor': 'editor-route-block',
  'edit-point': 'editor-edit-point-block',
  'news-editor': 'editor-news-block',
};

function loadRouteColors() {
  try {
    return JSON.parse(localStorage.getItem(ROUTE_COLOR_KEY) || '{}') || {};
  } catch (_e) {
    return {};
  }
}

function saveRouteColors(map) {
  localStorage.setItem(ROUTE_COLOR_KEY, JSON.stringify(map || {}));
}

function getRouteColor(routeId) {
  const colors = loadRouteColors();
  return colors[String(routeId)] || DEFAULT_ROUTE_COLOR;
}

function setRouteColor(routeId, color) {
  if (!routeId || !color) return;
  const colors = loadRouteColors();
  colors[String(routeId)] = color;
  saveRouteColors(colors);
}

function deleteRouteColor(routeId) {
  if (!routeId) return;
  const colors = loadRouteColors();
  delete colors[String(routeId)];
  saveRouteColors(colors);
}

function normalizeTransportModes(value) {
  const allowed = new Set(['bus', 'tram', 'car']);
  if (!Array.isArray(value)) return [];
  const result = [];
  value.forEach((mode) => {
    const normalized = String(mode || '').trim().toLowerCase();
    if (!allowed.has(normalized)) return;
    if (!result.includes(normalized)) result.push(normalized);
  });
  return result;
}

function collectSelectedRouteTransportModes() {
  return normalizeTransportModes(
    Array.from(document.querySelectorAll('input[data-route-transport]:checked')).map((el) => el.value)
  );
}

function setSelectedRouteTransportModes(modes = []) {
  const normalized = new Set(normalizeTransportModes(modes));
  document.querySelectorAll('input[data-route-transport]').forEach((el) => {
    el.checked = normalized.has(String(el.value || '').trim().toLowerCase());
  });
}

function formatRouteTransportModes(modes = []) {
  const labels = {
    bus: 'Автобус',
    tram: 'Трамвай',
    car: 'Авто',
  };
  const normalized = normalizeTransportModes(modes);
  if (!normalized.length) return 'Без класифікатора';
  return normalized.map((mode) => labels[mode] || mode).join(', ');
}

function resolvePointTypeMarkerFile(pointTypeCode) {
  const rawCode = String(pointTypeCode || '').trim();
  const normalizedCode = LEGACY_POINT_TYPE_ALIAS[rawCode] || rawCode;
  return POINT_TYPE_MARKER_FILE[normalizedCode] || DEFAULT_POINT_MARKER_FILE;
}

function resolvePointTypeMarkerUrl(pointTypeCode) {
  const fileName = resolvePointTypeMarkerFile(pointTypeCode);
  return MARKER_URL_BY_FILE[fileName] || MARKER_URL_BY_FILE[DEFAULT_POINT_MARKER_FILE];
}

function prettifyPointTypeCode(code) {
  const raw = String(code || '').trim();
  if (!raw) return 'Невідомий тип';
  return raw
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function getPointTypeLabelByCode(code) {
  const normalizedCode = LEGACY_POINT_TYPE_ALIAS[String(code || '').trim()] || String(code || '').trim();
  const found = pointTypes.find((pt) => String(pt.code) === normalizedCode);
  const canonical = POINT_TYPE_META_BY_CODE.get(normalizedCode);
  if (canonical?.labelUk) return canonical.labelUk;
  return found?.labelUk || prettifyPointTypeCode(code);
}

function inferPointTypeCodeFromText(textValue) {
  const text = String(textValue || '').toLowerCase();
  if (!text) return null;
  if (/(школ|ліцей|гімназ|school)/i.test(text)) return 'school';
  if (/(садок|освіт|універс|інститут|коледж)/i.test(text)) return 'education';
  if (/(аптек)/i.test(text)) return 'pharmacy';
  if (/(лікар|мед(заклад|центр|пункт|ична)?|поліклін|амбулатор|клінік)/i.test(text)) return 'medical';
  if (/(кафе|coffee|кав[’'` ]?яр)/i.test(text)) return 'cafe';
  if (/(ресторан|їдальн|food|foodcourt)/i.test(text)) return 'restaurant';
  if (/(перукар|barber|салон)/i.test(text)) return 'hairdresser';
  if (/(вокзал|станц|автостанц|порт|аеропорт)/i.test(text)) return 'station';
  if (/(зупинк|трамва|тролейб|автобус|маршрутк|метро)/i.test(text)) return 'transport_stop';
  if (/(банк|банкомат|atm)/i.test(text)) return 'bank';
  if (/(пошт|укрпошт|nova ?poshta|нова пошта)/i.test(text)) return 'post';
  if (/(азс|заправ|палив|fuel|gas station)/i.test(text)) return 'fuel_station';
  if (/(вулиц|просп|дорог|провул|street|road)/i.test(text)) return 'street';
  if (/(площ|сквер|майдан)/i.test(text)) return 'square';
  if (/(парк|green zone|відпочин|лавк|сквер)/i.test(text)) return 'park';
  if (/(дитяч|майданч|playground)/i.test(text)) return 'playground';
  if (/(готел|hotel|хостел)/i.test(text)) return 'hotel';
  if (/(спорт|стадіон|зал|фітнес|басейн)/i.test(text)) return 'sport';
  if (/(театр|музей|культур|бібліот|опера)/i.test(text)) return 'culture';
  if (/(адмін|цнап|рада|держ|муніцип)/i.test(text)) return 'administration';
  if (/(укрит|сховище|бомбосхов)/i.test(text)) return 'shelter';
  if (/(соц|послуг|реаб|інклюз)/i.test(text)) return 'social_services';
  if (/(житл|будин|жк|квартир|osbb|осбб)/i.test(text)) return 'housing';
  return null;
}

function normalizePointTypeCode(rawCode, title = '', district = '') {
  const direct = LEGACY_POINT_TYPE_ALIAS[String(rawCode || '').trim()] || String(rawCode || '').trim();
  const known = POINT_TYPE_META_BY_CODE.has(direct) ? direct : null;
  if (known && known !== 'social_services') return known;
  const inferred = inferPointTypeCodeFromText(`${title} ${district}`);
  return inferred || known || 'other';
}

function normalizePointTypes(rows = []) {
  const canonical = CANONICAL_POINT_TYPES.map((pt, index) => ({
    id: index + 1,
    code: pt.code,
    labelUk: pt.labelUk,
    labelEn: pt.labelEn,
    color: pt.color,
  }));
  if (!Array.isArray(rows) || !rows.length) return canonical;
  const rowByCode = new Map(
    rows.map((row) => [
      normalizePointTypeCode(row?.code, row?.labelUk || row?.label_uk || '', ''),
      row,
    ])
  );
  return canonical.map((pt) => {
    const source = rowByCode.get(pt.code);
    return {
      id: source?.id || pt.id,
      code: pt.code,
      labelUk: pt.labelUk,
      labelEn: pt.labelEn,
      color: pt.color,
    };
  });
}

function normalizePointRecord(point) {
  if (!point) return point;
  const normalizedCode = normalizePointTypeCode(point?.pointType?.code, point?.title, point?.district);
  const meta = POINT_TYPE_META_BY_CODE.get(normalizedCode) || POINT_TYPE_META_BY_CODE.get('other');
  return {
    ...point,
    pointType: {
      ...(point.pointType || {}),
      code: normalizedCode,
      labelUk: meta.labelUk,
      labelEn: meta.labelEn,
      color: meta.color,
    },
  };
}

function renderTypePreview(selectId, previewId) {
  const selectEl = document.getElementById(selectId);
  const previewEl = document.getElementById(previewId);
  if (!selectEl || !previewEl) return;

  const selectedCode = selectEl.value;
  if (!selectedCode) {
    previewEl.innerHTML = '<span class="t-data text-muted">Оберіть тип точки</span>';
    return;
  }

  const markerUrl = resolvePointTypeMarkerUrl(selectedCode);
  const label = getPointTypeLabelByCode(selectedCode);
  previewEl.innerHTML = `
    <span class="legend-marker" style="--legend-color:${POINT_TYPE_META_BY_CODE.get(selectedCode)?.color || '#3D5263'}">
      <img
        src="${markerUrl}"
        alt="${label}"
        loading="lazy"
        decoding="async"
        onerror="this.style.display='none'; this.parentElement && this.parentElement.classList.add('is-image-broken');"
      />
    </span>
    <span class="t-body">${label}</span>
  `;
}

const photoPreviewObjectUrls = new Map();

function clearPhotoPreviewObjectUrl(previewId) {
  const prev = photoPreviewObjectUrls.get(previewId);
  if (prev) {
    URL.revokeObjectURL(prev);
    photoPreviewObjectUrls.delete(previewId);
  }
}

function renderPointPhotoPreview(previewId, { url = '', file = null } = {}) {
  const previewEl = document.getElementById(previewId);
  if (!previewEl) return;

  clearPhotoPreviewObjectUrl(previewId);

  let src = String(url || '').trim();
  if (file instanceof File) {
    src = URL.createObjectURL(file);
    photoPreviewObjectUrls.set(previewId, src);
  }

  if (!src) {
    previewEl.innerHTML = '<span class="t-data text-muted">Превʼю фото відсутнє</span>';
    return;
  }

  previewEl.innerHTML = `<img src="${src}" alt="Превʼю фото точки" loading="lazy" decoding="async" />`;
}

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

function normalizeGeoText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’'`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
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
        newsPage,
        proposalPage,
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
  newsPage = Number(saved.newsPage) > 0 ? Number(saved.newsPage) : 1;
  proposalPage = Number(saved.proposalPage) > 0 ? Number(saved.proposalPage) : 1;
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
  const cacheKey = `geo::v2::${district}::${community}`;
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
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&limit=1&q=${query}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data) || !data.length) return null;
    const result = {
      lat: Number(data[0].lat),
      lng: Number(data[0].lon),
      zoom: 12,
      geojson: data[0].geojson || null,
    };
    localStorage.setItem(cacheKey, JSON.stringify(result));
    return result;
  } catch (_e) {
    return null;
  }
}

async function geocodeDistrict(district) {
  const cacheKey = `geo::district::${district}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (_e) {
      localStorage.removeItem(cacheKey);
    }
  }

  try {
    const query = encodeURIComponent(`${district}, Odesa Oblast, Ukraine`);
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&limit=1&q=${query}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data) || !data.length) return null;
    const result = {
      lat: Number(data[0].lat),
      lng: Number(data[0].lon),
      zoom: 11,
      geojson: data[0].geojson || null,
    };
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

  const canUseLineTools = Boolean(authUser && ['admin', 'specialist'].includes(authUser.role));
  const showRouteLineToolbar = action === 'route-editor' && canUseLineTools;
  const routeLineToolbar = document.getElementById('route-line-toolbar');
  const mapView = document.querySelector('.map-view');
  if (routeLineToolbar) {
    if (showRouteLineToolbar) {
      routeLineToolbar.style.display = 'flex';
      requestAnimationFrame(() => routeLineToolbar.classList.remove('ui-hidden'));
    } else {
      routeLineToolbar.classList.add('ui-hidden');
      window.setTimeout(() => {
        if (!routeLineToolbar.classList.contains('ui-hidden')) return;
        routeLineToolbar.style.display = 'none';
      }, 170);
    }
  }
  if (mapView) {
    mapView.classList.toggle('route-toolbar-visible', showRouteLineToolbar);
  }
  // Do not auto-arm drawing on tab open.
  mapController?.setLineToolVisible?.(false);
  mapController?.stopPointDrag?.({ commit: false });

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

  syncRouteLineDraftFromEditor();
}

function resolveRouteEditorPointsForMap() {
  return routeEditorPoints
    .map((item) => {
      const point = dashboardPoints.find((p) => Number(p.id) === Number(item.pointId));
      if (!point) return null;
      return {
        pointId: point.id,
        title: point.title,
        lat: Number(point.lat),
        lng: Number(point.lng),
      };
    })
    .filter((point) => point && Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function syncRouteLineDraftFromEditor() {
  mapController?.setLineDraftFromPoints?.(resolveRouteEditorPointsForMap());
}

function refreshRouteSelectors() {
  const routeEditSelect = document.getElementById('route-edit-select');
  const routePointAdd = document.getElementById('route-point-add');
  const editPointSelect = document.getElementById('edit-point-select');
  const pointTypeSelect = document.getElementById('point-type');
  const editPointTypeSelect = document.getElementById('edit-point-type');
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
  renderTypePreview('point-type', 'point-type-preview');
  renderTypePreview('edit-point-type', 'edit-point-type-preview');
}

function renderLegend() {
  const legend = document.getElementById('map-legend');
  if (!legend) return;

  if (!dashboardPoints.length && !pointTypes.length) {
    legend.innerHTML = '<div class="t-data text-muted">Немає типів точок</div>';
    return;
  }

  const typeMetaByCode = new Map(pointTypes.map((pt) => [String(pt.code), pt]));
  const grouped = new Map();
  dashboardPoints.forEach((point) => {
    const code = String(point?.pointType?.code || '');
    if (!code) return;
    const current = grouped.get(code) || { total: 0 };
    current.total += 1;
    grouped.set(code, current);
  });

  const legendRows = grouped.size
    ? Array.from(grouped.entries())
      .map(([code, stat]) => {
        const meta = typeMetaByCode.get(code);
        const label = meta?.labelUk || code;
        const color = meta?.color || '#3D5263';
        const markerUrl = resolvePointTypeMarkerUrl(code);
        return {
          code,
          label,
          color,
          markerUrl,
          total: stat.total,
        };
      })
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'uk'))
    : pointTypes.map((pt) => ({
      code: pt.code,
      label: pt.labelUk,
      color: pt.color,
      markerUrl: resolvePointTypeMarkerUrl(pt.code),
      total: 0,
    }));
  const visibleCount = Math.max(0, legendRows.length - hiddenPointTypeCodes.size);
  legend.innerHTML = [
    `
      <div class="legend-head">
        <div class="t-data text-muted">ЛЕГЕНДА ТОЧОК</div>
        <button class="btn-flat legend-reset-btn" data-legend-reset type="button">Скинути</button>
      </div>
      <div class="legend-subhead t-data text-muted">Показано типів: ${visibleCount}/${legendRows.length}</div>
    `,
    ...legendRows.map((row) => {
      const isHidden = hiddenPointTypeCodes.has(row.code);
      return `
        <button class="legend-item ${isHidden ? 'is-hidden' : ''}" data-legend-toggle="${row.code}" type="button"
          title="${isHidden ? 'Показати тип' : 'Сховати тип'}">
          <span class="legend-marker" style="--legend-color:${row.color}">
            <img
              src="${row.markerUrl}"
              alt="${row.label}"
              loading="lazy"
              decoding="async"
              onerror="this.style.display='none'; this.parentElement && this.parentElement.classList.add('is-image-broken');"
            />
          </span>
          <span class="legend-label">${row.label}</span>
          <span class="legend-count">${row.total}</span>
        </button>
      `;
    }),
  ].join('');

  legend.querySelectorAll('[data-legend-toggle]').forEach((el) => {
    el.addEventListener('click', () => {
      const code = String(el.getAttribute('data-legend-toggle') || '').trim();
      if (!code) return;
      if (hiddenPointTypeCodes.has(code)) {
        hiddenPointTypeCodes.delete(code);
      } else {
        hiddenPointTypeCodes.add(code);
      }
      mapController?.setHiddenPointTypes?.(Array.from(hiddenPointTypeCodes));
      renderLegend();
    });
  });

  legend.querySelector('[data-legend-reset]')?.addEventListener('click', () => {
    hiddenPointTypeCodes.clear();
    mapController?.setHiddenPointTypes?.([]);
    renderLegend();
  });
}

function normalizeNewsImageFocusY(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_NEWS_IMAGE_FOCUS_Y;
  return Math.max(0, Math.min(100, parsed));
}

function normalizeNewsImageUrl(value) {
  let raw = String(value || '').trim();
  if (!raw) return '';

  const cssUrlMatch = raw.match(/^url\((.*)\)$/i);
  if (cssUrlMatch?.[1]) {
    raw = cssUrlMatch[1].trim().replace(/^['"]|['"]$/g, '');
  }

  if (raw.startsWith('//')) {
    raw = `https:${raw}`;
  }

  if (raw.startsWith('http://')) {
    raw = `https://${raw.slice('http://'.length)}`;
  }

  return isValidHttpUrl(raw) ? raw : '';
}

function resolveNewsImageForRender(item) {
  const normalizedImageUrl = normalizeNewsImageUrl(item?.imageUrl);
  if (normalizedImageUrl) return normalizedImageUrl;
  const normalizedLink = normalizeNewsImageUrl(item?.link);
  if (!normalizedLink) return '';
  return `https://image.thum.io/get/width/1200/noanimate/${encodeURIComponent(normalizedLink)}`;
}

function hydrateNewsCardImages(container) {
  if (!container) return;
  container.querySelectorAll('img[data-news-src]').forEach((imgEl) => {
    const src = String(imgEl.getAttribute('data-news-src') || '').trim();
    const fallback = String(imgEl.getAttribute('data-news-fallback') || '').trim();
    if (!src) return;
    imgEl.onerror = () => {
      if (!fallback || imgEl.dataset.fallbackApplied === '1') {
        imgEl.style.display = 'none';
        return;
      }
      imgEl.dataset.fallbackApplied = '1';
      imgEl.src = fallback;
    };
    imgEl.src = src;
  });
}

function renderNews() {
  const newsList = document.getElementById('news-list');
  const newsPager = document.getElementById('news-pager');
  const newsPageLabel = document.getElementById('news-page-label');
  if (!newsList) return;

  if (!dashboardNews.length) {
    newsList.innerHTML = '<div class="card news-card"><p class="t-body text-muted">Новин поки немає.</p></div>';
    if (newsPager) newsPager.style.display = 'none';
    return;
  }

  const pageCount = Math.max(1, Math.ceil(dashboardNews.length / NEWS_PAGE_SIZE));
  newsPage = Math.min(newsPage, pageCount);
  const start = (newsPage - 1) * NEWS_PAGE_SIZE;
  const visibleNews = dashboardNews.slice(start, start + NEWS_PAGE_SIZE);

  if (newsPager) newsPager.style.display = '';
  if (newsPageLabel) newsPageLabel.textContent = `${newsPage} / ${pageCount}`;

  newsList.innerHTML = visibleNews
    .map(
      (item) => {
        const cardImageUrl = resolveNewsImageForRender(item);
        const fallbackImageUrl = normalizeNewsImageUrl(item?.link)
          ? `https://image.thum.io/get/width/1200/noanimate/${encodeURIComponent(normalizeNewsImageUrl(item.link))}`
          : '';
        return `
      <div class="card reveal news-card">
        <div class="news-cover">
          ${cardImageUrl
            ? `<img data-news-src="${escapeHtml(cardImageUrl)}" data-news-fallback="${escapeHtml(fallbackImageUrl)}" alt="${escapeHtml(
              item.title || 'Новина'
            )}" loading="lazy" decoding="async" style="object-position:50% ${normalizeNewsImageFocusY(
              item.imageFocusY
            )}%;" />`
            : ''
          }
        </div>
        <div class="t-data text-muted" style="margin-bottom: 16px;">${formatIsoDate(item.createdAt)}</div>
        <h3 class="t-h3" style="font-family: var(--font-display); font-size: 20px; font-weight: 400; margin-bottom: 12px;">${escapeHtml(item.title)}</h3>
        <p class="t-body text-muted" style="margin-bottom: 24px;">${escapeHtml(item.summary)}</p>
        ${item.link
            ? `<a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" class="t-body" style="color: var(--c-cerulean); text-decoration: none;">Читати &rarr;</a>`
            : '<span class="t-body text-muted">Джерело не вказано</span>'
          }
      </div>
    `;
      }
    )
    .join('');
  hydrateNewsCardImages(newsList);
}

function renderDashboard(points, routes) {
  const publishedRoutes = routes.filter((r) => r.status === 'published').length;

  const kpiPoints = document.getElementById('kpi-points');
  const kpiRoutes = document.getElementById('kpi-routes');
  const kpiPublished = document.getElementById('kpi-published');
  const routeList = document.getElementById('route-list');
  const reviewList = document.getElementById('review-list');
  const pointList = document.getElementById('point-list');
  const activityList = document.getElementById('activity-list');
  const proposalList = document.getElementById('proposal-list');

  if (kpiPoints) kpiPoints.textContent = String(points.length);
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
              <strong class="t-body" style="display:flex;align-items:center;gap:8px;">
                <span style="width:12px;height:12px;border-radius:50%;background:${r.routeColor || getRouteColor(r.id)};border:1px solid rgba(0,0,0,0.15);"></span>
                ${r.name}
              </strong>
              <span class="route-status ${r.status}">${r.status}</span>
            </div>
            <div class="t-data text-muted">${r.points.length} точок • ${formatIsoDate(r.updatedAt || r.createdAt)}</div>
            <div class="t-data text-muted">${formatRouteTransportModes(r.transportModes)}</div>
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
              <span class="route-status review">${p.pointType.labelUk}</span>
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

  if (proposalList) {
    const pageCount = Math.max(1, Math.ceil(dashboardProposals.length / PROPOSAL_PAGE_SIZE));
    proposalPage = Math.min(proposalPage, pageCount);
    const start = (proposalPage - 1) * PROPOSAL_PAGE_SIZE;
    const pageSlice = dashboardProposals.slice(start, start + PROPOSAL_PAGE_SIZE);
    const pageLabel = document.getElementById('proposal-page-label');
    if (pageLabel) pageLabel.textContent = `${proposalPage} / ${pageCount}`;

    proposalList.innerHTML =
      pageSlice.length > 0
        ? pageSlice
          .map(
            (p) => `
          <article class="route-item">
            <div class="route-meta">
              <strong class="t-body">${p.name || 'Без назви'}</strong>
              <span class="route-status review">${formatIsoDate(p.createdAt)}</span>
            </div>
            <div class="t-data text-muted">${p.spaceType || 'тип не вказано'} • ${p.district || '-'}</div>
            <div class="t-data text-muted">${p.address || '-'}</div>
            <div class="route-actions">
              <button class="btn-flat" data-action="proposal-focus" data-proposal-id="${p.id}">На карту</button>
              <button class="btn-flat" data-action="proposal-use-for-point" data-proposal-id="${p.id}">У точку</button>
              ${p.photoUrl ? `<button class="btn-flat" data-action="proposal-open-photo" data-proposal-id="${p.id}">Фото</button>` : ''}
            </div>
          </article>
        `
          )
          .join('')
        : '<div class="activity-item t-body text-muted">Поки немає заявок</div>';
  }
  saveUiState();
}

async function refreshDashboardData() {
  if (!authToken || !authUser || !['admin', 'specialist'].includes(authUser.role)) {
    return;
  }

  const [news, typeRows, pointRows, routeRows, proposals] = await Promise.all([
    apiRequest('/api/news'),
    apiRequest('/api/point-types'),
    apiRequest('/api/points'),
    apiRequest('/api/routes'),
    apiRequest('/api/proposals').catch(() => []),
  ]);
  dashboardNews = news || [];
  pointTypes = normalizePointTypes(typeRows || []);
  const knownTypeCodes = new Set(pointTypes.map((type) => String(type.code)));
  Array.from(hiddenPointTypeCodes).forEach((code) => {
    if (!knownTypeCodes.has(code)) hiddenPointTypeCodes.delete(code);
  });
  dashboardPoints = (pointRows || []).map((point) => normalizePointRecord(point));
  dashboardRoutes = (routeRows || []).map((r) => ({
    ...r,
    routeColor: r.routeColor || getRouteColor(r.id),
    transportModes: normalizeTransportModes(r.transportModes),
  }));
  dashboardProposals = proposals || [];
  mapController?.setPublishedRoutes?.(dashboardRoutes.filter((r) => r.status === 'published'));
  mapController?.setHiddenPointTypes?.(Array.from(hiddenPointTypeCodes));
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
    const [news, typeRows, pointRows, routeRows] = await Promise.all([
      apiRequest('/api/news'),
      apiRequest('/api/point-types'),
      apiRequest('/api/points'),
      apiRequest('/api/routes'),
    ]);
    dashboardNews = news || [];
    pointTypes = normalizePointTypes(typeRows || []);
    const knownTypeCodes = new Set(pointTypes.map((type) => String(type.code)));
    Array.from(hiddenPointTypeCodes).forEach((code) => {
      if (!knownTypeCodes.has(code)) hiddenPointTypeCodes.delete(code);
    });
    dashboardPoints = (pointRows || []).map((point) => normalizePointRecord(point));
    dashboardRoutes = (routeRows || []).map((r) => ({
      ...r,
      routeColor: r.routeColor || getRouteColor(r.id),
      transportModes: normalizeTransportModes(r.transportModes),
    }));
    mapController?.setPublishedRoutes?.(dashboardRoutes.filter((r) => r.status === 'published'));
    mapController?.setHiddenPointTypes?.(Array.from(hiddenPointTypeCodes));
    renderNews();
    renderLegend();
    populatePointTypeOptions();
  } catch (_e) {
    // Keep UI functional even if public data fails
  }
}

function bindPublicProposalForm() {
  const btnSubmit = document.getElementById('btn-submit-proposal');
  const feedback = document.getElementById('proposal-feedback');
  if (!btnSubmit) return;

  const setFeedback = (message, isError = false) => {
    if (!feedback) return;
    feedback.textContent = message || '';
    feedback.style.color = isError ? 'var(--c-vermillion)' : 'var(--c-text-secondary)';
  };

  btnSubmit.addEventListener('click', async () => {
    const payload = {
      name: document.getElementById('proposal-name')?.value.trim(),
      spaceType: document.getElementById('proposal-space-type')?.value || 'buildings',
      district: document.getElementById('proposal-district')?.value.trim(),
      address: document.getElementById('proposal-address')?.value.trim(),
      lat: Number(document.getElementById('proposal-lat')?.value),
      lng: Number(document.getElementById('proposal-lng')?.value),
      email: document.getElementById('proposal-contact-email')?.value.trim(),
      photoUrl: document.getElementById('proposal-photo-url')?.value.trim() || null,
      comment: document.getElementById('proposal-comment')?.value.trim() || null,
      checklist: Array.from(document.querySelectorAll('#proposal-section select[data-check]')).reduce((acc, el) => {
        acc[el.getAttribute('data-check')] = el.value;
        return acc;
      }, {}),
    };

    if (!payload.name || !payload.district || !payload.address || !payload.email) {
      setFeedback('Заповніть назву, район/громаду, адресу та email.', true);
      return;
    }
    if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lng)) {
      setFeedback('Вкажіть коректні координати.', true);
      return;
    }
    if (payload.lat < -90 || payload.lat > 90 || payload.lng < -180 || payload.lng > 180) {
      setFeedback('Координати поза допустимим діапазоном.', true);
      return;
    }
    if (!payload.email.includes('@')) {
      setFeedback('Email введено некоректно.', true);
      return;
    }
    if (!isValidHttpUrl(payload.photoUrl)) {
      setFeedback('URL фото має починатися з http:// або https://', true);
      return;
    }

    try {
      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Надсилання...';
      const created = await apiRequest('/api/proposals', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setFeedback(`Заявку №${created?.id || 'new'} надіслано. Дякуємо!`);
      ['proposal-name', 'proposal-district', 'proposal-address', 'proposal-lat', 'proposal-lng', 'proposal-contact-email', 'proposal-photo-url', 'proposal-comment'].forEach(
        (id) => {
          const el = document.getElementById(id);
          if (el) el.value = '';
        }
      );
    } catch (error) {
      setFeedback(error.message || 'Не вдалося надіслати заявку', true);
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Надіслати заявку';
    }
  });
}

function bindLegendPointsSync() {
  if (legendPointsSyncBound) return;
  legendPointsSyncBound = true;
  window.addEventListener('map:points-updated', (event) => {
    if (!Array.isArray(event?.detail)) return;
    dashboardPoints = event.detail;
    renderLegend();
  });
}

function setAuthState(token, user, session = null) {
  authToken = token;
  authUser = user;
  authSession = session || null;

  if (token && user) {
    localStorage.setItem('odesaAuthToken', token);
    localStorage.setItem('odesaAuthUser', JSON.stringify(user));
    if (authSession && authSession.access_token && authSession.refresh_token) {
      localStorage.setItem('odesaAuthSession', JSON.stringify(authSession));
      dataService.setAuthSession?.(authSession);
    } else {
      localStorage.removeItem('odesaAuthSession');
      dataService.setAuthSession?.(null);
    }
  } else {
    localStorage.removeItem('odesaAuthToken');
    localStorage.removeItem('odesaAuthUser');
    localStorage.removeItem('odesaAuthSession');
    dataService.setAuthSession?.(null);
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
    const mapView = document.querySelector('.map-view');
    if (mapView) {
      mapView.classList.toggle('specialist-open', Boolean(canEdit) && !panel.classList.contains('collapsed'));
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
    const routeLineToolbar = document.getElementById('route-line-toolbar');
    const mapView = document.querySelector('.map-view');
    if (routeLineToolbar) {
      routeLineToolbar.classList.remove('collapsed');
      routeLineToolbar.classList.add('ui-hidden');
      routeLineToolbar.style.display = 'none';
    }
    if (mapView) {
      mapView.classList.remove('route-toolbar-visible');
    }
    mapController?.setLineToolVisible?.(false);
    mapController?.stopPointDrag?.({ commit: false });
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
  const routeStatusInput = document.getElementById('route-status');
  if (routeStatusInput) routeStatusInput.value = 'published';
  const routeColorInput = document.getElementById('route-color');
  if (routeColorInput) routeColorInput.value = DEFAULT_ROUTE_COLOR;
  const lineColorInput = document.getElementById('line-color-input');
  if (lineColorInput) lineColorInput.value = DEFAULT_ROUTE_COLOR;
  mapController?.setLineToolColor?.(DEFAULT_ROUTE_COLOR);
  setSelectedRouteTransportModes([]);
  mapController?.clearLineDraft?.();
  mapController?.setLineToolMode?.('draw');
  mapController?.setLineToolVisible?.(false);
  mapController?.setLineToolSnapEnabled?.(true);
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
  const routeStatusInput = document.getElementById('route-status');
  if (routeStatusInput) routeStatusInput.value = 'published';
  const routeColorInput = document.getElementById('route-color');
  if (routeColorInput) routeColorInput.value = route.routeColor || getRouteColor(route.id);
  const lineColorInput = document.getElementById('line-color-input');
  if (lineColorInput) lineColorInput.value = route.routeColor || getRouteColor(route.id);
  mapController?.setLineToolColor?.(route.routeColor || getRouteColor(route.id));
  setSelectedRouteTransportModes(route.transportModes || []);
  routeEditorPoints = route.points.map((p) => ({ pointId: p.id, title: p.title }));
  routeOrderHistory = [];
  mapController?.setLineDraftFromPoints?.(
    route.points.map((p) => ({
      lat: p.lat,
      lng: p.lng,
      pointId: p.id,
      title: p.title || '',
      snapped: true,
    }))
  );
  mapController?.setLineToolMode?.('draw');
  mapController?.setLineToolVisible?.(false);
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
  const normalizedTypeCode = normalizePointTypeCode(point?.pointType?.code, point?.title, point?.district);

  editingPointId = point.id;
  document.getElementById('edit-point-title').value = point.title;
  document.getElementById('edit-point-type').value = normalizedTypeCode;
  document.getElementById('edit-point-district').value = point.district || '';
  document.getElementById('edit-point-description').value = point.description || '';
  editingPointPosition = { lat: Number(point.lat), lng: Number(point.lng) };
  const coordsLabel = document.getElementById('edit-point-coords');
  if (coordsLabel) {
    coordsLabel.textContent =
      Number.isFinite(editingPointPosition.lat) && Number.isFinite(editingPointPosition.lng)
        ? `Координати: ${editingPointPosition.lat.toFixed(6)}, ${editingPointPosition.lng.toFixed(6)}`
        : 'Координати: -';
  }
  document.getElementById('edit-point-photo-url').value = point.photoUrl || '';
  const editPhotoFileInput = document.getElementById('edit-point-photo-file');
  if (editPhotoFileInput) editPhotoFileInput.value = '';
  renderPointPhotoPreview('edit-point-photo-preview', { url: point.photoUrl || '' });
  renderPointSectionsEditor(document.getElementById('edit-point-sections-list'), point.sections || []);
  const editPointSelect = document.getElementById('edit-point-select');
  if (editPointSelect) {
    editPointSelect.value = String(point.id);
  }
  renderTypePreview('edit-point-type', 'edit-point-type-preview');
  setActiveSpecialistTab('edit-point');
  setSpecialistMessage(`Редагування точки: ${point.title}`);
  saveUiState();
}

function renderNewsImagePreview() {
  const preview = document.getElementById('news-image-preview');
  const imageUrlInput = document.getElementById('news-image-url-input');
  const focusInput = document.getElementById('news-image-focus-y-input');
  const focusValue = document.getElementById('news-image-focus-y-value');
  if (!preview || !focusInput || !focusValue) return;

  const imageUrl = normalizeNewsImageUrl(imageUrlInput?.value?.trim() || '');
  const linkUrl = normalizeNewsImageUrl(document.getElementById('news-link-input')?.value?.trim() || '');
  const previewUrl = imageUrl || (linkUrl ? `https://image.thum.io/get/width/1200/noanimate/${encodeURIComponent(linkUrl)}` : '');
  const focusY = normalizeNewsImageFocusY(focusInput.value);
  focusInput.value = String(Math.round(focusY));
  focusValue.textContent = `${Math.round(focusY)}%`;

  if (!previewUrl) {
    preview.innerHTML = '<span class="t-data text-muted">Превʼю фото відсутнє</span>';
    preview.style.background = 'linear-gradient(120deg, rgba(11, 37, 69, 0.12), rgba(197, 160, 89, 0.16))';
    return;
  }

  preview.style.background = 'linear-gradient(120deg, rgba(11, 37, 69, 0.12), rgba(197, 160, 89, 0.16))';
  preview.innerHTML = `<img src="${escapeHtml(previewUrl)}" alt="Превʼю новини" loading="lazy" decoding="async" style="object-position:50% ${focusY}%;" />`;
}

function resetNewsEditor() {
  editingNewsId = null;
  const title = document.getElementById('news-title-input');
  const summary = document.getElementById('news-summary-input');
  const link = document.getElementById('news-link-input');
  const imageUrl = document.getElementById('news-image-url-input');
  const imageFocusY = document.getElementById('news-image-focus-y-input');
  const select = document.getElementById('news-edit-select');
  if (title) title.value = '';
  if (summary) summary.value = '';
  if (link) link.value = '';
  if (imageUrl) imageUrl.value = '';
  if (imageFocusY) imageFocusY.value = String(DEFAULT_NEWS_IMAGE_FOCUS_Y);
  if (select) select.value = '';
  renderNewsImagePreview();
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
  const imageFocusY = document.getElementById('news-image-focus-y-input');
  const select = document.getElementById('news-edit-select');
  if (title) title.value = news.title || '';
  if (summary) summary.value = news.summary || '';
  if (link) link.value = news.link || '';
  if (imageUrl) imageUrl.value = news.imageUrl || '';
  if (imageFocusY) imageFocusY.value = String(normalizeNewsImageFocusY(news.imageFocusY));
  if (select) select.value = String(news.id);
  renderNewsImagePreview();
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

      if (action === 'proposal-focus') {
        const proposalId = Number(button.dataset.proposalId);
        const proposal = dashboardProposals.find((p) => p.id === proposalId);
        if (!proposal) return;
        mapController?.focusLocation?.(Number(proposal.lat), Number(proposal.lng), 16);
        setSpecialistSuccess(`Фокус на заявці "${proposal.name}"`);
      }

      if (action === 'proposal-open-photo') {
        const proposalId = Number(button.dataset.proposalId);
        const proposal = dashboardProposals.find((p) => p.id === proposalId);
        if (!proposal?.photoUrl) return;
        window.open(proposal.photoUrl, '_blank', 'noopener,noreferrer');
      }

      if (action === 'proposal-use-for-point') {
        const proposalId = Number(button.dataset.proposalId);
        const proposal = dashboardProposals.find((p) => p.id === proposalId);
        if (!proposal) return;
        setActiveSpecialistTab('add-point');
        document.getElementById('point-title').value = proposal.name || '';
        document.getElementById('point-district').value = proposal.district || '';
        document.getElementById('point-lat').value = Number(proposal.lat || 0) || '';
        document.getElementById('point-lng').value = Number(proposal.lng || 0) || '';
        document.getElementById('point-photo-url').value = proposal.photoUrl || '';
        const addPointPhotoFile = document.getElementById('point-photo-file');
        if (addPointPhotoFile) addPointPhotoFile.value = '';
        renderPointPhotoPreview('point-photo-preview', { url: proposal.photoUrl || '' });
        document.getElementById('point-description').value = [proposal.address, proposal.comment].filter(Boolean).join('\n');
        setSpecialistMessage(`Дані із заявки "${proposal.name}" підставлено у форму точки`);
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
        dashboardProposals = [];
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

      setAuthState(data.token, data.user, data.session || null);
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
      dashboardProposals = [];
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
  const quickSearchInput = document.getElementById('location-quick-search');
  const quickSearchDatalist = document.getElementById('location-quick-options');
  const btnQuickGo = document.getElementById('btn-location-quick-go');

  populateCommunitiesSelect();

  const quickValueByKey = new Map();
  const quickDisplayLabelByKey = new Map();
  const addQuickAlias = (label, value) => {
    const key = normalizeGeoText(label);
    if (!key || quickValueByKey.has(key)) return;
    quickValueByKey.set(key, value);
    quickDisplayLabelByKey.set(key, String(label));
  };

  addQuickAlias('Одеса', 'community::Одеський район::Одеська міська');
  addQuickAlias('місто Одеса', 'community::Одеський район::Одеська міська');
  addQuickAlias('Одеська міська', 'community::Одеський район::Одеська міська');

  Object.entries(COMMUNITIES_BY_DISTRICT).forEach(([district, communities]) => {
    addQuickAlias(district, `district::${district}`);
    communities.forEach((community) => {
      addQuickAlias(community, `community::${district}::${community}`);
    });
  });

  if (quickSearchDatalist) {
    const labels = Array.from(quickDisplayLabelByKey.values())
      .sort((a, b) => a.localeCompare(b, 'uk'));
    quickSearchDatalist.innerHTML = labels
      .map((label) => `<option value="${label}"></option>`)
      .join('');
  }

  const applyQuickLocation = async () => {
    if (!quickSearchInput || !communitySelect) return;
    const needle = normalizeGeoText(quickSearchInput.value);
    if (!needle) return;

    let resolved = quickValueByKey.get(needle) || '';
    if (!resolved) {
      const fallback = Array.from(quickValueByKey.entries()).find(([key]) => key.includes(needle));
      resolved = fallback?.[1] || '';
    }
    if (!resolved) {
      setSpecialistMessage('Локацію не знайдено. Спробуйте назву громади/району.', true);
      return;
    }

    communitySelect.value = resolved;
    communitySelect.dispatchEvent(new Event('change', { bubbles: true }));
    filterMenu?.classList.remove('active');
    quickSearchInput.blur();
  };

  if (filterMenu && btnToggleFilters) {
    ['pointerdown', 'mousedown', 'touchstart', 'wheel'].forEach((eventName) => {
      filterMenu.addEventListener(
        eventName,
        (event) => {
          event.stopPropagation();
        },
        { passive: false }
      );
    });

    btnToggleFilters.addEventListener('click', () => {
      filterMenu.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
      if (!filterMenu.contains(e.target)) {
        filterMenu.classList.remove('active');
      }
    });

    filterMenu.querySelectorAll('.btn-flat[data-filter]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        filterMenu.querySelectorAll('.btn-flat[data-filter]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        filterMenu.classList.remove('active');
        if (!mapController) return;
        selectedDistrict = '';
        selectedCommunity = '';
        if (communitySelect) communitySelect.value = '';
        mapController.clearFocusBoundary?.();
        mapController.focusLocation?.(ODESA_START_FOCUS.lat, ODESA_START_FOCUS.lng, ODESA_START_FOCUS.zoom);
        await mapController.setFilter({ type: 'all', certified: false, district: '', community: '' });
        setSpecialistMessage('Точки не приховуються: фільтр використовується для навігації.');
        saveUiState();
      });
    });
  }

  if (btnQuickGo) {
    ['pointerdown', 'mousedown', 'touchstart'].forEach((eventName) => {
      btnQuickGo.addEventListener(
        eventName,
        (event) => {
          event.preventDefault();
          event.stopPropagation();
        },
        { passive: false }
      );
    });
    btnQuickGo.addEventListener('click', async () => {
      await applyQuickLocation();
    });
  }
  if (quickSearchInput) {
    ['pointerdown', 'mousedown', 'touchstart'].forEach((eventName) => {
      quickSearchInput.addEventListener(eventName, (event) => event.stopPropagation(), { passive: true });
    });
    quickSearchInput.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      await applyQuickLocation();
    });
  }

  if (communitySelect) {
    communitySelect.addEventListener('change', async () => {
      const value = communitySelect.value;
      selectedDistrict = '';
      selectedCommunity = '';

      if (!value) {
        mapController?.clearFocusBoundary?.();
        mapController?.focusLocation?.(ODESA_START_FOCUS.lat, ODESA_START_FOCUS.lng, ODESA_START_FOCUS.zoom);
        setSpecialistMessage('Фокус на Одесі');
        saveUiState();
        return;
      }

      if (value.startsWith('district::')) {
        const district = value.split('::')[1];
        selectedDistrict = district;
        const districtGeo = await geocodeDistrict(district);
        const hasBoundary = districtGeo?.geojson ? mapController?.setFocusBoundary?.(districtGeo.geojson) : false;
        if (!hasBoundary) mapController?.clearFocusBoundary?.();
        const districtNeedle = normalizeGeoText(district);
        const points = dashboardPoints.filter((p) =>
          normalizeGeoText(p.district).includes(districtNeedle)
        );
        const focusedByPoints = mapController?.focusPoints?.(points, { maxZoom: 11, singleZoom: 11 });
        if (districtGeo && hasBoundary) {
          mapController?.focusBoundary?.({ maxZoom: 11 });
        } else if (districtGeo) {
          mapController?.focusLocation?.(districtGeo.lat, districtGeo.lng, districtGeo.zoom || 11);
        } else if (!focusedByPoints) {
          const center = DISTRICT_CENTERS[district];
          if (center) {
            mapController?.focusLocation?.(center.lat, center.lng, center.zoom || 11);
          }
        }
        setSpecialistMessage(`Фокус на: ${district}`);
      }

      if (value.startsWith('community::')) {
        const [, district, community] = value.split('::');
        selectedDistrict = district;
        selectedCommunity = community;
        const districtNeedle = normalizeGeoText(district);
        const communityNeedle = normalizeGeoText(community);
        const points = dashboardPoints.filter((p) => {
          const districtValue = normalizeGeoText(p.district);
          const communityValue = normalizeGeoText(p.community);
          return (
            districtValue.includes(districtNeedle) &&
            (communityValue ? communityValue.includes(communityNeedle) : true)
          );
        });
        const focusedByPoints = mapController?.focusPoints?.(points, { maxZoom: 13, singleZoom: 13 });

        const geo = await geocodeCommunity(district, community);
        const hasBoundary = geo?.geojson ? mapController?.setFocusBoundary?.(geo.geojson) : false;
        if (!hasBoundary) mapController?.clearFocusBoundary?.();

        if (geo && hasBoundary) {
          mapController?.focusBoundary?.({ maxZoom: 13 });
        } else if (geo) {
          mapController?.focusLocation?.(geo.lat, geo.lng, geo.zoom || 13);
        } else if (focusedByPoints) {
          // already focused by local points for selected district/community
        } else if (DISTRICT_CENTERS[district]) {
          const center = DISTRICT_CENTERS[district];
          mapController?.focusLocation?.(center.lat, center.lng, center.zoom || 11);
        }
        await mapController?.setFilter({ type: 'all', certified: false, district: selectedDistrict, community: selectedCommunity });
        setSpecialistMessage(
          hasBoundary
            ? `Фокус на громаді: ${community} (межі показано)`
            : `Фокус на громаді: ${community} (межі недоступні у джерелі даних)`
        );
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
  const routeLineToolbar = document.getElementById('route-line-toolbar');

  const syncMapOverlayLayout = () => {
    const mapView = document.querySelector('.map-view');
    if (!mapView || !specialistPanel) return;
    const specialistOpen = specialistPanel.classList.contains('active') && !specialistPanel.classList.contains('collapsed');
    mapView.classList.toggle('specialist-open', specialistOpen);
  };

  if (btnHideSpecialist && specialistPanel) {
    btnHideSpecialist.addEventListener('click', () => {
      const isCollapsed = specialistPanel.classList.toggle('collapsed');
      btnHideSpecialist.textContent = isCollapsed ? '⟩' : '⟨';
      syncMapOverlayLayout();
    });
  }

  if (btnToggleLegend && legendWrap) {
    btnToggleLegend.addEventListener('click', () => {
      const isCollapsed = legendWrap.classList.toggle('collapsed');
      btnToggleLegend.textContent = isCollapsed ? '⟩' : '⟨';
    });
  }
  filterMenu?.classList.remove('ui-hidden');
  legendWrap?.classList.remove('ui-hidden');
  btnMapFullscreen?.classList.remove('ui-hidden');
  routeLineToolbar?.classList.remove('ui-hidden');
  specialistPanel?.classList.remove('ui-hidden');
  syncMapOverlayLayout();
}

function bindSpecialistTools() {
  const btnPickOnMap = document.getElementById('btn-pick-on-map');
  const pointTypeSelect = document.getElementById('point-type');
  const editPointTypeSelect = document.getElementById('edit-point-type');
  const btnCreatePoint = document.getElementById('btn-create-point');
  const pointPhotoFileInput = document.getElementById('point-photo-file');
  const pointPhotoUrlInput = document.getElementById('point-photo-url');
  const btnCreateRoute = document.getElementById('btn-create-route');
  const btnSaveRoute = document.getElementById('btn-save-route');
  const btnDeleteRoute = document.getElementById('btn-delete-route');
  const btnNewRoute = document.getElementById('btn-new-route');
  const routeEditSelect = document.getElementById('route-edit-select');
  const btnAddRoutePoint = document.getElementById('btn-add-route-point');
  const btnSavePoint = document.getElementById('btn-save-point');
  const btnMovePointOnMap = document.getElementById('btn-move-point-on-map');
  const editPointPhotoFileInput = document.getElementById('edit-point-photo-file');
  const editPointPhotoUrlInput = document.getElementById('edit-point-photo-url');
  const btnDeletePoint = document.getElementById('btn-delete-point');
  const btnUndoRouteOrder = document.getElementById('btn-undo-route-order');
  const btnCreateNews = document.getElementById('btn-create-news');
  const btnSaveNews = document.getElementById('btn-save-news');
  const btnDeleteNews = document.getElementById('btn-delete-news');
  const newsEditSelect = document.getElementById('news-edit-select');
  const btnNewNews = document.getElementById('btn-new-news');
  const newsLinkInput = document.getElementById('news-link-input');
  const newsImageUrlInput = document.getElementById('news-image-url-input');
  const newsImageFocusYInput = document.getElementById('news-image-focus-y-input');
  const editPointSelect = document.getElementById('edit-point-select');
  const btnMapFullscreen = document.getElementById('btn-map-fullscreen');
  const routeColorInput = document.getElementById('route-color');
  const pointSectionsList = document.getElementById('point-sections-list');
  const editPointSectionsList = document.getElementById('edit-point-sections-list');
  const btnAddPointSection = document.getElementById('btn-add-point-section');
  const btnAddEditPointSection = document.getElementById('btn-add-edit-point-section');
  const btnLineDraw = document.getElementById('btn-line-draw');
  const btnLineCurve = document.getElementById('btn-line-curve');
  const btnLineEdit = document.getElementById('btn-line-edit');
  const btnLineCursor = document.getElementById('btn-line-cursor');
  const btnLineErase = document.getElementById('btn-line-erase');
  const btnLineSnap = document.getElementById('btn-line-snap');
  const btnLineUndo = document.getElementById('btn-line-undo');
  const btnLineClear = document.getElementById('btn-line-clear');
  const btnLineApplyRoute = document.getElementById('btn-line-apply-route');
  const btnLineToolbarToggle = document.getElementById('btn-line-toolbar-toggle');
  const lineStyleSelect = document.getElementById('line-style-select');
  const lineColorInput = document.getElementById('line-color-input');
  const routeLineToolbar = document.getElementById('route-line-toolbar');

  renderPointSectionsEditor(pointSectionsList, []);
  renderPointSectionsEditor(editPointSectionsList, []);
  bindPointSectionsEditor(pointSectionsList, btnAddPointSection);
  bindPointSectionsEditor(editPointSectionsList, btnAddEditPointSection);
  renderTypePreview('point-type', 'point-type-preview');
  renderTypePreview('edit-point-type', 'edit-point-type-preview');
  renderPointPhotoPreview('point-photo-preview');
  renderPointPhotoPreview('edit-point-photo-preview');
  renderNewsImagePreview();

  if (pointTypeSelect) {
    pointTypeSelect.addEventListener('change', () => {
      renderTypePreview('point-type', 'point-type-preview');
    });
  }
  if (editPointTypeSelect) {
    editPointTypeSelect.addEventListener('change', () => {
      renderTypePreview('edit-point-type', 'edit-point-type-preview');
    });
  }
  if (pointPhotoUrlInput) {
    pointPhotoUrlInput.addEventListener('input', () => {
      renderPointPhotoPreview('point-photo-preview', { url: pointPhotoUrlInput.value });
    });
  }
  if (pointPhotoFileInput) {
    pointPhotoFileInput.addEventListener('change', () => {
      const file = pointPhotoFileInput.files?.[0] || null;
      renderPointPhotoPreview('point-photo-preview', { url: pointPhotoUrlInput?.value || '', file });
    });
  }
  if (editPointPhotoUrlInput) {
    editPointPhotoUrlInput.addEventListener('input', () => {
      renderPointPhotoPreview('edit-point-photo-preview', { url: editPointPhotoUrlInput.value });
    });
  }
  if (editPointPhotoFileInput) {
    editPointPhotoFileInput.addEventListener('change', () => {
      const file = editPointPhotoFileInput.files?.[0] || null;
      renderPointPhotoPreview('edit-point-photo-preview', { url: editPointPhotoUrlInput?.value || '', file });
    });
  }
  if (newsImageUrlInput) {
    newsImageUrlInput.addEventListener('input', () => {
      renderNewsImagePreview();
    });
  }
  if (newsLinkInput) {
    newsLinkInput.addEventListener('input', () => {
      renderNewsImagePreview();
    });
  }
  if (newsImageFocusYInput) {
    newsImageFocusYInput.addEventListener('input', () => {
      renderNewsImagePreview();
    });
  }

  let lineSnapEnabled = true;
  const canUseLineTools = Boolean(authUser && ['admin', 'specialist'].includes(authUser.role));

  const setLineToolButtonState = (mode) => {
    if (btnLineCursor) btnLineCursor.classList.toggle('active', mode === 'cursor');
    if (btnLineDraw) btnLineDraw.classList.toggle('active', mode === 'draw');
    if (btnLineCurve) btnLineCurve.classList.toggle('active', mode === 'curve');
    if (btnLineEdit) btnLineEdit.classList.toggle('active', mode === 'edit');
    if (btnLineErase) btnLineErase.classList.toggle('active', mode === 'erase');
  };

  setLineToolButtonState('cursor');
  mapController?.setLineToolVisible?.(false);
  mapController?.setLineToolMode?.('draw');
  mapController?.setLineToolSnapEnabled?.(lineSnapEnabled);
  if (btnLineSnap) btnLineSnap.classList.toggle('active', lineSnapEnabled);

  if (routeLineToolbar) {
    ['pointerdown', 'mousedown', 'click', 'dblclick', 'touchstart', 'wheel'].forEach((eventName) => {
      routeLineToolbar.addEventListener(
        eventName,
        (event) => {
          event.stopPropagation();
        },
        { passive: false }
      );
    });
  }

  if (btnLineToolbarToggle && routeLineToolbar) {
    btnLineToolbarToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const collapsed = routeLineToolbar.classList.toggle('collapsed');
      btnLineToolbarToggle.textContent = collapsed ? '⌃' : '⌄';
      btnLineToolbarToggle.setAttribute('aria-label', collapsed ? 'Розгорнути панель' : 'Згорнути панель');
    });
  }

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

  if (btnLineCursor) {
    btnLineCursor.addEventListener('click', () => {
      setLineToolButtonState('cursor');
      mapController?.setLineToolVisible?.(false);
      setSpecialistMessage('Режим курсора: перегляд точок без редагування лінії');
    });
  }

  if (btnLineDraw) {
    btnLineDraw.addEventListener('click', () => {
      setLineToolButtonState('draw');
      mapController?.setLineToolVisible?.(true);
      mapController?.setLineToolMode?.('draw');
      setSpecialistMessage('Перо: клік по карті додає вершину. Alt = тимчасово без snap.');
    });
  }

  if (btnLineCurve) {
    btnLineCurve.addEventListener('click', () => {
      setLineToolButtonState('curve');
      mapController?.setLineToolVisible?.(true);
      mapController?.setLineToolMode?.('curve');
      setSpecialistMessage('Крива: ставте опорні точки, лінія згладжується автоматично.');
    });
  }

  if (btnLineEdit) {
    btnLineEdit.addEventListener('click', () => {
      setLineToolButtonState('edit');
      mapController?.setLineToolVisible?.(true);
      mapController?.setLineToolMode?.('edit');
      setSpecialistMessage('Редагування: тягніть вузли мишкою, клік по сегменту додає вузол, Alt+клік по вузлу видаляє.');
    });
  }

  if (btnLineErase) {
    btnLineErase.addEventListener('click', () => {
      setLineToolButtonState('erase');
      mapController?.setLineToolVisible?.(true);
      mapController?.setLineToolMode?.('erase');
      setSpecialistMessage('Режим стирача: клікніть біля вузла, щоб видалити його');
    });
  }

  if (btnLineSnap) {
    btnLineSnap.addEventListener('click', () => {
      lineSnapEnabled = !lineSnapEnabled;
      mapController?.setLineToolSnapEnabled?.(lineSnapEnabled);
      btnLineSnap.classList.toggle('active', lineSnapEnabled);
      btnLineSnap.textContent = lineSnapEnabled ? 'Snap ON' : 'Snap OFF';
      setSpecialistMessage(lineSnapEnabled ? 'Snap увімкнено' : 'Snap вимкнено');
    });
  }

  if (btnLineUndo) {
    btnLineUndo.addEventListener('click', () => {
      const ok = mapController?.undoLineDraft?.();
      if (!ok) {
        setSpecialistMessage('Немає точок для скасування', true);
      }
    });
  }

  if (btnLineClear) {
    btnLineClear.addEventListener('click', () => {
      mapController?.clearLineDraft?.();
      setSpecialistMessage('Лінію очищено');
    });
  }

  if (lineStyleSelect) {
    mapController?.setLineToolStyle?.(lineStyleSelect.value || 'dashed');
    lineStyleSelect.addEventListener('change', () => {
      mapController?.setLineToolStyle?.(lineStyleSelect.value || 'dashed');
    });
  }

  if (lineColorInput) {
    mapController?.setLineToolColor?.(lineColorInput.value || DEFAULT_ROUTE_COLOR);
    lineColorInput.addEventListener('input', () => {
      const value = lineColorInput.value || DEFAULT_ROUTE_COLOR;
      mapController?.setLineToolColor?.(value);
      const routeColorInputEl = document.getElementById('route-color');
      if (routeColorInputEl) routeColorInputEl.value = value;
    });
  }

  if (btnLineApplyRoute) {
    btnLineApplyRoute.addEventListener('click', () => {
      const lineDraftSnapshot = mapController?.getLineDraftSnapshot?.() || [];
      const result = mapController?.applyLineDraftToRoute?.();
      if (!result?.ok) {
        setSpecialistMessage(result?.message || 'Не вдалося застосувати лінію', true);
        return;
      }

      const mappedPoints = result.pointIds
        .map((pointId) => {
          const point = dashboardPoints.find((candidate) => Number(candidate.id) === Number(pointId));
          if (!point) return null;
          return { pointId: point.id, title: point.title };
        })
        .filter(Boolean);

      if (mappedPoints.length < 2) {
        setSpecialistMessage('У маршруті має бути мінімум 2 валідні точки', true);
        return;
      }

      routeOrderHistory.push(routeEditorPoints.map((point) => ({ ...point })));
      routeEditorPoints = mappedPoints;
      renderRoutePointOrder();
      if (lineDraftSnapshot.length) {
        mapController?.setLineDraftFromPoints?.(lineDraftSnapshot);
      }

      if (result.color) {
        const routeColorInputEl = document.getElementById('route-color');
        if (routeColorInputEl) routeColorInputEl.value = result.color;
      }

      if (result.skippedVertices > 0) {
        setSpecialistSuccess(`Маршрут зібрано. Пропущено ${result.skippedVertices} не привʼязаних вузлів.`);
      } else {
        setSpecialistSuccess('Лінію застосовано до маршруту');
      }
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
        isCertified: false,
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
          await refreshPublicData();
          document.getElementById('point-title').value = '';
          document.getElementById('point-lat').value = '';
          document.getElementById('point-lng').value = '';
          document.getElementById('point-district').value = '';
          document.getElementById('point-description').value = '';
          document.getElementById('point-photo-url').value = '';
          document.getElementById('point-photo-file').value = '';
          renderPointPhotoPreview('point-photo-preview');
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
        status: 'published',
        routeColor: document.getElementById('route-color')?.value || DEFAULT_ROUTE_COLOR,
        transportModes: collectSelectedRouteTransportModes(),
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
          setRouteColor(created.id, payload.routeColor);
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
        status: 'published',
        routeColor: document.getElementById('route-color')?.value || getRouteColor(editingRouteId),
        transportModes: collectSelectedRouteTransportModes(),
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
          setRouteColor(editingRouteId, payload.routeColor);
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

  if (btnMovePointOnMap) {
    btnMovePointOnMap.addEventListener('click', () => {
      if (!editingPointId) {
        setSpecialistMessage('Спочатку виберіть точку для редагування', true);
        return;
      }
      if (!mapController) {
        setSpecialistMessage('Карта ще не готова', true);
        return;
      }
      const start = editingPointPosition || dashboardPoints.find((p) => Number(p.id) === Number(editingPointId));
      const lat = Number(start?.lat);
      const lng = Number(start?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setSpecialistMessage('Немає валідних координат точки', true);
        return;
      }
      const started = mapController.startPointDrag?.({
        pointId: current.id,
        lat,
        lng,
        onMove: ({ lat: movedLat, lng: movedLng }) => {
          const coordsLabel = document.getElementById('edit-point-coords');
          if (coordsLabel) {
            coordsLabel.textContent = `Координати: ${Number(movedLat).toFixed(6)}, ${Number(movedLng).toFixed(6)}`;
          }
        },
        onCommit: ({ lat: movedLat, lng: movedLng }) => {
          editingPointPosition = { lat: Number(movedLat), lng: Number(movedLng) };
          const coordsLabel = document.getElementById('edit-point-coords');
          if (coordsLabel) {
            coordsLabel.textContent = `Координати: ${Number(movedLat).toFixed(6)}, ${Number(movedLng).toFixed(6)}`;
          }
          setSpecialistSuccess('Точку переміщено. Натисніть "Зберегти точку"');
        },
        onCancel: () => {
          setSpecialistMessage('Переміщення точки скасовано');
          if (editingPointPosition) {
            const coordsLabel = document.getElementById('edit-point-coords');
            if (coordsLabel) {
              coordsLabel.textContent = `Координати: ${Number(editingPointPosition.lat).toFixed(6)}, ${Number(editingPointPosition.lng).toFixed(6)}`;
            }
          }
        },
      });
      if (!started) {
        setSpecialistMessage('Не вдалося запустити режим переміщення точки', true);
        return;
      }
      setSpecialistMessage('Перетягніть точку мишкою. Esc — скасувати');
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
        isCertified: false,
      };
      const existingPoint = dashboardPoints.find((p) => p.id === editingPointId);
      if (
        editingPointPosition &&
        Number.isFinite(Number(editingPointPosition.lat)) &&
        Number.isFinite(Number(editingPointPosition.lng))
      ) {
        payload.lat = Number(editingPointPosition.lat);
        payload.lng = Number(editingPointPosition.lng);
      }
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
          await refreshPublicData();
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
        editingPointPosition = null;
        document.getElementById('edit-point-title').value = '';
        document.getElementById('edit-point-type').value = pointTypes[0]?.code || '';
        document.getElementById('edit-point-district').value = '';
        document.getElementById('edit-point-description').value = '';
        const coordsLabel = document.getElementById('edit-point-coords');
        if (coordsLabel) coordsLabel.textContent = 'Координати: -';
        document.getElementById('edit-point-photo-url').value = '';
        document.getElementById('edit-point-photo-file').value = '';
        renderPointPhotoPreview('edit-point-photo-preview');
        renderPointSectionsEditor(editPointSectionsList, []);
        renderTypePreview('edit-point-type', 'edit-point-type-preview');
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
          editingPointPosition = null;
          document.getElementById('edit-point-title').value = '';
          document.getElementById('edit-point-type').value = pointTypes[0]?.code || '';
          document.getElementById('edit-point-district').value = '';
          document.getElementById('edit-point-description').value = '';
          const coordsLabel = document.getElementById('edit-point-coords');
          if (coordsLabel) coordsLabel.textContent = 'Координати: -';
          document.getElementById('edit-point-photo-url').value = '';
          document.getElementById('edit-point-photo-file').value = '';
          renderPointPhotoPreview('edit-point-photo-preview');
          renderPointSectionsEditor(editPointSectionsList, []);
          renderTypePreview('edit-point-type', 'edit-point-type-preview');
          await mapController.refresh();
          await refreshDashboardData();
          await refreshPublicData();
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

  if (routeColorInput) {
    routeColorInput.addEventListener('input', () => {
      mapController?.setLineToolColor?.(routeColorInput.value || DEFAULT_ROUTE_COLOR);
      if (lineColorInput) lineColorInput.value = routeColorInput.value || DEFAULT_ROUTE_COLOR;
      if (!editingRouteId) return;
      const route = dashboardRoutes.find((r) => r.id === editingRouteId);
      if (!route) return;
      route.routeColor = routeColorInput.value || DEFAULT_ROUTE_COLOR;
      mapController?.highlightRoute?.(route);
    });
  }

  if (btnCreateNews) {
    btnCreateNews.addEventListener('click', async () => {
      const payload = {
        title: document.getElementById('news-title-input').value.trim(),
        summary: document.getElementById('news-summary-input').value.trim(),
        link: document.getElementById('news-link-input').value.trim() || null,
        imageUrl: normalizeNewsImageUrl(document.getElementById('news-image-url-input').value.trim()) || null,
        imageFocusY: normalizeNewsImageFocusY(document.getElementById('news-image-focus-y-input')?.value),
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
        imageUrl: normalizeNewsImageUrl(document.getElementById('news-image-url-input').value.trim()) || null,
        imageFocusY: normalizeNewsImageFocusY(document.getElementById('news-image-focus-y-input')?.value),
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
          deleteRouteColor(editingRouteId);
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
  const newsPrev = document.getElementById('news-prev');
  const newsNext = document.getElementById('news-next');
  const proposalPrev = document.getElementById('proposal-prev');
  const proposalNext = document.getElementById('proposal-next');

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
  if (newsPrev) {
    newsPrev.addEventListener('click', () => {
      newsPage = Math.max(1, newsPage - 1);
      renderNews();
      saveUiState();
    });
  }
  if (newsNext) {
    newsNext.addEventListener('click', () => {
      newsPage += 1;
      renderNews();
      saveUiState();
    });
  }
  if (proposalPrev) {
    proposalPrev.addEventListener('click', () => {
      proposalPage = Math.max(1, proposalPage - 1);
      renderDashboard(dashboardPoints, dashboardRoutes);
      saveUiState();
    });
  }
  if (proposalNext) {
    proposalNext.addEventListener('click', () => {
      proposalPage += 1;
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
  const heroEnterTrigger = document.getElementById('hero-enter-trigger');
  const heroHighlightButtons = document.querySelectorAll('[data-hero-target]');
  const btnLogoHome = document.getElementById('btn-logo-home');
  const heroSection = document.querySelector('.hero');
  const appInterface = document.querySelector('.app-interface');
  let isTransitioning = false;
  let mapToolsInitialized = false;

  const scrollToInterfaceSection = (targetId) => {
    const target = targetId ? document.getElementById(targetId) : null;
    const finalTarget = target || document.querySelector('.map-container');
    if (finalTarget) {
      const offsetTop = Math.max(0, finalTarget.getBoundingClientRect().top + window.scrollY - 90);
      window.scrollTo({ top: offsetTop, behavior: 'smooth' });
    }
  };

  const initMapAndTools = async () => {
    if (!mapToolsInitialized) {
      mapController = await initMap({
        fetchPoints: async (filter) => {
          const query = new URLSearchParams();
          if (filter.type && filter.type !== 'all') {
            query.set('type', filter.type);
          }
          if (filter.certified) {
            query.set('certified', 'true');
          }
          const points = await apiRequest(`/api/points${query.toString() ? `?${query.toString()}` : ''}`);
          return (points || []).map((point) => normalizePointRecord(point));
        },
      });
      const filterMenuNode = document.getElementById('filter-menu');
      const mapViewNode = document.querySelector('.map-view');
      if (filterMenuNode && mapViewNode && filterMenuNode.parentElement !== mapViewNode) {
        mapViewNode.appendChild(filterMenuNode);
      }
      bindFilterMenu();
      bindLegendPointsSync();
      bindSpecialistTools();
      bindSpecialistTabs();
      bindDashboardActions();
      bindSearchAndPager();
      bindFloatingUiControls();
      applySavedUiState();
      mapToolsInitialized = true;
    }

    await refreshPublicData();

    if (!selectedDistrict && !selectedCommunity) {
      mapController?.clearFocusBoundary?.();
      mapController?.focusLocation?.(ODESA_START_FOCUS.lat, ODESA_START_FOCUS.lng, ODESA_START_FOCUS.zoom);
      const communitySelect = document.getElementById('community-select');
      if (communitySelect) communitySelect.value = '';
    }

    if (authUser && ['admin', 'specialist'].includes(authUser.role)) {
      setAuthState(authToken, authUser);
      await refreshDashboardData();
    } else {
      dashboardProposals = [];
      renderDashboard([], []);
      resetRouteEditor();
    }

    if (selectedDistrict || selectedCommunity) {
      if (selectedCommunity) {
        const geo = await geocodeCommunity(selectedDistrict, selectedCommunity);
        const hasBoundary = geo?.geojson ? mapController?.setFocusBoundary?.(geo.geojson) : false;
        if (geo && hasBoundary) {
          mapController?.focusBoundary?.({ maxZoom: 13 });
        } else if (geo) {
          mapController?.focusLocation?.(geo.lat, geo.lng, geo.zoom || 13);
        }
      } else if (selectedDistrict && DISTRICT_CENTERS[selectedDistrict]) {
        const center = DISTRICT_CENTERS[selectedDistrict];
        mapController?.focusLocation?.(center.lat, center.lng, center.zoom || 11);
      }
      populateCommunitiesSelect();
    }
  };

  const transitionToMap = (targetId = 'map') => {
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
        setTimeout(() => scrollToInterfaceSection(targetId), 60);
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

  const handleHeroEnter = (event, targetId = 'map') => {
    event?.preventDefault?.();
    transitionToMap(targetId);
  };

  if (btnEnter) {
    btnEnter.addEventListener('click', (event) => handleHeroEnter(event, 'map'));
    btnEnter.addEventListener('pointerup', (event) => handleHeroEnter(event, 'map'));
    if (heroEnterTrigger) {
      heroEnterTrigger.addEventListener('click', (event) => handleHeroEnter(event, 'map'));
      heroEnterTrigger.setAttribute('role', 'button');
      heroEnterTrigger.setAttribute('tabindex', '0');
      heroEnterTrigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          transitionToMap('map');
        }
      });
    }

    window.addEventListener(
      'wheel',
      (e) => {
        if (e.deltaY > 50 && heroSection.style.display !== 'none') transitionToMap('map');
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
          transitionToMap('map');
        }
      },
      { passive: false }
    );
  } else if (isMapApp) {
    await initMapAndTools();
  }

  heroHighlightButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      const targetId = button.getAttribute('data-hero-target') || 'map';
      handleHeroEnter(event, targetId);
    });
  });

  if (btnLogoHome && heroSection && appInterface) {
    const openHero = (event) => {
      event?.preventDefault?.();
      heroSection.style.display = '';
      heroSection.style.opacity = '1';
      heroSection.style.transform = '';
      appInterface.style.display = 'none';
      appInterface.style.opacity = '0';
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    };
    btnLogoHome.addEventListener('click', openHero);
    btnLogoHome.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openHero(e);
      }
    });
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
  const btnProposalScroll = document.getElementById('btn-proposal-scroll');
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
  if (btnProposalScroll) {
    btnProposalScroll.addEventListener('click', (e) => {
      e.preventDefault();
      const proposalSection = document.getElementById('proposal-section');
      if (proposalSection) {
        proposalSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  updateLanguage(currentLang);
  if (authUser && authToken && (!authSession || !authSession.access_token || !authSession.refresh_token)) {
    setAuthState('', null);
  }
  if (authSession && authSession.access_token && authSession.refresh_token) {
    try {
      await dataService.restoreAuthSession?.(authSession);
    } catch (_e) {
      setAuthState('', null);
    }
  }
  bindAuthFlow();
  bindPublicProposalForm();
});
