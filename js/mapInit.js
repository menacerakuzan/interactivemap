let map;
let markerLayer;
let routeLayer;
let publishedRouteLayer;
let focusBoundaryLayer;
let lineDraftLayer;
let currentFilter = { type: 'all', certified: false, district: '', community: '' };
let pickMode = false;
let pickCallback = null;
let lastStablePoints = [];
let reloadRetryTimer = null;
let lineToolVisible = false;
let lineToolMode = 'draw';
let lineSnapEnabled = true;
let lineToolStyle = 'dashed';
let lineToolColor = '#E7C769';
let lineDraftVertices = [];
let hiddenPointTypes = new Set();
let markerAssetsPreloaded = false;
let pointDragSession = null;
let pointLayerMap = new Map();

const POINT_TYPE_MARKER_FILE = {
  school: 'навчал заклад.svg',
  administration: 'адміністрація.svg',
  fuel_station: 'азс.svg',
  pharmacy: 'аптека.svg',
  bank: 'банк.svg',
  station: 'вокзал.svg',
  housing: 'житло.svg',
  transport_stop: 'зупинка Т.svg',
  cafe: 'кафе.svg',
  culture: 'культура.svg',
  playground: 'майданчик.svg',
  medical: 'мед заклад.svg',
  education: 'навчал заклад.svg',
  street: 'пішохідний перехід.svg',
  square: 'пішохідний перехід.svg',
  hotel: 'готель.svg',
  other: 'соціальні послуги.svg',
  park: 'парк.svg',
  hairdresser: 'перукарня.svg',
  post: 'пошта.svg',
  restaurant: 'ресторан.svg',
  social_services: 'соціальні послуги.svg',
  sport: 'спорт.svg',
  shelter: 'укриття.svg',
  // Legacy aliases.
  stop_a: 'зупинка Т.svg',
  stop_p: 'зупинка Т.svg',
  stop_t: 'зупинка Т.svg',
  ramp: 'соціальні послуги.svg',
  elevator: 'соціальні послуги.svg',
  toilet: 'мед заклад.svg',
  parking: 'азс.svg',
  entrance: 'адміністрація.svg',
  crossing: 'пішохідний перехід.svg',
};

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
  'майданчик.svg',
  'мед заклад.svg',
  'навчал заклад.svg',
  'парк.svg',
  'перукарня.svg',
  'пошта.svg',
  'пішохідний перехід.svg',
  'ресторан.svg',
  'соціальні послуги.svg',
  'спорт.svg',
  'укриття.svg',
];

const MARKER_URL_BY_FILE = Object.fromEntries(
  MARKER_FILES.map((fileName) => [fileName, `/markers/${encodeURIComponent(fileName)}`])
);
let fetchPointsFn = async (filter) => {
  const query = getQueryFromFilter(filter);
  const response = await fetch(`/api/points${query ? `?${query}` : ''}`);
  if (!response.ok) {
    return [];
  }
  return response.json();
};

