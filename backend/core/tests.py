from datetime import date
from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Meter, MonthlyCharge, Payment, Property, Reading, Tariff


class AuthFlowTests(APITestCase):
    def test_register_and_login_returns_tokens(self):
        register = self.client.post("/api/auth/register/", {"username": "alice", "password": "secret1234"})
        self.assertEqual(register.status_code, status.HTTP_201_CREATED)
        self.assertIn("access", register.data)
        self.assertTrue(User.objects.filter(username="alice").exists())

        login = self.client.post("/api/auth/login/", {"username": "alice", "password": "secret1234"})
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        self.assertIn("refresh", login.data)
        self.assertIn("user", login.data)


class PropertyAndMeterTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="owner", password="pass12345")
        self.other = User.objects.create_user(username="intruder", password="pass12345")
        self.client.force_authenticate(self.owner)
        self.property = Property.objects.create(owner=self.owner, name="Дом", address="Улица, 1")

    def test_property_created_for_authenticated_owner(self):
        resp = self.client.post("/api/properties/", {"name": "Новый объект", "address": "Проспект, 7"})
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Property.objects.filter(owner=self.owner).count(), 2)

    def test_cannot_add_meter_to_foreign_property(self):
        foreign_property = Property.objects.create(owner=self.other, name="Чужой дом", address="Нет доступа")
        resp = self.client.post(
            "/api/meters/",
            {
                "property": foreign_property.id,
                "resource_type": Meter.ELECTRICITY,
                "unit": "kWh",
                "serial_number": "EL-123",
            },
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("property", resp.data)

    def test_meter_list_filtered_by_property(self):
        other_property = Property.objects.create(owner=self.owner, name="Офис", address="Адрес 2")
        Meter.objects.create(property=self.property, resource_type=Meter.ELECTRICITY, unit="kWh")
        Meter.objects.create(property=other_property, resource_type=Meter.GAS, unit="м3")

        resp = self.client.get("/api/meters/", {"property": other_property.id})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["property"], other_property.id)


class ReadingChargeTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="reader", password="pass12345")
        self.property = Property.objects.create(owner=self.user, name="Квартира", address="Адрес")
        self.meter = Meter.objects.create(
            property=self.property,
            resource_type=Meter.ELECTRICITY,
            unit="kWh",
            serial_number="EL-001",
        )
        self.tariff = Tariff.objects.create(
            resource_type=Meter.ELECTRICITY,
            value_per_unit=Decimal("6.50"),
            valid_from=date(2024, 1, 1),
        )
        self.client.force_authenticate(self.user)

    def test_new_reading_updates_monthly_charge(self):
        # initial reading
        Reading.objects.create(meter=self.meter, value=Decimal("100.000"), reading_date=date(2024, 3, 1))

        resp = self.client.post(
            "/api/readings/",
            {"meter": self.meter.id, "value": "125.500", "reading_date": "2024-03-31"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        charge = MonthlyCharge.objects.get(property=self.property, year=2024, month=3, resource_type=Meter.ELECTRICITY)
        self.assertEqual(charge.consumption, Decimal("25.500"))
        self.assertEqual(charge.amount, Decimal("25.500") * self.tariff.value_per_unit)

    def test_reading_validation_blocks_foreign_meter(self):
        stranger = User.objects.create_user(username="stranger", password="pass12345")
        foreign_property = Property.objects.create(owner=stranger, name="Чужой объект", address="Секрет")
        foreign_meter = Meter.objects.create(property=foreign_property, resource_type=Meter.COLD_WATER, unit="м3")

        resp = self.client.post(
            "/api/readings/",
            {"meter": foreign_meter.id, "value": "10", "reading_date": "2024-02-01"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("meter", resp.data)


class AnalyticsViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="analyst", password="pass12345")
        self.client.force_authenticate(self.user)
        self.property = Property.objects.create(owner=self.user, name="Офис", address="Город")

        MonthlyCharge.objects.create(
            property=self.property,
            year=2024,
            month=1,
            resource_type=Meter.ELECTRICITY,
            consumption=Decimal("120.5"),
            amount=Decimal("780.00"),
        )
        MonthlyCharge.objects.create(
            property=self.property,
            year=2024,
            month=2,
            resource_type=Meter.COLD_WATER,
            consumption=Decimal("15.0"),
            amount=Decimal("650.00"),
        )

    def test_analytics_returns_monthly_and_summary(self):
        resp = self.client.get(
            "/api/analytics/",
            {
                "property": self.property.id,
                "start_year": 2024,
                "start_month": 1,
                "end_year": 2024,
                "end_month": 12,
            },
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("monthly", resp.data)
        self.assertGreaterEqual(len(resp.data["monthly"]), 2)
        summary = resp.data["summary"]
        self.assertAlmostEqual(summary["total_amount"], 1430.0)
        self.assertIn(summary["peak_month"], {"2024-01", "2024-02"})

    def test_forecast_endpoint_requires_owned_property(self):
        other_user = User.objects.create_user(username="outsider", password="pass12345")
        foreign_property = Property.objects.create(owner=other_user, name="Чужой", address="Секрет")

        resp_missing = self.client.get("/api/analytics/forecast/")
        self.assertEqual(resp_missing.status_code, status.HTTP_400_BAD_REQUEST)

        resp_foreign = self.client.get("/api/analytics/forecast/", {"property": foreign_property.id})
        self.assertEqual(resp_foreign.status_code, status.HTTP_404_NOT_FOUND)

        resp_owned = self.client.get("/api/analytics/forecast/", {"property": self.property.id})
        self.assertEqual(resp_owned.status_code, status.HTTP_200_OK)
        self.assertIn("forecast_amount", resp_owned.data)


class PaymentValidationTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="payer", password="pass12345")
        self.client.force_authenticate(self.owner)
        self.property = Property.objects.create(owner=self.owner, name="Объект", address="Адрес")

    def test_payment_rejects_foreign_property(self):
        stranger = User.objects.create_user(username="stranger2", password="pass12345")
        foreign_property = Property.objects.create(owner=stranger, name="Чужой", address="Секрет")

        resp = self.client.post(
            "/api/payments/",
            {
                "property": foreign_property.id,
                "year": 2024,
                "month": 5,
                "amount": "500.00",
                "paid_at": "2024-05-10",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("property", resp.data)

    def test_payment_created_for_owner(self):
        resp = self.client.post(
            "/api/payments/",
            {
                "property": self.property.id,
                "year": 2024,
                "month": 6,
                "amount": "750.00",
                "paid_at": "2024-06-10",
                "comment": "Тестовый платёж",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Payment.objects.filter(property=self.property, amount="750.00").exists())
