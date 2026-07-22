import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.109.0';

// Server-side only. The Places API key never reaches the app; the frontend
// calls this function and gets back stable `items` rows to swipe on.
const PLACES_KEY = Deno.env.get('PLACES_API_KEY');
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// How many stored rows count as "already cached" for a location — at/above
// this we skip the API entirely and serve what we have.
const CACHE_TARGET = 20;

// Upper bound on a city-level location string. Anything longer is not a real
// place name — rejecting it bounds the Places query and blocks abuse via
// oversized input.
const MAX_LOCATION_LEN = 80;

type ItemRow = {
  id: string;
  category: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  location: string | null;
  source: string | null;
  price_level: number | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { location } = await req.json().catch(() => ({ location: undefined }));
    if (!location || typeof location !== 'string' || !location.trim()) {
      return json({ error: 'Missing location' }, 400);
    }
    const loc = location.trim();
    if (loc.length > MAX_LOCATION_LEN) {
      return json({ error: 'Location too long' }, 400);
    }
    const svc = createClient(SB_URL, SB_SVC);

    // Restrict to the caller's own room: only locations the pair actually saved
    // can trigger a Places lookup. Without this, any anon user could bill the
    // Places API for arbitrary queries (cost-abuse / financial DoS).
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: userData, error: userErr } = await svc.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const { data: member } = await svc
      .from('members')
      .select('room_id')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (!member) return json({ error: 'No room' }, 403);
    const { data: room } = await svc
      .from('rooms')
      .select('locations')
      .eq('id', member.room_id)
      .maybeSingle();
    const allowed = ((room?.locations ?? []) as string[]).map((l) => l.trim().toLowerCase());
    if (!allowed.includes(loc.toLowerCase())) {
      return json({ error: 'Location not in your room' }, 403);
    }

    // Cache-first: enough rows already stored -> return them, no API call.
    const existing = await selectRestaurants(svc, loc);
    if (existing.length >= CACHE_TARGET) {
      return json({ items: existing, cached: true });
    }

    // No key configured: serve whatever is stored (may be empty). The app
    // falls back to its own DB read / empty state, so never hard-fail here.
    if (!PLACES_KEY) {
      return json({ items: existing, cached: true, note: 'PLACES_API_KEY not set' });
    }

    const places = await fetchPlaces(loc);
    const existingTitles = new Set(existing.map((i) => i.title.toLowerCase()));
    const toInsert = places
      .filter((p) => p.title && !existingTitles.has(p.title.toLowerCase()))
      .map((p) => ({
        category: 'restaurants',
        title: p.title,
        subtitle: p.subtitle,
        image_url: p.image_url,
        location: loc,
        source: 'Google Places',
        price_level: p.price_level,
      }));

    if (toInsert.length > 0) {
      const { error } = await svc.from('items').insert(toInsert);
      if (error) console.error('insert items failed', error);
    }

    const items = await selectRestaurants(svc, loc);
    return json({ items });
  } catch (e) {
    console.error(e);
    const msg =
      e instanceof Error
        ? e.message
        : e && typeof e === 'object'
          ? JSON.stringify(e)
          : String(e);
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });
}

async function selectRestaurants(svc: ReturnType<typeof createClient>, loc: string): Promise<ItemRow[]> {
  const { data, error } = await svc
    .from('items')
    .select('id, category, title, subtitle, image_url, location, source, price_level')
    .eq('category', 'restaurants')
    .eq('location', loc);
  if (error) throw error;
  return (data ?? []) as ItemRow[];
}

type Place = {
  title: string;
  subtitle: string | null;
  image_url: string | null;
  price_level: number | null;
};

