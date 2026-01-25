<div dir="rtl">

# MarkPDFdown

[English](./README.md) | [中文](./README.zh-CN.md) | [日本語](./README.ja.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [فارسی](./README.fa.md)

یک برنامه دسکتاپ که اسناد PDF را با استفاده از تشخیص بصری مدل‌های زبانی بزرگ (LLM) به فرمت Markdown تبدیل می‌کند.

## ویژگی‌ها

- **پشتیبانی از چندین LLM**: OpenAI، Anthropic Claude، Google Gemini، Ollama (مدل‌های محلی) و OpenAI Responses API
- **تبدیل با کیفیت بالا**: استفاده از قابلیت‌های بینایی LLM برای تبدیل دقیق PDF به Markdown
- **پیش‌نمایش کنار هم**: مشاهده صفحات اصلی PDF در کنار Markdown تولید شده
- **پشتیبانی از ریاضیات و کد**: پشتیبانی کامل از معادلات LaTeX (KaTeX) و بلوک‌های کد با برجسته‌سازی نحوی
- **رابط کاربری چند زبانه**: انگلیسی، چینی، ژاپنی، روسی، عربی و فارسی
- **پردازش موازی**: نمونه‌های کارگر قابل تنظیم برای تبدیل سریع‌تر
- **پیگیری پیشرفت**: به‌روزرسانی وضعیت در زمان واقعی و پشتیبانی از تلاش مجدد برای هر صفحه
- **ذخیره‌سازی محلی**: پایگاه داده SQLite برای ماندگاری وظایف

## تصاویر

<img width="1264" height="848" alt="1769311168213_download" src="https://github.com/user-attachments/assets/15b5a801-6729-492a-a979-1fc4dba6853a" />

## نصب

### شروع سریع (پیشنهادی)

اجرای مستقیم با npx (نیاز به Node.js 18+):

```bash
npx -y markpdfdown
```

### دانلود نصب‌کننده

آخرین نسخه را برای پلتفرم خود از صفحه [Releases](https://github.com/MarkPDFdown/markpdfdown-desktop/releases) دانلود کنید:

- **Windows**: `MarkPDFdown-{version}-x64.exe`
- **macOS**: `MarkPDFdown-{version}-arm64.dmg` / `MarkPDFdown-{version}-x64.dmg`
- **Linux**: `MarkPDFdown-{version}-x86_64.AppImage`

## نحوه استفاده

1. **پیکربندی ارائه‌دهنده**: به تنظیمات بروید و اعتبارنامه‌های ارائه‌دهنده LLM را اضافه کنید (کلید API، آدرس پایه)
2. **افزودن مدل**: مدلی که می‌خواهید برای تبدیل استفاده کنید را پیکربندی کنید
3. **آپلود PDF**: فایل PDF را بکشید و رها کنید یا کلیک کنید تا انتخاب کنید
4. **انتخاب مدل**: مدل LLM را برای تبدیل انتخاب کنید
5. **تبدیل**: فرآیند تبدیل را شروع کنید
6. **پیش‌نمایش**: نتایج را صفحه به صفحه با مقایسه کنار هم مشاهده کنید
7. **دانلود**: فایل Markdown ادغام شده را صادر کنید

## توسعه

### پیش‌نیازها

- Node.js 18+
- npm 8+

### راه‌اندازی

```bash
# نصب وابستگی‌ها
npm install

# تولید کلاینت Prisma
npm run generate

# اجرای مایگریشن‌های پایگاه داده
npm run migrate:dev

# شروع سرور توسعه
npm run dev
```

### ساخت

```bash
# ساخت تولیدی
npm run build

# نصب‌کننده‌های مخصوص پلتفرم
npm run build:win    # نصب‌کننده Windows NSIS
npm run build:mac    # macOS DMG
npm run build:linux  # Linux AppImage
```

### تست

```bash
npm test              # اجرای تمام تست‌ها
npm run test:unit     # فقط تست‌های واحد
npm run test:renderer # فقط تست‌های کامپوننت
npm run test:coverage # تولید گزارش پوشش
```

### ساختار پروژه

```
src/
├── main/                 # فرآیند اصلی Electron
│   ├── index.ts         # نقطه ورود برنامه، ایجاد پنجره، راه‌اندازی IPC
│   └── ipc/             # هندلرهای IPC
├── preload/             # اسکریپت‌های پیش‌بارگذاری (window.api)
├── renderer/            # فرانت‌اند React
│   ├── components/      # کامپوننت‌های UI
│   ├── pages/           # صفحات مسیر
│   └── locales/         # ترجمه‌های i18n
├── core/                # منطق کسب‌وکار (معماری تمیز)
│   ├── infrastructure/  # پایگاه داده، سرویس‌های خارجی
│   ├── application/     # کارگرها، هماهنگ‌سازی
│   ├── domain/          # رابط‌ها، انواع دامنه
│   └── shared/          # گذرگاه رویداد، ابزارها
└── shared/              # انواع مشترک بین main/renderer
```

## پشته فناوری

- **فریم‌ورک**: Electron 35 + React 18 + TypeScript
- **ابزار ساخت**: Vite 6
- **رابط کاربری**: Ant Design 5
- **پایگاه داده**: Prisma ORM + SQLite
- **پردازش PDF**: pdf-lib، pdf-to-png-converter، Sharp
- **Markdown**: react-markdown، remark-gfm، remark-math، rehype-katex، rehype-prism-plus
- **تست**: Vitest + Testing Library

## ارائه‌دهندگان LLM پشتیبانی شده

| ارائه‌دهنده | مدل‌ها | یادداشت‌ها |
|-------------|--------|------------|
| OpenAI | GPT-4o، GPT-4-turbo و غیره | نیاز به کلید API |
| Anthropic | Claude 3.5، Claude 3 و غیره | نیاز به کلید API |
| Google Gemini | Gemini Pro، Gemini Flash و غیره | نیاز به کلید API |
| Ollama | LLaVA، Llama 3.2 Vision و غیره | محلی، بدون نیاز به کلید API |
| OpenAI Responses | هر مدل سازگار با OpenAI | پشتیبانی از endpoint سفارشی |

## مجوز

[Apache-2.0](./LICENSE)

## مشارکت

از مشارکت‌ها استقبال می‌شود! لطفاً فایل [AGENTS.md](./AGENTS.md) را برای راهنمای توسعه مطالعه کنید.

</div>
