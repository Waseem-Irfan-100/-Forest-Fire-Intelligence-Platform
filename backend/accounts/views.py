from django.http import JsonResponse
from django.contrib.auth import authenticate, login, logout
from django.views.decorators.http import require_http_methods
from .models import CustomUser
from django.shortcuts import render

import json


@require_http_methods(["POST"])
def auth_signup(request):

    try:
        data = json.loads(request.body)

        name = data.get("name")
        phone = data.get("phone")
        email = data.get("email")
        affiliation = data.get("affiliation")
        domain = data.get("domain")
        password = data.get("password")

        if not all([name, email, password]):

            return JsonResponse({
                "error": "Please fill required fields"
            }, status=400)

        if CustomUser.objects.filter(email=email).exists():

            return JsonResponse({
                "error": "Email already registered"
            }, status=400)

        username = email.split("@")[0]

        user = CustomUser.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=name,
            phone=phone,
            affiliation=affiliation,
            domain=domain
        )

        login(request, user)

        return JsonResponse({
            "authenticated": True,
            "username": user.username,
            "redirect": "/dashboard/"
        })

    except Exception as e:

        return JsonResponse({
            "error": str(e)
        }, status=500)


@require_http_methods(["POST"])
def auth_login(request):

    try:
        data = json.loads(request.body)

        email = data.get("email")
        password = data.get("password")

        try:
            user_obj = CustomUser.objects.get(email=email)

        except CustomUser.DoesNotExist:

            return JsonResponse({
                "error": "User not found"
            }, status=401)

        user = authenticate(
            request,
            username=user_obj.username,
            password=password
        )

        if user is None:

            return JsonResponse({
                "error": "Invalid email or password"
            }, status=401)

        login(request, user)

        return JsonResponse({
            "authenticated": True,
            "username": user.get_username(),
            "redirect": "/dashboard/"
        })

    except Exception as e:

        return JsonResponse({
            "error": str(e)
        }, status=500)


@require_http_methods(["POST"])
def auth_logout(request):

    logout(request)

    return JsonResponse({
        "authenticated": False,
        "redirect": "/login/"
    })


def auth_status(request):

    return JsonResponse({
        "authenticated": request.user.is_authenticated
    })

def login_page(request):

    return render(
        request,
        "login.html"
    )


def dashboard_page(request):

    return render(
        request,
        "dashboard.html"
    )