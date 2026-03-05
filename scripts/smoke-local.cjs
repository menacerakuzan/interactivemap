#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const PORT = Number(process.env.SMOKE_PORT || 3101);
const HOST = `http://127.0.0.1:${PORT}`;
const TEMP_DB = path.join(os.tmpdir(), `odesa-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withAuth(token, extra = {}) {
  return {
    ...extra,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_e) {
    data = text;
  }
  return { response, data };
}

async function waitForHealth(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${HOST}/api/health`);
      if (res.ok) return true;
    } catch (_e) {
      // keep waiting
    }
    await sleep(250);
  }
  throw new Error(`API did not become healthy within ${timeoutMs}ms`);
}

async function runSmoke() {
  const server = spawn('node', ['server/index.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH: TEMP_DB,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdoutTail = '';
  let stderrTail = '';
  server.stdout.on('data', (chunk) => {
    stdoutTail = `${stdoutTail}${chunk.toString()}`.slice(-2000);
  });
  server.stderr.on('data', (chunk) => {
    stderrTail = `${stderrTail}${chunk.toString()}`.slice(-2000);
  });

  try {
    await waitForHealth();

    const login = await requestJson(`${HOST}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'specialist@odesa-map.local',
        password: 'Odesa123!',
      }),
    });
    if (!login.response.ok || !login.data?.token) {
      throw new Error(`Login failed: ${JSON.stringify(login.data)}`);
    }
    const token = login.data.token;

    const pointCreate = await requestJson(`${HOST}/api/points`, {
      method: 'POST',
      headers: withAuth(token),
      body: JSON.stringify({
        title: 'SMOKE Point',
        description: 'Smoke created point',
        lat: 46.4825,
        lng: 30.7233,
        pointTypeCode: 'culture',
        district: 'Одеський район',
        isCertified: false,
        sections: [
          {
            title: 'Підхід',
            description: 'Тестовий опис розділу',
            photoUrl: 'https://example.com/smoke-section.jpg',
          },
        ],
      }),
    });
    if (!pointCreate.response.ok || !pointCreate.data?.id) {
      throw new Error(`Create point failed: ${JSON.stringify(pointCreate.data)}`);
    }
    const pointId = pointCreate.data.id;

    const pointUpdate = await requestJson(`${HOST}/api/points/${pointId}`, {
      method: 'PUT',
      headers: withAuth(token),
      body: JSON.stringify({
        title: 'SMOKE Point Updated',
        isCertified: true,
        sections: [
          {
            title: 'Підхід оновлено',
            description: 'Оновлений тестовий опис',
            photoUrl: 'https://example.com/smoke-section-2.jpg',
          },
        ],
      }),
    });
    if (!pointUpdate.response.ok) {
      throw new Error(`Update point failed: ${JSON.stringify(pointUpdate.data)}`);
    }

    const routeCreate = await requestJson(`${HOST}/api/routes`, {
      method: 'POST',
      headers: withAuth(token),
      body: JSON.stringify({
        name: 'SMOKE Route',
        description: 'Smoke route',
        status: 'draft',
        points: [{ pointId }],
      }),
    });
    if (!routeCreate.response.ok || !routeCreate.data?.id) {
      throw new Error(`Create route failed: ${JSON.stringify(routeCreate.data)}`);
    }
    const routeId = routeCreate.data.id;

    const routeUpdate = await requestJson(`${HOST}/api/routes/${routeId}`, {
      method: 'PUT',
      headers: withAuth(token),
      body: JSON.stringify({ status: 'review' }),
    });
    if (!routeUpdate.response.ok) {
      throw new Error(`Update route failed: ${JSON.stringify(routeUpdate.data)}`);
    }

    const newsCreate = await requestJson(`${HOST}/api/news`, {
      method: 'POST',
      headers: withAuth(token),
      body: JSON.stringify({
        title: 'SMOKE News',
        summary: 'Smoke summary',
        link: 'https://example.com/smoke-news',
        imageUrl: 'https://example.com/smoke-news-image.jpg',
      }),
    });
    if (!newsCreate.response.ok || !newsCreate.data?.id) {
      throw new Error(`Create news failed: ${JSON.stringify(newsCreate.data)}`);
    }
    const newsId = newsCreate.data.id;

    const newsUpdate = await requestJson(`${HOST}/api/news/${newsId}`, {
      method: 'PUT',
      headers: withAuth(token),
      body: JSON.stringify({ summary: 'Smoke summary updated' }),
    });
    if (!newsUpdate.response.ok) {
      throw new Error(`Update news failed: ${JSON.stringify(newsUpdate.data)}`);
    }

    const newsDelete = await requestJson(`${HOST}/api/news/${newsId}`, {
      method: 'DELETE',
      headers: withAuth(token),
    });
    if (newsDelete.response.status !== 204) {
      throw new Error(`Delete news failed: ${JSON.stringify(newsDelete.data)}`);
    }

    const routeDelete = await requestJson(`${HOST}/api/routes/${routeId}`, {
      method: 'DELETE',
      headers: withAuth(token),
    });
    if (routeDelete.response.status !== 204) {
      throw new Error(`Delete route failed: ${JSON.stringify(routeDelete.data)}`);
    }

    const pointDelete = await requestJson(`${HOST}/api/points/${pointId}`, {
      method: 'DELETE',
      headers: withAuth(token),
    });
    if (pointDelete.response.status !== 204) {
      throw new Error(`Delete point failed: ${JSON.stringify(pointDelete.data)}`);
    }

    console.log('SMOKE RESULT: PASS');
    console.log(`Server: ${HOST}`);
    console.log(`Temp DB: ${TEMP_DB}`);
  } catch (error) {
    console.error('SMOKE RESULT: FAIL');
    console.error(error.message);
    if (stdoutTail) console.error(`STDOUT:\n${stdoutTail}`);
    if (stderrTail) console.error(`STDERR:\n${stderrTail}`);
    process.exitCode = 1;
  } finally {
    server.kill('SIGTERM');
    await sleep(250);
    if (!server.killed) {
      server.kill('SIGKILL');
    }
    if (fs.existsSync(TEMP_DB)) {
      try {
        fs.unlinkSync(TEMP_DB);
      } catch (_e) {
        // ignore cleanup issue in smoke script
      }
    }
  }
}

runSmoke();