function preloadMarkerAssets() {
  if (markerAssetsPreloaded || typeof Image === 'undefined') return;
  markerAssetsPreloaded = true;
  Object.values(MARKER_URL_BY_FILE).forEach((url) => {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  });
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

const ODESA_BOUNDS = {
  center: [46.4825, 30.7233],
  defaultZoom: 12,
  cityZoom: 13,
};

function normalizeMarkerKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`]/g, '')
    .replace(/[^a-zа-яіїєґ0-9]+/g, ' ')
    .trim();
}

function markerFileToLabel(fileName) {
  const base = String(fileName || '').replace(/\.svg$/i, '').trim();
  if (!base) return 'Точка';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function markerFileToUrl(fileName) {
  return MARKER_URL_BY_FILE[fileName] || MARKER_URL_BY_FILE['соціальні послуги.svg'];
}

function resolveMarkerFile(point) {
  const typeCode = String(point?.pointType?.code || '').trim();
  if (typeCode && POINT_TYPE_MARKER_FILE[typeCode]) {
    return POINT_TYPE_MARKER_FILE[typeCode];
  }

  const label = normalizeMarkerKey(point?.pointType?.labelUk || '');
  if (label) {
    const matched = MARKER_FILES.find((fileName) => normalizeMarkerKey(fileName).includes(label));
    if (matched) return matched;
  }
  return 'соціальні послуги.svg';
}

function createIcon(point) {
  const markerFile = resolveMarkerFile(point);
  const markerUrl = markerFileToUrl(markerFile);
  const markerLabel = markerFileToLabel(markerFile);
  const markerTitle = escapeHtml(markerLabel);
  const pinSize = 38;
  const captionWidth = 132;
  const iconW = Math.max(pinSize, captionWidth) + 8;
  const iconH = pinSize + 24;
  const anchorX = Math.round(iconW / 2);
  const anchorY = Math.round(pinSize / 2);

  const html = `
    <div class="map-marker-wrap" style="--marker-wrap-width:${iconW}px; --marker-pin-size:${pinSize}px; --marker-caption-width:${captionWidth}px; --marker-caption-font:10px;">
      <span class="map-marker-dot" style="--marker-color: ${escapeHtml(point?.pointType?.color || '#3D5263')}"></span>
      <div class="map-marker-pin" style="--marker-color: ${escapeHtml(point?.pointType?.color || '#3D5263')}">
        <img
          src="${markerUrl}"
          alt="${markerTitle}"
          loading="lazy"
          decoding="async"
          onerror="this.style.display='none'; this.closest('.map-marker-wrap') && this.closest('.map-marker-wrap').classList.add('is-image-broken');"
          onload="this.closest('.map-marker-wrap') && this.closest('.map-marker-wrap').classList.remove('is-image-broken'); this.style.display='block';"
        />
      </div>
      <div class="map-marker-caption">${markerTitle}</div>
    </div>`;

  return L.divIcon({
    className: 'custom-map-marker',
    html,
    iconSize: [iconW, iconH],
    iconAnchor: [anchorX, anchorY],
  });
}

function bindPointInteraction(layer, point, lat, lng) {
  layer.on('click', () => {
    if (pointDragSession?.active) return;
    if (lineToolVisible) {
      if (lineToolMode === 'erase') {
        eraseLineDraftVertex({ lat, lng });
        return;
      }
      if (lineToolMode === 'draw' || lineToolMode === 'curve') {
        addLineDraftFromPoint(point);
        return;
      }
      return;
    }
    map.panTo([lat, lng], {
      animate: true,
      duration: 0.35,
      easeLinearity: 0.25,
    });
    showInfoCard(point);
  });
}

function renderPoints(points = [], { emitUpdateEvent = true } = {}) {
  if (!markerLayer) return;
  markerLayer.clearLayers();
  pointLayerMap.clear();

  points.forEach((point) => {
    const pointTypeCode = String(point?.pointType?.code || '');
    if (pointTypeCode && hiddenPointTypes.has(pointTypeCode)) return;

    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const layer = L.marker([lat, lng], { icon: createIcon(point) }).addTo(markerLayer);
    pointLayerMap.set(point.id, layer);

    bindPointInteraction(layer, point, lat, lng);
  });

  if (emitUpdateEvent) {
    window.dispatchEvent(new CustomEvent('map:points-updated', { detail: points }));
  }
}

function getQueryFromFilter(filter) {
  // Filters are used as navigation controls only; keep all points visible.
  return '';
}

function showInfoCard(data) {
  const panel = document.getElementById('context-panel');
  if (!panel) {
    return;
  }

  panel.classList.add('active');
  document.body.classList.add('context-open');
  document.querySelector('.map-view')?.classList.add('panel-open');

  if (window.gsap) {
    gsap.to(panel, { opacity: 1, x: 0, duration: 0.24, ease: 'power2.out' });
  }

  const sections = Array.isArray(data.sections) ? data.sections : [];
  const sectionsMarkup = sections.length
    ? `
      <hr style="border: 0; border-top: 1px solid var(--c-divider);">
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div class="t-label text-muted">Детальні пункти</div>
        ${sections
      .map((section, idx) => {
        const sectionPhoto = section.photoUrl
          ? `<div style="height:120px;border-radius:10px;background:url('${section.photoUrl}') center/cover;border:1px solid var(--c-divider);"></div>`
          : '';
        return `
              <article style="border:1px solid var(--c-divider); border-radius:10px; padding:10px; display:flex; flex-direction:column; gap:8px;">
                <div class="t-data text-muted">Пункт ${idx + 1}</div>
                ${section.title ? `<div class="t-body"><strong>${escapeHtml(section.title)}</strong></div>` : ''}
                ${section.description ? `<div class="t-body">${escapeHtml(section.description)}</div>` : ''}
                ${sectionPhoto}
              </article>
            `;
      })
      .join('')}
      </div>
    `
    : '';

  panel.innerHTML = `
    <div class="card card-3d" style="padding: 24px; display: flex; flex-direction: column; gap: 16px; position: relative;">
      <button id="btn-close-context-panel" class="btn-flat context-close-btn" type="button">Закрити</button>
      <div style="height: 160px; background: ${data.photoUrl
      ? `url('${data.photoUrl}') center/cover`
      : 'linear-gradient(130deg, #dbeafe 0%, #f8fafc 100%)'
    }; border-radius: var(--radius-md);"></div>
      <div>
        <h2 class="t-h2" style="display: flex; align-items: center;">${data.title}</h2>
        <div class="t-label text-muted" style="margin-top: 4px;">${data.district || 'Одеська область'}</div>
      </div>
      <hr style="border: 0; border-top: 1px solid var(--c-divider);">
      <div>
        <div class="t-data text-muted" style="margin-bottom: 8px;">ТИП ТОЧКИ:</div>
        <div class="t-body">${data.pointType.labelUk}</div>
      </div>
      <hr style="border: 0; border-top: 1px solid var(--c-divider);">
      <div>
        <div class="t-label text-muted" style="margin-bottom: 4px;">Коментар:</div>
        <div class="t-body">${data.description || 'Без коментаря'}</div>
      </div>
      ${sectionsMarkup}
      <hr style="border: 0; border-top: 1px solid var(--c-divider);">
      <div style="display:flex; flex-direction: column; gap: 4px;">
        <div class="t-data">Координати: ${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}</div>
        <div class="t-data text-muted">Додано: ${data.createdAt ? data.createdAt.slice(0, 10) : '-'}</div>
      </div>
    </div>
  `;

  panel.querySelector('#btn-close-context-panel')?.addEventListener('click', () => {
    closeInfoCard();
  });
}

function closeInfoCard() {
  const panel = document.getElementById('context-panel');
  if (!panel) return;
  panel.classList.remove('active');
  panel.style.opacity = '0';
  document.body.classList.remove('context-open');
  document.querySelector('.map-view')?.classList.remove('panel-open');
}

async function loadAndRenderPoints() {
  if (!map || !markerLayer) {
    return [];
  }
  try {
    let points = await fetchPointsFn(currentFilter);
    if (!Array.isArray(points)) {
      points = [];
    }

    lastStablePoints = points;
    renderPoints(points, { emitUpdateEvent: true });
    if (reloadRetryTimer) {
      clearTimeout(reloadRetryTimer);
      reloadRetryTimer = null;
    }
    return points;
  } catch (error) {
    console.warn('Points load failed, keeping previous markers', error);
    if (!reloadRetryTimer) {
      reloadRetryTimer = setTimeout(() => {
        reloadRetryTimer = null;
        loadAndRenderPoints().catch(() => null);
      }, 1500);
    }
    const fallback = lastStablePoints || [];
    renderPoints(fallback, { emitUpdateEvent: true });
    return fallback;
  }
}

function setHiddenPointTypes(codes = []) {
  hiddenPointTypes = new Set((Array.isArray(codes) ? codes : []).map((code) => String(code || '').trim()).filter(Boolean));
  return loadAndRenderPoints();
}

function setFilter(filter) {
  currentFilter = { ...currentFilter, ...filter };
  return loadAndRenderPoints();
}

function focusPoints(points = [], options = {}) {
  if (!map || !Array.isArray(points) || !points.length) return false;
  const latLngs = points
    .map((p) => [Number(p?.lat), Number(p?.lng)])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  if (!latLngs.length) return false;

  if (latLngs.length === 1) {
    const [lat, lng] = latLngs[0];
    focusLocation(lat, lng, options.singleZoom || 14);
    return true;
  }

  const bounds = L.latLngBounds(latLngs);
  map.stop();
  map.fitBounds(bounds, {
    padding: options.padding || [56, 56],
    maxZoom: options.maxZoom || 14,
    animate: true,
    duration: 0.55,
  });
  return true;
}

function enablePointPicking(callback) {
  pickMode = true;
  pickCallback = callback;
  const container = map?.getContainer();
  if (container) {
    container.classList.add('point-pick');
  }
}

function disablePointPicking() {
  pickMode = false;
  pickCallback = null;
  const container = map?.getContainer();
  if (container) {
    container.classList.remove('point-pick');
  }
}

function stopPointDrag({ commit = false } = {}) {
  if (!pointDragSession) return null;
  const session = pointDragSession;
  pointDragSession = null;

  if (session.pointId) {
    const origLayer = pointLayerMap.get(session.pointId);
    if (origLayer) origLayer.setOpacity(1);
  }

  const finalLatLng = session.marker?.getLatLng?.() || null;
  if (session.marker && lineDraftLayer) {
    lineDraftLayer.removeLayer(session.marker);
  }
  if (session.escapeHandler) {
    document.removeEventListener('keydown', session.escapeHandler);
  }

  const container = map?.getContainer();
  if (container) {
    container.classList.remove('point-drag');
    container.classList.remove('point-drag-active');
  }

  if (!commit && typeof session.onCancel === 'function') {
    session.onCancel();
  }
  return finalLatLng ? { lat: Number(finalLatLng.lat), lng: Number(finalLatLng.lng) } : null;
}

function startPointDrag({ pointId = null, lat, lng, onMove = null, onCommit = null, onCancel = null } = {}) {
  if (!map || !lineDraftLayer) return false;
  const startLat = Number(lat);
  const startLng = Number(lng);
  if (!Number.isFinite(startLat) || !Number.isFinite(startLng)) return false;

  stopPointDrag({ commit: false });
  disablePointPicking();

  const marker = L.marker([startLat, startLng], {
    draggable: true,
    zIndexOffset: 1000,
    icon: L.divIcon({
      className: 'point-drag-marker-icon',
      html: '<span class="point-drag-marker"></span>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    }),
  }).addTo(lineDraftLayer);

  if (pointId) {
    const origLayer = pointLayerMap.get(pointId);
    if (origLayer) origLayer.setOpacity(0);
  }

  const container = map.getContainer();
  container.classList.add('point-drag');

  marker.on('dragstart', () => {
    container.classList.add('point-drag-active');
  });
  marker.on('drag', (event) => {
    const latlng = event?.target?.getLatLng?.();
    if (!latlng || typeof onMove !== 'function') return;
    onMove({ lat: Number(latlng.lat), lng: Number(latlng.lng) });
  });
  marker.on('dragend', (event) => {
    const latlng = event?.target?.getLatLng?.();
    stopPointDrag({ commit: true });
    if (latlng && typeof onCommit === 'function') {
      onCommit({ lat: Number(latlng.lat), lng: Number(latlng.lng) });
    }
  });

  const escapeHandler = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    stopPointDrag({ commit: false });
  };
  document.addEventListener('keydown', escapeHandler);

  pointDragSession = {
    active: true,
    marker,
    onCancel,
    escapeHandler,
  };
  return true;
}

function clearRouteHighlight() {
  if (!routeLayer) return;
  routeLayer.clearLayers();
}

function clearFocusBoundary() {
  if (!focusBoundaryLayer) return;
  focusBoundaryLayer.clearLayers();
}

function getDashPattern(style) {
  if (style === 'dashed') return '12 10';
  if (style === 'dashdot') return '12 8 2 8';
  return null;
}

function findPointById(pointId) {
  const id = Number(pointId);
  if (!Number.isFinite(id)) return null;
  return lastStablePoints.find((point) => Number(point?.id) === id) || null;
}

function resolveNearestSnap(latlng, maxPx = 22) {
  if (!map || !Array.isArray(lastStablePoints) || !lastStablePoints.length) return null;
  const target = map.latLngToContainerPoint(latlng);
  let best = null;

  for (const point of lastStablePoints) {
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const candidate = map.latLngToContainerPoint([lat, lng]);
    const distance = target.distanceTo(candidate);
    if (!best || distance < best.distance) {
      best = { point, lat, lng, distance };
    }
  }

  if (!best || best.distance > maxPx) return null;
  return best;
}

function normalizeLineVertex(vertex) {
  if (!vertex || typeof vertex !== 'object') return null;
  const edgeStyle = ['solid', 'dashed', 'dashdot'].includes(vertex?.edgeStyle) ? vertex.edgeStyle : 'dashed';
  const edgeColor = typeof vertex?.edgeColor === 'string' && vertex.edgeColor.startsWith('#') ? vertex.edgeColor : '#E7C769';
  const edgeCurve = Boolean(vertex?.edgeCurve);
  const pointId = Number(vertex.pointId);
  if (Number.isFinite(pointId)) {
    const source = findPointById(pointId) || vertex;
    const lat = Number(source.lat);
    const lng = Number(source.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat,
      lng,
      pointId,
      title: source.title || vertex.title || '',
      snapped: true,
      edgeStyle,
      edgeColor,
      edgeCurve,
    };
  }

  const lat = Number(vertex.lat);
  const lng = Number(vertex.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    pointId: null,
    title: '',
    snapped: false,
    edgeStyle,
    edgeColor,
    edgeCurve,
  };
}

function buildCurvedSegmentPoints(vertices, segmentIndex, steps = 18) {
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
      ((2 * p1.lat) +
        (-p0.lat + p2.lat) * t +
        (2 * p0.lat - 5 * p1.lat + 4 * p2.lat - p3.lat) * t2 +
        (-p0.lat + 3 * p1.lat - 3 * p2.lat + p3.lat) * t3);
    const lng =
      0.5 *
      ((2 * p1.lng) +
        (-p0.lng + p2.lng) * t +
        (2 * p0.lng - 5 * p1.lng + 4 * p2.lng - p3.lng) * t2 +
        (-p0.lng + 3 * p1.lng - 3 * p2.lng + p3.lng) * t3);
    points.push([lat, lng]);
  }
  return points;
}

let _renderDraftRaf = null;
function renderLineDraft() {
  if (_renderDraftRaf) cancelAnimationFrame(_renderDraftRaf);
  _renderDraftRaf = requestAnimationFrame(_renderLineDraftSync);
}

function _renderLineDraftSync() {
  if (!lineDraftLayer) return;
  lineDraftLayer.clearLayers();

  if (lineDraftVertices.length >= 2) {
    for (let index = 1; index < lineDraftVertices.length; index += 1) {
      const prev = lineDraftVertices[index - 1];
      const next = lineDraftVertices[index];
      const segmentStyle = ['solid', 'dashed', 'dashdot'].includes(next.edgeStyle) ? next.edgeStyle : lineToolStyle;
      const segmentColor = typeof next.edgeColor === 'string' && next.edgeColor.startsWith('#') ? next.edgeColor : lineToolColor;
      const segmentCurve = Boolean(next.edgeCurve);
      const segmentPoints =
        segmentCurve && lineDraftVertices.length > 2
          ? buildCurvedSegmentPoints(lineDraftVertices, index - 1)
          : [
            [prev.lat, prev.lng],
            [next.lat, next.lng],
          ];

      const segmentLine = L.polyline(segmentPoints, {
        color: segmentColor,
        weight: 5,
        opacity: 0.96,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: getDashPattern(segmentStyle),
      }).addTo(lineDraftLayer);

      if (lineToolMode === 'edit') {
        segmentLine.on('click', (event) => {
          const insertLat = Number(event?.latlng?.lat);
          const insertLng = Number(event?.latlng?.lng);
          if (!Number.isFinite(insertLat) || !Number.isFinite(insertLng)) return;
          lineDraftVertices.splice(index, 0, {
            lat: insertLat,
            lng: insertLng,
            pointId: null,
            title: '',
            snapped: false,
            edgeStyle: segmentStyle,
            edgeColor: segmentColor,
            edgeCurve: segmentCurve,
          });
          renderLineDraft();
        });
      }
    }
  }

  lineDraftVertices.forEach((vertex, index) => {
    const marker = L.marker([vertex.lat, vertex.lng], {
      draggable: lineToolMode === 'edit',
      icon: L.divIcon({
        className: 'line-draft-vertex-icon',
        html: `<span class="line-draft-vertex ${vertex.snapped ? 'is-snapped' : 'is-free'}">${index + 1}</span>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
    }).addTo(lineDraftLayer);

    if (lineToolMode === 'edit') {
      marker.on('drag', (event) => {
        const latlng = event?.target?.getLatLng?.();
        if (!latlng) return;
        lineDraftVertices[index] = {
          ...lineDraftVertices[index],
          lat: Number(latlng.lat),
          lng: Number(latlng.lng),
          pointId: null,
          title: '',
          snapped: false,
        };
        renderLineDraft();
      });
      marker.on('click', (event) => {
        const altPressed = Boolean(event?.originalEvent?.altKey || event?.originalEvent?.metaKey);
        if (!altPressed) return;
        lineDraftVertices.splice(index, 1);
        renderLineDraft();
      });
    }

    marker.bindTooltip(String(index + 1), {
      permanent: true,
      direction: 'center',
      opacity: 1,
      className: 'route-order-label',
    });
  });
}

