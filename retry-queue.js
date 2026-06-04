// ===== طابور إعادة المحاولة - إرسال الأوردرات المعلقة إلى API الكاشير المحلي =====
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const QUEUE_FILE = path.join(__dirname, 'failed-orders.json');
const CASHIER_API_URL = () => process.env.CASHIER_API_URL;
const CASHIER_API_KEY = () => process.env.CASHIER_API_KEY;

let queue = [];
let intervalId = null;
let isProcessing = false;

// تحميل الطابور من الملف
function loadQueue() {
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      const raw = fs.readFileSync(QUEUE_FILE, 'utf8');
      queue = JSON.parse(raw);
    }
  } catch (e) {
    queue = [];
  }
}

// حفظ الطابور إلى الملف
function saveQueue() {
  try {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf8');
  } catch (e) {
    console.error('[RetryQueue] فشل حفظ الطابور:', e.message);
  }
}

// إضافة طلب فاشل إلى الطابور
function enqueue(orderData) {
  const entry = {
    id: uuidv4(),
    orderData,
    attempts: 0,
    lastAttempt: null,
    createdAt: new Date().toISOString()
  };
  queue.push(entry);
  saveQueue();
  console.log(`[RetryQueue] تمت إضافة الطلب ${orderData.idempotencyKey || orderData.idempotency_key || 'unknown'} إلى طابور إعادة المحاولة`);
  return entry;
}

// حذف طلب من الطابور بعد النجاح
function dequeue(id) {
  queue = queue.filter(e => e.id !== id);
  saveQueue();
}

// معالجة طلب واحد
async function processEntry(entry) {
  const url = CASHIER_API_URL();
  const key = CASHIER_API_KEY();
  if (!url || !key) return false;

  try {
    const resp = await fetch(`${url}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': key
      },
      body: JSON.stringify(entry.orderData),
      signal: AbortSignal.timeout(10000)
    });
    if (resp.ok) {
      console.log(`[RetryQueue] تم إرسال الطلب ${entry.orderData.idempotencyKey || entry.orderData.idempotency_key || 'unknown'} بنجاح`);
      dequeue(entry.id);
      return true;
    }
    if (resp.status === 409) {
      console.log(`[RetryQueue] الطلب ${entry.orderData.idempotencyKey || entry.orderData.idempotency_key || 'unknown'} موجود مسبقاً (تم التخطي)`);
      dequeue(entry.id);
      return true;
    }
    console.log(`[RetryQueue] فشل إرسال ${entry.orderData.idempotencyKey || entry.orderData.idempotency_key || 'unknown'}: HTTP ${resp.status}`);
    return false;
  } catch (e) {
    console.log(`[RetryQueue] فشل إرسال ${entry.orderData.idempotencyKey || entry.orderData.idempotency_key || 'unknown'}: ${e.message}`);
    return false;
  }
}

// جولة معالجة - تجربة كل الطلبات المعلقة
async function processQueue() {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;
  try {
    const snapshot = [...queue];
    for (const entry of snapshot) {
      entry.attempts++;
      entry.lastAttempt = new Date().toISOString();
      await processEntry(entry);
    }
  } finally {
    isProcessing = false;
  }
}

// بدء الطابور - يعمل كل 60 ثانية
function start(intervalMs = 60000) {
  loadQueue();
  if (queue.length > 0) {
    console.log(`[RetryQueue] تم تحميل ${queue.length} طلب(طلبات) معلقة من الملف`);
  }
  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(processQueue, intervalMs);
  console.log(`[RetryQueue] بدأ طابور إعادة المحاولة (كل ${intervalMs / 1000} ثانية)`);
  // تجربة فورية إذا كان فيه طلبات
  if (queue.length > 0) processQueue();
}

// إيقاف الطابور
function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

// الحصول على حالة الطابور
function getStatus() {
  return {
    pending: queue.length,
    items: queue.map(e => ({
      id: e.id,
      idempotencyKey: e.orderData.idempotencyKey || e.orderData.idempotency_key || 'unknown',
      attempts: e.attempts,
      lastAttempt: e.lastAttempt,
      createdAt: e.createdAt
    }))
  };
}

// إرسال طلب فوراً وإضافته للطابور إذا فشل
async function sendOrEnqueue(orderData) {
  const url = CASHIER_API_URL();
  const key = CASHIER_API_KEY();
  if (!url || !key) {
    enqueue(orderData);
    return { status: 'queued', reason: 'cashier_api_not_configured' };
  }
  try {
    const resp = await fetch(`${url}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': key
      },
      body: JSON.stringify(orderData),
      signal: AbortSignal.timeout(10000)
    });
    if (resp.ok || resp.status === 409) {
      return { status: 'sent', httpStatus: resp.status };
    }
    enqueue(orderData);
    return { status: 'queued', reason: `http_${resp.status}` };
  } catch (e) {
    enqueue(orderData);
    return { status: 'queued', reason: e.message };
  }
}

module.exports = { start, stop, sendOrEnqueue, enqueue, getStatus, processQueue, loadQueue };
