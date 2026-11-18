const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');
const { Server } = require('socket.io');

const { getLocalIPs, getPrimaryLocalIP } = require('./src/network');
const { getOrCreateCertificate, CA_CERT_PATH } = require('./src/cert');
const { BoardStore, UPLOADS_DIR } = require('./src/store');

const HTTP_PORT = Number(process.env.PORT || 3000);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 3443);
const HOST = process.env.HOST || '0.0.0.0';

const CFG_FILE = path.join(__dirname, 'data', 'panel.cfg');

function loadTeacherPin() {
  try {
    if (fs.existsSync(CFG_FILE)) {
      const content = fs.readFileSync(CFG_FILE, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const parts = line.split('=');
        if (parts[0]?.trim() === 'TEACHER_PIN' && parts[1]?.trim()) {
          return parts[1].trim();
        }
      }
    }
  } catch {}
  return String(process.env.TEACHER_PIN || '1234').trim();
}

let TEACHER_PIN = loadTeacherPin();

function saveTeacherPinToConfig(newPin) {
  try {
    let port = HTTP_PORT;
    let httpsPort = HTTPS_PORT;
    if (fs.existsSync(CFG_FILE)) {
      const content = fs.readFileSync(CFG_FILE, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const parts = line.split('=');
        if (parts[0]?.trim() === 'PORT' && parts[1]?.trim()) port = parts[1].trim();
        if (parts[0]?.trim() === 'HTTPS_PORT' && parts[1]?.trim()) httpsPort = parts[1].trim();
      }
    }
    const out = `PORT=${port}\nHTTPS_PORT=${httpsPort}\nTEACHER_PIN=${newPin}\n`;
    fs.writeFileSync(CFG_FILE, out, 'utf8');
    return true;
  } catch (err) {
    console.error('Error al guardar panel.cfg:', err.message);
    return false;
  }
}

const app = express();
const store = new BoardStore();

// Teacher authenticated session tokens
const validTeacherTokens = new Set();

function isValidTeacherToken(token) {
  return typeof token === 'string' && validTeacherTokens.has(token);
}

// Active WebRTC screen shares: postId -> { sessionId, sharerSocketId, sharerAuthorId, sharerName, pausedByTeacher, watchers: Set<string> }
const activeShares = new Map();
// Connected client authorId registry: socketId -> authorId
const socketAuthors = new Map();
// Per-session screen share turn queues: sessionId -> [{ id, authorId, author, reason, status, createdAt }]
const screenQueuesBySession = new Map();

function getSessionQueue(sessionId) {
  if (!sessionId) return [];
  if (!screenQueuesBySession.has(sessionId)) {
    screenQueuesBySession.set(sessionId, []);
  }
  return screenQueuesBySession.get(sessionId);
}

function setSessionQueue(sessionId, list) {
  screenQueuesBySession.set(sessionId, list);
}

function sessionRoom(sessionId) {
  return `session:${sessionId}`;
}

function getSocketsByAuthorId(authorId, sessionId = null) {
  const ids = [];
  if (!authorId) return ids;
  for (const [sockId, aId] of socketAuthors.entries()) {
    if (aId !== authorId) continue;
    if (sessionId) {
      const sock = io.sockets.sockets.get(sockId);
      if (!sock || sock.data.sessionId !== sessionId) continue;
    }
    ids.push(sockId);
  }
  return ids;
}