function updateLineToolCursor() {
  const container = map?.getContainer();
  if (!container) return;
  container.classList.toggle('line-tool-active', lineToolVisible);
  container.classList.toggle('line-tool-erase', lineToolVisible && lineToolMode === 'erase');
  container.classList.toggle('line-tool-edit', lineToolVisible && lineToolMode === 'edit');
}

function addLineDraftVertex(latlng, originalEvent = null) {
  const altOverride = Boolean(originalEvent && (originalEvent.altKey || originalEvent.metaKey));
  const snap = lineSnapEnabled && !altOverride ? resolveNearestSnap(latlng) : null;
  const nextVertex = snap
    ? {
      lat: snap.lat,
      lng: snap.lng,
      pointId: Number(snap.point.id),
      title: snap.point.title || '',
      snapped: true,
      edgeStyle: lineToolStyle,
      edgeColor: lineToolColor,
      edgeCurve: lineToolMode === 'curve',
    }
    : {
      lat: Number(latlng.lat),
      lng: Number(latlng.lng),
      pointId: null,
      title: '',
      snapped: false,
      edgeStyle: lineToolStyle,
      edgeColor: lineToolColor,
      edgeCurve: lineToolMode === 'curve',
    };

  const prev = lineDraftVertices[lineDraftVertices.length - 1];
  if (prev && Math.abs(prev.lat - nextVertex.lat) < 1e-7 && Math.abs(prev.lng - nextVertex.lng) < 1e-7) {
    return false;
  }

  lineDraftVertices.push(nextVertex);
  renderLineDraft();
  return true;
}

