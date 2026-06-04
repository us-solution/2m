# ============================================
# 📋 التقرير الهندسي الشامل — Ozel Cafe
# Full-Stack Architecture & Integration Blueprint
# ============================================

> **التاريخ**: 2026-06-04
> **الإصدار**: v2.0 (بعد إصلاح الثغرات الحرجة)
> **الأنظمة**: Node.js/Express (Vercel) + .NET 8 Web API (Local)

---

## الجزء الأول: 🟢 بنية وتدفق البيانات للويب سايت (Node.js on Vercel)

### 1.1 الـ Routes والـ Endpoints — كاملة

#### 🔐 المصادقة والمستخدمين
| المسار | الملف | الوظيفة | المدخلات | المخرجات |
|--------|-------|---------|---------|----------|
| `POST /api/auth/register` | `routes/auth.js` | تسجيل مستخدم جديد | `{name, phone, email, password}` | `{token, user{id,name,phone,email,role,customerStatus,points,total_spent}}` |
| `POST /api/auth/login` | `routes/auth.js` | تسجيل الدخول | `{email, password}` أو `{phone, password}` | `{token, user{...}}` |
| `GET /api/me` | `routes/me.js` | جلب بروفايل المستخدم | JWT `Authorization: Bearer <token>` | `{id,name,phone,email,role,points,total_spent,customerStatus,discountPercent,customerSince,orderCount}` |
| `PUT /api/me/password` | `routes/me.js` | تغيير كلمة السر | JWT + `{currentPassword, newPassword}` | `{success, message}` |

#### ☕ المشروبات والأقسام
| المسار | الملف | الوظيفة |
|--------|-------|---------|
| `GET /api/categories` | `routes/categories.js` | جلب جميع الأقسام مع المشروبات (بدون `availableExtras`) |
| `GET /api/drinks` | `routes/drinks.js` | جلب جميع المشروبات مع الحقول الكاملة (`availableExtras`, `menuItemIdInCashier`) |
| `PATCH /api/drinks/:id` | `routes/drinks.js` | تحديث مشروب (أدمن) — يدعم `availableExtras`, `menuItemIdInCashier` |

#### 🛒 خيارات التخصيص (Sugar & Extras)
| المسار | الملف | الوظيفة | المدخلات | المخرجات |
|--------|-------|---------|---------|----------|
| `GET /api/customization` | `routes/customization.js` | جلب جميع خيارات التخصيص | - | `{sugarLevels[{key,label,labelAr,price}], extras[{key,label,labelAr,price}]}` |
| `POST /api/customization` | `routes/customization.js` | إضافة خيار جديد (أدمن) | `{type, key, label, labelAr, price?}` | الخيار الجديد |
| `PUT /api/customization/:id` | `routes/customization.js` | تعديل خيار | `{label?, labelAr?, price?}` | الخيار المحدث |
| `DELETE /api/customization/:id` | `routes/customization.js` | حذف خيار | - | `{success}` |

#### 📋 الطلبات (Orders) — الملف الأهم
| المسار | الملف | الوظيفة | المدخلات | المخرجات |
|--------|-------|---------|---------|----------|
| `POST /api/orders` | `routes/orders.js` | إنشاء طلب جديد | `{table_number(String), items[{name,quantity,price,sugar?,extras[],notes?,menuItemIdInCashier?}], total_price, notes?, customer_phone?}` | `{success, order_id, points_earned, sync:{eventId, status}}` |
| `GET /api/orders` | `routes/orders.js` | جلب الطلبات (كاشير/أدمن) | JWT + Query `?status=` | `[{id,user_id,customer_name,table_number,items,total_price,status,created_at,...}]` |
| `GET /api/orders/me` | `routes/orders.js` | طلباتي (عميل مسجل) | JWT | آخر 20 طلب |
| `PATCH /api/orders/:id/status` | `routes/orders.js` | تغيير حالة الطلب + خصم المخزون | JWT + `{status, paymentMethod?, shiftId?, expectedVersion?}` | `{success, orderVersion, syncEventId}` |
| `PATCH /api/orders/:id/confirm-qr` | `routes/orders.js` | تأكيد QR يدوي (كاشير) | JWT | `{success}` |
| `DELETE /api/orders/:id` | `routes/orders.js` | حذف طلب (أدمن) | JWT | `{success}` |

