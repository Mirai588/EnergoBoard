import random
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db.models import Sum

from core.models import Meter, MonthlyCharge, Payment, Property, Reading, Tariff
from core.services import process_reading

User = get_user_model()


RESOURCE_UNIT_MAP = {
    Meter.ELECTRICITY: "кВт·ч",
    Meter.COLD_WATER: "м³",
    Meter.HOT_WATER: "м³",
    Meter.GAS: "м³",
    Meter.HEATING: "Гкал",
}


class Command(BaseCommand):
    help = "Создает тестовые данные с пользователем 'test' и реалистичными сценариями"

    def add_arguments(self, parser):
        parser.add_argument("--months", type=int, default=36, help="Глубина истории в месяцах")

    def handle(self, *args, **options):
        months = options["months"]
        user, _ = User.objects.get_or_create(username="test", defaults={"email": "test@example.com"})
        user.set_password("test1234")
        user.save()

        self.stdout.write(self.style.SUCCESS("Пользователь test готов"))

        property_payloads = [
            {
                "name": "Эко-лофт у канала",
                "address": "Санкт-Петербург, Обводный канал, 120",
                "resources": [Meter.ELECTRICITY, Meter.COLD_WATER, Meter.HOT_WATER],
                "usage_factor": Decimal("1.35"),
                "history_months": months + 6,
                "installed_days_ago": 620,
            },
            {
                "name": "Смарт-квартира в Москва-Сити",
                "address": "Москва, наб. Пресненская, 8, башня Федерация",
                "resources": [Meter.ELECTRICITY, Meter.COLD_WATER, Meter.HEATING],
                "usage_factor": Decimal("1.15"),
                "history_months": months,
                "installed_days_ago": 480,
            },
            {
                "name": "Джио-купол на Байкале",
                "address": "Иркутская область, мыс Харамголь",
                "resources": [Meter.ELECTRICITY, Meter.COLD_WATER, Meter.GAS],
                "usage_factor": Decimal("0.85"),
                "history_months": months - 6,
                "installed_days_ago": 540,
            },
            {
                "name": "Ферма «Солнечная долина»",
                "address": "Алтайский край, с. Алтайское, 7",
                "resources": [Meter.ELECTRICITY, Meter.COLD_WATER, Meter.HOT_WATER, Meter.GAS],
                "usage_factor": Decimal("1.65"),
                "history_months": months + 3,
                "installed_days_ago": 780,
            },
            {
                "name": "VR-коворкинг «Север»",
                "address": "Мурманск, ул. Ленинградская, 14",
                "resources": [Meter.ELECTRICITY, Meter.HOT_WATER, Meter.HEATING],
                "usage_factor": Decimal("1.05"),
                "history_months": months,
                "installed_days_ago": 410,
            },
            {
                "name": "Холодный склад у трассы М-4",
                "address": "Ростовская область, 102-й км",
                "resources": [Meter.ELECTRICITY, Meter.COLD_WATER],
                "usage_factor": Decimal("1.5"),
                "history_months": months - 3,
                "installed_days_ago": 690,
            },
        ]

        property_objects = []
        for payload in property_payloads:
            prop, _ = Property.objects.get_or_create(
                owner=user,
                name=payload["name"],
                defaults={"address": payload["address"]},
            )
            prop.address = payload["address"]
            prop.save()
            property_objects.append(
                {
                    "instance": prop,
                    "resources": payload["resources"],
                    "usage_factor": payload.get("usage_factor", Decimal("1")),
                    "history_months": max(payload.get("history_months", months), 12),
                    "installed_days_ago": payload.get("installed_days_ago", 365),
                }
            )

        today = date.today()
        tariff_schedule = [
            {
                "valid_from": today.replace(year=today.year - 3, month=1, day=1),
                "valid_to": today.replace(year=today.year - 2, month=12, day=31),
                "rates": {
                    Meter.ELECTRICITY: Decimal("5.40"),
                    Meter.COLD_WATER: Decimal("38.90"),
                    Meter.HOT_WATER: Decimal("188.10"),
                    Meter.GAS: Decimal("6.10"),
                    Meter.HEATING: Decimal("1600.00"),
                },
            },
            {
                "valid_from": today.replace(year=today.year - 1, month=9, day=1),
                "valid_to": None,
                "rates": {
                    Meter.ELECTRICITY: Decimal("6.95"),
                    Meter.COLD_WATER: Decimal("44.80"),
                    Meter.HOT_WATER: Decimal("219.40"),
                    Meter.GAS: Decimal("7.95"),
                    Meter.HEATING: Decimal("1895.00"),
                },
            },
        ]

        for snapshot in tariff_schedule:
            for resource, value in snapshot["rates"].items():
                Tariff.objects.update_or_create(
                    resource_type=resource,
                    valid_from=snapshot["valid_from"],
                    defaults={"value_per_unit": value, "valid_to": snapshot["valid_to"]},
                )

        meter_sets = {
            Meter.ELECTRICITY: "ELX",
            Meter.COLD_WATER: "CWX",
            Meter.HOT_WATER: "HWX",
            Meter.GAS: "GSX",
            Meter.HEATING: "HTX",
        }

        for profile in property_objects:
            prop = profile["instance"]
            meters = []
            for idx, resource in enumerate(profile["resources"], start=1):
                prefix = meter_sets[resource]
                meter, _ = Meter.objects.get_or_create(
                    property=prop,
                    resource_type=resource,
                    defaults={
                        "unit": RESOURCE_UNIT_MAP[resource],
                        "serial_number": f"{prefix}-{prop.id:02d}-{idx:02d}",
                        "installed_at": date.today() - timedelta(days=profile["installed_days_ago"] + idx * 11),
                        "is_active": True,
                    },
                )
                meters.append(meter)

            for meter in meters:
                if meter.readings.exists():
                    continue
                self._seed_readings_for_meter(meter, profile["history_months"], profile["usage_factor"])

        self.stdout.write(self.style.SUCCESS("История показаний и начислений создана"))

        for profile in property_objects:
            self._ensure_payments(profile["instance"])

        self.stdout.write(self.style.SUCCESS("Платежи созданы"))

    def _monthly_usage(self, resource_type: str, month: int, usage_factor: Decimal) -> Decimal:
        winter = {12, 1, 2}
        summer = {6, 7, 8}
        if resource_type in (Meter.GAS, Meter.HEATING):
            seasonal_multiplier = Decimal("1.55") if month in winter else Decimal("0.65") if month in summer else Decimal("1.05")
        elif resource_type == Meter.ELECTRICITY:
            seasonal_multiplier = Decimal("1.22") if month in winter else Decimal("1.1") if month in summer else Decimal("0.92")
        elif resource_type in (Meter.COLD_WATER, Meter.HOT_WATER):
            seasonal_multiplier = Decimal("1.35") if month in summer else Decimal("0.85") if month in winter else Decimal("1")
        else:
            seasonal_multiplier = Decimal("1")

        base = {
            Meter.ELECTRICITY: Decimal("95"),
            Meter.COLD_WATER: Decimal("7.5"),
            Meter.HOT_WATER: Decimal("5.1"),
            Meter.GAS: Decimal("62"),
            Meter.HEATING: Decimal("1.3"),
        }.get(resource_type, Decimal("12"))

        jitter = Decimal(str(random.uniform(-0.25, 0.3)))
        return (base * seasonal_multiplier * (Decimal("1") + jitter)) * usage_factor

    def _shift_month(self, year: int, month: int, delta: int) -> tuple[int, int]:
        new_month_index = month + delta - 1
        new_year = year + new_month_index // 12
        new_month = (new_month_index % 12) + 1
        return new_year, new_month

    def _seed_readings_for_meter(self, meter: Meter, months: int, usage_factor: Decimal) -> None:
        today = date.today().replace(day=1)
        start_year, start_month = self._shift_month(today.year, today.month, -months)
        reading_value = (Decimal(random.uniform(18, 140)) * usage_factor).quantize(Decimal("0.001"))

        current_year = start_year
        current_month = start_month
        for _ in range(months):
            monthly_delta = self._monthly_usage(meter.resource_type, current_month, usage_factor)
            reading_value += monthly_delta
            last_day = monthrange(current_year, current_month)[1]
            reading_date = date(current_year, current_month, last_day)
            reading = Reading.objects.create(
                meter=meter,
                value=reading_value.quantize(Decimal("0.001")),
                reading_date=reading_date,
            )
            process_reading(reading)

            current_year, current_month = self._shift_month(current_year, current_month, 1)

    def _ensure_payments(self, property_obj: Property) -> None:
        charges = (
            MonthlyCharge.objects.filter(property=property_obj)
            .values("year", "month")
            .annotate(total_amount=Sum("amount"))
        )
        for charge in charges:
            payment_date = date(charge["year"], charge["month"], 10)
            Payment.objects.get_or_create(
                property=property_obj,
                year=charge["year"],
                month=charge["month"],
                defaults={
                    "amount": Decimal(charge["total_amount"]) * Decimal("0.95"),
                    "paid_at": payment_date,
                    "comment": "Автогенерация демо-платежей",
                },
            )