function addLineDraftFromPoint(point) {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  const pointId = Number(point?.id);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(pointId)) return false;

  const prev = lineDraftVertices[lineDraftVertices.length - 1];
  if (prev && Number(prev.pointId) === pointId) {
    return false;
  }

  lineDraftVertices.push({
    lat,
    lng,
    pointId,
    title: point?.title || '',
    snapped: true,
    edgeStyle: lineToolStyle,
    edgeColor: lineToolColor,
    edgeCurve: lineToolMode === 'curve',
  });
  renderLineDraft();
  return true;
}

function eraseLineDraftVertex(latlng) {
  if (!lineDraftVertices.length || !map) return false;
  const target = map.latLngToContainerPoint(latlng);
  let minIdx = -1;
  let minDistance = Number.POSITIVE_INFINITY;

  lineDraftVertices.forEach((vertex, index) => {
    const candidate = map.latLngToContainerPoint([vertex.lat, vertex.lng]);
    const distance = target.distanceTo(candidate);
    if (distance < minDistance) {
      minDistance = distance;
      minIdx = index;
    }
  });

  if (minIdx < 0 || minDistance > 26) return false;
  lineDraftVertices.splice(minIdx, 1);
  renderLineDraft();
  return true;
}

function undoLineDraft() {
  if (!lineDraftVertices.length) return false;
  lineDraftVertices.pop();
  renderLineDraft();
  return true;
}

