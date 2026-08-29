# EarthPulse AI

A NASA Earth-observation intelligence dashboard, built as a hackathon MVP.
Pick a location, see NASA climate + fire data, compare time ranges, and get
an AI explanation that's grounded in and cites the metrics actually shown
on screen.

**Not affiliated with or endorsed by NASA.** Consumes public NASA APIs only.

---

## 1. Stack

- HTML5 / CSS3 / Vanilla JS (ES6+)
- Leaflet.js (map), Chart.js (charts)
- Supabase: Postgres, Auth, Edge Functions (secure API layer)
- NASA POWER API, NASA FIRMS API
- AI insight generation via a Supabase Edge Function (Anthropic API by default)

## 2. Project structure

```
index.html            Landing page
dashboard.html         Main dashboard
compare.html            Earth Time Machine (historical comparison)
about.html               Data sources & methodology

css/style.css            Global styles + landing/about
css/dashboard.css         Dashboard + compare page styles

js/app.js                 Page controllers (dashboard, compare, nav)
js/map.js                  Leaflet map wrapper
js/charts.js                Chart.js builders
js/nasa.js                   NASA data layer (+ demo-mode fallback)
js/supabase.js                Supabase client, auth, saved locations
js/ai.js                       AI insight request + demo fallback

supabase/functions/nasa-power/index.ts      NASA POWER proxy
supabase/functions/nasa-firms/index.ts       NASA FIRMS proxy
supabase/functions/earth-analysis/index.ts    AI insight generator
supabase/migrations/001_initial_schema.sql     Full DB schema + RLS

.env.example              All required environment variables
```

## 3. Run it locally (frontend only, demo mode)

No build step is required — it's static HTML/JS.

```bash
cd earthpulse-ai
python3 -m http.server 8080
# open http://localhost:8080
```

With no Supabase project configured, the app automatically runs in
**DEMO MODE**: every card and chart is populated with realistic sample
data shaped exactly like the real API responses, and a visible
`DEMO DATA — connect NASA APIs for live observations.` banner appears.
Nothing pretends to be live NASA data.

## 4. Set up Supabase (for live data + auth + saved locations)

1. Create a project at https://supabase.com.
2. In the SQL editor, run the contents of
   `supabase/migrations/001_initial_schema.sql`. This creates:
   `profiles`, `locations`, `observations`, `fire_events`,
   `analysis_results`, `saved_locations`, `api_cache` — with indexes,
   foreign keys, and Row Level Security so a user can only read/write
   their own `saved_locations` and `profiles` rows.
3. Copy your project's **URL** and **anon (publishable) key** from
   Project Settings → API into `js/supabase.js`:

   ```js
   window.EARTHPULSE_CONFIG = {
     SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
     SUPABASE_ANON_KEY: "YOUR-PUBLISHABLE-ANON-KEY",
   };
   ```

   These two values are safe to ship to the browser — they are
   publishable keys, not secrets. RLS is what actually enforces access.

## 5. Deploy the Edge Functions (secure API layer)

Install the Supabase CLI, then from the project root:

```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF

supabase functions deploy nasa-power
supabase functions deploy nasa-firms
supabase functions deploy earth-analysis
```

Set the required **secrets** (these never reach the browser):

```bash
supabase secrets set SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
supabase secrets set FIRMS_MAP_KEY=your-nasa-firms-map-key
supabase secrets set AI_API_KEY=your-ai-provider-api-key
```

> `SUPABASE_SERVICE_ROLE_KEY`, `FIRMS_MAP_KEY`, and `AI_API_KEY` must
> **only** ever exist as Edge Function secrets — never in frontend code,
> a committed `.env`, or the `SUPABASE_ANON_KEY` slot.

## 6. NASA API setup

- **NASA POWER**: no API key required for the public
  `/api/temporal/daily/point` endpoint used here. Just deploy the
  `nasa-power` function — it calls NASA POWER directly.
- **NASA FIRMS**: requires a free `MAP_KEY`.
  1. Request one at https://firms.modaps.eosdis.nasa.gov/api/map_key/
  2. Set it as the `FIRMS_MAP_KEY` Edge Function secret (step 5 above).
  3. If `FIRMS_MAP_KEY` is not set, the `nasa-firms` function returns
     `NOT_CONFIGURED` and the frontend automatically falls back to
     labelled demo fire data — it never fails silently or fakes a
     live source.

## 7. AI provider setup

`earth-analysis` calls the Anthropic Messages API by default. Set
`AI_API_KEY` to an Anthropic API key (or adapt the `fetch` call in
`supabase/functions/earth-analysis/index.ts` to your preferred provider).
The function only ever forwards an allow-listed subset of already-computed
metrics — never raw satellite data — and requires the model to return
structured JSON with `explanation`, `observations`,
`possibleExplanations`, and `confidence`.

## 8. Deploy to Vercel

The app is static, so Vercel needs no special build configuration.

1. Push this repository to GitHub.
2. In Vercel: **New Project → Import** the repo.
3. Framework preset: **Other** (static site). Build command: none.
   Output directory: `/` (project root).
4. Deploy. Because `js/supabase.js` only contains the public URL/anon
   key, no Vercel environment variables are required for the frontend.
   (If you prefer to inject `SUPABASE_URL`/`SUPABASE_ANON_KEY` at build
   time instead of hardcoding them, add a small build step that writes
   `window.EARTHPULSE_CONFIG` from Vercel env vars before deploy.)

## 9. What's live vs. DEMO MODE

| Feature | Live (when configured) | Demo fallback |
|---|---|---|
| Temperature / precipitation / solar cards | NASA POWER via `nasa-power` | Seeded, realistic sample series, labelled `DEMO DATA` |
| Fire activity | NASA FIRMS via `nasa-firms` (needs `FIRMS_MAP_KEY`) | Seeded sample hotspots, labelled `DEMO DATA` |
| AI Earth Insight | Anthropic API via `earth-analysis` (needs `AI_API_KEY`) | Deterministic template built from the same real/demo metrics, marked as non-AI-generated |
| Historical comparison / % change | Always calculated client-side from whichever POWER data is in use | Same, using demo POWER data if live is unavailable |
| Saved locations / auth | Supabase Auth + `saved_locations` (RLS-protected) | Disabled — UI explains Supabase isn't configured |
| Map, search, location selection | Always live (Leaflet + OpenStreetMap Nominatim, no key required) | N/A |

The dashboard's mode badge and demo banner always reflect the actual
source of the data currently on screen.

## 10. Security notes

- No NASA key, FIRMS `MAP_KEY`, AI key, or Supabase service-role key is
  ever present in any frontend file.
- The frontend only ever holds the Supabase **project URL** and
  **publishable anon key**, both designed to be public.
- All third-party API calls happen inside Supabase Edge Functions.
- Row Level Security ensures a signed-in user can only read/write their
  own `profiles` and `saved_locations` rows; `api_cache` is not
  reachable from the client at all.
