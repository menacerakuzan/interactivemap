import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

const ODESA_START = { lng: 30.7233, lat: 46.4825, zoom: 10.8 };
const MAPBOX_STYLES = {
  custom: 'mapbox://styles/menacerakuzan/cmnfv8tm5004y01s743klc24x',
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
  clusterEnter: 10.85,
  clusterExit: 11.1,
  svgEnter: 13.1,
  svgExit: 12.85,
};
let map = null;
let mapInitialStyleReady = false;
let pointsLoaded = false;
let is3DMode = false;
let allPoints = [];
let currentStyleKey = 'custom';
let pointsBridgeBound = false;
const domPointMarkers = new Map();
let markerVisualBound = false;
let markerVisualRaf = 0;
let markerVisualMode = 'cluster';
let markerBlendValue = 0;
let markerBlendTarget = 0;
let markerBlendRaf = 0;
let unclusteredClickBound = false;
let draw = null;
let drawBound = false;
let drawVisible = false;
let drawMode = 'cursor';
let drawSnapEnabled = true;
let drawLineStyle = 'dashed';
let drawLineColor = '#E7C769';
let drawHistory = [];
let drawMutating = false;
let curvePreviewData = { type: 'FeatureCollection', features: [] };
let hiddenPointTypeCodes = new Set();
let publishedRoutes = [];
let routeRenderTimer = 0;
let routeRenderRetryCount = 0;
let pointPickMode = false;
let pointPickCallback = null;
let focusBoundaryData = {
  type: 'FeatureCollection',
  features: [],
};
const MARKER_MODULES = import.meta.glob('../assets/markers/*.svg', { import: 'default' });
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

const RAW_MARKER_IMPORTER_BY_NORMALIZED_FILE = Object.fromEntries(
  Object.entries(MARKER_MODULES).map(([modulePath, importer]) => [normalizeMarkerFileKey(modulePath.split('/').pop()), importer])
);

const MARKER_IMPORTER_BY_FILE = EXPECTED_MARKER_FILES.reduce((acc, expectedFileName) => {
  const expectedNormalized = normalizeMarkerFileKey(expectedFileName);
  const candidates = [expectedFileName, ...(MARKER_LOCALIZED_CANDIDATES[expectedFileName] || [])];
  let resolvedImporter = RAW_MARKER_IMPORTER_BY_NORMALIZED_FILE[expectedNormalized] || null;
  if (!resolvedImporter) {
    resolvedImporter = candidates
      .map((candidate) => RAW_MARKER_IMPORTER_BY_NORMALIZED_FILE[normalizeMarkerFileKey(candidate)] || null)
      .find(Boolean);
  }
  if (resolvedImporter) {
    acc[expectedFileName] = resolvedImporter;
  }
  return acc;
}, {});
const MARKER_URL_CACHE = new Map();
const MARKER_URL_PROMISE_CACHE = new Map();
const DRAW_SOURCE_COLD = 'mapbox-gl-draw-cold';
const DRAW_SOURCE_HOT = 'mapbox-gl-draw-hot';
const DRAW_LINE_LAYER_IDS = ['gl-draw-line-inactive', 'gl-draw-line-active', 'gl-draw-line-static'];

