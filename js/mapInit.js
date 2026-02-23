let map;
let markerLayer;
let routeLayer;
let currentFilter = { type: 'all', certified: false, district: '', community: '' };
let pickMode = false;
let pickCallback = null;
let lastStablePoints = [];
let reloadRetryTimer = null;
let fetchPointsFn = async (filter) => {
  const query = getQueryFromFilter(filter);
  const response = await fetch(`/api/points${query ? `?${query}` : ''}`);
  if (!response.ok) {
    return [];
  }
  return response.json();
};

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const ODESA_BOUNDS = {
  center: [46.7, 30.2],
  defaultZoom: 8,
  cityZoom: 13,
};

function createIcon(fillColor, borderColor = 'none') {
  const svgMarker = `
    <svg width="24" height="32" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="20" height="20" fill="${fillColor}" stroke="${borderColor}" stroke-width="2"/>
      <polygon points="12,32 6,22 18,22" fill="${fillColor}"/>
      <rect x="8" y="8" width="8" height="8" fill="#F4F1EC"/>
    </svg>`;

  return L.divIcon({
    className: 'custom-map-marker',
    html: svgMarker,
    iconSize: [24, 32],
    iconAnchor: [12, 32],
  });
}

function getQueryFromFilter(filter) {
  const query = new URLSearchParams();
  if (filter.type && filter.type !== 'all') {
    query.set('type', filter.type);
  }
  if (filter.certified) {
    query.set('certified', 'true');
  }
  return query.toString();
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

  const badge = data.isCertified
    ? `<span style="margin-left: 12px; color: var(--c-brass); border: 1px solid var(--c-brass); border-radius: 100px; padding: 2px 8px; font-family: var(--font-nav); font-size: 11px;">СЕРТИФІКОВАНО ✦</span>`
    : '';

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
      <div style="height: 160px; background: ${
        data.photoUrl
          ? `url('${data.photoUrl}') center/cover`
          : 'linear-gradient(130deg, #dbeafe 0%, #f8fafc 100%)'
      }; border-radius: var(--radius-md);"></div>
      <div>
        <h2 class="t-h2" style="display: flex; align-items: center;">${data.title} ${badge}</h2>
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
    return;
  }
  try {
    let points = await fetchPointsFn(currentFilter);
    if (!Array.isArray(points)) {
      points = [];
    }

    if (currentFilter.district) {
      points = points.filter((p) =>
        String(p.district || '')
          .toLowerCase()
          .includes(currentFilter.district.toLowerCase())
      );
    }
    if (currentFilter.community) {
      points = points.filter((p) => {
        const district = String(p.district || '').toLowerCase();
        const title = String(p.title || '').toLowerCase();
        const desc = String(p.description || '').toLowerCase();
        const q = currentFilter.community.toLowerCase();
        return district.includes(q) || title.includes(q) || desc.includes(q);
      });
    }

    markerLayer.clearLayers();
    points.forEach((point) => {
      const lat = Number(point?.lat);
      const lng = Number(point?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return;
      }
      const icon = createIcon(
        point?.pointType?.color || '#3D5263',
        point?.isCertified ? '#B8965A' : 'none'
      );

      const marker = L.marker([lat, lng], { icon }).addTo(markerLayer);
      marker.on('click', () => {
        map.flyTo([lat, lng], ODESA_BOUNDS.cityZoom, {
          duration: 1,
          easeLinearity: 0.25,
        });
        showInfoCard(point);
      });
    });

    lastStablePoints = points;
    if (reloadRetryTimer) {
      clearTimeout(reloadRetryTimer);
      reloadRetryTimer = null;
    }
    window.dispatchEvent(new CustomEvent('map:points-updated', { detail: points }));
  } catch (error) {
    console.warn('Points load failed, keeping previous markers', error);
    if (!reloadRetryTimer) {
      reloadRetryTimer = setTimeout(() => {
        reloadRetryTimer = null;
        loadAndRenderPoints().catch(() => null);
      }, 1500);
    }
    window.dispatchEvent(new CustomEvent('map:points-updated', { detail: lastStablePoints || [] }));
  }
}

function setFilter(filter) {
  currentFilter = { ...currentFilter, ...filter };
  return loadAndRenderPoints();
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

function clearRouteHighlight() {
  if (!routeLayer) return;
  routeLayer.clearLayers();
}

function highlightRoute(route) {
  if (!map || !routeLayer) return;
  clearRouteHighlight();

  if (!route || !Array.isArray(route.points) || route.points.length === 0) {
    return;
  }

  const latLngs = route.points.map((p) => [p.lat, p.lng]);
  // Route style: yellow lane stripes for high visibility.
  const baseLine = L.polyline(latLngs, {
    color: '#6F5628',
    weight: 8,
    opacity: 0.85,
    lineCap: 'round',
    lineJoin: 'round',
  }).addTo(routeLayer);

  const polyline = L.polyline(latLngs, {
    color: '#E7C769',
    weight: 5,
    opacity: 1,
    dashArray: '12,8',
    lineCap: 'round',
    lineJoin: 'round',
  }).addTo(routeLayer);

  route.points.forEach((p, idx) => {
    const marker = L.circleMarker([p.lat, p.lng], {
      radius: 9,
      color: '#8A6A2A',
      fillColor: '#F6E4A8',
      fillOpacity: 1,
      weight: 2,
    }).addTo(routeLayer);
    marker.bindTooltip(String(idx + 1), { permanent: true, direction: 'center', className: 'route-order-label' });
  });

  map.fitBounds(baseLine.getBounds(), { padding: [60, 60], maxZoom: ODESA_BOUNDS.cityZoom });
}

function focusLocation(lat, lng, zoom = ODESA_BOUNDS.cityZoom) {
  if (!map) return;
  map.flyTo([lat, lng], zoom, {
    duration: 1,
    easeLinearity: 0.25,
  });
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
      highlightRoute,
      clearRouteHighlight,
      focusLocation,
    };
  }

  map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
  }).setView(ODESA_BOUNDS.center, ODESA_BOUNDS.defaultZoom);

  L.control
    .attribution({ prefix: false })
    .addAttribution('Odesa Region Accessibility Map')
    .addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 20,
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map);

  map.on('click', (e) => {
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
    highlightRoute,
    clearRouteHighlight,
    focusLocation,
  };
}
