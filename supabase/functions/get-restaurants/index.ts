import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.109.0';
import {
  MAX_LOCATION_LEN,
  lookupRefusal,
  isLocationAllowed,
  priceLevelNum,
  describe,
  mergeDedupe,
  normalizeName,
  foursquarePrice,
  type PlacesApiPlace,
  type Place,
} from './logic.ts';

// Server-side only. Neither key ever reaches the app; the frontend calls
// this function and gets back stable `items` rows to swipe on.
const PLACES_KEY = Deno.env.get('PLACES_API_KEY');
const FOURSQUARE_KEY = Deno.env.get('FOURSQUARE_API_KEY');
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// How many stored rows count as "already cached" for a location — at/above
// this we skip the API entirely and serve what we have.
const CACHE_TARGET = 60;

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
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'Unauthorized' }, 401);

    // Client 1 — the CALLER, anon key + the caller's own JWT. Everything the
    // room guard below does is the caller's own data, reachable under RLS:
    // `members_select_same_room` (002_rls.sql:33-36) covers their own row and
    // `rooms_select_members` (002_rls.sql:17-18) covers their room, with the
    // SELECT grants from 004_grants.sql:12-13 (017:22 revoked only INSERT on
    // members, 022:31 only UPDATE on rooms). None of it needs admin.
    const caller = createClient(SB_URL, SB_ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Restrict to the caller's own room: only locations the pair actually saved
    // can trigger a Places lookup. Without this, any anon user could bill the
    // Places API for arbitrary queries (cost-abuse / financial DoS).
    const { data: userData, error: userErr } = await caller.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return json({ error: 'Unauthorized' }, 401);
    }
    // Both reads are logged on error but still fall through to the same
    // refusals: under RLS a denied row is an empty result, not an error, so
    // "no rows" and "not allowed to see the rows" are indistinguishable here
    // and both correctly refuse the lookup. The log is what tells a missing
    // grant apart from a genuinely roomless caller.
    const { data: member, error: memberErr } = await caller
      .from('members')
      .select('room_id')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (memberErr) console.error('members read failed', memberErr);
    if (!member) return json({ error: 'No room' }, 403);
    const { data: room, error: roomErr } = await caller
      .from('rooms')
      .select('locations')
      .eq('id', member.room_id)
      .maybeSingle();
    if (roomErr) console.error('rooms read failed', roomErr);
    const allowed = (room?.locations ?? []) as string[];
    if (!isLocationAllowed(loc, allowed)) {
      return json({ error: 'Location not in your room' }, 403);
    }

    // Client 2 — service_role, and only past the guard. Two things below
    // genuinely require it: `spend_places_lookup` is granted to service_role
    // alone (023_places_budget_atomic.sql:158-160) and the shared `items`
    // catalogue gives `authenticated` no INSERT (004_grants.sql:11 is SELECT
    // only; the write grant is service_role's, 007_service_role_grants.sql:10).
    const svc = createClient(SB_URL, SB_SVC);

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

    // Per-user cost budget. The room guard above is self-authorizing (members
    // may UPDATE rooms.locations), so it only stops the trivial case; this is
    // what bounds the bill. Checked here, after the cache and no-key exits, so
    // a cache hit never spends budget — only a request about to go upstream.
    const refusal = await spendLookupBudget(svc, userData.user.id);
    if (refusal) return refusal;

    const googlePlaces = await fetchPlaces(loc);
    const places = await enrichPricesWithFoursquare(googlePlaces, loc);
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

    // Ignore-conflict, not plain insert: `existingTitles` was read before the
    // upstream call, so a concurrent request for this same location (both
    // partners opening a new deck at once is the normal case) has its own copy
    // of the same rows in flight. The UNIQUE (category, title, location) added
    // in 023 collapses them; DO NOTHING keeps that from being an error.
    if (toInsert.length > 0) {
      const { error } = await svc
        .from('items')
        .upsert(toInsert, { onConflict: 'category,title,location', ignoreDuplicates: true });
      if (error) console.error('insert items failed', error);
    }

    const items = await selectRestaurants(svc, loc);
    return json({ items });
  } catch (e) {
    console.error(e);
    return json({ error: 'Could not load restaurants' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });
}

