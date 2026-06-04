# AutoStyle — авторизация только по почте и телефону

В этой версии социальные входы полностью отключены из интерфейса и кода сайта.
Оставлены только:

- регистрация по e-mail и паролю;
- подтверждение e-mail письмом Firebase;
- вход по e-mail и паролю;
- вход по телефону через SMS-код;
- привязка телефона к существующему профилю;
- повторная отправка письма подтверждения;
- восстановление/смена пароля в профиле.

## Что включить в Firebase

Firebase Console → Authentication → Sign-in method:

1. Email/Password — Enable.
2. Phone — Enable.
3. Google — Disable.
4. Facebook — Disable.
5. Apple — Disable.

## Домены

Firebase Console → Authentication → Settings → Authorized domains:

- добавьте основной домен сайта;
- добавьте тестовый домен хостинга, если проверяете сайт не на основном домене.

## SMS

Для тестов в Phone provider можно добавить тестовый номер и тестовый код.
Для продакшена Firebase будет отправлять реальные SMS по правилам вашего Firebase-проекта.

## Файлы, которые были изменены

- js/auth-core.js — оставлены только Email/Password и Phone Auth.
- js/app.js — убран вход через сервисы на главной.
- js/catalog.js — убран вход через сервисы в каталоге.
- js/auth.js — убрана генерация OAuth-кнопок.
- js/profile.js — блок безопасности теперь только почта + телефон.
- js/mobile-app.js — мобильный профиль теперь только почта + SMS.
- index.html/catalog.html/login.html и другие HTML — удалены кнопки Google/Facebook/Apple из модальных окон.

## Проверка

Откройте:

- index.html — кнопка аккаунта: почта + SMS;
- catalog.html — кнопка аккаунта: почта + SMS;
- profile.html#security — подтверждение почты и привязка телефона;
- mobile-profile.html — мобильный вход/регистрация по почте и SMS.
