# مرجع أوامر العمل - Work Orders Knowledge Base

نسخة أولى من موقع Next.js مربوط مع Supabase لإدارة أوامر العمل والمواقع والبنود.

## ماذا يحتوي؟

- الصفحة الرئيسية: بحث عام بالبند على كل المشاريع.
- صفحة المشروع: بحث داخل مشروع واحد + قائمة المواقع.
- صفحة الموقع: قصة الموقع + سجل البنود وأوامر العمل.
- صفحة استيراد Excel من المتصفح: رفع الملف، ربط الأعمدة، معاينة، ثم استيراد إلى Supabase.

## التشغيل المحلي

1. فك الضغط.
2. افتح المجلد في VS Code أو ارفعه إلى GitHub.
3. انسخ الملف:

```bash
cp .env.local.example .env.local
```

4. ضع مفاتيح Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```

تجدها في Supabase:

Project Settings → API → Project URL + anon public key

5. شغل:

```bash
npm install
npm run dev
```

## النشر على Vercel

- ارفع المجلد إلى GitHub.
- اربط المستودع مع Vercel.
- أضف نفس متغيرات البيئة في Vercel:
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY

## ملاحظات مهمة

- لا تضع service_role key داخل الموقع؛ استخدم anon key فقط.
- الاستيراد يعمل لأن RLS في نسخة النموذج الأولي مفتوح للكتابة. لاحقًا عند إضافة تسجيل دخول، يجب تشديد السياسات.
- ربط الأعمدة في صفحة الاستيراد مرن، لأن ملفات Excel التشغيلية تختلف في شكلها.
