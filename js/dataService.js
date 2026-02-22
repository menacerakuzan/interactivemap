import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const EXPLICIT_MODE = (import.meta.env.VITE_DATA_MODE || '').trim().toLowerCase();

const DATA_MODE = EXPLICIT_MODE || (SUPABASE_URL && SUPABASE_ANON_KEY ? 'supabase' : 'local');
const supabase = DATA_MODE === 'supabase' ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

function parsePath(path) {
  const url = new URL(path, 'http://local');
  return { pathname: url.pathname, searchParams: url.searchParams };
}

function mapPointType(row) {
  return {
    id: row.id,
    code: row.code,
    labelUk: row.label_uk,
    labelEn: row.label_en,
    color: row.color,
  };
}

function mapPoint(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    lat: row.lat,
    lng: row.lng,
    district: row.district,
    photoUrl: row.photo_url || null,
    isCertified: Boolean(row.is_certified),
    pointType: {
      id: row.point_type?.id,
      code: row.point_type?.code,
      labelUk: row.point_type?.label_uk,
      labelEn: row.point_type?.label_en,
      color: row.point_type?.color,
    },
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapNews(row, authorName = null) {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    link: row.link,
    authorName: row.author_name || authorName || null,
    createdAt: row.created_at,
  };
}

function mapRoute(row, authorName = null) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    createdBy: row.created_by,
    authorName,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    points: (row.route_points || [])
      .sort((a, b) => a.position - b.position)
      .map((rp) => ({
        id: rp.point?.id,
        title: rp.point?.title,
        lat: rp.point?.lat,
        lng: rp.point?.lng,
        position: rp.position,
        note: rp.note,
      })),
  };
}

async function supabaseGetPointTypeIdByCode(code) {
  const { data, error } = await supabase.from('point_types').select('id').eq('code', code).single();
  if (error) throw error;
  return data.id;
}

async function supabaseGetPoints(query = {}) {
  let filterPointTypeId = null;

  if (query.type && query.type !== 'all') {
    filterPointTypeId = await supabaseGetPointTypeIdByCode(query.type);
  }

  let request = supabase
    .from('points')
    .select(
      'id,title,description,lat,lng,district,photo_url,is_certified,created_by,created_at,updated_at,point_type:point_types(id,code,label_uk,label_en,color)'
    )
    .order('created_at', { ascending: false });

  if (filterPointTypeId) {
    request = request.eq('point_type_id', filterPointTypeId);
  }

  if (query.certified === true) {
    request = request.eq('is_certified', true);
  }

  const { data, error } = await request;
  if (error) throw error;
  return data.map(mapPoint);
}

async function supabaseGetRoutes() {
  const { data, error } = await supabase
    .from('routes')
    .select(
      'id,name,description,status,created_by,created_at,updated_at,route_points(position,note,point:points(id,title,lat,lng))'
    )
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) throw error;

  const authorIds = [...new Set(data.map((r) => r.created_by).filter(Boolean))];
  let authorNameById = {};

  if (authorIds.length) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id,full_name')
      .in('id', authorIds);
    if (profilesError) throw profilesError;
    authorNameById = Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name]));
  }

  return data.map((row) => mapRoute(row, authorNameById[row.created_by] || null));
}

async function supabaseCreatePoint(payload) {
  const user = await supabaseGetCurrentUser();
  const pointTypeId = await supabaseGetPointTypeIdByCode(payload.pointTypeCode);

  const { data, error } = await supabase
    .from('points')
    .insert({
      title: payload.title,
      description: payload.description || null,
      lat: payload.lat,
      lng: payload.lng,
      district: payload.district || null,
      photo_url: payload.photoUrl || null,
      point_type_id: pointTypeId,
      is_certified: Boolean(payload.isCertified),
      created_by: user.id,
    })
    .select(
      'id,title,description,lat,lng,district,photo_url,is_certified,created_by,created_at,updated_at,point_type:point_types(id,code,label_uk,label_en,color)'
    )
    .single();

  if (error) throw error;
  return mapPoint(data);
}

