// ============================================
// middlewares/posReadOnlyGuard.js
// حارس القراءة فقط لبيانات وسجلات الكاشير (POS)
// يمنع أي محاولة تعديل أو حذف أو إنشاء لبيانات الكاشير التشغيلية من خلال موقع الويب
// ============================================

function blockPosMutation(actionDescription = 'تعديل بيانات الكاشير') {
  return function(req, res, next) {
    const method = req.method.toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return res.status(403).json({
        error: 'READ_ONLY_POS_RECORD',
        message: `تم رفض العملية (${actionDescription}): السجلات التشغيلية للكاشير (الفواتير المتزامنة، الورديات، المصروفات، حركات الخزينة) مخصصة للعرض والتقارير والمراقبة فقط ولا يمكن تعديلها من خلال الموقع الإلكتروني.`,
        isReadOnly: true
      });
    }
    next();
  };
}

module.exports = {
  blockPosMutation
};
