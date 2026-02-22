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
const ROUTE_STATUSES = new Set(['draft', 'review', 'published']);

function isNonEmptyText(value, maxLen = 255) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLen;
}

function isValidCoordinate(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function normalizeOptionalText(value, maxLen = 2000) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

async function resolveSourceImage(link) {
  if (!link) return null;
  let normalizedLink = null;
  try {
    normalizedLink = new URL(link).toString();
  } catch (_e) {
    return null;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const response = await fetch(normalizedLink, { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const html = await response.text();
    const candidates = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
      /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
    ];
    for (const pattern of candidates) {
      const match = html.match(pattern);
      if (match?.[1]) {
        try {
          return new URL(match[1], link).toString();
        } catch (_e) {
          // continue
        }
      }
    }
    return `https://image.thum.io/get/width/1200/noanimate/${encodeURIComponent(normalizedLink)}`;
  } catch (_e) {
    return `https://image.thum.io/get/width/1200/noanimate/${encodeURIComponent(normalizedLink)}`;
  }
}

const mapPointRow = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  lat: row.lat,
  lng: row.lng,
  district: row.district,
  photoUrl: row.photo_url || null,
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
  sections: Array.isArray(row.sections) ? row.sections : [],
});

function readPointSections(pointId) {
  return db
    .prepare(
      `SELECT id, point_id, position, title, description, photo_url
       FROM point_sections
       WHERE point_id = ?
       ORDER BY position, id`
    )
    .all(pointId)
    .map((row) => ({
      id: row.id,
      pointId: row.point_id,
      position: row.position,
      title: row.title || '',
      description: row.description || '',
      photoUrl: row.photo_url || null,
    }));
}

function normalizePointSections(input) {
  if (!Array.isArray(input)) return undefined;
  const normalized = [];
  input.forEach((section, index) => {
    if (!section || typeof section !== 'object') return;
    const title = normalizeOptionalText(section.title, 180) || null;
    const description = normalizeOptionalText(section.description, 2000) || null;
    const photoUrl = normalizeOptionalText(section.photoUrl, 1200) || null;
    if (!title && !description && !photoUrl) return;
    normalized.push({
      position: index + 1,
      title,
      description,
      photoUrl,
    });
  });
  return normalized;
}

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
  res.json(
    rows.map((row) =>
      mapPointRow({
        ...row,
        sections: readPointSections(row.id),
      })
    )
  );
});

