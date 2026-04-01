import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const ODESA_START = { lng: 30.7233, lat: 46.4825, zoom: 10.8 };
const MAPBOX_STYLES = {
  standard: 'mapbox://styles/mapbox/standard',
  light: 'mapbox://styles/mapbox/light-v11',
  streets: 'mapbox://styles/mapbox/streets-v12',
  dark: 'mapbox://styles/mapbox/dark-v11',
};
const POINT_TYPE_MARKER_FILE = {
  school: 'education.svg',
  administration: 'administration.svg',
  trade_objects: 'trade_objects.svg',
  cnap: 'cnap.svg',
  fuel_station: 'fuel_station.svg',
  pharmacy: 'pharmacy.svg',
  bank: 'bank.svg',
  station: 'station.svg',
  housing: 'housing.svg',
  stop_a: 'stop_a.svg',
  stop_p: 'stop_p.svg',
  stop_t: 'stop_t.svg',
  transport_stop: 'stop_t.svg',
  cafe: 'cafe.svg',
  culture: 'culture.svg',
  playground: 'playground.svg',
  medical: 'medical.svg',
  education: 'education.svg',
  street: 'crossing.svg',
  square: 'crossing.svg',
  hotel: 'hotel.svg',
  park: 'park.svg',
  hairdresser: 'hairdresser.svg',
  post: 'post.svg',
  restaurant: 'restaurant.svg',
  social_services: 'social_services.svg',
  sport: 'sport.svg',
  shelter: 'shelter.svg',
  other: 'social_services.svg',
};
const ZOOM_SWITCH = {
  clusterMax: 10.8,
  svgMin: 13.0,
};
let map = null;
let pointsLoaded = false;
let is3DMode = false;
let allPoints = [];
let currentStyleKey = 'standard';
let pointsBridgeBound = false;
const domPointMarkers = new Map();
let markerVisualBound = false;
let markerVisualRaf = 0;
let markerVisualMode = 'cluster';
let unclusteredClickBound = false;
let focusBoundaryData = {
  type: 'FeatureCollection',
  features: [],
};
const MARKER_MODULES = import.meta.glob('../assets/markers/*.svg', { eager: true, import: 'default' });
const RAW_MARKER_URL_BY_FILE = Object.fromEntries(
  Object.entries(MARKER_MODULES).map(([modulePath, url]) => [modulePath.split('/').pop(), url])
);
const EXPECTED_MARKER_FILES = [
  'administration.svg',
  'trade_objects.svg',
  'cnap.svg',
  'fuel_station.svg',
  'pharmacy.svg',
  'bank.svg',
  'station.svg',
  'hotel.svg',
  'housing.svg',
  'stop_a.svg',
  'stop_p.svg',
  'stop_t.svg',
  'cafe.svg',
  'culture.svg',
  'playground.svg',
  'medical.svg',
  'education.svg',
  'park.svg',
  'hairdresser.svg',
  'post.svg',
  'crossing.svg',
  'restaurant.svg',
  'social_services.svg',
  'sport.svg',
  'shelter.svg',
];
const MARKER_LOCALIZED_CANDIDATES = {
  'administration.svg': ['адміністрація.svg'],
  'trade_objects.svg': ["об'єкти торгівлі 01.svg", 'обєкти торгівлі 01.svg', "об'єкти торгівлі.svg"],
  'cnap.svg': ['цнап.svg'],
  'fuel_station.svg': ['азс.svg'],
  'pharmacy.svg': ['аптека.svg'],
  'bank.svg': ['банк.svg'],
  'station.svg': ['вокзал.svg'],
  'hotel.svg': ['готель.svg'],
  'housing.svg': ['житло.svg'],
  'stop_a.svg': ['зупинка а.svg'],
  'stop_p.svg': ['зупинка п.svg'],
  'stop_t.svg': ['зупинка т.svg'],
  'cafe.svg': ['кафе.svg'],
  'culture.svg': ['культура.svg'],
  'playground.svg': ['майданчик.svg'],
  'medical.svg': ['мед заклад.svg'],
  'education.svg': ['навчал заклад.svg'],
  'park.svg': ['парк.svg'],
  'hairdresser.svg': ['перукарня.svg'],
  'post.svg': ['пошта.svg'],
  'crossing.svg': ['пішохідний перехід.svg'],
  'restaurant.svg': ['ресторан.svg'],
  'social_services.svg': ['соціальні послуги.svg'],
  'sport.svg': ['спорт.svg'],
  'shelter.svg': ['укриття.svg'],
};

function normalizeMarkerFileKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const RAW_MARKER_URL_BY_NORMALIZED_FILE = Object.fromEntries(
  Object.entries(RAW_MARKER_URL_BY_FILE).map(([fileName, url]) => [normalizeMarkerFileKey(fileName), url])
);

const MARKER_URL_BY_FILE = EXPECTED_MARKER_FILES.reduce((acc, expectedFileName) => {
  const expectedNormalized = normalizeMarkerFileKey(expectedFileName);
  const candidates = [expectedFileName, ...(MARKER_LOCALIZED_CANDIDATES[expectedFileName] || [])];
  let resolvedUrl = RAW_MARKER_URL_BY_NORMALIZED_FILE[expectedNormalized] || '';
  if (!resolvedUrl) {
    resolvedUrl = candidates
      .map((candidate) => RAW_MARKER_URL_BY_NORMALIZED_FILE[normalizeMarkerFileKey(candidate)])
      .find(Boolean);
  }
  if (resolvedUrl) {
    acc[expectedFileName] = resolvedUrl;
  }
  return acc;
}, {});

function ensureStatusNode() {
  let node = document.getElementById('mapbox-status');
  if (node) return node;
  const wrap = document.getElementById('mapbox-preview-wrap');
  if (!wrap) return null;
  node = document.createElement('div');
  node.id = 'mapbox-status';
  node.className = 'mapbox-status';
  wrap.appendChild(node);
  return node;
}

function getToken() {
  return (
    import.meta.env.VITE_MAPBOX_TOKEN
    || window.MAPBOX_TOKEN
    || localStorage.getItem('mapbox_token')
    || ''
  );
}

function setStatus(message = '') {
  const node = ensureStatusNode();
  if (!node) return;
  const finalMessage = String(message || 'Mapbox active');
  node.style.display = 'block';
  node.textContent = finalMessage;
}

function normalizeApiPoint(point) {
  const pointType = point?.pointType || point?.point_type || null;
  const latRaw = point?.lat ?? point?.latitude ?? point?.point_lat ?? point?.y;
  const lngRaw = point?.lng ?? point?.lon ?? point?.longitude ?? point?.point_lng ?? point?.x;
  return {
    id: point?.id ?? null,
    title: point?.title || '',
    lat: Number(latRaw),
    lng: Number(lngRaw),
    color: String(
      point?.pointType?.color
      || point?.point_type?.color
      || point?.pointTypeColor
      || '#E7C769'
    ),
    pointType: pointType
      ? { code: pointType.code || pointType?.id || '' }
      : { code: '' },
  };
}

function resolvePointMarkerUrl(point) {
  const code = String(point?.pointType?.code || '').trim();
  const fileName = POINT_TYPE_MARKER_FILE[code] || POINT_TYPE_MARKER_FILE.other;
  return MARKER_URL_BY_FILE[fileName] || MARKER_URL_BY_FILE['social_services.svg'] || '';
}

function clearDomPointMarkers() {
  if (!domPointMarkers.size) return;
  domPointMarkers.forEach(({ marker }) => {
    try {
      marker.remove();
    } catch (_e) {
      // noop
    }
  });
  domPointMarkers.clear();
}

function buildPointMarkerKey(point, index = 0) {
  const id = Number(point?.id);
  if (Number.isFinite(id) && id > 0) return `id:${id}`;
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  return `idx:${index}:${lat.toFixed(6)}:${lng.toFixed(6)}`;
}