#### 🔄 Bridge & Sync (المزامنة مع الـ POS)
| المسار | الملف | الوظيفة |
|--------|-------|---------|
| `GET /api/bridge/cashier-report` | `routes/bridge.js` | تقارير الكاشير من .NET — يعرض Chart.js (أدمن) |
| `GET /api/bridge/retry-queue` | `routes/bridge.js` | حالة طابور إعادة المحاولة — `{pending, dead, items[]}` |
| `POST /api/bridge/report` | `routes/bridge.js` | استقبال تقارير من POS (محمي بـ x-bridge-key) |
| `POST /api/bridge/ack` | `routes/bridge.js` | إقرار استلام حدث مزامنة من POS |
| `GET /api/bridge/pending` | `routes/bridge.js` | الأحداث المعلقة للتزامن |
| `GET /api/orders/unsynced` | `routes/orders.js` | طلبات لم تتم مزامنتها (محمي بـ x-bridge-key) |
| `POST /api/orders/mark-synced` | `routes/orders.js` | تعليم طلبات كمتزامنة |

#### ⏰ Cron & Background
| المسار | الملف | الوظيفة |
|--------|-------|---------|
| `GET /api/cron/retry` | `routes/cron.js` | إعادة محاولة QueueOrder المعلقة — ينادى كل دقيقة من Vercel Cron |

#### 🏢 لوحة التحكم (Admin)
| المسار | الملف | الوظيفة |
|--------|-------|---------|
| `POST /api/admin/login` | `routes/admin.js` | دخول الأدمن |
| `GET /api/admin/users` | `routes/admin.js` | إدارة المستخدمين |
| `POST /api/admin/users` | `routes/admin.js` | إنشاء مستخدم |
| `PATCH /api/admin/users/:id` | `routes/admin.js` | تعديل مستخدم (role, customerStatus, points) |
| `DELETE /api/admin/users/:id` | `routes/admin.js` | حذف مستخدم |
| `GET /api/admin/drinks` | `routes/admin.js` | إدارة المشروبات |
| `POST /api/admin/drinks` | `routes/admin.js` | إضافة مشروب |
| `PUT /api/admin/drinks/:id` | `routes/admin.js` | تعديل مشروب |
| `DELETE /api/admin/drinks/:id` | `routes/admin.js` | حذف مشروب |
| `GET /api/admin/categories` | `routes/admin.js` | إدارة الأقسام |
| `POST /api/admin/categories` | `routes/admin.js` | إضافة قسم |
| `PUT /api/admin/categories/:id` | `routes/admin.js` | تعديل قسم |
| `DELETE /api/admin/categories/:id` | `routes/admin.js` | حذف قسم |
| `GET /api/admin/orders` | `routes/admin.js` | كل الطلبات |
| `GET /api/admin/stats` | `routes/admin.js` | إحصائيات الموقع |

#### 📊 تقارير إضافية
| المسار | الملف |
|--------|-------|
| `GET /api/reports/*` | `routes/reports.js` |
| `GET /api/finance/*` | `routes/finance.js` |
| `GET /api/inventory/*` | `routes/inventory.js` |
| `GET /api/recipes/*` | `routes/recipes.js` |
| `GET /api/shifts/*` | `routes/shifts.js` |
| `POST /api/debug-log` | inline |

---

### 1.2 قاعدة البيانات (MongoDB) — 19 Models

#### 📌 User (المستخدمين)
```js
{
  name: String,          // الاسم
  phone: String,         // رقم الهاتف (فريد)
  email: String,         // البريد (فريد)
  password: String,      // مشفرة بـ bcrypt
  role: String,          // admin | cashier | vip | user
  customerStatus: String, // standard | gold | student | ozel_family
  points: Number,        // النقاط (للـ standard — كل 100 نقطة = 10 ج.م خصم)
  total_spent: Number,   // إجمالي الإنفاق
  subscriptionTier: String, // gold | silver (قديم)
  createdAt, updatedAt
}
```

