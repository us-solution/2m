const axios = require('axios');
const QueueCustomer = require('../models/QueueCustomer');

const getCashierUrl = () => {
  let raw = process.env.CASHIER_API_URL || process.env.BRIDGE_WEBHOOK_URL || 'http://localhost:3001';
  return raw.trim().replace(/\/+$/, '');
};

const getBridgeKey = () => {
  return process.env.BRIDGE_API_KEY || process.env.CASHIER_API_KEY || '';
};

const TIMEOUT_MS = parseInt(process.env.BRIDGE_TIMEOUT_MS || '5000', 10);

// تحويل الأرقام العربية إلى إنجليزية وتنظيف رقم الهاتف
function normalizePhone(phone) {
  if (!phone) return '';
  const converted = String(phone)
    .replace(/[٠١٢٣٤٥٦٧٨٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰۱۲۳۴۵۶۷۸۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  const digits = converted.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

// تجهيز بنية بيانات العميل ومطابقتها حرفياً مع ما يتوقعه سيستم الكاشير
function buildCustomerPayload(user) {
  const resolvedPhone = normalizePhone(user.phone && !user.phone.startsWith('email_') ? user.phone : '');
  const resolvedEmail = (user.email || '').trim().toLowerCase();

  return {
    cloud_id: String(user._id || user.id || ''),
    name: (user.name || 'عميل مسجل').trim(),
    phone: resolvedPhone,
    email: resolvedEmail,
    customer_code: String(user._id || user.id || '').slice(-6).toUpperCase(),
    points: parseInt(user.points || 0, 10),
    customer_status: user.customerStatus || 'standard',
    total_spent: parseFloat(user.total_spent || 0),
    address: user.address || '',
    notes: user.notes || '',
    date_joined: user.createdAt ? new Date(user.createdAt).toISOString() : new Date().toISOString()
  };
}

// إرسال مباشر إلى نقطة استقبال الكاشير مع كافة ترويسات المصادقة الممكنة
async function sendCustomerToCashier(payload) {
  const url = getCashierUrl();
  const key = getBridgeKey();

  if (!url || !key) {
    return { success: false, skipped: true, reason: 'bridge_not_configured' };
  }

  const endpoint = `${url}/api/customers`;

  try {
    const response = await axios.post(endpoint, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-bridge-key': key,
        'x-api-key': key,
        'Authorization': `Bearer ${key}`
      },
      timeout: TIMEOUT_MS,
      validateStatus: () => true // فحص الحالات يدوياً
    });

    const status = response.status;
    if (status >= 200 && status < 300) {
      console.log(`[CashierSync] ✅ تم إرسال بيانات العميل ${payload.name} (${payload.phone}) بنجاح إلى الكاشير (HTTP ${status})`);
      return { success: true, status, data: response.data };
    }

    if (status === 409) {
      console.log(`[CashierSync] ℹ️ العميل ${payload.phone || payload.name} موجود بالفعل في الكاشير (HTTP 409)`);
      return { success: true, status, alreadyExists: true };
    }

    const errDetails = typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data || '');
    console.warn(`[CashierSync] ⚠️ رفض الكاشير استقبال العميل ${payload.phone}: HTTP ${status} - ${errDetails.slice(0, 150)}`);
    return { success: false, status, reason: `http_${status}`, details: errDetails };
  } catch (err) {
    const isConnRefused = err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED');
    console.error(`[CashierSync] ❌ فشل الاتصال برابط الكاشير (${endpoint}):`, isConnRefused ? 'الكاشير مغلق أو غير متاح حالياً (ECONNREFUSED)' : err.message);
    return { success: false, reason: isConnRefused ? 'cashier_offline' : err.message, code: err.code };
  }
}

// دالة المزامنة الرئيسية عند تسجيل مستخدم جديد (تعمل في الخلفية ولا توقف المستخدم)
async function syncCustomerToCashier(user) {
  const payload = buildCustomerPayload(user);

  // تشغيل الإرسال بشكل غير متزامن
  try {
    const res = await sendCustomerToCashier(payload);
    if (!res.success) {
      // إيداع العميل في طابور إعادة المحاولة عند الفشل
      await QueueCustomer.create({
        customerData: payload,
        attempts: 1,
        lastAttempt: new Date(),
        nextAttemptAt: new Date(Date.now() + 30 * 1000), // المحاولة بعد 30 ثانية
        status: 'pending',
        failReason: `${res.reason || 'failed'}: ${res.details || ''}`
      });
      console.log(`[CashierSync] 📥 تم جدولة العميل ${payload.name} في طابور إعادة المحاولة (QueueCustomer)`);
    }
  } catch (queueErr) {
    console.error('[CashierSync] خطأ في حفظ العميل بطابور المحاولة:', queueErr.message);
  }
}

// معالجة طابور إعادة محاولة إرسال العملاء (يُستدعى دورياً من retry-queue)
async function processCustomerQueue() {
  try {
    const entries = await QueueCustomer.find({
      status: 'pending',
      nextAttemptAt: { $lte: new Date() }
    }).sort({ createdAt: 1 }).limit(30);

    if (entries.length === 0) return;

    for (const entry of entries) {
      entry.attempts += 1;
      entry.lastAttempt = new Date();

      if (entry.attempts > entry.maxRetries) {
        entry.status = 'dead_letter';
        entry.failReason = 'exceeded_max_retries';
        await entry.save();
        console.warn(`[CashierSync] العميل ${entry.customerData.name} تجاوز الحد الأقصى للمحاولات → dead_letter`);
        continue;
      }

      const res = await sendCustomerToCashier(entry.customerData);
      if (res.success) {
        await QueueCustomer.findByIdAndDelete(entry._id);
        console.log(`[CashierSync] ✅ تمت إعادة إرسال العميل ${entry.customerData.name} بنجاح من الطابور`);
      } else {
        const delaySeconds = Math.min(3600, Math.pow(2, entry.attempts) * 20);
        entry.nextAttemptAt = new Date(Date.now() + delaySeconds * 1000);
        entry.failReason = `${res.reason || 'failed'}: ${res.details || ''}`;
        await entry.save();
      }
    }
  } catch (err) {
    console.error('[CashierSync] خطأ أثناء معالجة طابور العملاء:', err.message);
  }
}

module.exports = {
  syncCustomerToCashier,
  sendCustomerToCashier,
  processCustomerQueue,
  normalizePhone,
  buildCustomerPayload
};
