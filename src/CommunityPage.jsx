import { useEffect, useMemo, useRef, useState } from 'react';
import { getApps } from 'firebase/app';
import { getDownloadURL, getStorage, ref as storageRef, uploadBytes } from 'firebase/storage';
import { AlertCircle, ImagePlus, LoaderCircle, MessageCircle, MoreHorizontal, Send, Trash2, Users, X } from 'lucide-react';
import './community.css';

const MAX_MESSAGE_LENGTH = 1000;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const POLL_INTERVAL = 5000;

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
async function authorizedFetch(user, method = 'GET', body) {
  const token = await user.getIdToken();
  const response = await fetch('/api/community-message', {
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
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [menuFor, setMenuFor] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const listRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const atBottomRef = useRef(true);
  const firstLoadRef = useRef(true);
  const lastSentAtRef = useRef(0);
  const displayName = useMemo(() => getDisplayName(user), [user]);

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

  const uploadImage = async file => {
    const app = getApps()[0];
    if (!app) throw new Error('Image sharing is not configured. Please try again later.');
    const storage = getStorage(app);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'image';
    const uploaded = await uploadBytes(storageRef(storage, 'communityImages/' + user.uid + '/' + Date.now() + '-' + safeName), file, { contentType: file.type });
    return getDownloadURL(uploaded.ref);
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
    const refresh = async () => {
      if (!active) return;
      await loadMessages();
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
      const imageUrl = imageFile ? await uploadImage(imageFile) : '';
      await authorizedFetch(user, 'POST', { text, imageUrl });
      setDraft('');
      clearImage();
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      atBottomRef.current = true;
      await loadMessages(true);
    } catch (err) {
      console.error('KitSetups community send failed:', err);
      setError(err.message || 'Message not sent. Check your connection and try again.');
      lastSentAtRef.current = 0;
    } finally {
      setSending(false);
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
          <div className="community-room-copy"><strong>General</strong><span>KitSetups</span></div>
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
            return (
              <article className={own ? 'community-message own' : 'community-message'} key={message.id}>
                {!own && <div className="community-avatar">{photo ? <img src={photo} alt="" referrerPolicy="no-referrer" /> : <span>{initials(message.displayName)}</span>}</div>}
                <div className="community-message-body">
                  <div className="community-message-meta">
                    {!own && <strong>{message.displayName || 'KitSetups trader'}</strong>}
                    <time>{formatTime(message.createdAt)}</time>
                    {own && <div className="community-message-menu-wrap">
                      <button type="button" className="community-icon-button" aria-label="Message options" onClick={() => setMenuFor(menuFor === message.id ? '' : message.id)}><MoreHorizontal size={17} /></button>
                      {menuFor === message.id && <div className="community-message-menu"><button type="button" disabled={deletingId === message.id} onClick={() => deleteMessage(message)}><Trash2 size={14} /> Delete</button></div>}
                    </div>}
                  </div>
                  {message.text && <p>{message.text}</p>}
                  {message.imageUrl && <a className="community-shared-image-link" href={message.imageUrl} target="_blank" rel="noreferrer"><img className="community-shared-image" src={message.imageUrl} alt="Shared community image" loading="lazy" /></a>}
                </div>
                {own && <div className="community-avatar own-avatar">{photo ? <img src={photo} alt="" referrerPolicy="no-referrer" /> : <span>{initials(displayName)}</span>}</div>}
              </article>
            );
          })}
          {error && <div className="community-error" role="status"><AlertCircle size={15} /><span>{error}</span></div>}
        </div>

        <form className="community-composer-wrap" onSubmit={sendMessage}>
          {imagePreview && <div className="community-image-preview"><img src={imagePreview} alt="Image ready to share" /><span>{imageFile?.name}</span><button type="button" aria-label="Remove image" onClick={clearImage}><X size={15} /></button></div>}
          <div className="community-composer">
            <button type="button" className="community-attach-button" aria-label="Attach an image" title="Share an image" onClick={() => fileInputRef.current?.click()} disabled={!user?.uid || sending}><ImagePlus size={19} /></button>
            <div className="community-composer-field">
              <label className="sr-only" htmlFor="community-message-input">Write a message</label>
              <textarea id="community-message-input" ref={textareaRef} value={draft}
                onChange={event => { setDraft(event.target.value); event.target.style.height = "auto"; event.target.style.height = Math.min(event.target.scrollHeight, 120) + "px"; if (error) setError(""); }}
                onFocus={event => { window.setTimeout(() => event.target.scrollIntoView({ block: "nearest", behavior: "smooth" }), 120); }}
                onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendMessage(event); } }}
                placeholder="Write a message…" maxLength={MAX_MESSAGE_LENGTH} rows={1} disabled={!user?.uid || sending} />
            </div>
            <input ref={fileInputRef} className="community-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={chooseImage} aria-label="Choose an image to share" />
            <button className="community-send-button" type="submit" aria-label="Send message" disabled={(!draft.trim() && !imageFile) || sending || !user?.uid}>{sending ? <LoaderCircle className="community-spin" size={18} /> : <Send size={17} />}</button>
          </div>
        </form>      </section>
    </section>
  );
}