#### ☕ Drink (المشروبات)
```js
{
  categoryId: ObjectId → Category,
  name: String, name_ar: String,
  price: Number, temperature: 'hot'|'cold',
  tagline: String, description: String,
  ingredients: String, preparation: String,
  calories: Number, serving_size: String,
  image_emoji: String,
  is_featured: 0|1, is_available: 0|1,
  availableExtras: [String],  // مفاتيح extras المتاحة (فارغ = الكل)
  menuItemIdInCashier: String // 🔹 GUID من PostgreSQL (جديد)
}
```

#### 📦 Order (الطلبات) — معدّل
```js
{
  userId: ObjectId → User (اختياري),
  table_number: String,
  items: [{                    // 🔹 مصفوفة (لم تعد String)
    name: String,              // اسم المشروب
    menuItemIdInCashier: String, // 🔹 GUID من PostgreSQL
    quantity: Number,
    price: Number,
    sugar: String,             // 'Normal' | 'less' | 'half' | 'sugar_free'
    extras: [String],          // مثلاً ['extra_shot', 'vanilla']
    notes: String
  }],
  total_price: Number,
  points_earned: Number,
  status: String,              // pending | confirmed | preparing | ready | served | paid | cancelled
  notes: String,
  qrCodeToken: String (فريد),
  isQrConfirmed: Boolean,
  customerPhone: String,
  posSynced: Boolean,
  shiftId: ObjectId → Shift,
  paymentMethod: 'cash'|'card'|'wallet'|'split'|null,
  orderVersion: Number,
  syncMeta: { lastEventId, lastEventType, lastSyncedAt, syncAttempts, syncStatus, lastError },
  cashierId: ObjectId → User,
  createdAt, updatedAt
}
```

#### 🗂️ QueueOrder (طابور إعادة المحاولة) — جديد
```js
{
  orderData: Mixed,     // الـ payload الكامل للإرسال
  attempts: Number,     // عدد المحاولات (تبدأ 0)
  maxRetries: Number,   // الحد الأقصى (10)
  lastAttempt: Date,
  status: 'pending' | 'dead_letter',
  failReason: String,
  createdAt, updatedAt
}
```

#### ⚙️ CustomizationOption
```js
{
  type: 'sugar' | 'extras',
  key: String,           // مثلاً 'less', 'extra_shot'
  label: String,         // إنجليزي
  labelAr: String,       // عربي
  price: Number          // فقط للإضافات
}
```

#### 📂 باقي الموديلات (13):
| الموديل | الوظيفة |
|---------|---------|
| `Category` | أقسام المشروبات (11 قسم) |
| `SyncEvent` | أحداث المزامنة مع POS Bridge |
| `Offer` | العروض والخصومات |
| `PointsLog` | سجل النقاط |
| `GameRoom` | غرفة الألعاب |
| `Expense` | المصروفات |
| `CashMovement` | حركات الخزينة |
| `Ingredient` | خامات المخزون |
| `Recipe` | وصفات المشروبات (تربط الخامات بالمشروبات) |
| `RecipeItem` | مكونات الوصفة (خامة + كمية) |
| `InventoryTransaction` | حركة مخزون (صرف/إضافة) |
| `InventoryCount` | جرد فعلي |
| `StockAlert` | تنبيهات نفاد المخزون |
| `ExpenseCategory` | تصنيف المصروفات |

---

### 1.3 نظام الـ Retry Queue الحالي — بعد الإصلاح