function clearLineDraft() {
  lineDraftVertices = [];
  renderLineDraft();
}

function setLineDraftFromPoints(points = []) {
  if (!Array.isArray(points)) return;
  lineDraftVertices = points.map(normalizeLineVertex).filter(Boolean);
  renderLineDraft();
}

function setLineToolVisible(visible) {
  lineToolVisible = Boolean(visible);
  if (!lineToolVisible) {
    lineDraftLayer?.clearLayers();
  } else {
    renderLineDraft();
  }
  updateLineToolCursor();
}

function setLineToolMode(mode = 'draw') {
  if (mode === 'erase' || mode === 'curve' || mode === 'edit') {
    lineToolMode = mode;
  } else {
    lineToolMode = 'draw';
  }
  renderLineDraft();
  updateLineToolCursor();
}

function setLineToolSnapEnabled(enabled = true) {
  lineSnapEnabled = Boolean(enabled);
}

function setLineToolStyle(style = 'dashed') {
  lineToolStyle = ['solid', 'dashed', 'dashdot'].includes(style) ? style : 'dashed';
  renderLineDraft();
}

function setLineToolColor(color = '#E7C769') {
  if (typeof color === 'string' && color.startsWith('#')) {
    lineToolColor = color;
    renderLineDraft();
  }
}

