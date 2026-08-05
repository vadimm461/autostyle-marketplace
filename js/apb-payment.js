import { app } from './firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';

const functions = getFunctions(app, 'europe-west1');
const createApbPayment = httpsCallable(functions, 'createApbPayment');

function requestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `as-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function startApbCardPayment({ items = [], discountCardApplied = false, source = 'site-cart' } = {}) {
  const payload = {
    clientRequestId: requestId(),
    source: String(source || 'site-cart').slice(0, 80),
    discountCardApplied: discountCardApplied === true,
    items: (Array.isArray(items) ? items : []).map(item => ({
      productId: String(item.productId || item.id || ''),
      qty: Math.max(1, Number(item.qty || 1) || 1)
    })).filter(item => item.productId)
  };
  const response = await createApbPayment(payload);
  const data = response?.data || {};
  if (!data.paymentUrl) throw new Error('Банк не вернул ссылку на оплату.');
  return data;
}

export function submitApbPayment(payment) {
  const action = String(payment?.paymentUrl || '').trim();
  const fields = payment?.paymentFields && typeof payment.paymentFields === 'object'
    ? payment.paymentFields
    : {};
  if (!action) throw new Error('Не задан адрес страницы оплаты.');

  const form = document.createElement('form');
  form.method = String(payment?.paymentSubmitMethod || payment?.paymentMethod || 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST';
  form.action = action;
  form.style.display = 'none';
  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = String(value ?? '');
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}
