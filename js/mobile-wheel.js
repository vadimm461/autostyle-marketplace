import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc, getDoc, collection, query, where, getDocs,
  runTransaction, serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const CONFIG_REF = doc(db, 'autostyle_wheel_config', 'main');
const stateRef = uid => doc(db, 'autostyle_wheel_state', uid);

let currentUser = null;
let currentConfig = null;
let currentEmailVerified = false;
let rotation = 0;
let spinning = false;
let availabilityTimer = null;

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

async function refreshEmailVerification() {
  if (!currentUser) return false;
  try { await currentUser.reload(); } catch (_) {}
  currentUser = auth.currentUser || currentUser;
  return currentUser.emailVerified === true;
}

function showAccessGate(mode = 'guest') {
  const gate = $('#mwAuthGate');
  if (!gate) return;

  const icon = gate.querySelector('[data-mw-gate-icon]');
  const title = gate.querySelector('[data-mw-gate-title]');
  const text = gate.querySelector('[data-mw-gate-text]');
  const link = gate.querySelector('[data-mw-gate-link]');
  const emailLocked = mode === 'email';

  if (icon) icon.textContent = emailLocked ? '✉️' : '🎁';
  if (title) title.textContent = emailLocked ? 'Подтвердите почту' : 'Войдите в профиль';
  if (text) text.textContent = emailLocked
    ? 'Колесо доступно после подтверждения Email. Откройте письмо от AutoStyle и перейдите по ссылке.'
    : 'Колесо, история выигрышей и штрихкоды доступны после входа.';
  if (link) {
    link.href = emailLocked ? 'mobile-profile-data.html#security' : 'mobile-profile.html';
    link.textContent = emailLocked ? 'Подтвердить почту' : 'Перейти в профиль';
  }

  gate.hidden = false;
}

function hideAccessGate() {
  const gate = $('#mwAuthGate');
  if (gate) gate.hidden = true;
}

function hideLoader() {
  const loader = $('#mLoader');
  if (!loader) return;
  loader.classList.add('hide');
  setTimeout(() => loader.remove(), 320);
}

function loadJsBarcode() {
  if (window.JsBarcode) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function setStatus(message, ready = false) {
  const status = $('#mwStatus');
  const dot = $('#mwStatusDot');

  if (status) status.textContent = message;
  if (dot) dot.classList.toggle('is-ready', ready);
}

function setSpinDisabled(disabled) {
  const button = $('#mwSpinButton');
  if (button) button.disabled = disabled;
}

function vibrate(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (_) {}
}

function barcode() {
  const digits = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');
  return `ASW${digits}`;
}

function notificationRef(id) {
  return doc(db, 'autostyle_notifications', id);
}

function safeNotifyId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
}

function clearAvailabilityTimer() {
  if (!availabilityTimer) return;
  clearTimeout(availabilityTimer);
  availabilityTimer = null;
}

function renderWheel(config) {
  const wheel = $('#mwFortuneWheel');
  if (!wheel) return;

  const products = (config?.products || [])
    .filter(item => item.enabled !== false && Number(item.chance) > 0);

  const chanceSum = products.reduce((sum, item) => sum + Number(item.chance || 0), 0);
  const items = [...products];

  if (chanceSum < 100) {
    items.push({
      name: 'Попробуй ещё',
      chance: 100 - chanceSum,
      noPrize: true
    });
  }

  if (!items.length) {
    items.push({
      name: 'Скоро призы',
      chance: 100,
      noPrize: true
    });
  }

  wheel.innerHTML = '';
  wheel.style.background = `
    radial-gradient(circle at center,
      rgba(255,255,255,.98) 0 24%,
      rgba(255,255,255,.10) 24.5% 25.5%,
      transparent 26%
    ),
    conic-gradient(
      from 0deg,
      #151f33,
      #202d46 25%,
      #101827 50%,
      #202d46 75%,
      #151f33
    )
  `;

  const equalStep = 360 / items.length;

  items.forEach((item, index) => {
    const angle = index * equalStep + equalStep / 2;
    const visual = document.createElement('div');
    visual.className = 'mw-prize-visual';
    visual.style.setProperty('--segment-angle', `${angle}deg`);

    if (item.noPrize) {
      visual.innerHTML = '<div class="mw-empty-icon" title="Попробуй ещё">↻</div>';
    } else {
      visual.innerHTML = `
        <img
          src="${escapeHtml(item.image || 'assets/as-logo-192.png')}"
          alt="${escapeHtml(item.name || 'Приз')}"
          loading="lazy"
          decoding="async"
        >
      `;
    }

    wheel.appendChild(visual);
  });

  wheel.dataset.items = JSON.stringify(items);
}