app.post('/api/points', authenticate, requireRole('admin', 'specialist'), (req, res) => {
  const { title, description, lat, lng, pointTypeCode, isCertified, district, photoUrl, sections } = req.body;

  if (!isNonEmptyText(title, 160) || !isValidCoordinate(lat, -90, 90) || !isValidCoordinate(lng, -180, 180) || !pointTypeCode) {
    return res.status(400).json({ error: 'title, lat, lng, pointTypeCode are required' });
  }

  const pointType = db.prepare('SELECT id FROM point_types WHERE code = ?').get(pointTypeCode);
  if (!pointType) {
    return res.status(400).json({ error: 'Invalid pointTypeCode' });
  }

  const normalizedSections = normalizePointSections(sections) || [];
  const tx = db.transaction(() => {
    const result = db
      .prepare(`
        INSERT INTO points (title, description, lat, lng, point_type_id, is_certified, district, photo_url, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        title.trim(),
        normalizeOptionalText(description, 2000),
        lat,
        lng,
        pointType.id,
        isCertified ? 1 : 0,
        normalizeOptionalText(district, 255),
        normalizeOptionalText(photoUrl, 1200),
        req.user.id
      );

    const pointId = Number(result.lastInsertRowid);
    if (normalizedSections.length) {
      const insertSection = db.prepare(
        'INSERT INTO point_sections (point_id, position, title, description, photo_url) VALUES (?, ?, ?, ?, ?)'
      );
      normalizedSections.forEach((section) => {
        insertSection.run(pointId, section.position, section.title, section.description, section.photoUrl);
      });
    }
    return pointId;
  });

  const pointId = tx();

  const row = db
    .prepare(`
      SELECT p.*, pt.code AS point_type_code, pt.label_uk AS point_type_label_uk, pt.label_en AS point_type_label_en, pt.color AS point_type_color
      FROM points p
      JOIN point_types pt ON pt.id = p.point_type_id
      WHERE p.id = ?
    `)
    .get(pointId);

  return res.status(201).json(
    mapPointRow({
      ...row,
      sections: readPointSections(pointId),
    })
  );
});

app.put('/api/points/:id', authenticate, requireRole('admin', 'specialist'), (req, res) => {
  const pointId = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM points WHERE id = ?').get(pointId);
  if (!existing) {
    return res.status(404).json({ error: 'Point not found' });
  }

  const { title, description, lat, lng, pointTypeCode, isCertified, district, photoUrl, sections } = req.body;

  const pointType = pointTypeCode
    ? db.prepare('SELECT id FROM point_types WHERE code = ?').get(pointTypeCode)
    : null;

  if (pointTypeCode && !pointType) {
    return res.status(400).json({ error: 'Invalid pointTypeCode' });
  }

  if (title !== undefined && !isNonEmptyText(title, 160)) {
    return res.status(400).json({ error: 'Invalid title' });
  }
  if (lat !== undefined && !isValidCoordinate(lat, -90, 90)) {
    return res.status(400).json({ error: 'Invalid latitude' });
  }
  if (lng !== undefined && !isValidCoordinate(lng, -180, 180)) {
    return res.status(400).json({ error: 'Invalid longitude' });
  }

  const fields = [];
  const values = [];
  if (title !== undefined) {
    fields.push('title = ?');
    values.push(String(title).trim());
  }
  if (description !== undefined) {
    fields.push('description = ?');
    values.push(normalizeOptionalText(description, 2000));
  }
  if (lat !== undefined) {
    fields.push('lat = ?');
    values.push(lat);
  }
  if (lng !== undefined) {
    fields.push('lng = ?');
    values.push(lng);
  }
  if (pointType) {
    fields.push('point_type_id = ?');
    values.push(pointType.id);
  }
  if (typeof isCertified === 'boolean') {
    fields.push('is_certified = ?');
    values.push(isCertified ? 1 : 0);
  }
  if (district !== undefined) {
    fields.push('district = ?');
    values.push(normalizeOptionalText(district, 255));
  }
  if (photoUrl !== undefined) {
    fields.push('photo_url = ?');
    values.push(normalizeOptionalText(photoUrl, 1200));
  }
  fields.push('updated_by = ?');
  values.push(req.user.id);
  fields.push("updated_at = datetime('now')");
  values.push(pointId);

  const normalizedSections = normalizePointSections(sections);
  const tx = db.transaction(() => {
    db.prepare(`UPDATE points SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    if (normalizedSections !== undefined) {
      db.prepare('DELETE FROM point_sections WHERE point_id = ?').run(pointId);
      if (normalizedSections.length) {
        const insertSection = db.prepare(
          'INSERT INTO point_sections (point_id, position, title, description, photo_url) VALUES (?, ?, ?, ?, ?)'
        );
        normalizedSections.forEach((section) => {
          insertSection.run(pointId, section.position, section.title, section.description, section.photoUrl);
        });
      }
    }
  });
  tx();

  const row = db
    .prepare(`
      SELECT p.*, pt.code AS point_type_code, pt.label_uk AS point_type_label_uk, pt.label_en AS point_type_label_en, pt.color AS point_type_color
      FROM points p
      JOIN point_types pt ON pt.id = p.point_type_id
      WHERE p.id = ?
    `)
    .get(pointId);

  return res.json(
    mapPointRow({
      ...row,
      sections: readPointSections(pointId),
    })
  );
});

app.delete('/api/points/:id', authenticate, requireRole('admin', 'specialist'), (req, res) => {
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
  if (!isNonEmptyText(name, 180)) {
    return res.status(400).json({ error: 'name is required' });
  }

  if (!ROUTE_STATUSES.has(status)) {
    return res.status(400).json({ error: 'Invalid route status' });
  }

  const tx = db.transaction(() => {
    const routeResult = db
      .prepare(
        'INSERT INTO routes (name, description, status, created_by) VALUES (?, ?, ?, ?)'
      )
      .run(name.trim(), normalizeOptionalText(description, 3000), status, req.user.id);

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
  if (status && !ROUTE_STATUSES.has(status)) {
    return res.status(400).json({ error: 'Invalid route status' });
  }
  if (name !== undefined && !isNonEmptyText(name, 180)) {
    return res.status(400).json({ error: 'Invalid route name' });
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
    `).run(
      name !== undefined ? String(name).trim() : null,
      description !== undefined ? normalizeOptionalText(description, 3000) : null,
      status ?? null,
      req.user.id,
      routeId
    );

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

app.delete('/api/routes/:id', authenticate, requireRole('admin', 'specialist'), (req, res) => {
  const routeId = Number(req.params.id);
  const result = db.prepare('DELETE FROM routes WHERE id = ?').run(routeId);
  if (!result.changes) {
    return res.status(404).json({ error: 'Route not found' });
  }
  return res.status(204).send();
});

app.get('/api/news', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT n.id, n.title, n.summary, n.link, n.image_url, n.created_at, u.full_name AS author_name
       FROM news n
       JOIN users u ON u.id = n.created_by
       ORDER BY n.created_at DESC`
    )
    .all();

  res.json(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      link: r.link,
      imageUrl: r.image_url || null,
      authorName: r.author_name,
      createdAt: r.created_at,
    }))
  );
});

