from django.urls import path

from .views import (
    login_page,
    dashboard_page,
    auth_signup,
    auth_login,
    auth_logout,
    auth_status
)

urlpatterns = [

    path(
        "api/auth/signup/",
        auth_signup
    ),

    path(
        "api/auth/login/",
        auth_login
    ),

    path(
        "api/auth/logout/",
        auth_logout
    ),

    path(
        "api/auth/status/",
        auth_status
    ),

    path(
        "",
        login_page
    ),

    path(
        "dashboard/",
        dashboard_page
    ),
]