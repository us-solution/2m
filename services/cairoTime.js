// ===== توقيت القاهرة لبيانات الكاشير =====
// الكاشير يحفظ أوقات الورديات بالتوقيت المحلي للقاهرة كنص بدون منطقة زمنية
// ("2026-10-14 08:00:00")، والفواتير بتوقيت UTC بنفس الشكل. خوادم Vercel تعمل
// بتوقيت UTC، فقراءة النص كما هو تُزيح الوردية بفارق توقيت القاهرة (ساعتين أو 3).

const HAS_ZONE = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;
const LOCAL_TEXT = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/;

/** فارق توقيت القاهرة عن UTC بالدقائق في لحظة معينة (يشمل التوقيت الصيفي) */
function cairoOffsetMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(date);
  const p = {};
  parts.forEach(part => { p[part.type] = part.value; });
  const asIfUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((asIfUtc - date.getTime()) / 60000);
}

/** نص وقت محلي للقاهرة (بدون منطقة زمنية) → Date. النص الذي يحمل منطقة زمنية يُقرأ كما هو. */
function cairoLocalToDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  const m = text.match(LOCAL_TEXT);
  if (!m || HAS_ZONE.test(text)) {
    const d = new Date(text);
    return isNaN(d.getTime()) ? null : d;
  }
  const asUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
  // فارق التوقيت عند تلك اللحظة (مرتين لتفادي حدود التوقيت الصيفي)
  let result = asUtc - cairoOffsetMinutes(new Date(asUtc)) * 60000;
  result = asUtc - cairoOffsetMinutes(new Date(result)) * 60000;
  return new Date(result);
}

/** نص وقت UTC من قاعدة SQLite (بدون منطقة زمنية) → Date */
function sqliteUtcToDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  let iso = text;
  if (!HAS_ZONE.test(text) && LOCAL_TEXT.test(text)) iso = text.length === 10 ? `${text}T00:00:00Z` : `${text.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** "YYYY-MM-DD" → [بداية اليوم، نهاية اليوم] بتوقيت القاهرة */
function cairoDayBounds(dayText) {
  const m = String(dayText || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const start = cairoLocalToDate(`${m[1]}-${m[2]}-${m[3]} 00:00:00`);
  const end = new Date(cairoLocalToDate(`${m[1]}-${m[2]}-${m[3]} 23:59:59`).getTime() + 999);
  return [start, end];
}

module.exports = { cairoOffsetMinutes, cairoLocalToDate, sqliteUtcToDate, cairoDayBounds };
