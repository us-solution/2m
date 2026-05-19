from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    phone = models.CharField(max_length=20, unique=True)
    role = models.CharField(max_length=20, default='customer') # customer, cashier, admin
    points = models.IntegerField(default=0)
    total_spent = models.DecimalField(max_digits=10, decimal_places=2, default=0.0)
    name = models.CharField(max_length=150, blank=True)

    def save(self, *args, **kwargs):
        if not self.username:
            self.username = self.phone
        super().save(*args, **kwargs)

class Category(models.Model):
    name = models.CharField(max_length=100)
    name_ar = models.CharField(max_length=100)
    icon = models.CharField(max_length=100, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    sort_order = models.IntegerField(default=0)

    class Meta:
        verbose_name_plural = "Categories"

    def __str__(self):
        return self.name

class Drink(models.Model):
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='drinks')
    name = models.CharField(max_length=100)
    name_ar = models.CharField(max_length=100, blank=True, null=True)
    tagline = models.CharField(max_length=200, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    ingredients = models.TextField(blank=True, null=True)
    preparation = models.TextField(blank=True, default='')
    price = models.DecimalField(max_digits=8, decimal_places=2)
    calories = models.IntegerField(blank=True, null=True)
    serving_size = models.CharField(max_length=50, blank=True, null=True)
    temperature = models.CharField(max_length=20, default='hot')
    image_emoji = models.CharField(max_length=255, default='imgs/espresso.png')
    is_featured = models.IntegerField(default=0) # 0 or 1
    is_available = models.IntegerField(default=1) # 0 or 1

    def __str__(self):
        return self.name

class Order(models.Model):
    user = models.ForeignKey(User, on_delete=models.SET_NULL, blank=True, null=True, related_name='orders')
    table_number = models.CharField(max_length=50)
    items = models.TextField() # stores JSON string
    total_price = models.DecimalField(max_digits=10, decimal_places=2)
    points_earned = models.IntegerField(default=0)
    status = models.CharField(max_length=50, default='pending') # pending, ready, served, cancelled
    notes = models.TextField(blank=True, default='')
    cashier = models.ForeignKey(User, on_delete=models.SET_NULL, blank=True, null=True, related_name='processed_orders')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Order #{self.id} - Table {self.table_number}"

class PointsLog(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='points_logs')
    points = models.IntegerField()
    reason = models.CharField(max_length=255, blank=True, null=True)
    order = models.ForeignKey(Order, on_delete=models.SET_NULL, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.phone} - {self.points} points"

class Offer(models.Model):
    drink = models.ForeignKey(Drink, on_delete=models.CASCADE, related_name='offers')
    discount_percent = models.IntegerField()
    expires_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Offer: {self.drink.name} - {self.discount_percent}%"