// Multer configuration for image uploads
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
    const safeExt = /^\.[a-z0-9]{1,6}$/.test(ext) ? ext : '.png';
    cb(null, `${crypto.randomUUID()}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato de imagen no soportado. Usa JPG, PNG, GIF, WEBP o AVIF.'));
    }
  },
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));

function enrichPost(post) {
  const share = activeShares.get(post.id);
  return {
    ...post,
    screenShare: share
      ? {
          active: true,
          sharerSocketId: share.sharerSocketId,
          sharerAuthorId: share.sharerAuthorId,
          sharerName: share.sharerName,
          pausedByTeacher: Boolean(share.pausedByTeacher),
          viewerCount: share.watchers.size,
        }
      : null,
  };
}

function getEnrichedPosts(sessionId, { includeHidden = false } = {}) {
  return store.getPosts(sessionId, { includeHidden }).map(enrichPost);
}

// --- REST Endpoints ---
app.get('/api/info', async (_req, res) => {
  try {
    const localIPs = getLocalIPs();
    const primaryIP = getPrimaryLocalIP();
    const httpsUrl = `https://${primaryIP}:${HTTPS_PORT}`;
    const httpUrl = `http://${primaryIP}:${HTTP_PORT}`;

    const qrHttps = await QRCode.toDataURL(httpsUrl, {
      margin: 1,
      width: 220,
      color: { dark: '#0f172a', light: '#ffffff' },
    });

    res.json({
      primaryIP,
      localIPs,
      httpPort: HTTP_PORT,
      httpsPort: HTTPS_PORT,
      httpsUrl,
      httpUrl,
      certDownloadUrl: `${httpUrl}/cert/PadletLocal-RootCA.crt`,
      certWindowsInstallerUrl: `${httpUrl}/cert/Instalar-Certificado-Windows.bat`,
      qrHttps,
      board: store.getBoard(),
      onlineCount: io.engine.clientsCount,
      serverTime: Date.now(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/cert/PadletLocal-RootCA.crt', (_req, res) => {
  if (!fs.existsSync(CA_CERT_PATH)) {
    return res.status(404).send('Certificado CA no generado todavia.');
  }
  res.setHeader('Content-Type', 'application/x-x509-ca-cert');
  res.setHeader('Content-Disposition', 'attachment; filename="PadletLocal-RootCA.crt"');
  return res.sendFile(CA_CERT_PATH);
});

app.get('/cert/Instalar-Certificado-Windows.bat', (req, res) => {
  const hostHeader = String(req.headers.host || '').split(':')[0];
  const host = /^[a-zA-Z0-9.-]+$/.test(hostHeader) ? hostHeader : getPrimaryLocalIP();
  const certUrl = `http://${host}:${HTTP_PORT}/cert/PadletLocal-RootCA.crt`;
  const appUrl = `https://${host}:${HTTPS_PORT}`;

  const batContent = [
    '@echo off',
    'chcp 65001 >nul',
    'title Instalar Certificado PadletLocal',
    'echo ==============================================================',
    'echo   Instalando certificado local de PadletLocal (sin pantalla roja)',
    'echo ==============================================================',
    'echo.',
    'set "CERT_TMP=%TEMP%\\PadletLocal-RootCA.crt"',
    `echo [*] Descargando certificado desde ${certUrl} ...`,
    `powershell -NoProfile -Command "Invoke-WebRequest -Uri '${certUrl}' -OutFile '%TEMP%\\PadletLocal-RootCA.crt' -UseBasicParsing"`,
    'if not exist "%CERT_TMP%" (',
    '  echo [!] No se pudo descargar el certificado. Verifica conexion a la red local.',
    '  pause',
    '  exit /b 1',
    ')',
    'echo [*] Instalando certificado en Entidades Raiz de Confianza del usuario...',
    'echo     (Si Windows muestra una ventana de confirmacion, haz clic en SI)',
    'certutil -user -addstore Root "%CERT_TMP%"',
    'del /f /q "%CERT_TMP%" >nul 2>&1',
    'echo.',
    'echo [OK] Certificado instalado. Abriendo PadletLocal en HTTPS seguro...',
    'echo     Nota: Si ya tenias Chrome o Edge abierto, recarga o reinicia el navegador.',
    `start "" "${appUrl}"`,
    'timeout /t 4 /nobreak >nul',
    '',
  ].join('\r\n');

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="Instalar-Certificado-Windows.bat"');
  return res.send(batContent);
});

const PKG_INFO = {
  name: 'PadletLocal',
  version: '1.2.0',
  description: 'Herramienta colaborativa en red local para cursos privados y aulas, manteniendo toda la información en local.',
  developer: {
    name: 'CoDevNexus',
    meaning: 'Código + Desarrollo + Unión',
    description: 'Firma especializada en ingeniería de software y arquitectura tecnológica. Nos dedicamos a crear ecosistemas digitales robustos, integrando desarrollo Full-Stack, infraestructura de servidores, redes empresariales, sistemas de seguridad electrónica e IoT. Transformamos necesidades operativas complejas en herramientas eficientes, escalables y seguras.',
    website: 'https://www.codevnexus.tech',
    websiteDisplay: 'www.codevnexus.tech',
    contact: 'jmejia@codevnexus.tech',
  },
  privacyPolicy: '100% Local LAN — Diseñado para cursos privados y máxima soberanía de datos. No depende de internet ni envía datos a servidores externos. Publicaciones, tareas, exámenes e imágenes se guardan exclusivamente en el equipo anfitrión.',
  repoUrl: 'https://github.com/codevnexus/PadletLocal',
};

app.get('/api/version', (_req, res) => {
  res.json({
    ok: true,
    ...PKG_INFO,
    serverTime: Date.now(),
  });
});

app.get('/api/updates/check', async (_req, res) => {
  try {
    let gitInfo = { hasGit: false, currentCommit: null, branch: 'main' };
    try {
      const { execSync } = require('child_process');
      const commit = execSync('git rev-parse --short HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      gitInfo = { hasGit: true, currentCommit: commit, branch: branch || 'main' };
    } catch {}

    res.json({
      ok: true,
      currentVersion: PKG_INFO.version,
      latestVersion: PKG_INFO.version,
      hasUpdate: false,
      repoUrl: PKG_INFO.repoUrl,
      gitInfo,
      userDataPreserved: true,
      safeNotice: 'Tus publicaciones, tareas, imágenes y sesiones creadas se almacenan de forma segura en las carpetas data/ y uploads/, aisladas del código. Al actualizar mediante Git o descargando nuevas versiones, tus datos nunca se eliminan.',
      updateGuide: [
        'Opción 1: En PadletLocal.bat ejecuta la opción [9] Buscar y aplicar actualizaciones (crea backup automático y aplica cambios).',
        'Opción 2: Si usas Git: ejecuta "git pull origin main" y luego "npm install".',
        'Opción 3: Si descargaste como ZIP: descomprime los archivos nuevos en esta carpeta SIN reemplazar la carpeta "data" ni "uploads".',
      ],
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/teacher/login', (req, res) => {
  const pin = String(req.body?.pin || '').trim();
  if (!pin || pin !== TEACHER_PIN) {
    return res.status(401).json({ error: 'PIN de profesor incorrecto.' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  validTeacherTokens.add(token);
  return res.json({ ok: true, token });
});

app.post('/api/teacher/verify', (req, res) => {
  const token = String(req.body?.token || '');
  return res.json({ valid: isValidTeacherToken(token) });
});

app.post('/api/teacher/change-pin', (req, res) => {
  const token = String(req.body?.token || req.headers['x-teacher-token'] || '');
  if (!isValidTeacherToken(token)) {
    return res.status(401).json({ error: 'Acceso no autorizado. Inicia sesión como docente.' });
  }
  const currentPin = String(req.body?.currentPin || '').trim();
  const newPin = String(req.body?.newPin || '').trim();

  if (!currentPin || currentPin !== TEACHER_PIN) {
    return res.status(400).json({ error: 'El PIN actual ingresado no es correcto.' });
  }
  if (!newPin || newPin.length < 4) {
    return res.status(400).json({ error: 'El nuevo PIN debe tener al menos 4 caracteres.' });
  }

  TEACHER_PIN = newPin;
  saveTeacherPinToConfig(newPin);
  console.log(`[Seguridad] PIN del Profesor actualizado exitosamente.`);
  return res.json({ ok: true, message: 'PIN del docente actualizado correctamente.' });
});

app.get('/api/posts', (req, res) => {
  const sid = req.query.sessionId || store.getActiveSessionId();
  const session = store.getSessionById(sid);
  if (!session || !session.isPublished) {
    return res.status(404).json({ error: 'Sesión no disponible.' });
  }
  res.json({
    sessionId: session.id,
    board: session.board,
    posts: getEnrichedPosts(session.id, { includeHidden: false }),
    assignment: session.assignment,
    timer: session.timer,
    scheduledTimers: store.getScheduledTimers(session.id),
    activeQuiz: store.getPublicActiveQuizPayload(session.id),
    screenQueue: getSessionQueue(session.id),
    serverTime: Date.now(),
  });
});

app.post('/api/upload', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'La imagen supera el límite máximo de 15 MB.'
          : err.message || 'Error al subir la imagen.';
      return res.status(400).json({ error: message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ninguna imagen.' });
    }
    return res.json({
      imageUrl: `/uploads/${req.file.filename}`,
      imageName: req.file.originalname,
    });
  });
});

app.patch('/api/board', (req, res) => {
  try {
    const sid = req.body?.sessionId || store.getActiveSessionId();
    const updated = store.updateBoard(
      {
        title: req.body?.title,
        description: req.body?.description,
      },
      sid
    );
    io.to(sessionRoom(sid)).emit('board:updated', updated);
    broadcastSessionsSummaryToAll();
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Socket.IO shared between HTTP and HTTPS servers
const io = new Server({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

function getRoomSockets(sessionId) {
  const roomSet = io.sockets.adapter.rooms.get(sessionRoom(sessionId));
  if (!roomSet) return [];
  const sockets = [];
  for (const sockId of roomSet) {
    const s = io.sockets.sockets.get(sockId);
    if (s) sockets.push(s);
  }
  return sockets;
}

function broadcastPresence(sessionId) {
  if (!sessionId) return;
  const count = io.sockets.adapter.rooms.get(sessionRoom(sessionId))?.size || 0;
  io.to(sessionRoom(sessionId)).emit('presence:count', { count });
}

function broadcastScreenQueue(sessionId) {
  if (!sessionId) return;
  io.to(sessionRoom(sessionId)).emit('screen-queue:updated', {
    queue: getSessionQueue(sessionId),
  });
}

function emitTimerState(sessionId) {
  if (!sessionId) return;
  io.to(sessionRoom(sessionId)).emit('timer:updated', {
    timer: store.getTimer(sessionId),
    scheduledTimers: store.getScheduledTimers(sessionId),
    serverTime: Date.now(),
  });
}

function broadcastQuizState(sessionId) {
  if (!sessionId) return;
  io.to(sessionRoom(sessionId)).emit('quiz:updated', {
    activeQuiz: store.getPublicActiveQuizPayload(sessionId),
    serverTime: Date.now(),
  });
}

function broadcastNotification(payload, sessionId) {
  const notification = store.addNotification(payload, sessionId);
  io.to(sessionRoom(sessionId)).emit('notification:new', notification);
  return notification;
}

function stopScreenShare(postId, reason = 'stopped') {
  const share = activeShares.get(postId);
  if (!share) return;
  activeShares.delete(postId);
  io.to(sessionRoom(share.sessionId)).emit('screen:stopped', { postId, reason });
}

function stopAllSharesInSession(sessionId, reason = 'session-changed', { onlyStudents = false } = {}) {
  for (const [postId, share] of Array.from(activeShares.entries())) {
    if (share.sessionId !== sessionId) continue;
    const sharerSock = io.sockets.sockets.get(share.sharerSocketId);
    if (onlyStudents && sharerSock?.data?.isTeacher) continue;
    stopScreenShare(postId, reason);
    io.to(share.sharerSocketId).emit('screen:force-stop', {
      postId,
      teacherName: 'Sesión actualizada',
    });
  }
  if (!onlyStudents) {
    setSessionQueue(sessionId, []);
    broadcastScreenQueue(sessionId);
  }
}

function emitPostToRoom(sessionId, eventName, post) {
  const enriched = enrichPost(post);
  for (const sock of getRoomSockets(sessionId)) {
    if (post.isHidden && !sock.data.isTeacher) continue;
    sock.emit(eventName, enriched);
  }
}

function buildSessionSnapshot(sessionId, { socketId = null, isTeacher = false } = {}) {
  const session = sessionId ? store.getSessionById(sessionId) : null;
  const sessions = store.getSessionsSummary({ onlyPublished: !isTeacher });

  if (!session || (!isTeacher && !session.isPublished)) {
    return {
      socketId,
      sessionId: null,
      activeSessionId: store.getActiveSessionId(),
      sessionStatus: null,
      sessions,
      board: {
        title: 'PadletLocal',
        description: 'Selecciona una sesión habilitada por el profesor para comenzar.',
      },
      posts: [],
      assignment: null,
      assignmentHistory: [],
      notifications: [],
      timer: null,
      scheduledTimers: [],
      activeQuiz: null,
      screenQueue: [],
      serverTime: Date.now(),
      onlineCount: io.engine.clientsCount,
    };
  }

  return {
    socketId,
    sessionId: session.id,
    activeSessionId: session.id,
    sessionStatus: {
      isPublished: session.isPublished !== false,
      isClosed: Boolean(session.isClosed),
    },
    sessions,
    board: session.board,
    posts: getEnrichedPosts(session.id, { includeHidden: isTeacher }),
    assignment: session.assignment,
    assignmentHistory: session.assignmentHistory,
    notifications: session.notifications,
    timer: session.timer,
    scheduledTimers: store.getScheduledTimers(session.id),
    activeQuiz: store.getPublicActiveQuizPayload(session.id),
    screenQueue: getSessionQueue(session.id),
    serverTime: Date.now(),
    onlineCount: io.sockets.adapter.rooms.get(sessionRoom(session.id))?.size || 1,
  };
}

function broadcastSessionsSummaryToAll() {
  const teacherList = store.getSessionsSummary({ onlyPublished: false });
  const studentList = store.getSessionsSummary({ onlyPublished: true });
  const defaultActiveId = store.getActiveSessionId();

  for (const sock of io.sockets.sockets.values()) {
    sock.emit('sessions:updated', {
      defaultSessionId: defaultActiveId,
      sessions: sock.data.isTeacher ? teacherList : studentList,
    });
  }
}

function syncRoomSockets(sessionId, reasonMessage = '') {
  for (const sock of getRoomSockets(sessionId)) {
    sock.emit('session:synced', {
      ...buildSessionSnapshot(sessionId, { socketId: sock.id, isTeacher: Boolean(sock.data.isTeacher) }),
      reasonMessage,
    });
  }
}

function joinSocketToSession(socket, targetSessionId) {
  const prevSessionId = socket.data.sessionId;
  if (prevSessionId && prevSessionId !== targetSessionId) {
    socket.leave(sessionRoom(prevSessionId));
    broadcastPresence(prevSessionId);
  }
  socket.data.sessionId = targetSessionId || null;
  if (targetSessionId) {
    socket.join(sessionRoom(targetSessionId));
    broadcastPresence(targetSessionId);
  }
}

function kickStudentsFromSession(sessionId, reason) {
  stopAllSharesInSession(sessionId, 'session-unpublished', { onlyStudents: true });
  const studentList = store.getSessionsSummary({ onlyPublished: true });

  for (const sock of getRoomSockets(sessionId)) {
    if (sock.data.isTeacher) continue;
    sock.leave(sessionRoom(sessionId));
    sock.data.sessionId = null;
    sock.emit('session:unavailable', {
      reason,
      sessions: studentList,
    });
  }
  broadcastPresence(sessionId);
}

// Server-side scheduler across ALL sessions (recesses, countdowns & live quizzes)
setInterval(() => {
  for (const session of store.getAllSessions()) {
    const sid = session.id;
    if (store.tickActiveQuiz(sid)) {
      broadcastQuizState(sid);
    }

    const { changed, startedScheduled, finishedActive } = store.tickTimers(sid);
    if (!changed) continue;

    emitTimerState(sid);

    if (startedScheduled) {
      const mins = Math.round(startedScheduled.durationSec / 60);
      const isRecess = startedScheduled.kind === 'recess';
      broadcastNotification(
        {
          title: isRecess ? `☕ ¡Comenzó: ${startedScheduled.label}!` : `⏱ Iniciado: ${startedScheduled.label}`,
          message:
            startedScheduled.message ||
            (isRecess
              ? `Receso de ${mins} minutos en curso. ¡Aprovechen para descansar!`
              : `Temporizador de ${mins} minutos iniciado.`),
          type: isRecess ? 'recess' : 'info',
          sound: true,
          author: 'Sistema · Profesor',
        },
        sid
      );
    }

    if (finishedActive) {
      const isRecess = finishedActive.kind === 'recess';
      io.to(sessionRoom(sid)).emit('timer:finished', { timer: finishedActive, serverTime: Date.now() });
      broadcastNotification(
        {
          title: isRecess
            ? `🔔 ¡Terminó el receso (${finishedActive.label})!`
            : `🔔 ¡Tiempo finalizado: ${finishedActive.label}!`,
          message: isRecess
            ? 'Es hora de regresar a la clase y continuar con las actividades.'
            : 'El tiempo asignado para esta actividad ha concluido.',
          type: 'warning',
          sound: true,
          author: 'Sistema · Profesor',
        },
        sid
      );
    }
  }
}, 1000);

function requireTeacher(token) {
  if (!isValidTeacherToken(token)) {
    throw new Error('Acceso restringido al modo Profesor. Vuelve a iniciar sesión con el PIN.');
  }
}

function getSocketSession(socket, preferredSessionId = null) {
  const sid = preferredSessionId || socket.data.sessionId;
  if (!sid) throw new Error('Primero selecciona una sesión de clase.');
  const session = store.getSessionById(sid);
  if (!session) throw new Error('La sesión seleccionada ya no existe.');
  return session;
}

function assertSessionWritable(socket, teacherToken = '', preferredSessionId = null) {
  const session = getSocketSession(socket, preferredSessionId);
  const isTeacher = socket.data.isTeacher || isValidTeacherToken(teacherToken);
  if (!isTeacher) {
    if (!session.isPublished) {
      throw new Error('Esta sesión no está habilitada por el profesor.');
    }
    if (session.isClosed) {
      throw new Error('Esta sesión está cerrada por el profesor (solo lectura).');
    }
  }
  return session;
}

io.on('connection', (socket) => {
  socket.data.isTeacher = false;
  socket.data.sessionId = null;

  // Auto-join default published session if available so board is ready immediately
  const defaultSession = store.getDefaultStudentSession();
  if (defaultSession) {
    joinSocketToSession(socket, defaultSession.id);
  }
  socket.emit(
    'board:init',
    buildSessionSnapshot(socket.data.sessionId, { socketId: socket.id, isTeacher: false })
  );

  // Register client authorId & optional teacher status
  socket.on('client:register', ({ authorId, teacherToken } = {}, ack) => {
    if (authorId && typeof authorId === 'string') {
      socketAuthors.set(socket.id, authorId.slice(0, 80));
    }
    const nowTeacher = isValidTeacherToken(teacherToken);
    const teacherChanged = socket.data.isTeacher !== nowTeacher;
    socket.data.isTeacher = nowTeacher;

    // If teacher just logged in (or logged out), refresh their session view & hidden posts
    if (teacherChanged) {
      let sid = socket.data.sessionId;
      if (nowTeacher && !sid) {
        sid = store.getActiveSessionId();
        joinSocketToSession(socket, sid);
      } else if (!nowTeacher && sid) {
        const cur = store.getSessionById(sid);
        if (!cur || !cur.isPublished) {
          const fallback = store.getDefaultStudentSession();
          joinSocketToSession(socket, fallback ? fallback.id : null);
          sid = socket.data.sessionId;
        }
      }
      socket.emit(
        'session:synced',
        buildSessionSnapshot(sid, { socketId: socket.id, isTeacher: nowTeacher })
      );
    }

    if (typeof ack === 'function') {
      ack({
        ok: true,
        isTeacher: nowTeacher,
        sessions: store.getSessionsSummary({ onlyPublished: !nowTeacher }),
      });
    }
  });

  // Any user or teacher joins a chosen session
  socket.on('session:join', ({ sessionId, teacherToken } = {}, ack) => {
    try {
      const isTeacher = socket.data.isTeacher || isValidTeacherToken(teacherToken);
      socket.data.isTeacher = isTeacher;

      const target = store.getSessionById(sessionId);
      if (!target) throw new Error('Sesión de clase no encontrada.');
      if (!isTeacher && !target.isPublished) {
        throw new Error('Esta sesión no está habilitada por el profesor.');
      }

      joinSocketToSession(socket, target.id);
      const snapshot = buildSessionSnapshot(target.id, { socketId: socket.id, isTeacher });
      socket.emit('session:synced', snapshot);
      if (typeof ack === 'function') ack({ ok: true, snapshot });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  // --- Teacher Session Management (Multi-Clase, Publicar/Despublicar, Cerrar/Abrir, Limpiar/Reiniciar) ---
  socket.on('teacher:session:create', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      socket.data.isTeacher = true;
      const activate = payload?.activate !== false;
      const isPublished = payload?.isPublished !== false;
      const session = store.createSession({
        name: payload?.name,
        description: payload?.description,
        isPublished,
        activate,
      });

      broadcastSessionsSummaryToAll();

      if (activate) {
        joinSocketToSession(socket, session.id);
        socket.emit('session:synced', {
          ...buildSessionSnapshot(session.id, { socketId: socket.id, isTeacher: true }),
          reasonMessage: `Trabajando en la nueva sesión: "${session.name}"`,
        });
      }

      if (typeof ack === 'function') {
        ack({
          ok: true,
          session,
          sessions: store.getSessionsSummary({ onlyPublished: false }),
          activeSessionId: socket.data.sessionId,
        });
      }
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:session:switch', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      socket.data.isTeacher = true;
      const session = store.switchSession(payload?.sessionId);
      joinSocketToSession(socket, session.id);
      broadcastSessionsSummaryToAll();

      socket.emit('session:synced', {
        ...buildSessionSnapshot(session.id, { socketId: socket.id, isTeacher: true }),
        reasonMessage: `Cambiaste a la sesión: "${session.name}"`,
      });

      if (typeof ack === 'function') {
        ack({
          ok: true,
          session,
          sessions: store.getSessionsSummary({ onlyPublished: false }),
          activeSessionId: session.id,
        });
      }
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:session:set-status', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      socket.data.isTeacher = true;
      const { sessionId, isPublished, isClosed } = payload || {};
      const updated = store.setSessionStatus(sessionId, { isPublished, isClosed });

      if (isPublished === false) {
        kickStudentsFromSession(
          updated.id,
          `El profesor despublicó la sesión "${updated.name}". Elige otra sesión habilitada.`
        );
      }

      io.to(sessionRoom(updated.id)).emit('session:status-changed', {
        sessionId: updated.id,
        isPublished: updated.isPublished,
        isClosed: updated.isClosed,
      });

      broadcastSessionsSummaryToAll();

      if (typeof ack === 'function') {
        ack({
          ok: true,
          session: updated,
          sessions: store.getSessionsSummary({ onlyPublished: false }),
        });
      }
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:session:rename', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      socket.data.isTeacher = true;
      const session = store.renameSession(payload?.sessionId, {
        name: payload?.name,
        description: payload?.description,
      });
      io.to(sessionRoom(session.id)).emit('board:updated', session.board);
      broadcastSessionsSummaryToAll();
      if (typeof ack === 'function') {
        ack({ ok: true, session, sessions: store.getSessionsSummary({ onlyPublished: false }) });
      }
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:session:delete', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      socket.data.isTeacher = true;
      const targetId = payload?.sessionId;
      stopAllSharesInSession(targetId, 'session-deleted');

      const affectedSockets = getRoomSockets(targetId);
      const result = store.deleteSession(targetId);
      const fallbackForTeacher = result.activeSession;
      const fallbackForStudent = store.getDefaultStudentSession();

      for (const sock of affectedSockets) {
        if (sock.data.isTeacher) {
          joinSocketToSession(sock, fallbackForTeacher.id);
          sock.emit('session:synced', {
            ...buildSessionSnapshot(fallbackForTeacher.id, { socketId: sock.id, isTeacher: true }),
            reasonMessage: `Sesión eliminada. Ahora estás en "${fallbackForTeacher.name}".`,
          });
        } else {
          sock.leave(sessionRoom(targetId));
          sock.data.sessionId = null;
          sock.emit('session:unavailable', {
            reason: 'El profesor eliminó esta sesión de clase. Selecciona otra sesión habilitada.',
            sessions: store.getSessionsSummary({ onlyPublished: true }),
            suggestedSessionId: fallbackForStudent ? fallbackForStudent.id : null,
          });
        }
      }

      broadcastSessionsSummaryToAll();

      if (typeof ack === 'function') {
        ack({
          ok: true,
          deletedId: result.deletedId,
          activeSessionId: socket.data.sessionId,
          sessions: store.getSessionsSummary({ onlyPublished: false }),
        });
      }
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:session:clear-posts', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket);
      stopAllSharesInSession(session.id, 'board-cleared');
      store.clearSessionPosts(session.id);
      syncRoomSockets(session.id, `El profesor limpió las respuestas de "${session.name}"`);
      broadcastSessionsSummaryToAll();
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:session:reset', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket);
      stopAllSharesInSession(session.id, 'board-reset');
      store.resetSession(session.id);
      syncRoomSockets(session.id, `El profesor reinició por completo la sesión "${session.name}"`);
      broadcastSessionsSummaryToAll();
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  // --- Teacher & Student Quizzes ---
  socket.on('teacher:quiz:list', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const sid = socket.data.sessionId || store.getActiveSessionId();
      if (typeof ack === 'function') {
        ack({
          ok: true,
          quizzes: store.getQuizzes(sid),
          allSessionsQuizzes: store.getAllSessionsQuizzes(sid),
          sessions: store.getSessionsSummary({ onlyPublished: false }),
          activeSessionId: sid,
        });
      }
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:quiz:save', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket);
      const saved = store.saveQuiz(
        {
          id: payload?.id,
          title: payload?.title,
          description: payload?.description,
          questions: payload?.questions,
        },
        session.id
      );
      broadcastSessionsSummaryToAll();
      if (typeof ack === 'function') {
        ack({
          ok: true,
          quiz: saved,
          quizzes: store.getQuizzes(session.id),
          allSessionsQuizzes: store.getAllSessionsQuizzes(session.id),
        });
      }
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:quiz:delete', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket);
      const wasActive = session.activeQuiz?.quizId === payload?.id;
      store.deleteQuiz(payload?.id, session.id);
      if (wasActive) broadcastQuizState(session.id);
      broadcastSessionsSummaryToAll();
      if (typeof ack === 'function') {
        ack({
          ok: true,
          quizzes: store.getQuizzes(session.id),
          allSessionsQuizzes: store.getAllSessionsQuizzes(session.id),
        });
      }
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:quiz:copy', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const currentSid = socket.data.sessionId || store.getActiveSessionId();
      const result = store.copyQuizToSession({
        sourceSessionId: payload?.sourceSessionId || currentSid,
        quizId: payload?.quizId,
        targetSessionId: payload?.targetSessionId || currentSid,
      });
      broadcastSessionsSummaryToAll();
      if (typeof ack === 'function') {
        ack({
          ok: true,
          ...result,
          quizzes: store.getQuizzes(currentSid),
          allSessionsQuizzes: store.getAllSessionsQuizzes(currentSid),
        });
      }
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:quiz:start', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket);
      store.startQuiz(payload?.quizId, session.id);
      const publicQuiz = store.getPublicActiveQuizPayload(session.id);
      broadcastQuizState(session.id);

      if (payload?.notifyAll !== false && publicQuiz) {
        broadcastNotification(
          {
            title: `🧠 ¡Test en vivo: ${publicQuiz.title}!`,
            message: `Responde las ${publicQuiz.totalQuestions} preguntas antes de que se agote el tiempo.`,
            type: 'task',
            sound: true,
            author: payload?.author || 'Profesor',
          },
          session.id
        );
      }

      if (typeof ack === 'function') ack({ ok: true, activeQuiz: publicQuiz });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:quiz:reveal', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket);
      store.revealCurrentQuestion(session.id);
      broadcastQuizState(session.id);
      if (typeof ack === 'function') ack({ ok: true, activeQuiz: store.getPublicActiveQuizPayload(session.id) });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:quiz:next', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket);
      store.nextQuizStep(session.id);
      broadcastQuizState(session.id);
      if (typeof ack === 'function') ack({ ok: true, activeQuiz: store.getPublicActiveQuizPayload(session.id) });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:quiz:close', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket);
      store.closeActiveQuiz(session.id);
      broadcastQuizState(session.id);
      if (typeof ack === 'function') ack({ ok: true, quizzes: store.getQuizzes(session.id) });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:quiz:analytics', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket);
      const analytics = store.computeQuizAnalytics(payload?.quizId, payload?.runId || null, session.id);
      if (!analytics) throw new Error('No se encontró el test solicitado.');
      if (typeof ack === 'function') ack({ ok: true, analytics });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('quiz:answer', (payload, ack) => {
    try {
      const session = getSocketSession(socket);
      const record = store.submitQuizAnswer(
        {
          authorId: payload?.authorId,
          author: payload?.author,
          questionId: payload?.questionId,
          optionIndex: payload?.optionIndex,
        },
        session.id
      );
      broadcastQuizState(session.id);
      if (typeof ack === 'function') ack({ ok: true, answered: true, optionIndex: record.optionIndex });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  // --- Post CRUD events (Session-Scoped) ---
  socket.on('post:create', (payload, ack) => {
    try {
      const session = assertSessionWritable(socket, payload?.teacherToken, payload?.sessionId);
      const post = store.createPost(payload || {}, session.id);
      const enriched = enrichPost(post);
      emitPostToRoom(session.id, 'post:created', post);
      broadcastSessionsSummaryToAll();
      if (typeof ack === 'function') ack({ ok: true, post: enriched });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('post:update', (payload, ack) => {
    try {
      const { id, teacherToken, sessionId, ...fields } = payload || {};
      const session = assertSessionWritable(socket, teacherToken, sessionId);
      const post = store.updatePost(
        id,
        {
          ...fields,
          force: isValidTeacherToken(teacherToken),
        },
        session.id
      );
      const enriched = enrichPost(post);
      emitPostToRoom(session.id, 'post:updated', post);
      if (typeof ack === 'function') ack({ ok: true, post: enriched });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('post:delete', (payload, ack) => {
    try {
      const { id, authorId, teacherToken, sessionId } = payload || {};
      const session = getSocketSession(socket, sessionId);
      const deleted = store.deletePost(
        id,
        authorId,
        { force: isValidTeacherToken(teacherToken) },
        session.id
      );
      if (activeShares.has(deleted.id)) {
        stopScreenShare(deleted.id, 'post-deleted');
      }
      io.to(sessionRoom(session.id)).emit('post:deleted', { id: deleted.id });
      broadcastSessionsSummaryToAll();
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('post:like', (payload, ack) => {
    try {
      const session = getSocketSession(socket, payload?.sessionId);
      const { id, authorId } = payload || {};
      const post = store.toggleLike(id, authorId, session.id);
      const enriched = enrichPost(post);
      emitPostToRoom(session.id, 'post:updated', post);
      if (typeof ack === 'function') ack({ ok: true, post: enriched });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('post:comment', (payload, ack) => {
    try {
      const session = assertSessionWritable(socket, payload?.teacherToken, payload?.sessionId);
      const { id, authorId, author, text } = payload || {};
      const post = store.addComment(id, { authorId, author, text }, session.id);
      const enriched = enrichPost(post);
      emitPostToRoom(session.id, 'post:updated', post);
      if (typeof ack === 'function') ack({ ok: true, post: enriched });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  // --- Teacher Controls (Pinning, Review, Hide/Unpublish Post, Screen Control, Tasks, Notifications, Timers) ---
  socket.on('teacher:post:pin', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket, payload?.sessionId);
      const post = store.togglePinPost(payload?.id, session.id);
      const enriched = enrichPost(post);
      emitPostToRoom(session.id, 'post:updated', post);
      if (typeof ack === 'function') ack({ ok: true, post: enriched });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:post:review', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket, payload?.sessionId);
      const post = store.toggleReviewPost(payload?.id, payload?.reviewerName || 'Profesor', session.id);
      const enriched = enrichPost(post);
      emitPostToRoom(session.id, 'post:updated', post);
      broadcastSessionsSummaryToAll();
      if (typeof ack === 'function') ack({ ok: true, post: enriched });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  // Destacar o quitar destacado de un post (⭐ Destacada)
  socket.on('post:highlight', (payload, ack) => {
    try {
      const session = getSocketSession(socket, payload?.sessionId);
      const isTeacher = socket.data.isTeacher || isValidTeacherToken(payload?.teacherToken);
      const post = store.getPostById(payload?.id, session.id);
      if (!post) throw new Error('Publicación no encontrada.');

      // Permite destacar al profesor o al autor de la publicación
      if (!isTeacher && post.authorId !== payload?.authorId) {
        throw new Error('Solo el profesor o el autor pueden destacar esta publicación.');
      }

      const updated = store.toggleHighlightPost(
        payload?.id,
        payload?.highlighterName || (isTeacher ? 'Profesor' : post.author),
        session.id
      );
      const enriched = enrichPost(updated);
      emitPostToRoom(session.id, 'post:updated', updated);

      if (updated.highlighted && payload?.notifyAll) {
        broadcastNotification(
          {
            title: `⭐ Publicación destacada: "${updated.topic}"`,
            message: `${updated.author} aportó una respuesta destacada por ${updated.highlightedBy || 'el profesor'}.`,
            type: 'info',
            sound: true,
            author: updated.highlightedBy || 'Profesor',
          },
          session.id
        );
      }

      if (typeof ack === 'function') ack({ ok: true, post: enriched });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  // Reordenar publicaciones mediante arrastre (Drag & Drop)
  socket.on('post:reorder', (payload, ack) => {
    try {
      const session = getSocketSession(socket, payload?.sessionId);
      const postIds = Array.isArray(payload?.postIds) ? payload.postIds : [];
      if (postIds.length > 0) {
        store.reorderPosts(postIds, session.id);
        io.to(sessionRoom(session.id)).emit('posts:reordered', {
          sessionId: session.id,
          postIds,
        });
      }
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  // Despublicar / Ocultar o Republicar un post (contenido no deseado)
  socket.on('teacher:post:toggle-hide', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket, payload?.sessionId);
      const post = store.toggleHidePost(payload?.id, payload?.moderatorName || 'Profesor', session.id);

      if (post.isHidden && activeShares.has(post.id)) {
        const share = activeShares.get(post.id);
        const sharerSocketId = share.sharerSocketId;
        stopScreenShare(post.id, 'post-hidden');
        io.to(sharerSocketId).emit('screen:force-stop', {
          postId: post.id,
          teacherName: payload?.moderatorName || 'Profesor',
        });
      }

      const enriched = enrichPost(post);
      for (const sock of getRoomSockets(session.id)) {
        if (sock.data.isTeacher) {
          sock.emit('post:updated', enriched);
        } else if (post.isHidden) {
          sock.emit('post:deleted', { id: post.id });
        } else {
          sock.emit('post:created', enriched);
        }
      }

      broadcastSessionsSummaryToAll();
      if (typeof ack === 'function') ack({ ok: true, post: enriched });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:screen:pause', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const { postId, paused, teacherName } = payload || {};
      const share = activeShares.get(postId);
      if (!share) throw new Error('No hay pantalla compartida activa en esta tarjeta.');

      share.pausedByTeacher = Boolean(paused);
      io.to(sessionRoom(share.sessionId)).emit('screen:paused', {
        postId,
        paused: share.pausedByTeacher,
        teacherName: teacherName || 'Profesor',
      });
      if (typeof ack === 'function') ack({ ok: true, paused: share.pausedByTeacher });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:screen:stop', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const { postId, teacherName } = payload || {};
      const share = activeShares.get(postId);
      if (!share) throw new Error('No hay pantalla compartida activa en esta tarjeta.');

      const targetSocketId = share.sharerSocketId;
      stopScreenShare(postId, 'teacher-stopped');
      io.to(targetSocketId).emit('screen:force-stop', {
        postId,
        teacherName: teacherName || 'Profesor',
      });
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:screen:request-resume', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket);
      const { postId, teacherName } = payload || {};
      const post = store.getPostById(postId, session.id);
      if (!post) throw new Error('La tarjeta no existe.');

      const share = activeShares.get(postId);
      if (share && share.pausedByTeacher) {
        share.pausedByTeacher = false;
        io.to(sessionRoom(share.sessionId)).emit('screen:paused', {
          postId,
          paused: false,
          teacherName: teacherName || 'Profesor',
        });
        if (typeof ack === 'function') ack({ ok: true, mode: 'resumed-instant' });
        return;
      }

      const targetSockets = getSocketsByAuthorId(post.authorId, session.id);
      if (targetSockets.length === 0) {
        throw new Error(`El autor (${post.author}) no está conectado en esta sesión.`);
      }

      targetSockets.forEach((sockId) => {
        io.to(sockId).emit('screen:resume-requested', {
          postId: post.id,
          topic: post.topic,
          teacherName: teacherName || 'Profesor',
        });
      });

      if (typeof ack === 'function') ack({ ok: true, mode: 'requested', author: post.author });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:assignment:save', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket);
      const result = store.setAssignment(
        {
          title: payload.title,
          instructions: payload.instructions,
          dueNote: payload.dueNote,
          imageUrl: payload.imageUrl,
          imageName: payload.imageName,
          pinned: payload.pinned !== false,
          author: payload.author || 'Profesor',
        },
        session.id
      );

      io.to(sessionRoom(session.id)).emit('assignment:updated', result);

      if (payload.notifyAll) {
        broadcastNotification(
          {
            title: `📝 Nueva tarea: ${result.assignment.title}`,
            message: result.assignment.dueNote
              ? `${result.assignment.dueNote} — Revisa las instrucciones fijadas en la parte superior del panel.`
              : 'El profesor publicó instrucciones para la siguiente tarea en la parte superior del panel.',
            type: 'task',
            sound: true,
            author: result.assignment.updatedBy,
          },
          session.id
        );
      }

      if (typeof ack === 'function') ack({ ok: true, ...result });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:assignment:toggle-pin', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket);
      const assignment = store.setAssignmentPinned(payload?.pinned, session.id);
      io.to(sessionRoom(session.id)).emit('assignment:updated', {
        assignment,
        assignmentHistory: store.getAssignmentHistory(session.id),
      });
      if (typeof ack === 'function') ack({ ok: true, assignment });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:assignment:clear', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket);
      const result = store.clearAssignment(session.id);
      io.to(sessionRoom(session.id)).emit('assignment:updated', result);
      if (typeof ack === 'function') ack({ ok: true, ...result });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:notify', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket);
      const notification = broadcastNotification(
        {
          title: payload.title,
          message: payload.message,
          type: payload.type,
          sound: payload.sound !== false,
          author: payload.author || 'Profesor',
        },
        session.id
      );
      if (typeof ack === 'function') ack({ ok: true, notification });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:timer:start', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket);
      const timer = store.startTimer(
        {
          kind: payload.kind,
          label: payload.label,
          message: payload.message,
          durationMin: payload.durationMin,
        },
        session.id
      );
      emitTimerState(session.id);

      if (payload.notifyAll !== false) {
        const mins = Math.round(timer.durationSec / 60);
        const isRecess = timer.kind === 'recess';
        broadcastNotification(
          {
            title: isRecess ? `☕ ¡Receso iniciado: ${timer.label}!` : `⏱ ${timer.label}`,
            message:
              timer.message ||
              (isRecess
                ? `Tenemos ${mins} minutos de receso. Mira la cuenta regresiva arriba.`
                : `Temporizador activo por ${mins} minutos.`),
            type: isRecess ? 'recess' : 'info',
            sound: true,
            author: payload.author || 'Profesor',
          },
          session.id
        );
      }

      if (typeof ack === 'function') ack({ ok: true, timer });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:timer:schedule', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket);
      const scheduled = store.scheduleTimer(
        {
          kind: payload.kind,
          label: payload.label,
          message: payload.message,
          startAt: payload.startAt,
          durationMin: payload.durationMin,
        },
        session.id
      );
      emitTimerState(session.id);

      if (payload.notifyAll) {
        const startStr = new Date(scheduled.startAt).toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
        });
        const mins = Math.round(scheduled.durationSec / 60);
        broadcastNotification(
          {
            title: `📅 Programado: ${scheduled.label}`,
            message: `Comenzará a las ${startStr} con una duración de ${mins} min.`,
            type: scheduled.kind === 'recess' ? 'recess' : 'info',
            sound: true,
            author: payload.author || 'Profesor',
          },
          session.id
        );
      }

      if (typeof ack === 'function') ack({ ok: true, scheduled });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:timer:cancel-scheduled', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket);
      store.cancelScheduledTimer(payload?.id, session.id);
      emitTimerState(session.id);
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:timer:pause', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket);
      const timer = store.pauseTimer(session.id);
      emitTimerState(session.id);
      if (typeof ack === 'function') ack({ ok: true, timer });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:timer:resume', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket);
      const timer = store.resumeTimer(session.id);
      emitTimerState(session.id);
      if (typeof ack === 'function') ack({ ok: true, timer });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:timer:extend', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket);
      const timer = store.extendTimer(payload?.extraMin || 5, session.id);
      emitTimerState(session.id);
      if (typeof ack === 'function') ack({ ok: true, timer });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:timer:stop', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket);
      store.clearTimer(session.id);
      emitTimerState(session.id);
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  // --- Per-Session Screen Share Queue ---
  socket.on('screen-queue:join', (payload, ack) => {
    try {
      const session = assertSessionWritable(socket, payload?.teacherToken);
      const cleanAuthorId = String(payload?.authorId || '').trim().slice(0, 80);
      const cleanAuthor = String(payload?.author || '').trim().slice(0, 50);
      const cleanReason = String(payload?.reason || '').trim().slice(0, 120);
      if (!cleanAuthorId) throw new Error('Identificador de usuario inválido.');
      if (!cleanAuthor) throw new Error('Ingresa tu nombre para encolarte.');
      if (!cleanReason) throw new Error('Ingresa el motivo para compartir tu pantalla.');

      const queue = getSessionQueue(session.id);
      const existing = queue.find((q) => q.authorId === cleanAuthorId);
      if (existing) {
        existing.author = cleanAuthor;
        existing.reason = cleanReason;
        broadcastScreenQueue(session.id);
        if (typeof ack === 'function') ack({ ok: true, entry: existing, updated: true });
        return;
      }

      const entry = {
        id: crypto.randomUUID(),
        authorId: cleanAuthorId,
        author: cleanAuthor,
        reason: cleanReason,
        status: 'waiting',
        createdAt: new Date().toISOString(),
      };
      queue.push(entry);
      broadcastScreenQueue(session.id);
      if (typeof ack === 'function') ack({ ok: true, entry });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('screen-queue:leave', (payload, ack) => {
    const sid = socket.data.sessionId;
    if (!sid) return typeof ack === 'function' && ack({ ok: true });
    const { id, authorId } = payload || {};
    const queue = getSessionQueue(sid);
    const filtered = queue.filter((q) => {
      if (id && q.id === id) return q.authorId !== authorId;
      if (!id && authorId && q.authorId === authorId) return false;
      return true;
    });
    if (filtered.length !== queue.length) {
      setSessionQueue(sid, filtered);
      broadcastScreenQueue(sid);
    }
    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('teacher:screen-queue:call', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket);
      const { id, teacherName } = payload || {};
      const queue = getSessionQueue(session.id);
      const entry = queue.find((q) => q.id === id);
      if (!entry) throw new Error('El usuario ya no está en la cola.');

      const targetSockets = getSocketsByAuthorId(entry.authorId, session.id);
      if (targetSockets.length === 0) {
        throw new Error(`${entry.author} no está conectado en esta sesión.`);
      }

      entry.status = 'called';
      broadcastScreenQueue(session.id);

      targetSockets.forEach((sockId) => {
        io.to(sockId).emit('screen:turn-granted', {
          queueId: entry.id,
          author: entry.author,
          reason: entry.reason,
          teacherName: teacherName || 'Profesor',
        });
      });

      if (typeof ack === 'function') ack({ ok: true, entry });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:screen-queue:remove', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket);
      const next = getSessionQueue(session.id).filter((q) => q.id !== payload?.id);
      setSessionQueue(session.id, next);
      broadcastScreenQueue(session.id);
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('teacher:screen-queue:clear', (payload, ack) => {
    try {
      requireTeacher(payload?.teacherToken);
      const session = getSocketSession(socket);
      setSessionQueue(session.id, []);
      broadcastScreenQueue(session.id);
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  // --- WebRTC Screen Sharing Signaling (Session-Scoped) ---
  socket.on('screen:start', (payload, ack) => {
    try {
      const session = assertSessionWritable(socket, payload?.teacherToken);
      const { postId, authorId, authorName } = payload || {};
      const post = store.getPostById(postId, session.id);
      if (!post) throw new Error('La tarjeta no existe en esta sesión.');

      const existing = activeShares.get(postId);
      if (existing && existing.sharerSocketId !== socket.id) {
        throw new Error('Esta tarjeta ya está compartiendo pantalla.');
      }

      const sharerAuthorId = authorId || post.authorId;
      const share = {
        sessionId: session.id,
        sharerSocketId: socket.id,
        sharerAuthorId,
        sharerName: authorName || post.author,
        pausedByTeacher: false,
        watchers: new Set(),
      };
      activeShares.set(postId, share);

      const queue = getSessionQueue(session.id);
      const nextQueue = queue.filter((q) => q.authorId !== sharerAuthorId);
      if (nextQueue.length !== queue.length) {
        setSessionQueue(session.id, nextQueue);
        broadcastScreenQueue(session.id);
      }

      io.to(sessionRoom(session.id)).emit('screen:started', {
        postId,
        sharerSocketId: share.sharerSocketId,
        sharerAuthorId: share.sharerAuthorId,
        sharerName: share.sharerName,
        pausedByTeacher: false,
        viewerCount: 0,
      });

      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('screen:stop', ({ postId } = {}) => {
    const share = activeShares.get(postId);
    if (share && share.sharerSocketId === socket.id) {
      stopScreenShare(postId, 'stopped');
    }
  });

  socket.on('screen:watch', ({ postId } = {}) => {
    const share = activeShares.get(postId);
    if (!share || share.sharerSocketId === socket.id) return;

    share.watchers.add(socket.id);
    io.to(share.sharerSocketId).emit('screen:watcher-joined', {
      postId,
      watcherId: socket.id,
    });
    io.to(sessionRoom(share.sessionId)).emit('screen:viewers', {
      postId,
      viewerCount: share.watchers.size,
    });
  });

  socket.on('screen:unwatch', ({ postId } = {}) => {
    const share = activeShares.get(postId);
    if (!share || !share.watchers.has(socket.id)) return;

    share.watchers.delete(socket.id);
    io.to(share.sharerSocketId).emit('screen:watcher-left', {
      postId,
      watcherId: socket.id,
    });
    io.to(sessionRoom(share.sessionId)).emit('screen:viewers', {
      postId,
      viewerCount: share.watchers.size,
    });
  });

  socket.on('webrtc:offer', ({ to, postId, offer } = {}) => {
    if (!to || !postId || !offer) return;
    io.to(to).emit('webrtc:offer', { from: socket.id, postId, offer });
  });

  socket.on('webrtc:answer', ({ to, postId, answer } = {}) => {
    if (!to || !postId || !answer) return;
    io.to(to).emit('webrtc:answer', { from: socket.id, postId, answer });
  });

  socket.on('webrtc:ice-candidate', ({ to, postId, candidate } = {}) => {
    if (!to || !postId || !candidate) return;
    io.to(to).emit('webrtc:ice-candidate', { from: socket.id, postId, candidate });
  });

  socket.on('disconnect', () => {
    const sid = socket.data.sessionId;
    socketAuthors.delete(socket.id);
    for (const [postId, share] of Array.from(activeShares.entries())) {
      if (share.sharerSocketId === socket.id) {
        stopScreenShare(postId, 'presenter-disconnected');
      } else if (share.watchers.has(socket.id)) {
        share.watchers.delete(socket.id);
        io.to(share.sharerSocketId).emit('screen:watcher-left', {
          postId,
          watcherId: socket.id,
        });
        io.to(sessionRoom(share.sessionId)).emit('screen:viewers', {
          postId,
          viewerCount: share.watchers.size,
        });
      }
    }
    if (sid) broadcastPresence(sid);
  });
});

async function start() {
  const localIPs = getLocalIPs();
  const primaryIP = getPrimaryLocalIP();
  const ipStrings = localIPs.map((i) => i.address);

  const httpServer = http.createServer(app);
  io.attach(httpServer);

  let httpsServer = null;
  try {
    const tls = await getOrCreateCertificate(ipStrings);
    httpsServer = https.createServer({ key: tls.key, cert: tls.cert }, app);
    io.attach(httpsServer);
  } catch (err) {
    console.warn('No se pudo inicializar HTTPS automáticamente:', err.message);
  }

  await new Promise((resolve, reject) => {
    httpServer.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`El puerto HTTP ${HTTP_PORT} ya está en uso por otro proceso.`));
      } else {
        reject(err);
      }
    });
    httpServer.listen(HTTP_PORT, HOST, resolve);
  });

  if (httpsServer) {
    await new Promise((resolve, reject) => {
      httpsServer.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`El puerto HTTPS ${HTTPS_PORT} ya está en uso por otro proceso.`));
        } else {
          reject(err);
        }
      });
      httpsServer.listen(HTTPS_PORT, HOST, resolve);
    });
  }

  console.log('\n==============================================================');
  console.log('  PadletLocal iniciado correctamente');
  console.log('==============================================================');
  if (httpsServer) {
    console.log(`  [HTTPS - Recomendado para compartir pantalla WebRTC]`);
    console.log(`    Red local : https://${primaryIP}:${HTTPS_PORT}`);
    console.log(`    Local     : https://localhost:${HTTPS_PORT}`);
  }
  console.log(`  [HTTP - Acceso rápido]`);
  console.log(`    Red local : http://${primaryIP}:${HTTP_PORT}`);
  console.log(`    Local     : http://localhost:${HTTP_PORT}`);
  console.log(`\n  [Modo Profesor]`);
  console.log(`    PIN actual: ${TEACHER_PIN}  (puedes cambiarlo con TEACHER_PIN=xxxx)`);

  if (localIPs.length > 1) {
    console.log('\n  Otras interfaces detectadas:');
    for (const iface of localIPs.slice(1)) {
      console.log(`    - ${iface.interfaceName}: https://${iface.address}:${HTTPS_PORT} | http://${iface.address}:${HTTP_PORT}`);
    }
  }

  console.log('\n  [Certificado HTTPS sin pantalla roja]');
  console.log(`    Windows (1 clic) : http://${primaryIP}:${HTTP_PORT}/cert/Instalar-Certificado-Windows.bat`);
  console.log(`    Otros (.crt)     : http://${primaryIP}:${HTTP_PORT}/cert/PadletLocal-RootCA.crt`);
  console.log('==============================================================\n');
}

start().catch((err) => {
  console.error('Error fatal al iniciar PadletLocal:', err.message || err);
  process.exit(1);
});
