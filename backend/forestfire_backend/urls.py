from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from api import views as page_views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),
    path("", page_views.dashboard_page, name="dashboard"),
    path("login/", page_views.login_page, name="login"),
]

if settings.DEBUG:
    urlpatterns += static("/js/", document_root=settings.FRONTEND_DIR / "js")
    urlpatterns += static("/assets/", document_root=settings.FRONTEND_DIR / "assets")
