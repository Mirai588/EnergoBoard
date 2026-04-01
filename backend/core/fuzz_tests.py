import json
from datetime import date, timedelta

from django.contrib.auth.models import User
from hypothesis import assume, given, settings
from hypothesis.extra.django import TestCase
from hypothesis.strategies import booleans, dates, decimals, integers, just, lists, none, one_of, sampled_from, text
from rest_framework import status
from rest_framework.test import APIClient

from .models import Meter, MonthlyCharge, Payment, Property, Reading, Tariff

# --- strategies ---
usr = text(min_size=0, max_size=150)
pwd = text(min_size=0, max_size=128)
email = text(min_size=0, max_size=254)
tiny_str = text(min_size=0, max_size=50)
resource_type = sampled_from([c[0] for c in Meter.RESOURCE_CHOICES]) if hasattr(Meter, 'RESOURCE_CHOICES') else sampled_from(['electricity', 'cold_water', 'hot_water', 'gas', 'heating'])

# Workaround: Meter.RESOURCE_CHOICES might not be defined (it's RESOURCE_CHOICES in the model)
resource_type = sampled_from(['electricity', 'cold_water', 'hot_water', 'gas', 'heating'])
unit = sampled_from(['kWh', 'м³', 'Гкал', 'kW', ''])
decimal_val = decimals(min_value=0, max_value=1_000_000, allow_nan=False, allow_infinity=False, places=3)
decimal_charge = decimals(min_value=0, max_value=1_000_000, allow_nan=False, allow_infinity=False, places=2)
pos_int = integers(min_value=0, max_value=10_000)
year_int = integers(min_value=2020, max_value=2030)
month_int = integers(min_value=1, max_value=12)
any_date = dates(min_value=date(2020, 1, 1), max_value=date.today() + timedelta(days=365))


