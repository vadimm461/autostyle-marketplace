'use strict';

const crypto = require('node:crypto');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { defineSecret } = require('firebase-functions/params');
const { setGlobalOptions } = require('firebase-functions/v2/options');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');

initializeApp();
setGlobalOptions({
  region: 'europe-west1',
  timeoutSeconds: 30,
  memory: '256MiB',
  maxInstances: 10
});

const db = getFirestore();
const ORDERS = 'autostyle_orders';
const PRODUCTS = 'autostyle_products';
const USERS = 'autostyle_users';
const DISCOUNT_CARDS = 'autostyle_discount_cards';

// MerchantPass and the bank certificate are never shipped to the browser.
// They are configured with Firebase Secret Manager before deployment.
const APB_MERCHANT_LOGIN = defineSecret('APB_MERCHANT_LOGIN');
const APB_MERCHANT_ID = defineSecret('APB_MERCHANT_ID');
const APB_MERCHANT_PASS = defineSecret('APB_MERCHANT_PASS');
const APB_CURRENCY_CODE = defineSecret('APB_CURRENCY_CODE');
const APB_IS_TEST = defineSecret('APB_IS_TEST');
const APB_LIFETIME_MINUTES = defineSecret('APB_LIFETIME_MINUTES');
const APB_XML_SERVICE_URL = defineSecret('APB_XML_SERVICE_URL');
const APB_BANK_CERT_PEM = defineSecret('APB_BANK_CERT_PEM');
const APB_ALLOW_UNSIGNED_BANK_RESPONSE = defineSecret('APB_ALLOW_UNSIGNED_BANK_RESPONSE');
const APB_SITE_ORIGIN = defineSecret('APB_SITE_ORIGIN');

const APB_SECRETS = [
  APB_MERCHANT_LOGIN,
  APB_MERCHANT_ID,
  APB_MERCHANT_PASS,
  APB_CURRENCY_CODE,
  APB_IS_TEST,
  APB_LIFETIME_MINUTES,
  APB_XML_SERVICE_URL,
  APB_BANK_CERT_PEM,
  APB_ALLOW_UNSIGNED_BANK_RESPONSE,
  APB_SITE_ORIGIN
];

const DEFAULT_PAYMENT_START_URL = 'https://www.agroprombank.com/payments/PaymentStart';
const DEFAULT_XML_SERVICE_URL = 'https://ws.agroprombank.com/merchant/APB.SV.WebPayment.AgentService.asmx';
const DEFAULT_SITE_ORIGIN = 'https://auto-style.md';

function valueOf(param, envName, fallback = '') {
  let value = '';
  try {
    value = typeof param?.value === 'function' ? param.value() : '';
  } catch (_) {
    value = '';
  }
  return String(value || process.env[envName] || fallback).trim();
}

function boolValue(value, fallback = false) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

function config() {
  return {
    merchantLogin: valueOf(APB_MERCHANT_LOGIN, 'APB_MERCHANT_LOGIN'),
    merchantId: valueOf(APB_MERCHANT_ID, 'APB_MERCHANT_ID', valueOf(APB_MERCHANT_LOGIN, 'APB_MERCHANT_LOGIN')),
    merchantPass: valueOf(APB_MERCHANT_PASS, 'APB_MERCHANT_PASS'),
    currencyCode: valueOf(APB_CURRENCY_CODE, 'APB_CURRENCY_CODE', 'RUB').toUpperCase(),
    isTest: boolValue(valueOf(APB_IS_TEST, 'APB_IS_TEST'), false),
    lifetimeMinutes: Math.max(1, Math.min(1440, Number(valueOf(APB_LIFETIME_MINUTES, 'APB_LIFETIME_MINUTES', '15')) || 15)),
    xmlServiceUrl: valueOf(APB_XML_SERVICE_URL, 'APB_XML_SERVICE_URL', DEFAULT_XML_SERVICE_URL),
    bankCertPem: valueOf(APB_BANK_CERT_PEM, 'APB_BANK_CERT_PEM'),
    allowUnsignedBankResponse: boolValue(valueOf(APB_ALLOW_UNSIGNED_BANK_RESPONSE, 'APB_ALLOW_UNSIGNED_BANK_RESPONSE'), false),
    siteOrigin: valueOf(APB_SITE_ORIGIN, 'APB_SITE_ORIGIN', DEFAULT_SITE_ORIGIN).replace(/\/$/, '')
  };
}

