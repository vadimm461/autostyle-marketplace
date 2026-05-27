const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const chokidar = require('chokidar');
const XMLParserLib = require('fast-xml-parser');

const serviceAccount = require('./serviceAccountKey.json');

const PROJECT_ID = serviceAccount.project_id || 'auto-style-4dbb7';
const STORAGE_BUCKET = PROJECT_ID + '.firebasestorage.app';

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: STORAGE_BUCKET
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

const EXCHANGE_DIR = 'C:/autostyle_exchange/1cbitrix';
const IMPORT_FILE = EXCHANGE_DIR + '/import.xml';
const OFFERS_FILE = EXCHANGE_DIR + '/offers.xml';

var parser;

if (XMLParserLib.XMLParser) {
  parser = new XMLParserLib.XMLParser({
    ignoreAttributes: false,
    trimValues: true
  });
} else {
  parser = {
    parse: function (xml) {
      return XMLParserLib.parse(xml, {
        ignoreAttributes: false,
        trimValues: true
      });
    }
  };
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function getNested(obj, keys) {
  var current = obj;

  for (var i = 0; i < keys.length; i++) {
    if (!current || current[keys[i]] === undefined || current[keys[i]] === null) {
      return undefined;
    }

    current = current[keys[i]];
  }

  return current;
}

function text(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    return String(value['#text'] || value['@_Значение'] || '').trim();
  }

  return String(value).trim();
}

function safeDocId(id) {
  return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function safeStorageName(name) {
  return String(name || '')
    .replace(/[^\w.\-а-яА-ЯёЁ]/g, '_')
    .replace(/_+/g, '_');
}

function num(value) {
  var raw = String(value === undefined || value === null ? '0' : value).replace(',', '.');
  var n = Number(raw);
  return isFinite(n) ? n : 0;
}

/*
  Важно:
  - Артикул НЕ используем как код товара.
  - 796 НЕ используем, это код единицы измерения "шт".
  - Берём именно <Код>, либо реквизиты "Код" / "Код товара" / "Код номенклатуры".
*/
function getProductCode(product) {
  var directCode = text(product.Код);

  if (directCode && directCode !== '796') {
    return directCode;
  }

  var requisites = getNested(product, ['ЗначенияРеквизитов', 'ЗначениеРеквизита']);
  var arr = toArray(requisites);

  for (var i = 0; i < arr.length; i++) {
    var r = arr[i];
    if (!r) continue;

    var name = String(r.Наименование || '').toLowerCase();
    var value = text(r.Значение);

    if (
      value &&
      value !== '796' &&
      (
        name === 'код' ||
        name === 'код товара' ||
        name === 'код номенклатуры' ||
        name === 'внутренний код'
      )
    ) {
      return value;
    }
  }

  return '';
}

function getArticle(product) {
  return text(product.Артикул);
}

function getFullName(product) {
  var requisites = getNested(product, ['ЗначенияРеквизитов', 'ЗначениеРеквизита']);
  var arr = toArray(requisites);

  for (var i = 0; i < arr.length; i++) {
    if (arr[i] && arr[i].Наименование === 'Полное наименование') {
      return text(arr[i].Значение) || text(product.Наименование) || 'Без названия';
    }
  }

  return text(product.Наименование) || 'Без названия';
}

function walkGroups(groups, map) {
  var arr = toArray(groups);

  for (var i = 0; i < arr.length; i++) {
    var g = arr[i];
    if (!g) continue;

    var id = text(g.Ид);
    var name = text(g.Наименование);

    if (id && name) {
      map[id] = name;
    }

    var children = getNested(g, ['Группы', 'Группа']);

    if (children) {
      walkGroups(children, map);
    }
  }
}

function buildGroupMap(importData) {
  var map = {};
  var roots = getNested(importData, ['КоммерческаяИнформация', 'Классификатор', 'Группы', 'Группа']);

  walkGroups(roots, map);

  return map;
}

function getProductCategory(product, groupMap) {
  var productGroups = getNested(product, ['Группы', 'Ид']);
  var ids = toArray(productGroups).map(text).filter(Boolean);

  if (!ids.length) return '';

  var lastId = ids[ids.length - 1];

  return groupMap[lastId] || '';
}

function getProductImageLocalPath(product) {
  var imageValue = product.Картинка;
  var images = toArray(imageValue).map(text).filter(Boolean);

  if (!images.length) return '';

  var rel = images[0].replace(/\\/g, '/');
  var localPath = path.join(EXCHANGE_DIR, rel);

  if (fs.existsSync(localPath)) {
    return localPath;
  }

  // На случай если 1С уже дала полный путь
  if (fs.existsSync(rel)) {
    return rel;
  }

  return '';
}

async function uploadImageToFirebase(localPath, externalId) {
  if (!localPath || !fs.existsSync(localPath)) return '';

  var ext = path.extname(localPath) || '.jpg';
  var destination = 'products-1c/' + safeDocId(externalId) + '-' + safeStorageName(path.basename(localPath));
  var token = crypto.randomBytes(16).toString('hex');

  try {
    await bucket.upload(localPath, {
      destination: destination,
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: token
        }
      }
    });

    return 'https://firebasestorage.googleapis.com/v0/b/' +
      bucket.name +
      '/o/' +
      encodeURIComponent(destination) +
      '?alt=media&token=' +
      token;
  } catch (err) {
    console.log('Фото не загружено:', localPath, err.message);
    return '';
  }
}

