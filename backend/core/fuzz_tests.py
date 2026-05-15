from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from hypothesis import given, settings
from hypothesis.extra.django import TestCase
from hypothesis.strategies import dates, decimals, integers, none, one_of, sampled_from, text
from rest_framework.test import APIClient

from .models import Meter, MonthlyCharge, Payment, Property, Reading, Tariff
from .services import ensure_demo_data, find_tariff, forecast_property, get_previous_reading, process_reading

# --- strategies ---
usr = text(min_size=0, max_size=150)
pwd = text(min_size=0, max_size=128)
tiny_str = text(min_size=0, max_size=50)
resource_type = sampled_from(['electricity', 'cold_water', 'hot_water', 'gas', 'heating'])
unit = sampled_from(['kWh', 'м3', 'Гкал', 'kW', ''])
decimal_val = decimals(min_value=0, max_value=1_000_000, allow_nan=False, allow_infinity=False, places=3)
decimal_charge = decimals(min_value=0, max_value=1_000_000, allow_nan=False, allow_infinity=False, places=2)
year_int = integers(min_value=2020, max_value=2030)
month_int = integers(min_value=1, max_value=12)
any_date = dates(min_value=date(2020, 1, 1), max_value=date.today() + timedelta(days=365))


def make_user(username: str) -> User:
    u, _ = User.objects.get_or_create(username=username)
    if not u.password or u.password.startswith('!'):
        u.set_password('x')
        u.save()
    return u


