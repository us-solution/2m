# 🖥️ OZEL Cafe — Local Bridge Server v2.0

## ما هو هذا السيرفر؟

سيرفر وسيط يعمل على الحاسوب المحلي في المقهى. يستمع لـ **Pusher** من موقع Vercel ويقوم بـ:

- 📦 **استقبال الطلبات** تلقائياً لحظة وصولها من الموقع
- 🖨️ **طباعتها** على الطابعة الحرارية فوراً
- 💾 **تخزينها** في قاعدة بيانات SQLite محلية
- 📡 **إرسالها لحظياً** لشاشة الكاشير عبر SSE (بدون polling)
- 🔄 **مزامنة تحديثات الحالة** مع Vercel

---

## 📋 المتطلبات

- Node.js v18 أو أحدث ([تنزيل](https://nodejs.org))
- الحاسوب والطابعة على نفس الشبكة (WiFi أو كابل)
- اتصال إنترنت (لاستقبال الطلبات عبر Pusher)

---

## 🚀 التثبيت والتشغيل

### 1. نسخ ملف البيئة
```bash
copy .env.example .env
```

### 2. تعديل `.env`
افتح ملف `.env` وعدّل:
- `PRINTER_IP` → عنوان IP طابعتك الحرارية
- تأكد أن `PUSHER_KEY` صحيح (مأخوذ من ملف `.env` الرئيسي)
- (اختياري) `VERCEL_API_URL` و `CASHIER_JWT_TOKEN` للمزامنة مع Vercel

### 3. تثبيت المكتبات
```bash
npm install
```

### 4. تشغيل السيرفر
```bash
npm start
```

ستظهر رسالة نجاح:
```
==================================================
  🚀 OZEL Cafe Local Bridge Server v2.0
==================================================
  📡 API المحلي : http://localhost:3001
  🖨️  الطابعة    : tcp://192.168.1.100:9100
  🔗 Pusher     : cluster=eu | channel=cashier-orders
==================================================
✅ [Pusher] متصل بـ channel: cashier-orders
```

---

## 🖨️ إعداد الطابعة الحرارية

### إيجاد IP الطابعة
1. اطبع صفحة التكوين من زر الطابعة
2. **أو:** افتح `cmd` واكتب `arp -a` وابحث عن الطابعة
3. **أو:** افتح Router Admin وابحث في قائمة الأجهزة المتصلة

### بروتوكول الاتصال
السيرفر يتصل بالطابعة عبر **TCP/IP على Port 9100** (المعيار العالمي للطابعات ESC/POS).

### الطابعات المدعومة
- Epson TM-T20, TM-T82, TM-T88, وأي طابعة ESC/POS
- Star TSP143, TSP654
- أي طابعة حرارية تدعم TCP/IP

---

## 📡 API المحلي

السيرفر يوفر API على `http://localhost:3001`:

| Method | Endpoint | الوصف |
|--------|----------|-------|
| `GET` | `/status` | حالة السيرفر والاتصالات (Health Check) |
| `GET` | `/orders` | قائمة الطلبات (مع فلتر `?status=pending&since=ISO`) |
| `GET` | `/orders/export` | تصدير JSON كامل (`?date=2025-05-29&status=pending`) |
| `GET` | `/orders/stream` | **SSE** — تحديثات لحظية بدون polling |
| `GET` | `/orders/stats` | إحصائيات سريعة (عدد الطلبات، الإيراد اليومي) |
| `GET` | `/orders/:id` | تفاصيل طلب واحد |
| `PATCH` | `/orders/:id/status` | تحديث حالة طلب (مع مزامنة Vercel) |
| `POST` | `/orders/:id/print` | إعادة طباعة طلب |

### مثال: تحديث حالة طلب
```bash
curl -X PATCH http://localhost:3001/orders/ORDER_ID/status \
  -H "Content-Type: application/json" \
  -d '{"status": "ready"}'
```

### مثال: تصدير الطلبات
```bash
# آخر 24 ساعة
curl http://localhost:3001/orders/export

# تاريخ محدد
curl "http://localhost:3001/orders/export?date=2025-05-29"

# الطلبات المعلقة فقط
curl "http://localhost:3001/orders/export?status=pending"
```

### مثال: الاشتراك في التحديثات اللحظية (SSE)
```javascript
const evtSource = new EventSource('http://localhost:3001/orders/stream');

// استقبال الطلبات الحالية فور الاتصال
evtSource.addEventListener('init', e => {
  const { orders } = JSON.parse(e.data);
  console.log('الطلبات الحالية:', orders);
});

// استقبال طلب جديد
evtSource.addEventListener('new-order', e => {
  const order = JSON.parse(e.data);
  console.log('طلب جديد!', order);
});

// تحديث حالة طلب
evtSource.addEventListener('status-update', e => {
  const { id, status } = JSON.parse(e.data);
  console.log(`الطلب ${id} أصبح: ${status}`);
});
```

### حالات الطلب المتاحة
| الحالة | المعنى |
|--------|--------|
| `pending` | في الانتظار |
| `confirmed` | مؤكد |
| `preparing` | قيد التحضير |
| `ready` | جاهز للتسليم |
| `served` | تم التسليم (محلي) |
| `delivered` | تم التسليم (Vercel) |
| `cancelled` | ملغي |

---

## 🔄 مزامنة مع Vercel

لمزامنة تحديثات الحالة مع موقع Vercel:

1. سجّل دخول الكاشير على الموقع
2. افتح DevTools (F12) → Console واكتب:
   ```javascript
   localStorage.getItem('ozel_token')
   ```
3. انسخ الـ Token وأضفه في `.env`:
   ```
   VERCEL_API_URL=https://your-project.vercel.app
   CASHIER_JWT_TOKEN=eyJhbGci...
   ```

> **ملاحظة:** إذا لم تُعدّل `VERCEL_API_URL`، سيتجاهل البريدج المزامنة تلقائياً.

---

## ⚠️ استكشاف الأخطاء

| المشكلة | الحل |
|---------|------|
| لا تصل الطلبات | تحقق من اتصال الإنترنت ومن PUSHER_KEY |
| الطابعة لا تطبع | تحقق من PRINTER_IP وأن الطابعة في نفس الشبكة |
| خطأ `ECONNREFUSED` للطابعة | تأكد أن الطابعة تدعم TCP وأن Port 9100 مفتوح |
| SSE لا يعمل | تأكد أن CORS مفعّل على المتصفح أو استخدم `localhost` |

---

## 🔁 التشغيل التلقائي مع Windows

لتشغيل السيرفر تلقائياً عند بدء تشغيل الحاسوب:

1. اضغط `Win + R` → اكتب `shell:startup`
2. أنشئ ملف `ozel-bridge.bat`:
   ```batch
   @echo off
   cd /d "C:\path\to\OZEL Cafe\local-bridge"
   node bridge-server.js
   ```
3. انسخه إلى مجلد Startup

---

## 🏗️ بنية النظام

```
[عميل الموقع] 
     │ يرسل طلب POST /api/orders
     ▼
[Vercel — server.js]
     │ يحفظ في MongoDB
     │ يرسل حدث عبر Pusher
     ▼
[local-bridge/bridge-server.js]  ← يعمل على كمبيوتر المقهى
     │ يستقبل حدث Pusher
     ├── يحفظ في SQLite (orders.db)
     ├── يطبع على الطابعة الحرارية
     └── يبث عبر SSE لشاشة الكاشير
           ▼
   [cashier.html — شاشة الكاشير]
     │ يعرض الطلبات لحظياً
     └── يُحدّث الحالة → PATCH /orders/:id/status
               └── مزامنة مع Vercel (اختياري)
```
