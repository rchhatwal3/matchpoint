# Supabase setup (matchpoint)

One-time manual steps to stand up the backend. No accounts — matchpoint pairs
users with a 6-char invite code over Supabase **anonymous** auth.

## 1. Create the project

1. Go to <https://supabase.com/dashboard> and create a new project.
2. Pick a region close to your users and set a database password (store it in a
   password manager — you won't need it for the app).

## 2. Enable anonymous sign-ins

The app never asks users to register. It calls `auth.signInAnonymously()`.

- Dashboard -> **Authentication** -> **Sign In / Up** (Providers).
- Enable **Anonymous sign-ins**. Save.

## 3. Run the migrations (in order)

Dashboard -> **SQL Editor** -> **New query**. Paste and run each file, in this
exact order:

1. `supabase/migrations/001_schema.sql`
2. `supabase/migrations/002_rls.sql`
3. `supabase/migrations/003_rpc.sql`

Each should finish with no errors. Order matters: `002` and `003` depend on the
tables and functions created earlier.

> Prefer the CLI? With the Supabase CLI linked to the project you can run
> `supabase db push` to apply everything in `supabase/migrations/` at once.

## 4. Seed the swipe items

Run `supabase/seed.sql` (produced by the seed-data task) the same way — SQL
Editor, or `psql`/`supabase db execute`. It fills the `items` table with the
curated cards for each category.

> **Restaurants:** the `restaurants` category is not part of the static seed.
> Restaurant items get populated per-location later by a Supabase Edge Function
> that calls a Places API server-side and inserts location-tagged rows into
> `items`. The frontend never calls third-party APIs directly.

## 5. Wire up the app's environment

Dashboard -> **Project Settings** -> **API**:

- Copy **Project URL** and the **anon** **public** key.
- Add them to your local `.env` (see `.env.example`):

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
```

The `EXPO_PUBLIC_` prefix is required for Expo to expose them to the client
bundle. For the web deploy, set the same two values as GitHub repo secrets.

## Security warning

**Never expose the `service_role` key.** It bypasses Row Level Security. It must
never appear in app code, `.env` files that ship to the client, `EXPO_PUBLIC_*`
variables, the web bundle, or the repo. The app only ever uses the **anon**
public key; RLS and the `SECURITY DEFINER` RPCs (`create_room`, `join_room`) are
what keep each pair's data isolated.
