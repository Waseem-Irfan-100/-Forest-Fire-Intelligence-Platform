from django.urls import path

from . import views

urlpatterns = [
    path("fires/", views.fires, name="fires"),
    path("auth/status/", views.auth_status, name="auth_status"),
    path("auth/login/", views.auth_login, name="auth_login"),
    path("auth/logout/", views.auth_logout, name="auth_logout"),
]
