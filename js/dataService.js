import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const EXPLICIT_MODE = (import.meta.env.VITE_DATA_MODE || '').trim().toLowerCase();

const DATA_MODE = EXPLICIT_MODE || (SUPABASE_URL && SUPABASE_ANON_KEY ? 'supabase' : 'local');
const supabase = DATA_MODE === 'supabase' ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const LOCAL_PROPOSALS_KEY = 'odesaPointProposals';

function isMissingPointSectionsError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('point_sections') && message.includes('does not exist');
}

function isMissingNewsImageError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('image_url') && message.includes('news');
}

function isMissingRouteColorError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('route_color') && message.includes('routes');
}

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
  const rawSections = Array.isArray(row.point_sections) ? row.point_sections : [];
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
    sections: rawSections
      .map((section, index) => ({
        id: section.id || null,
        pointId: section.point_id || row.id,
        position: Number(section.position) || index + 1,
        title: section.title || '',
        description: section.description || '',
        photoUrl: section.photo_url || null,
      }))
      .sort((a, b) => a.position - b.position),
  };
}

function mapNews(row, authorName = null) {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    link: row.link,
    imageUrl: row.image_url || null,
    authorName: row.author_name || authorName || null,
    createdAt: row.created_at,
  };
}

async function tryExtractSourceImage(link) {
  if (!link) return null;
  let normalizedLink = null;
  try {
    normalizedLink = new URL(link).toString();
  } catch (_e) {
    return null;
  }
  try {
    const response = await fetch(normalizedLink, { method: 'GET', mode: 'cors' });
    if (!response.ok) return null;
    const html = await response.text();
    const patterns = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        return new URL(match[1], normalizedLink).toString();
      }
    }
    return `https://image.thum.io/get/width/1200/noanimate/${normalizedLink}`;
  } catch (_e) {
    return `https://image.thum.io/get/width/1200/noanimate/${normalizedLink}`;
  }
}

function mapRoute(row, authorName = null) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    createdBy: row.created_by,
    authorName,
    routeColor: row.route_color || null,
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

function appendLocalProposal(payload) {
  const now = new Date().toISOString();
  const proposals = JSON.parse(localStorage.getItem(LOCAL_PROPOSALS_KEY) || '[]');
  const record = {
    id: Date.now(),
    ...payload,
    createdAt: now,
    source: 'public-form',
  };
  proposals.unshift(record);
  localStorage.setItem(LOCAL_PROPOSALS_KEY, JSON.stringify(proposals));
  return { id: record.id, createdAt: record.createdAt };
}

async function supabaseCreateProposal(payload) {
  try {
    const { data, error } = await supabase
      .from('point_proposals')
      .insert({
        name: payload.name,
        space_type: payload.spaceType,
        district: payload.district,
        address: payload.address,
        lat: payload.lat,
        lng: payload.lng,
        email: payload.email,
        photo_url: payload.photoUrl || null,
        comment: payload.comment || null,
        checklist_json: payload.checklist || {},
      })
      .select('id,created_at')
      .single();
    if (error) throw error;
    return { id: data.id, createdAt: data.created_at };
  } catch (_e) {
    return appendLocalProposal(payload);
  }
}

async function supabaseGetPointTypeIdByCode(code) {
  const requested = String(code || '').trim();
  const fallbackByCode = {
    school: 'education',
    transport_stop: 'stop_t',
    street: 'park',
    square: 'park',
    hotel: 'housing',
    other: 'social_services',
  };
  let { data, error } = await supabase.from('point_types').select('id').eq('code', requested).single();
  if (!error && data?.id) return data.id;

  const fallback = fallbackByCode[requested];
  if (!fallback) throw error;

  const fallbackResult = await supabase.from('point_types').select('id').eq('code', fallback).single();
  if (fallbackResult.error) throw fallbackResult.error;
  return fallbackResult.data.id;
}

