import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const ODESA_START = { lng: 30.7233, lat: 46.4825, zoom: 10.8 };
const MAPBOX_STYLE_URL = 'mapbox://styles/mapbox/standard';
let map = null;
let pointsLoaded = false;
let is3DMode = false;
let allPoints = [];
let focusBoundaryData = {
  type: 'FeatureCollection',
  features: [],
};

function getToken() {
  return (
    import.meta.env.VITE_MAPBOX_TOKEN
    || window.MAPBOX_TOKEN
    || localStorage.getItem('mapbox_token')
    || ''
  );
}

function setStatus(message = '') {
  const node = document.getElementById('mapbox-status');
  if (!node) return;
  if (!message) {
    node.style.display = 'none';
    node.textContent = '';
    return;
  }
  node.style.display = 'block';
  node.textContent = message;
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

function buildPointFeatureCollection() {
  return {
    type: 'FeatureCollection',
    features: allPoints.map(toPointFeature).filter(Boolean),
  };
}

async function ensurePointsLayer() {
  if (!map || pointsLoaded || !map.isStyleLoaded()) return;
  const pointCollection = buildPointFeatureCollection();

  map.addSource('preview-points', {
    type: 'geojson',
    data: pointCollection,
    cluster: true,
    clusterRadius: 55,
    clusterMaxZoom: 11,
  });

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

  pointsLoaded = true;
}

function updatePointsSource() {
  if (!map || !map.isStyleLoaded()) return;
  const source = map.getSource('preview-points');
  if (!source?.setData) return;
  source.setData(buildPointFeatureCollection());
}

function ensure3DBuildingsLayer() {
  if (!map || !map.isStyleLoaded()) return;
  const layerId = 'preview-3d-buildings';
  if (map.getLayer(layerId)) return;
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
  allPoints = Array.isArray(points) ? points : [];
  if (!map) return;
  if (!pointsLoaded) return;
  updatePointsSource();
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

  if (!map) {
    map = new mapboxgl.Map({
      container,
      style: MAPBOX_STYLE_URL,
      center: [ODESA_START.lng, ODESA_START.lat],
      zoom: ODESA_START.zoom,
      pitchWithRotate: false,
      dragRotate: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), 'bottom-right');

    map.on('load', async () => {
      setStatus('');
      applyTimePreset();
      ensure3DBuildingsLayer();
      ensureFocusBoundaryLayers();
      updateFocusBoundarySource();
      await ensurePointsLayer();
      updatePointsSource();
      if (is3DMode) setMapboxPerspective(true);
    });
  } else {
    map.resize();
    if (map.isStyleLoaded()) {
      setStatus('');
      applyTimePreset();
      ensure3DBuildingsLayer();
      ensureFocusBoundaryLayers();
      updateFocusBoundarySource();
      await ensurePointsLayer();
      updatePointsSource();
      if (is3DMode) setMapboxPerspective(true);
    }
  }

  return { ok: true, map };
}

export function resizeMapboxPreview() {
  if (!map) return;
  map.resize();
}
