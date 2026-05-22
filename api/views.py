import json
import jwt
import datetime
import os
from django.conf import settings
from django.db.models import Sum, Count, Q
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse, HttpResponse, Http404, FileResponse
from django.contrib.auth.hashers import make_password
from django.shortcuts import render

from .models import User, Category, Drink, Order, PointsLog, Offer

JWT_SECRET = getattr(settings, 'SECRET_KEY', 'ozel_cafe_secret_2025')

def parse_json(request):
    try:
        return json.loads(request.body.decode('utf-8'))
    except:
        return {}

def generate_token(user):
    payload = {
        'id': user.id,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=30)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')

def get_authenticated_user(request):
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None
    token = auth_header.split(' ')[1]
    try:
        decoded = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        return User.objects.filter(id=decoded.get('id')).first()
    except:
        return None

def auth_required(required_role=None):
    def decorator(view_func):
        def _wrapped_view(request, *args, **kwargs):
            user = get_authenticated_user(request)
            if not user:
                return JsonResponse({'error': 'Unauthorized'}, status=401)
            
            if required_role:
                hierarchy = {'customer': 0, 'cashier': 1, 'admin': 2}
                user_role = user.role if user.role in hierarchy else 'customer'
                req_role = required_role if required_role in hierarchy else 'customer'
                if hierarchy[user_role] < hierarchy[req_role]:
                    return JsonResponse({'error': 'Forbidden'}, status=403)
            
            request.user = user
            return view_func(request, *args, **kwargs)
        return _wrapped_view
    return decorator

# ── Manual Serializers ─────────────────────────────────────────────
def serialize_user(user):
    return {
        'id': user.id,
        'name': user.name,
        'phone': user.phone,
        'role': user.role,
        'points': user.points,
        'total_spent': float(user.total_spent),
        'date_joined': user.date_joined.isoformat()
    }

def serialize_category(c):
    return {
        'id': c.id,
        'name': c.name,
        'name_ar': c.name_ar,
        'icon': c.icon,
        'description': c.description,
        'sort_order': c.sort_order
    }

def serialize_drink(d):
    return {
        'id': d.id,
        'category_id': d.category.id,
        'category_name': d.category.name,
        'category_name_ar': d.category.name_ar,
        'category_icon': d.category.icon,
        'name': d.name,
        'name_ar': d.name_ar,
        'tagline': d.tagline,
        'description': d.description,
        'ingredients': d.ingredients,
        'preparation': d.preparation,
        'price': float(d.price),
        'calories': d.calories,
        'serving_size': d.serving_size,
        'temperature': d.temperature,
        'image_emoji': d.image_emoji,
        'is_featured': d.is_featured,
        'is_available': d.is_available
    }

def serialize_order(o):
    return {
        'id': o.id,
        'user_id': o.user.id if o.user else None,
        'customer_name': o.user.name if o.user else None,
        'customer_phone': o.user.phone if o.user else None,
        'table_number': o.table_number,
        'items': o.items,
        'total_price': float(o.total_price),
        'points_earned': o.points_earned,
        'status': o.status,
        'notes': o.notes,
        'cashier_id': o.cashier.id if o.cashier else None,
        'created_at': o.created_at.isoformat(),
        'updated_at': o.updated_at.isoformat()
    }

def serialize_points_log(l):
    return {
        'id': l.id,
        'user_id': l.user.id,
        'points': l.points,
        'reason': l.reason,
        'order_id': l.order.id if l.order else None,
        'created_at': l.created_at.isoformat()
    }

def serialize_offer(o):
    return {
        'id': o.id,
        'drink_id': o.drink.id,
        'discount_percent': o.discount_percent,
        'expires_at': o.expires_at.isoformat() if o.expires_at else None,
        'created_at': o.created_at.isoformat(),
        'name': o.drink.name,
        'name_ar': o.drink.name_ar,
        'price': float(o.drink.price),
        'image_emoji': o.drink.image_emoji
    }

