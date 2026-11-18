# Gün Planlayıcı

Gününü planlamakta zorlanan öğrenciler için bir mobil uygulama (Expo / React Native).

1. Öğrenci **Koç** sekmesine o gün yapması gerekenleri yazar ("matematik ödevi, 1 saat İngilizce, saat 5'te antrenman").
   Soru sayısı yazılırsa ("100 soru Türkçe") süre, ilk açılışta sorulan **sınıfa** ve derse göre soru başına tahmin edilir
   (`src/planner/estimate.ts`). Öğrenci süreyi kendisi yazarsa ("100 soru Türkçe 2 saat") onun süresi kullanılır.
2. Koç saatli bir plan çıkarır. Plan **Bugün** sekmesinde checkbox listesi olarak görünür.
3. Gün sonunda (bildirim ya da "Günü bitir" ile) koç **"Planına uydun mu?"** diye sorar. Yapılmayan her iş için **neden** yapılamadığını sorar.
4. Bu cevaplara göre **yarının planını uyarlar**. Yarım kalan işler öne alınır; nedene göre bloklar kısaltılır, bölünür, tampon ya da esnek zaman eklenir.

## Çalıştırma

```bash
npm install
npx expo start        # QR kodu Expo Go ile okut ya da "a" ile Android emülatörünü aç
```

Kontroller:

```bash
npm run typecheck     # tsc --noEmit
npm test              # jest
npx expo-doctor
```

## Web sürümü (indirmeden dene)

**https://unwin41.github.io/gun-planlayici/**

`main` dalına her push'ta `.github/workflows/deploy-web.yml` testleri çalıştırır, web sürümünü derler ve GitHub Pages'e yayınlar.

- Uygulama `app.json` içindeki `experiments.baseUrl` (`/gun-planlayici`) altında çalışır. Repo adı değişirse bu da değişmeli.
- Web'de yalnızca basit mod var. Tarayıcıda güvenli anahtar deposu olmadığı için Ayarlar'daki yapay zeka bölümü gizlenir.
- Web'de bildirim yok, gün sonu "Günü bitir" ile başlatılır.
- Veriler tarayıcının yerel deposunda kalır. Tarayıcı verisi silinirse ya da başka bir cihaz kullanılırsa planlar görünmez.

## APK derleme (telefona yüklemek için)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1
```

Betik projeyi kısa bir ASCII klasöre (`C:\gp\app`) eşitler, orada `expo prebuild` ile `android/` klasörünü üretir,
`gradlew assembleRelease` ile derler ve APK'yı masaüstüne `GunPlanlayici.apk` olarak kopyalar. Bu ara adımın
nedeni şu: klasör adındaki Türkçe karakterler ve Windows'un 260 karakterlik yol sınırı Gradle/CMake derlemesini bozuyor.

- Gerekenler: JDK 17 (`%LOCALAPPDATA%\Programs\jdk17`), Android SDK (`%LOCALAPPDATA%\Android\Sdk`) ve SDK içinde
  CMake 3.31.6 (`sdkmanager "cmake;3.31.6"`). Eksik platform, build-tools ve NDK paketlerini Gradle ilk derlemede kendisi
  indirir. İndirme yarıda kesilirse ilgili paketi `sdkmanager` ile elle kurun.
- **Windows uzun yol desteği açık olmalı.** React Native'in C++ derlemesi 260 karakteri aşan yollar üretiyor.
  Yönetici olarak bir kez çalıştırın:
  `reg add HKLM\SYSTEM\CurrentControlSet\Control\FileSystem /v LongPathsEnabled /t REG_DWORD /d 1 /f`.
  Varsayılan CMake 3.22.1'in Ninja'sı bu ayarla bile uzun yolları desteklemediği için betik CMake 3.31.6'yı kullanır.
- `react-native-gesture-handler`, `expo-router`'ın kullanılmayan Stack/Drawer gezinmesinin eş bağımlılığı olarak kuruluyor.
  Yerel kodu `react-native.config.js` ile bağlanmıyor. Uygulamaya JS Stack ya da Drawer eklenirse bu ayar kaldırılmalı.
- Varsayılan olarak yalnızca `arm64-v8a` (günümüz telefonlarının neredeyse tamamı) için derlenir.
  Çok eski 32 bit telefonlar için: `-Architectures arm64-v8a,armeabi-v7a`.
- APK, Expo şablonunun hata ayıklama (debug) anahtarıyla imzalanır. Telefona doğrudan yüklemek için yeterlidir,
  Play Store'a yüklemek için gerçek bir imza anahtarı gerekir.
- İkonlar `assets/images/` içinde (`icon.png`, `android-icon-*.png`, `splash-icon.png`, `favicon.png`).

## Yapay zeka (hibrit)

- **Basit mod (varsayılan, ücretsiz, internetsiz):** `src/planner/rulePlanner.ts`, Türkçe metni kurallarla ayrıştırır ve planlar.
- **Yapay zeka modu:** Ayarlar'a bir Claude API anahtarı girilirse planı Claude hazırlar (`src/planner/aiPlanner.ts`).
  Model `src/config.ts` içindeki `AI_MODEL` sabitinde (varsayılan `claude-opus-5-5`, daha ucuz seçenek `claude-haiku-5-5`).
- Yapay zeka hata verirse (ağ yok, anahtar geçersiz, geçersiz cevap) uygulama otomatik olarak basit moda düşer ve bunu söyler.
- Anahtar cihazda `expo-secure-store` ile şifreli saklanır, uygulamaya **gömülmez**. Uygulama çok sayıda öğrenciye dağıtılacaksa
  anahtarı tutan küçük bir sunucu (proxy) kurulmalı ve `AI_BASE_URL` ona yönlendirilmelidir.
- Claude'a yalnızca görev metinleri, saatler ve "neden yapamadım" cevapları gönderilir; isim ya da kimlik bilgisi gönderilmez.

## Yapı

```
src/
  app/            Ekranlar (expo-router): _layout, index (Bugün), chat (Koç), history (Geçmiş), settings (Ayarlar)
  chat/           coach.ts (yönlendirmeli sohbet akışı), flow.ts (saf yardımcılar), steps.ts (adım tipleri)
  planner/        index.ts (hibrit seçici), rulePlanner, parse, schedule, aiPlanner, prompts, schema, validate
  store/          zustand + AsyncStorage (planlar, check-in'ler, sohbet; hepsi cihazda)
  components/     TaskItem, Onboarding, ui (Button, Card, Chip, Field, ProgressBar…)
  notifications.ts  Günlük gün sonu hatırlatması (yerel bildirim)
  secureKey.ts      API anahtarı saklama
__tests__/        Ayrıştırma, yerleştirme, uyarlama kuralları, AI çıktısı doğrulama, uçtan uca sohbet akışı
```

"Bot" serbest bir sohbet botu değil, **yönlendirmeli bir akış**. Sorular `coach.ts` içinde sabit; yapay zeka yalnızca plan üretiminde
kullanılıyor. Bu sayede akış tahmin edilebilir kalıyor, maliyet düşük oluyor ve yapay zeka olmadan da aynı deneyim çalışıyor.

## Bilinen sınırlar

- Klasör adındaki Türkçe karakterler yüzünden `create-expo-app` doğrudan bu klasörde çalışmadı. İskelet ASCII adla oluşturulup buraya
  taşındı. Metro ve npm bu yolda sorunsuz çalışıyor.
- Web derlemesinde SecureStore olmadığı için anahtar `localStorage`'da tutulur (yalnızca geliştirme/deneme için).
- Hesap, cihazlar arası senkron ve veli/öğretmen görünümü yok (MVP kapsamı dışında).
