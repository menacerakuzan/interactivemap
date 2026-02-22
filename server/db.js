const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { DB_PATH } = require('./config');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

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
  created_by INTEGER NOT NULL,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  FOREIGN KEY (point_type_id) REFERENCES point_types(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
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
`);

const seedPointTypes = [
  ['ramp', 'Пандус', 'Ramp', '#13315C'],
  ['elevator', 'Ліфт', 'Elevator', '#0B2545'],
  ['toilet', 'Туалет', 'Toilet', '#B12B2B'],
  ['parking', 'Паркування', 'Parking', '#C5A059'],
  ['entrance', 'Вхід', 'Entrance', '#2C7A7B'],
  ['crossing', 'Пішохідний перехід', 'Crossing', '#2B6CB0'],
  ['transport_stop', 'Зупинка транспорту', 'Transport Stop', '#805AD5']
];

const insertPointType = db.prepare(`
INSERT OR IGNORE INTO point_types (code, label_uk, label_en, color)
VALUES (?, ?, ?, ?)
`);
seedPointTypes.forEach((row) => insertPointType.run(...row));

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
    INSERT INTO points (title, description, lat, lng, point_type_id, is_certified, district, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertPoint.run(
    'Одеська опера',
    'Повністю доступний вхід. Є пандус та ліфти.',
    46.4825,
    30.7233,
    getTypeId.get('ramp').id,
    1,
    'Приморський район',
    specialist.id
  );
  insertPoint.run(
    'Лиманський парк',
    'Частково доступні доріжки, відсутні спеціалізовані туалети.',
    46.6,
    30.3,
    getTypeId.get('toilet').id,
    0,
    'Одеський район',
    specialist.id
  );
  insertPoint.run(
    'Білгород-Дністровська фортеця',
    'Складний рельєф, обмежений доступ для візків.',
    46.18,
    30.33,
    getTypeId.get('entrance').id,
    0,
    'Білгород-Дністровський район',
    specialist.id
  );
}

module.exports = db;
