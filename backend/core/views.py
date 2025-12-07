from datetime import date

from datetime import date

from django.contrib.auth.models import User
from django.db.models import Q, Sum
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import Meter, MonthlyCharge, Payment, Property, Reading, Tariff
from .serializers import (
    LoginSerializer,
    MeterSerializer,
    MonthlyChargeSerializer,
    PaymentSerializer,
    PropertySerializer,
    ReadingSerializer,
    TariffSerializer,
    UserSerializer,
)
from .services import ensure_demo_data, forecast_property


class RegistrationView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        user = self.object
        refresh = RefreshToken.for_user(user)
        response.data = {
            "user": UserSerializer(user).data,
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }
        return response

    def perform_create(self, serializer):
        self.object = serializer.save()
        ensure_demo_data(self.object)


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer


class PropertyViewSet(viewsets.ModelViewSet):
    serializer_class = PropertySerializer

    def get_queryset(self):
        return Property.objects.filter(owner=self.request.user)


class MeterViewSet(viewsets.ModelViewSet):
    serializer_class = MeterSerializer

    def get_queryset(self):
        qs = Meter.objects.filter(property__owner=self.request.user)
        property_id = self.request.query_params.get("property")
        if property_id:
            qs = qs.filter(property_id=property_id)
        return qs


class TariffViewSet(viewsets.ModelViewSet):
    queryset = Tariff.objects.all()
    serializer_class = TariffSerializer


class ReadingViewSet(viewsets.ModelViewSet):
    serializer_class = ReadingSerializer

    def get_queryset(self):
        qs = Reading.objects.filter(meter__property__owner=self.request.user)
        property_id = self.request.query_params.get("meter__property")
        meter_id = self.request.query_params.get("meter")
        if property_id:
            qs = qs.filter(meter__property_id=property_id)
        if meter_id:
            qs = qs.filter(meter_id=meter_id)
        return qs


class MonthlyChargeViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MonthlyChargeSerializer

    def get_queryset(self):
        qs = MonthlyCharge.objects.filter(property__owner=self.request.user)
        property_id = self.request.query_params.get("property")
        year = self.request.query_params.get("year")
        month = self.request.query_params.get("month")
        if property_id:
            qs = qs.filter(property_id=property_id)
        if year:
            qs = qs.filter(year=year)
        if month:
            qs = qs.filter(month=month)
        return qs.order_by("year", "month")


class PaymentViewSet(viewsets.ModelViewSet):
    serializer_class = PaymentSerializer

    def get_queryset(self):
        return Payment.objects.filter(property__owner=self.request.user)


