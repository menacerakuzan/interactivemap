import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const ODESA_START = { lng: 30.7233, lat: 46.4825, zoom: 10.8 };
let map = null;
let pointsLoaded = false;

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

async function loadPublicPoints() {
  try {
    const response = await fetch('/api/points');
    if (!response.ok) return [];
    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
  } catch (_e) {
    return [];
  }
}

async function ensurePointsLayer() {
  if (!map || pointsLoaded || !map.isStyleLoaded()) return;

  const points = await loadPublicPoints();
  const features = points
    .map((point) => {
      const lng = Number(point?.lng);
      const lat = Number(point?.lat);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          title: String(point?.title || ''),
          pointType: String(point?.pointType?.code || ''),
        },
      };
    })
    .filter(Boolean);

  map.addSource('preview-points', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features,
    },
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

  map.on('mouseenter', 'preview-unclustered', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'preview-unclustered', () => {
    map.getCanvas().style.cursor = '';
  });

  pointsLoaded = true;
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
      style: 'mapbox://styles/mapbox/light-v11',
      center: [ODESA_START.lng, ODESA_START.lat],
      zoom: ODESA_START.zoom,
      pitchWithRotate: false,
      dragRotate: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), 'bottom-right');

    map.on('load', async () => {
      setStatus('');
      await ensurePointsLayer();
    });
  } else {
    map.resize();
    if (map.isStyleLoaded()) {
      setStatus('');
      await ensurePointsLayer();
    }
  }

  return { ok: true, map };
}

export function resizeMapboxPreview() {
  if (!map) return;
  map.resize();
}
