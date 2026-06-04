# AutoStyle — полноценная авторизация

В проект добавлена единая авторизация для десктопной и мобильной версии через Firebase Authentication.

## Что включено в код

- Email/пароль с отправкой письма подтверждения.
- Повторная отправка подтверждения email в профиле.
- Google Sign-In.
- Facebook Login.
- Apple Sign-In.
- Вход/регистрация по SMS.
- Привязка Google/Facebook/Apple к существующему профилю.
- Привязка телефона к существующему профилю через SMS.
- Синхронизация профиля в Firestore `autostyle_users`.
- Единая логика для мобильной версии и большой версии сайта.

## Что нужно включить в Firebase Console

1. Authentication → Sign-in method:
   - Email/Password: Enable.
   - Phone: Enable.
   - Google: Enable.
   - Facebook: Enable и вставить App ID + App Secret.
   - Apple: Enable и заполнить Team ID, Key ID, Service ID, private key.

2. Authentication → Settings → Authorized domains:
   - добавить домен сайта;
   - добавить домен тестового хостинга, если проверяете не на основном домене.

3. Для SMS:
   - Firebase Phone Auth работает только на разрешённых доменах;
   - на localhost работает для теста;
   - для продакшена настройте реальные квоты/биллинг Firebase.

4. Для Facebook/Apple дополнительно добавьте callback URL из Firebase Console в настройках приложений Facebook/Apple.

## Файлы, которые отвечают за авторизацию

- `js/auth-core.js` — единая логика авторизации и привязок.
- `js/auth.js` — страницы входа/регистрации.
- `js/app.js` — десктопная главная.
- `js/catalog.js` — десктопный каталог.
- `js/profile.js` — профиль, привязка сервисов, подтверждения.
- `js/mobile-app.js` — мобильный PWA-профиль и вход.
- `css/auth-upgrade.css` — стили блоков авторизации.
