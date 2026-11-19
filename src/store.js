const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'posts.json');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

const VALID_COLORS = new Set(['default', 'sky', 'emerald', 'amber', 'rose', 'violet']);
const VALID_NOTIFY_TYPES = new Set(['info', 'task', 'warning', 'recess']);
const VALID_TIMER_KINDS = new Set(['recess', 'activity']);

const DEFAULT_BOARD_DESC =
  'Panel colaborativo en red local — comparte ideas, imágenes y tu pantalla en tiempo real.';

function createBlankSession({
  name = 'Sesión Principal',
  description = DEFAULT_BOARD_DESC,
  isPublished = true,
  isClosed = false,
  hideFromStudents = false,
  teacherName = null,
  id,
} = {}) {
  const cleanName = String(name || 'Sesión Principal').trim().slice(0, 80) || 'Sesión Principal';
  const cleanDesc = String(description ?? DEFAULT_BOARD_DESC).trim().slice(0, 220);
  return {
    id: id || crypto.randomUUID(),
    name: cleanName,
    createdAt: new Date().toISOString(),
    isPublished: Boolean(isPublished),
    isClosed: Boolean(isClosed),
    hideFromStudents: Boolean(hideFromStudents),
    teacherName: teacherName ? String(teacherName).slice(0, 60) : null,
    board: {
      title: cleanName,
      eventName: cleanName,
      institutionName: 'Institución Educativa',
      institutionLogo: '',
      institutionLogoShape: 'square', // 'square' | 'wide'
      institutionLogoSize: 'normal',  // 'compact' | 'normal' | 'large'
      description: cleanDesc,
    },
    posts: [],
    assignment: null,
    assignmentHistory: [],
    notifications: [],
    timer: null,
    scheduledTimers: [],
    quizzes: [],
    activeQuiz: null,
    chatMessages: [],
    disabledAuthors: [],
  };
}

function normalizeSession(raw) {
  const fallbackName = raw?.name || raw?.board?.title || 'Sesión Principal';
  return {
    id: raw?.id || crypto.randomUUID(),
    name: String(fallbackName).trim().slice(0, 80) || 'Sesión Principal',
    createdAt: raw?.createdAt || new Date().toISOString(),
    isPublished: raw?.isPublished !== false,
    isClosed: Boolean(raw?.isClosed),
    hideFromStudents: Boolean(raw?.hideFromStudents),
    teacherName: raw?.teacherName ? String(raw.teacherName).slice(0, 60) : null,
    board: {
      title: raw?.board?.title || fallbackName,
      eventName: raw?.board?.eventName || raw?.board?.title || fallbackName,
      institutionName: raw?.board?.institutionName || 'Institución Educativa',
      institutionLogo: raw?.board?.institutionLogo || '',
      institutionLogoShape: raw?.board?.institutionLogoShape || 'square',
      institutionLogoSize: raw?.board?.institutionLogoSize || 'normal',
      description: raw?.board?.description ?? DEFAULT_BOARD_DESC,
    },
    posts: Array.isArray(raw?.posts)
      ? raw.posts.map((p, idx) => ({
          ...p,
          highlighted: Boolean(p.highlighted),
          highlightedAt: p.highlightedAt || null,
          highlightedBy: p.highlightedBy || null,
          isHidden: Boolean(p.isHidden),
          hiddenAt: p.hiddenAt || null,
          hiddenBy: p.hiddenBy || null,
          assignmentId: p.assignmentId || null,
          assignmentTitle: p.assignmentTitle || null,
          order: typeof p.order === 'number' ? p.order : idx,
        }))
      : [],
    assignment: raw?.assignment
      ? {
          ...raw.assignment,
          id: raw.assignment.id || crypto.randomUUID(),
          isHidden: Boolean(raw.assignment.isHidden),
        }
      : null,
    assignmentHistory: Array.isArray(raw?.assignmentHistory)
      ? raw.assignmentHistory.map((h) => ({
          ...h,
          id: h.id || crypto.randomUUID(),
          isHidden: Boolean(h.isHidden),
        }))
      : [],
    notifications: Array.isArray(raw?.notifications) ? raw.notifications : [],
    timer: raw?.timer || null,
    scheduledTimers: Array.isArray(raw?.scheduledTimers) ? raw.scheduledTimers : [],
    quizzes: Array.isArray(raw?.quizzes) ? raw.quizzes : [],
    activeQuiz: raw?.activeQuiz || null,
    chatMessages: Array.isArray(raw?.chatMessages) ? raw.chatMessages.slice(-500) : [],
    disabledAuthors: Array.isArray(raw?.disabledAuthors)
      ? raw.disabledAuthors.map((d) => ({
          authorId: d.authorId || null,
          name: d.name || 'Alumno',
          disabledAt: d.disabledAt || new Date().toISOString(),
          disabledBy: d.disabledBy || 'Profesor',
        }))
      : [],
  };
}

function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const backupDir = path.join(DATA_DIR, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

// Encryption for private chat messages in store
function deriveChatKey(sessionId) {
  return crypto.createHash('sha256').update(`padlet-chat-secret:${sessionId || 'default'}`).digest();
}

function encryptStoredText(text, sessionId) {
  if (!text || typeof text !== 'string') return text;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', deriveChatKey(sessionId), iv);
    let enc = cipher.update(text, 'utf8', 'base64');
    enc += cipher.final('base64');
    const tag = cipher.getAuthTag();
    return `ENC:GCM:${iv.toString('base64')}:${tag.toString('base64')}:${enc}`;
  } catch (err) {
    return text;
  }
}