function getLineDraftSnapshot() {
  return lineDraftVertices.map((vertex) => ({ ...vertex }));
}

function applyLineDraftToRoute() {
  const snappedIds = [];
  for (const vertex of lineDraftVertices) {
    if (!Number.isFinite(Number(vertex.pointId))) continue;
    const pointId = Number(vertex.pointId);
    if (!snappedIds.length || snappedIds[snappedIds.length - 1] !== pointId) {
      snappedIds.push(pointId);
    }
  }

  if (snappedIds.length < 2) {
    return {
      ok: false,
      message: 'Для маршруту потрібно мінімум 2 прив’язані точки.',
      pointIds: [],
      skippedVertices: lineDraftVertices.length,
    };
  }

  const skippedVertices = lineDraftVertices.length - snappedIds.length;
  return {
    ok: true,
    pointIds: snappedIds,
    skippedVertices,
    color: lineToolColor,
    style: lineToolStyle,
  };
}

function setFocusBoundary(geojson) {
  if (!focusBoundaryLayer) return false;
  clearFocusBoundary();
  if (!geojson || typeof geojson !== 'object') return false;
  const hasPolygonGeometry = (obj) => {
    if (!obj || typeof obj !== 'object') return false;
    const t = String(obj.type || '');
    if (t === 'Polygon' || t === 'MultiPolygon') return true;
    if (t === 'Feature') return hasPolygonGeometry(obj.geometry);
    if (t === 'FeatureCollection') return Array.isArray(obj.features) && obj.features.some((f) => hasPolygonGeometry(f));
    return false;
  };
  if (!hasPolygonGeometry(geojson)) return false;

  L.geoJSON(geojson, {
    style: {
      color: '#0B2545',
      weight: 2.2,
      opacity: 0.95,
      fillOpacity: 0.05,
      dashArray: '6 4',
    },
  }).addTo(focusBoundaryLayer);
  return true;
}