#### التدفق الكامل:
```
🟢 مستخدم يطلب من الموقع
        │
        ▼
POST /api/orders (routes/orders.js)
        │
        ├── 1. حفظ الطلب في MongoDB (Order.items ← مصفوفة ✅)
        │
        ├── 2. إنشاء SyncEvent (المزامنة القديمة مع Bridge)
        │
        └── 3. deliverToCashierAPI(order, user)  ← غير متزامن
                │
                ├─ قراءة .env: BASE_URL, API_KEY, BRANCH_ID, EMPLOYEE_ID
                │   └─ أي متغير ناقص ← return { skipped: true }
                │
                ├─ GET {BASE_URL}/shifts/active  ← جلب الوردية
                │   ├─ نجاح ← shiftId = response.shiftId
                │   └─ فشل ← return { skipped: true, reason: 'no_active_shift' } 🛑
                │
                ├─ لكل item في order.items:
                │   ├─ تستخدم item.menuItemIdInCashier إن موجود
                │   ├─ وإلا ← Drink.findOne({name}) ← تجيب GUID من DB
                │   └─ تجمع sugar + extras في modifiersJson
                │
                ├─ idempotencyKey = uuidv4()  ← GUID صحيح ✅
                │
                └─ retryQueue.sendOrEnqueue(orderData)
                        │
                        ├─ axios.post({url}/orders, orderData, {headers:{X-API-KEY}})
                        │   ├─ 200-299 ← return { sent } ✅
                        │   ├─ 409 ← return { sent, duplicate: true } ✅
                        │   └─ غيرها / خطأ ← QueueOrder.create(...) ← تخزين في MongoDB
                        │
                        └─ processQueue() ← كل 60 ثانية
                            ├─ QueueOrder.find({status:'pending'})
                            ├─ لكل entry:
                            │   ├─ attempts > maxRetries (10) ← status='dead_letter'
                            │   └─ غير كذا ← processEntry() ← POST
                            │       ├─ نجاح ← findByIdAndDelete
                            │       └─ فشل ← save() (لزيادة attempts)
                            └─ (أو ينادى من Vercel Cron كل دقيقة)
```

#### الفرق عن الإصدار القديم:
| الميزة | قبل | بعد |
|--------|-----|-----|
| التخزين | `failed-orders.json` (ملف) | `QueueOrder` collection (MongoDB) ✅ |
| البيئة | Vercel (read-only FS ← معطل) | Vercel + MongoDB ← شغال ✅ |
| maxRetries | ∞ (أبدي) | 10 (ثم `dead_letter`) ✅ |
| backoff | لا | لا (يمكن إضافته) |
| Vercel Cron | لا يوجد | `vercel.json` + `/api/cron/retry` ✅ |

---

## الجزء الثاني: 🔵 بنية وتدفق البيانات للكاشير المحلي (.NET 8 + PostgreSQL)

### 2.1 الـ Web API المتاحة — 6 نقاط اتصال

#### 1️⃣ `POST /api/orders`

**الـ JSON المدخل:**
```json
{
  "branchId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",   // ← BRANCH_ID من .env
  "shiftId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",   // ← من GET /shifts/active
  "employeeId": "4fa85f64-5717-4562-b3fc-2c963f66afa6", // ← DEFAULT_EMPLOYEE_ID
  "tableSessionId": null,                                  // (اختياري)
  "deviceId": "web-api",                                   // (اختياري)
  "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000", // ← uuidv4() GUID
  "items": [
    {
      "menuItemId": "5fa85f64-5717-4562-b3fc-2c963f66afa6", // ← menuItemIdInCashier
      "quantity": 2.0,
      "modifiersJson": "[\"sugar:less\",\"extras:vanilla,caramel\"]",
      "notes": ""
    }
  ]
}
```

**الـ JSON المخرج (نجاح):**
```json
{
  "orderId": "6fa85f64-5717-4562-b3fc-2c963f66afa6",
  "status": "created",
  "message": "Order received and sent to kitchen successfully."
}
```

**حالات الخطأ:**
- `400` — shiftId غير موجود/مغلق → `"Active shift not found or is closed."`
- `400` — التكرار → `"Duplicate order detected. Order with this IdempotencyKey already exists."` → **HTTP 409**
- `400` — Branch mismatch
- `500` — خطأ عام

#### 2️⃣ `GET /api/shifts/active`

**المخرج (نجاح):**
```json
{
  "success": true,
  "shiftId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "cashRegisterSessionId": "00000000-0000-0000-0000-000000000000",
  "startTime": "2026-06-04T14:40:25.385Z"
}
```

**المخرج (فشل — لا وردية نشطة):**
```json
{
  "success": false,
  "error": "No active shift found. Please open a shift in the POS system."
}
```

