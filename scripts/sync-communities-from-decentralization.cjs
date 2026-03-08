#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');

const ROOT = process.cwd();
const SOURCE_URL = 'https://decentralization.ua/areas/0482';
const TARGET_FILE = path.join(ROOT, 'js', 'communities.js');

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (odesa-map-sync)' } }, (response) => {
        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => resolve(data));
      })
      .on('error', reject);
  });
}

function parseCurrentDistrictCenters() {
  const source = fs.readFileSync(TARGET_FILE, 'utf8');
  const transformed = source
    .replace('export const DISTRICT_CENTERS =', 'const DISTRICT_CENTERS =')
    .replace('export const COMMUNITIES_BY_DISTRICT =', 'const COMMUNITIES_BY_DISTRICT =')
    .concat('\nmodule.exports = { DISTRICT_CENTERS, COMMUNITIES_BY_DISTRICT };\n');
  const context = { module: { exports: {} }, exports: {} };
  vm.createContext(context);
  vm.runInContext(transformed, context, { filename: 'communities.js' });
  return context.module.exports.DISTRICT_CENTERS;
}

function cleanText(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTitleCaseFirst(value) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function composeCommunityLabel(rawName, rawType) {
  const name = cleanText(rawName)
    .replace(/\s+територіальна\s+громада$/i, '')
    .trim();
  let type = cleanText(rawType).toLowerCase();
  if (!type && /^Красносільська$/i.test(name)) {
    type = 'сільська';
  }
  if (!name) return '';
  if (!type) return toTitleCaseFirst(name);
  return `${toTitleCaseFirst(name)} ${type}`.replace(/\s+/g, ' ').trim();
}

function parseCommunitiesFromPage(html) {
  const entries = [];
  const seenOnPage = new Set();
  const linkRe = /href="\/(?:new)?gromada\/(\d+)">([^<]+)<\/a>/g;

  let match;
  while ((match = linkRe.exec(html))) {
    const id = match[1];
    const rawName = cleanText(match[2]);
    if (seenOnPage.has(id)) continue;

    const from = match.index;
    const to = Math.min(html.length, from + 3500);
    const chunk = html.slice(from, to);

    const districtMatch = chunk.match(/title=['"]Район['"]>\s*([^<\n]+)\s*</i);
    const typeMatch = chunk.match(/title=['"]Тип громади['"]>\s*([^<\n]+)\s*</i);

    const districtShort = cleanText(districtMatch?.[1] || '');
    const type = cleanText(typeMatch?.[1] || '');
    const label = composeCommunityLabel(rawName, type);

    if (!districtShort || !label) continue;

    entries.push({
      id,
      district: `${districtShort} район`,
      community: label,
    });
    seenOnPage.add(id);
  }

  return entries;
}

function renderCommunitiesFile(districtCenters, communitiesByDistrict) {
  const districtKeys = Object.keys(districtCenters);

  const lines = [];
  lines.push('export const DISTRICT_CENTERS = {');
  districtKeys.forEach((district) => {
    const c = districtCenters[district];
    lines.push(`  '${district}': { lat: ${c.lat}, lng: ${c.lng}, zoom: ${c.zoom} },`);
  });
  lines.push('};');
  lines.push('');
  lines.push('export const COMMUNITIES_BY_DISTRICT = {');
  districtKeys.forEach((district) => {
    const list = communitiesByDistrict[district] || [];
    lines.push(`  '${district}': [`);
    list.forEach((community) => {
      const escaped = community.replaceAll("'", "\\'");
      lines.push(`    '${escaped}',`);
    });
    lines.push('  ],');
  });
  lines.push('};');
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const districtCenters = parseCurrentDistrictCenters();
  const allEntries = [];

  for (let page = 1; page <= 25; page += 1) {
    const url = page === 1 ? SOURCE_URL : `${SOURCE_URL}?page=${page}`;
    const html = await fetchHtml(url);
    const parsed = parseCommunitiesFromPage(html);
    if (!parsed.length) break;
    allEntries.push(...parsed);
    process.stdout.write(`page ${page}: ${parsed.length}\n`);
  }

  const byId = new Map();
  allEntries.forEach((entry) => {
    if (!byId.has(entry.id)) byId.set(entry.id, entry);
  });

  const deduped = [...byId.values()];
  const communitiesByDistrict = Object.fromEntries(Object.keys(districtCenters).map((k) => [k, []]));

  deduped.forEach((entry) => {
    if (!communitiesByDistrict[entry.district]) {
      communitiesByDistrict[entry.district] = [];
    }
    communitiesByDistrict[entry.district].push(entry.community);
  });

  Object.keys(communitiesByDistrict).forEach((district) => {
    communitiesByDistrict[district] = [...new Set(communitiesByDistrict[district])].sort((a, b) =>
      a.localeCompare(b, 'uk')
    );
  });

  const total = Object.values(communitiesByDistrict).reduce((sum, list) => sum + list.length, 0);
  const output = renderCommunitiesFile(districtCenters, communitiesByDistrict);
  fs.writeFileSync(TARGET_FILE, output, 'utf8');

  const reportPath = path.join(ROOT, 'public', 'data', 'communities-sync-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalCommunities: total,
        districts: Object.fromEntries(
          Object.keys(communitiesByDistrict).map((district) => [district, communitiesByDistrict[district].length])
        ),
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  process.stdout.write(`total communities: ${total}\n`);
  process.stdout.write(`updated: ${TARGET_FILE}\n`);
  process.stdout.write(`report: ${reportPath}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