function updateDomMarkerVisualScale() {
  markerVisualRaf = 0;
  if (!map) return;
  const z = Number(map.getZoom() || 10);
  const isClusterMode = z < ZOOM_SWITCH.clusterMax;
  const isSvgMode = z >= ZOOM_SWITCH.svgMin;
  markerVisualMode = isClusterMode ? 'cluster' : isSvgMode ? 'svg' : 'dot';
  const size = isSvgMode ? Math.max(18, Math.min(30, 18 + (z - ZOOM_SWITCH.svgMin) * 2.1)) : Math.max(7, Math.min(14, 7 + (z - 9) * 1.2));
  const opacity = isClusterMode ? 0 : 1;
  const container = map.getContainer?.();
  if (!container) return;
  container.style.setProperty('--mapbox-point-size', `${size.toFixed(2)}px`);
  container.style.setProperty('--mapbox-point-opacity', `${opacity}`);
  container.dataset.pointMode = markerVisualMode;

  const clusterVisibility = isClusterMode ? 'visible' : 'none';
  const circleVisibility = isClusterMode ? 'visible' : 'none';
  ['preview-clusters', 'preview-cluster-count'].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', clusterVisibility);
    }
  });
  if (map.getLayer('preview-unclustered')) {
    map.setLayoutProperty('preview-unclustered', 'visibility', circleVisibility);
  }

  domPointMarkers.forEach(({ element, point }) => {
    if (!element) return;
    element.classList.toggle('is-hidden', isClusterMode);
    element.classList.toggle('is-svg', !isClusterMode && isSvgMode);
    element.classList.toggle('is-dot', !isClusterMode && !isSvgMode);
    if (!isClusterMode && isSvgMode) {
      const markerUrl = resolvePointMarkerUrl(point);
      const img = element.querySelector('img');
      if (img && markerUrl) {
        if (img.getAttribute('src') !== markerUrl) {
          img.setAttribute('src', markerUrl);
        }
      } else if (!markerUrl) {
        element.classList.remove('is-svg');
        element.classList.add('is-dot');
      }
    }
  });
}

function scheduleDomMarkerVisualScale() {
  if (markerVisualRaf) return;
  markerVisualRaf = requestAnimationFrame(updateDomMarkerVisualScale);
}

function bindMarkerVisualScale() {
  if (!map || markerVisualBound) return;
  markerVisualBound = true;
  map.on('zoom', scheduleDomMarkerVisualScale);
  map.on('zoomend', scheduleDomMarkerVisualScale);
  map.on('moveend', scheduleDomMarkerVisualScale);
  scheduleDomMarkerVisualScale();
}

function syncDomPointMarkers() {
  if (!map) return;
  bindMarkerVisualScale();

  const nextKeys = new Set();
  const points = Array.isArray(allPoints) ? allPoints : [];
  points.forEach((point, index) => {
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const key = buildPointMarkerKey(point, index);
    nextKeys.add(key);
    const existing = domPointMarkers.get(key);
    if (existing?.marker) {
      existing.marker.setLngLat([lng, lat]);
      if (existing.element) {
        existing.element.style.setProperty('--point-color', point?.color || '#E7C769');
        existing.element.setAttribute('title', String(point?.title || 'Point'));
      }
      existing.point = point;
      return;
    }

    const markerEl = document.createElement('div');
    markerEl.className = 'mapbox-dom-point';
    markerEl.style.setProperty('--point-color', point?.color || '#E7C769');
    markerEl.setAttribute('title', String(point?.title || 'Point'));
    markerEl.innerHTML = '<span class="dot"></span><img alt="" loading="lazy" decoding="async" />';
    markerEl.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.dispatchEvent(
        new CustomEvent('mapbox:point-click', {
          detail: { pointId: Number(point?.id) || null },
        })
      );
    });

    const marker = new mapboxgl.Marker({
      element: markerEl,
      anchor: 'center',
    })
      .setLngLat([lng, lat])
      .addTo(map);

    domPointMarkers.set(key, { marker, element: markerEl, point });
  });

  Array.from(domPointMarkers.entries()).forEach(([key, value]) => {
    if (nextKeys.has(key)) return;
    try {
      value.marker?.remove?.();
    } catch (_e) {
      // noop
    }
    domPointMarkers.delete(key);
  });
  scheduleDomMarkerVisualScale();
}

