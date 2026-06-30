const QueueOrder = require('./models/QueueOrder');
const axios = require('axios');

const CASHIER_API_URL = () => process.env.CASHIER_API_URL;
const CASHIER_API_KEY = () => process.env.CASHIER_API_KEY;

let intervalId = null;
let isProcessing = false;

async function processEntry(entry) {
  const url = CASHIER_API_URL();
  const key = CASHIER_API_KEY();
  if (!url || !key) return false;

  try {
    const resp = await axios.post(`${url}/orders`, entry.orderData, {
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
      timeout: 10000,
      validateStatus: () => true
    });
    if (resp.status >= 200 && resp.status < 300) {
      console.log(`[RetryQueue] تم إرسال الطلب ${entry.orderData.idempotencyKey || 'unknown'} بنجاح`);
      await QueueOrder.findByIdAndDelete(entry._id);
      return true;
    }
    if (resp.status === 409) {
      console.log(`[RetryQueue] الطلب ${entry.orderData.idempotencyKey || 'unknown'} موجود مسبقاً (تم التخطي)`);
      await QueueOrder.findByIdAndDelete(entry._id);
      return true;
    }
    console.log(`[RetryQueue] فشل إرسال ${entry.orderData.idempotencyKey || 'unknown'}: HTTP ${resp.status}`);
    return false;
  } catch (e) {
    console.log(`[RetryQueue] فشل إرسال ${entry.orderData.idempotencyKey || 'unknown'}: ${e.message}`);
    return false;
  }
}

async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;
  try {
    const entries = await QueueOrder.find({ 
      status: 'pending',
      nextAttemptAt: { $lte: new Date() }
    }).sort({ createdAt: 1 }).limit(50);
    
    if (entries.length === 0) return;

    for (const entry of entries) {
      entry.attempts += 1;
      entry.lastAttempt = new Date();

      if (entry.attempts > entry.maxRetries) {
        entry.status = 'dead_letter';
        entry.failReason = 'exceeded_max_retries';
        await entry.save();
        console.log(`[RetryQueue] الطلب ${entry.orderData.idempotencyKey || 'unknown'} تجاوز الحد الأقصى → dead_letter`);
        continue;
      }

      const success = await processEntry(entry);
      if (!success) {
        // حساب تباعد زمني تنازلي تضاعفي (Exponential Backoff): 30 ثانية، دقيقة، دقيقتان، 4 دقائق...
        const delaySeconds = Math.min(3600, Math.pow(2, entry.attempts) * 15);
        entry.nextAttemptAt = new Date(Date.now() + delaySeconds * 1000);
        await entry.save();
        console.log(`[RetryQueue] فشل إرسال الطلب ${entry.orderData.idempotencyKey || 'unknown'}. جدولة المحاولة التالية خلال ${delaySeconds} ثانية.`);
      }
    }
  } finally {
    isProcessing = false;
  }
}

function start(intervalMs = 60000) {
  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(processQueue, intervalMs);
  console.log(`[RetryQueue] بدأ طابور إعادة المحاولة (MongoDB — كل ${intervalMs / 1000} ثانية)`);
  processQueue();
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

async function sendOrEnqueue(orderData) {
  const url = CASHIER_API_URL();
  const key = CASHIER_API_KEY();
  if (!url || !key) {
    await QueueOrder.create({ orderData, attempts: 0, nextAttemptAt: new Date(Date.now() + 30 * 1000), status: 'pending' });
    return { status: 'queued', reason: 'cashier_api_not_configured' };
  }
  try {
    const resp = await axios.post(`${url}/orders`, orderData, {
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
      timeout: 10000,
      validateStatus: () => true
    });
    if (resp.status >= 200 && resp.status < 300) {
      return { status: 'sent', httpStatus: resp.status };
    }
    if (resp.status === 409) {
      return { status: 'sent', httpStatus: resp.status, duplicate: true };
    }
    await QueueOrder.create({ orderData, attempts: 1, nextAttemptAt: new Date(Date.now() + 30 * 1000), status: 'pending' });
    return { status: 'queued', reason: `http_${resp.status}` };
  } catch (e) {
    await QueueOrder.create({ orderData, attempts: 1, nextAttemptAt: new Date(Date.now() + 30 * 1000), status: 'pending' });
    return { status: 'queued', reason: e.message };
  }
}

async function getStatus() {
  const pending = await QueueOrder.countDocuments({ status: 'pending' });
  const dead = await QueueOrder.countDocuments({ status: 'dead_letter' });
  const items = await QueueOrder.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(50).lean();
  return {
    pending,
    dead,
    items: items.map(e => ({
      id: e._id,
      idempotencyKey: e.orderData?.idempotencyKey || e.orderData?.idempotency_key || 'unknown',
      attempts: e.attempts,
      maxRetries: e.maxRetries,
      lastAttempt: e.lastAttempt,
      createdAt: e.createdAt
    }))
  };
}

module.exports = { start, stop, sendOrEnqueue, getStatus, processQueue };
