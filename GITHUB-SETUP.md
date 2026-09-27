# إعداد نشر المنتجات عبر GitHub

من لوحة الإدارة لا تحتاج إلى تعديل ملفات المنتجات يدوياً.

في بيئة الخادم أضف:

- `GITHUB_TOKEN`: Personal Access Token بصلاحية Contents: Read and write للمستودع.
- `GITHUB_OWNER`: اسم حساب GitHub.
- `GITHUB_REPO`: اسم المستودع.
- `GITHUB_BRANCH`: الفرع، غالباً `main`.
- `GITHUB_PRODUCTS_PATH`: المسار الذي سيحفظ فيه ملف البيانات، والافتراضي `public/data/products.json`.
- `ADMIN_EMAIL`: بريد حساب المدير.

عند حفظ منتج من `/admin.html`:

1. يحفظ المنتج في قاعدة بيانات المتجر.
2. إذا رفعت صورة، يحاول حفظها داخل `public/images/products/` في GitHub.
3. يحدث `public/data/products.json` في GitHub.
4. يمكن استخدام زر «نشر إلى GitHub» لإعادة مزامنة كل المنتجات والأقسام.

إذا كان المستودع مرتبطاً بنشر تلقائي، ستصل تغييرات GitHub إلى الموقع بعد عملية النشر المعتادة.