function collectGeometryCoords(geometry, acc = []) {
  if (!geometry || typeof geometry !== 'object') return acc;
  const scan = (node) => {
    if (!Array.isArray(node)) return;
    if (node.length >= 2 && Number.isFinite(Number(node[0])) && Number.isFinite(Number(node[1]))) {
      acc.push([Number(node[0]), Number(node[1])]);
      return;
    }
    node.forEach(scan);
  };
  scan(geometry.coordinates);
  return acc;
}

function computeBoundsFromGeometry(geometry) {
  const coords = collectGeometryCoords(geometry, []);
  if (!coords.length) return null;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  coords.forEach(([lng, lat]) => {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  });
  return new mapboxgl.LngLatBounds([minLng, minLat], [maxLng, maxLat]);
}

function toPointFeature(point) {
  const lng = Number(point?.lng);
  const lat = Number(point?.lat);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: {
      id: Number(point?.id) || null,
      title: String(point?.title || ''),
      pointType: String(point?.pointType?.code || point?.pointTypeCode || ''),
    },
  };
}

async function fetchPointsFallback() {
  try {
    const response = await fetch('/api/points');
    if (!response.ok) return [];
    const rows = await response.json();
    if (!Array.isArray(rows)) return [];
    return rows.map(normalizeApiPoint);
  } catch (_e) {
    return [];
  }
}

function bindPointsBridge() {
  if (pointsBridgeBound || typeof window === 'undefined') return;
  pointsBridgeBound = true;

  window.addEventListener('map:points-updated', (event) => {
    const rows = Array.isArray(event?.detail) ? event.detail : [];
    allPoints = rows.map(normalizeApiPoint);
    if (!map || !map.isStyleLoaded()) return;
    if (!pointsLoaded) {
      ensurePointsLayer().catch(() => null);
      return;
    }
    updatePointsSource();
  });
}

function buildPointFeatureCollection() {
  return {
    type: 'FeatureCollection',
    features: allPoints.map(toPointFeature).filter(Boolean),
  };
}

async function ensurePointsLayer() {
  if (!map || pointsLoaded || !map.isStyleLoaded()) return;
  if (!allPoints.length) {
    allPoints = await fetchPointsFallback();
  }
  const pointCollection = buildPointFeatureCollection();

  if (!map.getSource('preview-points')) {
    map.addSource('preview-points', {
      type: 'geojson',
      data: pointCollection,
      cluster: true,
      clusterRadius: 55,
      clusterMaxZoom: 11,
    });
  }

  if (!map.getLayer('preview-clusters')) {
    map.addLayer({
      id: 'preview-clusters',
      type: 'circle',
      source: 'preview-points',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#13315C',
        'circle-stroke-color': '#FFFFFF',
        'circle-stroke-width': 2,
        'circle-opacity': 0.88,
        'circle-radius': [
          'step',
          ['get', 'point_count'],
          16,
          30,
          20,
          100,
          24,
        ],
      },
    });
  }

  if (!map.getLayer('preview-cluster-count')) {
    map.addLayer({
      id: 'preview-cluster-count',
      type: 'symbol',
      source: 'preview-points',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['to-string', ['get', 'point_count']],
        'text-size': 12,
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      },
      paint: {
        'text-color': '#FFFFFF',
      },
    });
  }

  if (!map.getLayer('preview-unclustered')) {
    map.addLayer({
      id: 'preview-unclustered',
      type: 'circle',
      source: 'preview-points',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': '#E7C769',
        'circle-stroke-color': '#13315C',
        'circle-stroke-width': 1,
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          6,
          3,
          11,
          5,
          14,
          7,
        ],
      },
    });
  }

  pointsLoaded = true;
  setStatus(`Mapbox points: ${pointCollection.features.length}`);
  if (!unclusteredClickBound && map.getLayer('preview-unclustered')) {
    unclusteredClickBound = true;
    map.on('click', 'preview-unclustered', (event) => {
      const feature = event?.features?.[0];
      const pointId = Number(feature?.properties?.id);
      window.dispatchEvent(
        new CustomEvent('mapbox:point-click', {
          detail: { pointId: Number.isFinite(pointId) ? pointId : null },
        })
      );
    });
  }
}