function weightedResult(items) {
  const random = Math.random() * 100;
  let cursor = 0;

  for (const item of items) {
    cursor += Number(item.chance || 0);
    if (random < cursor) return item;
  }

  return { name: 'Попробуй ещё', noPrize: true };
}

async function createReadyNotificationIfDue(stateData = {}) {
  if (!currentUser || !currentConfig?.enabled) return;

  const nextMs = stateData.nextAvailableAt?.toMillis?.()
    || ((stateData.lastSpinAt?.toMillis?.() || 0)
      + Number(currentConfig.intervalHours || 48) * 3600000);

  const key = safeNotifyId(stateData.readyNotificationKey || nextMs);

  if (!nextMs || Date.now() < nextMs || stateData.readyNotificationSent === true || !key) return;

  try {
    await runTransaction(db, async transaction => {
      const userStateRef = stateRef(currentUser.uid);
      const snapshot = await transaction.get(userStateRef);

      if (!snapshot.exists()) return;

      const live = snapshot.data() || {};
      const liveNext = live.nextAvailableAt?.toMillis?.()
        || ((live.lastSpinAt?.toMillis?.() || 0)
          + Number(currentConfig.intervalHours || 48) * 3600000);

      const liveKey = safeNotifyId(live.readyNotificationKey || liveNext);

      if (
        !liveNext
        || Date.now() < liveNext
        || live.readyNotificationSent === true
        || liveKey !== key
      ) return;

      transaction.set(notificationRef(`wheel-ready-${currentUser.uid}-${liveKey}`), {
        audience: 'user',
        userId: currentUser.uid,
        uid: currentUser.uid,
        userEmail: currentUser.email || '',
        type: 'wheel_ready',
        title: '🎡 Колесо подарков снова доступно',
        text: 'Новая попытка уже открыта. Испытай удачу.',
        html: '<p><b>Новая попытка уже открыта.</b></p><p>Испытай удачу — возможно, сегодняшний приз ждёт именно тебя.</p>',
        link: 'mobile-wheel.html',
        createdAt: serverTimestamp(),
        createdBy: 'wheel-system'
      });

      transaction.set(userStateRef, {
        readyNotificationSent: true,
        readyNotificationSentAt: serverTimestamp()
      }, { merge: true });
    });
  } catch (error) {
    console.warn('Не удалось создать уведомление о доступности колеса:', error);
  }
}

function scheduleReadyNotification(stateData = {}) {
  clearAvailabilityTimer();

  const nextMs = stateData.nextAvailableAt?.toMillis?.()
    || ((stateData.lastSpinAt?.toMillis?.() || 0)
      + Number(currentConfig?.intervalHours || 48) * 3600000);

  if (!nextMs) return;

  const delay = nextMs - Date.now();

  if (delay <= 0) {
    createReadyNotificationIfDue(stateData);
    return;
  }

  availabilityTimer = setTimeout(async () => {
    await createReadyNotificationIfDue(stateData);
    await refreshWheel();
  }, Math.min(delay + 800, 2147483000));
}

