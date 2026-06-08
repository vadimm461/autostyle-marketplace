import { db } from './firebase.js';
import {
  collection, getDocs, query, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  NOTIFICATIONS_COLLECTION,
  createNotification,
  stripHtml,
  esc,
  fmt,
  notificationText
} from './notify-service.js';

const $ = s => document.querySelector(s);

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
    let snap;
    try {
      snap = await getDocs(query(collection(db, NOTIFICATIONS_COLLECTION), orderBy('createdAt','desc'), limit(40)));
    } catch (orderedErr) {
      console.warn('notifications ordered query failed, fallback without orderBy', orderedErr);
      snap = await getDocs(collection(db, NOTIFICATIONS_COLLECTION));
    }
    const items = snap.docs
      .map(d => ({ id:d.id, ...d.data() }))
      .sort((a,b) => {
        const ad = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAtLocal || a.createdAt || 0);
        const bd = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAtLocal || b.createdAt || 0);
        return bd - ad;
      })
      .slice(0, 40);
    box.innerHTML = items.length ? items.map(n => `
      <article class="admin-notify-history-item">
        <b>${esc(n.title || 'Уведомление')}</b>
        <div>${esc(notificationText(n))}</div>
        <small>${esc(fmt(n.createdAt || n.createdAtLocal))} · ${esc(n.audience || 'all')}${n.userEmail ? ` · ${esc(n.userEmail)}` : ''}</small>
      </article>
    `).join('') : '<div class="muted">История уведомлений пустая.</div>';
  }catch(e){
    box.innerHTML = `<div class="upload-error">Не удалось загрузить историю: ${esc(e.message || e)}<br><small>Проверь firestore.rules из файла firestore.rules в архиве.</small></div>`;
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
    await createNotification({ title, html, text, audience: 'all', type: 'admin_broadcast' });
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