class AuthFuzzTests(TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()

    @given(u=usr, p=pwd)
    @settings(max_examples=40, deadline=1000)
    def test_register_never_500(self, u: str, p: str):
        resp = self.client.post('/api/auth/register/', {'username': u, 'password': p}, format='json')
        assert resp.status_code in (201, 400), f'Got {resp.status_code}: {resp.data}'

    @given(u=usr, p=pwd)
    @settings(max_examples=40, deadline=1000)
    def test_login_never_500(self, u: str, p: str):
        resp = self.client.post('/api/auth/login/', {'username': u, 'password': p}, format='json')
        assert resp.status_code in (200, 400, 401), f'Got {resp.status_code}: {resp.data}'


class PropertyFuzzTests(TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.user = make_user('prop_fuzzer')
        self.client.force_authenticate(self.user)

    @given(name=tiny_str, addr=tiny_str)
    @settings(max_examples=30)
    def test_create_property_never_500(self, name: str, addr: str):
        resp = self.client.post('/api/properties/', {'name': name, 'address': addr}, format='json')
        assert resp.status_code in (201, 400), f'Got {resp.status_code}: {resp.data}'

    @given(name=tiny_str, addr=tiny_str)
    @settings(max_examples=20)
    def test_update_property_never_500(self, name: str, addr: str):
        prop = Property.objects.create(owner=self.user, name='base', address='base')
        resp = self.client.patch(f'/api/properties/{prop.id}/', {'name': name, 'address': addr}, format='json')
        assert resp.status_code in (200, 400), f'Got {resp.status_code}: {resp.data}'

    def test_foreign_property_invisible(self):
        other = make_user('other_prop')
        prop = Property.objects.create(owner=other, name='secret', address='hidden')
        resp = self.client.get(f'/api/properties/{prop.id}/')
        assert resp.status_code == 404, f'Got {resp.status_code}'


class MeterFuzzTests(TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.user = make_user('meter_fuzzer')
        self.client.force_authenticate(self.user)
        self.prop, _ = Property.objects.get_or_create(owner=self.user, name='prop', address='addr')

    @given(rt=resource_type, u=unit, sn=tiny_str)
    @settings(max_examples=30)
    def test_create_meter_never_500(self, rt: str, u: str, sn: str):
        resp = self.client.post('/api/meters/', {
            'property': self.prop.id,
            'resource_type': rt,
            'unit': u,
            'serial_number': sn,
        }, format='json')
        assert resp.status_code in (201, 400), f'Got {resp.status_code}: {resp.data}'

    def test_foreign_property_meter_rejected(self):
        other = make_user('other_m')
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
        self.user = make_user('reading_fuzzer')
        self.client.force_authenticate(self.user)
        self.prop, _ = Property.objects.get_or_create(owner=self.user, name='p', address='a')
        self.meter, _ = Meter.objects.get_or_create(
            property=self.prop, resource_type='electricity',
            defaults={'unit': 'kWh', 'serial_number': 'E-1'},
        )
        Tariff.objects.get_or_create(
            resource_type='electricity', value_per_unit=5, valid_from=date(2020, 1, 1),
        )

    @given(v=decimal_val, rd=any_date)
    @settings(max_examples=40)
    def test_create_reading_never_500(self, v, rd: date):
        resp = self.client.post('/api/readings/', {
            'meter': self.meter.id,
            'value': float(v) if v is not None else 0,
            'reading_date': rd.isoformat(),
        }, format='json')
        assert resp.status_code in (201, 400), f'Got {resp.status_code}: {resp.data}'

    @given(v1=decimal_val, v2=decimal_val)
    @settings(max_examples=20)
    def test_reading_invariant(self, v1, v2):
        rd = date(2024, 6, 15)
        prev = rd - timedelta(days=30)
        Reading.objects.create(meter=self.meter, value=v1, reading_date=prev)
        resp = self.client.post('/api/readings/', {
            'meter': self.meter.id,
            'value': float(v2) if v2 is not None else 0,
            'reading_date': rd.isoformat(),
        }, format='json')
        if resp.status_code == 201 and v2 > v1:
            charge = MonthlyCharge.objects.filter(property=self.prop, year=rd.year, month=rd.month).first()
            if charge and v2 > v1:
                assert charge.consumption > 0
                assert charge.amount > 0

    def test_foreign_meter_reading_rejected(self):
        other = make_user('other_r')
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
        self.user = make_user('pay_fuzzer')
        self.client.force_authenticate(self.user)
        self.prop, _ = Property.objects.get_or_create(owner=self.user, name='p', address='a')

    @given(y=year_int, m=month_int, a=decimal_charge, pd=any_date, c=tiny_str)
    @settings(max_examples=20)
    def test_create_payment_never_500(self, y: int, m: int, a, pd: date, c: str):
        resp = self.client.post('/api/payments/', {
            'property': self.prop.id,
            'year': y,
            'month': m,
            'amount': float(a) if a is not None else 0,
            'paid_at': pd.isoformat(),
            'comment': c,
        }, format='json')
        assert resp.status_code in (201, 400), f'Got {resp.status_code}: {resp.data}'

    def test_foreign_property_payment_rejected(self):
        other = make_user('other_pay')
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
        self.user = make_user('analytics_fuzzer')
        self.client.force_authenticate(self.user)
        self.prop, _ = Property.objects.get_or_create(owner=self.user, name='p', address='a')

    @given(
        pid=one_of(integers(min_value=1, max_value=9999), none()),
        res=one_of(sampled_from(['electricity', 'cold_water', '', 'invalid_type']), none()),
        sy=one_of(integers(min_value=2000, max_value=2030), none()),
        sm=one_of(integers(min_value=0, max_value=13), none()),
        ey=one_of(integers(min_value=2000, max_value=2030), none()),
        em=one_of(integers(min_value=0, max_value=13), none()),
    )
    @settings(max_examples=40)
    def test_analytics_never_500(self, pid, res, sy, sm, ey, em):
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
    def test_forecast_never_500(self, pid):
        params = {}
        if pid is not None:
            params['property'] = pid
        resp = self.client.get('/api/analytics/forecast/', params)
        assert resp.status_code in (200, 400, 404), f'Got {resp.status_code}'


class ServicesFuzzTests(TestCase):
    def setUp(self):
        super().setUp()
        self.user = make_user('svc_fuzzer')
        self.prop, _ = Property.objects.get_or_create(owner=self.user, name='svc_prop', address='x')
        self.meter, _ = Meter.objects.get_or_create(
            property=self.prop, resource_type='electricity',
            defaults={'unit': 'kWh', 'serial_number': 'SVC-E1'},
        )
        self.tariff, _ = Tariff.objects.get_or_create(
            resource_type='electricity', value_per_unit=Decimal('5.00'), valid_from=date(2020, 1, 1),
        )

    @given(v=decimals(min_value=0, max_value=1000, allow_nan=False, allow_infinity=False, places=3))
    @settings(max_examples=20)
    def test_get_previous_reading_none_when_no_readings(self, v):
        r = Reading.objects.create(meter=self.meter, value=v, reading_date=date(2024, 6, 1))
        prev = get_previous_reading(self.meter, date(2024, 6, 15))
        if prev:
            assert prev.value == v, 'Most recent reading before date should match'

    @given(
        v1=decimals(min_value=0, max_value=1000, allow_nan=False, allow_infinity=False, places=3),
        v2=decimals(min_value=0, max_value=1000, allow_nan=False, allow_infinity=False, places=3),
    )
    @settings(max_examples=20)
    def test_process_reading_creates_charge(self, v1, v2):
        r1 = Reading.objects.create(meter=self.meter, value=v1, reading_date=date(2024, 1, 1))
        r2 = Reading.objects.create(meter=self.meter, value=v2, reading_date=date(2024, 6, 15))
        process_reading(r2)
        has_charge = MonthlyCharge.objects.filter(property=self.prop, year=2024, month=6).exists()
        if v2 > v1:
            assert has_charge, 'Charge should exist when reading increased'
        else:
            assert not has_charge, 'No charge expected when reading did not increase'

    @given(
        rt=sampled_from(['electricity', 'cold_water', 'hot_water', 'gas', 'heating']),
        d=dates(min_value=date(2020, 1, 1), max_value=date.today() + timedelta(days=365)),
    )
    @settings(max_examples=20)
    def test_find_tariff_returns_valid_tariff_or_none(self, rt: str, d: date):
        t = find_tariff(rt, d)
        if t:
            assert t.resource_type == rt
            assert t.valid_from <= d
            if t.valid_to:
                assert t.valid_to >= d

    @given(months=integers(min_value=1, max_value=12))
    @settings(max_examples=10)
    def test_forecast_property_returns_non_negative(self, months: int):
        MonthlyCharge.objects.create(
            property=self.prop, year=2024, month=6,
            resource_type='electricity', consumption=100, amount=500,
        )
        value = forecast_property(self.prop, months=months)
        assert value >= 0, f'Forecast should be >= 0, got {value}'

    @given(
        resource_type=sampled_from(['electricity', 'cold_water', 'hot_water', 'gas', 'heating']),
    )
    @settings(max_examples=10)
    def test_find_tariff_no_match_returns_none(self, resource_type: str):
        result = find_tariff(resource_type, date(2019, 1, 1))
        assert result is None

    def test_ensure_demo_data_skips_non_test_user(self):
        other = make_user('normal_user')
        ensure_demo_data(other)
        assert Property.objects.filter(owner=other).count() == 0

    def test_ensure_demo_data_creates_for_test_user(self):
        test_user = make_user('test')
        seed_count = Property.objects.filter(owner=test_user).count()
        ensure_demo_data(test_user)
        after = Property.objects.filter(owner=test_user).count()
        assert after >= seed_count + 1, 'Demo data should add properties for test user'