async function supabaseGetPoints(query = {}) {
  let filterPointTypeId = null;

  if (query.type && query.type !== 'all') {
    filterPointTypeId = await supabaseGetPointTypeIdByCode(query.type);
  }

  let request = supabase
    .from('points')
    .select(
      'id,title,description,lat,lng,district,photo_url,is_certified,created_by,created_at,updated_at,point_type:point_types(id,code,label_uk,label_en,color),point_sections(id,point_id,position,title,description,photo_url)'
    )
    .order('created_at', { ascending: false });

  if (filterPointTypeId) {
    request = request.eq('point_type_id', filterPointTypeId);
  }

  if (query.certified === true) {
    request = request.eq('is_certified', true);
  }

  let { data, error } = await request;
  if (error && isMissingPointSectionsError(error)) {
    let fallbackRequest = supabase
      .from('points')
      .select(
        'id,title,description,lat,lng,district,photo_url,is_certified,created_by,created_at,updated_at,point_type:point_types(id,code,label_uk,label_en,color)'
      )
      .order('created_at', { ascending: false });
    if (filterPointTypeId) {
      fallbackRequest = fallbackRequest.eq('point_type_id', filterPointTypeId);
    }
    if (query.certified === true) {
      fallbackRequest = fallbackRequest.eq('is_certified', true);
    }
    const fallback = await fallbackRequest;
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw error;
  return data.map(mapPoint);
}

async function supabaseGetRoutes() {
  const { data: sessionData } = await supabase.auth.getSession();
  const isPublic = !sessionData?.session?.access_token;

  let { data, error } = await supabase
    .from('routes')
    .select(
      'id,name,description,status,route_color,created_by,created_at,updated_at,route_points(position,note,point:points(id,title,lat,lng))'
    )
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (isPublic) {
    ({ data, error } = await supabase
      .from('routes')
      .select(
        'id,name,description,status,route_color,created_by,created_at,updated_at,route_points(position,note,point:points(id,title,lat,lng))'
      )
      .eq('status', 'published')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }));
  }
  if (error && isMissingRouteColorError(error)) {
    const fallback = await supabase
      .from('routes')
      .select(
        'id,name,description,status,created_by,created_at,updated_at,route_points(position,note,point:points(id,title,lat,lng))'
      )
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    data = fallback.data;
    error = fallback.error;
  }

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
    .select('id')
    .single();

  if (error) throw error;
  if (Array.isArray(payload.sections) && payload.sections.length) {
    const sectionRows = payload.sections.map((section, index) => ({
      point_id: data.id,
      position: index + 1,
      title: section.title || null,
      description: section.description || null,
      photo_url: section.photoUrl || null,
    }));
    const { error: sectionError } = await supabase.from('point_sections').insert(sectionRows);
    if (sectionError) throw sectionError;
  }
  let { data: finalPoint, error: finalError } = await supabase
    .from('points')
    .select(
      'id,title,description,lat,lng,district,photo_url,is_certified,created_by,created_at,updated_at,point_type:point_types(id,code,label_uk,label_en,color),point_sections(id,point_id,position,title,description,photo_url)'
    )
    .eq('id', data.id)
    .single();
  if (finalError && isMissingPointSectionsError(finalError)) {
    const fallback = await supabase
      .from('points')
      .select(
        'id,title,description,lat,lng,district,photo_url,is_certified,created_by,created_at,updated_at,point_type:point_types(id,code,label_uk,label_en,color)'
      )
      .eq('id', data.id)
      .single();
    finalPoint = fallback.data;
    finalError = fallback.error;
  }
  if (finalError) throw finalError;
  return mapPoint(finalPoint);
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

  const { error } = await supabase
    .from('points')
    .update(updateData)
    .eq('id', pointId)
    .select('id')
    .single();

  if (error) throw error;
  if (Array.isArray(payload.sections)) {
    const { error: deleteError } = await supabase.from('point_sections').delete().eq('point_id', pointId);
    if (deleteError) throw deleteError;
    if (payload.sections.length > 0) {
      const sectionRows = payload.sections.map((section, index) => ({
        point_id: pointId,
        position: index + 1,
        title: section.title || null,
        description: section.description || null,
        photo_url: section.photoUrl || null,
      }));
      const { error: insertError } = await supabase.from('point_sections').insert(sectionRows);
      if (insertError) throw insertError;
    }
  }
  let { data: finalPoint, error: finalError } = await supabase
    .from('points')
    .select(
      'id,title,description,lat,lng,district,photo_url,is_certified,created_by,created_at,updated_at,point_type:point_types(id,code,label_uk,label_en,color),point_sections(id,point_id,position,title,description,photo_url)'
    )
    .eq('id', pointId)
    .single();
  if (finalError && isMissingPointSectionsError(finalError)) {
    const fallback = await supabase
      .from('points')
      .select(
        'id,title,description,lat,lng,district,photo_url,is_certified,created_by,created_at,updated_at,point_type:point_types(id,code,label_uk,label_en,color)'
      )
      .eq('id', pointId)
      .single();
    finalPoint = fallback.data;
    finalError = fallback.error;
  }
  if (finalError) throw finalError;
  return mapPoint(finalPoint);
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

  let { data: route, error: routeError } = await supabase
    .from('routes')
    .insert({
      name: payload.name,
      description: payload.description || null,
      route_color: payload.routeColor || null,
      status: payload.status || 'draft',
      created_by: user.id,
    })
    .select('id')
    .single();
  if (routeError && isMissingRouteColorError(routeError)) {
    const fallback = await supabase
      .from('routes')
      .insert({
        name: payload.name,
        description: payload.description || null,
        status: payload.status || 'draft',
        created_by: user.id,
      })
      .select('id')
      .single();
    route = fallback.data;
    routeError = fallback.error;
  }

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
  if (payload.routeColor !== undefined) updateData.route_color = payload.routeColor || null;

  let { error: routeError } = await supabase.from('routes').update(updateData).eq('id', routeId);
  if (routeError && isMissingRouteColorError(routeError)) {
    const fallbackData = { ...updateData };
    delete fallbackData.route_color;
    const fallback = await supabase.from('routes').update(fallbackData).eq('id', routeId);
    routeError = fallback.error;
  }
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
  let { data, error } = await supabase
    .from('news')
    .select('id,title,summary,link,image_url,created_at,created_by')
    .order('created_at', { ascending: false });
  if (error && isMissingNewsImageError(error)) {
    const fallback = await supabase
      .from('news')
      .select('id,title,summary,link,created_at,created_by')
      .order('created_at', { ascending: false });
    data = fallback.data;
    error = fallback.error;
  }
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
  let imageUrl = payload.imageUrl || null;
  if (!imageUrl && payload.link) {
    imageUrl = await tryExtractSourceImage(payload.link);
  }
  const { data, error } = await supabase
    .from('news')
    .insert({
      title: payload.title,
      summary: payload.summary,
      link: payload.link || null,
      image_url: imageUrl,
      created_by: user.id,
    })
    .select('id,title,summary,link,image_url,created_at')
    .single();
  if (error && isMissingNewsImageError(error)) {
    const fallback = await supabase
      .from('news')
      .insert({
        title: payload.title,
        summary: payload.summary,
        link: payload.link || null,
        created_by: user.id,
      })
      .select('id,title,summary,link,created_at')
      .single();
    if (fallback.error) throw fallback.error;
    return mapNews(fallback.data);
  }
  if (error) throw error;
  return mapNews(data);
}

