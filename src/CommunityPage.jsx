import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AtSign, ImagePlus, LoaderCircle, MessageCircle, MoreHorizontal, Reply, Trash2, Users, X } from 'lucide-react';
import './community.css';

const MAX_MESSAGE_LENGTH = 1000;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const POLL_INTERVAL = 5000;
const MAX_UPLOAD_BYTES = 2.2 * 1024 * 1024;
const ACCENT_COLORS = ['#00c7fe', '#35d6e8', '#42e6a0', '#60a5fa', '#2dd4bf', '#8be8ff', '#79dff3', '#00a8d6'];

function accentFor(value) {
  const text = String(value || 'trader');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return ACCENT_COLORS[Math.abs(hash) % ACCENT_COLORS.length];
}

async function fileToImagePayload(file) {
  let uploadFile = file;
  if (file.size > 1.8 * 1024 * 1024) {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1800 / bitmap.width, 1800 / bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close?.();
      for (const quality of [0.92, 0.86, 0.8, 0.74]) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
        if (blob && (blob.size < uploadFile.size || blob.size <= MAX_UPLOAD_BYTES)) {
          uploadFile = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp', lastModified: Date.now() });
          if (uploadFile.size <= MAX_UPLOAD_BYTES) break;
        }
      }
    } catch (error) {
      if (file.size > MAX_UPLOAD_BYTES) throw new Error('This image is too large to send on this device. Choose a smaller screenshot.');
    }
  }
  if (uploadFile.size > MAX_UPLOAD_BYTES) throw new Error('Image is still too large after compression. Choose a smaller screenshot (under 2.2 MB).');
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read that image. Please choose it again.'));
    reader.readAsDataURL(uploadFile);
  });
  return { imageData: dataUrl.slice(dataUrl.indexOf(',') + 1), imageType: uploadFile.type || file.type };
}

function getDisplayName(user) {
  const value = String(user?.displayName || user?.email?.split('@')[0] || '').trim();
  return value.slice(0, 48) || `Trader ${String(user?.uid || '').slice(-4) || 'member'}`;
}
function initials(value) {
  return String(value || 'T').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'T';
}
function formatTime(value) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'now';
  const today = date.toDateString() === new Date().toDateString();
  return today
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
async function authorizedFetch(user, method = 'GET', body, query = '') {
  const token = await user.getIdToken();
  const response = await fetch('/api/community-message' + query, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store'
  });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) throw Object.assign(new Error(payload.error || 'Community is temporarily unavailable.'), { status: response.status });
  return payload;
}

