# Оплата картой через Agroprombank

Витрина AutoStyle остаётся статическим сайтом на GitHub Pages. Секретный
`MerchantPass` поэтому используется только в Firebase Cloud Functions и не
попадает в браузер.

## URL для анкеты банка

После публикации функций у магазина будут отдельные HTTPS-адреса без query
параметров:

```text
Result URL:
https://europe-west1-auto-style-4dbb7.cloudfunctions.net/apbPaymentResult

Success URL:
https://europe-west1-auto-style-4dbb7.cloudfunctions.net/apbPaymentSuccess

Fail URL:
https://europe-west1-auto-style-4dbb7.cloudfunctions.net/apbPaymentFail
```

Методы: Result — `POST`, Success — `GET`, Fail — `GET`.

## Секреты Firebase

Перед первым боевым деплоем нужно получить у банка `MerchantLogin`,
`MerchantId`, `MerchantPass`, код валюты и сертификат для проверки XML-ответа,
затем задать:

```bash
firebase functions:secrets:set APB_MERCHANT_LOGIN
firebase functions:secrets:set APB_MERCHANT_ID
firebase functions:secrets:set APB_MERCHANT_PASS
firebase functions:secrets:set APB_CURRENCY_CODE
firebase functions:secrets:set APB_IS_TEST
firebase functions:secrets:set APB_LIFETIME_MINUTES
firebase functions:secrets:set APB_XML_SERVICE_URL
firebase functions:secrets:set APB_BANK_CERT_PEM
firebase functions:secrets:set APB_ALLOW_UNSIGNED_BANK_RESPONSE
firebase functions:secrets:set APB_SITE_ORIGIN
```

Рекомендуемые значения для первого теста:

```text
APB_IS_TEST=1
APB_LIFETIME_MINUTES=15
APB_XML_SERVICE_URL=https://ws.agroprombank.com/merchant/APB.SV.WebPayment.AgentService.asmx
APB_ALLOW_UNSIGNED_BANK_RESPONSE=0
APB_SITE_ORIGIN=https://auto-style.md
```

`APB_CURRENCY_CODE` нельзя угадывать: его должен подтвердить банк для счёта в
рублях ПМР. В коде оставлен временный fallback `RUB`, но перед тестовым или
боевым платежом секрет нужно задать явно.

## Публикация

```bash
firebase deploy --only functions
```

Правила оплаты:

- фронтенд передаёт в функцию только выбранные товары и количество;
- сервер заново читает цены и остатки из Firestore и сам рассчитывает сумму;
- сервер создаёт числовой уникальный `paymentInvoiceId`;
- после callback сервер проверяет MD5, вызывает `GetState`, проверяет подпись
  XML-ответа банка, сумму, валюту и тестовый режим;
- только после этих проверок заказ получает `paymentStatus: paid`.