# ── API Views ──────────────────────────────────────────────────────
@csrf_exempt
def register_view(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    data = parse_json(request)
    name = data.get('name')
    phone = data.get('phone')
    password = data.get('password')
    if not name or not phone or not password:
        return JsonResponse({'error': 'All fields required'}, status=400)
    
    if User.objects.filter(phone=phone).exists():
        return JsonResponse({'error': 'Phone already registered'}, status=409)
    
    try:
        user = User.objects.create(
            name=name,
            phone=phone,
            password=make_password(password),
            role='customer'
        )
        token = generate_token(user)
        return JsonResponse({
            'token': token,
            'user': {
                'id': user.id,
                'name': user.name,
                'phone': user.phone,
                'role': user.role,
                'points': user.points
            }
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
def login_view(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    data = parse_json(request)
    phone = data.get('phone')
    password = data.get('password')
    if not phone or not password:
        return JsonResponse({'error': 'Missing phone or password'}, status=400)
    
    user = User.objects.filter(phone=phone).first()
    if not user or not user.check_password(password):
        return JsonResponse({'error': 'Invalid credentials'}, status=401)
    
    token = generate_token(user)
    return JsonResponse({
        'token': token,
        'user': {
            'id': user.id,
            'name': user.name,
            'phone': user.phone,
            'role': user.role,
            'points': user.points
        }
    })

@csrf_exempt
@auth_required()
def me_view(request):
    if request.method == 'GET':
        return JsonResponse(serialize_user(request.user))
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
@auth_required()
def change_password_view(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    data = parse_json(request)
    old_password = data.get('oldPassword')
    new_password = data.get('newPassword')
    if not old_password or not new_password:
        return JsonResponse({'error': 'Please enter old and new passwords'}, status=400)
    
    if not request.user.check_password(old_password):
        return JsonResponse({'error': 'Incorrect old password'}, status=401)
    
    request.user.password = make_password(new_password)
    request.user.save()
    return JsonResponse({'success': True, 'message': 'Password changed successfully'})

@csrf_exempt
def categories_view(request):
    if request.method == 'GET':
        cats = Category.objects.all().order_by('sort_order', 'id')
        return JsonResponse([serialize_category(c) for c in cats], safe=False)
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
def drinks_view(request):
    if request.method == 'GET':
        category_id = request.GET.get('category')
        featured = request.GET.get('featured')
        
        query = Drink.objects.filter(is_available=1)
        if category_id:
            query = query.filter(category_id=category_id)
        if featured == '1':
            query = query.filter(is_featured=1)
            
        drinks = query.select_related('category')
        return JsonResponse([serialize_drink(d) for d in drinks], safe=False)
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
def drink_detail_view(request, pk):
    if request.method == 'GET':
        try:
            d = Drink.objects.select_related('category').get(id=pk)
            return JsonResponse(serialize_drink(d))
        except Drink.DoesNotExist:
            return JsonResponse({'error': 'Not found'}, status=404)
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
def orders_view(request):
    if request.method == 'POST':
        data = parse_json(request)
        table_number = data.get('table_number')
        items = data.get('items')
        total_price = data.get('total_price')
        notes = data.get('notes', '')
        
        if table_number is None or not items or not total_price:
            return JsonResponse({'error': 'Missing fields'}, status=400)
            
        user = get_authenticated_user(request)
        
        try:
            points_earned = int(float(total_price))
            items_str = json.dumps(items) if not isinstance(items, str) else items
            
            order = Order.objects.create(
                user=user,
                table_number=str(table_number),
                items=items_str,
                total_price=total_price,
                points_earned=points_earned,
                notes=notes
            )
            
            if user:
                user.points += points_earned
                user.total_spent = float(user.total_spent) + float(total_price)
                user.save()
                PointsLog.objects.create(
                    user=user,
                    points=points_earned,
                    reason=f'Order #{order.id}',
                    order=order
                )
                
            return JsonResponse({
                'success': True,
                'order_id': order.id,
                'points_earned': points_earned
            })
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
            
    elif request.method == 'GET':
        user = get_authenticated_user(request)
        if not user or user.role not in ['cashier', 'admin']:
            return JsonResponse({'error': 'Forbidden'}, status=403)
            
        status = request.GET.get('status')
        query = Order.objects.all().order_by('-created_at')
        if status:
            query = query.filter(status=status)
            
        orders = query.select_related('user')
        return JsonResponse([serialize_order(o) for o in orders], safe=False)
        
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
@auth_required('cashier')
def order_status_view(request, pk):
    if request.method == 'PATCH':
        data = parse_json(request)
        status = data.get('status')
        if not status:
            return JsonResponse({'error': 'Missing status'}, status=400)
            
        try:
            order = Order.objects.get(id=pk)
            order.status = status
            order.cashier = request.user
            order.save()
            return JsonResponse({'success': True})
        except Order.DoesNotExist:
            return JsonResponse({'error': 'Not found'}, status=404)
            
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
@auth_required()
def my_orders_view(request):
    if request.method == 'GET':
        orders = Order.objects.filter(user=request.user).order_by('-created_at')[:20]
        return JsonResponse([serialize_order(o) for o in orders], safe=False)
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
@auth_required()
def my_points_view(request):
    if request.method == 'GET':
        logs = PointsLog.objects.filter(user=request.user).order_by('-created_at')
        return JsonResponse({
            'points': request.user.points,
            'total_spent': float(request.user.total_spent),
            'log': [serialize_points_log(l) for l in logs]
        })
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
@auth_required('admin')
def admin_stats_view(request):
    if request.method == 'GET':
        today = timezone.localtime(timezone.now()).date()
        today_start = timezone.make_aware(datetime.datetime.combine(today, datetime.time.min))
        
        first_day_of_month = today.replace(day=1)
        month_start = timezone.make_aware(datetime.datetime.combine(first_day_of_month, datetime.time.min))
        
        total_orders = Order.objects.count()
        today_orders = Order.objects.filter(created_at__gte=today_start).count()
        
        today_revenue = Order.objects.filter(
            created_at__gte=today_start
        ).exclude(status='cancelled').aggregate(total=Sum('total_price'))['total'] or 0.0
        
        monthly_revenue = Order.objects.filter(
            created_at__gte=month_start
        ).exclude(status='cancelled').aggregate(total=Sum('total_price'))['total'] or 0.0
        
        total_revenue = Order.objects.exclude(status='cancelled').aggregate(total=Sum('total_price'))['total'] or 0.0
        
        total_customers = User.objects.filter(role='customer').count()
        pending_orders = Order.objects.filter(status='pending').count()
        
        cashier_stats_aggr = Order.objects.filter(
            created_at__gte=today_start,
            cashier__isnull=False
        ).exclude(status='cancelled').values('cashier').annotate(
            order_count=Count('id'),
            total_rev=Sum('total_price')
        )
        
        cashier_stats = []
        for item in cashier_stats_aggr:
            cashier_user = User.objects.filter(id=item['cashier']).first()
            cashier_stats.append({
                'cashier_name': cashier_user.name if cashier_user else 'Unknown',
                'order_count': item['order_count'],
                'total_rev': float(item['total_rev'] or 0.0)
            })
            
        return JsonResponse({
            'total_orders': total_orders,
            'today_orders': today_orders,
            'today_revenue': float(today_revenue),
            'monthly_revenue': float(monthly_revenue),
            'total_revenue': float(total_revenue),
            'total_customers': total_customers,
            'pending_orders': pending_orders,
            'cashier_stats': cashier_stats
        })
        
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
@auth_required('admin')
def admin_drinks_view(request):
    if request.method == 'GET':
        drinks = Drink.objects.all().select_related('category')
        sorted_drinks = sorted(
            drinks,
            key=lambda d: (d.category.sort_order, d.id)
        )
        return JsonResponse([{
            **serialize_drink(d),
            'cat_name': d.category.name_ar
        } for d in sorted_drinks], safe=False)
        
    elif request.method == 'POST':
        data = parse_json(request)
        try:
            category = Category.objects.get(id=data.get('category_id'))
            d = Drink.objects.create(
                category=category,
                name=data.get('name'),
                name_ar=data.get('name_ar'),
                tagline=data.get('tagline', 'An unforgettable experience'),
                description=data.get('description'),
                ingredients=data.get('ingredients'),
                preparation=data.get('preparation', ''),
                price=data.get('price'),
                calories=data.get('calories'),
                serving_size=data.get('serving_size'),
                temperature=data.get('temperature', 'hot'),
                image_emoji=data.get('image_emoji', 'imgs/espresso.png'),
                is_featured=int(data.get('is_featured', 0)),
                is_available=int(data.get('is_available', 1))
            )
            return JsonResponse({'success': True, 'id': d.id})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)
            
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
@auth_required('admin')
def admin_drink_detail_view(request, pk):
    if request.method == 'PATCH':
        data = parse_json(request)
        try:
            d = Drink.objects.get(id=pk)
            if 'category_id' in data:
                d.category = Category.objects.get(id=data['category_id'])
            if 'name' in data: d.name = data['name']
            if 'name_ar' in data: d.name_ar = data['name_ar']
            if 'tagline' in data: d.tagline = data['tagline']
            if 'description' in data: d.description = data['description']
            if 'ingredients' in data: d.ingredients = data['ingredients']
            if 'preparation' in data: d.preparation = data['preparation']
            if 'price' in data: d.price = data['price']
            if 'calories' in data: d.calories = data['calories']
            if 'serving_size' in data: d.serving_size = data['serving_size']
            if 'temperature' in data: d.temperature = data['temperature']
            if 'image_emoji' in data: d.image_emoji = data['image_emoji']
            if 'is_featured' in data: d.is_featured = int(data['is_featured'])
            if 'is_available' in data: d.is_available = int(data['is_available'])
            d.save()
            return JsonResponse({'success': True})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)
            
    elif request.method == 'DELETE':
        try:
            d = Drink.objects.get(id=pk)
            d.delete()
            return JsonResponse({'success': True})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)
            
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
def offers_view(request):
    if request.method == 'GET':
        now = timezone.now()
        offers = Offer.objects.filter(
            Q(expires_at__isnull=True) | Q(expires_at__gt=now)
        ).select_related('drink')
        
        active = [o for o in offers if o.drink and o.drink.is_available == 1]
        return JsonResponse([serialize_offer(o) for o in active], safe=False)
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
@auth_required('admin')
def admin_offers_view(request):
    if request.method == 'POST':
        data = parse_json(request)
        try:
            drink = Drink.objects.get(id=data.get('drink_id'))
            expires_at = data.get('expires_at')
            if expires_at:
                expires_at = timezone.parse_datetime(expires_at)
            else:
                expires_at = None
                
            o = Offer.objects.create(
                drink=drink,
                discount_percent=int(data.get('discount_percent')),
                expires_at=expires_at
            )
            return JsonResponse({'success': True, 'id': o.id})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
@auth_required('admin')
def admin_offer_detail_view(request, pk):
    if request.method == 'DELETE':
        try:
            o = Offer.objects.get(id=pk)
            o.delete()
            return JsonResponse({'success': True})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
@auth_required('admin')
def admin_users_view(request):
    if request.method == 'GET':
        users = User.objects.all().order_by('-date_joined')
        return JsonResponse([serialize_user(u) for u in users], safe=False)
        
    elif request.method == 'POST':
        data = parse_json(request)
        name = data.get('name')
        phone = data.get('phone')
        password = data.get('password')
        role = data.get('role', 'customer')
        points = data.get('points', 0)
        
        if not name or not phone or not password:
            return JsonResponse({'error': 'Missing fields'}, status=400)
            
        if User.objects.filter(phone=phone).exists():
            return JsonResponse({'error': 'Phone already registered'}, status=409)
            
        try:
            u = User.objects.create(
                name=name,
                phone=phone,
                password=make_password(password),
                role=role,
                points=int(points)
            )
            return JsonResponse({'success': True, 'id': u.id})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)
            
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
@auth_required('admin')
def admin_user_detail_view(request, pk):
    if request.method == 'PATCH':
        data = parse_json(request)
        try:
            u = User.objects.get(id=pk)
            if 'name' in data: u.name = data['name']
            if 'phone' in data: u.phone = data['phone']
            if 'role' in data: u.role = data['role']
            if 'points' in data: u.points = int(data['points'])
            if 'password' in data:
                u.password = make_password(data['password'])
            u.save()
            return JsonResponse({'success': True})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)
            
    elif request.method == 'DELETE':
        if str(pk) == str(request.user.id):
            return JsonResponse({'error': 'Cannot delete yourself'}, status=400)
        try:
            u = User.objects.get(id=pk)
            u.delete()
            return JsonResponse({'success': True})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)
            
    return JsonResponse({'error': 'Method not allowed'}, status=405)

