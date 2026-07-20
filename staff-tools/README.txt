AUTO-STYLE refactor + admin panel

ФАЙЛЫ В КОРНЕ САЙТА:
- index.html              главная страница
- styles.css              стили главной
- app.js                  логика главной
- firebase-config.js      конфиг Firebase
- admin.html              админ-панель
- admin.css               стили админки
- admin.js                логика админки
- favicon.png             твоя иконка, если используется

КАК ЗАГРУЖАТЬ:
1. Распакуй архив.
2. Загрузи все файлы из папки autostyle_refactor в корень сайта.
3. Старый index.html переименуй в index-old.html или замени новым.
4. Открой index.html.
5. Админка открывается по адресу admin.html.

FIREBASE:
1. В Firebase Console создай проект.
2. Создай Web App.
3. Скопируй firebaseConfig.
4. Вставь его в firebase-config.js.
5. Включи Firestore Database.
6. В админке нажми «Сохранить в Firebase» — будет создан документ site/main.

ВРЕМЕННЫЕ ПРАВИЛА FIRESTORE ДЛЯ ПРОВЕРКИ:
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /site/main {
      allow read, write: if true;
    }
  }
}

ВАЖНО:
Эти правила открытые. Для настоящей защиты нужно подключить Firebase Authentication
и разрешить запись только админам.

ЧТО РЕДАКТИРУЕТСЯ В АДМИНКЕ:
- новости и таймер;
- банки и коэффициенты рассрочки;
- карточки меню;
- пользователи;
- полный JSON сайта.

ПРИМЕЧАНИЕ ПО БЕЗОПАСНОСТИ:
Текущие пользователи и пароли хранятся на фронте / в Firestore и видны технически опытному пользователю.
Это удобно для быстрого запуска, но не является полноценной защитой. Следующий правильный шаг — Firebase Authentication + роли.
