import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { AlertCircle, ArrowDown, Hash, LoaderCircle, MessageCircle, MoreHorizontal, Send, ShieldCheck, Trash2, Users, Wifi } from 'lucide-react';
import { db } from './firebase.js';
import './community.css';

const MAX_MESSAGE_LENGTH = 1000;
const MESSAGE_WINDOW = 100;

function getDisplayName(user) {
  const value = String(user?.displayName || user?.email?.split('@')[0] || '').trim();
  return value.slice(0, 48) || `Trader ${String(user?.uid || '').slice(-4) || 'member'}`;
}

function initials(value) {
  return String(value || 'T').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'T';
}

function formatTime(value) {
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : null;
  if (!date || Number.isNaN(date.getTime())) return 'Sending…';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function CommunityPage({ user }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [menuFor, setMenuFor] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [showLatest, setShowLatest] = useState(false);
  const listRef = useRef(null);
  const atBottomRef = useRef(true);
  const firstSnapshotRef = useRef(true);
  const lastSentAtRef = useRef(0);

  const displayName = useMemo(() => getDisplayName(user), [user]);

  useEffect(() => {
    if (!db || !user?.uid) {
      setLoading(false);
      setError('Sign in to join the KitSetups community.');
      return undefined;
    }

    setLoading(true);
    const feed = query(collection(db, 'communityMessages'), orderBy('createdAt', 'desc'), limit(MESSAGE_WINDOW));
    const unsubscribe = onSnapshot(feed, snapshot => {
      const next = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).reverse();
      setMessages(next);
      setLoading(false);
      setError('');
      if (firstSnapshotRef.current) {
        firstSnapshotRef.current = false;
        atBottomRef.current = true;
        requestAnimationFrame(() => {
          if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
        });
      } else if (atBottomRef.current) {
        requestAnimationFrame(() => {
          if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
        });
      }
    }, err => {
      console.error('KitSetups community listener failed:', err);
      setLoading(false);
      setError(err?.code === 'permission-denied'
        ? 'Community access is still being configured. Please try again shortly.'
        : 'Could not load the community. Check your connection and try again.');
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const sendMessage = async event => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || !user?.uid || sending || !db) return;
    if (text.length > MAX_MESSAGE_LENGTH) {
      setError(`Keep messages under ${MAX_MESSAGE_LENGTH.toLocaleString()} characters.`);
      return;
    }
    const now = Date.now();
    if (now - lastSentAtRef.current < 1200) {
      setError('Give it a second before sending another message.');
      return;
    }

    lastSentAtRef.current = now;
    setSending(true);
    setError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/community-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text })
      });
      let payload = {};
      try { payload = await response.json(); } catch {}
      if (!response.ok) {
        const sendError = new Error(payload.error || 'Message not sent. Please try again.');
        sendError.status = response.status;
        throw sendError;
      }
      setDraft('');
      atBottomRef.current = true;
      setShowLatest(false);
    } catch (err) {
      console.error('KitSetups community send failed:', err);
      setError(err?.status === 429 ? (err.message || 'Give it a second before sending another message.') : (err?.status === 401 ? (err.message || 'Your session expired. Sign in again.') : (err?.message || 'Message not sent. Check your connection and try again.')));
      lastSentAtRef.current = 0;
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = async message => {
    setMenuFor('');
    if (message.uid !== user?.uid || !db) return;
    setDeletingId(message.id);
    setError('');
    try {
      await deleteDoc(doc(db, 'communityMessages', message.id));
    } catch (err) {
      console.error('KitSetups community delete failed:', err);
      setError('Could not delete that message. Please try again.');
    } finally {
      setDeletingId('');
    }
  };

  const handleListScroll = () => {
    const node = listRef.current;
    if (!node) return;
    const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
    atBottomRef.current = remaining < 100;
    setShowLatest(remaining >= 180);
  };

  return (
    <section className="community-page" aria-labelledby="community-title">
      <header className="community-heading">
        <div className="community-heading-copy">
          <span className="community-eyebrow"><span className="community-live-dot" /> KITSETUPS SOCIAL</span>
          <h1 id="community-title">Community</h1>
          <p>One room. Every trader. Share the thinking behind the trade.</p>
        </div>
        <div className="community-members-chip"><Users size={15} /><span>All traders</span></div>
      </header>

      <div className="community-layout">
        <div className="community-room-bar">
          <div className="community-room-icon"><Hash size={18} /></div>
          <div className="community-room-copy">
            <strong>general</strong>
            <span>Market talk, trade ideas & everything trading</span>
          </div>
          <div className="community-live-status"><Wifi size={14} /><span>Live</span></div>
        </div>

        <div className="community-guideline">
          <ShieldCheck size={16} />
          <span>Keep it useful. Challenge ideas, respect traders, and never present an opinion as a guaranteed result.</span>
        </div>

        <div className="community-message-list" ref={listRef} onScroll={handleListScroll} aria-live="polite" aria-label="Community messages">
          {loading && <div className="community-state"><LoaderCircle className="community-spin" size={20} /><span>Loading the room…</span></div>}
          {!loading && messages.length === 0 && !error && (
            <div className="community-empty">
              <div className="community-empty-icon"><MessageCircle size={24} /></div>
              <h2>Start the conversation</h2>
              <p>This is the shared room for everyone on KitSetups. Ask a question, share your market view, or welcome the next trader in.</p>
            </div>
          )}
          {!loading && messages.map(message => {
            const own = message.uid === user?.uid;
            const photo = typeof message.photoURL === 'string' ? message.photoURL : '';
            return (
              <article className={own ? 'community-message own' : 'community-message'} key={message.id}>
                <div className="community-avatar">
                  {photo ? <img src={photo} alt="" referrerPolicy="no-referrer" /> : <span>{initials(message.displayName)}</span>}
                </div>
                <div className="community-message-body">
                  <div className="community-message-meta">
                    <strong>{message.displayName || 'KitSetups trader'}</strong>
                    {own && <span className="community-you-tag">YOU</span>}
                    <time>{formatTime(message.createdAt)}</time>
                    {own && <div className="community-message-menu-wrap">
                      <button type="button" className="community-icon-button" aria-label="Message options" onClick={() => setMenuFor(menuFor === message.id ? '' : message.id)}><MoreHorizontal size={17} /></button>
                      {menuFor === message.id && <div className="community-message-menu"><button type="button" disabled={deletingId === message.id} onClick={() => deleteMessage(message)}><Trash2 size={14} /> Delete message</button></div>}
                    </div>}
                  </div>
                  <p>{message.text}</p>
                </div>
              </article>
            );
          })}
          {error && <div className="community-error" role="status"><AlertCircle size={15} /><span>{error}</span></div>}
        </div>

        {showLatest && <button type="button" className="community-latest-button" onClick={() => { atBottomRef.current = true; setShowLatest(false); if (listRef.current) listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }}><ArrowDown size={15} /> Latest messages</button>}

        <form className="community-composer" onSubmit={sendMessage}>
          <div className="community-composer-avatar">{initials(displayName)}</div>
          <div className="community-composer-field">
            <label className="sr-only" htmlFor="community-message-input">Write a message to the community</label>
            <textarea
              id="community-message-input"
              value={draft}
              onChange={event => { setDraft(event.target.value); if (error) setError(''); }}
              onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendMessage(event); } }}
              placeholder="Message everyone in the room…"
              maxLength={MAX_MESSAGE_LENGTH}
              rows={1}
              disabled={!user?.uid || sending}
            />
            <div className="community-composer-footer">
              <span>{draft.length}/{MAX_MESSAGE_LENGTH}</span>
              <span>Enter to send · Shift + Enter for a new line</span>
            </div>
          </div>
          <button className="community-send-button" type="submit" aria-label="Send message" disabled={!draft.trim() || sending || !user?.uid}>
            {sending ? <LoaderCircle className="community-spin" size={18} /> : <Send size={17} />}
          </button>
        </form>
        <footer className="community-room-footer"><span><ShieldCheck size={13} /> Public to all registered KitSetups users</span><span>No DMs · One shared room</span></footer>
      </div>
    </section>
  );
}
