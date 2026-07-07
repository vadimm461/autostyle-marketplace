import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, setDoc, updateDoc, collection, addDoc, increment, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const DAILY = 'autostyle_analytics_daily';
const EVENTS = 'autostyle_analytics_events';
const SESSION_KEY = 'as_analytics_session_id';
const VISIT_KEY_PREFIX = 'as_analytics_visit_';
let currentUser = null;

function pad(n){ return String(n).padStart(2, '0'); }
function todayKey(){ const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function pageKey(){
  const raw = (document.body?.dataset?.page || location.pathname.split('/').pop() || 'index.html').replace('.html','') || 'home';
  if (raw === 'index') return 'home';
  if (raw === 'mobile') return 'mobile-home';
  return raw;
}
function sessionId(){
  let id = sessionStorage.getItem(SESSION_KEY);
  if(!id){ id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; sessionStorage.setItem(SESSION_KEY, id); }
  return id;
}
function safeInfo(extra={}){
  return {
    page: pageKey(),
    path: location.pathname,
    title: document.title || '',
    referrer: document.referrer || '',
    device: /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
    sessionId: sessionId(),
    userId: currentUser?.uid || null,
    userEmail: currentUser?.email || null,
    ...extra
  };
}
async function updateDaily(fields){
  const id = todayKey();
  const ref = doc(db, DAILY, id);
  try {
    await setDoc(ref, { date: id, updatedAt: serverTimestamp(), createdAtText: new Date().toISOString() }, { merge: true });
    await updateDoc(ref, fields);
  } catch (err) {
    console.warn('analytics daily update error', err);
  }
}
export async function trackEvent(type, extra={}){
  const eventType = String(type || '').trim();
  if(!eventType) return;
  const info = safeInfo(extra);
  const fields = {
    visits: increment(eventType === 'page_view' ? 1 : 0),
    [`events.${eventType}`]: increment(1),
    [`pages.${info.page}`]: increment(eventType === 'page_view' ? 1 : 0),
    updatedAt: serverTimestamp()
  };
  if(eventType === 'registration') fields.registrations = increment(1);
  if(eventType === 'login') fields.logins = increment(1);
  if(eventType === 'profile_saved') fields.profileSaves = increment(1);
  if(eventType === 'profile_completed') fields.profileActivations = increment(1);
  if(eventType === 'discount_card_activated') fields.discountCardActivations = increment(1);
  if(eventType === 'order_created') fields.ordersCreated = increment(1);
  if(eventType === 'feedback_sent') fields.feedbackSent = increment(1);
  if(eventType === 'add_to_cart') fields.addToCart = increment(1);
  if(eventType === 'product_view') fields.productViews = increment(1);
  await updateDaily(fields);
  try {
    await addDoc(collection(db, EVENTS), {
      type: eventType,
      ...info,
      createdAt: serverTimestamp(),
      createdAtText: new Date().toISOString()
    });
  } catch (err) {
    console.warn('analytics event write error', err);
  }
}

function bindBehaviourEvents(){
  if(pageKey() === 'product' || pageKey() === 'mobile-product') {
    const id = new URLSearchParams(location.search).get('id') || '';
    trackEvent('product_view', { productId:id });
  }
  document.addEventListener('click', e => {
    const btn = e.target?.closest?.('button, a');
    if(!btn) return;
    const txt = (btn.textContent || btn.getAttribute('aria-label') || '').toLowerCase();
    const data = Object.keys(btn.dataset || {}).join(' ').toLowerCase();
    if(txt.includes('корзин') || data.includes('cart')) trackEvent('add_to_cart');
  }, true);
}

function trackPageOnce(){
  const key = VISIT_KEY_PREFIX + todayKey() + '_' + pageKey() + '_' + location.pathname;
  if(sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, '1');
  trackEvent('page_view');
}

window.AutoStyleAnalytics = { trackEvent };
onAuthStateChanged(auth, user => { currentUser = user || null; });
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', trackPageOnce, { once:true });
else trackPageOnce();
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindBehaviourEvents, { once:true });
else bindBehaviourEvents();
