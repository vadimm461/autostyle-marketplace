import { db, storage } from './firebase.js';
import {
  collection, getDocs, query, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  ref, uploadBytes, getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import {
  NOTIFICATIONS_COLLECTION,
  createNotification,
  stripHtml,
  esc,
  fmt,
  notificationText
} from './notify-service.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const EMOJIS = '😀 😃 😄 😁 😆 😅 😂 🙂 😉 😊 😍 😘 😎 🤩 🥳 🤝 🙌 👏 👍 👎 ✅ ☑️ ✔️ ❌ ⚠️ 🔥 🎁 🎉 💚 💳 🛒 🚗 🛞 🔧 🧰 🧽 🧴 💡 🏁 ⭐ 💥 📢 📌 🕒 💰 🏷️ 🚚 📦'.split(' ');
const FONTS = [
  'Arial','Arial Black','Verdana','Tahoma','Trebuchet MS','Times New Roman','Georgia','Garamond','Courier New','Lucida Console','Impact','Comic Sans MS','Segoe UI','Roboto','Open Sans','Montserrat','Inter','system-ui','serif','sans-serif','monospace'
];
const SIZES = ['12px','14px','16px','18px','20px','24px','28px','32px','36px','48px'];

function editor(){ return $('#adminNotifyBody'); }
function source(){ return $('#adminNotifyHtmlSource'); }
function saveSelection(){
  const sel = window.getSelection();
  if (sel && sel.rangeCount) window.__notifyEditorRange = sel.getRangeAt(0);
}
function restoreSelection(){
  const range = window.__notifyEditorRange;
  if (!range) return;
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
function syncSource(){ if (source() && editor()) source().value = editor().innerHTML; }
function syncEditor(){ if (source() && editor()) editor().innerHTML = source().value; }
function command(cmd, value = null){
  const body = editor();
  if (!body) return;
  body.focus();
  restoreSelection();
  document.execCommand(cmd, false, value);
  saveSelection();
  syncSource();
}
function insertHtml(html){
  const body = editor();
  if (!body) return;
  body.focus();
  restoreSelection();
  document.execCommand('insertHTML', false, html);
  saveSelection();
  syncSource();
}
function wrapSelection(style){
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const span = document.createElement('span');
  span.setAttribute('style', style);
  try { range.surroundContents(span); }
  catch(e) { span.appendChild(range.extractContents()); range.insertNode(span); }
  syncSource();
}
function applyFont(font){ command('fontName', font); }
function applySize(size){ wrapSelection(`font-size:${size};`); }
function applyColor(color){ command('foreColor', color); }
function applyBg(color){ command('hiliteColor', color); }
function insertEmoji(emoji){ insertHtml(emoji); }
function createLink(){
  const url = prompt('Вставь ссылку:');
  if (!url) return;
  const text = window.getSelection()?.toString() || url;
  insertHtml(`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>`);
}
function insertImageUrl(){
  const url = prompt('Вставь URL картинки:');
  if (!url) return;
  insertHtml(`<p><img src="${esc(url)}" alt="" style="max-width:100%;border-radius:14px;"></p>`);
}
async function uploadImageFile(file){
  if (!file) return '';
  const safeName = file.name.replace(/[^\w.\-а-яА-ЯёЁ]/g, '_');
  const fileRef = ref(storage, `notifications/${Date.now()}-${safeName}`);
  await uploadBytes(fileRef, file);
  return getDownloadURL(fileRef);
}
async function insertImageFile(){
  const input = $('#adminNotifyImageFile');
  const status = $('#adminNotifyStatus');
  const file = input?.files?.[0];
  if (!file) return alert('Выбери файл изображения');
  try{
    if (status) status.textContent = 'Загружаем фото...';
    const url = await uploadImageFile(file);
    insertHtml(`<p><img src="${esc(url)}" alt="" style="max-width:100%;border-radius:14px;"></p>`);
    input.value = '';
    if (status) status.textContent = 'Фото вставлено в уведомление.';
  }catch(e){
    if (status) status.textContent = 'Ошибка загрузки фото: ' + (e.message || e);
  }
}
function insertHtmlBlock(){
  const html = prompt('Вставь HTML-код:');
  if (!html) return;
  insertHtml(html);
}
function toggleHtmlEditor(){
  const box = $('#adminNotifyHtmlBox');
  if (!box) return;
  const isOpen = box.style.display !== 'none';
  if (isOpen) {
    syncEditor();
    box.style.display = 'none';
  } else {
    syncSource();
    box.style.display = 'block';
  }
}
function renderEmojiPanel(){
  const box = $('#adminNotifyEmojiPanel');
  if (!box) return;
  box.innerHTML = EMOJIS.map(e => `<button type="button" data-admin-emoji="${esc(e)}">${esc(e)}</button>`).join('');
}
function renderFontOptions(){
  const font = $('#adminNotifyFont');
  const size = $('#adminNotifySize');
  if (font) font.innerHTML = FONTS.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('');
  if (size) size.innerHTML = SIZES.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
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
        <div>${n.html || esc(notificationText(n))}</div>
        <small>${esc(fmt(n.createdAt || n.createdAtLocal))} · ${esc(n.audience || 'all')}${n.userEmail ? ` · ${esc(n.userEmail)}` : ''}</small>
      </article>
    `).join('') : '<div class="muted">История уведомлений пустая.</div>';
  }catch(e){
    box.innerHTML = `<div class="upload-error">Не удалось загрузить историю: ${esc(e.message || e)}<br><small>Проверь firestore.rules из файла firestore.rules в архиве.</small></div>`;
  }
}
async function sendNotification(){
  if ($('#adminNotifyHtmlBox')?.style.display !== 'none') syncEditor();
  const title = $('#adminNotifyTitle')?.value.trim();
  const body = editor();
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
    syncSource();
    status.textContent = 'Уведомление отправлено всем пользователям.';
    renderHistory();
  }catch(e){
    status.textContent = 'Ошибка отправки: ' + e.message;
  }
}
function bind(){
  if (!$('#notifications')) return;
  renderFontOptions();
  renderEmojiPanel();
  const body = editor();
  body?.addEventListener('keyup', () => { saveSelection(); syncSource(); });
  body?.addEventListener('mouseup', saveSelection);
  body?.addEventListener('input', syncSource);
  source()?.addEventListener('input', syncEditor);
  $('#adminNotifySend')?.addEventListener('click', sendNotification);
  $('#adminNotifyBold')?.addEventListener('click', () => command('bold'));
  $('#adminNotifyItalic')?.addEventListener('click', () => command('italic'));
  $('#adminNotifyUnderline')?.addEventListener('click', () => command('underline'));
  $('#adminNotifyStrike')?.addEventListener('click', () => command('strikeThrough'));
  $('#adminNotifyUl')?.addEventListener('click', () => command('insertUnorderedList'));
  $('#adminNotifyOl')?.addEventListener('click', () => command('insertOrderedList'));
  $('#adminNotifyLeft')?.addEventListener('click', () => command('justifyLeft'));
  $('#adminNotifyCenter')?.addEventListener('click', () => command('justifyCenter'));
  $('#adminNotifyRight')?.addEventListener('click', () => command('justifyRight'));
  $('#adminNotifyLink')?.addEventListener('click', createLink);
  $('#adminNotifyImageUrl')?.addEventListener('click', insertImageUrl);
  $('#adminNotifyImageInsert')?.addEventListener('click', insertImageFile);
  $('#adminNotifyHtmlInsert')?.addEventListener('click', insertHtmlBlock);
  $('#adminNotifyHtmlToggle')?.addEventListener('click', toggleHtmlEditor);
  $('#adminNotifyClear')?.addEventListener('click', () => { if (confirm('Очистить текст уведомления?')) { body.innerHTML = ''; syncSource(); }});
  $('#adminNotifyFont')?.addEventListener('change', e => applyFont(e.target.value));
  $('#adminNotifySize')?.addEventListener('change', e => applySize(e.target.value));
  $('#adminNotifyColor')?.addEventListener('input', e => applyColor(e.target.value));
  $('#adminNotifyBgColor')?.addEventListener('input', e => applyBg(e.target.value));
  $$('#adminNotifyEmojiPanel [data-admin-emoji]').forEach(btn => btn.addEventListener('click', () => insertEmoji(btn.dataset.adminEmoji)));
  renderHistory();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
else bind();