async function supabaseUpdatePoint(pointId, payload) {
  let pointTypeId = null;
  if (payload.pointTypeCode) {
    pointTypeId = await supabaseGetPointTypeIdByCode(payload.pointTypeCode);
  }

  const user = await supabaseGetCurrentUser();

  const updateData = {
    updated_by: user.id,
  };

  if (payload.title !== undefined) updateData.title = payload.title;
  if (payload.description !== undefined) updateData.description = payload.description || null;
  if (payload.lat !== undefined) updateData.lat = payload.lat;
  if (payload.lng !== undefined) updateData.lng = payload.lng;
  if (payload.district !== undefined) updateData.district = payload.district || null;
  if (payload.photoUrl !== undefined) updateData.photo_url = payload.photoUrl || null;
  if (payload.isCertified !== undefined) updateData.is_certified = Boolean(payload.isCertified);
  if (pointTypeId !== null) updateData.point_type_id = pointTypeId;

  const { data, error } = await supabase
    .from('points')
    .update(updateData)
    .eq('id', pointId)
    .select(
      'id,title,description,lat,lng,district,photo_url,is_certified,created_by,created_at,updated_at,point_type:point_types(id,code,label_uk,label_en,color)'
    )
    .single();

  if (error) throw error;
  return mapPoint(data);
}

async function supabaseDeletePoint(pointId) {
  const { error } = await supabase.from('points').delete().eq('id', pointId);
  if (error) {
    const msg = String(error.message || error);
    if (msg.toLowerCase().includes('row-level security')) {
      throw new Error('Немає прав на видалення точки (RLS policy)');
    }
    throw error;
  }
  return null;
}

async function supabaseCreateRoute(payload) {
  const user = await supabaseGetCurrentUser();

  const { data: route, error: routeError } = await supabase
    .from('routes')
    .insert({
      name: payload.name,
      description: payload.description || null,
      status: payload.status || 'draft',
      created_by: user.id,
    })
    .select('id')
    .single();

  if (routeError) throw routeError;

  if (Array.isArray(payload.points) && payload.points.length > 0) {
    const rows = payload.points.map((p, idx) => ({
      route_id: route.id,
      point_id: Number(p.pointId),
      position: idx + 1,
      note: p.note || null,
    }));

    const { error: pointsError } = await supabase.from('route_points').insert(rows);
    if (pointsError) throw pointsError;
  }

  return { id: route.id };
}

async function supabaseUpdateRoute(routeId, payload) {
  const user = await supabaseGetCurrentUser();

  const updateData = {
    updated_by: user.id,
  };

  if (payload.name !== undefined) updateData.name = payload.name;
  if (payload.description !== undefined) updateData.description = payload.description || null;
  if (payload.status !== undefined) updateData.status = payload.status;

  const { error: routeError } = await supabase.from('routes').update(updateData).eq('id', routeId);
  if (routeError) throw routeError;

  if (Array.isArray(payload.points)) {
    const { error: deleteError } = await supabase.from('route_points').delete().eq('route_id', routeId);
    if (deleteError) throw deleteError;

    if (payload.points.length > 0) {
      const rows = payload.points.map((p, idx) => ({
        route_id: routeId,
        point_id: Number(p.pointId),
        position: idx + 1,
        note: p.note || null,
      }));
      const { error: insertError } = await supabase.from('route_points').insert(rows);
      if (insertError) throw insertError;
    }
  }

  return { ok: true };
}

async function supabaseDeleteRoute(routeId) {
  const { error } = await supabase.from('routes').delete().eq('id', routeId);
  if (error) throw error;
  return null;
}

async function supabaseLogin(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  const user = data.user;
  const session = data.session;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single();

  if (profileError) throw profileError;

  return {
    token: session.access_token,
    user: {
      id: user.id,
      email: user.email,
      fullName: profile.full_name,
      role: profile.role,
    },
  };
}

async function supabaseLogout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  return { ok: true };
}

async function supabaseGetCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Unauthorized');
  return data.user;
}

async function supabaseGetNews() {
  const { data, error } = await supabase
    .from('news')
    .select('id,title,summary,link,created_at,created_by')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const authorIds = [...new Set((data || []).map((n) => n.created_by).filter(Boolean))];
  let authorNameById = {};
  if (authorIds.length) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id,full_name')
      .in('id', authorIds);
    if (profilesError) throw profilesError;
    authorNameById = Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name]));
  }

  return (data || []).map((row) => mapNews(row, authorNameById[row.created_by] || null));
}

async function supabaseCreateNews(payload) {
  const user = await supabaseGetCurrentUser();
  const { data, error } = await supabase
    .from('news')
    .insert({
      title: payload.title,
      summary: payload.summary,
      link: payload.link || null,
      created_by: user.id,
    })
    .select('id,title,summary,link,created_at')
    .single();
  if (error) throw error;
  return mapNews(data);
}

async function supabaseUpdateNews(newsId, payload) {
  const updateData = {};
  if (payload.title !== undefined) updateData.title = payload.title;
  if (payload.summary !== undefined) updateData.summary = payload.summary;
  if (payload.link !== undefined) updateData.link = payload.link || null;

  const { data, error } = await supabase
    .from('news')
    .update(updateData)
    .eq('id', newsId)
    .select('id,title,summary,link,created_at')
    .single();
  if (error) throw error;
  return mapNews(data);
}