class AnalyticsViewSet(viewsets.ViewSet):
    def list(self, request):
        property_id = request.query_params.get("property")
        properties_param = request.query_params.get("properties")
        resource_type = request.query_params.get("resource_type")
        start_year = int(request.query_params.get("start_year", date.today().year - 1))
        start_month = int(request.query_params.get("start_month", 1))
        end_year = int(request.query_params.get("end_year", date.today().year))
        end_month = int(request.query_params.get("end_month", 12))

        props_qs = Property.objects.filter(owner=request.user)
        selected_ids = []
        if properties_param:
            selected_ids = [int(p) for p in properties_param.split(",") if p]
        elif property_id:
            selected_ids = [int(property_id)]

        if selected_ids:
            props_qs = props_qs.filter(id__in=selected_ids)
        props = list(props_qs)
        if not props:
            return Response({"detail": "Нет доступных объектов для аналитики"}, status=status.HTTP_400_BAD_REQUEST)

        charges = (
            MonthlyCharge.objects.filter(property__in=props)
            .filter((Q(year__gt=start_year) | Q(year=start_year, month__gte=start_month)))
            .filter(Q(year__lt=end_year) | Q(year=end_year, month__lte=end_month))
        )

        if resource_type:
            charges = charges.filter(resource_type=resource_type)

        monthly_map = {}
        resource_totals = {}
        monthly_by_resource = {}

        for charge in charges.order_by("year", "month"):
            key = f"{charge.year}-{charge.month:02d}"
            monthly_map.setdefault(
                key,
                {
                    "month": key,
                    "items": [],
                    "total_amount": 0,
                    "total_consumption": 0,
                    "cumulative_amount": 0,
                },
            )
            monthly_map[key]["items"].append(
                {
                    "property": charge.property_id,
                    "resource_type": charge.resource_type,
                    "consumption": float(charge.consumption),
                    "amount": float(charge.amount),
                }
            )
            monthly_map[key]["total_amount"] += float(charge.amount)
            monthly_map[key]["total_consumption"] += float(charge.consumption)

            resource_totals.setdefault(
                charge.resource_type,
                {"total_consumption": 0.0, "total_amount": 0.0},
            )
            resource_totals[charge.resource_type]["total_consumption"] += float(charge.consumption)
            resource_totals[charge.resource_type]["total_amount"] += float(charge.amount)

            monthly_by_resource.setdefault(key, {})
            monthly_by_resource[key].setdefault(
                charge.resource_type, {"consumption": 0.0, "amount": 0.0}
            )
            monthly_by_resource[key][charge.resource_type]["consumption"] += float(
                charge.consumption
            )
            monthly_by_resource[key][charge.resource_type]["amount"] += float(
                charge.amount
            )

        monthly = list(sorted(monthly_map.values(), key=lambda item: item["month"]))
        running = 0
        for m in monthly:
            running += m["total_amount"]
            m["cumulative_amount"] = running

        by_property = (
            charges.values("property__id", "property__name")
            .annotate(total_amount=Sum("amount"), total_consumption=Sum("consumption"))
            .order_by("property__id")
        )

        totals_amount = sum(item["total_amount"] for item in by_property)
        totals_consumption = sum(item["total_consumption"] for item in by_property)
        peak_month_by_amount = max(monthly, key=lambda m: m["total_amount"], default=None)

        days_count = len(monthly) * 30 or 1
        average_daily_amount = totals_amount / days_count

        forecast_value = float(sum(forecast_property(p) for p in props) / len(props))

        payments = (
            Payment.objects.filter(property__in=props)
            .values("year", "month")
            .annotate(total=Sum("amount"))
        )

        units_map = {
            item["resource_type"]: item["unit"]
            for item in Meter.objects.filter(property__in=props)
            .values("resource_type", "unit")
            .distinct()
        }

        return Response(
            {
                "period": {
                    "start_year": start_year,
                    "start_month": start_month,
                    "end_year": end_year,
                    "end_month": end_month,
                },
                "monthly": monthly,
                "monthly_by_resource": [
                    {
                        "month": month,
                        "resource_type": resource,
                        "consumption": values["consumption"],
                        "amount": values["amount"],
                    }
                    for month, data in sorted(monthly_by_resource.items())
                    for resource, values in data.items()
                ],
                "summary": {
                    "total_amount": float(totals_amount),
                    "total_consumption": float(totals_consumption),
                    "average_daily_amount": float(average_daily_amount),
                    "peak_month": peak_month_by_amount["month"] if peak_month_by_amount else None,
                    "resources": [
                        {
                            "resource_type": resource,
                            "total_consumption": values["total_consumption"],
                            "total_amount": values["total_amount"],
                            "unit": units_map.get(resource, ""),
                        }
                        for resource, values in resource_totals.items()
                    ],
                },
                "comparison": list(by_property),
                "payments": list(payments),
                "forecast_amount": forecast_value,
            }
        )

    @action(detail=False, methods=["get"])
    def forecast(self, request):
        property_id = request.query_params.get("property")
        if not property_id:
            return Response({"detail": "property param required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            prop = Property.objects.get(id=property_id, owner=request.user)
        except Property.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        forecast_value = float(forecast_property(prop))
        return Response({"forecast_amount": forecast_value})