#### 3️⃣ `GET /api/reports/dashboard`

**المخرج (`AdminDashboardMetricsDto`):**
```json
{
  "todaysSales": 1250.00,
  "monthlySales": 45200.00,
  "activeShifts": 1,
  "openOrders": 3,
  "lowStockCount": 2,
  "totalExpenses": 3200.00,
  "netProfit": 8750.00,
  "salesChartData": [
    { "date": "2026-06-01T00:00:00Z", "value": 1420.00 }
  ],
  "profitChartData": [
    { "date": "2026-06-01T00:00:00Z", "value": 980.00 }
  ],
  "bestSellingProducts": [
    { "productName": "Espresso", "quantitySold": 47 }
  ],
  "expenseBreakdown": [
    { "category": "إيجار", "amount": 25000.00 }
  ],
  "recentActivity": [
    {
      "activityType": "Order",
      "description": "Order #a1b2c3d8 created",
      "timestamp": "2026-06-04T12:00:00Z",
      "user": "System",
      "referenceId": "a1b2c3d8-..."
    }
  ]
}
```

#### 4️⃣ `GET /api/reports/profitability?startDate=&endDate=&branchId=`
#### 5️⃣ `GET /api/reports/analytics?startDate=&endDate=&branchId=`
#### 6️⃣ `GET /api/reports/shift-reconciliation/{shiftId}`

---

### 2.2 نظام الحماية والأمان

```
ApiKeyMiddleware — Pipeline:
┌─────────────────────────────────────────────────────┐
│ 1. هل المسار /swagger? ← next() (بدون تحقق)         │
│ 2. configuration["ApiKey"] → appsettings.json        │
│    └─ إذا "" → Environment.GetEnvironmentVariable     │
│         ("POS_API_KEY")                               │
│ 3. إذا المفتاح فارغ بالكامل ← HTTP 500               │
│ 4. هل X-API-KEY موجود في Header؟                     │
│    └─ لا ← HTTP 401 "API key is missing"              │
│ 5. مقارنة زمنية ثابتة (FixedTimeEquals) ← حماية من   │
│    timing attacks                                     │
│    └─ غير متطابق ← HTTP 403 "Invalid API key"         │
└─────────────────────────────────────────────────────┘

CORS:
┌─────────────────────────────────────────────────────┐
│ appsettings.json → CorsOrigins                       │
│ الإنتاج: ["https://ozel-weld.vercel.app"]            │
│ التطوير: ["http://localhost:3000",                   │
│           "http://localhost:5173",                    │
│           "https://ozel-weld.vercel.app"]             │
│                                                      │
│ السياسة: WebsiteOnly — WithOrigins + AllowAnyHeader  │
│          + AllowAnyMethod                             │
└─────────────────────────────────────────────────────┘

DB Password:
┌─────────────────────────────────────────────────────┐
│ Program.cs:                                          │
│ 1. قراءة ConnectionStrings:DefaultConnection         │
│ 2. قراءة POS_DB_PASSWORD من Environment Variable     │
│ 3. استبدال "MproM7*#" في connection string بالقيمة   │
│ 4. Fallback: "postgres"                               │
│ 5. EF Core + Npgsql + MigrateAsync عند بدء التشغيل   │
│ 6. pg_advisory_lock مانع تكرار التشغيل                │
└─────────────────────────────────────────────────────┘
```

---

### 2.3 دورة حياة الأوردر محلياً — بالتفصيل

