# CLAUDE.md — شجرة العائلة

تطبيق شجرة عائلة **متعدد المستأجرين** موجَّه للعائلات العربية في المهجر. ويب + PWA
من مصدر واحد. الحالة الكاملة والقرارات في
[`docs/superpowers/specs/2026-09-10-family-tree-redesign-design.md`](docs/superpowers/specs/2026-09-10-family-tree-redesign-design.md).

## الثوابت — لا تُكسَر بلا نقاش صريح

هذه قرارات كلّفت جلسة تصميم كاملة، وكسرها بحسن نية يُبطلها. صُممت لتبقى صحيحة
عبر كل إعادة هيكلة:

1. **`personId` ثابت أبدي** — لا يُعاد توليده في أي استيراد أو ترحيل. الروابط بين
   الشجرات إشارات إلى معرّفات؛ تغييرها يكسرها بلا إصلاح.
2. **`name` دائماً `{ar, en}`** — لا نص مفرد أبداً. الأسماء الإنجليزية إلزامية
   (نقل حرفي مقترح قابل للتعديل).
3. **`t()` هو الطريق الوحيد لإخراج أي نص** — يستحيل نصٌّ غير مترجم بنيوياً.
4. **مصدر الصلاحية `trees/{treeId}/members/{uid}` فقط** — لا `users/{uid}` أبداً
   (قابل للكتابة من صاحبه). لا تُمنح `owner` عبر دعوة.
5. **`lang` تفضيل شخصي** في `users/{uid}` — لا يُكتب في مستند الشجرة المشترك.
6. **حذف الشجرة ممنوع على الخادم** (`allow delete: if false`).
7. **النسب والتقويم الهجري افتراضات** لا إعدادات — الجمهور عربي بالكامل.

## الشكل العام — توجيه دائم من المالك

المظهر **أولوية مستمرة**، لا لمسة أخيرة. التطبيق يجب أن يكون **جذاباً**، بـ**كروت
ملونة هادئة** على غرار التطبيقات الشقيقة في مجلد `GitHub/`. عند أي عمل على الواجهة:
استخدم مهارتَي `frontend-design` و `design`، واعتمد لوحة الألوان الترابية الحالية
(`--paper`, `--emerald`, `--gold`) أساساً. لا تصميم يبدو قالبياً افتراضياً.

## الأمن — قاعدة المؤسسة ٢

أي تغيير أمني (قواعد، مصادقة، صلاحيات، دعوات) يُراجَع بوكيل **مختلف** عن كاتبه
(`pr-review-toolkit:code-reviewer` + `pr-review-toolkit:silent-failure-hunter`) قبل
إعلان الانتهاء. النتائج ≥85% ثقة تُصلَح الآن.

## النشر و CI

- **GitHub Pages من `main` مباشرة** (`build_type: legacy`) — أي `git push` إلى
  `main` يُنشَر فوراً. لا workflow، لا تكلفة CI.
- **القواعد:** `firebase deploy --only firestore:rules --project family-tree-app-d9238`.
  تُختبر أولاً بـ `npm run test:rules` (محاكي Firestore).
- المستودع **عام** — دقّق قبل رفع أي شيء.

## Firebase

مشروع `family-tree-app-d9238`. مفتاح Web في `index.html` عامٌّ بطبيعته (ليس سراً) —
الحماية الحقيقية في `firestore.rules`، لا في العميل.

## أوامر

- اختبار القواعد: `npm run test:rules`
- معاينة محلية: `python -m http.server 5599` (أو إعداد `.claude/launch.json`)

<!-- BEGIN firebase-access pointer -->

## Firebase access

Before asking which Firebase project this is, where its credentials are, or what
its environment variables are called, run:

```bash
node ~/.claude/skills/firebase-access/scripts/fbctl.mjs resolve
```

It answers from a machine-local registry — project id, platform, env var naming,
and whether credentials are stored — so none of that needs asking again. Use
`fbctl env <alias> --platform=<p>` for a filled `.env`, and `fbctl scaffold` for
the house client file.

Three rules that matter wherever Firebase is touched:

- **Never put a credential on a command line.** Use `fbctl exec <alias> -- <cmd>`,
  which injects it into the child's environment. Agent harnesses record an
  approved command verbatim, so a key inside one becomes permanent plaintext.
- **A web `apiKey` is public by design** — it ships in every client bundle.
  `firestore.rules` is the real access control, so fix rules, not keys.
- **If `resolve` refuses** because evidence "could not be read", fix the file it
  names rather than working around it. It means this folder's Firebase identity
  is unreadable, and guessing past it can point the session at another project.

Full rules live in the org's internal standards repo, installed locally at
`~/.claude/skills/firebase-access/` — `SKILL.md` for Claude Code, `AGENTS.md`
for any other assistant.

<!-- END firebase-access pointer -->