app.post('/api/news', authenticate, requireRole('admin', 'specialist'), async (req, res) => {
  const { title, summary, link, imageUrl } = req.body;
  if (!isNonEmptyText(title, 180) || !isNonEmptyText(summary, 1000)) {
    return res.status(400).json({ error: 'title and summary are required' });
  }
  const normalizedLink = normalizeOptionalText(link, 1200);
  let normalizedImage = normalizeOptionalText(imageUrl, 1200);
  if (!normalizedImage && normalizedLink) {
    normalizedImage = await resolveSourceImage(normalizedLink);
  }

  const result = db
    .prepare(`INSERT INTO news (title, summary, link, image_url, created_by) VALUES (?, ?, ?, ?, ?)`)
    .run(title.trim(), summary.trim(), normalizedLink, normalizedImage, req.user.id);

  const row = db
    .prepare(
      `SELECT n.id, n.title, n.summary, n.link, n.image_url, n.created_at, u.full_name AS author_name
       FROM news n
       JOIN users u ON u.id = n.created_by
       WHERE n.id = ?`
    )
    .get(result.lastInsertRowid);

  return res.status(201).json({
    id: row.id,
    title: row.title,
    summary: row.summary,
    link: row.link,
    imageUrl: row.image_url || null,
    authorName: row.author_name,
    createdAt: row.created_at,
  });
});

app.put('/api/news/:id', authenticate, requireRole('admin', 'specialist'), async (req, res) => {
  const newsId = Number(req.params.id);
  const existing = db.prepare('SELECT id, link, image_url FROM news WHERE id = ?').get(newsId);
  if (!existing) {
    return res.status(404).json({ error: 'News not found' });
  }

  const { title, summary, link, imageUrl } = req.body;
  if (title !== undefined && !isNonEmptyText(title, 180)) {
    return res.status(400).json({ error: 'Invalid title' });
  }
  if (summary !== undefined && !isNonEmptyText(summary, 1000)) {
    return res.status(400).json({ error: 'Invalid summary' });
  }

  const fields = [];
  const values = [];
  if (title !== undefined) {
    fields.push('title = ?');
    values.push(title.trim());
  }
  if (summary !== undefined) {
    fields.push('summary = ?');
    values.push(summary.trim());
  }
  if (link !== undefined) {
    fields.push('link = ?');
    values.push(normalizeOptionalText(link, 1200));
  }
  if (imageUrl !== undefined) {
    fields.push('image_url = ?');
    values.push(normalizeOptionalText(imageUrl, 1200));
  } else if (link !== undefined) {
    const normalizedLink = normalizeOptionalText(link, 1200);
    if (normalizedLink) {
      const extractedImage = await resolveSourceImage(normalizedLink);
      if (extractedImage) {
        fields.push('image_url = ?');
        values.push(extractedImage);
      }
    }
  }
  if (!fields.length) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  values.push(newsId);
  db.prepare(`UPDATE news SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  const row = db
    .prepare(
      `SELECT n.id, n.title, n.summary, n.link, n.image_url, n.created_at, u.full_name AS author_name
       FROM news n
       JOIN users u ON u.id = n.created_by
       WHERE n.id = ?`
    )
    .get(newsId);

  return res.json({
    id: row.id,
    title: row.title,
    summary: row.summary,
    link: row.link,
    imageUrl: row.image_url || null,
    authorName: row.author_name,
    createdAt: row.created_at,
  });
});

app.delete('/api/news/:id', authenticate, requireRole('admin', 'specialist'), (req, res) => {
  const newsId = Number(req.params.id);
  const result = db.prepare('DELETE FROM news WHERE id = ?').run(newsId);
  if (!result.changes) {
    return res.status(404).json({ error: 'News not found' });
  }
  return res.status(204).send();
});

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
