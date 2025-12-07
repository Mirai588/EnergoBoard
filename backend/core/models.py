from django.conf import settings
from django.db import models


class Property(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="properties")
    name = models.CharField(max_length=255)
    address = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.name} ({self.address})"


class Meter(models.Model):
    ELECTRICITY = "electricity"
    COLD_WATER = "cold_water"
    HOT_WATER = "hot_water"
    GAS = "gas"
    HEATING = "heating"

    RESOURCE_CHOICES = [
        (ELECTRICITY, "Электричество"),
        (COLD_WATER, "Холодная вода"),
        (HOT_WATER, "Горячая вода"),
        (GAS, "Газ"),
        (HEATING, "Отопление"),
    ]

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="meters")
    resource_type = models.CharField(max_length=50, choices=RESOURCE_CHOICES)
    unit = models.CharField(max_length=20, default="kwh")
    serial_number = models.CharField(max_length=100, blank=True)
    installed_at = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self) -> str:
        return f"{self.get_resource_type_display()} - {self.serial_number or self.id}"


class Tariff(models.Model):
    resource_type = models.CharField(max_length=50, choices=Meter.RESOURCE_CHOICES)
    value_per_unit = models.DecimalField(max_digits=10, decimal_places=2)
    valid_from = models.DateField()
    valid_to = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["-valid_from"]

    def __str__(self) -> str:
        return f"{self.get_resource_type_display()} ({self.valid_from} - {self.valid_to or '∞'})"


class Reading(models.Model):
    meter = models.ForeignKey(Meter, on_delete=models.CASCADE, related_name="readings")
    value = models.DecimalField(max_digits=12, decimal_places=3)
    reading_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-reading_date", "-created_at"]

    def __str__(self) -> str:
        return f"{self.meter} {self.value} ({self.reading_date})"


class MonthlyCharge(models.Model):
    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="monthly_charges")
    year = models.IntegerField()
    month = models.IntegerField()
    resource_type = models.CharField(max_length=50, choices=Meter.RESOURCE_CHOICES)
    consumption = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("property", "year", "month", "resource_type")
        ordering = ["-year", "-month"]

    def __str__(self) -> str:
        return f"{self.property} {self.month}.{self.year} {self.get_resource_type_display()}"


class Payment(models.Model):
    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="payments")
    year = models.IntegerField()
    month = models.IntegerField()
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    paid_at = models.DateField()
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-paid_at", "-created_at"]

    def __str__(self) -> str:
        return f"{self.property} платеж за {self.month}.{self.year}"