async function renderPrizes(items) {
  const list = $('#mwPrizeList');
  if (!list) return;

  await loadJsBarcode().catch(() => {});

  if (!items.length) {
    list.innerHTML = `
      <div class="mw-empty">
        <span>🎁</span>
        <b>Выигрышей пока нет</b>
        <small>Первый приз появится здесь после удачного вращения.</small>
      </div>
    `;
    return;
  }

  const cards = items.map((prize, index) => {
    const expiresAt = prize.expiresAt?.toDate?.();
    const expired = Boolean(expiresAt && expiresAt.getTime() <= Date.now());
    const redeemed = prize.status === 'redeemed';
    const unavailable = redeemed || expired;
    const stateClass = redeemed ? 'is-redeemed' : expired ? 'is-expired' : 'is-active';
    const stateText = redeemed ? 'Получен' : expired ? 'Срок истёк' : 'Можно забрать';
    const deadlineText = expiresAt ? expiresAt.toLocaleString('ru-RU') : '—';
    const barcodeMarkup = unavailable
      ? `
          <div class="mw-barcode mw-barcode-disabled" aria-label="${redeemed ? 'Штрихкод уже использован' : 'Штрихкод недоступен'}">
            <span>${redeemed ? 'Штрихкод уже использован' : 'Штрихкод недоступен'}</span>
            <small>${redeemed ? 'Подарок уже получен' : 'Срок получения истёк'}</small>
          </div>
        `
      : `
          <div class="mw-barcode">
            <svg data-barcode="${escapeHtml(prize.barcode)}"></svg>
            <b>${escapeHtml(prize.barcode)}</b>
          </div>
        `;

    return `
      <article class="mw-prize-card ${stateClass} ${unavailable ? 'is-unavailable' : ''} ${index >= 3 ? 'mw-prize-extra' : ''}" ${unavailable ? 'aria-disabled="true"' : ''}>
        <img src="${escapeHtml(prize.productImage || 'assets/as-logo-192.png')}" alt="">
        <div class="mw-prize-content">
          <span class="mw-prize-state">${stateText}</span>
          <b>${escapeHtml(prize.productName || 'Приз AutoStyle')}</b>
          <small class="mw-prize-deadline"><span>Забрать до</span><strong>${deadlineText}</strong></small>
        </div>
        ${barcodeMarkup}
      </article>
    `;
  }).join('');

  const hiddenCount = Math.max(0, items.length - 3);

  list.innerHTML = `
    <div class="mw-prize-items">${cards}</div>
    ${hiddenCount ? `
      <button class="mw-prizes-toggle" type="button" aria-expanded="false">
        <span>Показать ещё ${hiddenCount}</span><i>⌄</i>
      </button>
    ` : ''}
  `;

  const toggle = list.querySelector('.mw-prizes-toggle');

  if (toggle) {
    toggle.addEventListener('click', () => {
      const expanded = list.classList.toggle('is-expanded');
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.querySelector('span').textContent = expanded
        ? 'Свернуть'
        : `Показать ещё ${hiddenCount}`;
      toggle.querySelector('i').textContent = expanded ? '⌃' : '⌄';
    });
  }

  if (window.JsBarcode) {
    list.querySelectorAll('[data-barcode]').forEach(svg => {
      JsBarcode(svg, svg.dataset.barcode, {
        format: 'CODE128',
        height: 54,
        displayValue: false,
        margin: 3
      });
    });
  }
}

