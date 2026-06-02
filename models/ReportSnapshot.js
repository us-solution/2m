// ===== نموذج ReportSnapshot - يمثل لقطات التقارير المحفوظة =====
const mongoose = require('mongoose');

const reportSnapshotSchema = new mongoose.Schema({
  // نوع التقرير (ملخص يومي، أفضل العناصر، تنبيهات المخزون)
  type: {
    type: String,
    required: true,
    enum: ['daily_summary', 'top_items', 'inventory_alerts']
  },
  // بيانات التقرير
  data: mongoose.Schema.Types.Mixed,
  // تاريخ اللقطة
  snapshotDate: { type: String },
  // تاريخ الإنشاء
  createdAt: { type: Date, default: Date.now }
});

reportSnapshotSchema.index({ type: 1, snapshotDate: -1 });

module.exports = mongoose.models.ReportSnapshot || mongoose.model('ReportSnapshot', reportSnapshotSchema);
