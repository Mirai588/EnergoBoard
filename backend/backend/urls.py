"""
URL configuration for backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import include, path
from rest_framework import routers
from rest_framework_simplejwt.views import TokenRefreshView

from core.views import (
    AnalyticsViewSet,
    LoginView,
    MeterViewSet,
    MonthlyChargeViewSet,
    PaymentViewSet,
    PropertyViewSet,
    ReadingViewSet,
    RegistrationView,
    TariffViewSet,
)

router = routers.DefaultRouter()
router.register(r"properties", PropertyViewSet, basename="property")
router.register(r"meters", MeterViewSet, basename="meter")
router.register(r"readings", ReadingViewSet, basename="reading")
router.register(r"tariffs", TariffViewSet, basename="tariff")
router.register(r"monthly-charges", MonthlyChargeViewSet, basename="monthlycharge")
router.register(r"payments", PaymentViewSet, basename="payment")
router.register(r"analytics", AnalyticsViewSet, basename="analytics")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/register/", RegistrationView.as_view(), name="register"),
    path("api/auth/login/", LoginView.as_view(), name="token_obtain_pair"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/", include(router.urls)),
]