async function refreshWheel() {
  if (!currentUser) return;

  setStatus('Загрузка...');
  setSpinDisabled(true);

  try {
    currentEmailVerified = await refreshEmailVerification();

    if (!currentEmailVerified) {
      clearAvailabilityTimer();
      currentConfig = null;
      renderWheel({ enabled: false, products: [] });
      setStatus('Сначала подтвердите почту.');
      setSpinDisabled(true);
      showAccessGate('email');
      await renderPrizes([]);
      return;
    }

    hideAccessGate();

    const [configResult, stateResult, prizesResult] = await Promise.allSettled([
      getDoc(CONFIG_REF),
      getDoc(stateRef(currentUser.uid)),
      getDocs(query(
        collection(db, 'autostyle_wheel_prizes'),
        where('userId', '==', currentUser.uid)
      ))
    ]);

    const configSnapshot = configResult.status === 'fulfilled' ? configResult.value : null;
    const stateSnapshot = stateResult.status === 'fulfilled' ? stateResult.value : null;
    const prizesSnapshot = prizesResult.status === 'fulfilled' ? prizesResult.value : null;

    currentConfig = configSnapshot?.exists()
      ? configSnapshot.data()
      : { enabled: false, products: [] };

    renderWheel(currentConfig);

    const stateData = stateSnapshot?.exists() ? stateSnapshot.data() : {};
    const interval = Number(currentConfig.intervalHours || 48) * 3600000;
    const lastSpinMs = stateData.lastSpinAt?.toMillis?.() || 0;
    const nextSpinMs = stateData.nextAvailableAt?.toMillis?.() || lastSpinMs + interval;
    const now = Date.now();

    if (!currentConfig.enabled) {
      setStatus('Колесо временно выключено.');
      setSpinDisabled(true);
    } else if (now < nextSpinMs) {
      const remainingMs = nextSpinMs - now;
      const hours = Math.floor(remainingMs / 3600000);
      const minutes = Math.ceil((remainingMs % 3600000) / 60000);

      setStatus(`Следующая попытка через ${hours} ч ${minutes} мин`);
      setSpinDisabled(true);
    } else {
      setStatus('Можно крутить прямо сейчас!', true);
      setSpinDisabled(false);
    }

    scheduleReadyNotification(stateData);

    const prizeItems = prizesSnapshot
      ? prizesSnapshot.docs
        .map(item => ({ id: item.id, ...item.data() }))
        .sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        })
        .slice(0, 20)
      : [];

    await renderPrizes(prizeItems);
  } catch (error) {
    console.error('Ошибка загрузки мобильного колеса:', error);
    currentConfig = { enabled: false, products: [] };
    renderWheel(currentConfig);
    setStatus('Не удалось загрузить колесо. Обнови страницу.');
    setSpinDisabled(true);
    await renderPrizes([]);
  }
}

function createConfetti() {
  const container = $('#mwConfetti');
  if (!container) return;

  container.innerHTML = '';
  const symbols = ['●', '■', '◆', '★'];

  for (let index = 0; index < 48; index++) {
    const piece = document.createElement('i');
    piece.textContent = symbols[index % symbols.length];
    piece.style.setProperty('--x', `${Math.random() * 100}%`);
    piece.style.setProperty('--delay', `${Math.random() * 0.45}s`);
    piece.style.setProperty('--duration', `${1.7 + Math.random() * 1.4}s`);
    piece.style.setProperty('--drift', `${-70 + Math.random() * 140}px`);
    piece.style.setProperty('--spin', `${180 + Math.random() * 720}deg`);
    container.appendChild(piece);
  }
}

function closeResultModal() {
  const modal = $('#mwResultModal');
  if (!modal) return;

  modal.classList.remove('is-open');
  document.documentElement.classList.remove('mw-modal-open');

  setTimeout(() => {
    modal.hidden = true;
  }, 260);
}

