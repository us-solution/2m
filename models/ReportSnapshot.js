const mongoose = require('mongoose');

const reportSnapshotSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['daily_summary', 'top_items', 'inventory_alerts']
  },
  data: mongoose.Schema.Types.Mixed,
  snapshotDate: { type: String },
  createdAt: { type: Date, default: Date.now }
});

reportSnapshotSchema.index({ type: 1, snapshotDate: -1 });

module.exports = mongoose.models.ReportSnapshot || mongoose.model('ReportSnapshot', reportSnapshotSchema);
