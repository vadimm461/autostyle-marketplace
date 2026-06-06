
import { db, COLLECTIONS } from './firebase.js';
import {
  collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const COLLECTION = COLLECTIONS.notifications || 'autostyle_notifications';

const $ = s => document.querySelector(s);

function stripHtml(html){
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return div.textContent || div.innerText || '';
}
function esc(v){
  return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");
}
function fmt(v){
  try{
    const d = v?.toDate ? v.toDate() : new Date(v || Date.now());
    return d.toLocaleString('ru-RU');
  }catch(e){ return ''; }
}
function editorCommand(cmd, value = null){
  const body = $('#adminNotifyBody');
  body?.focus();
  document.execCommand(cmd, false, value);
}
function insertEmoji(emoji){
  const body = $('#adminNotifyBody');
  body?.focus();
  document.execCommand('insertText', false, emoji);
}
async function renderHistory(){
  const box = $('#adminNotifyHistory');
  if (!box) return;
  box.innerHTML = '<div class="muted">Загружаем историю...</div>';
  try{
    const snap = await getDocs(query(collection(db, COLLECTION), orderBy('createdAt','desc'), limit(30)));
    const items = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    box.innerHTML = items.length ? items.map(n => `
      <article class="admin-notify-history-item">
        <b>${esc(n.title || 'Уведомление')}</b>
        <div>${esc(n.text || stripHtml(n.html) || '')}</div>
        <small>${esc(fmt(n.createdAt))} · ${esc(n.audience || 'all')}</small>
      </article>
    `).join('') : '<div class="muted">История уведомлений пустая.</div>';
  }catch(e){
    box.innerHTML = `<div class="upload-error">Не удалось загрузить историю: ${esc(e.message)}</div>`;
  }
}
async function sendNotification(){
  const title = $('#adminNotifyTitle')?.value.trim();
  const body = $('#adminNotifyBody');
  const status = $('#adminNotifyStatus');
  const html = body?.innerHTML.trim() || '';
  const text = stripHtml(html).trim();
  if (!title || !text) {
    status.textContent = 'Заполни заголовок и текст уведомления.';
    return;
  }
  status.textContent = 'Отправляем...';
  try{
    const payload = {
      title,
      html,
      text,
      audience: 'all',
      createdAt: serverTimestamp(),
      createdAtLocal: new Date().toISOString()
    };
    await addDoc(collection(db, COLLECTION), payload);
    try {
      const local = JSON.parse(localStorage.getItem('autostyle_notifications_cache') || '[]');
      local.unshift({ ...payload, createdAt: new Date().toISOString() });
      localStorage.setItem('autostyle_notifications_cache', JSON.stringify(local.slice(0,80)));
    } catch(e) {}
    $('#adminNotifyTitle').value = '';
    body.innerHTML = '';
    status.textContent = 'Уведомление отправлено всем пользователям.';
    renderHistory();
  }catch(e){
    status.textContent = 'Ошибка отправки: ' + e.message;
  }
}
function bind(){
  if (!$('#notifications')) return;
  $('#adminNotifySend')?.addEventListener('click', sendNotification);
  $('#adminNotifyBold')?.addEventListener('click', () => editorCommand('bold'));
  $('#adminNotifyItalic')?.addEventListener('click', () => editorCommand('italic'));
  $('#adminNotifyUnderline')?.addEventListener('click', () => editorCommand('underline'));
  $('#adminNotifyFont')?.addEventListener('change', e => editorCommand('fontName', e.target.value));
  document.querySelectorAll('[data-admin-emoji]').forEach(btn => {
    btn.addEventListener('click', () => insertEmoji(btn.dataset.adminEmoji));
  });
  renderHistory();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
else bind();
