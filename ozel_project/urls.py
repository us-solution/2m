"""
URL configuration for ozel_project project.
"""
from django.contrib import admin
from django.urls import path, re_path
from api.views import (
    register_view, login_view, me_view, change_password_view,
    categories_view, drinks_view, drink_detail_view,
    orders_view, order_status_view, my_orders_view, my_points_view,
    admin_stats_view, admin_drinks_view, admin_drink_detail_view,
    offers_view, admin_offers_view, admin_offer_detail_view,
    admin_users_view, admin_user_detail_view, migrate_db_view,
    cashier_page, admin_page, login_page, cart_page, index_page,
    serve_public_file
)

urlpatterns = [
    # Django Admin Panel (renamed to django-admin to avoid conflict with ozel admin)
    path('django-admin/', admin.site.urls),
    
    # Auth APIs
    path('api/auth/register', register_view),
    path('api/auth/login', login_view),
    path('api/auth/me', me_view),
    path('api/auth/change-password', change_password_view),
    
    # Menu & Category APIs
    path('api/categories', categories_view),
    path('api/drinks', drinks_view),
    path('api/drinks/<int:pk>', drink_detail_view),
    
    # Orders APIs
    path('api/orders', orders_view),
    path('api/orders/<int:pk>/status', order_status_view),
    
    # Customer APIs
    path('api/me/orders', my_orders_view),
    path('api/me/points', my_points_view),
    
    # Admin Stats & Drinks APIs
    path('api/admin/stats', admin_stats_view),
    path('api/admin/drinks', admin_drinks_view),
    path('api/admin/drinks/<int:pk>', admin_drink_detail_view),
    
    # Offers APIs
    path('api/offers', offers_view),
    path('api/admin/offers', admin_offers_view),
    path('api/admin/offers/<int:pk>', admin_offer_detail_view),
    
    # Admin Users APIs
    path('api/admin/users', admin_users_view),
    path('api/admin/users/<int:pk>', admin_user_detail_view),
    
    # Database Migration/Seeding API
    path('api/migrate-db', migrate_db_view),
    
    # Frontend Pages
    path('cashier', cashier_page),
    path('cashier/', cashier_page),
    path('admin', admin_page),
    path('admin/', admin_page),
    path('login', login_page),
    path('login/', login_page),
    path('cart.html', cart_page),
    path('', index_page),
    
    # Catch-all regex to serve static files with extensions (e.g. style.css, app.js, imgs/*)
    re_path(r'^(?P<path_name>.+\..+)$', serve_public_file),
]