function catmullRomSpline(coords = [], segments = 14) {
  if (!Array.isArray(coords) || coords.length < 3) return coords;
  const pts = coords
    .map((pair) => [Number(pair[0]), Number(pair[1])])
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
  if (pts.length < 3) return pts;

  const result = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;

    for (let j = 0; j < segments; j += 1) {
      const t = j / segments;
      const t2 = t * t;
      const t3 = t2 * t;
      const lng = 0.5 * (
        (2 * p1[0]) +
        (-p0[0] + p2[0]) * t +
        (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
        (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
      );
      const lat = 0.5 * (
        (2 * p1[1]) +
        (-p0[1] + p2[1]) * t +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
      );
      result.push([lng, lat]);
    }
  }
  result.push(pts[pts.length - 1]);
  return result;
}

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

function normalizeBearingDeg(value = 0) {
  let bearing = Number(value) || 0;
  while (bearing > 180) bearing -= 360;
  while (bearing < -180) bearing += 360;
  return bearing;
}

function maybeSnapBearingToNorth() {
  if (!map) return;
  const current = normalizeBearingDeg(map.getBearing());
  const SNAP_THRESHOLD = 16;
  if (Math.abs(current) > SNAP_THRESHOLD) return;
  map.easeTo({
    bearing: 0,
    duration: 220,
    essential: true,
  });
}

function syncPointPickUi() {
  const container = map?.getContainer?.();
  if (!container) return;
  container.classList.toggle('point-pick', Boolean(pointPickMode));
}

function syncMapGestureStateForLineTool() {
  if (!map) return;
  const editingModes = new Set(['draw', 'curve', 'edit', 'erase']);
  const lockPan = drawVisible && editingModes.has(drawMode);

  if (lockPan) {
    map.dragPan?.disable?.();
    map.doubleClickZoom?.disable?.();
    map.boxZoom?.disable?.();
  } else {
    map.dragPan?.enable?.();
    map.doubleClickZoom?.enable?.();
    map.boxZoom?.enable?.();
  }
}

function setStatus(message = '') {
  if (!import.meta.env?.DEV) return;
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

function isPointTypeHidden(point) {
  const code = String(point?.pointType?.code || point?.pointTypeCode || '').trim();
  return code && hiddenPointTypeCodes.has(code);
}

function getVisiblePoints() {
  return (Array.isArray(allPoints) ? allPoints : []).filter((point) => !isPointTypeHidden(point));
}

function normalizeHexColor(value, fallback = '#E7C769') {
  const raw = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`;
  return fallback;
}

function resolvePointMarkerFileName(point) {
  const code = String(point?.pointType?.code || '').trim();
  return POINT_TYPE_MARKER_FILE[code] || POINT_TYPE_MARKER_FILE.other;
}

async function resolveMarkerUrlByFileName(fileName) {
  const normalizedFileName = String(fileName || '').trim();
  const safeFileName = MARKER_IMPORTER_BY_FILE[normalizedFileName] ? normalizedFileName : 'social_services.svg';
  if (MARKER_URL_CACHE.has(safeFileName)) {
    return MARKER_URL_CACHE.get(safeFileName) || '';
  }
  if (MARKER_URL_PROMISE_CACHE.has(safeFileName)) {
    return MARKER_URL_PROMISE_CACHE.get(safeFileName);
  }
  const importer = MARKER_IMPORTER_BY_FILE[safeFileName];
  if (!importer) return '';

  const pending = Promise.resolve(importer())
    .then((url) => {
      const nextUrl = typeof url === 'string' ? url : '';
      MARKER_URL_CACHE.set(safeFileName, nextUrl);
      MARKER_URL_PROMISE_CACHE.delete(safeFileName);
      return nextUrl;
    })
    .catch(() => {
      MARKER_URL_PROMISE_CACHE.delete(safeFileName);
      return '';
    });

  MARKER_URL_PROMISE_CACHE.set(safeFileName, pending);
  return pending;
}

function resolvePointMarkerUrl(point) {
  const fileName = resolvePointMarkerFileName(point);
  const safeFileName = MARKER_IMPORTER_BY_FILE[fileName] ? fileName : 'social_services.svg';
  return MARKER_URL_CACHE.get(safeFileName) || '';
}

function ensurePointMarkerUrl(point, img) {
  if (!img) return;
  const fileName = resolvePointMarkerFileName(point);
  const cacheHitUrl = resolvePointMarkerUrl(point);
  if (cacheHitUrl) {
    if (img.getAttribute('src') !== cacheHitUrl) {
      img.setAttribute('src', cacheHitUrl);
    }
    return;
  }
  const requestedFile = MARKER_IMPORTER_BY_FILE[fileName] ? fileName : 'social_services.svg';
  if (img.dataset.markerLoading === requestedFile) return;
  img.dataset.markerLoading = requestedFile;
  resolveMarkerUrlByFileName(requestedFile).then((resolvedUrl) => {
    if (!resolvedUrl) return;
    if (img.dataset.markerLoading !== requestedFile) return;
    if (img.getAttribute('src') !== resolvedUrl) {
      img.setAttribute('src', resolvedUrl);
    }
    img.dataset.markerLoading = '';
  });
}

function prefetchVisibleMarkerUrls(maxTypes = 10) {
  const visiblePoints = getVisiblePoints();
  if (!Array.isArray(visiblePoints) || !visiblePoints.length) return;
  const uniqueFiles = Array.from(
    new Set(visiblePoints.map((point) => resolvePointMarkerFileName(point)).filter(Boolean))
  ).slice(0, Math.max(1, Number(maxTypes) || 10));
  uniqueFiles.forEach((fileName) => {
    resolveMarkerUrlByFileName(fileName).catch(() => null);
  });
}

function metersBetween(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function nearestPointFor(lat, lng, maxMeters = 35) {
  let best = null;
  allPoints.forEach((point) => {
    const pLat = Number(point?.lat);
    const pLng = Number(point?.lng);
    if (!Number.isFinite(pLat) || !Number.isFinite(pLng)) return;
    const distance = metersBetween(lat, lng, pLat, pLng);
    if (distance > maxMeters) return;
    if (!best || distance < best.distance) {
      best = { point, lat: pLat, lng: pLng, distance };
    }
  });
  return best;
}

function snapCoordinatePair(pair, maxMeters = 35) {
  const lng = Number(pair?.[0]);
  const lat = Number(pair?.[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!drawSnapEnabled) return [lng, lat];
  const nearest = nearestPointFor(lat, lng, maxMeters);
  if (!nearest) return [lng, lat];
  return [Number(nearest.lng), Number(nearest.lat)];
}

function snapLineCoordinates(coords = []) {
  if (!Array.isArray(coords) || !coords.length) return [];
  return coords
    .map((pair) => snapCoordinatePair(pair, 35))
    .filter((pair) => Array.isArray(pair) && Number.isFinite(Number(pair[0])) && Number.isFinite(Number(pair[1])));
}

function buildCurveControlCoords(coords = []) {
  const clean = (Array.isArray(coords) ? coords : [])
    .map((pair) => [Number(pair?.[0]), Number(pair?.[1])])
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
  if (clean.length < 2) return clean;
  if (clean.length >= 3 && clean.length % 2 === 1) return clean;
  const out = [];
  for (let i = 0; i < clean.length - 1; i += 1) {
    const a = clean[i];
    const b = clean[i + 1];
    out.push(a);
    out.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  }
  out.push(clean[clean.length - 1]);
  return out;
}

function upsertDrawFeature(feature) {
  if (!draw || !feature) return;
  drawMutating = true;
  try {
    draw.add(feature);
  } finally {
    drawMutating = false;
  }
}

function applyDrawStyleToFeature(featureId, curve = null) {
  if (!draw || !featureId) return;
  try {
    draw.setFeatureProperty(featureId, 'edgeStyle', drawLineStyle);
    draw.setFeatureProperty(featureId, 'edgeColor', drawLineColor);
    if (curve !== null) {
      draw.setFeatureProperty(featureId, 'edgeCurve', Boolean(curve));
    }
  } catch (_e) {
    // noop
  }
}

function getDrawLineFeatures() {
  if (!draw) return [];
  const collection = draw.getAll();
  return (collection?.features || []).filter((feature) => feature?.geometry?.type === 'LineString');
}

function eraseNearestVertexAt(point, pixelThreshold = 16) {
  if (!map || !draw || !point || !drawVisible || drawMode !== 'erase') return false;
  const lines = getDrawLineFeatures();
  if (!lines.length) return false;

  const clickPoint = map.project(point);
  let best = null;

  lines.forEach((feature) => {
    const featureId = feature?.id;
    const coords = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : [];
    if (!featureId || coords.length < 2) return;

    coords.forEach((coord, coordIndex) => {
      const lng = Number(coord?.[0]);
      const lat = Number(coord?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const vertexPoint = map.project([lng, lat]);
      const distance = Math.hypot(vertexPoint.x - clickPoint.x, vertexPoint.y - clickPoint.y);
      if (distance > pixelThreshold) return;
      if (!best || distance < best.distance) {
        best = { featureId, coordIndex, distance, coords };
      }
    });
  });

  if (!best) return false;
  const nextCoords = best.coords.filter((_, index) => index !== best.coordIndex);
  if (nextCoords.length < 2) {
    draw.delete(best.featureId);
    pushDrawHistory();
    syncDrawLinePaint();
    updateCurvePreviewFromDraw();
    return true;
  }

  const edgeStyle = drawLineStyle;
  const edgeColor = drawLineColor;
  const edgeCurve = Boolean(draw.get(best.featureId)?.properties?.edgeCurve);
  upsertDrawFeature({
    type: 'Feature',
    id: best.featureId,
    properties: { edgeStyle, edgeColor, edgeCurve },
    geometry: { type: 'LineString', coordinates: snapLineCoordinates(nextCoords) },
  });
  applyDrawStyleToFeature(best.featureId, edgeCurve);
  pushDrawHistory();
  syncDrawLinePaint();
  updateCurvePreviewFromDraw();
  return true;
}

function captureDrawSnapshot() {
  const lines = getDrawLineFeatures();
  const snapshots = lines.map((feature) => {
    const coords = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : [];
    const edgeStyle = feature?.properties?.edgeStyle || drawLineStyle;
    const edgeColor = feature?.properties?.edgeColor || drawLineColor;
    const edgeCurve = Boolean(feature?.properties?.edgeCurve);
    return coords
      .map((pair) => {
        const lng = Number(pair?.[0]);
        const lat = Number(pair?.[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const snap = nearestPointFor(lat, lng, 24);
        return {
          lat,
          lng,
          pointId: snap?.point?.id ? Number(snap.point.id) : null,
          snapped: Boolean(snap),
          edgeStyle,
          edgeColor,
          edgeCurve,
        };
      })
      .filter(Boolean);
  });
  return snapshots.flat();
}

function pushDrawHistory() {
  const snapshot = captureDrawSnapshot();
  drawHistory.push(snapshot);
  if (drawHistory.length > 50) drawHistory.shift();
}

function syncDrawLinePaint() {
  if (!map) return;
  const styleLayers = map.getStyle?.()?.layers || [];
  const dynamicLineLayerIds = styleLayers
    .map((layer) => layer?.id)
    .filter((layerId) => typeof layerId === 'string' && layerId.startsWith('gl-draw-line'));
  const layerIds = Array.from(new Set([...DRAW_LINE_LAYER_IDS, ...dynamicLineLayerIds]));
  layerIds.forEach((layerId) => {
    if (!map.getLayer(layerId)) return;
    map.setPaintProperty(layerId, 'line-color', [
      'coalesce',
      ['get', 'edgeColor'],
      drawLineColor,
    ]);
    map.setPaintProperty(layerId, 'line-dasharray', [
      'case',
      ['==', ['get', 'edgeStyle'], 'solid'],
      ['literal', [1, 0]],
      ['==', ['get', 'edgeStyle'], 'dashdot'],
      ['literal', [2, 1, 0.3, 1]],
      ['literal', [2, 1.4]],
    ]);
    map.setPaintProperty(layerId, 'line-opacity', [
      'case',
      ['==', ['get', 'edgeCurve'], true],
      0.22,
      1,
    ]);
    map.setPaintProperty(layerId, 'line-width', [
      'interpolate',
      ['linear'],
      ['zoom'],
      8,
      2.2,
      12,
      3.2,
      15,
      4.8,
    ]);
  });
}

function ensureCurvePreviewLayer() {
  if (!map || !map.isStyleLoaded()) return;
  if (!map.getSource('preview-draw-curves')) {
    map.addSource('preview-draw-curves', {
      type: 'geojson',
      data: curvePreviewData,
    });
  }
  if (!map.getLayer('preview-draw-curves')) {
    map.addLayer({
      id: 'preview-draw-curves',
      type: 'line',
      source: 'preview-draw-curves',
      paint: {
        'line-color': ['coalesce', ['get', 'edgeColor'], drawLineColor],
        'line-dasharray': [
          'case',
          ['==', ['get', 'edgeStyle'], 'solid'],
          ['literal', [1, 0]],
          ['==', ['get', 'edgeStyle'], 'dashdot'],
          ['literal', [2, 1, 0.3, 1]],
          ['literal', [2, 1.4]],
        ],
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          8,
          2.4,
          12,
          3.5,
          15,
          5.3,
        ],
        'line-opacity': 0.96,
      },
    });
  }
}

function ensureCurveHandlesLayer() {
  if (!map || !map.isStyleLoaded()) return;
  if (!map.getSource('preview-curve-handles')) {
    map.addSource('preview-curve-handles', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!map.getLayer('preview-curve-handles')) {
    map.addLayer({
      id: 'preview-curve-handles',
      type: 'circle',
      source: 'preview-curve-handles',
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10,
          3.5,
          15,
          6.5,
        ],
        'circle-color': '#FFFFFF',
        'circle-stroke-color': '#0EA5E9',
        'circle-stroke-width': 2,
        'circle-opacity': [
          'case',
          ['boolean', ['feature-state', 'active'], false],
          1,
          0.88,
        ],
      },
      layout: {
        visibility: drawMode === 'edit' || drawMode === 'curve' ? 'visible' : 'none',
      },
    });
  }
}

function updateCurvePreviewFromDraw() {
  if (!map) return;
  const handleFeatures = [];
  const features = getDrawLineFeatures()
    .filter((feature) => Boolean(feature?.properties?.edgeCurve))
    .map((feature) => {
      const coords = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : [];
      for (let i = 1; i < coords.length - 1; i += 2) {
        const lng = Number(coords[i]?.[0]);
        const lat = Number(coords[i]?.[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
        handleFeatures.push({
          type: 'Feature',
          properties: { featureId: String(feature?.id || ''), idx: i },
          geometry: { type: 'Point', coordinates: [lng, lat] },
        });
      }
      const smoothed = catmullRomSpline(coords, 14);
      if (smoothed.length < 2) return null;
      return {
        type: 'Feature',
        properties: {
          edgeStyle: feature?.properties?.edgeStyle || drawLineStyle,
          edgeColor: feature?.properties?.edgeColor || drawLineColor,
        },
        geometry: { type: 'LineString', coordinates: smoothed },
      };
    })
    .filter(Boolean);
  curvePreviewData = { type: 'FeatureCollection', features };
  ensureCurvePreviewLayer();
  const source = map.getSource('preview-draw-curves');
  if (source?.setData) source.setData(curvePreviewData);
  ensureCurveHandlesLayer();
  const handleSource = map.getSource('preview-curve-handles');
  if (handleSource?.setData) {
    handleSource.setData({ type: 'FeatureCollection', features: handleFeatures });
  }
  if (map.getLayer('preview-curve-handles')) {
    map.setLayoutProperty(
      'preview-curve-handles',
      'visibility',
      drawVisible && (drawMode === 'edit' || drawMode === 'curve') ? 'visible' : 'none'
    );
  }
}

function ensureDraw() {
  if (!map || draw) return;
  draw = new MapboxDraw({
    displayControlsDefault: false,
    controls: {},
    defaultMode: 'simple_select',
  });
  map.addControl(draw);
}

function bindDrawEvents() {
  if (!map || !draw || drawBound) return;
  drawBound = true;
  map.on('draw.create', (event) => {
    if (drawMutating) return;
    const features = event?.features || [];
    features.forEach((feature) => {
      if (feature?.geometry?.type === 'LineString' && Array.isArray(feature?.geometry?.coordinates)) {
        const snappedCoordinates = snapLineCoordinates(feature.geometry.coordinates);
        const curveReadyCoordinates = drawMode === 'curve' ? buildCurveControlCoords(snappedCoordinates) : snappedCoordinates;
        if (snappedCoordinates.length >= 2) {
          upsertDrawFeature({
            ...feature,
            properties: {
              ...(feature.properties || {}),
              edgeCurve: drawMode === 'curve',
              edgeCurvePrepared: drawMode === 'curve',
            },
            geometry: { ...feature.geometry, coordinates: curveReadyCoordinates },
          });
        }
      }
      if (feature?.id) applyDrawStyleToFeature(feature.id, drawMode === 'curve');
    });
    pushDrawHistory();
    syncDrawLinePaint();
    updateCurvePreviewFromDraw();
  });
  map.on('draw.update', (event) => {
    if (drawMutating) return;
    const features = event?.features || [];
    features.forEach((feature) => {
      if (feature?.geometry?.type === 'LineString' && Array.isArray(feature?.geometry?.coordinates)) {
        const snappedCoordinates = snapLineCoordinates(feature.geometry.coordinates);
        if (snappedCoordinates.length >= 2) {
          upsertDrawFeature({
            ...feature,
            geometry: { ...feature.geometry, coordinates: snappedCoordinates },
          });
        }
      }
    });
    pushDrawHistory();
    syncDrawLinePaint();
    updateCurvePreviewFromDraw();
  });
  map.on('draw.delete', () => {
    pushDrawHistory();
    syncDrawLinePaint();
    updateCurvePreviewFromDraw();
  });
  map.on('click', (event) => {
    if (!event?.lngLat) return;
    eraseNearestVertexAt(event.lngLat);
  });
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
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const z = Number(map.getZoom() || 10);
  const prevMode = markerVisualMode || 'cluster';
  let nextMode = prevMode;

  if (prevMode === 'cluster') {
    if (z >= ZOOM_SWITCH.svgEnter) nextMode = 'svg';
    else nextMode = z >= ZOOM_SWITCH.clusterExit ? 'dot' : 'cluster';
  } else if (prevMode === 'dot') {
    if (z <= ZOOM_SWITCH.clusterEnter) nextMode = 'cluster';
    else if (z >= ZOOM_SWITCH.svgEnter) nextMode = 'svg';
    else nextMode = 'dot';
  } else {
    if (z <= ZOOM_SWITCH.clusterEnter) nextMode = 'cluster';
    else nextMode = z <= ZOOM_SWITCH.svgExit ? 'dot' : 'svg';
  }

  markerVisualMode = nextMode;
  const isClusterMode = markerVisualMode === 'cluster';
  const isSvgMode = markerVisualMode === 'svg';
  const size = isSvgMode
    ? Math.max(18, Math.min(30, 18 + (z - ZOOM_SWITCH.svgEnter) * 2.1))
    : Math.max(7, Math.min(14, 7 + (z - 9) * 1.2));
  const opacity = isClusterMode ? 0 : 1;
  const container = map.getContainer?.();
  if (!container) return;
  container.style.setProperty('--mapbox-point-size', `${size.toFixed(2)}px`);
  container.style.setProperty('--mapbox-point-opacity', `${opacity}`);
  markerBlendTarget = clamp((z - 12.75) / (13.2 - 12.75), 0, 1);
  scheduleMarkerBlend();
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
  const clusterLayersReady = Boolean(map.getLayer('preview-clusters') && map.getLayer('preview-unclustered'));
  const shouldHideDomMarkers = isClusterMode && clusterLayersReady;

  domPointMarkers.forEach(({ element, point }) => {
    if (!element) return;
    element.classList.toggle('is-hidden', shouldHideDomMarkers);
    element.classList.toggle('is-svg', !isClusterMode && isSvgMode);
    element.classList.toggle('is-dot', !isClusterMode && !isSvgMode);
    if (!isClusterMode && isSvgMode) {
      const markerUrl = resolvePointMarkerUrl(point);
      const img = element.querySelector('img');
      if (img && markerUrl) {
        if (img.getAttribute('src') !== markerUrl) {
          img.setAttribute('src', markerUrl);
        }
      } else if (img) {
        ensurePointMarkerUrl(point, img);
      }
    }
  });
}

function scheduleDomMarkerVisualScale() {
  if (markerVisualRaf) return;
  markerVisualRaf = requestAnimationFrame(updateDomMarkerVisualScale);
}

function scheduleMarkerBlend() {
  if (markerBlendRaf) return;
  const animateBlend = () => {
    markerBlendRaf = 0;
    if (!map) return;
    const container = map.getContainer?.();
    if (!container) return;
    const delta = markerBlendTarget - markerBlendValue;
    markerBlendValue += delta * 0.24;
    if (Math.abs(delta) < 0.003) {
      markerBlendValue = markerBlendTarget;
    }
    container.style.setProperty('--mapbox-svg-mix', `${markerBlendValue.toFixed(3)}`);
    if (Math.abs(markerBlendTarget - markerBlendValue) >= 0.003) {
      markerBlendRaf = requestAnimationFrame(animateBlend);
    }
  };
  markerBlendRaf = requestAnimationFrame(animateBlend);
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
  const points = getVisiblePoints();
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

function buildCurvedSegmentCoords(vertices, segmentIndex, steps = 18) {
  const p0 = vertices[Math.max(0, segmentIndex - 1)];
  const p1 = vertices[segmentIndex];
  const p2 = vertices[segmentIndex + 1];
  const p3 = vertices[Math.min(vertices.length - 1, segmentIndex + 2)];
  const points = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const t2 = t * t;
    const t3 = t2 * t;
    const lat =
      0.5 *
      ((2 * p1.lat)
        + (-p0.lat + p2.lat) * t
        + (2 * p0.lat - 5 * p1.lat + 4 * p2.lat - p3.lat) * t2
        + (-p0.lat + 3 * p1.lat - 3 * p2.lat + p3.lat) * t3);
    const lng =
      0.5 *
      ((2 * p1.lng)
        + (-p0.lng + p2.lng) * t
        + (2 * p0.lng - 5 * p1.lng + 4 * p2.lng - p3.lng) * t2
        + (-p0.lng + 3 * p1.lng - 3 * p2.lng + p3.lng) * t3);
    points.push([lng, lat]);
  }
  return points;
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
    features: getVisiblePoints().map(toPointFeature).filter(Boolean),
  };
}

function resolveRoutePathVertices(route) {
  const rawPath =
    Array.isArray(route?.pathJson)
      ? route.pathJson
      : typeof route?.pathJson === 'string'
        ? (() => {
            try {
              const parsed = JSON.parse(route.pathJson);
              return Array.isArray(parsed) ? parsed : [];
            } catch (_e) {
              return [];
            }
          })()
        : Array.isArray(route?.path)
          ? route.path
          : typeof route?.path === 'string'
            ? (() => {
                try {
                  const parsed = JSON.parse(route.path);
                  return Array.isArray(parsed) ? parsed : [];
                } catch (_e) {
                  return [];
                }
              })()
            : [];

  const fromPath = Array.isArray(rawPath)
    ? rawPath
        .map((vertex) => {
          if (!vertex) return null;
          if (Array.isArray(vertex) && vertex.length >= 2) {
            const lng = Number(vertex[0]);
            const lat = Number(vertex[1]);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            return {
              lat,
              lng,
              edgeStyle: 'dashed',
              edgeColor: normalizeHexColor(route?.routeColor, '#E7C769'),
              edgeCurve: false,
            };
          }
          if (typeof vertex !== 'object') return null;
          const lat = Number(vertex.lat ?? vertex.latitude);
          const lng = Number(vertex.lng ?? vertex.lon ?? vertex.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          return {
            lat,
            lng,
            edgeStyle: ['solid', 'dashed', 'dashdot'].includes(vertex.edgeStyle) ? vertex.edgeStyle : 'dashed',
            edgeColor: normalizeHexColor(vertex.edgeColor, normalizeHexColor(route?.routeColor, '#E7C769')),
            edgeCurve: Boolean(vertex.edgeCurve),
          };
        })
        .filter(Boolean)
    : [];
  if (fromPath.length >= 2) return fromPath;

  if (!Array.isArray(route?.points)) return [];
  return route.points
    .map((point) => {
      const lat = Number(point?.lat);
      const lng = Number(point?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        lat,
        lng,
        edgeStyle: 'dashed',
        edgeColor: normalizeHexColor(route?.routeColor, '#E7C769'),
        edgeCurve: false,
      };
    })
    .filter(Boolean);
}

function buildRouteFeatureCollection() {
  const features = [];
  const routes = (Array.isArray(publishedRoutes) ? publishedRoutes : []).filter((route) => {
    const status = String(route?.status || '').trim().toLowerCase();
    if (!status) return true;
    return status !== 'draft' && status !== 'archived';
  });
  routes.forEach((route) => {
    const routeColor = normalizeHexColor(route?.routeColor, '#E7C769');
    const vertices = resolveRoutePathVertices(route);
    if (vertices.length < 2) return;
    for (let index = 1; index < vertices.length; index += 1) {
      const prev = vertices[index - 1];
      const next = vertices[index];
      const coords =
        next.edgeCurve && vertices.length > 2
          ? buildCurvedSegmentCoords(vertices, index - 1)
          : [
              [prev.lng, prev.lat],
              [next.lng, next.lat],
            ];
      if (coords.length < 2) continue;
      features.push({
        type: 'Feature',
        properties: {
          routeId: Number(route.id) || null,
          routeName: String(route.name || ''),
          edgeStyle: ['solid', 'dashed', 'dashdot'].includes(next.edgeStyle) ? next.edgeStyle : 'dashed',
          edgeColor: normalizeHexColor(next.edgeColor, routeColor),
        },
        geometry: { type: 'LineString', coordinates: coords },
      });
    }
  });
  return { type: 'FeatureCollection', features };
}

function ensureRoutesLayer() {
  if (!map || !map.isStyleLoaded()) return;
  const routeCollection = buildRouteFeatureCollection();
  if (!map.getSource('preview-routes')) {
    map.addSource('preview-routes', {
      type: 'geojson',
      data: routeCollection,
    });
  }
  if (!map.getLayer('preview-routes-line')) {
    map.addLayer({
      id: 'preview-routes-line',
      type: 'line',
      source: 'preview-routes',
      paint: {
        'line-color': ['coalesce', ['get', 'edgeColor'], '#E7C769'],
        'line-dasharray': [
          'case',
          ['==', ['get', 'edgeStyle'], 'solid'],
          ['literal', [1, 0]],
          ['==', ['get', 'edgeStyle'], 'dashdot'],
          ['literal', [2, 1, 0.3, 1]],
          ['literal', [2, 1.4]],
        ],
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          8,
          2.6,
          12,
          4,
          15,
          5.8,
        ],
        'line-opacity': 0.9,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
    });
  }
  const source = map.getSource('preview-routes');
  if (source?.setData) source.setData(routeCollection);
}

function renderRoutesOverlayNow() {
  if (!map || !map.isStyleLoaded()) return false;
  ensureRoutesLayer();
  return true;
}

function scheduleRoutesOverlayRender({ resetRetry = false } = {}) {
  if (resetRetry) routeRenderRetryCount = 0;
  if (routeRenderTimer) {
    clearTimeout(routeRenderTimer);
    routeRenderTimer = 0;
  }
  routeRenderTimer = setTimeout(() => {
    routeRenderTimer = 0;
    try {
      const rendered = renderRoutesOverlayNow();
      if (!rendered && routeRenderRetryCount < 6) {
        routeRenderRetryCount += 1;
        scheduleRoutesOverlayRender();
      }
    } catch (_e) {
      if (routeRenderRetryCount < 6) {
        routeRenderRetryCount += 1;
        scheduleRoutesOverlayRender();
      }
    }
  }, routeRenderRetryCount === 0 ? 0 : 140);
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
  if (typeof window !== 'undefined') {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => prefetchVisibleMarkerUrls(12), { timeout: 900 });
    } else {
      setTimeout(() => prefetchVisibleMarkerUrls(12), 120);
    }
  }
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

export function setMapboxPublishedRoutes(routes = []) {
  publishedRoutes = Array.isArray(routes) ? routes : [];
  scheduleRoutesOverlayRender({ resetRetry: true });
}

export function setMapboxHiddenPointTypes(codes = []) {
  hiddenPointTypeCodes = new Set(
    (Array.isArray(codes) ? codes : [])
      .map((code) => String(code || '').trim())
      .filter(Boolean)
  );
  if (map && pointsLoaded) {
    updatePointsSource();
  }
  if (map) {
    syncDomPointMarkers();
  }
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
  try {
    scheduleRoutesOverlayRender({ resetRetry: true });
  } catch (_e) {
    // noop
  }
  syncDomPointMarkers();
  try {
    ensureDraw();
    bindDrawEvents();
    syncDrawLinePaint();
    ensureCurvePreviewLayer();
    updateCurvePreviewFromDraw();
    if (!drawVisible) {
      draw.changeMode('simple_select');
    } else if (drawMode === 'draw' || drawMode === 'curve') {
      draw.changeMode('draw_line_string');
    } else if (drawMode === 'edit') {
      const firstLine = getDrawLineFeatures()[0];
      if (firstLine?.id) {
        draw.changeMode('direct_select', { featureId: firstLine.id });
      } else {
        draw.changeMode('simple_select');
      }
    } else {
      draw.changeMode('simple_select');
    }
  } catch (_e) {
    // noop
  }
  syncMapGestureStateForLineTool();
  if (is3DMode) {
    try {
      setMapboxPerspective(true);
    } catch (_e) {
      // noop
    }
  }
}

export async function setMapboxStyle(styleKey = 'custom') {
  if (!map) return false;
  const nextKey = MAPBOX_STYLES[styleKey] ? styleKey : 'custom';
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
    mapInitialStyleReady = false;
    container.style.opacity = '0';
    map = new mapboxgl.Map({
      container,
      style: MAPBOX_STYLES[currentStyleKey],
      center: [ODESA_START.lng, ODESA_START.lat],
      zoom: ODESA_START.zoom,
      pitchWithRotate: true,
      dragRotate: true,
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), 'bottom-right');
    map.dragRotate.enable();
    map.touchZoomRotate.enableRotation();
    if (map.touchPitch?.enable) {
      map.touchPitch.enable();
    }

    map.on('style.load', () => {
      routeRenderRetryCount = 0;
      if (!mapInitialStyleReady) {
        mapInitialStyleReady = true;
        container.style.opacity = '1';
      }
      handleStyleReady().catch(() => null);
    });
    map.on('styledata', () => {
      scheduleRoutesOverlayRender();
    });
    map.on('idle', () => {
      scheduleRoutesOverlayRender();
    });
    map.on('click', (event) => {
      if (!pointPickMode || typeof pointPickCallback !== 'function') return;
      const originalTarget = event?.originalEvent?.target;
      if (originalTarget?.closest?.('#route-line-toolbar')) return;
      const lat = Number(event?.lngLat?.lat);
      const lng = Number(event?.lngLat?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      try {
        pointPickCallback({ lat, lng });
      } catch (_e) {
        // noop
      }
      pointPickMode = false;
      pointPickCallback = null;
      syncPointPickUi();
    });
    map.on('rotateend', () => {
      maybeSnapBearingToNorth();
    });
    map.on('remove', () => {
      mapInitialStyleReady = false;
      container.style.opacity = '0';
      clearDomPointMarkers();
      draw = null;
      drawBound = false;
      if (routeRenderTimer) {
        clearTimeout(routeRenderTimer);
        routeRenderTimer = 0;
      }
      routeRenderRetryCount = 0;
      if (markerBlendRaf) {
        cancelAnimationFrame(markerBlendRaf);
        markerBlendRaf = 0;
      }
      markerBlendValue = 0;
      markerBlendTarget = 0;
      pointPickMode = false;
      pointPickCallback = null;
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
  syncPointPickUi();

  return { ok: true, map };
}

export function setMapboxLineToolVisible(visible) {
  drawVisible = Boolean(visible);
  if (drawVisible) {
    pointPickMode = false;
    pointPickCallback = null;
    syncPointPickUi();
  }
  if (!draw) {
    ensureDraw();
    bindDrawEvents();
  }
  if (!draw) return false;
  if (!drawVisible) {
    draw.changeMode('simple_select');
    if (map.getLayer('preview-curve-handles')) {
      map.setLayoutProperty('preview-curve-handles', 'visibility', 'none');
    }
    syncMapGestureStateForLineTool();
    return true;
  }
  if (drawMode === 'draw' || drawMode === 'curve') draw.changeMode('draw_line_string');
  else if (drawMode === 'edit') draw.changeMode('direct_select');
  else draw.changeMode('simple_select');
  updateCurvePreviewFromDraw();
  syncMapGestureStateForLineTool();
  return true;
}

export function setMapboxLineToolMode(mode = 'draw') {
  drawMode = String(mode || 'draw');
  if (['draw', 'curve', 'edit', 'erase'].includes(drawMode)) {
    pointPickMode = false;
    pointPickCallback = null;
    syncPointPickUi();
  }
  if (!draw) {
    ensureDraw();
    bindDrawEvents();
  }
  if (!draw || !drawVisible) {
    syncMapGestureStateForLineTool();
    return true;
  }
  if (drawMode === 'curve') {
    const firstLine = getDrawLineFeatures()[0];
    if (firstLine?.id) {
      const baseCoords = Array.isArray(firstLine.geometry?.coordinates) ? firstLine.geometry.coordinates : [];
      const coords = buildCurveControlCoords(baseCoords);
      upsertDrawFeature({
        type: 'Feature',
        id: firstLine.id,
        properties: {
          ...(firstLine.properties || {}),
          edgeCurve: true,
          edgeCurvePrepared: true,
        },
        geometry: { type: 'LineString', coordinates: coords },
      });
      applyDrawStyleToFeature(firstLine.id, true);
      draw.changeMode('direct_select', { featureId: firstLine.id });
    } else {
      draw.changeMode('draw_line_string');
    }
  } else if (drawMode === 'draw') {
    draw.changeMode('draw_line_string');
  } else if (drawMode === 'edit') {
    const firstLine = getDrawLineFeatures()[0];
    if (firstLine?.id) draw.changeMode('direct_select', { featureId: firstLine.id });
    else draw.changeMode('simple_select');
  }
  else draw.changeMode('simple_select');
  updateCurvePreviewFromDraw();
  syncMapGestureStateForLineTool();
  return true;
}

export function setMapboxLineToolSnapEnabled(enabled = true) {
  drawSnapEnabled = Boolean(enabled);
  return true;
}

export function enableMapboxPointPicking(callback) {
  pointPickMode = true;
  pointPickCallback = typeof callback === 'function' ? callback : null;
  if (drawVisible) {
    drawVisible = false;
    if (draw) {
      draw.changeMode('simple_select');
    }
  }
  syncPointPickUi();
  syncMapGestureStateForLineTool();
  return true;
}

export function disableMapboxPointPicking() {
  pointPickMode = false;
  pointPickCallback = null;
  syncPointPickUi();
  return true;
}

export function setMapboxLineToolStyle(style = 'dashed') {
  drawLineStyle = ['solid', 'dashed', 'dashdot'].includes(style) ? style : 'dashed';
  getDrawLineFeatures().forEach((feature) => {
    if (feature?.id) applyDrawStyleToFeature(feature.id);
  });
  syncDrawLinePaint();
  updateCurvePreviewFromDraw();
  return true;
}

export function setMapboxLineToolColor(color = '#E7C769') {
  drawLineColor = /^#[0-9a-f]{6}$/i.test(String(color || '')) ? String(color) : '#E7C769';
  getDrawLineFeatures().forEach((feature) => {
    if (feature?.id) applyDrawStyleToFeature(feature.id);
  });
  syncDrawLinePaint();
  updateCurvePreviewFromDraw();
  return true;
}

export function undoMapboxLineDraft() {
  if (!draw || drawHistory.length < 2) return false;
  drawHistory.pop();
  const snapshot = drawHistory[drawHistory.length - 1] || [];
  clearMapboxLineDraft();
  if (!snapshot.length) return true;
  const coords = snapshot.map((v) => [Number(v.lng), Number(v.lat)]).filter(([lng, lat]) => Number.isFinite(lat) && Number.isFinite(lng));
  if (coords.length < 2) return true;
  const first = snapshot[0] || {};
  const edgeStyle = ['solid', 'dashed', 'dashdot'].includes(first.edgeStyle) ? first.edgeStyle : drawLineStyle;
  const edgeColor = /^#[0-9a-f]{6}$/i.test(String(first.edgeColor || '')) ? String(first.edgeColor) : drawLineColor;
  const edgeCurve = Boolean(first.edgeCurve);
  const featureId = draw.add({
    type: 'Feature',
    properties: { edgeStyle, edgeColor, edgeCurve, edgeCurvePrepared: edgeCurve },
    geometry: { type: 'LineString', coordinates: edgeCurve ? buildCurveControlCoords(coords) : coords },
  })?.[0];
  if (featureId) applyDrawStyleToFeature(featureId, edgeCurve);
  syncDrawLinePaint();
  updateCurvePreviewFromDraw();
  return true;
}

export function clearMapboxLineDraft() {
  if (!draw) return false;
  const lines = getDrawLineFeatures();
  if (!lines.length) return true;
  lines.forEach((feature) => {
    if (feature?.id) draw.delete(feature.id);
  });
  syncDrawLinePaint();
  updateCurvePreviewFromDraw();
  return true;
}

export function getMapboxLineDraftSnapshot() {
  return captureDrawSnapshot();
}

export function setMapboxLineDraftFromPoints(vertices = []) {
  if (!draw) return false;
  clearMapboxLineDraft();
  const normalized = Array.isArray(vertices) ? vertices : [];
  const coords = normalized
    .map((vertex) => [Number(vertex?.lng), Number(vertex?.lat)])
    .filter(([lng, lat]) => Number.isFinite(lat) && Number.isFinite(lng));
  if (coords.length < 2) return true;
  const firstVertex = normalized.find((v) => v && typeof v === 'object') || {};
  const edgeStyle = ['solid', 'dashed', 'dashdot'].includes(firstVertex.edgeStyle) ? firstVertex.edgeStyle : drawLineStyle;
  const edgeColor = /^#[0-9a-f]{6}$/i.test(String(firstVertex.edgeColor || '')) ? String(firstVertex.edgeColor) : drawLineColor;
  const edgeCurve = normalized.some((v) => Boolean(v?.edgeCurve));
  const startCoord = coords[0];
  const endCoord = coords[coords.length - 1];
  if (startCoord[0] !== endCoord[0] || startCoord[1] !== endCoord[1]) {
    // keep as open polyline
  }
  const featureId = draw.add({
    type: 'Feature',
    properties: { edgeStyle, edgeColor, edgeCurve, edgeCurvePrepared: edgeCurve },
    geometry: { type: 'LineString', coordinates: edgeCurve ? buildCurveControlCoords(coords) : coords },
  })?.[0];
  if (featureId) applyDrawStyleToFeature(featureId, edgeCurve);
  syncDrawLinePaint();
  updateCurvePreviewFromDraw();
  pushDrawHistory();
  return true;
}

export function applyMapboxLineDraftToRoute() {
  if (!draw) {
    return { ok: false, message: 'Mapbox draw is not initialized' };
  }
  const snapshot = captureDrawSnapshot();
  if (!snapshot.length) {
    return { ok: false, message: 'Додайте лінію маршруту' };
  }
  const pointIds = [];
  snapshot.forEach((vertex) => {
    let pointId = Number(vertex?.pointId);
    if (!Number.isFinite(pointId) || pointId <= 0) {
      if (drawSnapEnabled) {
        const snap = nearestPointFor(Number(vertex?.lat), Number(vertex?.lng), 35);
        pointId = snap?.point?.id ? Number(snap.point.id) : NaN;
      }
    }
    if (Number.isFinite(pointId) && pointId > 0 && !pointIds.includes(pointId)) {
      pointIds.push(pointId);
    }
  });
  return {
    ok: true,
    pointIds,
    color: drawLineColor,
  };
}

export function resizeMapboxPreview() {
  if (!map) return;
  map.resize();
}