function showResultModal(result) {
  const modal = $('#mwResultModal');
  if (!modal) return;

  const noPrize = Boolean(result?.noPrize);
  const image = $('#mwResultImage');
  const title = $('#mwResultTitle');
  const name = $('#mwResultName');
  const text = $('#mwResultText');
  const badge = $('#mwResultBadge');
  const burst = $('#mwResultBurst');
  const action = $('#mwResultAction');

  if (noPrize) {
    modal.classList.add('is-empty-result');
    badge.textContent = 'ПОПРОБУЙ ЕЩЁ';
    title.textContent = 'Почти получилось!';
    name.textContent = 'В этот раз без подарка';
    text.textContent = 'Новая попытка появится после завершения таймера.';
    burst.textContent = '↻';
    image.src = 'assets/as-logo-192.png';
    action.textContent = 'Хорошо';
  } else {
    modal.classList.remove('is-empty-result');
    badge.textContent = 'ТВОЙ ПРИЗ';
    title.textContent = 'Ты выиграл!';
    name.textContent = result.name || 'Подарок AutoStyle';
    text.textContent = 'Приз уже сохранён ниже. Покажи штрихкод сотруднику магазина.';
    burst.textContent = '🎉';
    image.src = result.image || 'assets/as-logo-192.png';
    action.textContent = 'Забрать подарок';
    createConfetti();
  }

  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add('is-open'));
  document.documentElement.classList.add('mw-modal-open');
  vibrate(noPrize ? [50] : [80, 60, 120, 60, 180]);
}

