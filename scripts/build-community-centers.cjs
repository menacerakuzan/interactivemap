#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const https = require('https');

const ROOT = process.cwd();
const COMMUNITIES_FILE = path.join(ROOT, 'js', 'communities.js');
const OUTPUT_FILE = path.join(ROOT, 'public', 'data', 'community-centers.json');
const REPORT_FILE = path.join(ROOT, 'public', 'data', 'community-centers.report.json');
const AREA_URL = 'https://decentralization.ua/areas/0482';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (odesa-map-centers)' } }, (response) => {
        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => resolve(data));
      })
      .on('error', reject);
  });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (odesa-map-centers)' } }, (response) => {
        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
  });
}

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function composeCommunityLabel(rawName, rawType) {
  const name = cleanText(rawName)
    .replace(/\s+територіальна\s+громада$/i, '')
    .trim();
  let type = cleanText(rawType).toLowerCase();
  if (!type && /^Красносільська$/i.test(name)) type = 'сільська';
  if (!name) return '';
  if (!type) return name;
  return `${name} ${type}`.replace(/\s+/g, ' ').trim();
}

function parseCommunitiesModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const transformed = source
    .replace('export const DISTRICT_CENTERS =', 'const DISTRICT_CENTERS =')
    .replace('export const COMMUNITIES_BY_DISTRICT =', 'const COMMUNITIES_BY_DISTRICT =')
    .concat('\nmodule.exports = { DISTRICT_CENTERS, COMMUNITIES_BY_DISTRICT };\n');

  const context = { module: { exports: {} }, exports: {} };
  vm.createContext(context);
  vm.runInContext(transformed, context, { filename: 'communities.js' });
  return context.module.exports;
}

