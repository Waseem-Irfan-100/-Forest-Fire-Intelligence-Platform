import csv
import io
import os

import requests
from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.http import FileResponse, Http404, JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods

# India bounding box: west,south,east,north (no decimals — FIRMS rejects some float forms)
INDIA_BBOX = "68,6,98,38"
FIRMS_AREA_URL = (
    "https://firms.modaps.eosdis.nasa.gov/api/area/csv/"
    "{key}/VIIRS_SNPP_NRT/{bbox}/{days}"
)


def _firms_api_key():
    return os.getenv("FIRMS_API_KEY") or getattr(settings, "FIRMS_API_KEY", "")


@require_GET
def fires(request):
    """Proxy NASA FIRMS hotspots; API key stays on the server."""
    api_key = _firms_api_key()
    if not api_key:
        return JsonResponse(
            {"error": "FIRMS_API_KEY is not configured in backend/.env"},
            status=500,
        )

    url = FIRMS_AREA_URL.format(key=api_key, bbox=INDIA_BBOX, days=1)

    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
    except requests.RequestException as exc:
        return JsonResponse({"error": str(exc)}, status=502)

    text = response.text.strip()
    if not text:
        return JsonResponse([], safe=False)

    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    return JsonResponse(rows, safe=False)


def _frontend_path(*parts):
    return settings.FRONTEND_DIR.joinpath(*parts)


def _serve_frontend_file(relative_path, content_type="text/html"):
    path = _frontend_path(relative_path)
    if not path.is_file():
        raise Http404(f"Missing frontend file: {relative_path}")
    return FileResponse(path.open("rb"), content_type=content_type)


@ensure_csrf_cookie
@require_GET
def dashboard_page(request):
    return _serve_frontend_file("dashboard.html")


@ensure_csrf_cookie
@require_GET
def login_page(request):
    return _serve_frontend_file("login.html")


@require_http_methods(["GET"])
def auth_status(request):
    user = request.user
    if user.is_authenticated:
        return JsonResponse(
            {
                "authenticated": True,
                "username": user.get_username(),
                "email": getattr(user, "email", "") or "",
            }
        )
    return JsonResponse({"authenticated": False})


@require_http_methods(["POST"])
def auth_login(request):
    import json

    from django.contrib.auth import get_user_model

    try:
        body = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        body = {}

    username = (body.get("username") or body.get("email") or "").strip()
    password = body.get("password") or ""

    if not username or not password:
        return JsonResponse({"error": "Email and password are required."}, status=400)

    user = authenticate(request, username=username, password=password)
    if user is None and "@" in username:
        User = get_user_model()
        try:
            account = User.objects.get(email__iexact=username)
            user = authenticate(
                request, username=account.get_username(), password=password
            )
        except User.DoesNotExist:
            user = None

    if user is None:
        return JsonResponse({"error": "Invalid email or password."}, status=401)

    login(request, user)
    return JsonResponse(
        {
            "authenticated": True,
            "username": user.get_username(),
            "redirect": "/",
        }
    )


@require_http_methods(["POST"])
def auth_logout(request):
    logout(request)
    return JsonResponse({"authenticated": False, "redirect": "/login/"})