function requireMerchantConfig() {
  const settings = config();
  if (!settings.merchantLogin || !settings.merchantPass) {
    throw new Error('APB_MERCHANT_LOGIN/APB_MERCHANT_PASS are not configured');
  }
  return settings;
}

function md5(value) {
  return crypto.createHash('md5').update(String(value), 'utf8').digest('hex');
}

function safeString(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function numeric(value, fallback = null) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function minorUnits(value) {
  const amount = numeric(value, null);
  return amount === null ? null : Math.max(0, Math.round(amount * 100));
}

function nowIso() {
  return new Date().toISOString();
}

function escapeXml(value) {
  return safeString(value, 4000)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXml(value) {
  let result = String(value ?? '');
  for (let i = 0; i < 3; i += 1) {
    result = result
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }
  return result;
}

function xmlTag(xml, tagName) {
  const tag = String(tagName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(xml || '').match(new RegExp(`<(?:(?:[A-Za-z0-9_.-]+):)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:(?:[A-Za-z0-9_.-]+):)?${tag}>`, 'i'));
  return match ? decodeXml(match[1]).trim() : '';
}

function timingSafeHexEquals(left, right) {
  const a = Buffer.from(String(left || '').toLowerCase(), 'utf8');
  const b = Buffer.from(String(right || '').toLowerCase(), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function firstParam(params, names) {
  const entries = Object.entries(params || {});
  for (const name of names) {
    const wanted = name.toLowerCase();
    const found = entries.find(([key]) => key.toLowerCase() === wanted);
    if (found) return Array.isArray(found[1]) ? found[1][0] : found[1];
  }
  return '';
}

function requestParams(req) {
  const params = {};
  if (req?.query && typeof req.query === 'object') Object.assign(params, req.query);
  if (req?.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) Object.assign(params, req.body);
  if (typeof req?.body === 'string') {
    for (const part of req.body.split('&')) {
      const [key, ...rest] = part.split('=');
      if (!key) continue;
      params[decodeURIComponent(key)] = decodeURIComponent(rest.join('=').replace(/\+/g, ' '));
    }
  }
  return params;
}

function callbackData(req, defaultStatus = '') {
  const params = requestParams(req);
  const rawStatus = safeString(firstParam(params, ['status']), 20) || defaultStatus;
  return {
    invoiceId: safeString(firstParam(params, ['invoiceid', 'invoiceId', 'nivid']), 80),
    statusRaw: rawStatus,
    status: rawStatus.toLowerCase(),
    paymentSumRaw: safeString(firstParam(params, ['paymentsum', 'paymentSum']), 80),
    paymentCurrency: safeString(firstParam(params, ['paymentcurrency', 'paymentcurrcode', 'paymentCurrCode']), 40).toUpperCase(),
    date: safeString(firstParam(params, ['date']), 20),
    signature: safeString(firstParam(params, ['signature', 'signaturevalue']), 100),
    isTestRaw: safeString(firstParam(params, ['istest', 'isTest']), 10),
    rrn: safeString(firstParam(params, ['rrn']), 80),
    lastDigits: safeString(firstParam(params, ['lastdgt', 'lastDgt']), 10),
    cashback: safeString(firstParam(params, ['cashback']), 80),
    creditProduct: safeString(firstParam(params, ['creditproduct']), 80),
    rawParams: params
  };
}

function verifyCallbackSignature(data, settings) {
  if (!data.invoiceId || !data.date || !data.signature || !['paid', 'fail'].includes(data.status)) return false;
  const statuses = [...new Set([data.statusRaw, data.status].filter(Boolean))];
  const candidates = [];
  for (const status of statuses) {
    if (data.status === 'paid') {
      candidates.push(md5([
        data.invoiceId,
        status,
        data.paymentSumRaw,
        data.paymentCurrency,
        data.date,
        settings.merchantPass
      ].join(':')));
    } else {
      candidates.push(md5([
        data.invoiceId,
        status,
        data.date,
        settings.merchantPass
      ].join(':')));
    }
  }
  return candidates.some(candidate => timingSafeHexEquals(candidate, data.signature));
}

function paymentStartData(settings, orderNumber, invoiceId, amountMinor, description) {
  const isTest = settings.isTest ? '1' : '0';
  const signature = md5([
    settings.merchantLogin,
    invoiceId,
    isTest,
    amountMinor,
    settings.currencyCode,
    description,
    settings.merchantPass
  ].join(':'));
  const fields = {
    MerchantLogin: settings.merchantLogin,
    RequestSum: String(amountMinor),
    RequestCurrCode: settings.currencyCode,
    nivid: String(invoiceId),
    Desc: description,
    IsTest: isTest,
    LifeTime: String(settings.lifetimeMinutes),
    SignatureValue: signature
  };
  return { action: DEFAULT_PAYMENT_START_URL, method: 'POST', fields };
}

function verifiedProfile(profile, authToken) {
  return Boolean(
    authToken?.email_verified === true
    || profile?.emailVerified === true
    || profile?.phoneVerified === true
    || profile?.verified === true
    || profile?.isVerified === true
  );
}

async function readUserProfile(uid) {
  const snap = await db.collection(USERS).doc(uid).get();
  return snap.exists ? (snap.data() || {}) : {};
}

function normalizedProduct(data, id) {
  return {
    id: String(id),
    title: safeString(data.title || data.name || data.productName || 'Товар', 500),
    group: safeString(data.group || data.category || data.categoryName || 'Без категории', 250),
    code: safeString(data.code || data.sku || data.article || id, 120),
    image: safeString(data.image || data.imageUrl || data.photo || data.photoUrl || data.img || '', 2000),
    price: numeric(data.price, null),
    stock: data.stock ?? data.quantity ?? data.qty ?? data.balance ?? data.availableQty ?? data.available ?? null
  };
}

async function loadProduct(productId) {
  const direct = await db.collection(PRODUCTS).doc(productId).get();
  if (direct.exists) return normalizedProduct(direct.data() || {}, direct.id);

  // Older carts may contain the 1C code instead of the Firestore document id.
  const byCode = await db.collection(PRODUCTS).where('code', '==', productId).limit(1).get();
  if (byCode.empty) return null;
  const row = byCode.docs[0];
  return normalizedProduct(row.data() || {}, row.id);
}

function normalizeRequestedItems(rawItems) {
  const merged = new Map();
  for (const raw of Array.isArray(rawItems) ? rawItems : []) {
    const id = safeString(raw?.productId || raw?.id, 160);
    const qty = Math.floor(numeric(raw?.qty, 0));
    if (!id || !Number.isFinite(qty) || qty < 1 || qty > 999) continue;
    merged.set(id, Math.min(999, (merged.get(id) || 0) + qty));
  }
  return [...merged.entries()].map(([productId, qty]) => ({ productId, qty }));
}

function stockProblem(product, qty) {
  if (product.stock === null || product.stock === undefined || product.stock === '') return '';
  const stock = numeric(product.stock, null);
  if (stock === null) return '';
  if (stock <= 0) return `Товар «${product.title}» закончился`;
  if (qty > stock) return `Для товара «${product.title}» доступно только ${Math.floor(stock)} шт.`;
  return '';
}

async function discountForUser(uid, requested) {
  if (!requested) return { applied: false, percent: 0 };
  const [profile, cardSnap] = await Promise.all([
    readUserProfile(uid),
    db.collection(DISCOUNT_CARDS).doc(uid).get()
  ]);
  const card = cardSnap.exists ? (cardSnap.data() || {}) : {};
  const active = Boolean(card.active || profile.discountCardActive || profile.discountCard?.active);
  if (!active) throw new HttpsError('failed-precondition', 'Скидочная карта не активна.');
  const percent = clamp(Math.round(numeric(
    card.discount ?? card.discountPercent ?? profile.discountCard?.discount ?? profile.discountCard?.discountPercent ?? profile.discount ?? profile.discountPercent,
    0
  )), 0, 100);
  return { applied: true, percent };
}

function newInvoiceId() {
  // 12 digits stay within the integer range required by the bank interface.
  return `${String(Date.now()).slice(-9)}${crypto.randomInt(100, 1000)}`;
}

function orderResponse(orderId, order, settings) {
  const amountMinor = Number(order.paymentAmountMinor || minorUnits(order.total) || 0);
  const description = safeString(order.paymentDescription || `AutoStyle ${order.orderNumber}`, 1000);
  const invoiceId = String(order.paymentInvoiceId || '');
  const payment = order.paymentFields
    ? { action: order.paymentUrl || DEFAULT_PAYMENT_START_URL, method: order.paymentSubmitMethod || 'POST', fields: order.paymentFields }
    : paymentStartData(settings, order.orderNumber, invoiceId, amountMinor, description);
  return {
    orderId,
    orderNumber: order.orderNumber,
    paymentInvoiceId: invoiceId,
    paymentUrl: payment.action,
    paymentSubmitMethod: payment.method,
    paymentFields: payment.fields,
    total: Number(order.total || 0),
    currency: settings.currencyCode,
    isTest: settings.isTest
  };
}

exports.createApbPayment = onCall({ secrets: APB_SECRETS }, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Войдите в аккаунт.');

  const profile = await readUserProfile(request.auth.uid);
  if (!verifiedProfile(profile, request.auth.token)) {
    throw new HttpsError('failed-precondition', 'Сначала подтвердите Email.');
  }

  const settings = requireMerchantConfig();
  const data = request.data || {};
  const clientRequestId = safeString(data.clientRequestId, 120);

  if (clientRequestId) {
    const duplicate = await db.collection(ORDERS).where('paymentRequestId', '==', clientRequestId).limit(1).get();
    if (!duplicate.empty) {
      const existing = duplicate.docs[0];
      const existingOrder = existing.data() || {};
      if (existingOrder.userId === request.auth.uid && existingOrder.paymentUrl) {
        return orderResponse(existing.id, existingOrder, settings);
      }
    }
  }

  const requestedItems = normalizeRequestedItems(data.items);
  if (!requestedItems.length) throw new HttpsError('invalid-argument', 'Не выбраны товары.');
  if (requestedItems.length > 100) throw new HttpsError('invalid-argument', 'Слишком много позиций в заказе.');

  const loaded = await Promise.all(requestedItems.map(async item => ({
    requested: item,
    product: await loadProduct(item.productId)
  })));
  const missing = loaded.find(row => !row.product);
  if (missing) throw new HttpsError('failed-precondition', 'Один из товаров больше не доступен. Обновите корзину.');
  const invalid = loaded.map(row => stockProblem(row.product, row.requested.qty)).find(Boolean);
  if (invalid) throw new HttpsError('failed-precondition', invalid);

  const items = loaded.map(({ requested, product }) => ({
    productId: product.id,
    title: product.title,
    group: product.group,
    code: product.code,
    image: product.image,
    price: product.price,
    qty: requested.qty,
    lineTotal: (minorUnits(product.price) * requested.qty) / 100
  }));
  const invalidPrice = loaded.find(row => minorUnits(row.product.price) === null);
  if (invalidPrice) throw new HttpsError('failed-precondition', `Цена товара «${invalidPrice.product.title}» недоступна.`);
  const subtotalMinor = items.reduce((sum, item) => sum + (minorUnits(item.price) * item.qty), 0);
  const discount = await discountForUser(request.auth.uid, data.discountCardApplied === true);
  const discountTotalMinor = discount.applied ? Math.min(Math.round(subtotalMinor * discount.percent / 100), subtotalMinor) : 0;
  const totalMinor = Math.max(0, subtotalMinor - discountTotalMinor);
  const subtotal = subtotalMinor / 100;
  const discountTotal = discountTotalMinor / 100;
  const total = totalMinor / 100;
  if (!Number.isFinite(total) || total <= 0) throw new HttpsError('failed-precondition', 'Сумма заказа должна быть больше нуля.');

  const orderNumber = `AS-${Date.now().toString().slice(-8)}`;
  const invoiceId = newInvoiceId();
  const description = safeString(`AutoStyle ${orderNumber}`, 1000);
  const payment = paymentStartData(settings, orderNumber, invoiceId, totalMinor, description);
  const orderRef = db.collection(ORDERS).doc();
  const createdAtText = nowIso();

  await orderRef.create({
    orderNumber,
    status: 'new',
    statusTitle: 'Новый',
    source: safeString(data.source || 'site-card-payment', 80),
    userId: request.auth.uid,
    uid: request.auth.uid,
    userEmail: request.auth.token.email || '',
    userName: safeString(profile.name || request.auth.token.name || '', 250),
    userPhone: safeString(profile.phone || '', 80),
    userCar: safeString(profile.car || profile.carText || '', 250),
    items,
    subtotal,
    discountTotal,
    discountCardApplied: discount.applied,
    discountCardPercent: discount.percent,
    discountCardRequested: data.discountCardApplied === true,
    total,
    totalQty: items.reduce((sum, item) => sum + item.qty, 0),
    paymentMethod: 'card',
    paymentMethodTitle: 'Банковской картой',
    paymentProvider: 'agroprombank',
    paymentStatus: 'pending',
    paymentStatusTitle: 'Ожидает оплаты',
    paymentInvoiceId: invoiceId,
    paymentAmountMinor: totalMinor,
    paymentCurrency: settings.currencyCode,
    paymentIsTest: settings.isTest,
    paymentDescription: description,
    paymentUrl: payment.action,
    paymentSubmitMethod: payment.method,
    paymentFields: payment.fields,
    paymentRequestId: clientRequestId,
    paymentCreatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    createdAtText
  });

  return orderResponse(orderRef.id, {
    orderNumber,
    paymentInvoiceId: invoiceId,
    paymentAmountMinor: totalMinor,
    paymentCurrency: settings.currencyCode,
    paymentIsTest: settings.isTest,
    paymentDescription: description,
    paymentUrl: payment.action,
    paymentSubmitMethod: payment.method,
    paymentFields: payment.fields,
    total
  }, settings);
});

function methodUrl(baseUrl, method) {
  const clean = String(baseUrl || DEFAULT_XML_SERVICE_URL).replace(/\/+$/, '');
  return clean.toLowerCase().endsWith(`/${method.toLowerCase()}`) ? clean : `${clean}/${method}`;
}

function normalizeCertificate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes('BEGIN CERTIFICATE')) return raw;
  return `-----BEGIN CERTIFICATE-----\n${raw.replace(/\s+/g, '')}\n-----END CERTIFICATE-----`;
}

function verifyBankEnvelope(responseBase64, responseXml, signatureBase64, settings) {
  const certificate = normalizeCertificate(settings.bankCertPem);
  if (!certificate) {
    if (settings.allowUnsignedBankResponse && settings.isTest) return false;
    throw new Error('APB_BANK_CERT_PEM is not configured; refusing unsigned bank response');
  }
  const signature = Buffer.from(String(signatureBase64 || '').replace(/\s+/g, ''), 'base64');
  if (!signature.length) throw new Error('Bank response signature is empty');
  const candidates = [
    Buffer.from(String(responseBase64 || '').trim(), 'utf8'),
    Buffer.from(String(responseBase64 || '').replace(/\s+/g, ''), 'base64'),
    Buffer.from(String(responseXml || '').trim(), 'utf8')
  ];
  for (const algorithm of ['RSA-SHA256', 'RSA-SHA1']) {
    for (const payload of candidates) {
      try {
        if (crypto.verify(algorithm, payload, certificate, signature)) return true;
      } catch (_) {
        // Try the other representation/algorithm; the bank documentation does
        // not state the digest algorithm explicitly.
      }
    }
  }
  throw new Error('Bank response signature verification failed');
}

async function fetchBankState(invoiceId, settings) {
  const merchantSignature = md5(`${settings.merchantId}:${invoiceId}:${settings.merchantPass}`);
  const body = `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xmlns:xsd="http://www.w3.org/2001/XMLSchema" ` +
    `xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body><GetState xmlns="http://webpayment.services.agroprombank.com/">` +
    `<merchantId>${escapeXml(settings.merchantId)}</merchantId>` +
    `<invoiceId>${escapeXml(invoiceId)}</invoiceId>` +
    `<signature>${escapeXml(merchantSignature)}</signature>` +
    `</GetState></soap:Body></soap:Envelope>`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch(methodUrl(settings.xmlServiceUrl, 'GetState'), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '"http://webpayment.services.agroprombank.com/GetState"'
      },
      body,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
  const soapXml = await response.text();
  if (!response.ok) throw new Error(`Agroprombank GetState HTTP ${response.status}`);

  const resultString = xmlTag(soapXml, 'GetStateResult');
  if (!resultString) throw new Error('Agroprombank GetStateResult is empty');
  const envelopeXml = decodeXml(resultString);
  const responseBase64 = xmlTag(envelopeXml, 'response').replace(/\s+/g, '');
  const signatureBase64 = xmlTag(envelopeXml, 'signature').replace(/\s+/g, '');
  if (!responseBase64) throw new Error('Agroprombank response payload is empty');
  const responseXml = Buffer.from(responseBase64, 'base64').toString('utf8');
  const signatureVerified = verifyBankEnvelope(responseBase64, responseXml, signatureBase64, settings);
  const resultCode = numeric(xmlTag(responseXml, 'Code'), null);
  if (resultCode !== null && resultCode !== 1) {
    throw new Error(`Agroprombank GetState rejected: ${xmlTag(responseXml, 'Description') || 'unknown error'}`);
  }
  return {
    state: numeric(xmlTag(responseXml, 'state'), null),
    stateDescription: safeString(xmlTag(responseXml, 'statedescription'), 500),
    isTest: safeString(xmlTag(responseXml, 'istest'), 10),
    sumMinor: numeric(xmlTag(responseXml, 'sum'), null),
    currency: safeString(xmlTag(responseXml, 'currency'), 40).toUpperCase(),
    date: safeString(xmlTag(responseXml, 'date'), 40),
    endDate: safeString(xmlTag(responseXml, 'enddate'), 40),
    lifetime: numeric(xmlTag(responseXml, 'lifetime'), null),
    invoiceId: safeString(xmlTag(responseXml, 'invoiceid'), 80),
    description: safeString(xmlTag(responseXml, 'description'), 1000),
    rrn: safeString(xmlTag(responseXml, 'rrn'), 80),
    lastDigits: safeString(xmlTag(responseXml, 'lastdgt'), 10),
    cashbackMinor: numeric(xmlTag(responseXml, 'cashback'), null),
    signatureVerified
  };
}

async function findOrderByInvoice(invoiceId) {
  const snap = await db.collection(ORDERS).where('paymentInvoiceId', '==', String(invoiceId)).limit(1).get();
  if (snap.empty) return null;
  const row = snap.docs[0];
  return { ref: row.ref, data: row.data() || {} };
}

function paymentStatusFromState(state) {
  return ({
    0: ['pending', 'Ожидает оплаты'],
    1: ['paid', 'Оплата получена'],
    2: ['cancelled', 'Платёж отменён'],
    3: ['failed', 'Ошибка платежа'],
    4: ['expired', 'Срок оплаты истёк']
  })[state] || ['unknown', 'Статус платежа не определён'];
}

async function processBankCallback(req, defaultStatus = '') {
  const settings = requireMerchantConfig();
  const callback = callbackData(req, defaultStatus);
  if (!callback.invoiceId || !callback.date || !callback.signature) throw new Error('Incomplete Agroprombank callback');
  if (!verifyCallbackSignature(callback, settings)) throw new Error('Agroprombank callback signature verification failed');

  const order = await findOrderByInvoice(callback.invoiceId);
  if (!order) throw new Error(`Order for invoice ${callback.invoiceId} was not found`);

  const state = await fetchBankState(callback.invoiceId, settings);
  const [paymentStatus, paymentStatusTitle] = paymentStatusFromState(state.state);
  const expectedMinor = Number(order.data.paymentAmountMinor || minorUnits(order.data.total) || 0);
  const amountMatches = Number.isFinite(state.sumMinor) && Number(state.sumMinor) === expectedMinor;
  const currencyMatches = Boolean(state.currency) && state.currency === String(order.data.paymentCurrency || settings.currencyCode).toUpperCase();
  const testMatches = Boolean(state.isTest) && boolValue(state.isTest) === settings.isTest;
  const paid = state.state === 1 && amountMatches && currencyMatches && testMatches;
  const currentPaid = order.data.paymentStatus === 'paid';
  const verificationFailed = state.state === 1 && !paid;
  const finalStatus = currentPaid ? 'paid' : (paid ? 'paid' : (verificationFailed ? 'failed' : paymentStatus));
  const finalTitle = currentPaid
    ? 'Оплата получена'
    : (paid ? 'Оплата получена' : (verificationFailed ? 'Проверка платежа не пройдена' : paymentStatusTitle));
  const update = {
    paymentStatus: finalStatus,
    paymentStatusTitle: finalTitle,
    paymentState: state.state,
    paymentStateDescription: state.stateDescription,
    paymentCallbackStatus: callback.status,
    paymentCallbackDate: callback.date,
    paymentCallbackSignature: callback.signature,
    paymentCallbackAt: FieldValue.serverTimestamp(),
    paymentAmountMatches: amountMatches,
    paymentCurrencyMatches: currencyMatches,
    paymentTestMatches: testMatches,
    paymentSignatureVerified: state.signatureVerified,
    paymentRrn: state.rrn || callback.rrn,
    paymentLastDigits: state.lastDigits || callback.lastDigits,
    paymentCashbackMinor: state.cashbackMinor ?? numeric(callback.cashback, null),
    paymentBankDate: state.date || '',
    paymentBankEndDate: state.endDate || '',
    updatedAt: nowIso()
  };
  if (finalStatus === 'paid' && !currentPaid) update.paymentPaidAt = FieldValue.serverTimestamp();
  await order.ref.set(update, { merge: true });

  if (finalStatus === 'paid' && !currentPaid) {
    try {
      await db.collection('autostyle_notifications').doc(`payment_${order.ref.id}`).create({
        title: 'Оплата получена',
        body: `Заказ ${order.data.orderNumber || order.ref.id} оплачен банковской картой.`,
        type: 'payment',
        target: order.data.userId || order.data.uid || '',
        targetUserId: order.data.userId || order.data.uid || '',
        userId: order.data.userId || order.data.uid || '',
        orderId: order.ref.id,
        readBy: [],
        createdAt: FieldValue.serverTimestamp(),
        createdAtText: nowIso()
      });
    } catch (error) {
      console.warn('Payment notification skipped:', error.message || error);
    }
  }

  return {
    orderId: order.ref.id,
    orderNumber: order.data.orderNumber || order.ref.id,
    invoiceId: callback.invoiceId,
    paymentStatus: finalStatus,
    paymentStatusTitle: finalTitle,
    state: state.state,
    amountMatches,
    currencyMatches,
    testMatches
  };
}

exports.apbPaymentResult = onRequest({ invoker: 'public', secrets: APB_SECRETS }, async (req, res) => {
  try {
    const result = await processBankCallback(req);
    console.log('Agroprombank result processed', { invoiceId: result.invoiceId, state: result.state, status: result.paymentStatus });
    res.status(200).type('text/plain').send('OK');
  } catch (error) {
    console.error('Agroprombank result error:', error.message || error);
    // A non-2xx response allows the bank to retry a transient callback.
    res.status(500).type('text/plain').send('RETRY');
  }
});

function redirectUrl(settings, path, result, reason = '') {
  const query = new URLSearchParams();
  if (result?.invoiceId) query.set('invoiceid', result.invoiceId);
  if (result?.orderNumber) query.set('order', result.orderNumber);
  if (result?.state !== undefined && result?.state !== null) query.set('state', String(result.state));
  if (reason) query.set('reason', reason);
  return `${settings.siteOrigin}/${path}${query.toString() ? `?${query.toString()}` : ''}`;
}

exports.apbPaymentSuccess = onRequest({ invoker: 'public', secrets: APB_SECRETS }, async (req, res) => {
  const settings = config();
  try {
    const result = await processBankCallback(req, 'paid');
    if (result.paymentStatus === 'paid') {
      res.redirect(303, redirectUrl(settings, 'payment-success.html', result));
      return;
    }
    res.redirect(303, redirectUrl(settings, 'payment-fail.html', result, 'not-confirmed'));
  } catch (error) {
    console.error('Agroprombank success redirect error:', error.message || error);
    const callback = callbackData(req, 'paid');
    res.redirect(303, redirectUrl(settings, 'payment-fail.html', { invoiceId: callback.invoiceId }, 'verification'));
  }
});

exports.apbPaymentFail = onRequest({ invoker: 'public', secrets: APB_SECRETS }, async (req, res) => {
  const settings = config();
  try {
    const result = await processBankCallback(req, 'fail');
    res.redirect(303, redirectUrl(settings, 'payment-fail.html', result, result.paymentStatus === 'pending' ? 'pending' : 'declined'));
  } catch (error) {
    console.error('Agroprombank fail redirect error:', error.message || error);
    const callback = callbackData(req, 'fail');
    res.redirect(303, redirectUrl(settings, 'payment-fail.html', { invoiceId: callback.invoiceId }, 'verification'));
  }
});
