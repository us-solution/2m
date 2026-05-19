from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, Category, Drink, Order, PointsLog, Offer

class UserAdmin(BaseUserAdmin):
    fieldsets = BaseUserAdmin.fieldsets + (
        (None, {'fields': ('phone', 'role', 'points', 'total_spent', 'name')}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        (None, {'fields': ('phone', 'role', 'points', 'total_spent', 'name')}),
    )
    list_display = ('phone', 'name', 'role', 'points', 'total_spent', 'is_staff')
    search_fields = ('phone', 'name', 'email')
    ordering = ('-date_joined',)

class DrinkAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'price', 'temperature', 'is_featured', 'is_available')
    list_filter = ('category', 'temperature', 'is_featured', 'is_available')
    search_fields = ('name', 'name_ar', 'description')

class OrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'table_number', 'total_price', 'status', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('table_number', 'id')
    ordering = ('-created_at',)

admin.site.register(User, UserAdmin)
admin.site.register(Category)
admin.site.register(Drink, DrinkAdmin)
admin.site.register(Order, OrderAdmin)
admin.site.register(PointsLog)
admin.site.register(Offer)