// Charge one upstream lookup against the per-user and global budgets.
// Returns a refusal Response when the request must not proceed, else null.
//
// One RPC, not three PostgREST calls: counting, checking and recording have to
// happen inside one locked transaction or they bound nothing (see 023). Fails
// closed — a failed RPC means spend is unbounded, so we refuse rather than bill.
// Error detail is logged, never returned (the response bodies are fixed strings).
async function spendLookupBudget(svc: SupabaseClient, userId: string): Promise<Response | null> {
  const { data, error } = await svc.rpc('spend_places_lookup', { p_user: userId });
  if (error) console.error('spend_places_lookup failed', error);
  const refusal = lookupRefusal({ data, error });
  return refusal ? json({ error: refusal.error }, refusal.status) : null;
}

async function selectRestaurants(svc: SupabaseClient, loc: string): Promise<ItemRow[]> {
  const { data, error } = await svc
    .from('items')
    .select('id, category, title, subtitle, image_url, location, source, price_level')
    .eq('category', 'restaurants')
    .eq('location', loc);
  if (error) throw error;
  return (data ?? []) as ItemRow[];
}

// Google Places API (New) Text Search. Paginates up to 3 pages (pageSize 20,
// so up to 60 places) via `nextPageToken`, stopping early if a page has none.
// `places.photos` is requested so we can resolve a keyless hotlinkable image per
// place server-side (the API key never reaches the app or the stored image_url).
async function fetchPlaces(loc: string): Promise<Place[]> {
  const rawPages: PlacesApiPlace[][] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 3; page++) {
    const body: Record<string, unknown> = { textQuery: `best restaurants in ${loc}`, pageSize: 20 };
    if (pageToken) body.pageToken = pageToken;

    let resp = await searchText(body);
    if (!resp.ok && pageToken) {
      // A fresh pageToken can briefly 400 as "not ready" right after the
      // previous page — wait once and retry this same page before giving up.
      await new Promise((r) => setTimeout(r, 2000));
      resp = await searchText(body);
    }
    if (!resp.ok) {
      if (page === 0) throw new Error(`Places API ${resp.status}: ${await resp.text()}`);
      break; // later-page failure: keep whatever pages we already have
    }

    const j = await resp.json();
    rawPages.push((j.places ?? []) as PlacesApiPlace[]);
    pageToken = j.nextPageToken;
    if (!pageToken) break;
  }

  // Resolve photos in parallel; each resolution is wrapped so one bad photo
  // never fails the whole request (falls back to image_url: null).
  const mappedPages = await Promise.all(
    rawPages.map((places) =>
      Promise.all(
        places.map(async (p) => ({
          title: p.displayName?.text?.trim() ?? '',
          subtitle: describe(p),
          image_url: await resolvePhotoUrl(p.photos?.[0]?.name),
          price_level: priceLevelNum(p.priceLevel),
        })),
      ),
    ),
  );
  return mergeDedupe(mappedPages).filter((p) => p.title);
}

function searchText(body: unknown): Promise<Response> {
  return fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': PLACES_KEY!,
      'X-Goog-FieldMask':
        'places.displayName,places.rating,places.priceLevel,places.types,places.userRatingCount,places.photos,nextPageToken',
    },
    body: JSON.stringify(body),
  });
}

// FSQ_VERSION pins the dated Foursquare Places API contract (the new
// places-api.foursquare.com surface — the legacy v3 host was sunset 2026-05-15).
const FSQ_VERSION = '2025-06-17';

// Foursquare Places Search, used only to fill in a price tier for restaurants
// Google returned without one. Never adds new restaurants. Skips cleanly (no
// hard fail) when FOURSQUARE_API_KEY isn't configured.
async function enrichPricesWithFoursquare(places: Place[], loc: string): Promise<Place[]> {
  if (!FOURSQUARE_KEY) {
    console.log('FOURSQUARE_API_KEY not set; skipping price enrichment');
    return places;
  }
  const targets = places.filter((p) => p.price_level == null);
  if (targets.length === 0) return places;

  const prices = await Promise.all(
    targets.map(async (p) => {
      try {
        const url =
          `https://places-api.foursquare.com/places/search?query=${encodeURIComponent(normalizeName(p.title))}` +
          `&near=${encodeURIComponent(loc)}&limit=1&fields=price`;
        const resp = await fetch(url, {
          headers: {
            Authorization: `Bearer ${FOURSQUARE_KEY!}`,
            'X-Places-Api-Version': FSQ_VERSION,
            accept: 'application/json',
          },
        });
        if (!resp.ok) return null;
        const j = await resp.json();
        return foursquarePrice(j?.results?.[0]);
      } catch (e) {
        console.error('foursquare price lookup failed', e);
        return null;
      }
    }),
  );

  let i = 0;
  return places.map((p) => {
    if (p.price_level != null) return p;
    const price = prices[i++];
    return price != null ? { ...p, price_level: price } : p;
  });
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