async function spin() {
  if (spinning || !currentUser || !currentConfig || !currentEmailVerified) return;

  currentEmailVerified = await refreshEmailVerification();
  if (!currentEmailVerified) {
    currentConfig = null;
    setStatus('Сначала подтвердите почту.');
    setSpinDisabled(true);
    showAccessGate('email');
    return;
  }

  spinning = true;
  setSpinDisabled(true);
  vibrate(35);

  try {
    const products = (currentConfig.products || [])
      .filter(item => item.enabled !== false && Number(item.chance) > 0);

    const chanceSum = products.reduce((sum, item) => sum + Number(item.chance || 0), 0);
    const items = [
      ...products,
      ...(chanceSum < 100 ? [{
        name: 'Попробуй ещё',
        chance: 100 - chanceSum,
        noPrize: true
      }] : [])
    ];

    if (!items.length) throw new Error('Призы пока не настроены.');

    const result = weightedResult(items);
    const selectedIndex = Math.max(0, items.findIndex(item => item === result));
    const equalStep = 360 / items.length;
    const segmentCenter = selectedIndex * equalStep + equalStep / 2;

    const wheel = $('#mwFortuneWheel');
    const stage = $('#mwWheelStage');
    const card = document.querySelector('.mw-game-card');

    const startRotation = rotation;
    const extraTurns = 5 * 360;

    // Верхняя стрелка соответствует углу 0°.
    // Сначала определяем текущее положение колеса внутри одного оборота,
    // затем рассчитываем только необходимый доворот выбранного сектора к стрелке.
    // Поэтому визуальный сектор и сохранённый выигрыш совпадают на каждом вращении.
    const currentNormalized = ((startRotation % 360) + 360) % 360;
    const selectedTarget = ((360 - segmentCenter) % 360 + 360) % 360;
    const correction = (selectedTarget - currentNormalized + 360) % 360;
    const targetRotation = startRotation + extraTurns + correction;
    rotation = targetRotation;

    wheel.getAnimations().forEach(animation => animation.cancel());
    wheel.classList.add('is-spinning');
    stage?.classList.add('is-spinning');
    card?.classList.add('is-spinning');

    const animation = wheel.animate([
      { transform: `rotate(${startRotation}deg)` },
      { transform: `rotate(${targetRotation}deg)` }
    ], {
      duration: 4300,
      easing: 'cubic-bezier(.10,.72,.08,1)',
      fill: 'forwards'
    });

    await animation.finished;
    animation.cancel();
    wheel.style.transform = `rotate(${targetRotation}deg)`;

    wheel.classList.remove('is-spinning');
    stage?.classList.remove('is-spinning');
    card?.classList.remove('is-spinning');
    vibrate([35, 35, 70]);

    const claimHours = Number(currentConfig.claimHours || 48);
    const spinAt = Date.now();

    await runTransaction(db, async transaction => {
      const userStateRef = stateRef(currentUser.uid);
      const stateSnapshot = await transaction.get(userStateRef);
      const configSnapshot = await transaction.get(CONFIG_REF);

      if (currentUser.emailVerified !== true) {
        throw new Error('Сначала подтвердите почту.');
      }

      const liveConfig = configSnapshot.exists()
        ? configSnapshot.data()
        : currentConfig;

      const liveState = stateSnapshot.exists()
        ? stateSnapshot.data()
        : {};

      const lastSpinMs = liveState.lastSpinAt?.toMillis?.() || 0;
      const interval = Number(liveConfig.intervalHours || 48) * 3600000;
      const nextAvailableMs = liveState.nextAvailableAt?.toMillis?.() || lastSpinMs + interval;

      if (Date.now() < nextAvailableMs) {
        throw new Error('Играть пока рано.');
      }

      transaction.set(userStateRef, {
        lastSpinAt: serverTimestamp(),
        lastSpinClientAt: spinAt,
        nextAvailableAt: Timestamp.fromMillis(spinAt + interval),
        readyNotificationKey: String(spinAt),
        readyNotificationSent: false,
        lastResult: result.noPrize ? 'none' : result.productId || '',
        updatedAt: serverTimestamp()
      }, { merge: true });

      if (!result.noPrize) {
        const prizeRef = doc(collection(db, 'autostyle_wheel_prizes'));
        const prizeBarcode = barcode();

        transaction.set(prizeRef, {
          userId: currentUser.uid,
          userEmail: currentUser.email || '',
          productId: result.productId || '',
          productCode: result.code || '',
          productName: result.name || 'Приз',
          productImage: result.image || '',
          barcode: prizeBarcode,
          status: 'active',
          createdAt: serverTimestamp(),
          expiresAt: Timestamp.fromMillis(spinAt + claimHours * 3600000)
        });

        transaction.set(notificationRef(`wheel-win-${currentUser.uid}-${prizeRef.id}`), {
          audience: 'user',
          userId: currentUser.uid,
          uid: currentUser.uid,
          userEmail: currentUser.email || '',
          type: 'wheel_win',
          title: '🎉 Поздравляем с выигрышем!',
          text: `Вы выиграли: ${result.name || 'Приз'}. Покажите штрихкод сотруднику AutoStyle.`,
          html: `<p>Вы выиграли: <b>${escapeHtml(result.name || 'Приз')}</b>.</p><p>Покажите штрихкод сотруднику AutoStyle.</p>`,
          link: 'mobile-wheel.html',
          createdAt: serverTimestamp(),
          createdBy: 'wheel-system',
          prizeId: prizeRef.id
        });
      }
    });

    showResultModal(result);
    await refreshWheel();
  } catch (error) {
    console.error('Ошибка вращения колеса:', error);
    if (String(error?.message || error).includes('подтвердите почту')) {
      currentEmailVerified = false;
      currentConfig = null;
      setStatus('Сначала подтвердите почту.');
      setSpinDisabled(true);
      showAccessGate('email');
      return;
    }
    showResultModal({
      noPrize: true,
      name: error?.message || String(error)
    });
    await refreshWheel();
  } finally {
    spinning = false;
  }
}

$('#mwSpinButton')?.addEventListener('click', spin);
$('#mwResultClose')?.addEventListener('click', closeResultModal);
$('#mwResultAction')?.addEventListener('click', closeResultModal);
document.querySelector('.mw-result-backdrop')?.addEventListener('click', closeResultModal);

onAuthStateChanged(auth, async user => {
  currentUser = user || null;
  currentEmailVerified = false;

  if (!currentUser) {
    clearAvailabilityTimer();
    showAccessGate('guest');
    setStatus('Войдите в профиль, чтобы играть.');
    setSpinDisabled(true);
    hideLoader();
    return;
  }

  hideAccessGate();

  try {
    await currentUser.getIdToken();
    await refreshWheel();
  } finally {
    hideLoader();
  }
});
