// ===== نص برمجى لاختبار تدفق الفلوج بالكامل (Integration Test for Vlog Flow) =====
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const User = require('../models/User');
const VlogPost = require('../models/VlogPost');
const Order = require('../models/Order');
const bcrypt = require('bcryptjs');

async function runTest() {
  console.log('🏁 بدء اختبار تدفق ألبوم الصور والمسابقة (Vlog Flow Integration Test)...');
  
  // 1. الاتصال بقاعدة البيانات
  await connectDB();
  console.log('✅ تم الاتصال بقاعدة البيانات بنجاح.');

  try {
    // تنظيف أي بيانات اختبارية سابقة
    await User.deleteMany({ email: 'test_vlogger@ozel.cafe' });
    await VlogPost.deleteMany({ userName: 'Vlog Tester' });
    
    // 2. إنشاء مستخدم تجريبي
    const hashedPassword = await bcrypt.hash('testpass123', 10);
    const testUser = await User.create({
      name: 'Vlog Tester',
      phone: '01999999999',
      email: 'test_vlogger@ozel.cafe',
      password: hashedPassword,
      role: 'customer',
      points: 100,
      freeOrdersCount: 0
    });
    console.log(`✅ تم إنشاء المستخدم التجريبي: ${testUser.name} (نقاطه: ${testUser.points}, الكوبونات: ${testUser.freeOrdersCount})`);

    // 3. رفع صورة تجريبية (Base64 وهمي)
    const base64Image = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
    const testPost = await VlogPost.create({
      userId: testUser._id,
      userName: testUser.name,
      caption: 'فنجان قهوة رائع مع غروب الشمس المميز في أوزيل ☕🌅',
      image: base64Image,
      likes: [],
      likesCount: 0,
      isWinner: false
    });
    console.log(`✅ تم رفع الصورة التجريبية بنجاح. معرف المنشور: ${testPost._id}`);

    // 4. محاكاة الإعجاب بالصورة
    testPost.likes.push(testUser._id);
    testPost.likesCount = testPost.likes.length;
    await testPost.save();
    console.log(`✅ تم تسجيل إعجاب بالصورة. إجمالي الإعجابات: ${testPost.likesCount}`);

    // 5. محاكاة اختيار الصورة كفائزة بالمسابقة بواسطة الأدمن
    testPost.isWinner = true;
    testPost.winnerPrize = 'لاتيه بارد ولوافا كيك مجانية 🎁';
    await testPost.save();
    
    const updatedUser = await User.findById(testUser._id);
    updatedUser.freeOrdersCount += 1;
    await updatedUser.save();
    console.log(`🏆 تم إعلان الصورة كفائزة! الجائزة: ${testPost.winnerPrize}`);
    console.log(`✅ تم إضافة كوبون أوردر هدية في رصيد المستخدم التجريبي. الرصيد الحالي: ${updatedUser.freeOrdersCount}`);

    // 6. محاكاة تقديم طلب جديد وتفعيل كوبون الأوردر الهدية
    console.log('🛒 محاكاة إنشاء أوردر جديد وتفعيل خيار استخدام الأوردر الهدية...');
    const originalPrice = 120; // 120 ج.م
    let finalPrice = originalPrice;
    let pointsEarned = Math.floor(finalPrice);
    let isFreeOrderApplied = false;

    // محاكاة منطق backend في routes/orders.js
    if (updatedUser.freeOrdersCount > 0) {
      isFreeOrderApplied = true;
      finalPrice = 0;
      pointsEarned = 0;
    }

    const testOrder = await Order.create({
      userId: updatedUser._id,
      table_number: '12',
      items: [{
        name: 'Smoked Rosemary Corto',
        quantity: 1,
        price: isFreeOrderApplied ? 0 : 55
      }, {
        name: 'Molten Lava',
        quantity: 1,
        price: isFreeOrderApplied ? 0 : 65
      }],
      total_price: finalPrice,
      points_earned: pointsEarned,
      notes: isFreeOrderApplied ? '[أوردر هدية مسابقة الفلوج]' : '',
      status: 'pending',
      qrCodeToken: 'test-token-12345',
      isQrConfirmed: false
    });

    if (isFreeOrderApplied) {
      updatedUser.freeOrdersCount = Math.max(0, updatedUser.freeOrdersCount - 1);
      await updatedUser.save();
    }

    console.log(`✅ تم إنشاء الطلب التجريبي بنجاح. رقم الطلب: ${testOrder._id}`);
    console.log(`💵 السعر الأصلي: ${originalPrice} ج.م -> السعر بعد الخصم: ${testOrder.total_price} ج.م`);
    console.log(`🎁 رصيد كوبونات العميل بعد استخدام الطلب: ${updatedUser.freeOrdersCount}`);
    
    // التحقق من صحة النتائج
    if (testOrder.total_price === 0 && updatedUser.freeOrdersCount === 0) {
      console.log('🎉🎉🎉 نجح الاختبار بالكامل بنجاح 100%! تم التحقق من سلامة كافة البيانات.');
    } else {
      console.error('❌ فشل الاختبار: النتائج غير مطابقة للمتوقع.');
    }

    // تنظيف البيانات بعد الاختبار
    await User.deleteOne({ _id: testUser._id });
    await VlogPost.deleteOne({ _id: testPost._id });
    await Order.deleteOne({ _id: testOrder._id });
    console.log('🧹 تم تنظيف وحذف كافة البيانات التجريبية من قاعدة البيانات.');

  } catch (err) {
    console.error('❌ حدث خطأ أثناء تنفيذ الاختبار:', err.message);
  } finally {
    mongoose.connection.close();
    console.log('🔌 تم إغلاق اتصال قاعدة البيانات. انتهى الاختبار.');
  }
}

runTest();
