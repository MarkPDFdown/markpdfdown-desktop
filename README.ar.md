<div dir="rtl">

# MarkPDFdown

[English](./README.md) | [中文](./README.zh-CN.md) | [日本語](./README.ja.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [فارسی](./README.fa.md)

تطبيق سطح مكتب يقوم بتحويل مستندات PDF إلى تنسيق Markdown باستخدام التعرف البصري لنماذج اللغة الكبيرة (LLM).

## المميزات

- **دعم نماذج LLM متعددة**: OpenAI وAnthropic Claude وGoogle Gemini وOllama (نماذج محلية) وOpenAI Responses API
- **تحويل عالي الجودة**: يستفيد من قدرات الرؤية في LLM لتحويل دقيق من PDF إلى Markdown
- **معاينة جنبًا إلى جنب**: عرض صفحات PDF الأصلية بجانب Markdown المُنشأ
- **دعم الرياضيات والأكواد**: دعم كامل لمعادلات LaTeX (KaTeX) وكتل الأكواد مع تمييز بناء الجملة
- **واجهة متعددة اللغات**: الإنجليزية والصينية واليابانية والروسية والعربية والفارسية
- **المعالجة المتوازية**: مثيلات عمل قابلة للتكوين لتحويل أسرع
- **تتبع التقدم**: تحديثات الحالة في الوقت الفعلي ودعم إعادة المحاولة لكل صفحة
- **التخزين المحلي**: قاعدة بيانات SQLite لحفظ المهام

## لقطات الشاشة

<img width="1264" height="848" alt="1769311168213_download" src="https://github.com/user-attachments/assets/15b5a801-6729-492a-a979-1fc4dba6853a" />

## التثبيت

### البدء السريع (موصى به)

التشغيل مباشرة باستخدام npx (يتطلب Node.js 18+):

```bash
npx -y markpdfdown
```

### تحميل المثبت

قم بتحميل أحدث إصدار لمنصتك من صفحة [Releases](https://github.com/MarkPDFdown/markpdfdown-desktop/releases):

- **Windows**: `MarkPDFdown-{version}-x64.exe`
- **macOS**: `MarkPDFdown-{version}-arm64.dmg` / `MarkPDFdown-{version}-x64.dmg`
- **Linux**: `MarkPDFdown-{version}-x86_64.AppImage`

## الاستخدام

1. **تكوين المزود**: انتقل إلى الإعدادات وأضف بيانات اعتماد مزود LLM (مفتاح API، عنوان URL الأساسي)
2. **إضافة النموذج**: قم بتكوين النموذج الذي تريد استخدامه للتحويل
3. **رفع PDF**: اسحب وأفلت أو انقر لاختيار ملف PDF
4. **اختيار النموذج**: اختر نموذج LLM للتحويل
5. **التحويل**: ابدأ عملية التحويل
6. **المعاينة**: عرض النتائج صفحة بصفحة مع المقارنة جنبًا إلى جنب
7. **التحميل**: تصدير ملف Markdown المدمج

## التطوير

### المتطلبات الأساسية

- Node.js 18+
- npm 8+

### الإعداد

```bash
# تثبيت التبعيات
npm install

# إنشاء عميل Prisma
npm run generate

# تشغيل ترحيلات قاعدة البيانات
npm run migrate:dev

# تشغيل خادم التطوير
npm run dev
```

### البناء

```bash
# بناء الإنتاج
npm run build

# مثبتات خاصة بالمنصة
npm run build:win    # مثبت Windows NSIS
npm run build:mac    # macOS DMG
npm run build:linux  # Linux AppImage
```

### الاختبار

```bash
npm test              # تشغيل جميع الاختبارات
npm run test:unit     # اختبارات الوحدة فقط
npm run test:renderer # اختبارات المكونات فقط
npm run test:coverage # إنشاء تقرير التغطية
```

### هيكل المشروع

```
src/
├── main/                 # العملية الرئيسية لـ Electron
│   ├── index.ts         # نقطة الدخول، إنشاء النافذة، إعداد IPC
│   └── ipc/             # معالجات IPC
├── preload/             # سكربتات التحميل المسبق (window.api)
├── renderer/            # واجهة React الأمامية
│   ├── components/      # مكونات واجهة المستخدم
│   ├── pages/           # صفحات المسارات
│   └── locales/         # ترجمات i18n
├── core/                # منطق الأعمال (العمارة النظيفة)
│   ├── infrastructure/  # قاعدة البيانات، الخدمات الخارجية
│   ├── application/     # العمال، التنسيق
│   ├── domain/          # الواجهات، أنواع المجال
│   └── shared/          # ناقل الأحداث، الأدوات المساعدة
└── shared/              # الأنواع المشتركة بين main/renderer
```

## المكدس التقني

- **الإطار**: Electron 35 + React 18 + TypeScript
- **أداة البناء**: Vite 6
- **واجهة المستخدم**: Ant Design 5
- **قاعدة البيانات**: Prisma ORM + SQLite
- **معالجة PDF**: pdf-lib، pdf-to-png-converter، Sharp
- **Markdown**: react-markdown، remark-gfm، remark-math، rehype-katex، rehype-prism-plus
- **الاختبار**: Vitest + Testing Library

## مزودو LLM المدعومون

| المزود | النماذج | ملاحظات |
|--------|---------|---------|
| OpenAI | GPT-4o، GPT-4-turbo، إلخ. | يتطلب مفتاح API |
| Anthropic | Claude 3.5، Claude 3، إلخ. | يتطلب مفتاح API |
| Google Gemini | Gemini Pro، Gemini Flash، إلخ. | يتطلب مفتاح API |
| Ollama | LLaVA، Llama 3.2 Vision، إلخ. | محلي، لا يحتاج مفتاح API |
| OpenAI Responses | أي نموذج متوافق مع OpenAI | دعم نقطة النهاية المخصصة |

## الترخيص

[Apache-2.0](./LICENSE)

## المساهمة

المساهمات مرحب بها! يرجى قراءة ملف [AGENTS.md](./AGENTS.md) للاطلاع على إرشادات التطوير.

</div>