async function fetchAreaCommunityIndex() {
  const result = new Map();
  for (let page = 1; page <= 25; page += 1) {
    const url = page === 1 ? AREA_URL : `${AREA_URL}?page=${page}`;
    const html = await fetchHtml(url);
    const linkRe = /href="\/(?:new)?gromada\/(\d+)">([^<]+)<\/a>/g;

    let pageCount = 0;
    let m;
    while ((m = linkRe.exec(html))) {
      const id = m[1];
      if (result.has(id)) continue;

      const rawName = cleanText(m[2]);
      const chunk = html.slice(m.index, Math.min(html.length, m.index + 3500));
      const districtMatch = chunk.match(/title=['"]Район['"]>\s*([^<\n]+)\s*</i);
      const typeMatch = chunk.match(/title=['"]Тип громади['"]>\s*([^<\n]+)\s*</i);

      const districtShort = cleanText(districtMatch?.[1] || '');
      const type = cleanText(typeMatch?.[1] || '');
      const district = districtShort ? `${districtShort} район` : '';
      const community = composeCommunityLabel(rawName, type);
      if (!district || !community) continue;

      result.set(id, { id, district, community });
      pageCount += 1;
    }

    if (!pageCount) break;
  }
  return result;
}

async function fetchCommunityAdminCenterById(id) {
  try {
    const html = await fetchHtml(`https://decentralization.ua/newgromada/${id}?page=2`);
    const match = html.match(/Центр громади:\s*<a[^>]*>([^<]+)<\/a>/i);
    return cleanText(match?.[1] || '');
  } catch (_error) {
    return '';
  }
}

function normalizePlacePrefix(value) {
  return cleanText(value)
    .replace(/^(село|селище|місто|смт)\s+/i, '')
    .trim();
}

function buildQueries(district, community, adminCenter) {
  const queries = [];
  const area = 'Одеська область';

  if (adminCenter) {
    queries.push(`${adminCenter}, ${district}, ${area}, Україна`);
    const centerNoPrefix = normalizePlacePrefix(adminCenter);
    if (centerNoPrefix && centerNoPrefix !== adminCenter) {
      queries.push(`${centerNoPrefix}, ${district}, ${area}, Україна`);
      queries.push(`${centerNoPrefix}, ${area}, Україна`);
    }
  }

  queries.push(`${community}, ${district}, ${area}, Україна`);
  queries.push(`${community}, ${area}, Україна`);

  return [...new Set(queries)];
}

function scorePhotonFeature(feature, district) {
  const p = feature?.properties || {};
  const state = normalizeKey(p.state || '');
  const county = normalizeKey(p.county || '');
  const districtKey = normalizeKey(district);
  let score = 0;
  if (p.countrycode === 'UA' || p.countrycode === 'ua') score += 4;
  if (state.includes('одеська область')) score += 4;
  if (county.includes(districtKey)) score += 5;
  if (p.type === 'city' || p.type === 'town' || p.type === 'village' || p.type === 'hamlet') score += 1;
  return score;
}

async function geocodeWithPhoton(query, district) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=10`;
  const json = await fetchJson(url);
  const features = Array.isArray(json?.features) ? json.features : [];
  if (!features.length) return null;

  const sorted = features
    .map((f) => ({ f, score: scorePhotonFeature(f, district) }))
    .sort((a, b) => b.score - a.score);

  const best = sorted[0];
  if (!best || best.score < 7) return null;
  const coords = best.f?.geometry?.coordinates || [];
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    lat,
    lng,
    score: best.score,
    props: best.f.properties || {},
  };
}

async function resolveCommunityCenter(district, community, adminCenter) {
  const queries = buildQueries(district, community, adminCenter);
  for (const query of queries) {
    try {
      const result = await geocodeWithPhoton(query, district);
      if (result) {
        return {
          lat: result.lat,
          lng: result.lng,
          sourceQuery: query,
          score: result.score,
          props: result.props,
        };
      }
    } catch (_error) {
      // keep trying
    }
    await sleep(120);
  }
  return null;
}

async function main() {
  const { DISTRICT_CENTERS, COMMUNITIES_BY_DISTRICT } = parseCommunitiesModule(COMMUNITIES_FILE);
  const areaIndex = await fetchAreaCommunityIndex();

  const byDistrictCommunity = new Map();
  areaIndex.forEach((row) => {
    const key = `${normalizeKey(row.district)}::${normalizeKey(row.community)}`;
    byDistrictCommunity.set(key, row.id);
  });

  const districts = Object.keys(COMMUNITIES_BY_DISTRICT);
  const total = districts.reduce((sum, district) => sum + COMMUNITIES_BY_DISTRICT[district].length, 0);

  const out = [];
  const misses = [];
  let done = 0;

  for (const district of districts) {
    const communities = COMMUNITIES_BY_DISTRICT[district] || [];
    for (const community of communities) {
      done += 1;
      process.stdout.write(`[${done}/${total}] ${district} -> ${community}\n`);

      const key = `${normalizeKey(district)}::${normalizeKey(community)}`;
      const id = byDistrictCommunity.get(key) || null;
      const adminCenter = id ? await fetchCommunityAdminCenterById(id) : '';
      if (id) await sleep(50);

      const resolved = await resolveCommunityCenter(district, community, adminCenter);
      if (!resolved) {
        const fallback = DISTRICT_CENTERS[district] || null;
        if (!fallback) {
          misses.push({ district, community, reason: 'geocode_failed_no_district_fallback', gromadaId: id, adminCenter });
          continue;
        }
        out.push({
          district,
          community,
          lat: Number(fallback.lat),
          lng: Number(fallback.lng),
          zoom: 12,
          source: 'district_fallback',
          adminCenter,
          gromadaId: id,
        });
        misses.push({ district, community, reason: 'geocode_failed_used_district_fallback', gromadaId: id, adminCenter });
        continue;
      }

      out.push({
        district,
        community,
        lat: Number(resolved.lat.toFixed(6)),
        lng: Number(resolved.lng.toFixed(6)),
        zoom: 12,
        source: 'photon',
        sourceQuery: resolved.sourceQuery,
        score: resolved.score,
        adminCenter,
        gromadaId: id,
      });

      await sleep(120);
    }
  }

  out.sort((a, b) => {
    const districtCmp = a.district.localeCompare(b.district, 'uk');
    if (districtCmp !== 0) return districtCmp;
    return a.community.localeCompare(b.community, 'uk');
  });

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(out, null, 2)}\n`, 'utf8');

  const report = {
    generatedAt: new Date().toISOString(),
    total,
    resolved: out.length,
    misses: misses.length,
    sourceBreakdown: out.reduce((acc, row) => {
      const key = row.source || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    missingItems: misses,
  };
  fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  process.stdout.write(`\nSaved: ${OUTPUT_FILE}\n`);
  process.stdout.write(`Saved: ${REPORT_FILE}\n`);
  process.stdout.write(`Resolved: ${out.length}/${total}, misses: ${misses.length}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