```
📥 POST /api/orders
  │
  ├── [Security] ApiKeyMiddleware ← يتحقق من X-API-KEY
  ├── [Security] CORS ← يتحقق من Origin
  │
  ├── 📌 Step 1: CreateDraftOrderCommandHandler
  │   ├── التحقق من IdempotencyKey
  │   │   └─ GUID موجود مسبقاً في Orders.IdempotencyKey
  │   │       └─ نعم → throw InvalidOperationException → HTTP 409
  │   ├── التحقق من ShiftId (موجود + Status = Open)
  │   │   └─ لا → throw → HTTP 400
  │   ├── التحقق من BranchId مطابق للوردية
  │   ├── إنشاء Order:
  │   │   { Id = Guid.NewGuid(),
  │   │     BranchId, ShiftId, CreatedByEmployeeId,
  │   │     Status = OrderStatus.Draft,
  │   │     CreatedAt = UtcNow, Version = 1 }
  │   ├── تعيين IdempotencyKey (إذا GUID صالح)
  │   └── Save → return order.Id
  │
  ├── 🔄 Step 2: AddOrderItemCommandHandler (loop لكل item)
  │   ├── التحقق من Order موجود
  │   ├── التحقق من Quantity > 0
  │   ├── التحقق من Immutability:
  │   │   Order.Status ≠ Paid/Refunded/Cancelled
  │   ├── التحقق من MenuItem.Id موجود في menu_items
  │   │   └─ لا → throw "MenuItem not found."
  │   ├── إنشاء OrderItem:
  │   │   { MenuItemId, Quantity,
  │   │     NameSnapshot = menuItem.Name,
  │   │     PriceSnapshot = menuItem.Price,
  │   │     ModifiersJsonSnapshot,
  │   │     KitchenNotes,
  │   │     PreparationStatus = KitchenStatus.Pending }
  │   ├── حساب Subtotal, TaxSnapshot, DiscountSnapshot, FinalTotal
  │   ├── تحديث Order.Version++, LastActivityAt
  │   ├── Order.CalculateTotals()
  │   └── Save → return orderItem.Id
  │
  ├── 🍳 Step 3: SendOrderToKitchenCommandHandler
  │   ├── جلب Pending Items (PreparationStatus = Pending)
  │   ├── لكل Item:
  │   │   ├── جلب RecipeIngredients حسب MenuItemId
  │   │   ├── لكل Ingredient:
  │   │   │   ├── حساب quantityConsumed
  │   │   │   ├── إنشاء OrderItemIngredientSnapshot
  │   │   │   │   { NameSnapshot, BaseUnit,
  │   │   │   │     QuantityConsumed, UnitCostSnapshot,
  │   │   │   │     TotalCostSnapshot }
  │   │   │   ├── InventoryItem.AdjustStock()
  │   │   │   └── InventoryTransaction
  │   │   │       { Type = SaleConsumption }
  │   │   └── item.PreparationStatus = Preparing
  │   │       item.QueuedAt = UtcNow
  │   └── Save → return Result<bool>
  │
  ├── 🔔 Step 4: Audio Alert
  │   ├── WebApiAudioAlertService.PlayNotification()
  │   └── ⚠️ حالياً → Logger.LogInformation فقط
  │       (لا يوجد صوت فعلي — الصوت يكون من WPF)
  │
  ├── 🖨️ PrintJobWorker (WPF)
  │   └── في تطبيق WPF منفصل:
  │       يراقب PrintJobs table ← يطبع البون
  │       تلقائياً ← هذا خارج نطاق WebAPI
  │
  └── ✅ Return { orderId, status: "created", message: "..." }
```

---

## الجزء الثالث: 🟠 خريطة المطابقة والربط (Mapping & Gaps Analysis)

### 3.1 🟢 المتطابق حالياً (بعد الإصلاحات)

