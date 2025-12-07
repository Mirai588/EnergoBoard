from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from django.db import transaction
from django.db.models import Q, Sum

from .models import Meter, MonthlyCharge, Property, Reading, Tariff


def get_previous_reading(meter: Meter, reading_date: date) -> Optional[Reading]:
    return (
        meter.readings.filter(reading_date__lt=reading_date)
        .order_by("-reading_date", "-created_at")
        .first()
    )


def find_tariff(resource_type: str, target_date: date) -> Optional[Tariff]:
    return (
        Tariff.objects.filter(
            resource_type=resource_type,
            valid_from__lte=target_date,
        )
        .filter(Q(valid_to__isnull=True) | Q(valid_to__gte=target_date))
        .order_by("-valid_from")
        .first()
    )


@transaction.atomic
def process_reading(reading: Reading) -> None:
    previous = get_previous_reading(reading.meter, reading.reading_date)
    delta = Decimal("0")
    if previous:
        delta = reading.value - previous.value
        if delta < 0:
            delta = Decimal("0")

    tariff = find_tariff(reading.meter.resource_type, reading.reading_date)
    if tariff is None or delta <= 0:
        return

    year = reading.reading_date.year
    month = reading.reading_date.month

    charge, _ = MonthlyCharge.objects.get_or_create(
        property=reading.meter.property,
        year=year,
        month=month,
        resource_type=reading.meter.resource_type,
        defaults={"consumption": Decimal("0"), "amount": Decimal("0")},
    )

    charge.consumption += delta
    charge.amount += delta * tariff.value_per_unit
    charge.save()


def forecast_property(property_obj: Property, months: int = 3) -> Decimal:
    today = date.today()
    # exclude current month
    charges = (
        MonthlyCharge.objects.filter(property=property_obj)
        .exclude(year=today.year, month=today.month)
        .values("year", "month")
        .annotate(total_amount=Sum("amount"))
        .order_by("-year", "-month")
    )
    totals = [c["total_amount"] for c in charges[:months]]
    if not totals:
        return Decimal("0")
    return sum(totals) / len(totals)


