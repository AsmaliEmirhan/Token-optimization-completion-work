# TokenAI

TokenAI; LLM token kullanımını, tahmini API maliyetini ve gecikmeyi izleyen React/Vite + Express uygulamasıdır.

## L1 Exact Cache

Backend, başarılı ve cache politikasına uygun yanıtları süreç belleğinde saklar. Anahtar; cache şema sürümü, sağlayıcı, ham model kimliği, mesaj, sistem talimatı, konuşma bağlamı, üretim parametreleri, güvenlik kapsamı ve kararlı harici bağlam parmak izlerinden SHA-256 ile üretilir. API anahtarları cache anahtarına veya kaydına girmez.

- `L1_CACHE_TTL_MS`: Kayıt yaşam süresi; varsayılan 30 dakika.
- `L1_CACHE_MAX_ENTRIES`: En fazla kayıt sayısı; varsayılan 500.
- Kapasite dolduğunda deterministik LRU tahliyesi uygulanır.
- Cache tamamen in-memory'dir; backend yeniden başlatıldığında kayıtlar kaybolur.
- Güncel veri, streaming, harici yan etki, eksik güvenlik kapsamı ve kararsız tool/retrieval bağlamı cache'i bypass eder.

Dinamik içerik filtresi bilinçli olarak muhafazakâr bir ilk katmandır; semantik güvenlik kanıtı değildir. Gerçek kullanıcı/tenant kimliği üretimde kimliği doğrulanmış sunucu oturumundan beslenmelidir. Mevcut arayüz, farklı tarayıcı oturumlarını ayırmak için session-scoped bir kimlik gönderir. Eşzamanlı aynı isteklerin in-flight birleştirilmesi bu sürümde yapılmaz; güvenli kapsam ve telemetri semantiği korunarak ileride eklenebilir.

L1 yalnızca exact hit üretir. Benzer anlamlı sorular, farklı model veya farklı sağlayıcı arasında paylaşım yapılmaz. Cache kaydındaki ayrı `answerId` ve kaynak metadata alanları, ileride doğrulanmış L2 Semantic Cache/answer-store adaptörü eklenebilmesi için hazırdır.

## Kontroller

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Geliştirme

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