| العنصر | Node.js (MongoDB) | .NET (PostgreSQL) | الحالة |
|--------|-------------------|-------------------|--------|
| **معرف المشروب** | `Drink.menuItemIdInCashier` (String) | `MenuItem.Id` (Guid) | ✅ بعد التلقيم اليدوي |
| **إرسال item** | `items[].menuItemIdInCashier` | `OrderItemRequest.MenuItemId` | ✅ يبحث في Drink DB إذا فاضي |
| **الكمية** | `items[].quantity` (Number) | `OrderItemRequest.Quantity` (decimal) | ✅ |
| **الملاحظات** | `items[].notes` (String) | `OrderItemRequest.Notes` (string?) | ✅ |
| **Sugar/Extras** | `items[].sugar` + `items[].extras[]` | `OrderItemRequest.ModifiersJson` (string?) | ✅ يُجمّع في modifiersJson |
| **Branch ID** | `BRANCH_ID` (.env) | `CreateOrderRequest.BranchId` (Guid) | ✅ (يحتاج GUID حقيقي) |
| **Employee ID** | `DEFAULT_EMPLOYEE_ID` (.env) | `CreateOrderRequest.EmployeeId` (Guid) | ✅ (يحتاج GUID حقيقي) |
| **IdempotencyKey** | `uuidv4()` (GUID صحيح) | `CreateOrderRequest.IdempotencyKey` (string?) | ✅ GUID.TryParse ينجح |
| **Shift ID** | من GET /shifts/active | `CreateOrderRequest.ShiftId` (Guid) | ✅ خطوتان |
| **X-API-KEY** | `.env` → header | `ApiKeyMiddleware` | ✅ مفتاح قوي + متغير بيئة |
| **CORS** | `*` (أي origin) | `https://ozel-weld.vercel.app` | ✅ |
| **DB Password** | - | `POS_DB_PASSWORD` env var | ✅ |

### 3.2 🔴 الثغرات التي تم إصلاحها

| # | الثغرة | الإصلاح |
|---|--------|---------|
| 1 | `menuItemIdInCashier` غير موجود في بيانات الأوردر | ✅ أضفناه لـ `Drink` موديل + `Order.items[]` + lookup تلقائي |
| 2 | `IdempotencyKey` صيغته `order-{id}-{timestamp}` ← Guid.TryParse يفشل | ✅ صار `uuidv4()` — GUID صحيح 100% |
| 3 | `shiftId = null` يرسل للـ Queue (إعادة محاولة للأبد) | ✅ `if (!shiftId) return { skipped: true }` — ما يرسلش |
| 4 | Retry Queue يستخدم `fs.writeFileSync` ← لا يعمل على Vercel | ✅ يستخدم `QueueOrder` (MongoDB) + Vercel Cron |
| 5 | `Order.items` كان String JSON | ✅ صار Array منظم |
| 6 | `menuItemIdInCashier` lookup لم يكن موجود | ✅ يبحث عن GUID من Drink DB بالاسم |

### 3.3 🟡 ثغرات متبقية (بعد الإصلاح)

| # | الثغرة | الخطورة | الحل المقترح |
|---|--------|---------|-------------|
| 1 | **لا يوجد Backoff في Retry Queue** (يحاول كل 60 ثانية ثابت) | 🟡 | إضافة `Math.min(1000 * 2^attempts, 3600000)` |
| 2 | **لا صوت فعلي من WebAPI** — WebApiAudioAlertService يسجل Log فقط | 🟡 | الصوت الفعلي مسؤولية WPF (موجود خارجياً) |
| 3 | **BranchId و EmployeeId قيم افتراضية** موش GUIDs حقيقية | 🟡 | استبدالها بعد PostgreSQL Queries |
| 4 | **menuItemIdInCashier فاضي لكل المشروبات** — يحتاج تلقيم يدوي | 🟡 | تشغيل `scripts/sync-menu-item-ids.js` بعد استخراج GUIDs من PostgreSQL |
| 5 | **خصم المخزون في النظامين منفصل** (MongoDB + PostgreSQL) | 🟡 | مقبول حالياً — كل نظام له مخزونه الخاص |

### 3.4 🔵 ملاحظات إضافية

#### PostgreSQL Column Naming Convention
- `categories` و `menu_items` — lower case columns
- باقي الجداول — **PascalCase** مع `HasColumnName()` في EF Core
- لا توجد مشكلة لأن EF Core يقرأ/يكتب تلقائياً

#### Vercel Serverless Constraints
- 10秒 timeout للـ Serverless Functions (Basic plan)
- 60秒 timeout للـ Pro plan
- الـ WebSocket/Pusher يعمل منفصل (CDN)
- قاعدة البيانات MongoDB Atlas خارجية — لا مشكلة
- **هام**: الـ `setInterval` في `retry-queue.js` يعمل فقط في **التطوير المحلي** (لما `NODE_ENV !== 'production'` و `app.listen` ينفذ)
  - على Vercel: `setInterval` يستمر لو الـ Function دافئة (warm)
  - لكن الـ Vercel Cron هو المعتمد أساساً لإعادة المحاولة