function focusBoundary(options = {}) {
  if (!map || !focusBoundaryLayer) return false;
  const bounds = focusBoundaryLayer.getBounds?.();
  if (!bounds || !bounds.isValid?.()) return false;
  map.stop();
  map.fitBounds(bounds, {
    padding: options.padding || [40, 40],
    maxZoom: Number.isFinite(Number(options.maxZoom)) ? Number(options.maxZoom) : 13,
    animate: true,
    duration: 0.45,
  });
  return true;
}

function setPublishedRoutes(routes = []) {
  if (!publishedRouteLayer) return;
  publishedRouteLayer.clearLayers();
  if (!Array.isArray(routes) || !routes.length) return;

  routes.forEach((route) => {
    if (!route || route.status !== 'published' || !Array.isArray(route.points) || route.points.length < 2) return;
    const latLngs = route.points
      .map((p) => [Number(p.lat), Number(p.lng)])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (latLngs.length < 2) return;

    const color = route.routeColor || '#E7C769';
    const polyline = L.polyline(latLngs, {
      color,
      weight: 4,
      opacity: 0.75,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(publishedRouteLayer);

    polyline.bindTooltip(route.name || 'Маршрут', {
      sticky: true,
      direction: 'top',
      className: 'route-order-label',
    });

    // Render route point markers without numeric labels.
    route.points.forEach((p, idx) => {
      const lat = Number(p?.lat);
      const lng = Number(p?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const marker = L.circleMarker([lat, lng], {
        radius: 7,
        color: '#1E3A5F',
        fillColor: color,
        fillOpacity: 1,
        weight: 2,
      }).addTo(publishedRouteLayer);
    });
  });
}

function highlightRoute(route) {
  if (!map || !routeLayer) return;
  clearRouteHighlight();

  if (!route || !Array.isArray(route.points) || route.points.length === 0) {
    return;
  }

  const latLngs = route.points.map((p) => [p.lat, p.lng]);
  const color = route?.routeColor || '#E7C769';
  const baseLine = L.polyline(latLngs, {
    color: '#1E3A5F',
    weight: 8,
    opacity: 0.55,
    lineCap: 'round',
    lineJoin: 'round',
  }).addTo(routeLayer);

  L.polyline(latLngs, {
    color,
    weight: 5,
    opacity: 1,
    dashArray: '10,7',
    lineCap: 'round',
    lineJoin: 'round',
  }).addTo(routeLayer);

  route.points.forEach((p) => {
    const marker = L.circleMarker([p.lat, p.lng], {
      radius: 9,
      color: '#1E3A5F',
      fillColor: color,
      fillOpacity: 1,
      weight: 2,
    }).addTo(routeLayer);
  });

  map.fitBounds(baseLine.getBounds(), { padding: [60, 60], maxZoom: ODESA_BOUNDS.cityZoom });
}

function focusLocation(lat, lng, zoom = ODESA_BOUNDS.cityZoom) {
  if (!map) return;
  const safeLat = Number(lat);
  const safeLng = Number(lng);
  const safeZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : ODESA_BOUNDS.cityZoom;
  if (!Number.isFinite(safeLat) || !Number.isFinite(safeLng)) return;

  map.stop();
  map.setView([safeLat, safeLng], safeZoom, {
    animate: true,
    duration: 0.55,
    easeLinearity: 0.25,
  });

  // Ensure layout settles after panel/filter transitions.
  setTimeout(() => {
    map.invalidateSize({ pan: false });
  }, 120);
}

export async function initMap(options = {}) {
  if (typeof L === 'undefined') return null;
  if (typeof options.fetchPoints === 'function') {
    fetchPointsFn = options.fetchPoints;
  }

  if (map) {
    map.invalidateSize();
    return {
      setFilter,
      refresh: loadAndRenderPoints,
      enablePointPicking,
      disablePointPicking,
      startPointDrag,
      stopPointDrag,
      highlightRoute,
      clearRouteHighlight,
      setPublishedRoutes,
      focusLocation,
      focusPoints,
      setFocusBoundary,
      focusBoundary,
      clearFocusBoundary,
      setHiddenPointTypes,
      setLineToolVisible,
      setLineToolMode,
      setLineToolSnapEnabled,
      setLineToolStyle,
      setLineToolColor,
      undoLineDraft,
      clearLineDraft,
      setLineDraftFromPoints,
      getLineDraftSnapshot,
      applyLineDraftToRoute,
    };
  }

  map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    zoomAnimation: true,
    markerZoomAnimation: true,
    fadeAnimation: true,
    zoomSnap: 0,
    zoomDelta: 0.5,
    scrollWheelZoom: 'center',
    touchZoom: 'center',
    wheelPxPerZoomLevel: 60,
    inertia: true,
    inertiaDeceleration: 1800,
    easeLinearity: 0.2,
  }).setView(ODESA_BOUNDS.center, ODESA_BOUNDS.defaultZoom);

  L.control
    .attribution({ prefix: false })
    .addAttribution('Odesa Region Accessibility Map')
    .addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 20,
    updateWhenZooming: false,
    keepBuffer: 6,
  }).addTo(map);
  preloadMarkerAssets();

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  if (L.markerClusterGroup) {
    markerLayer = L.markerClusterGroup({
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      maxClusterRadius: 50,
      disableClusteringAtZoom: 16
    }).addTo(map);
  } else {
    markerLayer = L.layerGroup().addTo(map);
  }
  routeLayer = L.layerGroup().addTo(map);
  publishedRouteLayer = L.layerGroup().addTo(map);
  focusBoundaryLayer = L.layerGroup().addTo(map);
  lineDraftLayer = L.layerGroup().addTo(map);

  const mapContainer = map.getContainer();
  let zoomCssRaf = 0;
  const applyZoomCss = () => {
    zoomCssRaf = 0;
    mapContainer.style.setProperty('--map-zoom', String(map.getZoom()));
  };
  const scheduleZoomCss = () => {
    if (zoomCssRaf) return;
    zoomCssRaf = requestAnimationFrame(applyZoomCss);
  };
  mapContainer.style.setProperty('--map-zoom', String(map.getZoom() ?? ODESA_BOUNDS.defaultZoom));
  map.on('zoom', scheduleZoomCss);
  map.on('zoomend', scheduleZoomCss);

  map.on('click', (e) => {
    if (pointDragSession?.active) return;
    const originalTarget = e?.originalEvent?.target;
    if (originalTarget?.closest?.('#route-line-toolbar')) {
      return;
    }

    if (lineToolVisible) {
      if (lineToolMode === 'erase') {
        eraseLineDraftVertex(e.latlng);
      } else if (lineToolMode === 'draw' || lineToolMode === 'curve') {
        addLineDraftVertex(e.latlng, e.originalEvent);
      } else {
        // edit mode: vertex/segment interactions are handled by draft layer itself
      }
      return;
    }

    if (!pickMode || typeof pickCallback !== 'function') {
      closeInfoCard();
      return;
    }
    pickCallback({ lat: e.latlng.lat, lng: e.latlng.lng });
    disablePointPicking();
  });

  window.addEventListener('resize', () => map.invalidateSize());
  setTimeout(() => map.invalidateSize(), 500);

  await loadAndRenderPoints();

  return {
    setFilter,
    refresh: loadAndRenderPoints,
    enablePointPicking,
    disablePointPicking,
    startPointDrag,
    stopPointDrag,
    highlightRoute,
    clearRouteHighlight,
    setPublishedRoutes,
    focusLocation,
    focusPoints,
    setFocusBoundary,
    focusBoundary,
    clearFocusBoundary,
    setHiddenPointTypes,
    setLineToolVisible,
    setLineToolMode,
    setLineToolSnapEnabled,
    setLineToolStyle,
    setLineToolColor,
    undoLineDraft,
    clearLineDraft,
    setLineDraftFromPoints,
    getLineDraftSnapshot,
    applyLineDraftToRoute,
  };
}
