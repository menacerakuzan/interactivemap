#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function loadDotEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function run() {
  loadDotEnv();
  const url = process.env.VITE_SUPABASE_URL || process.env.SMOKE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SMOKE_SUPABASE_ANON_KEY;
  const email = process.env.SMOKE_SUPABASE_EMAIL || 'specialist@odesa-map.local';
  const password = process.env.SMOKE_SUPABASE_PASSWORD || 'Odesa123!';

  if (!url || !anonKey) {
    console.error('SMOKE RESULT: FAIL');
    console.error('Missing Supabase URL/key. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or SMOKE_* alternatives).');
    process.exit(1);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const uid = Date.now();
  const prefix = `SMOKE-${uid}`;

  let userId = null;
  let pointId = null;
  let routeId = null;
  let newsId = null;
  let storagePath = null;

  try {
    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    if (loginError) {
      throw new Error(`Login failed (${email}): ${loginError.message}`);
    }
    userId = loginData?.user?.id || null;

    const { data: typeRow, error: typeError } = await supabase
      .from('point_types')
      .select('id,code')
      .eq('code', 'ramp')
      .single();
    if (typeError || !typeRow?.id) {
      throw new Error(`point_types ramp missing: ${typeError?.message || 'not found'}`);
    }

    const { data: pointInsert, error: pointInsertError } = await supabase
      .from('points')
      .insert({
        title: `${prefix} POINT`,
        description: 'Smoke point create',
        lat: 46.4825,
        lng: 30.7233,
        district: 'Одеський район',
        point_type_id: typeRow.id,
        is_certified: false,
        created_by: userId,
      })
      .select('id')
      .single();
    if (pointInsertError || !pointInsert?.id) {
      throw new Error(`Point create failed: ${pointInsertError?.message || 'unknown error'}`);
    }
    pointId = pointInsert.id;

    const { error: sectionsInsertError } = await supabase
      .from('point_sections')
      .insert([
        {
          point_id: pointId,
          position: 1,
          title: `${prefix} SECTION`,
          description: 'Smoke section create',
          photo_url: 'https://example.com/smoke-section.jpg',
        },
      ]);
    if (sectionsInsertError) {
      throw new Error(`Point section create failed: ${sectionsInsertError.message}`);
    }

    const { error: pointUpdateError } = await supabase
      .from('points')
      .update({ title: `${prefix} POINT UPDATED`, is_certified: true, updated_by: userId })
      .eq('id', pointId);
    if (pointUpdateError) {
      throw new Error(`Point update failed: ${pointUpdateError.message}`);
    }

    const { data: routeInsert, error: routeInsertError } = await supabase
      .from('routes')
      .insert({
        name: `${prefix} ROUTE`,
        description: 'Smoke route create',
        status: 'draft',
        created_by: userId,
      })
      .select('id')
      .single();
    if (routeInsertError || !routeInsert?.id) {
      throw new Error(`Route create failed: ${routeInsertError?.message || 'unknown error'}`);
    }
    routeId = routeInsert.id;

    const { error: routePointError } = await supabase
      .from('route_points')
      .insert([{ route_id: routeId, point_id: pointId, position: 1, note: 'Smoke note' }]);
    if (routePointError) {
      throw new Error(`Route point insert failed: ${routePointError.message}`);
    }

    const { error: routeUpdateError } = await supabase
      .from('routes')
      .update({ status: 'review', updated_by: userId })
      .eq('id', routeId);
    if (routeUpdateError) {
      throw new Error(`Route update failed: ${routeUpdateError.message}`);
    }

    const { data: newsInsert, error: newsInsertError } = await supabase
      .from('news')
      .insert({
        title: `${prefix} NEWS`,
        summary: 'Smoke summary',
        link: 'https://example.com/smoke-news',
        image_url: 'https://example.com/smoke-news-image.jpg',
        created_by: userId,
      })
      .select('id')
      .single();
    if (newsInsertError || !newsInsert?.id) {
      throw new Error(`News create failed: ${newsInsertError?.message || 'unknown error'}`);
    }
    newsId = newsInsert.id;

    const { error: newsUpdateError } = await supabase
      .from('news')
      .update({ summary: 'Smoke summary updated' })
      .eq('id', newsId);
    if (newsUpdateError) {
      throw new Error(`News update failed: ${newsUpdateError.message}`);
    }

    // Storage smoke: point-photos upload + remove
    const jpgHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    storagePath = `${userId}/${prefix.toLowerCase()}-smoke.jpg`;
    const { error: storageUploadError } = await supabase.storage
      .from('point-photos')
      .upload(storagePath, jpgHeader, { contentType: 'image/jpeg', upsert: true });
    if (storageUploadError) {
      throw new Error(`Storage upload failed: ${storageUploadError.message}`);
    }

    const { error: storageDeleteError } = await supabase.storage
      .from('point-photos')
      .remove([storagePath]);
    if (storageDeleteError) {
      throw new Error(`Storage delete failed: ${storageDeleteError.message}`);
    }
    storagePath = null;

    if (newsId) {
      const { error } = await supabase.from('news').delete().eq('id', newsId);
      if (error) throw new Error(`News delete failed: ${error.message}`);
      newsId = null;
    }

    if (routeId) {
      const { error } = await supabase.from('routes').delete().eq('id', routeId);
      if (error) throw new Error(`Route delete failed: ${error.message}`);
      routeId = null;
    }

    if (pointId) {
      const { error } = await supabase.from('points').delete().eq('id', pointId);
      if (error) throw new Error(`Point delete failed: ${error.message}`);
      pointId = null;
    }

    console.log('SMOKE RESULT: PASS');
    console.log(`Supabase URL: ${url}`);
    console.log(`User: ${email}`);
  } catch (error) {
    console.error('SMOKE RESULT: FAIL');
    console.error(error.message || String(error));
    process.exitCode = 1;
  } finally {
    // best-effort cleanup
    if (storagePath) {
      try {
        await supabase.storage.from('point-photos').remove([storagePath]);
      } catch (_e) {
        // ignore cleanup error
      }
    }
    if (newsId) {
      try {
        await supabase.from('news').delete().eq('id', newsId);
      } catch (_e) {
        // ignore cleanup error
      }
    }
    if (routeId) {
      try {
        await supabase.from('routes').delete().eq('id', routeId);
      } catch (_e) {
        // ignore cleanup error
      }
    }
    if (pointId) {
      try {
        await supabase.from('points').delete().eq('id', pointId);
      } catch (_e) {
        // ignore cleanup error
      }
    }
    try {
      await supabase.auth.signOut();
    } catch (_e) {
      // ignore sign out error
    }
  }
}

run().catch((error) => {
  console.error('SMOKE RESULT: FAIL');
  console.error(error.message || String(error));
  process.exit(1);
});