async function supabaseDeleteNews(newsId) {
  const { error } = await supabase.from('news').delete().eq('id', newsId);
  if (error) throw error;
  return null;
}

async function supabaseDeletePointPhoto(photoUrl) {
  if (!photoUrl) return { ok: true };
  const marker = '/storage/v1/object/public/point-photos/';
  const markerIndex = photoUrl.indexOf(marker);
  if (markerIndex === -1) return { ok: true };
  const filePath = decodeURIComponent(photoUrl.slice(markerIndex + marker.length));
  if (!filePath) return { ok: true };
  const { error } = await supabase.storage.from('point-photos').remove([filePath]);
  if (error) throw error;
  return { ok: true };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function localFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(path, {
    ...options,
    headers,
  });

  if (response.status === 204) return null;

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export const dataService = {
  mode: DATA_MODE,

  async request(path, options = {}) {
    if (DATA_MODE === 'local') {
      return localFetch(path, options);
    }

    const method = (options.method || 'GET').toUpperCase();
    const body = options.body ? JSON.parse(options.body) : null;
    const { pathname, searchParams } = parsePath(path);

    if (pathname === '/api/health' && method === 'GET') {
      return { ok: true, mode: 'supabase' };
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      return supabaseLogin(body.email, body.password);
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      return supabaseLogout();
    }

    if (pathname === '/api/point-types' && method === 'GET') {
      const { data, error } = await supabase.from('point_types').select('id,code,label_uk,label_en,color').order('id');
      if (error) throw error;
      return data.map(mapPointType);
    }

    if (pathname === '/api/points' && method === 'GET') {
      return supabaseGetPoints({
        type: searchParams.get('type') || 'all',
        certified: searchParams.get('certified') === 'true',
      });
    }

    if (pathname === '/api/points' && method === 'POST') {
      return supabaseCreatePoint(body);
    }

    if (pathname.startsWith('/api/points/') && method === 'PUT') {
      const id = Number(pathname.split('/').pop());
      return supabaseUpdatePoint(id, body);
    }

    if (pathname.startsWith('/api/points/') && method === 'DELETE') {
      const id = Number(pathname.split('/').pop());
      return supabaseDeletePoint(id);
    }

    if (pathname === '/api/routes' && method === 'GET') {
      return supabaseGetRoutes();
    }

    if (pathname === '/api/routes' && method === 'POST') {
      return supabaseCreateRoute(body);
    }

    if (pathname.startsWith('/api/routes/') && method === 'PUT') {
      const id = Number(pathname.split('/').pop());
      return supabaseUpdateRoute(id, body);
    }

    if (pathname.startsWith('/api/routes/') && method === 'DELETE') {
      const id = Number(pathname.split('/').pop());
      return supabaseDeleteRoute(id);
    }

    if (pathname === '/api/news' && method === 'GET') {
      return supabaseGetNews();
    }

    if (pathname === '/api/news' && method === 'POST') {
      return supabaseCreateNews(body);
    }

    if (pathname.startsWith('/api/news/') && method === 'PUT') {
      const id = Number(pathname.split('/').pop());
      return supabaseUpdateNews(id, body);
    }

    if (pathname.startsWith('/api/news/') && method === 'DELETE') {
      const id = Number(pathname.split('/').pop());
      return supabaseDeleteNews(id);
    }

    throw new Error(`Unsupported endpoint in supabase mode: ${method} ${pathname}`);
  },

  async logout() {
    if (DATA_MODE === 'supabase') {
      return supabaseLogout();
    }
    return { ok: true };
  },

  async uploadPointPhoto(file) {
    if (!file) return null;

    if (DATA_MODE === 'local') {
      return fileToDataUrl(file);
    }

    const user = await supabaseGetCurrentUser();
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const filePath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('point-photos')
      .upload(filePath, file, { upsert: false });
    if (uploadError) {
      const msg = String(uploadError.message || uploadError);
      if (msg.toLowerCase().includes('row-level security')) {
        throw new Error('Немає прав на upload фото (перевір профіль ролі в Supabase і storage policy)');
      }
      throw uploadError;
    }

    const { data } = supabase.storage.from('point-photos').getPublicUrl(filePath);
    return data.publicUrl;
  },

  async deletePointPhoto(photoUrl) {
    if (DATA_MODE === 'local') return { ok: true };
    return supabaseDeletePointPhoto(photoUrl);
  },
};