async function supabaseUpdateNews(newsId, payload) {
  const updateData = {};
  if (payload.title !== undefined) updateData.title = payload.title;
  if (payload.summary !== undefined) updateData.summary = payload.summary;
  if (payload.link !== undefined) updateData.link = payload.link || null;
  const hasCustomImage = typeof payload.imageUrl === 'string' && payload.imageUrl.trim().length > 0;
  if (hasCustomImage) {
    updateData.image_url = payload.imageUrl.trim();
  } else if (payload.link) {
    // If image URL field is empty, try to derive image from source link.
    const extracted = await tryExtractSourceImage(payload.link);
    updateData.image_url = extracted || null;
  } else if (payload.imageUrl !== undefined) {
    updateData.image_url = null;
  }

  let { data, error } = await supabase
    .from('news')
    .update(updateData)
    .eq('id', newsId)
    .select('id,title,summary,link,image_url,created_at')
    .single();
  if (error && isMissingNewsImageError(error)) {
    const fallbackData = { ...updateData };
    delete fallbackData.image_url;
    const fallback = await supabase
      .from('news')
      .update(fallbackData)
      .eq('id', newsId)
      .select('id,title,summary,link,created_at')
      .single();
    data = fallback.data;
    error = fallback.error;
  }
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

async function supabaseGetProposals() {
  try {
    const { data, error } = await supabase
      .from('point_proposals')
      .select('id,name,space_type,district,address,lat,lng,email,photo_url,comment,checklist_json,created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      spaceType: row.space_type,
      district: row.district,
      address: row.address,
      lat: row.lat,
      lng: row.lng,
      email: row.email,
      photoUrl: row.photo_url || null,
      comment: row.comment || null,
      checklist: row.checklist_json || {},
      createdAt: row.created_at,
    }));
  } catch (_e) {
    const fallback = JSON.parse(localStorage.getItem(LOCAL_PROPOSALS_KEY) || '[]');
    return fallback.map((row) => ({
      id: row.id,
      name: row.name,
      spaceType: row.spaceType,
      district: row.district,
      address: row.address,
      lat: row.lat,
      lng: row.lng,
      email: row.email,
      photoUrl: row.photoUrl || null,
      comment: row.comment || null,
      checklist: row.checklist || {},
      createdAt: row.createdAt,
    }));
  }
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

    if (pathname === '/api/proposals' && method === 'POST') {
      return supabaseCreateProposal(body);
    }

    if (pathname === '/api/proposals' && method === 'GET') {
      return supabaseGetProposals();
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