def ensure_demo_data(user) -> None:
    """Create demo data for the test user to simplify onboarding."""

    if user.username != "test":
        return

    if Property.objects.filter(owner=user).exists():
        return

    today = date.today().replace(day=1)

    def month_end(months_back: int) -> date:
        year = today.year
        month = today.month - months_back
        while month <= 0:
            month += 12
            year -= 1
        last_day = monthrange(year, month)[1]
        return date(year, month, last_day)

    def emit_history(meter: Meter, start_value: Decimal, plan: list[Decimal]) -> None:
        value = start_value
        periods = len(plan)
        for idx, delta in enumerate(plan):
            value += delta
            reading_date = month_end(periods - idx)
            reading = Reading.objects.create(
                meter=meter,
                value=value.quantize(Decimal("0.001")),
                reading_date=reading_date,
            )
            process_reading(reading)

    tariff_windows = [
        {
            "valid_from": today.replace(year=today.year - 2, month=1, day=1),
            "valid_to": today.replace(year=today.year - 1, month=8, day=31),
            "values": {
                Meter.ELECTRICITY: Decimal("5.65"),
                Meter.COLD_WATER: Decimal("37.20"),
                Meter.HOT_WATER: Decimal("176.80"),
                Meter.GAS: Decimal("5.95"),
                Meter.HEATING: Decimal("1505.00"),
            },
        },
        {
            "valid_from": today.replace(year=today.year - 1, month=9, day=1),
            "valid_to": None,
            "values": {
                Meter.ELECTRICITY: Decimal("7.10"),
                Meter.COLD_WATER: Decimal("46.30"),
                Meter.HOT_WATER: Decimal("224.10"),
                Meter.GAS: Decimal("8.05"),
                Meter.HEATING: Decimal("1940.00"),
            },
        },
    ]

    for window in tariff_windows:
        for resource, value in window["values"].items():
            Tariff.objects.update_or_create(
                resource_type=resource,
                valid_from=window["valid_from"],
                defaults={"value_per_unit": value, "valid_to": window["valid_to"]},
            )

    scenarios = [
        {
            "name": "Смарт-квартира в Москва-Сити",
            "address": "Москва, наб. Пресненская, 8, башня Восток",
            "meters": [
                {
                    "resource": Meter.ELECTRICITY,
                    "serial": "ELX-93A1",
                    "unit": "кВт·ч",
                    "start": Decimal("2180.4"),
                    "plan": [
                        Decimal("126.4"),
                        Decimal("135.1"),
                        Decimal("140.3"),
                        Decimal("150.8"),
                        Decimal("156.2"),
                        Decimal("164.5"),
                        Decimal("170.1"),
                        Decimal("165.4"),
                    ],
                },
                {
                    "resource": Meter.COLD_WATER,
                    "serial": "CWX-55B1",
                    "unit": "м³",
                    "start": Decimal("48.2"),
                    "plan": [
                        Decimal("3.2"),
                        Decimal("3.8"),
                        Decimal("4.0"),
                        Decimal("4.4"),
                        Decimal("4.7"),
                        Decimal("5.1"),
                        Decimal("4.9"),
                        Decimal("5.4"),
                    ],
                },
                {
                    "resource": Meter.HEATING,
                    "serial": "HTX-31C8",
                    "unit": "Гкал",
                    "start": Decimal("18.5"),
                    "plan": [
                        Decimal("1.6"),
                        Decimal("1.8"),
                        Decimal("1.9"),
                        Decimal("2.3"),
                        Decimal("2.4"),
                        Decimal("2.1"),
                        Decimal("2.0"),
                        Decimal("1.7"),
                    ],
                },
            ],
        },
        {
            "name": "Арт-пространство «Смена»",
            "address": "Екатеринбург, ул. Вайнера, 12 корп. 4",
            "meters": [
                {
                    "resource": Meter.ELECTRICITY,
                    "serial": "ELX-45Q2",
                    "unit": "кВт·ч",
                    "start": Decimal("780.0"),
                    "plan": [
                        Decimal("212.4"),
                        Decimal("220.8"),
                        Decimal("240.7"),
                        Decimal("255.1"),
                        Decimal("248.3"),
                        Decimal("262.9"),
                        Decimal("271.4"),
                        Decimal("268.0"),
                    ],
                },
                {
                    "resource": Meter.GAS,
                    "serial": "GSX-77Z1",
                    "unit": "м³",
                    "start": Decimal("320.5"),
                    "plan": [
                        Decimal("40.1"),
                        Decimal("44.6"),
                        Decimal("48.2"),
                        Decimal("52.7"),
                        Decimal("55.3"),
                        Decimal("58.1"),
                        Decimal("49.8"),
                        Decimal("47.6"),
                    ],
                },
                {
                    "resource": Meter.COLD_WATER,
                    "serial": "CWX-73K4",
                    "unit": "м³",
                    "start": Decimal("102.1"),
                    "plan": [
                        Decimal("6.4"),
                        Decimal("6.8"),
                        Decimal("7.0"),
                        Decimal("7.5"),
                        Decimal("7.8"),
                        Decimal("8.1"),
                        Decimal("8.9"),
                        Decimal("7.7"),
                    ],
                },
            ],
        },
        {
            "name": "Дом на склоне Янган-Тау",
            "address": "Башкортостан, Малояз, горнолыжный склон",
            "meters": [
                {
                    "resource": Meter.ELECTRICITY,
                    "serial": "ELX-12M9",
                    "unit": "кВт·ч",
                    "start": Decimal("410.2"),
                    "plan": [
                        Decimal("82.4"),
                        Decimal("90.7"),
                        Decimal("96.2"),
                        Decimal("101.8"),
                        Decimal("110.4"),
                        Decimal("124.7"),
                        Decimal("118.3"),
                        Decimal("95.6"),
                    ],
                },
                {
                    "resource": Meter.GAS,
                    "serial": "GSX-19D5",
                    "unit": "м³",
                    "start": Decimal("210.7"),
                    "plan": [
                        Decimal("32.1"),
                        Decimal("35.0"),
                        Decimal("36.4"),
                        Decimal("38.7"),
                        Decimal("41.3"),
                        Decimal("43.8"),
                        Decimal("45.9"),
                        Decimal("39.4"),
                    ],
                },
                {
                    "resource": Meter.HOT_WATER,
                    "serial": "HWX-28F7",
                    "unit": "м³",
                    "start": Decimal("34.0"),
                    "plan": [
                        Decimal("2.4"),
                        Decimal("2.6"),
                        Decimal("2.8"),
                        Decimal("3.0"),
                        Decimal("3.3"),
                        Decimal("3.9"),
                        Decimal("3.1"),
                        Decimal("2.7"),
                    ],
                },
            ],
        },
    ]

    for scenario in scenarios:
        property_obj, _ = Property.objects.get_or_create(
            owner=user,
            name=scenario["name"],
            defaults={"address": scenario["address"]},
        )
        property_obj.address = scenario["address"]
        property_obj.save()

        for meter_config in scenario["meters"]:
            meter, _ = Meter.objects.get_or_create(
                property=property_obj,
                resource_type=meter_config["resource"],
                defaults={
                    "serial_number": meter_config["serial"],
                    "unit": meter_config["unit"],
                    "installed_at": date.today() - timedelta(days=420),
                    "is_active": True,
                },
            )

            if meter.readings.exists():
                continue

            emit_history(meter, meter_config["start"], meter_config["plan"])
