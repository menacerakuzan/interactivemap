const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { DB_PATH } = require('./config');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'specialist', 'viewer')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS point_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  label_uk TEXT NOT NULL,
  label_en TEXT NOT NULL,
  color TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  point_type_id INTEGER NOT NULL,
  is_certified INTEGER NOT NULL DEFAULT 0,
  district TEXT,
  photo_url TEXT,
  created_by INTEGER NOT NULL,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  FOREIGN KEY (point_type_id) REFERENCES point_types(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS point_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  point_id INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 1,
  title TEXT,
  description TEXT,
  photo_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (point_id) REFERENCES points(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  route_color TEXT,
  status TEXT NOT NULL CHECK(status IN ('draft', 'review', 'published')) DEFAULT 'draft',
  created_by INTEGER NOT NULL,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS route_points (
  route_id INTEGER NOT NULL,
  point_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  note TEXT,
  PRIMARY KEY (route_id, point_id),
  FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
  FOREIGN KEY (point_id) REFERENCES points(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  link TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS point_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  space_type TEXT NOT NULL,
  district TEXT NOT NULL,
  address TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  email TEXT NOT NULL,
  photo_url TEXT,
  comment TEXT,
  checklist_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed INTEGER NOT NULL DEFAULT 0
);
`);

const pointColumns = db.prepare("PRAGMA table_info(points)").all();
if (!pointColumns.some((c) => c.name === 'photo_url')) {
  db.exec('ALTER TABLE points ADD COLUMN photo_url TEXT');
}

const newsColumns = db.prepare("PRAGMA table_info(news)").all();
if (!newsColumns.some((c) => c.name === 'image_url')) {
  db.exec('ALTER TABLE news ADD COLUMN image_url TEXT');
}

const routeColumns = db.prepare("PRAGMA table_info(routes)").all();
if (!routeColumns.some((c) => c.name === 'route_color')) {
  db.exec('ALTER TABLE routes ADD COLUMN route_color TEXT');
}

const seedPointTypes = [
  ['administration', 'Адміністрація', 'Administration', '#13315C'],
  ['fuel_station', 'АЗС', 'Fuel Station', '#0B2545'],
  ['pharmacy', 'Аптека', 'Pharmacy', '#B12B2B'],
  ['bank', 'Банк', 'Bank', '#C5A059'],
  ['station', 'Вокзал', 'Station', '#2C7A7B'],
  ['housing', 'Житло', 'Housing', '#2B6CB0'],
  ['stop_a', 'Зупинка А', 'Stop A', '#805AD5'],
  ['stop_p', 'Зупинка П', 'Stop P', '#0F766E'],
  ['stop_t', 'Зупинка Т', 'Stop T', '#7C2D12'],
  ['cafe', 'Кафе', 'Cafe', '#A16207'],
  ['culture', 'Культура', 'Culture', '#6D28D9'],
  ['playground', 'Майданчик', 'Playground', '#0369A1'],
  ['medical', 'Мед заклад', 'Medical', '#BE123C'],
  ['education', 'Навчал заклад', 'Education', '#1D4ED8'],
  ['park', 'Парк', 'Park', '#15803D'],
  ['hairdresser', 'Перукарня', 'Hairdresser', '#7E22CE'],
  ['post', 'Пошта', 'Post', '#0E7490'],
  ['restaurant', 'Ресторан', 'Restaurant', '#9A3412'],
  ['social_services', 'Соціальні послуги', 'Social Services', '#1E3A8A'],
  ['sport', 'Спорт', 'Sport', '#166534'],
  ['shelter', 'Укриття', 'Shelter', '#334155'],
];

const upsertPointType = db.prepare(`
INSERT INTO point_types (code, label_uk, label_en, color)
VALUES (?, ?, ?, ?)
ON CONFLICT(code) DO UPDATE SET
  label_uk = excluded.label_uk,
  label_en = excluded.label_en,
  color = excluded.color
`);
seedPointTypes.forEach((row) => upsertPointType.run(...row));

const legacyToNewTypeCode = {
  ramp: 'social_services',
  elevator: 'social_services',
  toilet: 'medical',
  parking: 'fuel_station',
  entrance: 'administration',
  crossing: 'park',
  transport_stop: 'stop_t',
};

const getTypeIdByCode = db.prepare('SELECT id FROM point_types WHERE code = ?');
const rebindPointType = db.prepare('UPDATE points SET point_type_id = ? WHERE point_type_id = ?');
Object.entries(legacyToNewTypeCode).forEach(([legacyCode, newCode]) => {
  const legacy = getTypeIdByCode.get(legacyCode);
  const target = getTypeIdByCode.get(newCode);
  if (legacy?.id && target?.id && legacy.id !== target.id) {
    rebindPointType.run(target.id, legacy.id);
  }
});
const deleteLegacyType = db.prepare('DELETE FROM point_types WHERE code = ?');
Object.keys(legacyToNewTypeCode).forEach((legacyCode) => deleteLegacyType.run(legacyCode));

const adminEmail = 'admin@odesa-map.local';
const specialistEmail = 'specialist@odesa-map.local';
const viewerEmail = 'viewer@odesa-map.local';
const passwordHash = bcrypt.hashSync('Odesa123!', 10);

const insertUser = db.prepare(`
INSERT OR IGNORE INTO users (email, password_hash, full_name, role)
VALUES (?, ?, ?, ?)
`);
insertUser.run(adminEmail, passwordHash, 'System Admin', 'admin');
insertUser.run(specialistEmail, passwordHash, 'Field Specialist', 'specialist');
insertUser.run(viewerEmail, passwordHash, 'Public Viewer', 'viewer');

const pointsCount = db.prepare('SELECT COUNT(*) AS count FROM points').get().count;
if (pointsCount === 0) {
  const getTypeId = db.prepare('SELECT id FROM point_types WHERE code = ?');
  const specialist = db
    .prepare("SELECT id FROM users WHERE email = 'specialist@odesa-map.local'")
    .get();

  const insertPoint = db.prepare(`
    INSERT INTO points (title, description, lat, lng, point_type_id, is_certified, district, photo_url, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertPoint.run(
    'Одеська опера',
    'Повністю доступний вхід. Є пандус та ліфти.',
    46.4825,
    30.7233,
    getTypeId.get('culture').id,
    1,
    'Приморський район',
    'https://images.unsplash.com/photo-1552845108-5f775a2ccb9b?auto=format&fit=crop&w=900&q=80',
    specialist.id
  );
  insertPoint.run(
    'Лиманський парк',
    'Частково доступні доріжки, відсутні спеціалізовані туалети.',
    46.6,
    30.3,
    getTypeId.get('park').id,
    0,
    'Одеський район',
    'https://images.unsplash.com/photo-1473116763249-2faaef81ccda?auto=format&fit=crop&w=900&q=80',
    specialist.id
  );
  insertPoint.run(
    'Білгород-Дністровська фортеця',
    'Складний рельєф, обмежений доступ для візків.',
    46.18,
    30.33,
    getTypeId.get('administration').id,
    0,
    'Білгород-Дністровський район',
    'https://images.unsplash.com/photo-1590490359854-dfba19688d70?auto=format&fit=crop&w=900&q=80',
    specialist.id
  );
}

const newsCount = db.prepare('SELECT COUNT(*) AS count FROM news').get().count;
if (newsCount === 0) {
  const specialist = db
    .prepare("SELECT id FROM users WHERE email = 'specialist@odesa-map.local'")
    .get();

  const insertNews = db.prepare(`
    INSERT INTO news (title, summary, link, created_by)
    VALUES (?, ?, ?, ?)
  `);

  insertNews.run(
    'Завершено аудит Приморського району',
    "Перевірено 45 об'єктів соціальної інфраструктури. З них 12 отримали статус сертифікованих.",
    'https://oda.od.gov.ua/',
    specialist.id
  );
  insertNews.run(
    'Оновлення стандартів пандусів',
    'Згідно з ДБН В.2.2-40:2018, максимальний ухил зовнішніх пандусів не може перевищувати 8%.',
    'https://www.minregion.gov.ua/',
    specialist.id
  );
}

module.exports = db;