# ── Migrations / Seeding View ──────────────────────────────────────
@csrf_exempt
def migrate_db_view(request):
    if request.GET.get('secret') != 'ozel':
        return HttpResponse('Forbidden', status=403)
        
    try:
        C = [
          { 'name':'Turkish & French',           'ar':'تركي وفرنسي',            'icon':'',  'img':'imgs/turkish.png',   'desc':'أصالة المذاق الكلاسيكي' },
          { 'name':'Espresso Rituals',           'ar':'طقوس الإسبريسو',          'icon':'',  'img':'imgs/espresso.png',  'desc':'مشروبات الإسبريسو الغنية' },
          { 'name':'Refresh Juice',              'ar':'عصائر منعشة',             'icon':'',  'img':'imgs/juice.png',     'desc':'فواكه طازجة ممتازة' },
          { 'name':'Smooth Escapes',             'ar':'سموذي',                   'icon':'',  'img':'imgs/smoothie.png',  'desc':'اختر الفاكهة المفضلة' },
          { 'name':'Frappe Rituals',             'ar':'فرابيه',                  'icon':'',  'img':'imgs/frappe.png',    'desc':'مشروبات فرابيه مثلجة' },
          { 'name':'Mojito & Sun Rise',          'ar':'موهيتو وسبارك',           'icon':'',  'img':'imgs/mojito.png',    'desc':'ألوان ومذاقات منعشة' },
          { 'name':'Hot & More',                 'ar':'مشروبات ساخنة',           'icon':'',  'img':'imgs/hotchoc.png',   'desc':'دفء ومشروبات كلاسيكية' },
          { 'name':'Milk Shaken Rituals',        'ar':'ميلك شيك',               'icon':'',  'img':'imgs/milkshake.png', 'desc':'مزيج الحليب والآيس كريم' },
          { 'name':'Pure Classics Ice Coffee',   'ar':'قهوة مثلجة كلاسيكية',   'icon':'',  'img':'imgs/icedcoffee.png','desc':'انتعاش القهوة الباردة' },
          { 'name':'Ice Cream',                  'ar':'آيس كريم',               'icon':'',  'img':'imgs/icecream.png',  'desc':'حلوى الآيس كريم الفاخرة' },
          { 'name':'Desserts',                   'ar':'حلويات',                 'icon':'',  'img':'imgs/desserts.png',  'desc':'وافل وبان كيك وأكثر' },
        ]

        drinks = [
          [0,'Turkish Coffee','قهوة تركية',25,'hot','imgs/turkish.png',0],
          [0,'French Coffee','قهوة فرنسية',30,'hot','imgs/turkish.png',0],
          [0,'Hazelnut French Coffee','فرنسي بالبندق',35,'hot','imgs/turkish.png',1],
          [1,'Espresso Single','إسبريسو سينجل',30,'hot','imgs/espresso.png',0],
          [1,'Espresso Double','إسبريسو دبل',35,'hot','imgs/espresso.png',0],
          [1,'Macchiato Single','ماكياتو سينجل',35,'hot','imgs/espresso.png',0],
          [1,'Macchiato Double','ماكياتو دبل',40,'hot','imgs/espresso.png',0],
          [1,'Honey Lavender Latte','لاتيه عسل لافندر',50,'hot','imgs/latte.png',1],
          [1,'Beet Root Latte','لاتيه البنجر',50,'hot','imgs/latte.png',1],
          [1,'Americano Long','أمريكانو لونج',35,'hot','imgs/espresso.png',0],
          [1,'Flat White','فلات وايت',40,'hot','imgs/latte.png',0],
          [1,'Corto','كورتو',40,'hot','imgs/espresso.png',0],
          [1,'Piccolo','بيكولو',40,'hot','imgs/latte.png',0],
          [1,'Café Latte','كافيه لاتيه',40,'hot','imgs/latte.png',0],
          [1,'Cappuccino','كابتشينو',40,'hot','imgs/latte.png',0],
          [1,'Biscoff Espresso','إسبريسو بيسكوف',50,'hot','imgs/latte.png',1],
          [1,'Affogato Espresso','أفوكاتو',55,'hot','imgs/espresso.png',1],
          [1,'Smoked Rosemary Corto','كورتو روزماري مدخن',55,'hot','imgs/espresso.png',1],
          [1,'Mocha Latte','موكا لاتيه',45,'hot','imgs/latte.png',0],
          [1,'Spanish Latte','لاتيه إسباني',45,'hot','imgs/latte.png',1],
          [1,'Marocchino','ماروكينو',45,'hot','imgs/latte.png',0],
          [2,'Orange Juice','عصير برتقال',40,'cold','imgs/juice.png',0],
          [2,'Mango Juice','عصير مانجو',45,'cold','imgs/juice.png',0],
          [2,'Strawberry Juice','عصير فراولة',45,'cold','imgs/juice.png',0],
          [2,'Guava Juice','عصير جوافة',40,'cold','imgs/juice.png',0],
          [2,'Watermelon Juice','عصير بطيخ',40,'cold','imgs/juice.png',0],
          [2,'Kiwi Juice','عصير كيوي',45,'cold','imgs/juice.png',0],
          [2,'Avocado Juice','عصير أفوكادو',50,'cold','imgs/juice.png',1],
          [2,'Lemon Mint','ليمون نعناع',35,'cold','imgs/juice.png',0],
          [3,'Custom Smoothie','سموذي مخصص',50,'cold','imgs/smoothie.png',1],
          [4,'Lotus Blast','لوتس بلاست',55,'cold','imgs/frappe.png',1],
          [4,'White Velvet','وايت فيلفيت',55,'cold','imgs/frappe.png',0],
          [4,'Candy Cloud','كاندي كلاود',55,'cold','imgs/frappe.png',0],
          [4,'Blueberry Muffin','بلوبيري مافن',55,'cold','imgs/frappe.png',1],
          [4,'Mid Night Mocha','مد نايت موكا',55,'cold','imgs/frappe.png',1],
          [4,'Caramel Swirl','كراميل سويرل',55,'cold','imgs/frappe.png',0],
          [4,'Coffee Frappe','فرابيه قهوة',50,'cold','imgs/frappe.png',0],
          [5,'Sun Rise','صن رايز',45,'cold','imgs/mojito.png',1],
          [5,'Ruby Fizz','روبي فيز',45,'cold','imgs/mojito.png',0],
          [5,'Blue Mist','بلو ميست',45,'cold','imgs/mojito.png',0],
          [5,'Lavender Lemon','لافندر ليمون',45,'cold','imgs/mojito.png',1],
          [5,'Lava Lamp','لافا لامب',50,'cold','imgs/mojito.png',1],
          [5,'Rose Garden','روز جاردن',45,'cold','imgs/mojito.png',0],
          [5,'Berry Passion Spritz','بيري باشن سبريتز',50,'cold','imgs/mojito.png',1],
          [5,'Black Berry Wild Cherry Cream','بلاك بيري وايلد شيري',55,'cold','imgs/mojito.png',0],
          [5,'Coffee Mojito','موهيتو قهوة',45,'cold','imgs/mojito.png',1],
          [5,'Passion Fire','باشن فاير',50,'cold','imgs/mojito.png',0],
          [5,'Blue Lagoon Mojito','بلو لاجون موهيتو',45,'cold','imgs/mojito.png',0],
          [5,'Summer Berry','سمر بيري',45,'cold','imgs/mojito.png',0],
          [5,'Redbull Coconut Breeze','ريد بول جوز هند',60,'cold','imgs/mojito.png',1],
          [5,'Classic Energy Mojito','موهيتو إنيرجي',60,'cold','imgs/mojito.png',0],
          [5,'Berry Energizer','بيري إنيرجايزر',60,'cold','imgs/mojito.png',0],
          [5,'Tropic Bull','تروبيك بول',60,'cold','imgs/mojito.png',0],
          [5,'Original Mojito','موهيتو أصلي',40,'cold','imgs/mojito.png',0],
          [5,'Sparkling Diamonds','سباركلينج دايموندز',50,'cold','imgs/mojito.png',1],
          [5,'Vimto Espresso Fizz','فيمتو إسبريسو فيز',50,'cold','imgs/mojito.png',1],
          [6,'Classic Milk Hot Chocolate','شوكولاتة حليب',45,'hot','imgs/hotchoc.png',0],
          [6,'Rich Dark Hot Chocolate','شوكولاتة داكنة',50,'hot','imgs/hotchoc.png',1],
          [6,'Ferrero Rocher Hot Chocolate','شوكولاتة روشيه',60,'hot','imgs/hotchoc.png',1],
          [6,'Original Spiced Cider','سايدر بالتوابل',40,'hot','imgs/hotchoc.png',0],
          [6,'Sahlab','سحلب',45,'hot','imgs/hotchoc.png',1],
          [6,'Black Tea & Green','شاي أسود وأخضر',20,'hot','imgs/hotchoc.png',0],
          [6,'Karak Tea','شاي كرك',30,'hot','imgs/hotchoc.png',0],
          [6,'London Fog Tea','لندن فوج تي',40,'hot','imgs/hotchoc.png',1],
          [6,'Hot Biscoff Lotus','بيسكوف لوتس ساخن',50,'hot','imgs/hotchoc.png',1],
          [6,'Hot Milky Oreo','أوريو حليب ساخن',50,'hot','imgs/hotchoc.png',0],
          [6,'Nescafe','نسكافيه',25,'hot','imgs/espresso.png',0],
          [6,'Hot Matcha','ماتشا ساخنة',45,'hot','imgs/latte.png',1],
          [7,'Classic Vanilla','فانيليا كلاسيك',45,'cold','imgs/milkshake.png',0],
          [7,'Rich Chocolate','شوكولاتة غنية',45,'cold','imgs/milkshake.png',0],
          [7,'Lotus Biscoff Lava','لوتس لافا',55,'cold','imgs/milkshake.png',1],
          [7,'Ferrero Rocher Luxe','روشيه لوكس',60,'cold','imgs/milkshake.png',1],
          [7,'Oreo Milk Crunch','أوريو كرانش',50,'cold','imgs/milkshake.png',0],
          [7,'Milk Shake Fruit Rituals','ميلك شيك فاكهة',55,'cold','imgs/milkshake.png',0],
          [7,'Tiramisu Chill','تيراميسو تشيل',55,'cold','imgs/milkshake.png',1],
          [7,'BlueBerry Shaken','بلوبيري شيكن',50,'cold','imgs/milkshake.png',0],
          [7,'Dark Choc & Date','شوكولاتة داكنة وتمر',55,'cold','imgs/milkshake.png',1],
          [8,'Ice Latte','آيس لاتيه',45,'cold','imgs/icedcoffee.png',0],
          [8,'Ice Spanish Latte','آيس لاتيه إسباني',50,'cold','imgs/icedcoffee.png',0],
          [8,'Cold Brew','كولد برو',45,'cold','imgs/icedcoffee.png',1],
          [8,'Iced Cracking Latte','كراكينج لاتيه',55,'cold','imgs/icedcoffee.png',1],
          [8,'Charcoal BlackBerry Latte','لاتيه فحم وبلاك بيري',55,'cold','imgs/icedcoffee.png',1],
          [8,'Rose Coconut Cold Brew','ورد وجوز هند كولد برو',50,'cold','imgs/icedcoffee.png',1],
          [8,'Camp Fire Mocha','كامب فاير موكا',55,'cold','imgs/icedcoffee.png',1],
          [8,'Iced Mid Night Mocha','آيس مد نايت موكا',55,'cold','imgs/icedcoffee.png',0],
          [8,'Iced Matcha Latte','آيس ماتشا لاتيه',50,'cold','imgs/icedcoffee.png',1],
          [9,'Mango Sorbet','سوربيه مانجو',35,'cold','imgs/icecream.png',0],
          [9,'Rocher Overload','روشيه أوفرلود',45,'cold','imgs/icecream.png',1],
          [9,'Strawberry Ice Cream','آيس كريم فراولة',35,'cold','imgs/icecream.png',0],
          [9,'Maple Walnut','مابل والنت',40,'cold','imgs/icecream.png',0],
          [9,'Flight Boards','فلايت بوردز',50,'cold','imgs/icecream.png',1],
          [9,'Flower Pot','فلاور بوت',45,'cold','imgs/icecream.png',1],
          [9,'Chocolate Ice Cream','آيس كريم شوكولاتة',35,'cold','imgs/icecream.png',0],
          [10,'Date Me! Waffle','وافل التمر',60,'hot','imgs/desserts.png',1],
          [10,'Bubble Waffle Cones','بابل وافل كونز',55,'hot','imgs/desserts.png',0],
          [10,'Waffle Cakes & Stacks','وافل كيك',65,'hot','imgs/desserts.png',1],
          [10,'Lolly Stick Waffles','لولي وافل',45,'hot','imgs/desserts.png',0],
          [10,'Pancake Board Royale','بان كيك رويال',80,'hot','imgs/desserts.png',1],
          [10,'Mini Pancake Classic','ميني بان كيك',50,'hot','imgs/desserts.png',0],
          [10,'Gourmet Donut Flights','دونات جورميه',55,'hot','imgs/desserts.png',0],
          [10,'Molten Lava','مولتن لافا',60,'hot','imgs/desserts.png',1],
          [10,'Cheese Cake','تشيز كيك',55,'hot','imgs/desserts.png',0],
          [10,'Tiramisu','تيراميسو',55,'hot','imgs/desserts.png',1],
          [10,'Chocolate Mousse','موس شوكولاتة',50,'hot','imgs/desserts.png',0],
          [10,'Crepe Roll','كريب رول',55,'hot','imgs/desserts.png',0]
        ]

        Category.objects.all().delete()
        Drink.objects.all().delete()

        cat_ids = []
        for i, c in enumerate(C):
            cat = Category.objects.create(
                name=c['name'],
                name_ar=c['ar'],
                icon=c['img'],
                sort_order=i + 1
            )
            cat_ids.append(cat.id)

        for d in drinks:
            Drink.objects.create(
                category_id=cat_ids[d[0]],
                name=d[1],
                name_ar=d[2],
                tagline='An unforgettable experience',
                description='A premium drink crafted with the finest ingredients',
                price=d[3],
                temperature=d[4],
                image_emoji=d[5],
                is_featured=d[6],
                is_available=1
            )
            
        admin = User.objects.filter(role='admin').first()
        if not admin:
            User.objects.create(
                name='Admin',
                phone='01000000000',
                password=make_password('admin123'),
                role='admin',
                is_superuser=True,
                is_staff=True
            )
            User.objects.create(
                name='Cashier',
                phone='01000000001',
                password=make_password('cashier123'),
                role='cashier'
            )

        return JsonResponse({'success': True, 'message': 'Database populated successfully with categories and drinks.'})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


# ── Page Rendering Views ───────────────────────────────────────────
def _serve_html(filename):
    """Serve an HTML file directly from the public folder."""
    file_path = os.path.join(settings.BASE_DIR, 'frontend', filename)
    if os.path.exists(file_path):
        return FileResponse(open(file_path, 'rb'), content_type='text/html; charset=utf-8')
    raise Http404(f"{filename} not found")

def cashier_page(request):
    return _serve_html('cashier.html')

def admin_page(request):
    return _serve_html('admin.html')

def login_page(request):
    return _serve_html('login.html')

def cart_page(request):
    return _serve_html('cart.html')

def index_page(request):
    return _serve_html('index.html')

# ── Generic File Server ────────────────────────────────────────────
def serve_public_file(request, path_name):
    file_path = os.path.join(settings.BASE_DIR, 'frontend', path_name)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return FileResponse(open(file_path, 'rb'))
    raise Http404("File not found")

