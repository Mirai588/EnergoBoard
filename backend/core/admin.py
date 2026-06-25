from django.contrib import admin

from .models import Meter, MonthlyCharge, Payment, Property, Reading, Tariff


@admin.register(Property)
class PropertyAdmin(admin.ModelAdmin):
    list_display = ["name", "address", "owner", "created_at"]
    list_select_related = ["owner"]


@admin.register(Meter)
class MeterAdmin(admin.ModelAdmin):
    list_display = ["resource_type", "serial_number", "property", "is_active"]
    list_select_related = ["property__owner"]
    list_filter = ["resource_type", "is_active"]


@admin.register(Tariff)
class TariffAdmin(admin.ModelAdmin):
    list_display = ["resource_type", "value_per_unit", "valid_from", "valid_to"]
    list_filter = ["resource_type"]


@admin.register(Reading)
class ReadingAdmin(admin.ModelAdmin):
    list_display = ["meter", "value", "reading_date"]
    list_select_related = ["meter__property__owner"]


@admin.register(MonthlyCharge)
class MonthlyChargeAdmin(admin.ModelAdmin):
    list_display = ["property", "year", "month", "resource_type", "consumption", "amount"]
    list_select_related = ["property__owner"]


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ["property", "year", "month", "amount", "paid_at"]
    list_select_related = ["property__owner"]