function updatePointsSource() {
  if (!map || !map.isStyleLoaded()) return;
  const source = map.getSource('preview-points');
  if (!source?.setData) {
    pointsLoaded = false;
    ensurePointsLayer().catch(() => null);
    syncDomPointMarkers();
    return;
  }
  const collection = buildPointFeatureCollection();
  source.setData(collection);
  syncDomPointMarkers();
  setStatus(`Mapbox points: ${collection.features.length}`);
}

function ensure3DBuildingsLayer() {
  if (!map || !map.isStyleLoaded()) return;
  const layerId = 'preview-3d-buildings';
  if (map.getLayer(layerId)) return;
  if (!map.getSource('composite')) return;
  const styleLayers = map.getStyle()?.layers || [];
  const labelLayerId = styleLayers.find((l) => l.type === 'symbol' && l.layout?.['text-field'])?.id;
  map.addLayer(
    {
      id: layerId,
      source: 'composite',
      'source-layer': 'building',
      filter: ['==', ['get', 'extrude'], 'true'],
      type: 'fill-extrusion',
      minzoom: 13,
      paint: {
        'fill-extrusion-color': '#c9d5e5',
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 15.5, ['get', 'height']],
        'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 13, 0, 15.5, ['get', 'min_height']],
        'fill-extrusion-opacity': 0.78,
      },
    },
    labelLayerId
  );
}

function ensureFocusBoundaryLayers() {
  if (!map || !map.isStyleLoaded()) return;

  if (!map.getSource('preview-focus-boundary')) {
    map.addSource('preview-focus-boundary', {
      type: 'geojson',
      data: focusBoundaryData,
    });
  }

  if (!map.getLayer('preview-focus-fill')) {
    map.addLayer({
      id: 'preview-focus-fill',
      type: 'fill',
      source: 'preview-focus-boundary',
      paint: {
        'fill-color': '#3B82F6',
        'fill-opacity': 0.1,
      },
    });
  }

  if (!map.getLayer('preview-focus-line')) {
    map.addLayer({
      id: 'preview-focus-line',
      type: 'line',
      source: 'preview-focus-boundary',
      paint: {
        'line-color': '#1D4ED8',
        'line-width': 2,
      },
    });
  }
}

function updateFocusBoundarySource() {
  if (!map) return;
  ensureFocusBoundaryLayers();
  const source = map.getSource('preview-focus-boundary');
  if (source?.setData) source.setData(focusBoundaryData);
}

export function setMapboxFocusBoundary(geometry) {
  if (!geometry) return false;
  focusBoundaryData = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry }],
  };
  updateFocusBoundarySource();
  return true;
}

export function clearMapboxFocusBoundary() {
  focusBoundaryData = { type: 'FeatureCollection', features: [] };
  updateFocusBoundarySource();
}

export function focusMapboxBoundary({ maxZoom = 12, padding = 44 } = {}) {
  if (!map || !focusBoundaryData.features.length) return false;
  const geometry = focusBoundaryData.features[0]?.geometry;
  const bounds = computeBoundsFromGeometry(geometry);
  if (!bounds) return false;
  map.fitBounds(bounds, {
    padding,
    maxZoom,
    duration: 420,
    essential: true,
  });
  return true;
}