async function syncProducts() {
  try {
    console.log('=================================');
    console.log('СИНХРОНИЗАЦИЯ ЗАПУЩЕНА');
    console.log(new Date().toLocaleString());
    console.log('=================================');

    if (!fs.existsSync(IMPORT_FILE)) {
      console.log('Файл import.xml не найден:', IMPORT_FILE);
      return;
    }

    if (!fs.existsSync(OFFERS_FILE)) {
      console.log('Файл offers.xml не найден:', OFFERS_FILE);
      return;
    }

    var importXML = fs.readFileSync(IMPORT_FILE, 'utf8');
    var offersXML = fs.readFileSync(OFFERS_FILE, 'utf8');

    var importData = parser.parse(importXML);
    var offersData = parser.parse(offersXML);

    var groupMap = buildGroupMap(importData);

    var productsRaw = getNested(importData, [
      'КоммерческаяИнформация',
      'Каталог',
      'Товары',
      'Товар'
    ]);

    var offersRaw = getNested(offersData, [
      'КоммерческаяИнформация',
      'ПакетПредложений',
      'Предложения',
      'Предложение'
    ]);

    var products = toArray(productsRaw);
    var offers = toArray(offersRaw);

    console.log('Товаров в import.xml:', products.length);
    console.log('Предложений в offers.xml:', offers.length);
    console.log('Групп в import.xml:', Object.keys(groupMap).length);

    var offersMap = {};

    for (var o = 0; o < offers.length; o++) {
      var offer = offers[o];
      var id = text(offer.Ид);

      if (!id) continue;

      offersMap[id] = {
        price: num(getNested(offer, ['Цены', 'Цена', 'ЦенаЗаЕдиницу'])),
        stock: num(offer.Количество)
      };
    }

    var createdOrUpdated = 0;
    var skipped = 0;
    var batch = db.batch();
    var batchCount = 0;

    for (var p = 0; p < products.length; p++) {
      var product = products[p];
      var externalId = text(product.Ид);

      if (!externalId) {
        skipped++;
        continue;
      }

      var title = getFullName(product);
      var code = getProductCode(product);
      var article = getArticle(product);
      var category = getProductCategory(product, groupMap);
      var offerData = offersMap[externalId] || {};
      var localImage = getProductImageLocalPath(product);
      var imageUrl = '';

      if (localImage) {
        imageUrl = await uploadImageToFirebase(localImage, externalId);
      }

      var data = {
        externalId: externalId,
        code: code,
        article: article,
        title: title,
        name: title,
        category: category,
        price: offerData.price || 0,
        stock: offerData.stock || 0,
        quantity: offerData.stock || 0,
        source: '1c',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (imageUrl) {
        data.image = imageUrl;
        data.imageUrl = imageUrl;
      }

      // Не перетираем ручные настройки админки:
      // showOnHome, tag, description сохранятся за счет merge:true.
      var docId = safeDocId(externalId);
      var ref = db.collection('autostyle_products').doc(docId);

      batch.set(ref, data, { merge: true });
      batchCount++;
      createdOrUpdated++;

      console.log(
        createdOrUpdated +
        '. ' +
        title +
        ' | код: ' +
        (code || '-') +
        ' | артикул: ' +
        (article || '-') +
        ' | категория: ' +
        (category || '-') +
        ' | цена: ' +
        data.price +
        ' | остаток: ' +
        data.stock +
        ' | фото: ' +
        (imageUrl ? 'да' : 'нет')
      );

      if (batchCount >= 250) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
        console.log('Промежуточная запись в Firebase выполнена');
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    console.log('=================================');
    console.log('ГОТОВО');
    console.log('Обработано товаров: ' + createdOrUpdated);
    console.log('Пропущено: ' + skipped);
    console.log('=================================');

  } catch (err) {
    console.error('ОШИБКА СИНХРОНИЗАЦИИ:', err);
  }
}

syncProducts();

chokidar.watch([IMPORT_FILE, OFFERS_FILE], {
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 3000,
    pollInterval: 500
  }
}).on('change', async function (filePath) {
  console.log('Обнаружено изменение файла:', filePath);
  await syncProducts();
});

console.log('Синхронизатор запущен.');
console.log('Ожидаю изменения файлов 1С...');
