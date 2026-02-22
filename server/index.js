const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { PORT, JWT_SECRET } = require('./config');
const { authenticate, requireRole } = require('./auth');

const app = express();

app.use(cors());
app.use(express.json());

const mapPointRow = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  lat: row.lat,
  lng: row.lng,
  district: row.district,
  isCertified: Boolean(row.is_certified),
  pointType: {
    id: row.point_type_id,
    code: row.point_type_code,
    labelUk: row.point_type_label_uk,
    labelEn: row.point_type_label_en,
    color: row.point_type_color,
  },
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db
    .prepare('SELECT id, email, password_hash, full_name, role FROM users WHERE email = ?')
    .get(email.toLowerCase());

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, fullName: user.full_name, role: user.role },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    },
  });
});

app.get('/api/point-types', (_req, res) => {
  const rows = db.prepare('SELECT id, code, label_uk, label_en, color FROM point_types ORDER BY id').all();
  res.json(
    rows.map((r) => ({
      id: r.id,
      code: r.code,
      labelUk: r.label_uk,
      labelEn: r.label_en,
      color: r.color,
    }))
  );
});

app.get('/api/points', (req, res) => {
  const { type, certified } = req.query;

  let sql = `
    SELECT p.*, pt.code AS point_type_code, pt.label_uk AS point_type_label_uk, pt.label_en AS point_type_label_en, pt.color AS point_type_color
    FROM points p
    JOIN point_types pt ON pt.id = p.point_type_id
    WHERE 1=1
  `;
  const params = [];

  if (type) {
    sql += ' AND pt.code = ?';
    params.push(type);
  }

  if (certified === 'true') {
    sql += ' AND p.is_certified = 1';
  }

  sql += ' ORDER BY p.created_at DESC';

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(mapPointRow));
});

app.post('/api/points', authenticate, requireRole('admin', 'specialist'), (req, res) => {
  const { title, description, lat, lng, pointTypeCode, isCertified, district } = req.body;

  if (!title || typeof lat !== 'number' || typeof lng !== 'number' || !pointTypeCode) {
    return res.status(400).json({ error: 'title, lat, lng, pointTypeCode are required' });
  }

  const pointType = db.prepare('SELECT id FROM point_types WHERE code = ?').get(pointTypeCode);
  if (!pointType) {
    return res.status(400).json({ error: 'Invalid pointTypeCode' });
  }

  const result = db
    .prepare(`
      INSERT INTO points (title, description, lat, lng, point_type_id, is_certified, district, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      title,
      description || null,
      lat,
      lng,
      pointType.id,
      isCertified ? 1 : 0,
      district || null,
      req.user.id
    );

  const row = db
    .prepare(`
      SELECT p.*, pt.code AS point_type_code, pt.label_uk AS point_type_label_uk, pt.label_en AS point_type_label_en, pt.color AS point_type_color
      FROM points p
      JOIN point_types pt ON pt.id = p.point_type_id
      WHERE p.id = ?
    `)
    .get(result.lastInsertRowid);

  return res.status(201).json(mapPointRow(row));
});

app.put('/api/points/:id', authenticate, requireRole('admin', 'specialist'), (req, res) => {
  const pointId = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM points WHERE id = ?').get(pointId);
  if (!existing) {
    return res.status(404).json({ error: 'Point not found' });
  }

  const { title, description, lat, lng, pointTypeCode, isCertified, district } = req.body;

  const pointType = pointTypeCode
    ? db.prepare('SELECT id FROM point_types WHERE code = ?').get(pointTypeCode)
    : null;

  if (pointTypeCode && !pointType) {
    return res.status(400).json({ error: 'Invalid pointTypeCode' });
  }

  db.prepare(`
    UPDATE points
    SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      lat = COALESCE(?, lat),
      lng = COALESCE(?, lng),
      point_type_id = COALESCE(?, point_type_id),
      is_certified = COALESCE(?, is_certified),
      district = COALESCE(?, district),
      updated_by = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    title ?? null,
    description ?? null,
    lat ?? null,
    lng ?? null,
    pointType ? pointType.id : null,
    typeof isCertified === 'boolean' ? (isCertified ? 1 : 0) : null,
    district ?? null,
    req.user.id,
    pointId
  );

  const row = db
    .prepare(`
      SELECT p.*, pt.code AS point_type_code, pt.label_uk AS point_type_label_uk, pt.label_en AS point_type_label_en, pt.color AS point_type_color
      FROM points p
      JOIN point_types pt ON pt.id = p.point_type_id
      WHERE p.id = ?
    `)
    .get(pointId);

  return res.json(mapPointRow(row));
});