export function focusMapboxLocation(lat, lng, zoom = 12) {
  if (!map || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  map.easeTo({ center: [lng, lat], zoom, duration: 380, essential: true });
  return true;
}

export function resetMapboxView() {
  if (!map) return false;
  map.easeTo({ center: [ODESA_START.lng, ODESA_START.lat], zoom: ODESA_START.zoom, duration: 420, essential: true });
  return true;
}

export function setMapboxPerspective(enabled) {
  is3DMode = Boolean(enabled);
  if (!map) return false;
  if (map.isStyleLoaded()) ensure3DBuildingsLayer();
  map.easeTo({
    pitch: is3DMode ? 58 : 0,
    bearing: is3DMode ? -18 : 0,
    duration: 420,
    essential: true,
  });
  return true;
}

export function getMapboxPerspective() {
  return is3DMode;
}

export function getMapboxStyleKey() {
  return currentStyleKey;
}

function getTimePreset() {
  const hour = new Date().getHours();
  if (hour >= 7 && hour < 18) return 'day';
  if (hour >= 18 && hour < 22) return 'dusk';
  return 'night';
}

function applyTimePreset() {
  if (!map || !map.isStyleLoaded() || typeof map.setConfigProperty !== 'function') return;
  try {
    map.setConfigProperty('basemap', 'lightPreset', getTimePreset());
    map.setConfigProperty('basemap', 'showPointOfInterestLabels', true);
    map.setConfigProperty('basemap', 'showRoadLabels', true);
  } catch (_e) {
    // ignore on unsupported style/runtime
  }
}

export function setMapboxPoints(points = []) {
  allPoints = (Array.isArray(points) ? points : []).map(normalizeApiPoint);
  if (typeof window !== 'undefined') {
    window.__ODESA_POINTS_CACHE = allPoints;
  }
  syncDomPointMarkers();
  if (!map) return;
  if (!pointsLoaded) return;
  updatePointsSource();
}

async function handleStyleReady() {
  if (!map || !map.isStyleLoaded()) return;
  setStatus('Mapbox: style loaded');
  try {
    applyTimePreset();
  } catch (_e) {
    // noop
  }
  try {
    ensureFocusBoundaryLayers();
    updateFocusBoundarySource();
  } catch (_e) {
    // noop
  }
  try {
    ensure3DBuildingsLayer();
  } catch (_e) {
    // do not block points render
  }
  try {
    await ensurePointsLayer();
    updatePointsSource();
  } catch (_e) {
    setStatus('Mapbox: points layer error');
  }
  syncDomPointMarkers();
  if (is3DMode) {
    try {
      setMapboxPerspective(true);
    } catch (_e) {
      // noop
    }
  }
}

export async function setMapboxStyle(styleKey = 'standard') {
  if (!map) return false;
  const nextKey = MAPBOX_STYLES[styleKey] ? styleKey : 'standard';
  if (currentStyleKey === nextKey) return true;
  currentStyleKey = nextKey;
  pointsLoaded = false;
  map.setStyle(MAPBOX_STYLES[nextKey]);
  return true;
}

export async function ensureMapboxPreview() {
  const container = document.getElementById('mapbox-map');
  if (!container) return { ok: false, reason: 'no_container' };

  const token = getToken();
  if (!token) {
    setStatus('Mapbox token missing. Set VITE_MAPBOX_TOKEN or localStorage.setItem("mapbox_token", "...")');
    return { ok: false, reason: 'no_token' };
  }

  mapboxgl.accessToken = token;
  setStatus('Mapbox: initializing...');
  bindPointsBridge();

  if (!map) {
    map = new mapboxgl.Map({
      container,
      style: MAPBOX_STYLES[currentStyleKey],
      center: [ODESA_START.lng, ODESA_START.lat],
      zoom: ODESA_START.zoom,
      pitchWithRotate: false,
      dragRotate: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), 'bottom-right');

    map.on('style.load', () => {
      handleStyleReady().catch(() => null);
    });
    map.on('load', () => {
      handleStyleReady().catch(() => null);
    });
    map.on('remove', () => {
      clearDomPointMarkers();
    });
  } else {
    map.resize();
    if (map.isStyleLoaded()) await handleStyleReady();
  }

  if (!allPoints.length && typeof window !== 'undefined' && Array.isArray(window.__ODESA_POINTS_CACHE)) {
    allPoints = window.__ODESA_POINTS_CACHE.map(normalizeApiPoint);
    if (map.isStyleLoaded()) {
      if (!pointsLoaded) await ensurePointsLayer();
      updatePointsSource();
    }
  }
  syncDomPointMarkers();

  return { ok: true, map };
}

export function resizeMapboxPreview() {
  if (!map) return;
  map.resize();
}