export default function CommunityPage({ user }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [members, setMembers] = useState([]);
  const [mentionUids, setMentionUids] = useState([]);
  const [mentionEveryoneFlag, setMentionEveryoneFlag] = useState(false);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionStart, setMentionStart] = useState(-1);
  const [sendingStage, setSendingStage] = useState('');
  const [brokenImages, setBrokenImages] = useState({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notificationToast, setNotificationToast] = useState(null);
  const [menuFor, setMenuFor] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const listRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const atBottomRef = useRef(true);
  const firstLoadRef = useRef(true);
  const touchStartRef = useRef(null);
  const lastSentAtRef = useRef(0);
  const seenNotificationIdsRef = useRef(new Set());
  const notificationsInitializedRef = useRef(false);
  const displayName = useMemo(() => getDisplayName(user), [user]);

  useEffect(() => { if (!notificationToast) return; const timer = window.setTimeout(() => setNotificationToast(null), 5200); return () => window.clearTimeout(timer); }, [notificationToast]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const updateViewport = () => document.documentElement.style.setProperty('--community-visual-height', (viewport?.height || window.innerHeight) + 'px');
    updateViewport();
    viewport?.addEventListener('resize', updateViewport);
    window.addEventListener('resize', updateViewport);
    return () => {
      viewport?.removeEventListener('resize', updateViewport);
      window.removeEventListener('resize', updateViewport);
      document.documentElement.style.removeProperty('--community-visual-height');
    };
  }, []);

  useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview); }, [imagePreview]);

  const chooseImage = event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) { setError('Choose a JPG, PNG, WebP or GIF image.'); return; }
    if (file.size > MAX_IMAGE_SIZE) { setError('Images must be 5 MB or smaller.'); return; }
    setError('');
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(current => { if (current) URL.revokeObjectURL(current); return ''; });
  };

  const loadMessages = async (quiet = false) => {
    if (!user?.uid) {
      setLoading(false);
      setError('Sign in to join the community.');
      return;
    }
    try {
      const payload = await authorizedFetch(user);
      setMessages(Array.isArray(payload.messages) ? payload.messages : []);
      setError('');
      setLoading(false);
      if (firstLoadRef.current || atBottomRef.current) {
        firstLoadRef.current = false;
        requestAnimationFrame(() => {
          if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
        });
      }
    } catch (err) {
      console.error('KitSetups community load failed:', err);
      setLoading(false);
      setError(err?.status === 401 ? (err.message || 'Sign in again to continue.') : (err.message || 'Could not load the conversation.'));
    }
  };

  useEffect(() => {
    let active = true;
    authorizedFetch(user, 'GET', undefined, '?members=1').then(payload => {
      if (active && Array.isArray(payload.members)) setMembers(payload.members);
    }).catch(err => console.warn('KitSetups community member list could not load:', err));
    return () => { active = false; };
  }, [user?.uid]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!active) return;
      await loadMessages();
      try {
        const payload = await authorizedFetch(user, 'GET', undefined, '?notifications=1');
        const notifications = Array.isArray(payload.notifications) ? payload.notifications : [];
        if (!notificationsInitializedRef.current) {
          notifications.forEach(item => seenNotificationIdsRef.current.add(item.id));
          notificationsInitializedRef.current = true;
        } else {
          const fresh = notifications.filter(item => item.id && !seenNotificationIdsRef.current.has(item.id));
          notifications.forEach(item => seenNotificationIdsRef.current.add(item.id));
          if (fresh.length) {
            const item = fresh[0];
            setNotificationToast({ title: item.senderName ? item.senderName + ' mentioned you' : 'You were mentioned', text: item.text || 'Open the community to see the message.' });
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              try { new Notification(item.type === 'everyone_mention' ? 'KitSetups · @everyone' : 'KitSetups · Mention', { body: (item.senderName ? item.senderName + ': ' : '') + (item.text || 'You were mentioned in the community.'), icon: '/kitsetups-logo.svg', tag: 'community-mention-' + item.id }); } catch {}
            }
          }
        }
      } catch (err) { console.warn('KitSetups community notifications could not load:', err); }
    };
    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL);
    return () => { active = false; clearInterval(timer); };
  }, [user?.uid]);

  const sendMessage = async event => {
    event?.preventDefault();
    const text = draft.trim();
    if ((!text && !imageFile) || !user?.uid || sending) return;
    if (text.length > MAX_MESSAGE_LENGTH) {
      setError(`Messages must be ${MAX_MESSAGE_LENGTH.toLocaleString()} characters or fewer.`);
      return;
    }
    if (Date.now() - lastSentAtRef.current < 1200) {
      setError('Give it a second before sending another message.');
      return;
    }
    lastSentAtRef.current = Date.now();
    setSending(true);
    setError('');
    try {
      let imagePayload = {};
      if (imageFile) {
        setSendingStage('Preparing image…');
        imagePayload = await fileToImagePayload(imageFile);
      }
      setSendingStage(imageFile ? 'Uploading image & sending…' : 'Sending…');
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 45000);
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/community-message', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, ...imagePayload, replyToId: replyTo?.id || '', mentionUids, mentionEveryone: mentionEveryoneFlag }),
          cache: 'no-store',
          signal: controller.signal
        });
        let payload = {};
        try { payload = await response.json(); } catch {}
        if (!response.ok) throw Object.assign(new Error(payload.error || 'Message not sent. Please try again.'), { status: response.status });
      } finally {
        window.clearTimeout(timeout);
      }
      setDraft('');
      setMentionUids([]);
      setMentionEveryoneFlag(false);
      setMentionQuery(null);
      setMentionStart(-1);
      setReplyTo(null);
      clearImage();
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      atBottomRef.current = true;
      await loadMessages(true);
    } catch (err) {
      console.error('KitSetups community send failed:', err);
      setError(err.name === 'AbortError' ? 'Sending timed out. Check your connection and try again.' : (err.message || 'Message not sent. Check your connection and try again.'));
      lastSentAtRef.current = 0;
    } finally {
      setSending(false);
      setSendingStage('');
    }
  };

  const deleteMessage = async message => {
    setMenuFor('');
    if (message.uid !== user?.uid) return;
    setDeletingId(message.id);
    setError('');
    try {
      await authorizedFetch(user, 'DELETE', { id: message.id });
      setMessages(current => current.filter(item => item.id !== message.id));
    } catch (err) {
      console.error('KitSetups community delete failed:', err);
      setError(err.message || 'Could not delete that message.');
    } finally {
      setDeletingId('');
    }
  };

  const startReply = message => {
    setReplyTo({
      id: message.id,
      uid: message.uid,
      displayName: message.displayName || 'KitSetups trader',
      text: message.text || '',
      imageUrl: message.imageUrl || ''
    });
    setMenuFor('');
    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 60);
  };

  const handleMessageTouchStart = event => {
    if (event.target.closest('button, a, input')) {
      touchStartRef.current = null;
      return;
    }
    const touch = event.touches?.[0];
    if (touch) touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleMessageTouchEnd = (event, message) => {
    const start = touchStartRef.current;
    const touch = event.changedTouches?.[0];
    touchStartRef.current = null;
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (dx > 64 && Math.abs(dy) < 52) startReply(message);
  };

  const jumpToMessage = id => {
    const target = document.getElementById('community-message-' + id);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('community-message-highlight');
    window.setTimeout(() => target.classList.remove('community-message-highlight'), 1300);
  };

  const updateDraft = value => {
    setDraft(value);
    const caret = textareaRef.current?.selectionStart ?? value.length;
    const beforeCaret = value.slice(0, caret);
    const match = beforeCaret.match(/(^|\s)@([\w.-]{0,32})$/);
    if (match) {
      setMentionQuery(match[2].toLowerCase());
      setMentionStart(caret - match[2].length - 1);
    } else {
      setMentionQuery(null);
      setMentionStart(-1);
    }
    if (error) setError('');
  };

  const insertMention = member => {
    const start = mentionStart >= 0 ? mentionStart : draft.length;
    const caret = textareaRef.current?.selectionStart ?? draft.length;
    const end = textareaRef.current?.selectionEnd ?? caret;
    const before = draft.slice(0, start);
    const after = draft.slice(end);
    const token = '@' + member.displayName.replace(/\s+/g, ' ') + ' ';
    setDraft(before + token + after);
    setMentionUids(current => current.includes(member.uid) ? current : [...current, member.uid]);
    setMentionQuery(null);
    setMentionStart(-1);
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      const position = (before + token).length;
      node.focus();
      node.setSelectionRange(position, position);
      node.style.height = 'auto';
      node.style.height = Math.min(node.scrollHeight, 180) + 'px';
    });
  };

  const mentionMatches = mentionQuery === null ? [] : members
    .filter(member => member.uid !== user?.uid && member.displayName.toLowerCase().includes(mentionQuery))
    .slice(0, 6);

  const mentionEveryone = () => {
    const allUids = members.map(member => member.uid).filter(uid => uid && uid !== user?.uid);
    setMentionUids(current => [...new Set([...current, ...allUids])]);
    setMentionEveryoneFlag(true);
    setDraft(current => (current.trimEnd() ? current.trimEnd() + ' ' : '') + '@everyone ');
    setMentionQuery(null);
    setMentionStart(-1);
    textareaRef.current?.focus();
  };

  const handleListScroll = () => {
    const node = listRef.current;
    if (!node) return;
    atBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100;
  };

  return (
    <section className="community-page" aria-labelledby="community-title">
      <header className="community-heading">
        <div className="community-heading-copy">
          <h1 id="community-title">Community</h1>
        </div>
        <div className="community-members-chip"><Users size={15} /><span>Community</span></div>
      </header>

      <section className="community-chat" aria-label="Community chat">
        <header className="community-room-bar">
          <div className="community-room-icon"><MessageCircle size={18} /></div>
          <div className="community-room-copy"><strong>General</strong><span>KitSetups · {members.length ? `${members.length} members` : "Community chat"}</span></div>
          <span className="community-live-indicator" aria-label="Connected"><i /></span>
        </header>

        <div className="community-message-list" ref={listRef} onScroll={handleListScroll} aria-live="polite" aria-label="Community messages">
          {loading && <div className="community-state"><LoaderCircle className="community-spin" size={20} /></div>}
          {!loading && messages.length === 0 && !error && (
            <div className="community-empty">
              <div className="community-empty-icon"><MessageCircle size={23} /></div>
              <h2>Say hello.</h2>
              <p>Start the conversation.</p>
            </div>
          )}
          {!loading && messages.map(message => {
            const own = message.uid === user?.uid;
            const photo = typeof message.photoURL === 'string' ? message.photoURL : '';
            const accent = accentFor(message.uid || message.displayName);
            return (
              <article id={'community-message-' + message.id} className={own ? 'community-message own' : 'community-message'} key={message.id}
                style={{ '--message-accent': accent }} onTouchStart={handleMessageTouchStart}
                onTouchEnd={event => handleMessageTouchEnd(event, message)}>
                {!own && <div className="community-avatar" style={{ '--message-accent': accent }}>{photo ? <img src={photo} alt="" referrerPolicy="no-referrer" /> : <span>{initials(message.displayName)}</span>}</div>}
                <div className="community-message-body">
                  <div className="community-message-meta">
                    {!own && <strong style={{ color: accent }}>{message.displayName || 'KitSetups trader'}</strong>}
                    <time>{formatTime(message.createdAt)}</time>
                    <button type="button" className="community-reply-button" aria-label={'Reply to ' + (message.displayName || 'trader')} title="Reply" onClick={() => startReply(message)}><Reply size={15} /></button>
                    {own && <div className="community-message-menu-wrap">
                      <button type="button" className="community-icon-button" aria-label="Message options" onClick={() => setMenuFor(menuFor === message.id ? '' : message.id)}><MoreHorizontal size={17} /></button>
                      {menuFor === message.id && <div className="community-message-menu"><button type="button" disabled={deletingId === message.id} onClick={() => deleteMessage(message)}><Trash2 size={14} /> Delete</button></div>}
                    </div>}
                  </div>
                  {message.replyTo && <button type="button" className="community-reply-quote" onClick={() => jumpToMessage(message.replyTo.id)}>
                    <strong>{message.replyTo.displayName || 'Trader'}</strong><span>{message.replyTo.text || (message.replyTo.imageUrl ? '📷 Image' : 'Message')}</span>
                  </button>}
                  {message.text && <p>{message.text.split(/(@everyone|@[^\s]+)/g).map((part, index) => part.startsWith("@") ? <span className="community-mention-text" key={index}>{part}</span> : part)}</p>}
                  {message.imageUrl && (brokenImages[message.id]
                    ? <a className="community-image-fallback" href={message.imageUrl} target="_blank" rel="noreferrer">Image unavailable · Open image</a>
                    : <a className="community-shared-image-link" href={message.imageUrl} target="_blank" rel="noreferrer">
                      <img className="community-shared-image" src={message.imageUrl} alt="Shared community image" loading="lazy" onError={() => setBrokenImages(current => ({ ...current, [message.id]: true }))} />
                    </a>)}
                </div>
                {own && <div className="community-avatar own-avatar" style={{ '--message-accent': accent }}>{photo ? <img src={photo} alt="" referrerPolicy="no-referrer" /> : <span>{initials(displayName)}</span>}</div>}
              </article>
            );
          })}
          {error && <div className="community-error" role="status"><AlertCircle size={15} /><span>{error}</span></div>}
        </div>

        {notificationToast && <div className="community-notification-toast" role="status"><span className="community-notification-toast-mark"><AtSign size={15}/></span><span><strong>{notificationToast.title}</strong><small>{notificationToast.text}</small></span><button type="button" aria-label="Dismiss notification" onClick={() => setNotificationToast(null)}><X size={15}/></button></div>}
        <form className="community-composer-wrap" onSubmit={sendMessage}>
          {replyTo && <div className="community-replying-preview"><div><span>Replying to <strong>{replyTo.displayName}</strong></span><small>{replyTo.text || (replyTo.imageUrl ? '📷 Image' : 'Message')}</small></div><button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)}><X size={16} /></button></div>}
          {imagePreview && <div className="community-image-preview"><img src={imagePreview} alt="Image ready to share" /><span>{imageFile?.name}</span><button type="button" aria-label="Remove image" onClick={clearImage}><X size={15} /></button></div>}
          {sendingStage && <div className="community-sending-status"><LoaderCircle className="community-spin" size={13} />{sendingStage}</div>}
          {mentionUids.length > 0 && <div className="community-mention-status"><AtSign size={13}/>{mentionEveryoneFlag ? 'Everyone will be notified' : `${mentionUids.length} member${mentionUids.length === 1 ? '' : 's'} tagged`}</div>}
          {mentionQuery !== null && <div className="community-mention-menu" role="listbox" aria-label="Mention a member">
            <button type="button" className="community-mention-option community-mention-everyone" onMouseDown={event => event.preventDefault()} onClick={mentionEveryone}><span className="community-mention-avatar"><Users size={15}/></span><span><strong>@everyone</strong><small>Notify all community members</small></span></button>
            {mentionMatches.map(member => <button type="button" className="community-mention-option" key={member.uid} onMouseDown={event => event.preventDefault()} onClick={() => insertMention(member)}><span className="community-mention-avatar">{member.photoURL ? <img src={member.photoURL} alt="" /> : initials(member.displayName)}</span><span><strong>{member.displayName}</strong><small>Tag member</small></span></button>)}
            {mentionMatches.length === 0 && <div className="community-mention-no-results">No matching members.</div>}
          </div>}
          <div className="community-composer">
            <button type="button" className="community-attach-button" aria-label="Attach an image" title="Share an image" onClick={() => fileInputRef.current?.click()} disabled={!user?.uid || sending}><ImagePlus size={19} /></button>
            <div className="community-composer-field">
              <label className="sr-only" htmlFor="community-message-input">Write a message</label>
              <textarea id="community-message-input" ref={textareaRef} value={draft}
                onChange={event => { updateDraft(event.target.value); event.target.style.height = "auto"; event.target.style.height = Math.min(event.target.scrollHeight, 180) + "px"; }}
                onFocus={event => { window.setTimeout(() => event.target.scrollIntoView({ block: "nearest", behavior: "smooth" }), 120); }}
                onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendMessage(event); } }}
                placeholder="Write a message…" maxLength={MAX_MESSAGE_LENGTH} rows={1} disabled={!user?.uid || sending} />
            </div>
            <input ref={fileInputRef} className="community-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={chooseImage} aria-label="Choose an image to share" />
            <button className="community-send-button" type="submit" aria-label="Send message" disabled={(!draft.trim() && !imageFile) || sending || !user?.uid}>{sending ? <LoaderCircle className="community-spin" size={19} /> : <svg className="kitsetups-send-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2.8 27.6 9.4v13.2L16 29.2 4.4 22.6V9.4L16 2.8Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M8.8 16.4h12.7M16.4 10.5l5.9 5.9-5.9 5.9" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"/><circle cx="8.8" cy="16.4" r="1.7" fill="currentColor"/></svg>}</button>
          </div>
        </form>
      </section>
    </section>
  );
}