// Google Places API (New) Text Search. Returns up to 20 places for the query.
// `places.photos` is requested so we can resolve a keyless hotlinkable image per
// place server-side (the API key never reaches the app or the stored image_url).
async function fetchPlaces(loc: string): Promise<Place[]> {
  const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': PLACES_KEY!,
      'X-Goog-FieldMask':
        'places.displayName,places.rating,places.priceLevel,places.types,places.userRatingCount,places.photos',
    },
    body: JSON.stringify({ textQuery: `best restaurants in ${loc}` }),
  });
  if (!resp.ok) {
    throw new Error(`Places API ${resp.status}: ${await resp.text()}`);
  }
  const j = await resp.json();
  const places = (j.places ?? []) as PlacesApiPlace[];
  // Resolve photos in parallel; each resolution is wrapped so one bad photo
  // never fails the whole request (falls back to image_url: null).
  const mapped = await Promise.all(
    places.map(async (p) => ({
      title: p.displayName?.text?.trim() ?? '',
      subtitle: describe(p),
      image_url: await resolvePhotoUrl(p.photos?.[0]?.name),
      price_level: priceLevelNum(p.priceLevel),
    })),
  );
  return mapped.filter((p) => p.title);
}

// Turn a Places `photo.name` into a keyless, hotlinkable image URL.
// `skipHttpRedirect=true` makes the media endpoint return JSON
// `{ name, photoUri }` instead of a 302 — `photoUri` is a keyless
// lh3.googleusercontent.com URL safe to store and serve to the app. We use this
// JSON form (rather than reading the 302 Location header) because it needs no
// redirect handling and returns the final URL directly.
async function resolvePhotoUrl(photoName?: string): Promise<string | null> {
  if (!photoName) return null;
  try {
    const resp = await fetch(
      `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&skipHttpRedirect=true`,
      { headers: { 'X-Goog-Api-Key': PLACES_KEY! } },
    );
    if (!resp.ok) return null;
    const j = await resp.json();
    return typeof j.photoUri === 'string' ? j.photoUri : null;
  } catch (e) {
    console.error('photo resolve failed', e);
    return null;
  }
}

type PlacesApiPlace = {
  displayName?: { text?: string };
  rating?: number;
  priceLevel?: string;
  types?: string[];
  userRatingCount?: number;
  photos?: { name?: string }[];
};

// Places `priceLevel` enum -> 1–4 (same source as the $/$$ subtitle label).
function priceLevelNum(level?: string): number | null {
  switch (level) {
    case 'PRICE_LEVEL_INEXPENSIVE':
      return 1;
    case 'PRICE_LEVEL_MODERATE':
      return 2;
    case 'PRICE_LEVEL_EXPENSIVE':
      return 3;
    case 'PRICE_LEVEL_VERY_EXPENSIVE':
      return 4;
    default:
      return null;
  }
}

// Own-words descriptor synthesized from structured fields (never copied prose):
// e.g. "Italian restaurant · 4.6★ · $$".
function describe(p: PlacesApiPlace): string | null {
  const parts: string[] = [];
  const cuisine = cuisineLabel(p.types);
  if (cuisine) parts.push(cuisine);
  if (typeof p.rating === 'number') parts.push(`${p.rating.toFixed(1)}★`);
  const price = priceLabel(p.priceLevel);
  if (price) parts.push(price);
  return parts.length ? parts.join(' · ') : null;
}

function priceLabel(level?: string): string | null {
  switch (level) {
    case 'PRICE_LEVEL_INEXPENSIVE':
      return '$';
    case 'PRICE_LEVEL_MODERATE':
      return '$$';
    case 'PRICE_LEVEL_EXPENSIVE':
      return '$$$';
    case 'PRICE_LEVEL_VERY_EXPENSIVE':
      return '$$$$';
    default:
      return null;
  }
}

// Map the first food-related Places type to a friendly cuisine/venue label.
function cuisineLabel(types?: string[]): string | null {
  if (!types) return null;
  for (const t of types) {
    if (t.endsWith('_restaurant') || t === 'restaurant' || t === 'cafe' || t === 'bar') {
      return t
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return null;
}