app.delete('/api/points/:id', authenticate, requireRole('admin'), (req, res) => {
  const pointId = Number(req.params.id);
  const result = db.prepare('DELETE FROM points WHERE id = ?').run(pointId);
  if (!result.changes) {
    return res.status(404).json({ error: 'Point not found' });
  }
  return res.status(204).send();
});

app.get('/api/routes', authenticate, (req, res) => {
  const isPrivileged = ['admin', 'specialist'].includes(req.user.role);
  const rows = isPrivileged
    ? db
        .prepare(
          `SELECT r.*, u.full_name AS author_name
           FROM routes r
           JOIN users u ON u.id = r.created_by
           ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC`
        )
        .all()
    : db
        .prepare(
          `SELECT r.*, u.full_name AS author_name
           FROM routes r
           JOIN users u ON u.id = r.created_by
           WHERE r.status = 'published'
           ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC`
        )
        .all();

  const routePointStmt = db.prepare(`
    SELECT rp.position, rp.note, p.id AS point_id, p.title, p.lat, p.lng
    FROM route_points rp
    JOIN points p ON p.id = rp.point_id
    WHERE rp.route_id = ?
    ORDER BY rp.position
  `);

  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      status: r.status,
      createdBy: r.created_by,
      authorName: r.author_name,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      points: routePointStmt.all(r.id).map((p) => ({
        id: p.point_id,
        title: p.title,
        lat: p.lat,
        lng: p.lng,
        position: p.position,
        note: p.note,
      })),
    }))
  );
});

app.post('/api/routes', authenticate, requireRole('admin', 'specialist'), (req, res) => {
  const { name, description, status = 'draft', points = [] } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  if (!['draft', 'review', 'published'].includes(status)) {
    return res.status(400).json({ error: 'Invalid route status' });
  }

  const tx = db.transaction(() => {
    const routeResult = db
      .prepare(
        'INSERT INTO routes (name, description, status, created_by) VALUES (?, ?, ?, ?)'
      )
      .run(name, description || null, status, req.user.id);

    const routeId = routeResult.lastInsertRowid;

    const insertRoutePoint = db.prepare(
      'INSERT INTO route_points (route_id, point_id, position, note) VALUES (?, ?, ?, ?)'
    );

    points.forEach((p, index) => {
      const pointId = Number(p.pointId);
      const pointExists = db.prepare('SELECT id FROM points WHERE id = ?').get(pointId);
      if (!pointExists) {
        throw new Error(`Point ${pointId} not found`);
      }
      insertRoutePoint.run(routeId, pointId, index + 1, p.note || null);
    });

    return Number(routeId);
  });

  try {
    const routeId = tx();
    return res.status(201).json({ id: routeId });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.put('/api/routes/:id', authenticate, requireRole('admin', 'specialist'), (req, res) => {
  const routeId = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM routes WHERE id = ?').get(routeId);
  if (!existing) {
    return res.status(404).json({ error: 'Route not found' });
  }

  const { name, description, status, points } = req.body;
  if (status && !['draft', 'review', 'published'].includes(status)) {
    return res.status(400).json({ error: 'Invalid route status' });
  }

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE routes
      SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        status = COALESCE(?, status),
        updated_by = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(name ?? null, description ?? null, status ?? null, req.user.id, routeId);

    if (Array.isArray(points)) {
      db.prepare('DELETE FROM route_points WHERE route_id = ?').run(routeId);
      const insertRoutePoint = db.prepare(
        'INSERT INTO route_points (route_id, point_id, position, note) VALUES (?, ?, ?, ?)'
      );

      points.forEach((p, index) => {
        const pointId = Number(p.pointId);
        const pointExists = db.prepare('SELECT id FROM points WHERE id = ?').get(pointId);
        if (!pointExists) {
          throw new Error(`Point ${pointId} not found`);
        }
        insertRoutePoint.run(routeId, pointId, index + 1, p.note || null);
      });
    }
  });

  try {
    tx();
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
