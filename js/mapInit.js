let map;
let markerLayer;
let routeLayer;
let publishedRouteLayer;
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
    <svg width="28" height="38" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M14 1.5C7.1 1.5 1.5 7.1 1.5 14c0 9.8 11 20.6 11.5 21.1a1.5 1.5 0 0 0 2 0C15.5 34.6 26.5 23.8 26.5 14 26.5 7.1 20.9 1.5 14 1.5Z"
            fill="${fillColor}" stroke="${borderColor}" stroke-width="2"/>
      <circle cx="14" cy="14" r="5.2" fill="#F4F1EC" opacity="0.95"/>
    </svg>`;

  return L.divIcon({
    className: 'custom-map-marker',
    html: svgMarker,
    iconSize: [28, 38],
    iconAnchor: [14, 37],
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
        map.panTo([lat, lng], {
          animate: true,
          duration: 0.35,
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

    // Show the same point order markers for public users as in specialist mode.
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
      marker.bindTooltip(String(idx + 1), {
        permanent: true,
        direction: 'center',
        className: 'route-order-label',
      });
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

  route.points.forEach((p, idx) => {
    const marker = L.circleMarker([p.lat, p.lng], {
      radius: 9,
      color: '#1E3A5F',
      fillColor: color,
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
      setPublishedRoutes,
      focusLocation,
    };
  }

  map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    zoomAnimation: true,
    markerZoomAnimation: false,
    fadeAnimation: true,
    zoomSnap: 0.25,
    zoomDelta: 0.25,
    scrollWheelZoom: false,
    touchZoom: 'center',
    wheelDebounceTime: 20,
    wheelPxPerZoomLevel: 90,
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
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map);
  publishedRouteLayer = L.layerGroup().addTo(map);

  // Custom trackpad-friendly wheel zoom: stable step zoom without map jumps.
  const mapContainer = map.getContainer();
  let wheelAccumulator = 0;
  let wheelLocked = false;
  const wheelThreshold = 16;
  const wheelStep = 0.25;
  const lockMs = 50;

  const normalizeWheelDelta = (event) => {
    if (event.deltaMode === 1) return event.deltaY * 16;
    if (event.deltaMode === 2) return event.deltaY * window.innerHeight;
    return event.deltaY;
  };

  mapContainer.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      wheelAccumulator += normalizeWheelDelta(event);

      if (wheelLocked || Math.abs(wheelAccumulator) < wheelThreshold) {
        return;
      }

      const direction = wheelAccumulator > 0 ? -1 : 1;
      const currentZoom = map.getZoom();
      const nextZoom = Math.max(
        map.getMinZoom(),
        Math.min(map.getMaxZoom(), currentZoom + direction * wheelStep)
      );

      wheelAccumulator -= Math.sign(wheelAccumulator) * wheelThreshold;
      if (nextZoom === currentZoom) {
        wheelAccumulator = 0;
        return;
      }

      wheelLocked = true;
      map.setZoom(nextZoom, { animate: true });
      setTimeout(() => {
        wheelLocked = false;
      }, lockMs);
    },
    { passive: false }
  );

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
    setPublishedRoutes,
    focusLocation,
  };
}