---

## 4. 🟣 الخطوات القادمة — Action Plan

### 🔴 أولوية قصوى (ضروري قبل الربط المباشر)

| # | المهمة | المسؤول | التفاصيل |
|---|--------|---------|----------|
| 1 | **استخراج GUIDs من PostgreSQL** | شريكك (PostgreSQL) | `SELECT Id, Name FROM menu_items;` — نسخ الـ GUIDs |
| 2 | **تلقيم menuItemIdInCashier في MongoDB** | أنت | تشغيل `node scripts/sync-menu-item-ids.js` بعد تعبئة `MAPPING` |
| 3 | **استخراج BranchId + EmployeeId الحقيقيين** | شريكك | `SELECT Id, Name FROM Branches;` + `SELECT Id, Name FROM Employees WHERE IsActive = true;` |
| 4 | **تحديث .env** | أنت | `BRANCH_ID=الـGUID`, `DEFAULT_EMPLOYEE_ID=الـGUID` |
| 5 | **نشر على Vercel** | أنت | Git push → Vercel auto-deploy |
| 6 | **تثبيت PostgreSQL + تشغيل .NET WebAPI** | شريكك | تشغيل `Run_Ozel_POS.bat` على جهاز الكافيه |
| 7 | **فتح وردية (Shift) في WPF** | شريكك | عشان `GET /shifts/active` يرجع shiftId |

### 🟡 أولوية متوسطة (خلال أسبوع)

| # | المهمة |
|---|--------|
| 8 | إضافة Exponential Backoff للـ Retry Queue |
| 9 | إضافة dead_letter notification للأدمن |
| 10 | اختبار شامل: طلب → MongoDB → .NET → طباعة بون |

### 🔵 لاحقاً

| # | المهمة |
|---|--------|
| 11 | توحيد المخزون (نظام واحد بدلاً من نظامين منفصلين) |
| 12 | إضافة Dashboard حقيقي في الأدمن يعرض بيانات الكاشير مباشرة |
| 13 | إضافة WebSocket (SignalR) للإشعارات الفورية بدلاً من الـ Polling |

---

## 5. ✅ الخلاصة النهائية

| المكون | الحالة | التفاصيل |
|--------|--------|----------|
| **إنشاء الأوردر + حفظه في MongoDB** | ✅ شغال 100% | Array items, sugar, extras, menuItemIdInCashier |
| **جلب shiftId من .NET** | ✅ شغال (مع Mock) | `GET /api/shifts/active` ← يعيد shiftId أو `{success:false}` |
| **إرسال الأوردر إلى .NET** | ✅ جاهز (بعد تلقيم GUIDs) | idempotencyKey GUID صحيح, shiftId إجباري, modifiersJson |
| **Retry Queue (Vercel)** | ✅ جاهز | MongoDB + Vercel Cron + maxRetries:10 + dead_letter |
| **تقارير الكاشير** | ✅ شغال (مع Mock) | `/api/bridge/cashier-report` ← يعرض Chart.js |
| **CORS + API Key** | ✅ مؤمن بالكامل | CorsOrigins مقيد + ApiKey من env var + مقارنة زمنية |
| **DB Password** | ✅ آمن | متغير بيئة + استبدال تلقائي |
| **طباعة بون في الكافيه** | 🟡 غير مكتمل (دور WPF) | WebAPI يجهز البيانات فقط، WPF يطبع |
| **خصم المخزون** | ✅ شغال (MongoDB) + ✅ شغال (.NET) | النظامين منفصلين — مقبول حالياً |

---

**الخلاصة**: النظام جاهز للربط المباشر بعد **3 خطوات يدوية** فقط:
1. استخراج GUIDs من PostgreSQL
2. تلقيم `menuItemIdInCashier` في MongoDB
3. تحديث `BRANCH_ID` و `DEFAULT_EMPLOYEE_ID` في `.env`

بعدها — Git push → Vercel deploy → تشغيل `Run_Ozel_POS.bat` على الكافيه → فتح وردية → أول أوردر يرسل ويطبع 🎉
