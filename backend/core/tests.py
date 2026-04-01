from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from .models import Meter, MonthlyCharge, Payment, Property, Reading, Tariff
from .services import forecast_property, process_reading


class AuthFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_register_and_login(self):
        resp = self.client.post("/api/auth/register/", {
            "username": "testuser", "password": "TestPass123", "email": "test@example.com"
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIn("access", resp.data)
        self.assertIn("refresh", resp.data)

    def test_login_with_jwt(self):
        User.objects.create_user("user1", password="pass123")
        resp = self.client.post("/api/auth/login/", {"username": "user1", "password": "pass123"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("access", resp.data)

    def test_access_requires_auth(self):
        resp = self.client.get("/api/properties/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class PropertyMeterTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user("owner", password="pass")
        resp = self.client.post("/api/auth/login/", {"username": "owner", "password": "pass"})
        self.token = resp.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token}")

    def test_create_property(self):
        resp = self.client.post("/api/properties/", {"name": "My House", "address": "123 Main St"})
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Property.objects.count(), 1)

    def test_list_own_properties_only(self):
        Property.objects.create(owner=self.user, name="Mine", address="Addr1")
        other = User.objects.create_user("other")
        Property.objects.create(owner=other, name="Not Mine", address="Addr2")
        resp = self.client.get("/api/properties/")
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["name"], "Mine")

    def test_create_meter_for_property(self):
        prop = Property.objects.create(owner=self.user, name="P", address="A")
        resp = self.client.post("/api/meters/", {
            "property": prop.id, "resource_type": "electricity", "unit": "kwh",
            "serial_number": "SN001"
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Meter.objects.count(), 1)

    def test_cannot_add_meter_to_others_property(self):
        other = User.objects.create_user("other")
        prop = Property.objects.create(owner=other, name="Other", address="Addr")
        resp = self.client.post("/api/meters/", {
            "property": prop.id, "resource_type": "electricity", "unit": "kwh"
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class ReadingChargeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user("owner", password="pass")
        resp = self.client.post("/api/auth/login/", {"username": "owner", "password": "pass"})
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['access']}")
        self.prop = Property.objects.create(owner=self.user, name="P", address="A")
        self.meter = Meter.objects.create(
            property=self.prop, resource_type="electricity", unit="kwh"
        )
        Tariff.objects.create(
            resource_type="electricity", value_per_unit=Decimal("5.00"),
            valid_from=date.today() - timedelta(days=365), valid_to=None
        )

    def test_submit_reading(self):
        resp = self.client.post("/api/readings/", {
            "meter": self.meter.id, "value": "100.000", "reading_date": str(date.today())
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_reading_creates_charge(self):
        Reading.objects.create(meter=self.meter, value=Decimal("50"), reading_date=date.today() - timedelta(days=30))
        self.client.post("/api/readings/", {
            "meter": self.meter.id, "value": "150.000",
            "reading_date": str(date.today())
        })
        charge = MonthlyCharge.objects.filter(property=self.prop, resource_type="electricity").first()
        self.assertIsNotNone(charge)
        self.assertEqual(charge.consumption, Decimal("100.000"))
        self.assertEqual(charge.amount, Decimal("500.00"))

    def test_forecast_endpoint(self):
        for i in range(3):
            Reading.objects.create(
                meter=self.meter, value=Decimal(50 * (i + 1)),
                reading_date=date.today().replace(day=1) - timedelta(days=30 * (i + 1))
            )
        for dt in [date.today().replace(day=1) - timedelta(days=30 * i) for i in range(3)]:
            process_reading(Reading(meter=self.meter, value=Decimal("50"), reading_date=dt))
        resp = self.client.get(f"/api/analytics/forecast/?property={self.prop.id}")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("forecast_amount", resp.data)


class AnalyticsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user("owner", password="pass")
        resp = self.client.post("/api/auth/login/", {"username": "owner", "password": "pass"})
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['access']}")
        self.prop = Property.objects.create(owner=self.user, name="P", address="A")
        MonthlyCharge.objects.create(
            property=self.prop, year=2026, month=1, resource_type="electricity",
            consumption=Decimal("100"), amount=Decimal("500")
        )

    def test_analytics_returns_data(self):
        resp = self.client.get("/api/analytics/", {"property": self.prop.id})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("summary", resp.data)
        self.assertIn("monthly", resp.data)

    def test_forecast_calculation(self):
        charges = MonthlyCharge.objects.filter(property=self.prop)
        val = forecast_property(self.prop)
        self.assertIsInstance(val, Decimal)


class PaymentTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user("owner", password="pass")
        resp = self.client.post("/api/auth/login/", {"username": "owner", "password": "pass"})
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['access']}")
        self.prop = Property.objects.create(owner=self.user, name="P", address="A")

    def test_create_payment(self):
        resp = self.client.post("/api/payments/", {
            "property": self.prop.id, "year": 2026, "month": 5,
            "amount": "1500.00", "paid_at": str(date.today())
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Payment.objects.count(), 1)

    def test_cannot_pay_others_property(self):
        other = User.objects.create_user("other")
        other_prop = Property.objects.create(owner=other, name="Other", address="A")
        resp = self.client.post("/api/payments/", {
            "property": other_prop.id, "year": 2026, "month": 5,
            "amount": "500.00", "paid_at": str(date.today())
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