function decryptStoredText(payload, sessionId) {
  if (!payload || typeof payload !== 'string' || !payload.startsWith('ENC:GCM:')) return payload;
  try {
    const parts = payload.split(':');
    if (parts.length < 5) return payload;
    const iv = Buffer.from(parts[2], 'base64');
    const tag = Buffer.from(parts[3], 'base64');
    const enc = parts[4];
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveChatKey(sessionId), iv);
    decipher.setAuthTag(tag);
    let dec = decipher.update(enc, 'base64', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch (err) {
    return payload;
  }
}

class BoardStore {
  constructor() {
    ensureDirectories();
    this.data = this.load();
    // Snapshot automatico para proteger los datos antes de cualquier cambio
    this.createBackup();
  }

  get state() {
    return this.getActiveSession();
  }

  resolveSession(sessionId = null) {
    if (sessionId) {
      const found = this.getSessionById(sessionId);
      if (!found) throw new Error('Sesión de clase no encontrada.');
      return found;
    }
    return this.getActiveSession();
  }

  load() {
    if (!fs.existsSync(DATA_FILE)) {
      const templateFile = path.join(DATA_DIR, 'posts.template.json');
      if (fs.existsSync(templateFile)) {
        try {
          fs.copyFileSync(templateFile, DATA_FILE);
        } catch {}
      }
    }

    if (!fs.existsSync(DATA_FILE)) {
      const initial = createBlankSession({ name: 'PadletLocal' });
      return {
        activeSessionId: initial.id,
        sessions: [initial],
      };
    }

    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed.sessions) && parsed.sessions.length > 0) {
        const sessions = parsed.sessions.map(normalizeSession);
        const activeExists = sessions.some((s) => s.id === parsed.activeSessionId);
        return {
          activeSessionId: activeExists ? parsed.activeSessionId : sessions[0].id,
          sessions,
        };
      }

      const migrated = normalizeSession({
        id: crypto.randomUUID(),
        name: parsed.board?.title || 'PadletLocal',
        board: parsed.board,
        posts: parsed.posts,
        assignment: parsed.assignment,
        assignmentHistory: parsed.assignmentHistory,
        notifications: parsed.notifications,
        timer: parsed.timer,
        scheduledTimers: parsed.scheduledTimers,
      });

      return {
        activeSessionId: migrated.id,
        sessions: [migrated],
      };
    } catch (err) {
      console.error('Error al cargar data/posts.json, iniciando estado limpio:', err.message);
      const fallback = createBlankSession({ name: 'PadletLocal' });
      return {
        activeSessionId: fallback.id,
        sessions: [fallback],
      };
    }
  }

  save() {
    ensureDirectories();
    const tmpFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmpFile, DATA_FILE);
  }

  // --- Session Management (Multi-Clase) ---
  getAllSessions() {
    return this.data.sessions;
  }

  getActiveSession() {
    let found = this.data.sessions.find((s) => s.id === this.data.activeSessionId);
    if (!found) {
      if (this.data.sessions.length === 0) {
        found = createBlankSession({ name: 'PadletLocal' });
        this.data.sessions.push(found);
      } else {
        found = this.data.sessions[0];
      }
      this.data.activeSessionId = found.id;
    }
    return found;
  }

  getActiveSessionId() {
    return this.getActiveSession().id;
  }

  getSessionById(id) {
    return this.data.sessions.find((s) => s.id === id) || null;
  }

  getDefaultStudentSession() {
    const active = this.getActiveSession();
    if (active.isPublished && !active.hideFromStudents) return active;
    return this.data.sessions.find((s) => s.isPublished && !s.hideFromStudents) || null;
  }

  getSessionsSummary({ onlyPublished = false, isTeacher = false } = {}) {
    const activeId = this.getActiveSessionId();
    const list = this.data.sessions.filter((s) => {
      if (isTeacher) return true;
      if (s.isPublished === false) return false;
      if (s.hideFromStudents) return false;
      if (onlyPublished && !s.isPublished) return false;
      return true;
    });

    return list.map((s) => {
      const visiblePosts = !isTeacher ? s.posts.filter((p) => !p.isHidden) : s.posts;
      const padletCount = visiblePosts.filter((p) => p.kind !== 'screen').length;
      const screenCount = visiblePosts.filter((p) => p.kind === 'screen').length;
      const reviewedCount = visiblePosts.filter((p) => p.kind !== 'screen' && p.reviewed).length;
      const hiddenCount = s.posts.filter((p) => p.isHidden).length;
      return {
        id: s.id,
        name: s.name,
        description: s.board?.description || '',
        createdAt: s.createdAt,
        isPublished: s.isPublished !== false,
        isClosed: Boolean(s.isClosed),
        hideFromStudents: Boolean(s.hideFromStudents),
        teacherName: s.teacherName || null,
        postCount: visiblePosts.length,
        padletCount,
        screenCount,
        reviewedCount,
        hiddenCount,
        quizCount: (s.quizzes || []).length,
        hasAssignment: Boolean(s.assignment),
        isActive: s.id === activeId,
      };
    });
  }

  createSession({ name, description, isPublished = true, isClosed = false, hideFromStudents = false, teacherName = null, activate = true }) {
    const cleanName = String(name || '').trim().slice(0, 80);
    if (!cleanName) throw new Error('Ingresa un nombre para la nueva sesión de clase.');
    const session = createBlankSession({
      name: cleanName,
      description: typeof description === 'string' && description.trim() ? description.trim() : DEFAULT_BOARD_DESC,
      isPublished: isPublished !== false,
      isClosed: Boolean(isClosed),
      hideFromStudents: Boolean(hideFromStudents),
      teacherName: teacherName ? String(teacherName).slice(0, 60) : null,
    });
    this.data.sessions.unshift(session);
    if (activate) {
      this.data.activeSessionId = session.id;
    }
    this.save();
    return session;
  }

  switchSession(sessionId) {
    const target = this.getSessionById(sessionId);
    if (!target) throw new Error('Sesión de clase no encontrada.');
    this.data.activeSessionId = target.id;
    this.save();
    return target;
  }

  setSessionStatus(sessionId, { isPublished, isClosed, hideFromStudents }) {
    const target = this.getSessionById(sessionId);
    if (!target) throw new Error('Sesión de clase no encontrada.');
    if (typeof isPublished === 'boolean') {
      target.isPublished = isPublished;
    }
    if (typeof isClosed === 'boolean') {
      target.isClosed = isClosed;
    }
    if (typeof hideFromStudents === 'boolean') {
      target.hideFromStudents = hideFromStudents;
    }
    this.save();
    return target;
  }

  renameSession(sessionId, { name, description }) {
    const target = this.getSessionById(sessionId);
    if (!target) throw new Error('Sesión de clase no encontrada.');
    const cleanName = String(name || '').trim().slice(0, 80);
    if (!cleanName) throw new Error('El nombre de la sesión no puede estar vacío.');
    target.name = cleanName;
    target.board.title = cleanName;
    if (typeof description === 'string') {
      target.board.description = description.trim().slice(0, 220);
    }
    this.save();
    return target;
  }

  collectSessionImageUrls(session) {
    const urls = new Set();
    if (!session) return urls;
    for (const p of session.posts || []) {
      if (p.imageUrl) urls.add(p.imageUrl);
    }
    if (session.assignment?.imageUrl) urls.add(session.assignment.imageUrl);
    for (const h of session.assignmentHistory || []) {
      if (h.imageUrl) urls.add(h.imageUrl);
    }
    return urls;
  }

  isImageReferencedElsewhere(imageUrl, excludeSessionId = null) {
    if (!imageUrl) return false;
    for (const s of this.data.sessions) {
      if (excludeSessionId && s.id === excludeSessionId) continue;
      if (this.collectSessionImageUrls(s).has(imageUrl)) return true;
    }
    return false;
  }

  deleteSession(sessionId) {
    const idx = this.data.sessions.findIndex((s) => s.id === sessionId);
    if (idx === -1) throw new Error('Sesión de clase no encontrada.');
    const [removed] = this.data.sessions.splice(idx, 1);

    const removedUrls = this.collectSessionImageUrls(removed);
    for (const url of removedUrls) {
      if (!this.isImageReferencedElsewhere(url)) {
        this.removeUploadedFile(url);
      }
    }

    if (this.data.sessions.length === 0) {
      const fresh = createBlankSession({ name: 'Sesión Principal' });
      this.data.sessions.push(fresh);
      this.data.activeSessionId = fresh.id;
    } else if (this.data.activeSessionId === removed.id) {
      this.data.activeSessionId = this.data.sessions[0].id;
    }

    this.save();
    return {
      deletedId: removed.id,
      activeSession: this.getActiveSession(),
    };
  }

  clearSessionPosts(sessionId = null) {
    const target = this.resolveSession(sessionId);
    const postImages = new Set();
    for (const p of target.posts) {
      if (p.imageUrl) postImages.add(p.imageUrl);
    }

    target.posts = [];
    for (const url of postImages) {
      if (!this.isImageReferencedElsewhere(url)) {
        this.removeUploadedFile(url);
      }
    }

    this.save();
    return target;
  }

  resetSession(sessionId = null) {
    const target = this.resolveSession(sessionId);
    const allUrls = this.collectSessionImageUrls(target);
    target.posts = [];
    target.assignment = null;
    target.assignmentHistory = [];
    target.notifications = [];
    target.timer = null;
    target.scheduledTimers = [];
    target.quizzes = [];
    target.activeQuiz = null;

    for (const url of allUrls) {
      if (!this.isImageReferencedElsewhere(url)) {
        this.removeUploadedFile(url);
      }
    }

    this.save();
    return target;
  }

  // --- Board Meta ---
  getBoard(sessionId = null) {
    return this.resolveSession(sessionId).board;
  }

  updateBoard(
    { title, description, institutionName, institutionLogo, institutionLogoShape, institutionLogoSize, eventName },
    sessionId = null
  ) {
    const session = this.resolveSession(sessionId);
    if (typeof title === 'string' && title.trim()) {
      const cleanTitle = title.trim().slice(0, 80);
      session.board.title = cleanTitle;
      session.name = cleanTitle;
    }
    if (typeof eventName === 'string' && eventName.trim()) {
      const cleanEvent = eventName.trim().slice(0, 80);
      session.board.eventName = cleanEvent;
      if (!title || !title.trim()) {
        session.board.title = cleanEvent;
        session.name = cleanEvent;
      }
    }
    if (typeof description === 'string') {
      session.board.description = description.trim().slice(0, 220);
    }
    if (typeof institutionName === 'string') {
      session.board.institutionName = institutionName.trim().slice(0, 100) || 'Institución Educativa';
    }
    if (typeof institutionLogo === 'string') {
      session.board.institutionLogo = institutionLogo.trim().slice(0, 500);
    }
    if (typeof institutionLogoShape === 'string') {
      session.board.institutionLogoShape = institutionLogoShape === 'wide' ? 'wide' : 'square';
    }
    if (typeof institutionLogoSize === 'string') {
      session.board.institutionLogoSize = ['compact', 'large'].includes(institutionLogoSize) ? institutionLogoSize : 'normal';
    }
    this.save();
    return session.board;
  }

  // --- Posts ---
  getPosts(sessionId = null, { includeHidden = true } = {}) {
    const session = this.resolveSession(sessionId);
    const list = includeHidden ? session.posts : session.posts.filter((p) => !p.isHidden);
    return [...list].sort((a, b) => {
      if (Boolean(b.pinned) !== Boolean(a.pinned)) {
        return b.pinned ? 1 : -1;
      }
      const orderA = typeof a.order === 'number' ? a.order : 0;
      const orderB = typeof b.order === 'number' ? b.order : 0;
      if (orderA !== orderB) return orderA - orderB;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  getPostById(id, sessionId = null) {
    const session = this.resolveSession(sessionId);
    return session.posts.find((p) => p.id === id) || null;
  }

  createPost(payload = {}, sessionIdOrForce = null, maybeForce = false) {
    const {
      authorId,
      author,
      topic,
      content,
      color,
      imageUrl,
      imageName,
      kind = 'padlet',
      assignmentId = null,
      assignmentTitle = null,
      sessionId: payloadSid,
    } = payload || {};

    let sessionId = null;
    let force = Boolean(payload?.force);

    if (typeof sessionIdOrForce === 'boolean') {
      force = force || sessionIdOrForce;
    } else if (typeof sessionIdOrForce === 'string') {
      sessionId = sessionIdOrForce;
    }

    if (typeof maybeForce === 'boolean') {
      force = force || maybeForce;
    }

    const session = this.resolveSession(sessionId || payloadSid);
    if (session.isClosed && !force) {
      throw new Error('Esta sesión de clase está cerrada. No se pueden crear publicaciones.');
    }
    const cleanAuthor = String(author || '').trim().slice(0, 50);
    const cleanTopic = String(topic || '').trim().slice(0, 100);
    const cleanContent = String(content || '').trim().slice(0, 3000);
    const cleanColor = VALID_COLORS.has(color) ? color : 'default';
    const cleanKind = kind === 'screen' ? 'screen' : 'padlet';

    if (!cleanAuthor) throw new Error('El nombre es obligatorio.');
    if (!cleanTopic) throw new Error(cleanKind === 'screen' ? 'El motivo es obligatorio.' : 'El tema es obligatorio.');

    const minOrder = session.posts.length > 0
      ? Math.min(...session.posts.map((p) => (typeof p.order === 'number' ? p.order : 0)))
      : 0;

    const post = {
      id: crypto.randomUUID(),
      kind: cleanKind,
      authorId: String(authorId || crypto.randomUUID()).slice(0, 80),
      author: cleanAuthor,
      topic: cleanTopic,
      content: cleanContent,
      color: cleanColor,
      imageUrl: imageUrl ? String(imageUrl).slice(0, 300) : null,
      imageName: imageName ? String(imageName).slice(0, 150) : null,
      assignmentId: assignmentId ? String(assignmentId).slice(0, 80) : null,
      assignmentTitle: assignmentTitle ? String(assignmentTitle).trim().slice(0, 150) : null,
      isTeacher: Boolean(
        payload?.isTeacher ||
        payload?.authorRole === 'teacher' ||
        cleanAuthor === 'Profesor' ||
        (session.teacherName && cleanAuthor === session.teacherName)
      ),
      authorRole: payload?.authorRole || (payload?.isTeacher || cleanAuthor === 'Profesor' ? 'teacher' : 'student'),
      pinned: false,
      reviewed: false,
      reviewedAt: null,
      reviewedBy: null,
      highlighted: false,
      highlightedAt: null,
      highlightedBy: null,
      order: minOrder - 1,
      isHidden: false,
      hiddenAt: null,
      hiddenBy: null,
      likes: [],
      comments: [],
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };

    session.posts.unshift(post);
    this.save();
    return post;
  }

  updateAuthorName(authorId, newName) {
    if (!authorId || !newName) return false;
    const cleanName = String(newName).trim().slice(0, 50);
    if (!cleanName) return false;
    let modified = false;

    for (const session of this.data.sessions) {
      if (Array.isArray(session.posts)) {
        for (const p of session.posts) {
          if (p.authorId === authorId && p.author !== cleanName) {
            p.author = cleanName;
            modified = true;
          }
          if (Array.isArray(p.comments)) {
            for (const c of p.comments) {
              if (c.authorId === authorId && c.author !== cleanName) {
                c.author = cleanName;
                modified = true;
              }
            }
          }
        }
      }
      if (Array.isArray(session.chatMessages)) {
        for (const m of session.chatMessages) {
          if (m.authorId === authorId || m.fromId === authorId) {
            m.author = cleanName;
            m.authorName = cleanName;
            m.fromName = cleanName;
            modified = true;
          }
        }
      }
    }

    if (modified) {
      this.save();
    }
    return modified;
  }

  updatePost(
    id,
    { authorId, topic, content, color, imageUrl, imageName, removeImage, assignmentId, assignmentTitle, force = false },
    sessionId = null
  ) {
    const session = this.resolveSession(sessionId);
    if (session.isClosed && !force) {
      throw new Error('Esta sesión de clase está cerrada. No se pueden modificar publicaciones.');
    }
    const post = this.getPostById(id, sessionId);
    if (!post) throw new Error('Publicación no encontrada.');
    if (!force && post.authorId !== authorId) {
      throw new Error('Solo el autor puede editar esta publicación.');
    }

    if (typeof topic === 'string') {
      const cleanTopic = topic.trim().slice(0, 100);
      if (!cleanTopic) throw new Error('El tema no puede estar vacío.');
      post.topic = cleanTopic;
    }

    if (typeof content === 'string') {
      post.content = content.trim().slice(0, 3000);
    }

    if (typeof color === 'string' && VALID_COLORS.has(color)) {
      post.color = color;
    }

    if (typeof assignmentId !== 'undefined') {
      post.assignmentId = assignmentId ? String(assignmentId).trim() : null;
    }
    if (typeof assignmentTitle !== 'undefined') {
      post.assignmentTitle = assignmentTitle ? String(assignmentTitle).trim().slice(0, 150) : null;
    }

    if (removeImage && post.imageUrl) {
      const oldUrl = post.imageUrl;
      post.imageUrl = null;
      post.imageName = null;
      if (!this.isImageReferencedElsewhere(oldUrl)) this.removeUploadedFile(oldUrl);
    } else if (imageUrl && imageUrl !== post.imageUrl) {
      const oldUrl = post.imageUrl;
      post.imageUrl = String(imageUrl).slice(0, 300);
      post.imageName = imageName ? String(imageName).slice(0, 150) : null;
      if (oldUrl && !this.isImageReferencedElsewhere(oldUrl)) this.removeUploadedFile(oldUrl);
    }

    post.updatedAt = new Date().toISOString();
    this.save();
    return post;
  }

  togglePinPost(id, sessionId = null) {
    const post = this.getPostById(id, sessionId);
    if (!post) throw new Error('Publicación no encontrada.');
    post.pinned = !post.pinned;
    this.save();
    return post;
  }

  toggleReviewPost(id, reviewerName = 'Profesor', sessionId = null) {
    const post = this.getPostById(id, sessionId);
    if (!post) throw new Error('Publicación no encontrada.');
    post.reviewed = !post.reviewed;
    if (post.reviewed) {
      post.reviewedAt = new Date().toISOString();
      post.reviewedBy = String(reviewerName || 'Profesor').trim().slice(0, 50) || 'Profesor';
    } else {
      post.reviewedAt = null;
      post.reviewedBy = null;
    }
    this.save();
    return post;
  }

  toggleHidePost(id, moderatorName = 'Profesor', sessionId = null) {
    const post = this.getPostById(id, sessionId);
    if (!post) throw new Error('Publicación no encontrada.');
    post.isHidden = !post.isHidden;
    if (post.isHidden) {
      post.hiddenAt = new Date().toISOString();
      post.hiddenBy = String(moderatorName || 'Profesor').trim().slice(0, 50) || 'Profesor';
    } else {
      post.hiddenAt = null;
      post.hiddenBy = null;
    }
    this.save();
    return post;
  }

  toggleHighlightPost(id, highlighterName = 'Profesor', sessionId = null) {
    const post = this.getPostById(id, sessionId);
    if (!post) throw new Error('Publicación no encontrada.');
    post.highlighted = !post.highlighted;
    if (post.highlighted) {
      post.highlightedAt = new Date().toISOString();
      post.highlightedBy = String(highlighterName || 'Profesor').trim().slice(0, 50) || 'Profesor';
    } else {
      post.highlightedAt = null;
      post.highlightedBy = null;
    }
    this.save();
    return post;
  }

  reorderPosts(postIds, sessionId = null) {
    const session = this.resolveSession(sessionId);
    if (!Array.isArray(postIds)) return session.posts;

    const idMap = new Map(session.posts.map((p) => [p.id, p]));
    const reordered = [];

    for (const id of postIds) {
      const p = idMap.get(id);
      if (p) {
        reordered.push(p);
        idMap.delete(id);
      }
    }
    for (const p of idMap.values()) {
      reordered.push(p);
    }

    reordered.forEach((p, idx) => {
      p.order = idx;
    });

    session.posts = reordered;
    this.save();
    return session.posts;
  }

  createBackup(label = '') {
    try {
      if (!fs.existsSync(DATA_FILE)) return null;
      const backupDir = path.join(DATA_DIR, 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const tag = label ? `_${label}` : '';
      const backupPath = path.join(backupDir, `posts_${stamp}${tag}.json`);
      fs.copyFileSync(DATA_FILE, backupPath);

      const files = fs.readdirSync(backupDir)
        .filter((f) => f.startsWith('posts_') && f.endsWith('.json'))
        .sort()
        .reverse();
      if (files.length > 20) {
        files.slice(20).forEach((f) => {
          try { fs.unlinkSync(path.join(backupDir, f)); } catch {}
        });
      }
      return backupPath;
    } catch (err) {
      console.warn('No se pudo crear backup de datos:', err.message);
      return null;
    }
  }

  deletePost(id, authorId, optionsOrForce = {}, sessionId = null) {
    const force = typeof optionsOrForce === 'boolean' ? optionsOrForce : Boolean(optionsOrForce?.force);
    let session = sessionId ? this.resolveSession(sessionId) : null;
    if (!session) {
      for (const s of this.data.sessions) {
        if (s.posts.some((p) => p.id === id)) {
          session = s;
          break;
        }
      }
    }
    if (!session) session = this.resolveSession(null);
    if (session.isClosed && !force) {
      throw new Error('Esta sesión de clase está cerrada. No se pueden eliminar publicaciones.');
    }
    const idx = session.posts.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error('Publicación no encontrada.');
    const post = session.posts[idx];
    if (!force && authorId && post.authorId !== authorId) {
      throw new Error('Solo el autor puede eliminar esta publicación.');
    }

    session.posts.splice(idx, 1);
    if (post.imageUrl && !this.isImageReferencedElsewhere(post.imageUrl)) {
      this.removeUploadedFile(post.imageUrl);
    }

    this.save();
    return post;
  }

  toggleLike(id, authorId, sessionId = null, { force = false } = {}) {
    const session = this.resolveSession(sessionId);
    if (session.isClosed && !force) {
      throw new Error('Esta sesión de clase está cerrada.');
    }
    const post = this.getPostById(id, sessionId);
    if (!post) throw new Error('Publicación no encontrada.');
    if (!authorId) throw new Error('Identificador de usuario inválido.');

    const existingIndex = post.likes.indexOf(authorId);
    if (existingIndex === -1) {
      post.likes.push(authorId);
    } else {
      post.likes.splice(existingIndex, 1);
    }

    this.save();
    return post;
  }

  addComment(id, { authorId, author, text, force = false }, sessionId = null) {
    const session = this.resolveSession(sessionId);
    if (session.isClosed && !force) {
      throw new Error('Esta sesión de clase está cerrada. Los comentarios están deshabilitados.');
    }
    const post = this.getPostById(id, sessionId);
    if (!post) throw new Error('Publicación no encontrada.');

    const cleanAuthor = String(author || '').trim().slice(0, 50);
    const cleanText = String(text || '').trim().slice(0, 500);
    if (!cleanAuthor) throw new Error('Ingresa tu nombre para comentar.');
    if (!cleanText) throw new Error('El comentario no puede estar vacío.');

    const comment = {
      id: crypto.randomUUID(),
      authorId: String(authorId || '').slice(0, 80),
      author: cleanAuthor,
      text: cleanText,
      createdAt: new Date().toISOString(),
    };

    post.comments.push(comment);
    this.save();
    return post;
  }

  // --- Teacher Assignment (Siguiente Tarea) ---
  getAssignment(sessionId = null) {
    return this.resolveSession(sessionId).assignment;
  }

  getAssignmentHistory(sessionId = null) {
    return this.resolveSession(sessionId).assignmentHistory;
  }

  setAssignment(
    { title, instructions, dueNote, imageUrl, imageName, pinned = true, author = 'Profesor', archivePrevious = true },
    sessionId = null
  ) {
    const session = this.resolveSession(sessionId);
    const cleanTitle = String(title || '').trim().slice(0, 120);
    const cleanInstructions = String(instructions || '').trim().slice(0, 6000);
    const cleanDueNote = String(dueNote || '').trim().slice(0, 100);
    const cleanAuthor = String(author || 'Profesor').trim().slice(0, 50) || 'Profesor';

    if (!cleanTitle) throw new Error('El título de la tarea es obligatorio.');
    if (!cleanInstructions && !imageUrl) {
      throw new Error('Ingresa las instrucciones o adjunta una imagen para la tarea.');
    }

    if (archivePrevious && session.assignment) {
      const prev = session.assignment;
      if (prev.title !== cleanTitle || prev.instructions !== cleanInstructions) {
        session.assignmentHistory.unshift({
          ...prev,
          archivedAt: new Date().toISOString(),
        });
        session.assignmentHistory = session.assignmentHistory.slice(0, 20);
      }
    }

    const assignment = {
      id: crypto.randomUUID(),
      title: cleanTitle,
      instructions: cleanInstructions,
      dueNote: cleanDueNote,
      imageUrl: imageUrl ? String(imageUrl).slice(0, 300) : null,
      imageName: imageName ? String(imageName).slice(0, 150) : null,
      pinned: Boolean(pinned),
      isHidden: false,
      updatedBy: cleanAuthor,
      updatedAt: new Date().toISOString(),
    };

    session.assignment = assignment;
    this.save();
    return {
      assignment: session.assignment,
      assignmentHistory: session.assignmentHistory,
    };
  }

  updateAssignment(
    id,
    { title, instructions, dueNote, imageUrl, imageName, isHidden, pinned, author = 'Profesor' },
    sessionId = null
  ) {
    const session = this.resolveSession(sessionId);
    const cleanId = String(id || '').trim();
    let target = null;
    let isCurrent = false;

    if (session.assignment && String(session.assignment.id).trim() === cleanId) {
      target = session.assignment;
      isCurrent = true;
    } else if (Array.isArray(session.assignmentHistory)) {
      target = session.assignmentHistory.find((h) => String(h.id).trim() === cleanId);
    }

    if (!target) {
      if (session.assignment) {
        target = session.assignment;
        isCurrent = true;
      } else {
        throw new Error('Tarea no encontrada en esta sesión.');
      }
    }

    if (typeof title === 'string') {
      const cleanTitle = title.trim().slice(0, 120);
      if (!cleanTitle) throw new Error('El título de la tarea es obligatorio.');
      target.title = cleanTitle;
      // Also update linked posts assignmentTitle
      session.posts.forEach((p) => {
        if (p.assignmentId === target.id) p.assignmentTitle = cleanTitle;
      });
    }

    if (typeof instructions === 'string') {
      target.instructions = instructions.trim().slice(0, 6000);
    }

    if (typeof dueNote === 'string') {
      target.dueNote = dueNote.trim().slice(0, 100);
    }

    if (imageUrl !== undefined) {
      target.imageUrl = imageUrl ? String(imageUrl).slice(0, 300) : null;
      target.imageName = imageName ? String(imageName).slice(0, 150) : null;
    }

    if (isHidden !== undefined) {
      target.isHidden = Boolean(isHidden);
    }

    if (pinned !== undefined) {
      target.pinned = Boolean(pinned);
    }

    target.updatedBy = String(author || 'Profesor').trim().slice(0, 50);
    target.updatedAt = new Date().toISOString();

    // Sync active assignment and history if same ID exists in both
    if (session.assignment && String(session.assignment.id).trim() === String(target.id).trim()) {
      session.assignment = { ...session.assignment, ...target };
    }
    if (Array.isArray(session.assignmentHistory)) {
      session.assignmentHistory = session.assignmentHistory.map((h) =>
        String(h.id).trim() === String(target.id).trim() ? { ...h, ...target } : h
      );
    }

    this.save();
    return {
      assignment: session.assignment,
      assignmentHistory: session.assignmentHistory,
      updatedAssignment: target,
      isCurrent,
    };
  }

  toggleHideAssignment(
    id,
    { hideLinkedPosts = false, deleteLinkedPosts = false } = {},
    sessionId = null
  ) {
    const session = this.resolveSession(sessionId);
    const cleanId = String(id || '').trim();
    let target = null;
    let isCurrent = false;

    if (session.assignment && String(session.assignment.id).trim() === cleanId) {
      target = session.assignment;
      isCurrent = true;
    } else if (Array.isArray(session.assignmentHistory)) {
      target = session.assignmentHistory.find((h) => String(h.id).trim() === cleanId);
    }

    if (!target) {
      if (session.assignment) {
        target = session.assignment;
        isCurrent = true;
      } else {
        throw new Error('Tarea no encontrada en esta sesión.');
      }
    }

    target.isHidden = !target.isHidden;
    target.updatedAt = new Date().toISOString();

    if (session.assignment && String(session.assignment.id).trim() === String(target.id).trim()) {
      session.assignment.isHidden = target.isHidden;
      session.assignment.updatedAt = target.updatedAt;
    }
    if (Array.isArray(session.assignmentHistory)) {
      session.assignmentHistory = session.assignmentHistory.map((h) =>
        String(h.id).trim() === String(target.id).trim() ? { ...h, isHidden: target.isHidden, updatedAt: target.updatedAt } : h
      );
    }

    let affectedPostsCount = 0;
    if (deleteLinkedPosts) {
      const beforeCount = session.posts.length;
      session.posts = session.posts.filter((p) => p.assignmentId !== target.id);
      affectedPostsCount = beforeCount - session.posts.length;
    } else if (hideLinkedPosts) {
      session.posts.forEach((p) => {
        if (p.assignmentId === target.id) {
          p.isHidden = target.isHidden;
          if (target.isHidden) {
            p.hiddenAt = new Date().toISOString();
            p.hiddenBy = 'Profesor (Tarea oculta)';
          } else {
            p.hiddenAt = null;
            p.hiddenBy = null;
          }
          affectedPostsCount++;
        }
      });
    }

    this.save();
    return {
      assignment: session.assignment,
      assignmentHistory: session.assignmentHistory,
      updatedAssignment: target,
      affectedPostsCount,
      isCurrent,
    };
  }

  deleteAssignment(
    id,
    { deleteLinkedPosts = false, hideLinkedPosts = false } = {},
    sessionId = null
  ) {
    const session = this.resolveSession(sessionId);
    let cleanId = String(id || '').trim();
    let deleted = false;
    let isCurrent = false;

    if (session.assignment && (!cleanId || String(session.assignment.id).trim() === cleanId)) {
      cleanId = String(session.assignment.id).trim();
      session.assignment = null;
      deleted = true;
      isCurrent = true;
    }

    const prevHistoryLen = session.assignmentHistory.length;
    session.assignmentHistory = session.assignmentHistory.filter((h) => String(h.id).trim() !== cleanId);
    if (session.assignmentHistory.length < prevHistoryLen) {
      deleted = true;
    }

    if (!deleted) {
      throw new Error('Tarea no encontrada.');
    }

    let affectedPostsCount = 0;
    if (deleteLinkedPosts) {
      const beforeCount = session.posts.length;
      session.posts = session.posts.filter((p) => p.assignmentId !== cleanId);
      affectedPostsCount = beforeCount - session.posts.length;
    } else if (hideLinkedPosts) {
      session.posts.forEach((p) => {
        if (p.assignmentId === cleanId) {
          p.isHidden = true;
          p.hiddenAt = new Date().toISOString();
          p.hiddenBy = 'Profesor (Tarea eliminada)';
          affectedPostsCount++;
        }
      });
    }

    this.save();
    return {
      assignment: session.assignment,
      assignmentHistory: session.assignmentHistory,
      deletedId: cleanId,
      affectedPostsCount,
      isCurrent,
    };
  }

  getAssignmentLinkedPosts(assignmentId, sessionId = null) {
    const session = this.resolveSession(sessionId);
    if (!assignmentId) return [];
    return session.posts.filter((p) => p.assignmentId === assignmentId);
  }

  setAssignmentPinned(pinned, sessionId = null) {
    const session = this.resolveSession(sessionId);
    if (!session.assignment) return null;
    session.assignment.pinned = Boolean(pinned);
    this.save();
    return session.assignment;
  }

  clearAssignment(sessionId = null) {
    const session = this.resolveSession(sessionId);
    if (session.assignment) {
      session.assignmentHistory.unshift({
        ...session.assignment,
        archivedAt: new Date().toISOString(),
      });
      session.assignmentHistory = session.assignmentHistory.slice(0, 20);
      session.assignment = null;
      this.save();
    }
    return {
      assignment: session.assignment,
      assignmentHistory: session.assignmentHistory,
    };
  }

  // --- Teacher Notifications ---
  getNotifications(sessionId = null) {
    return this.resolveSession(sessionId).notifications;
  }

  addNotification({ title, message, type = 'info', sound = true, author = 'Profesor' }, sessionId = null) {
    const session = this.resolveSession(sessionId);
    const cleanTitle = String(title || '').trim().slice(0, 100);
    const cleanMessage = String(message || '').trim().slice(0, 1000);
    const cleanType = VALID_NOTIFY_TYPES.has(type) ? type : 'info';
    const cleanAuthor = String(author || 'Profesor').trim().slice(0, 50) || 'Profesor';

    if (!cleanMessage) throw new Error('El mensaje de la notificación no puede estar vacío.');

    const item = {
      id: crypto.randomUUID(),
      title: cleanTitle || 'Aviso del profesor',
      message: cleanMessage,
      type: cleanType,
      sound: Boolean(sound),
      author: cleanAuthor,
      createdAt: new Date().toISOString(),
    };

    session.notifications.unshift(item);
    session.notifications = session.notifications.slice(0, 25);
    this.save();
    return item;
  }

  // --- Recess / Activity Timers & Scheduled Countdowns ---
  getTimer(sessionId = null) {
    return this.resolveSession(sessionId).timer;
  }

  getScheduledTimers(sessionId = null) {
    return [...this.resolveSession(sessionId).scheduledTimers].sort((a, b) => a.startAt - b.startAt);
  }

  startTimer({ kind = 'recess', label, message = '', durationMin }, sessionId = null) {
    const session = this.resolveSession(sessionId);
    const cleanKind = VALID_TIMER_KINDS.has(kind) ? kind : 'recess';
    const mins = Number(durationMin);
    if (!Number.isFinite(mins) || mins <= 0 || mins > 240) {
      throw new Error('La duración debe ser entre 1 y 240 minutos.');
    }

    const durationSec = Math.round(mins * 60);
    const now = Date.now();
    const defaultLabel = cleanKind === 'recess' ? 'Receso' : 'Tiempo de actividad';

    session.timer = {
      id: crypto.randomUUID(),
      kind: cleanKind,
      label: String(label || defaultLabel).trim().slice(0, 80) || defaultLabel,
      message: String(message || '').trim().slice(0, 200),
      status: 'running',
      durationSec,
      remainingSec: durationSec,
      startedAt: now,
      endsAt: now + durationSec * 1000,
    };

    this.save();
    return session.timer;
  }

  scheduleTimer({ kind = 'recess', label, message = '', startAt, durationMin }, sessionId = null) {
    const session = this.resolveSession(sessionId);
    const cleanKind = VALID_TIMER_KINDS.has(kind) ? kind : 'recess';
    const mins = Number(durationMin);
    const startTs = Number(startAt);

    if (!Number.isFinite(mins) || mins <= 0 || mins > 240) {
      throw new Error('La duración debe ser entre 1 y 240 minutos.');
    }
    if (!Number.isFinite(startTs) || startTs <= Date.now() + 5000) {
      throw new Error('La hora programada debe ser futura.');
    }

    const defaultLabel = cleanKind === 'recess' ? 'Receso programado' : 'Actividad programada';
    const entry = {
      id: crypto.randomUUID(),
      kind: cleanKind,
      label: String(label || defaultLabel).trim().slice(0, 80) || defaultLabel,
      message: String(message || '').trim().slice(0, 200),
      startAt: startTs,
      durationSec: Math.round(mins * 60),
    };

    session.scheduledTimers.push(entry);
    session.scheduledTimers.sort((a, b) => a.startAt - b.startAt);
    this.save();
    return entry;
  }

  cancelScheduledTimer(id, sessionId = null) {
    const session = this.resolveSession(sessionId);
    const before = session.scheduledTimers.length;
    session.scheduledTimers = session.scheduledTimers.filter((t) => t.id !== id);
    if (session.scheduledTimers.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  pauseTimer(sessionId = null) {
    const session = this.resolveSession(sessionId);
    const t = session.timer;
    if (!t || t.status !== 'running') return t;
    const remSec = Math.max(0, Math.ceil((t.endsAt - Date.now()) / 1000));
    t.status = 'paused';
    t.remainingSec = remSec;
    t.endsAt = null;
    this.save();
    return t;
  }

  resumeTimer(sessionId = null) {
    const session = this.resolveSession(sessionId);
    const t = session.timer;
    if (!t || t.status !== 'paused') return t;
    const now = Date.now();
    t.status = 'running';
    t.endsAt = now + Math.max(1, t.remainingSec) * 1000;
    this.save();
    return t;
  }

  extendTimer(extraMin = 5, sessionId = null) {
    const session = this.resolveSession(sessionId);
    const t = session.timer;
    if (!t) throw new Error('No hay ningún temporizador activo.');
    const addSec = Math.round(Number(extraMin) * 60);
    if (!Number.isFinite(addSec) || addSec <= 0) {
      throw new Error('Tiempo adicional inválido.');
    }
    t.durationSec += addSec;
    if (t.status === 'running') {
      t.endsAt = Math.max(Date.now(), t.endsAt) + addSec * 1000;
    } else if (t.status === 'paused') {
      t.remainingSec += addSec;
    } else if (t.status === 'finished') {
      t.status = 'running';
      t.remainingSec = addSec;
      t.endsAt = Date.now() + addSec * 1000;
    }
    this.save();
    return t;
  }

  finishTimer(sessionId = null) {
    const session = this.resolveSession(sessionId);
    const t = session.timer;
    if (!t || t.status === 'finished') return null;
    t.status = 'finished';
    t.remainingSec = 0;
    t.endsAt = Date.now();
    this.save();
    return t;
  }

  clearTimer(sessionId = null) {
    const session = this.resolveSession(sessionId);
    session.timer = null;
    this.save();
    return null;
  }

  tickTimers(sessionId = null) {
    const session = this.resolveSession(sessionId);
    const now = Date.now();
    let changed = false;
    let startedScheduled = null;
    let finishedActive = null;

    if (session.timer && session.timer.status === 'running' && now >= session.timer.endsAt) {
      finishedActive = this.finishTimer(session.id);
      changed = true;
    }

    const dueIdx = session.scheduledTimers.findIndex((st) => now >= st.startAt);
    if (dueIdx !== -1) {
      const [due] = session.scheduledTimers.splice(dueIdx, 1);
      startedScheduled = this.startTimer(
        {
          kind: due.kind,
          label: due.label,
          message: due.message,
          durationMin: due.durationSec / 60,
        },
        session.id
      );
      changed = true;
    }

    return { changed, startedScheduled, finishedActive };
  }

  // --- Timed Multiple-Choice Quizzes & Comprehension Analytics ---
  getQuizzes(sessionId = null) {
    const session = this.resolveSession(sessionId);
    return (session.quizzes || []).map((q) => {
      const latestRun = Array.isArray(q.runs) && q.runs.length > 0 ? q.runs[0] : null;
      const latestAnalytics = latestRun ? this.computeQuizAnalytics(q.id, latestRun.id, session.id) : null;
      return {
        ...q,
        runCount: Array.isArray(q.runs) ? q.runs.length : 0,
        latestRunSummary: latestAnalytics
          ? {
              runId: latestRun.id,
              startedAt: latestRun.startedAt,
              finishedAt: latestRun.finishedAt,
              overallPercent: latestAnalytics.overallPercent,
              totalParticipants: latestAnalytics.totalParticipants,
              level: latestAnalytics.level,
              levelLabel: latestAnalytics.levelLabel,
            }
          : null,
      };
    });
  }

  getAllSessionsQuizzes(currentSessionId = null) {
    const refId = currentSessionId || this.getActiveSessionId();
    const list = [];
    for (const s of this.data.sessions) {
      for (const q of s.quizzes || []) {
        list.push({
          sessionId: s.id,
          sessionName: s.name,
          isCurrentSession: s.id === refId,
          quizId: q.id,
          title: q.title,
          questionCount: (q.questions || []).length,
        });
      }
    }
    return list;
  }

  getQuizById(id, sessionId = null) {
    const session = this.resolveSession(sessionId);
    return (session.quizzes || []).find((q) => q.id === id) || null;
  }

  saveQuiz({ id, title, description = '', questions = [] }, sessionId = null) {
    const session = this.resolveSession(sessionId);
    const cleanTitle = String(title || '').trim().slice(0, 120);
    const cleanDesc = String(description || '').trim().slice(0, 300);
    if (!cleanTitle) throw new Error('El título del test es obligatorio.');
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('Agrega al menos una pregunta al test.');
    }

    const cleanQuestions = questions.slice(0, 50).map((q, idx) => {
      const text = String(q?.text || '').trim().slice(0, 400);
      if (!text) throw new Error(`La pregunta #${idx + 1} no puede estar vacía.`);

      const rawOpts = Array.isArray(q?.options) ? q.options : [];
      const options = rawOpts
        .map((opt) => String(opt || '').trim().slice(0, 200))
        .filter(Boolean)
        .slice(0, 6);
      if (options.length < 2) {
        throw new Error(`La pregunta #${idx + 1} debe tener al menos 2 opciones de respuesta.`);
      }

      const correctIndex = Number(q?.correctIndex);
      if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
        throw new Error(`Selecciona la respuesta correcta en la pregunta #${idx + 1}.`);
      }

      let timeLimitSec = Math.round(Number(q?.timeLimitSec));
      if (!Number.isFinite(timeLimitSec)) timeLimitSec = 30;
      timeLimitSec = Math.max(5, Math.min(300, timeLimitSec));

      return {
        id: q?.id && typeof q.id === 'string' ? q.id.slice(0, 80) : crypto.randomUUID(),
        text,
        options,
        correctIndex,
        timeLimitSec,
      };
    });

    if (!Array.isArray(session.quizzes)) session.quizzes = [];

    if (id) {
      const existing = this.getQuizById(id, session.id);
      if (!existing) throw new Error('Test no encontrado.');
      existing.title = cleanTitle;
      existing.description = cleanDesc;
      existing.questions = cleanQuestions;
      existing.updatedAt = new Date().toISOString();
      this.save();
      return existing;
    }

    const quiz = {
      id: crypto.randomUUID(),
      title: cleanTitle,
      description: cleanDesc,
      questions: cleanQuestions,
      runs: [],
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };

    session.quizzes.unshift(quiz);
    this.save();
    return quiz;
  }

  deleteQuiz(id, sessionId = null) {
    const session = this.resolveSession(sessionId);
    const idx = (session.quizzes || []).findIndex((q) => q.id === id);
    if (idx === -1) throw new Error('Test no encontrado.');
    session.quizzes.splice(idx, 1);
    if (session.activeQuiz?.quizId === id) {
      session.activeQuiz = null;
    }
    this.save();
    return true;
  }

  copyQuizToSession({ sourceSessionId, quizId, targetSessionId }) {
    const sourceSession = this.resolveSession(sourceSessionId);
    const targetSession = this.resolveSession(targetSessionId);

    const sourceQuiz = (sourceSession.quizzes || []).find((q) => q.id === quizId);
    if (!sourceQuiz) throw new Error('Test de origen no encontrado.');

    const isSameSession = sourceSession.id === targetSession.id;
    const copy = {
      id: crypto.randomUUID(),
      title: isSameSession ? `${sourceQuiz.title} (copia)`.slice(0, 120) : sourceQuiz.title,
      description: sourceQuiz.description || '',
      questions: sourceQuiz.questions.map((q) => ({
        id: crypto.randomUUID(),
        text: q.text,
        options: [...q.options],
        correctIndex: q.correctIndex,
        timeLimitSec: q.timeLimitSec,
      })),
      runs: [],
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };

    if (!Array.isArray(targetSession.quizzes)) targetSession.quizzes = [];
    targetSession.quizzes.unshift(copy);
    this.save();

    return {
      quiz: copy,
      targetSessionName: targetSession.name,
      targetSessionId: targetSession.id,
    };
  }

  startQuiz(quizId, sessionId = null) {
    const session = this.resolveSession(sessionId);
    const quiz = this.getQuizById(quizId, session.id);
    if (!quiz) throw new Error('Test no encontrado.');
    if (!quiz.questions || quiz.questions.length === 0) {
      throw new Error('Este test no tiene preguntas.');
    }

    const firstQ = quiz.questions[0];
    const now = Date.now();
    const run = {
      id: crypto.randomUUID(),
      startedAt: new Date(now).toISOString(),
      finishedAt: null,
      responses: {},
    };

    if (!Array.isArray(quiz.runs)) quiz.runs = [];
    quiz.runs.unshift(run);
    quiz.runs = quiz.runs.slice(0, 15);

    session.activeQuiz = {
      quizId: quiz.id,
      runId: run.id,
      title: quiz.title,
      status: 'question',
      currentQuestionIndex: 0,
      questionStartedAt: now,
      questionEndsAt: now + firstQ.timeLimitSec * 1000,
      showStatsToStudents: false,
    };

    this.save();
    return session.activeQuiz;
  }

  submitQuizAnswer({ authorId, author, questionId, optionIndex }, sessionId = null) {
    const session = this.resolveSession(sessionId);
    const active = session.activeQuiz;
    if (!active || active.status !== 'question') {
      throw new Error('No hay una pregunta activa para responder en este momento.');
    }
    if (Date.now() > active.questionEndsAt + 1500) {
      throw new Error('El tiempo para esta pregunta ya finalizó.');
    }

    const quiz = this.getQuizById(active.quizId, session.id);
    if (!quiz) throw new Error('Test no encontrado.');
    const question = quiz.questions[active.currentQuestionIndex];
    if (!question || (questionId && question.id !== questionId)) {
      throw new Error('Esta pregunta ya no está activa.');
    }

    const optIdx = Number(optionIndex);
    if (!Number.isInteger(optIdx) || optIdx < 0 || optIdx >= question.options.length) {
      throw new Error('Opción de respuesta inválida.');
    }

    const cleanAuthorId = String(authorId || '').trim().slice(0, 80);
    const cleanAuthor = String(author || 'Participante').trim().slice(0, 50) || 'Participante';
    if (!cleanAuthorId) throw new Error('Identificador de usuario inválido.');

    const run = (quiz.runs || []).find((r) => r.id === active.runId);
    if (!run) throw new Error('Ejecución de test no encontrada.');

    if (!run.responses[question.id]) {
      run.responses[question.id] = {};
    }
    if (run.responses[question.id][cleanAuthorId]) {
      throw new Error('Ya enviaste tu respuesta para esta pregunta.');
    }

    const now = Date.now();
    const record = {
      authorId: cleanAuthorId,
      author: cleanAuthor,
      optionIndex: optIdx,
      isCorrect: optIdx === question.correctIndex,
      responseTimeMs: Math.max(0, now - active.questionStartedAt),
      answeredAt: new Date(now).toISOString(),
    };

    run.responses[question.id][cleanAuthorId] = record;
    this.save();
    return record;
  }

  revealCurrentQuestion(sessionId = null) {
    const session = this.resolveSession(sessionId);
    const active = session.activeQuiz;
    if (!active) return null;
    if (active.status === 'question') {
      active.status = 'reveal';
      active.questionEndsAt = Date.now();
      this.save();
    }
    return active;
  }

  toggleQuizShareStats(sessionId = null) {
    const session = this.resolveSession(sessionId);
    const active = session.activeQuiz;
    if (!active) return false;
    active.showStatsToStudents = !active.showStatsToStudents;
    this.save();
    return Boolean(active.showStatsToStudents);
  }

  nextQuizStep(sessionId = null) {
    const session = this.resolveSession(sessionId);
    const active = session.activeQuiz;
    if (!active) throw new Error('No hay un test en vivo.');
    const quiz = this.getQuizById(active.quizId, session.id);
    if (!quiz) throw new Error('Test no encontrado.');

    const nextIndex = active.currentQuestionIndex + 1;
    if (nextIndex < quiz.questions.length) {
      const nextQ = quiz.questions[nextIndex];
      const now = Date.now();
      active.currentQuestionIndex = nextIndex;
      active.status = 'question';
      active.questionStartedAt = now;
      active.questionEndsAt = now + nextQ.timeLimitSec * 1000;
    } else {
      active.status = 'summary';
      const run = (quiz.runs || []).find((r) => r.id === active.runId);
      if (run && !run.finishedAt) {
        run.finishedAt = new Date().toISOString();
      }
    }

    this.save();
    return active;
  }

  closeActiveQuiz(sessionId = null) {
    const session = this.resolveSession(sessionId);
    const active = session.activeQuiz;
    if (active) {
      const quiz = this.getQuizById(active.quizId, session.id);
      const run = quiz ? (quiz.runs || []).find((r) => r.id === active.runId) : null;
      if (run && !run.finishedAt) {
        run.finishedAt = new Date().toISOString();
      }
      session.activeQuiz = null;
      this.save();
    }
    return null;
  }

  tickActiveQuiz(sessionId = null) {
    const session = this.resolveSession(sessionId);
    const active = session.activeQuiz;
    if (!active || active.status !== 'question') return false;
    if (Date.now() >= active.questionEndsAt) {
      this.revealCurrentQuestion(session.id);
      return true;
    }
    return false;
  }

  computeQuizAnalytics(quizId, runId = null, sessionId = null) {
    const session = this.resolveSession(sessionId);
    const quiz = this.getQuizById(quizId, session.id);
    if (!quiz) return null;
    const runs = Array.isArray(quiz.runs) ? quiz.runs : [];
    const run = runId ? runs.find((r) => r.id === runId) : runs[0];
    if (!run) {
      return {
        quizId: quiz.id,
        title: quiz.title,
        description: quiz.description || '',
        runId: null,
        totalQuestions: quiz.questions.length,
        totalParticipants: 0,
        totalAnswers: 0,
        totalCorrect: 0,
        overallPercent: 0,
        level: 'none',
        levelLabel: 'Sin respuestas todavía',
        questions: quiz.questions.map((q, idx) => ({
          id: q.id,
          index: idx,
          text: q.text,
          options: q.options,
          correctIndex: q.correctIndex,
          timeLimitSec: q.timeLimitSec,
          totalResponses: 0,
          correctCount: 0,
          comprehensionPercent: 0,
          optionCounts: q.options.map(() => 0),
          optionPercents: q.options.map(() => 0),
          needsReview: false,
        })),
        weakestQuestions: [],
        students: [],
      };
    }

    const responsesByQ = run.responses || {};
    const studentMap = new Map();
    let totalAnswers = 0;
    let totalCorrect = 0;

    const questions = quiz.questions.map((q, idx) => {
      const qResponses = Object.values(responsesByQ[q.id] || {});
      const optionCounts = q.options.map(() => 0);
      let correctCount = 0;

      for (const r of qResponses) {
        if (r.optionIndex >= 0 && r.optionIndex < optionCounts.length) {
          optionCounts[r.optionIndex]++;
        }
        if (r.isCorrect) correctCount++;

        let st = studentMap.get(r.authorId);
        if (!st) {
          st = {
            authorId: r.authorId,
            author: r.author,
            answeredCount: 0,
            correctCount: 0,
            totalQuestions: quiz.questions.length,
          };
          studentMap.set(r.authorId, st);
        }
        st.author = r.author || st.author;
        st.answeredCount++;
        if (r.isCorrect) st.correctCount++;
      }

      const totalResponses = qResponses.length;
      totalAnswers += totalResponses;
      totalCorrect += correctCount;

      const comprehensionPercent =
        totalResponses > 0 ? Math.round((correctCount / totalResponses) * 100) : 0;
      const optionPercents = optionCounts.map((c) =>
        totalResponses > 0 ? Math.round((c / totalResponses) * 100) : 0
      );

      return {
        id: q.id,
        index: idx,
        text: q.text,
        options: q.options,
        correctIndex: q.correctIndex,
        timeLimitSec: q.timeLimitSec,
        totalResponses,
        correctCount,
        comprehensionPercent,
        optionCounts,
        optionPercents,
        needsReview: totalResponses > 0 && comprehensionPercent < 60,
      };
    });

    const overallPercent = totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 100) : 0;
    let level = 'none';
    let levelLabel = 'Sin respuestas todavía';
    if (totalAnswers > 0) {
      if (overallPercent >= 80) {
        level = 'excellent';
        levelLabel = 'Excelente entendimiento del tema';
      } else if (overallPercent >= 60) {
        level = 'good';
        levelLabel = 'Buen entendimiento general';
      } else if (overallPercent >= 40) {
        level = 'medium';
        levelLabel = 'Entendimiento medio — conviene reforzar puntos débiles';
      } else {
        level = 'low';
        levelLabel = 'Bajo entendimiento — se recomienda repasar el tema';
      }
    }

    const students = Array.from(studentMap.values())
      .map((st) => ({
        ...st,
        percent: st.totalQuestions > 0 ? Math.round((st.correctCount / st.totalQuestions) * 100) : 0,
      }))
      .sort((a, b) => b.correctCount - a.correctCount || a.author.localeCompare(b.author));

    const weakestQuestions = questions
      .filter((q) => q.totalResponses > 0 && q.comprehensionPercent < 60)
      .sort((a, b) => a.comprehensionPercent - b.comprehensionPercent);

    return {
      quizId: quiz.id,
      title: quiz.title,
      description: quiz.description || '',
      runId: run.id,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      totalQuestions: quiz.questions.length,
      totalParticipants: students.length,
      totalAnswers,
      totalCorrect,
      overallPercent,
      level,
      levelLabel,
      questions,
      weakestQuestions,
      students,
    };
  }

  getPublicActiveQuizPayload(sessionId = null) {
    const session = this.resolveSession(sessionId);
    const active = session.activeQuiz;
    if (!active) return null;
    const quiz = this.getQuizById(active.quizId, session.id);
    if (!quiz) return null;

    const run = (quiz.runs || []).find((r) => r.id === active.runId);
    const q = quiz.questions[active.currentQuestionIndex];
    const qRespMap = (run?.responses && q ? run.responses[q.id] : null) || {};
    const qRespList = Object.values(qRespMap);

    const payload = {
      quizId: quiz.id,
      runId: active.runId,
      title: quiz.title,
      description: quiz.description || '',
      status: active.status,
      currentQuestionIndex: active.currentQuestionIndex,
      totalQuestions: quiz.questions.length,
      questionStartedAt: active.questionStartedAt,
      questionEndsAt: active.questionEndsAt,
      responseCount: qRespList.length,
      answeredAuthorIds: Object.keys(qRespMap),
      showStatsToStudents: Boolean(active.showStatsToStudents),
    };

    if (q && (active.status === 'question' || active.status === 'reveal')) {
      payload.question = {
        id: q.id,
        text: q.text,
        options: q.options,
        timeLimitSec: q.timeLimitSec,
      };
    }

    if (q && active.status === 'reveal') {
      const optionCounts = q.options.map(() => 0);
      let correctCount = 0;
      const answersByAuthor = {};
      for (const r of qRespList) {
        if (r.optionIndex >= 0 && r.optionIndex < optionCounts.length) {
          optionCounts[r.optionIndex]++;
        }
        if (r.isCorrect) correctCount++;
        answersByAuthor[r.authorId] = {
          optionIndex: r.optionIndex,
          isCorrect: r.isCorrect,
        };
      }
      const total = qRespList.length;
      payload.reveal = {
        correctIndex: q.correctIndex,
        totalResponses: total,
        correctCount,
        comprehensionPercent: total > 0 ? Math.round((correctCount / total) * 100) : 0,
        optionCounts,
        optionPercents: optionCounts.map((c) => (total > 0 ? Math.round((c / total) * 100) : 0)),
        answersByAuthor,
      };
    }

    if (active.status === 'summary') {
      payload.analytics = this.computeQuizAnalytics(quiz.id, active.runId, session.id);
    }

    return payload;
  }

  removeUploadedFile(imageUrl) {
    try {
      if (!imageUrl || !imageUrl.startsWith('/uploads/')) return;
      const filename = path.basename(imageUrl);
      const fullPath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch (err) {
      console.warn('No se pudo eliminar la imagen anterior:', err.message);
    }
  }

  // --- Chat System (Per-Session, Strict Privacy & Encryption) ---
  addChatMessage(sessionId, message) {
    const session = this.resolveSession(sessionId);
    if (!Array.isArray(session.chatMessages)) {
      session.chatMessages = [];
    }
    const stored = { ...message };
    if (stored.isPrivate) {
      stored.text = encryptStoredText(stored.text, session.id);
      stored.isEncrypted = true;
    }
    session.chatMessages.push(stored);
    if (session.chatMessages.length > 500) {
      session.chatMessages = session.chatMessages.slice(-500);
    }
    this.save();
    return message;
  }

  getSessionChat(sessionId, { authorId, isTeacher = false } = {}) {
    const session = this.resolveSession(sessionId);
    const msgs = Array.isArray(session.chatMessages) ? session.chatMessages : [];
    // Strict privacy filtering: teacher cannot see student-to-student private chats
    const filtered = msgs.filter((m) => {
      if (!m.isPrivate || m.to === 'all') return true;
      const mFrom = m.fromId || m.authorId;
      const mTo = m.to;
      if (mFrom === authorId) return true;
      if (mTo === authorId || mTo === `user:${authorId}`) return true;
      if (isTeacher && (mTo === 'teacher' || mTo === 'teachers')) return true;
      if ((m.fromRole === 'teacher' || m.isTeacher) && (mTo === authorId || mTo === `user:${authorId}`)) return true;
      return false;
    });

    // Decrypt messages for authorized participants
    return filtered.map((m) => {
      if (m.isEncrypted || (m.text && typeof m.text === 'string' && m.text.startsWith('ENC:GCM:'))) {
        return {
          ...m,
          text: decryptStoredText(m.text, session.id),
          isEncrypted: true,
        };
      }
      return m;
    });
  }

  deleteChatMessage(sessionId, messageId, { authorId, isTeacher = false } = {}) {
    const session = this.resolveSession(sessionId);
    if (!Array.isArray(session.chatMessages)) return null;
    const index = session.chatMessages.findIndex((m) => m.id === messageId);
    if (index === -1) return null;
    const msg = session.chatMessages[index];
    const msgFrom = msg.fromId || msg.authorId;
    // Only the author who initiated / sent the message can delete it
    if (msgFrom !== authorId) {
      return null;
    }
    const [deleted] = session.chatMessages.splice(index, 1);
    this.save();
    return deleted;
  }

  clearSessionChat(sessionId) {
    const session = this.resolveSession(sessionId);
    session.chatMessages = [];
    this.save();
    return true;
  }

  // --- Student Management: Disable / Enable / Expel ---
  getDisabledAuthors(sessionId = null) {
    const session = this.resolveSession(sessionId);
    return Array.isArray(session.disabledAuthors) ? session.disabledAuthors : [];
  }

  isAuthorDisabled(authorId, authorName = null, sessionId = null) {
    const session = this.resolveSession(sessionId);
    const list = Array.isArray(session.disabledAuthors) ? session.disabledAuthors : [];
    if (!list.length) return false;
    const cleanId = authorId ? String(authorId).trim() : null;
    const cleanName = authorName ? String(authorName).trim().toLowerCase() : null;

    return list.some((d) => {
      if (cleanId && d.authorId && d.authorId === cleanId) return true;
      if (cleanName && d.name && d.name.trim().toLowerCase() === cleanName) return true;
      return false;
    });
  }

  toggleDisableAuthor(
    authorId,
    authorName = 'Alumno',
    { disabledBy = 'Profesor', disabled = null } = {},
    sessionId = null
  ) {
    const session = this.resolveSession(sessionId);
    if (!Array.isArray(session.disabledAuthors)) {
      session.disabledAuthors = [];
    }

    const cleanId = authorId ? String(authorId).trim() : null;
    const cleanName = (authorName || 'Alumno').trim();
    const cleanNameLower = cleanName.toLowerCase();

    const existingIdx = session.disabledAuthors.findIndex((d) => {
      if (cleanId && d.authorId && d.authorId === cleanId) return true;
      if (d.name && d.name.trim().toLowerCase() === cleanNameLower) return true;
      return false;
    });

    let nowDisabled = false;
    if (existingIdx >= 0) {
      if (disabled === true) {
        nowDisabled = true;
      } else {
        session.disabledAuthors.splice(existingIdx, 1);
        nowDisabled = false;
      }
    } else {
      if (disabled === false) {
        nowDisabled = false;
      } else {
        session.disabledAuthors.push({
          authorId: cleanId,
          name: cleanName,
          disabledAt: new Date().toISOString(),
          disabledBy: String(disabledBy).slice(0, 60),
        });
        nowDisabled = true;
      }
    }

    this.save();
    return {
      authorId: cleanId,
      authorName: cleanName,
      disabled: nowDisabled,
      disabledAuthors: session.disabledAuthors,
    };
  }

  getParticipatingStudents(sessionId = null) {
    const session = this.resolveSession(sessionId);
    const authorMap = new Map();

    // From posts
    (session.posts || []).forEach((p) => {
      const name = (p.author || 'Anónimo').trim();
      const id = p.authorId || name.toLowerCase();
      const lower = id.toLowerCase();
      const prev = authorMap.get(lower);
      if (prev) {
        prev.postsCount++;
        if (p.authorIsTeacher) prev.isTeacher = true;
      } else {
        authorMap.set(lower, {
          authorId: p.authorId || null,
          name,
          isTeacher: Boolean(p.authorIsTeacher),
          postsCount: 1,
        });
      }
    });

    // From chat
    (session.chatMessages || []).forEach((m) => {
      const name = (m.author || '').trim();
      if (!name) return;
      const id = m.fromId || m.authorId || name.toLowerCase();
      const lower = id.toLowerCase();
      const prev = authorMap.get(lower);
      if (prev) {
        if (m.fromRole === 'teacher' || m.isTeacher) prev.isTeacher = true;
      } else {
        authorMap.set(lower, {
          authorId: m.fromId || m.authorId || null,
          name,
          isTeacher: m.fromRole === 'teacher' || Boolean(m.isTeacher),
          postsCount: 0,
        });
      }
    });

    // Disabled status check
    const disabledList = Array.isArray(session.disabledAuthors) ? session.disabledAuthors : [];
    disabledList.forEach((d) => {
      const id = d.authorId || d.name.toLowerCase();
      const lower = id.toLowerCase();
      const prev = authorMap.get(lower);
      if (prev) {
        prev.isDisabled = true;
        prev.disabledAt = d.disabledAt;
        prev.disabledBy = d.disabledBy;
      } else {
        authorMap.set(lower, {
          authorId: d.authorId || null,
          name: d.name,
          isTeacher: false,
          postsCount: 0,
          isDisabled: true,
          disabledAt: d.disabledAt,
          disabledBy: d.disabledBy,
        });
      }
    });

    return Array.from(authorMap.values()).map((s) => ({
      ...s,
      isDisabled: Boolean(s.isDisabled || this.isAuthorDisabled(s.authorId, s.name, sessionId)),
    }));
  }
}

const defaultStore = new BoardStore();

module.exports = {
  BoardStore,
  UPLOADS_DIR,
  store: defaultStore,
  createBackup: (label) => defaultStore.createBackup(label),
};
