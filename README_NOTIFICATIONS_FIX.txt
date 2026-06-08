Что исправлено:

1. Добавлен полный файл firestore.rules.
   Его можно целиком вставить в Firebase Console → Firestore Database → Rules.

2. В правила добавлены коллекции:
   - autostyle_notifications
   - autostyle_notification_reads
   - autostyle_discountCards
   - autostyle_home_cards
   - promoCards
   - homeCards

3. Обновлен js/admin-notifications.js:
   если запрос истории уведомлений с orderBy('createdAt') не проходит, админка пробует загрузить историю без orderBy и сортирует на клиенте.

Что заменить на сайте:
- js/admin-notifications.js
- FIRESTORE_NOTIFICATIONS_RULES.txt или firestore.rules использовать для Firebase Rules

После замены:
1. Вставь firestore.rules в Firebase Rules и нажми Publish.
2. Загрузи js/admin-notifications.js на GitHub.
3. Обнови сайт через Ctrl + F5.