class AuthFuzzTests(TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()

    @given(u=usr, p=pwd)
    @settings(max_examples=40)
    def test_register_never_errors(self, u: str, p: str):
        resp = self.client.post('/api/auth/register/', {'username': u, 'password': p}, format='json')
        assert resp.status_code in (201, 400), f'Got {resp.status_code}: {resp.data}'

    @given(u=usr, p=pwd)
    @settings(max_examples=40)
    def test_login_with_random_credential_never_errors(self, u: str, p: str):
        resp = self.client.post('/api/auth/login/', {'username': u, 'password': p}, format='json')
        assert resp.status_code in (200, 401), f'Got {resp.status_code}: {resp.data}'


class PropertyFuzzTests(TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.user = User.objects.create_user(username='fuzzer', password='x')
        self.client.force_authenticate(self.user)

    @given(name=tiny_str, addr=tiny_str)
    @settings(max_examples=30)
    def test_create_property_never_errors(self, name: str, addr: str):
        resp = self.client.post('/api/properties/', {'name': name, 'address': addr}, format='json')
        assert resp.status_code in (201, 400), f'Got {resp.status_code}: {resp.data}'

    @given(name=tiny_str, addr=tiny_str)
    @settings(max_examples=20)
    def test_update_own_property_never_errors(self, name: str, addr: str):
        prop = Property.objects.create(owner=self.user, name='base', address='base')
        resp = self.client.patch(f'/api/properties/{prop.id}/', {'name': name, 'address': addr}, format='json')
        assert resp.status_code in (200, 400), f'Got {resp.status_code}: {resp.data}'

    @given()
    @settings(max_examples=10)
    def test_foreign_property_invisible(self):
        other = User.objects.create_user(username='other', password='x')
        prop = Property.objects.create(owner=other, name='secret', address='hidden')
        resp = self.client.get(f'/api/properties/{prop.id}/')
        assert resp.status_code == 404, f'Got {resp.status_code}'


class MeterFuzzTests(TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.user = User.objects.create_user(username='meter_fuzzer', password='x')
        self.client.force_authenticate(self.user)
        self.prop = Property.objects.create(owner=self.user, name='prop', address='addr')

    @given(rt=resource_type, u=unit, sn=tiny_str)
    @settings(max_examples=30)
    def test_create_meter_never_errors(self, rt: str, u: str, sn: str):
        resp = self.client.post('/api/meters/', {
            'property': self.prop.id,
            'resource_type': rt,
            'unit': u,
            'serial_number': sn,
        }, format='json')
        assert resp.status_code in (201, 400), f'Got {resp.status_code}: {resp.data}'

    @given()
    @settings(max_examples=5)
    def test_foreign_property_meter_rejected(self):
        other = User.objects.create_user(username='other_m', password='x')
        other_prop = Property.objects.create(owner=other, name='other', address='x')
        resp = self.client.post('/api/meters/', {
            'property': other_prop.id,
            'resource_type': 'electricity',
            'unit': 'kWh',
            'serial_number': '',
        }, format='json')
        assert resp.status_code == 400, f'Should reject foreign property, got {resp.status_code}'


class ReadingFuzzTests(TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.user = User.objects.create_user(username='reading_fuzzer', password='x')
        self.client.force_authenticate(self.user)
        self.prop = Property.objects.create(owner=self.user, name='p', address='a')
        self.meter = Meter.objects.create(
            property=self.prop, resource_type='electricity',
            unit='kWh', serial_number='E-1',
        )
        Tariff.objects.create(
            resource_type='electricity', value_per_unit=5, valid_from=date(2020, 1, 1),
        )

    @given(v=decimal_val, rd=any_date)
    @settings(max_examples=40)
    def test_create_reading_never_errors(self, v, rd: date):
        resp = self.client.post('/api/readings/', {
            'meter': self.meter.id,
            'value': float(v) if v is not None else 0,
            'reading_date': rd.isoformat(),
        }, format='json')
        assert resp.status_code in (201, 400), f'Got {resp.status_code}: {resp.data}'

    @given(v1=decimal_val, v2=decimal_val)
    @settings(max_examples=20)
    def test_reading_monotonic_invariant(self, v1, v2):
        rd = date(2024, 6, 15)
        Reading.objects.create(meter=self.meter, value=v1, reading_date=rd - timedelta(days=30))
        resp = self.client.post('/api/readings/', {
            'meter': self.meter.id,
            'value': float(v2) if v2 is not None else 0,
            'reading_date': rd.isoformat(),
        }, format='json')
        if resp.status_code == 201:
            charge = MonthlyCharge.objects.filter(property=self.prop, year=rd.year, month=rd.month).first()
            if charge and v2 > v1:
                assert charge.consumption > 0, 'Consumption should be positive when value increases'
                assert charge.amount > 0, 'Amount should be positive when consumption > 0'

    @given()
    @settings(max_examples=5)
    def test_foreign_meter_reading_rejected(self):
        other = User.objects.create_user(username='other_r', password='x')
        other_prop = Property.objects.create(owner=other, name='o', address='o')
        other_meter = Meter.objects.create(property=other_prop, resource_type='electricity', unit='kWh')
        resp = self.client.post('/api/readings/', {
            'meter': other_meter.id,
            'value': 100,
            'reading_date': '2024-01-01',
        }, format='json')
        assert resp.status_code == 400, f'Should reject foreign meter, got {resp.status_code}'


class PaymentFuzzTests(TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.user = User.objects.create_user(username='pay_fuzzer', password='x')
        self.client.force_authenticate(self.user)
        self.prop = Property.objects.create(owner=self.user, name='p', address='a')

    @given(y=year_int, m=month_int, a=decimal_charge, pd=any_date, c=tiny_str)
    @settings(max_examples=20)
    def test_create_payment_never_errors(self, y: int, m: int, a, pd: date, c: str):
        resp = self.client.post('/api/payments/', {
            'property': self.prop.id,
            'year': y,
            'month': m,
            'amount': float(a) if a is not None else 0,
            'paid_at': pd.isoformat(),
            'comment': c,
        }, format='json')
        assert resp.status_code in (201, 400), f'Got {resp.status_code}: {resp.data}'

    @given()
    @settings(max_examples=5)
    def test_foreign_property_payment_rejected(self):
        other = User.objects.create_user(username='other_pay', password='x')
        other_prop = Property.objects.create(owner=other, name='o', address='o')
        resp = self.client.post('/api/payments/', {
            'property': other_prop.id,
            'year': 2024,
            'month': 1,
            'amount': 500,
            'paid_at': '2024-01-15',
        }, format='json')
        assert resp.status_code == 400, f'Should reject foreign property, got {resp.status_code}'


class AnalyticsFuzzTests(TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.user = User.objects.create_user(username='analytics_fuzzer', password='x')
        self.client.force_authenticate(self.user)
        self.prop = Property.objects.create(owner=self.user, name='p', address='a')

    @given(
        pid=one_of(integers(min_value=1, max_value=9999), none()),
        res=one_of(sampled_from(['electricity', 'cold_water', '', 'invalid_type']), none()),
        sy=one_of(integers(min_value=2000, max_value=2030), none()),
        sm=one_of(integers(min_value=0, max_value=13), none()),
        ey=one_of(integers(min_value=2000, max_value=2030), none()),
        em=one_of(integers(min_value=0, max_value=13), none()),
    )
    @settings(max_examples=40)
    def test_analytics_never_errors(self, pid, res, sy, sm, ey, em):
        params = {}
        if pid is not None:
            params['property'] = pid
        if res is not None:
            params['resource_type'] = res
        if sy is not None:
            params['start_year'] = sy
        if sm is not None:
            params['start_month'] = sm
        if ey is not None:
            params['end_year'] = ey
        if em is not None:
            params['end_month'] = em
        resp = self.client.get('/api/analytics/', params)
        assert resp.status_code in (200, 400), f'Got {resp.status_code} for params={params}'

    @given(pid=one_of(integers(min_value=1, max_value=9999), none()))
    @settings(max_examples=20)
    def test_forecast_never_errors(self, pid):
        params = {}
        if pid is not None:
            params['property'] = pid
        resp = self.client.get('/api/analytics/forecast/', params)
        assert resp.status_code in (200, 400, 404), f'Got {resp.status_code}'
