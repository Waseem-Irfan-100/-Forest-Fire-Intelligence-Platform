# LSI Lab India — Forest Fire Intelligence

Web prototype for India-focused forest fire monitoring using **CFFDRS** (Canadian Forest Fire Danger Rating System), **ERA5** weather, and **NASA FIRMS / MODIS** hotspots.

## Pages

| File | Purpose |
|------|---------|
| `login.html` | Sign-in (redirects to dashboard) |
| `dashboard.html` | Map + FWI indices + ecoregion charts |

## Backend

`backend/cffdrs.py` — your open-equation pipeline:

`FFMC → DMC → DC → ISI → BUI → FWI → DSR`

Wire this to a FastAPI/Flask service that ingests ERA5 daily grids and returns GeoJSON for the map.

## Assets

- `assets/logo.png` — login branding / video poster
- `assets/earth.mp4` — login background video
- `assets/ecoregions/*.png` — FWI vs FRP scatter plots per ecoregion

## Run locally (Django — recommended)

The Django backend serves the map dashboard, hides the FIRMS API key, and handles login.

```powershell
cd d:\Projects\forestfire\backend
pip install -r requirements.txt
# Ensure backend/.env contains: FIRMS_API_KEY=your_map_key_from_firms.nasa.gov
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

| URL | Purpose |
|-----|---------|
| http://127.0.0.1:8000/ | **Dashboard** (public — no login required) |
| http://127.0.0.1:8000/login/ | Sign in (optional) |
| http://127.0.0.1:8000/api/fires/ | FIRMS proxy (JSON hotspots) |

**Do not** open HTML as `file://` — use Django so `/api/fires/` and assets resolve correctly.

### Logo / video not showing?

1. Confirm these files exist: `assets/logo.png`, `assets/earth.mp4`
2. Confirm the server was started inside `transpo`, not a parent folder
3. In DevTools → Network, check that `logo.png` and `earth.mp4` return **200** (not 404)
4. Use `http://localhost:8080/login.html`, not `file:///...`

## Next steps (production)

1. **FIRMS API** — live VIIRS/MODIS hotspots for India bbox  
2. **ERA5 / CDS** — daily tas, pr, wind, RH for `cffdrs_calc`  
3. **PostGIS / zarr** — store 0.25° FWI rasters  
4. **Auth** — replace `sessionStorage` with real Forest Dept. SSO  
