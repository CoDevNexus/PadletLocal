(() => {
  // --- Global Client Error Reporter to Root error.log ---
  window.reportClientError = function (context, err) {
    try {
      const payload = {
        type: 'CLIENT_REPORTED_ERROR',
        message: `[${context}] ${err?.message || String(err)}`,
        stack: err?.stack || '',
        role: state?.isTeacher ? 'Docente' : 'Alumno',
        author: authorName || 'Sin identificar',
        url: window.location.href,
      };
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/log-error', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
      } else {
        fetch('/api/log-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {});
      }
    } catch (_) {}
  };

  // --- Utilities ---
  function generateId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTextWithLinks(text) {
    if (!text) return '';
    let escaped = escapeHtml(text);

    // 1. URLs to clickable links
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    escaped = escaped.replace(
      urlRegex,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    // 2. Headings: lines starting with ### or ## or #
    escaped = escaped.replace(/^(#{1,3})\s+(.+)$/gm, '<strong class="fmt-heading">$2</strong>');

    // 3. Bold: **text**
    escaped = escaped.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');

    // 4. Italic: *text* (excluding standalone stars or code)
    escaped = escaped.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>');

    // 5. Underline: <u>text</u> or __text__
    escaped = escaped.replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/gi, '<u>$1</u>');
    escaped = escaped.replace(/__([^_\n]+?)__/g, '<u>$1</u>');

    // 6. Strikethrough: ~~text~~
    escaped = escaped.replace(/~~([^~\n]+?)~~/g, '<del>$1</del>');

    // 7. Inline code: `text`
    escaped = escaped.replace(/`([^`\n]+)`/g, '<code class="fmt-code">$1</code>');

    // 8. Quotes: lines starting with >
    escaped = escaped.replace(/^&gt;\s*(.+)$/gm, '<span class="fmt-quote">▎ $1</span>');

    return escaped;
  }

  function formatRelativeTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    const now = typeof serverNow === 'function' ? serverNow() : Date.now();
    const diffSec = Math.max(0, Math.floor((now - date.getTime()) / 1000));
    if (diffSec < 20) return 'ahora';
    if (diffSec < 60) return `hace ${diffSec}s`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `hace ${diffMin} min`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `hace ${diffHr} h`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays === 1) return 'ayer';
    if (diffDays < 7) return `hace ${diffDays} d`;
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
    });
  }

  function getCardPreviewContent(content, maxChars = 150) {
    if (!content) return '';
    const clean = String(content).trim();
    if (clean.length <= maxChars) {
      return formatTextWithLinks(clean);
    }
    let truncated = clean.slice(0, maxChars);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxChars * 0.7) {
      truncated = truncated.slice(0, lastSpace);
    }
    return `${formatTextWithLinks(truncated)}… <span class="read-more-text" data-action="open-post-detail" title="Ver publicación completa">Ver más</span>`;
  }

  function formatCountdown(totalSeconds) {
    const sec = Math.max(0, Math.floor(totalSeconds));
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const remSec = sec % 60;
    const mm = String(mins).padStart(2, '0');
    const ss = String(remSec).padStart(2, '0');
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${mm}:${ss}`;
    }
    return `${mm}:${ss}`;
  }

  function formatClockTime(epochMs) {
    return new Date(epochMs).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getInitials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  const AVATAR_COLORS = [
    '#4f46e5',
    '#0284c7',
    '#059669',
    '#d97706',
    '#e11d48',
    '#7c3aed',
    '#0d9488',
    '#ea580c',
  ];

  function getAvatarColor(seed) {
    let hash = 0;
    const str = String(seed || '');
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const temp = document.createElement('textarea');
      temp.value = text;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      temp.remove();
    }
  }

  // --- Offline Web Audio Chime Engine ---
  let audioCtx = null;
  function playChime(type = 'info') {
    if (!state.soundEnabled) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      const now = audioCtx.currentTime;
      const sequences = {
        info: [
          { freq: 587.33, start: 0, dur: 0.14 },
          { freq: 880.0, start: 0.14, dur: 0.22 },
        ],
        task: [
          { freq: 523.25, start: 0, dur: 0.12 },
          { freq: 659.25, start: 0.12, dur: 0.12 },
          { freq: 783.99, start: 0.24, dur: 0.24 },
        ],
        recess: [
          { freq: 659.25, start: 0, dur: 0.16 },
          { freq: 783.99, start: 0.16, dur: 0.16 },
          { freq: 1046.5, start: 0.32, dur: 0.3 },
        ],
        warning: [
          { freq: 880.0, start: 0, dur: 0.14 },
          { freq: 880.0, start: 0.18, dur: 0.14 },
          { freq: 1046.5, start: 0.36, dur: 0.28 },
        ],
      };

      const notes = sequences[type] || sequences.info;
      notes.forEach(({ freq, start, dur }) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + start);
        gain.gain.setValueAtTime(0.001, now + start);
        gain.gain.exponentialRampToValueAtTime(0.14, now + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + start);
        osc.stop(now + start + dur + 0.02);
      });
    } catch {
      // Ignore autoplay audio restrictions
    }
  }

  // --- Persistent Client Identity ---
  const STORAGE_ID_KEY = 'padletlocal_author_id';
  const STORAGE_NAME_KEY = 'padletlocal_author_name';
  const STORAGE_ROLE_KEY = 'padletlocal_user_role';
  const STORAGE_SOUND_KEY = 'padletlocal_sound_enabled';
  const STORAGE_CHAT_SOUND_KEY = 'padletlocal_chat_sound_enabled';
  const STORAGE_MUTED_THREADS_KEY = 'padletlocal_chat_muted_threads';
  const STORAGE_TEACHER_TOKEN_KEY = 'padletlocal_teacher_token';
  const STORAGE_TEACHER_NAME_KEY = 'padletlocal_teacher_name';
  const STORAGE_UI_MODE_KEY = 'padletlocal_ui_mode';
  const STORAGE_DENSITY_KEY = 'padletlocal_density_mode';
  const STORAGE_VIEW_LAYOUT_KEY = 'padletlocal_view_layout'; // 'canva' | 'list'
  const STORAGE_SCREENS_SIZE_KEY = 'padletlocal_screens_size'; // 'compact' | 'normal' | 'large'
  const STORAGE_TEACHER_ID_KEY = 'padletlocal_teacher_author_id';
  const AUTO_COMPACT_THRESHOLD = 6;

  let studentAuthorId = localStorage.getItem(STORAGE_ID_KEY);
  if (!studentAuthorId) {
    studentAuthorId = 'usr_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36).slice(-4);
    localStorage.setItem(STORAGE_ID_KEY, studentAuthorId);
  }

  let teacherAuthorId = localStorage.getItem(STORAGE_TEACHER_ID_KEY);
  if (!teacherAuthorId) {
    teacherAuthorId = 'tch_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36).slice(-4);
    localStorage.setItem(STORAGE_TEACHER_ID_KEY, teacherAuthorId);
  }

  function getEffectiveAuthorId() {
    return state?.isTeacher ? teacherAuthorId : studentAuthorId;
  }
  let authorId = studentAuthorId;
  let authorName = localStorage.getItem(STORAGE_NAME_KEY) || '';
  if (!authorName || !authorName.trim() || authorName === 'Anónimo' || authorName === 'Sin nombre') {
    const randomNum = Math.floor(100 + Math.random() * 900);
    authorName = `Alumno-${randomNum}`;
    localStorage.setItem(STORAGE_NAME_KEY, authorName);
  }
  let teacherName = localStorage.getItem(STORAGE_TEACHER_NAME_KEY) || 'Docente';

  // --- App State ---
  const state = {
    socketId: null,
    serverOffsetMs: 0,
    activeSessionId: null,
    sessionStatus: { isPublished: true, isClosed: false },
    hasChosenSession: false,
    sessions: [],
    chatMessages: [],
    chatUsers: [],
    unreadChatCount: 0,
    chatSoundEnabled: localStorage.getItem(STORAGE_CHAT_SOUND_KEY) !== 'false',
    mutedThreads: new Set(JSON.parse(localStorage.getItem(STORAGE_MUTED_THREADS_KEY) || '[]')),
    isChatOpen: false,
    activeChatTab: 'messages',
    chatCurrentView: 'list', // 'list' | 'thread'
    activeChatThread: 'all', // 'all' | 'teachers' | 'user:<authorId>'
    activeRecipient: 'all',
    readMessageIds: new Set(JSON.parse(localStorage.getItem('padletlocal_read_msgs') || '[]')),
    board: {
      title: 'PadletLocal',
      description: 'Panel colaborativo en red local — ideas, imágenes y pantalla compartida en tiempo real.',
    },
    posts: [],
    assignment: null,
    assignmentHistory: [],
    expandedTaskId: null, // null = all task mini-cards compact; task.id = expanded
    screenQueue: [],
    workspaceView: localStorage.getItem('padletlocal_workspace_view') || 'padlets', // 'padlets' | 'screens' | 'both'
    notifications: [],
    unreadNotifications: 0,
    timer: null,
    scheduledTimers: [],
    soundEnabled: localStorage.getItem(STORAGE_SOUND_KEY) !== 'false',
    uiMode: localStorage.getItem(STORAGE_UI_MODE_KEY) || 'full', // 'easy' | 'full'
    viewLayout: localStorage.getItem(STORAGE_VIEW_LAYOUT_KEY) || 'canva', // 'canva' | 'list'
    screensSize: localStorage.getItem(STORAGE_SCREENS_SIZE_KEY) || 'compact', // 'compact' | 'normal' | 'large'
    densityMode: localStorage.getItem(STORAGE_DENSITY_KEY) || 'normal', // 'compact' | 'normal' | 'large'
    focusedCardId: null,
    pendingResumePostId: null,
    pendingTurnGrant: null, // { queueId, author, reason }
    teacherToken: sessionStorage.getItem(STORAGE_TEACHER_TOKEN_KEY) || '',
    teacherName,
    isTeacher: false,
    isDisabled: false,
    isKicked: false,
    studentsList: [],
    studentsSearchQuery: '',
    activeTeacherTab: 'assignment',

    activeTopic: '__ALL__', // '__ALL__' | '__LIVE__' | '__UNREVIEWED__' | '__REVIEWED__' | topic string
    activeAuthor: null, // null or string author name to filter by author
    activeTaskFilter: null, // null or assignmentId to filter by task
    searchQuery: '',
    screenSearchQuery: '',
    composerAssignmentId: null,
    composerAssignmentTitle: null,
    pendingCleanAssignmentId: null,
    pendingCleanAssignmentAction: null, // 'toggle-hide' | 'clear' | 'delete'
    expandedCards: new Set(),
    openComments: new Set(),
    serverInfo: null,

    // Post composer image state
    selectedFile: null,
    existingImageUrl: null,
    existingImageName: null,
    removeExistingImage: false,
    selectedColor: 'default',

    // Assignment image state
    taskSelectedFile: null,
    taskExistingImageUrl: null,
    taskExistingImageName: null,
    taskRemoveExistingImage: false,
    isEditingActiveAssignment: false,
    pendingEditActive: false,
  };

  function serverNow() {
    return Date.now() + state.serverOffsetMs;
  }

  // --- Mobile Device Detection ---
  const isMobileDevice =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && window.innerWidth <= 1024);
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  // --- DOM References ---
  const el = {
    boardTitle: document.getElementById('boardTitle'),
    activeSessionBadge: document.getElementById('activeSessionBadge'),
    boardDescription: document.getElementById('boardDescription'),
    btnEditBoard: document.getElementById('btnEditBoard'),
    searchInput: document.getElementById('searchInput'),
    connectionDot: document.getElementById('connectionDot'),
    onlineCount: document.getElementById('onlineCount'),
    uiModeToggle: document.getElementById('uiModeToggle'),
    btnOpenManual: document.getElementById('btnOpenManual'),
    btnHelpGuide: document.getElementById('btnHelpGuide'),
    helpGuideModal: document.getElementById('helpGuideModal'),
    btnHelpSwitchEasy: document.getElementById('btnHelpSwitchEasy'),
    easyModeBar: document.getElementById('easyModeBar'),
    btnEasyPublish: document.getElementById('btnEasyPublish'),
    btnEasyShare: document.getElementById('btnEasyShare'),
    btnEasyHelp: document.getElementById('btnEasyHelp'),
    densityControl: document.getElementById('densityControl'),
    viewLayoutControl: document.getElementById('viewLayoutControl'),
    screensDensityControl: document.getElementById('screensDensityControl'),
    compactHint: document.getElementById('compactHint'),
    resumeScreenModal: document.getElementById('resumeScreenModal'),
    resumeScreenText: document.getElementById('resumeScreenText'),
    btnAcceptResumeScreen: document.getElementById('btnAcceptResumeScreen'),
    btnSoundToggle: document.getElementById('btnSoundToggle'),
    soundIconOn: document.getElementById('soundIconOn'),
    soundIconOff: document.getElementById('soundIconOff'),
    btnNotifications: document.getElementById('btnNotifications'),
    notifBadge: document.getElementById('notifBadge'),
    btnTeacherMode: document.getElementById('btnTeacherMode'),
    teacherBtnLabel: document.getElementById('teacherBtnLabel'),
    btnTeacherQuickTask: document.getElementById('btnTeacherQuickTask'),
    btnTeacherNewPost: document.getElementById('btnTeacherNewPost'),
    topTeacherNameDisplay: document.getElementById('topTeacherNameDisplay'),
    btnStudentMenu: document.getElementById('btnStudentMenu'),
    btnTeacherMenu: document.getElementById('btnTeacherMenu'),
    topbarClockWidget: document.getElementById('topbarClockWidget'),
    topbarClockDigits: document.getElementById('topbarClockDigits'),
    topbarSessionDuration: document.getElementById('topbarSessionDuration'),
    menuBackdropOverlay: document.getElementById('menuBackdropOverlay'),
    studentActionMenu: document.getElementById('studentActionMenu'),
    teacherActionMenu: document.getElementById('teacherActionMenu'),
    studentMenuNameDisplay: document.getElementById('studentMenuNameDisplay'),
    teacherMenuNameDisplay: document.getElementById('teacherMenuNameDisplay'),
    btnStudentMenuEditName: document.getElementById('btnStudentMenuEditName'),
    btnTeacherMenuSettings: document.getElementById('btnTeacherMenuSettings'),
    studentMenuSoundState: document.getElementById('studentMenuSoundState'),
    studentMenuUiState: document.getElementById('studentMenuUiState'),

    // Student Menu Items
    menuItemStudentPost: document.getElementById('menuItemStudentPost'),
    menuItemStudentScreen: document.getElementById('menuItemStudentScreen'),
    menuItemStudentTasks: document.getElementById('menuItemStudentTasks'),
    menuItemStudentQuiz: document.getElementById('menuItemStudentQuiz'),
    menuItemStudentSessions: document.getElementById('menuItemStudentSessions'),
    menuItemStudentNetwork: document.getElementById('menuItemStudentNetwork'),
    menuItemStudentHelp: document.getElementById('menuItemStudentHelp'),
    menuItemStudentSound: document.getElementById('menuItemStudentSound'),
    menuItemStudentUiMode: document.getElementById('menuItemStudentUiMode'),
    menuItemStudentChat: document.getElementById('menuItemStudentChat'),
    menuItemStudentSwitchRole: document.getElementById('menuItemStudentSwitchRole'),
    menuItemStudentDev: document.getElementById('menuItemStudentDev'),
    menuItemTeacherLogin: document.getElementById('menuItemTeacherLogin'),

    // Teacher Menu Items
    menuItemTeacherTask: document.getElementById('menuItemTeacherTask'),
    menuItemTeacherQuizzes: document.getElementById('menuItemTeacherQuizzes'),
    menuItemTeacherNotify: document.getElementById('menuItemTeacherNotify'),
    menuItemTeacherTimers: document.getElementById('menuItemTeacherTimers'),
    menuItemTeacherSessions: document.getElementById('menuItemTeacherSessions'),
    menuItemTeacherScreens: document.getElementById('menuItemTeacherScreens'),
    menuItemTeacherPost: document.getElementById('menuItemTeacherPost'),
    menuItemTeacherCleanBoard: document.getElementById('menuItemTeacherCleanBoard'),
    menuItemTeacherChat: document.getElementById('menuItemTeacherChat'),
    menuItemTeacherSwitchRole: document.getElementById('menuItemTeacherSwitchRole'),
    menuItemTeacherSettings: document.getElementById('menuItemTeacherSettings'),
    menuItemTeacherNetwork: document.getElementById('menuItemTeacherNetwork'),
    menuItemTeacherDev: document.getElementById('menuItemTeacherDev'),
    menuItemTeacherLogout: document.getElementById('menuItemTeacherLogout'),

    // Teacher Settings Modal
    teacherSettingsModal: document.getElementById('teacherSettingsModal'),
    teacherSettingsForm: document.getElementById('teacherSettingsForm'),
    settingsTeacherName: document.getElementById('settingsTeacherName'),
    settingsCurrentPin: document.getElementById('settingsCurrentPin'),
    settingsNewPin: document.getElementById('settingsNewPin'),
    settingsConfirmPin: document.getElementById('settingsConfirmPin'),
    teacherSettingsError: document.getElementById('teacherSettingsError'),

    // Teacher Login input for teacher name
    inputTeacherName: document.getElementById('inputTeacherName'),

    // Topbar & Floating Chat Buttons & Badges
    btnOpenChat: document.getElementById('btnOpenChat'),
    chatUnreadBadge: document.getElementById('chatUnreadBadge'),
    fabChat: document.getElementById('fabChat'),
    fabChatBadge: document.getElementById('fabChatBadge'),

    // Live Session Chat Drawer Elements
    chatDrawerBackdrop: document.getElementById('chatDrawerBackdrop'),
    chatDrawer: document.getElementById('chatDrawer'),
    chatSessionBadge: document.getElementById('chatSessionBadge'),
    chatPresenceInfo: document.getElementById('chatPresenceInfo'),
    chatCurrentUserName: document.getElementById('chatCurrentUserName'),
    btnChatEditMyNick: document.getElementById('btnChatEditMyNick'),
    btnToggleChatSoundGlobal: document.getElementById('btnToggleChatSoundGlobal'),
    btnToggleMuteCurrentThread: document.getElementById('btnToggleMuteCurrentThread'),
    chatThreadBanner: document.getElementById('chatThreadBanner'),
    chatThreadIcon: document.getElementById('chatThreadIcon'),
    chatThreadTitle: document.getElementById('chatThreadTitle'),
    chatThreadBadge: document.getElementById('chatThreadBadge'),
    btnClearChat: document.getElementById('btnClearChat'),
    btnCloseChat: document.getElementById('btnCloseChat'),
    tabChatMessages: document.getElementById('tabChatMessages'),
    tabChatUnreadBadge: document.getElementById('tabChatUnreadBadge'),
    tabChatUsers: document.getElementById('tabChatUsers'),
    chatOnlineUsersCount: document.getElementById('chatOnlineUsersCount'),
    chatMessagesPane: document.getElementById('chatMessagesPane'),
    chatConversationsListView: document.getElementById('chatConversationsListView'),
    chatConversationsList: document.getElementById('chatConversationsList'),
    btnChatGoToOnline: document.getElementById('btnChatGoToOnline'),
    chatThreadView: document.getElementById('chatThreadView'),
    btnBackToConvList: document.getElementById('btnBackToConvList'),
    chatRecipientSelect: document.getElementById('chatRecipientSelect'),
    chatPrivacyNote: document.getElementById('chatPrivacyNote'),
    chatMessagesList: document.getElementById('chatMessagesList'),
    chatImagePreviewRow: document.getElementById('chatImagePreviewRow'),
    chatImagePreviewThumb: document.getElementById('chatImagePreviewThumb'),
    chatImagePreviewName: document.getElementById('chatImagePreviewName'),
    btnCancelChatImage: document.getElementById('btnCancelChatImage'),
    chatFileInput: document.getElementById('chatFileInput'),
    btnChatAttachImage: document.getElementById('btnChatAttachImage'),
    btnChatEmoji: document.getElementById('btnChatEmoji'),
    chatEmojiPicker: document.getElementById('chatEmojiPicker'),
    btnCloseEmojiPicker: document.getElementById('btnCloseEmojiPicker'),
    chatEmojiGrid: document.getElementById('chatEmojiGrid'),
    chatForm: document.getElementById('chatForm'),
    chatInputText: document.getElementById('chatInputText'),
    btnSendChat: document.getElementById('btnSendChat'),
    chatUsersPane: document.getElementById('chatUsersPane'),
    chatUsersList: document.getElementById('chatUsersList'),

    // Modal: Welcome & Role Selection
    welcomeRoleModal: document.getElementById('welcomeRoleModal'),
    btnCloseWelcomeModal: document.getElementById('btnCloseWelcomeModal'),
    welcomeStudentForm: document.getElementById('welcomeStudentForm'),
    welcomeStudentName: document.getElementById('welcomeStudentName'),
    welcomeStudentSessionSelect: document.getElementById('welcomeStudentSessionSelect'),
    btnEnterAsStudent: document.getElementById('btnEnterAsStudent'),
    welcomeTeacherForm: document.getElementById('welcomeTeacherForm'),
    welcomeTeacherName: document.getElementById('welcomeTeacherName'),
    welcomeTeacherPin: document.getElementById('welcomeTeacherPin'),
    welcomeTeacherError: document.getElementById('welcomeTeacherError'),
    btnEnterAsTeacher: document.getElementById('btnEnterAsTeacher'),
    btnWelcomeAboutDev: document.getElementById('btnWelcomeAboutDev'),

    btnNetworkInfo: document.getElementById('btnNetworkInfo'),
    btnOpenScreenModal: document.getElementById('btnOpenScreenModal'),
    btnNewPost: document.getElementById('btnNewPost'),
    fabNewPost: document.getElementById('fabNewPost'),
    screenShareModalTitle: document.getElementById('screenShareModalTitle'),
    httpsBanner: document.getElementById('httpsBanner'),
    httpsBannerText: document.getElementById('httpsBannerText'),
    bannerBatLink: document.getElementById('bannerBatLink'),
    bannerMobileCertBtn: document.getElementById('bannerMobileCertBtn'),
    httpsSwitchLink: document.getElementById('httpsSwitchLink'),
    btnDismissHttpsBanner: document.getElementById('btnDismissHttpsBanner'),

    // Session Status Banner & Session Picker Modal
    sessionStatusBanner: document.getElementById('sessionStatusBanner'),
    sessionStatusText: document.getElementById('sessionStatusText'),
    sessionStatusActions: document.getElementById('sessionStatusActions'),
    sessionPickerModal: document.getElementById('sessionPickerModal'),
    sessionPickerTitle: document.getElementById('sessionPickerTitle'),
    sessionPickerIntro: document.getElementById('sessionPickerIntro'),
    sessionPickerList: document.getElementById('sessionPickerList'),
    btnCloseSessionPicker: document.getElementById('btnCloseSessionPicker'),
    btnPickerTeacherLogin: document.getElementById('btnPickerTeacherLogin'),
    btnPickerManageSessions: document.getElementById('btnPickerManageSessions'),

    // Classroom Timer & Scheduled Bar
    classroomBar: document.getElementById('classroomBar'),
    activeTimerBanner: document.getElementById('activeTimerBanner'),
    timerKindBadge: document.getElementById('timerKindBadge'),
    timerLabelText: document.getElementById('timerLabelText'),
    timerMessageText: document.getElementById('timerMessageText'),
    timerDigits: document.getElementById('timerDigits'),
    timerReturnText: document.getElementById('timerReturnText'),
    timerProgressFill: document.getElementById('timerProgressFill'),
    btnTimerProjector: document.getElementById('btnTimerProjector'),
    timerTeacherControls: document.getElementById('timerTeacherControls'),
    btnTimerPauseResume: document.getElementById('btnTimerPauseResume'),
    btnTimerExtend: document.getElementById('btnTimerExtend'),
    btnTimerStop: document.getElementById('btnTimerStop'),
    scheduledTimersStrip: document.getElementById('scheduledTimersStrip'),

    // Projector Overlay
    timerProjectorModal: document.getElementById('timerProjectorModal'),
    btnCloseProjector: document.getElementById('btnCloseProjector'),
    projectorKindBadge: document.getElementById('projectorKindBadge'),
    projectorLabel: document.getElementById('projectorLabel'),
    projectorDigits: document.getElementById('projectorDigits'),
    projectorMessage: document.getElementById('projectorMessage'),
    projectorReturn: document.getElementById('projectorReturn'),
    projectorProgressFill: document.getElementById('projectorProgressFill'),

    // Compact Click-to-Grow Tasks Strip
    assignmentSection: document.getElementById('assignmentSection'),
    tasksMiniGrid: document.getElementById('tasksMiniGrid'),
    assignmentExpandedCard: document.getElementById('assignmentExpandedCard'),
    assignmentExpandedBadge: document.getElementById('assignmentExpandedBadge'),
    assignmentTitle: document.getElementById('assignmentTitle'),
    assignmentDue: document.getElementById('assignmentDue'),
    assignmentMeta: document.getElementById('assignmentMeta'),
    btnEditAssignmentInline: document.getElementById('btnEditAssignmentInline'),
    btnToggleAssignment: document.getElementById('btnToggleAssignment'),
    assignmentBody: document.getElementById('assignmentBody'),
    assignmentInstructions: document.getElementById('assignmentInstructions'),
    assignmentImageWrap: document.getElementById('assignmentImageWrap'),
    assignmentImage: document.getElementById('assignmentImage'),
    btnCopyAssignment: document.getElementById('btnCopyAssignment'),
    btnRespondAssignment: document.getElementById('btnRespondAssignment'),
    expandedTaskTeacherActions: document.getElementById('expandedTaskTeacherActions'),
    btnEditExpandedTask: document.getElementById('btnEditExpandedTask'),
    btnToggleHideExpandedTask: document.getElementById('btnToggleHideExpandedTask'),
    btnDeleteExpandedTask: document.getElementById('btnDeleteExpandedTask'),

    // Workspace Tabs (Padlets vs Pantallas y Cola)
    workspaceTabs: document.getElementById('workspaceTabs'),
    tabPadletsCount: document.getElementById('tabPadletsCount'),
    tabScreensLiveBadge: document.getElementById('tabScreensLiveBadge'),
    tabQueueBadge: document.getElementById('tabQueueBadge'),
    padletsSection: document.getElementById('padletsSection'),
    screensSection: document.getElementById('screensSection'),

    // Screens & Queue Panel
    queueCountLabel: document.getElementById('queueCountLabel'),
    btnQueueJoinQuick: document.getElementById('btnQueueJoinQuick'),
    btnClearQueue: document.getElementById('btnClearQueue'),
    screenQueueList: document.getElementById('screenQueueList'),
    screensCountLabel: document.getElementById('screensCountLabel'),
    btnShareScreenFromTab: document.getElementById('btnShareScreenFromTab'),
    screensEmptyState: document.getElementById('screensEmptyState'),
    btnScreensEmptyShare: document.getElementById('btnScreensEmptyShare'),
    screensGrid: document.getElementById('screensGrid'),

    // Simple Screen Share Modal (Name + Reason ONLY)
    screenShareModal: document.getElementById('screenShareModal'),
    screenShareForm: document.getElementById('screenShareForm'),
    screenAuthorInput: document.getElementById('screenAuthorInput'),
    screenReasonInput: document.getElementById('screenReasonInput'),
    screenModalError: document.getElementById('screenModalError'),
    btnJoinScreenQueue: document.getElementById('btnJoinScreenQueue'),
    btnStartScreenDirect: document.getElementById('btnStartScreenDirect'),

    // Announcements & Notifications
    announcementStack: document.getElementById('announcementStack'),
    notificationsModal: document.getElementById('notificationsModal'),
    notificationsList: document.getElementById('notificationsList'),
    btnEnableBrowserNotif: document.getElementById('btnEnableBrowserNotif'),

    // Teacher Login & Control Panel
    teacherLoginModal: document.getElementById('teacherLoginModal'),
    teacherLoginForm: document.getElementById('teacherLoginForm'),
    inputTeacherPin: document.getElementById('inputTeacherPin'),
    teacherLoginError: document.getElementById('teacherLoginError'),

    teacherPanelModal: document.getElementById('teacherPanelModal'),
    btnTeacherLogout: document.getElementById('btnTeacherLogout'),
    assignmentForm: document.getElementById('assignmentForm'),
    taskTitleInput: document.getElementById('taskTitleInput'),
    taskDueInput: document.getElementById('taskDueInput'),
    taskInstructionsInput: document.getElementById('taskInstructionsInput'),
    taskImageDropzone: document.getElementById('taskImageDropzone'),
    taskImageInput: document.getElementById('taskImageInput'),
    taskDropzonePlaceholder: document.getElementById('taskDropzonePlaceholder'),
    taskImagePreviewBox: document.getElementById('taskImagePreviewBox'),
    taskImagePreview: document.getElementById('taskImagePreview'),
    btnRemoveTaskImage: document.getElementById('btnRemoveTaskImage'),
    taskPinnedCheck: document.getElementById('taskPinnedCheck'),
    taskNotifyCheck: document.getElementById('taskNotifyCheck'),
    btnClearAssignment: document.getElementById('btnClearAssignment'),
    btnSaveAssignment: document.getElementById('btnSaveAssignment'),
    assignmentModeBadge: document.getElementById('assignmentModeBadge'),
    assignmentModeHint: document.getElementById('assignmentModeHint'),
    btnNewAssignment: document.getElementById('btnNewAssignment'),
    btnLoadActiveAssignment: document.getElementById('btnLoadActiveAssignment'),
    btnResetTaskForm: document.getElementById('btnResetTaskForm'),
    assignmentHistoryBox: document.getElementById('assignmentHistoryBox'),
    assignmentHistoryList: document.getElementById('assignmentHistoryList'),

    notifyForm: document.getElementById('notifyForm'),
    notifyTitleInput: document.getElementById('notifyTitleInput'),
    notifyTypeSelect: document.getElementById('notifyTypeSelect'),
    notifyMessageInput: document.getElementById('notifyMessageInput'),
    notifySoundCheck: document.getElementById('notifySoundCheck'),

    timerKindSelect: document.getElementById('timerKindSelect'),
    timerLabelInput: document.getElementById('timerLabelInput'),
    timerMessageInput: document.getElementById('timerMessageInput'),
    timerDurationInput: document.getElementById('timerDurationInput'),
    timerStartNotifyCheck: document.getElementById('timerStartNotifyCheck'),
    btnStartTimerNow: document.getElementById('btnStartTimerNow'),
    scheduleTimeInput: document.getElementById('scheduleTimeInput'),
    scheduleDurationInput: document.getElementById('scheduleDurationInput'),
    scheduleNotifyCheck: document.getElementById('scheduleNotifyCheck'),
    btnScheduleTimer: document.getElementById('btnScheduleTimer'),
    teacherScheduledListBox: document.getElementById('teacherScheduledListBox'),
    teacherScheduledList: document.getElementById('teacherScheduledList'),

    // Teacher Sessions & Clean/Reset Tab
    createSessionForm: document.getElementById('createSessionForm'),
    newSessionNameInput: document.getElementById('newSessionNameInput'),
    newSessionDescInput: document.getElementById('newSessionDescInput'),
    newSessionPublishCheck: document.getElementById('newSessionPublishCheck'),
    newSessionHideStudentsCheck: document.getElementById('newSessionHideStudentsCheck'),
    newSessionActivateCheck: document.getElementById('newSessionActivateCheck'),
    btnCreateSession: document.getElementById('btnCreateSession'),
    sessionsCountNum: document.getElementById('sessionsCountNum'),
    sessionsList: document.getElementById('sessionsList'),
    btnClearSessionPosts: document.getElementById('btnClearSessionPosts'),
    btnResetSessionFull: document.getElementById('btnResetSessionFull'),

    // Board & Toolbar
    topicBar: document.getElementById('topicBar'),
    postCounter: document.getElementById('postCounter'),
    btnUserChip: document.getElementById('btnUserChip'),
    userChipAvatar: document.getElementById('userChipAvatar'),
    userChipName: document.getElementById('userChipName'),
    emptyState: document.getElementById('emptyState'),
    btnEmptyCreate: document.getElementById('btnEmptyCreate'),
    btnEmptyShare: document.getElementById('btnEmptyShare'),
    boardGrid: document.getElementById('boardGrid'),

    // Composer modal
    composerModal: document.getElementById('composerModal'),
    composerTitle: document.getElementById('composerTitle'),
    composerForm: document.getElementById('composerForm'),
    editPostId: document.getElementById('editPostId'),
    inputAuthor: document.getElementById('inputAuthor'),
    inputTopic: document.getElementById('inputTopic'),
    topicSuggestions: document.getElementById('topicSuggestions'),
    inputContent: document.getElementById('inputContent'),
    imageDropzone: document.getElementById('imageDropzone'),
    inputImage: document.getElementById('inputImage'),
    dropzonePlaceholder: document.getElementById('dropzonePlaceholder'),
    imagePreviewBox: document.getElementById('imagePreviewBox'),
    imagePreview: document.getElementById('imagePreview'),
    btnRemoveImage: document.getElementById('btnRemoveImage'),
    colorPicker: document.getElementById('colorPicker'),
    composerError: document.getElementById('composerError'),
    btnSubmitPost: document.getElementById('btnSubmitPost'),

    // Network modal
    networkModal: document.getElementById('networkModal'),
    qrCodeImg: document.getElementById('qrCodeImg'),
    lanHttpsUrl: document.getElementById('lanHttpsUrl'),
    lanHttpUrl: document.getElementById('lanHttpUrl'),
    otherInterfacesBox: document.getElementById('otherInterfacesBox'),
    otherInterfacesList: document.getElementById('otherInterfacesList'),

    // HTTPS required modal
    httpsRequiredModal: document.getElementById('httpsRequiredModal'),
    httpsRequiredModalTitle: document.getElementById('httpsRequiredModalTitle'),
    httpsRequiredDesc: document.getElementById('httpsRequiredDesc'),
    httpsRequiredUrl: document.getElementById('httpsRequiredUrl'),
    httpsRequiredGoBtn: document.getElementById('httpsRequiredGoBtn'),
    desktopCertActions: document.getElementById('desktopCertActions'),
    mobileCertActions: document.getElementById('mobileCertActions'),
    btnOpenMobileCertGuide: document.getElementById('btnOpenMobileCertGuide'),

    // Mobile Cert Modal
    mobileCertModal: document.getElementById('mobileCertModal'),
    mobileCertModalTitle: document.getElementById('mobileCertModalTitle'),
    mobileDetectedBadge: document.getElementById('mobileDetectedBadge'),
    btnGoHttpsDirectMobile: document.getElementById('btnGoHttpsDirectMobile'),

    // Screen Share Modal Elements
    screenSourceSelectorGroup: document.getElementById('screenSourceSelectorGroup'),
    optSourceCamera: document.getElementById('optSourceCamera'),
    optSourceScreen: document.getElementById('optSourceScreen'),
    cameraFacingRow: document.getElementById('cameraFacingRow'),
    cameraFacingSelect: document.getElementById('cameraFacingSelect'),
    btnUploadScreenCapture: document.getElementById('btnUploadScreenCapture'),

    // Board edit modal & Branding
    boardEditModal: document.getElementById('boardEditModal'),
    boardEditForm: document.getElementById('boardEditForm'),
    inputBoardInstitution: document.getElementById('inputBoardInstitution'),
    inputBoardLogo: document.getElementById('inputBoardLogo'),
    inputBoardTitle: document.getElementById('inputBoardTitle'),
    inputBoardDesc: document.getElementById('inputBoardDesc'),
    institutionLogoBox: document.getElementById('institutionLogoBox'),
    institutionLogoImg: document.getElementById('institutionLogoImg'),
    institutionLogoDefault: document.getElementById('institutionLogoDefault'),
    institutionNameDisplay: document.getElementById('institutionNameDisplay'),
    eventNameDisplay: document.getElementById('eventNameDisplay'),
    activeSessionNameText: document.getElementById('activeSessionNameText'),
    btnScrollScreensLeft: document.getElementById('btnScrollScreensLeft'),
    btnScrollScreensRight: document.getElementById('btnScrollScreensRight'),
    menuItemTeacherEditBoard: document.getElementById('menuItemTeacherEditBoard'),

    // Quick name modal
    nameModal: document.getElementById('nameModal'),
    nameForm: document.getElementById('nameForm'),
    inputQuickName: document.getElementById('inputQuickName'),

    // Lightbox
    lightboxModal: document.getElementById('lightboxModal'),
    lightboxImg: document.getElementById('lightboxImg'),
    lightboxCaption: document.getElementById('lightboxCaption'),
    lightboxClose: document.getElementById('lightboxClose'),

    // Developer info & updates (CoDevNexus)
    btnAboutDev: document.getElementById('btnAboutDev'),
    aboutDevModal: document.getElementById('aboutDevModal'),
    devContactBadge: document.getElementById('devContactBadge'),
    btnOpenDevInfo: document.getElementById('btnOpenDevInfo'),
    btnCheckUpdates: document.getElementById('btnCheckUpdates'),
    updatesResultBox: document.getElementById('updatesResultBox'),
    appCurrentVersionBadge: document.getElementById('appCurrentVersionBadge'),

    // Centered Post Detail Modal
    postDetailModal: document.getElementById('postDetailModal'),
    postDetailAvatar: document.getElementById('postDetailAvatar'),
    postDetailAuthor: document.getElementById('postDetailAuthor'),
    postDetailRoleBadge: document.getElementById('postDetailRoleBadge'),
    postDetailTime: document.getElementById('postDetailTime'),
    postDetailBadges: document.getElementById('postDetailBadges'),
    postDetailTopic: document.getElementById('postDetailTopic'),
    postDetailImageWrap: document.getElementById('postDetailImageWrap'),
    postDetailImage: document.getElementById('postDetailImage'),
    postDetailContent: document.getElementById('postDetailContent'),
    postDetailCommentsWrap: document.getElementById('postDetailCommentsWrap'),
    btnDownloadPostText: document.getElementById('btnDownloadPostText'),
    btnDownloadPostImage: document.getElementById('btnDownloadPostImage'),

    // Screen audience selector
    optAudienceAll: document.getElementById('optAudienceAll'),
    optAudienceTeacher: document.getElementById('optAudienceTeacher'),
    optAudienceCustom: document.getElementById('optAudienceCustom'),
    screenTargetUsersBox: document.getElementById('screenTargetUsersBox'),
    screenTargetUsersList: document.getElementById('screenTargetUsersList'),

    // Screens Search
    screenSearchInput: document.getElementById('screenSearchInput'),

    // Composer Assignment Linking
    composerAssignmentRefBox: document.getElementById('composerAssignmentRefBox'),
    composerAssignmentRefTitle: document.getElementById('composerAssignmentRefTitle'),
    composerAssignmentId: document.getElementById('composerAssignmentId'),
    composerAssignmentTitle: document.getElementById('composerAssignmentTitle'),
    btnRemoveAssignmentRef: document.getElementById('btnRemoveAssignmentRef'),

    // Assignment Clean / Unpublish Modal
    assignmentCleanModal: document.getElementById('assignmentCleanModal'),
    cleanModalResponsesCount: document.getElementById('cleanModalResponsesCount'),
    btnCleanHideResponses: document.getElementById('btnCleanHideResponses'),
    btnCleanKeepResponses: document.getElementById('btnCleanKeepResponses'),
    btnCleanDeleteResponses: document.getElementById('btnCleanDeleteResponses'),

    // Cloudflare Tunnel
    tunnelStatusBadge: document.getElementById('tunnelStatusBadge'),
    tunnelActiveBox: document.getElementById('tunnelActiveBox'),
    inputTunnelUrl: document.getElementById('inputTunnelUrl'),
    btnCopyTunnelUrl: document.getElementById('btnCopyTunnelUrl'),
    imgTunnelQr: document.getElementById('imgTunnelQr'),
    tunnelErrorBox: document.getElementById('tunnelErrorBox'),
    btnToggleTunnel: document.getElementById('btnToggleTunnel'),

    // Student Management (Expulsar / Deshabilitar)
    menuItemTeacherStudents: document.getElementById('menuItemTeacherStudents'),
    btnRefreshStudentsList: document.getElementById('btnRefreshStudentsList'),
    inputSearchStudents: document.getElementById('inputSearchStudents'),
    teacherStudentsList: document.getElementById('teacherStudentsList'),
    studentDisabledBanner: document.getElementById('studentDisabledBanner'),
    studentKickedModal: document.getElementById('studentKickedModal'),
    studentKickedReason: document.getElementById('studentKickedReason'),
    btnKickedChooseSession: document.getElementById('btnKickedChooseSession'),
    btnKickedReload: document.getElementById('btnKickedReload'),
    postDetailTeacherActions: document.getElementById('postDetailTeacherActions'),
    btnDetailToggleDisable: document.getElementById('btnDetailToggleDisable'),
    btnDetailKick: document.getElementById('btnDetailKick'),

    toastContainer: document.getElementById('toastContainer'),
  };

  // --- Toast Helper ---
  function showToast(message, type = 'info', onClick = null) {
    const toast = document.createElement('div');
    toast.className = `toast ${type} ${typeof onClick === 'function' ? 'is-clickable' : ''}`;
    if (typeof message === 'string') {
      toast.innerHTML = message;
    } else if (message instanceof HTMLElement) {
      toast.appendChild(message);
    }
    if (typeof onClick === 'function') {
      toast.title = 'Haz clic para abrir este mensaje en el chat';
      toast.addEventListener('click', () => {
        onClick();
        toast.remove();
      });
    }
    el.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.25s ease';
      setTimeout(() => toast.remove(), 260);
    }, 4500);
  }

  // --- Modal Helpers ---
  function openModal(modalEl) {
    modalEl.classList.remove('hidden');
  }

  function closeModal(modalEl) {
    modalEl.classList.add('hidden');
  }

  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.closeModal);
      if (!target) return;
      if (target === el.sessionPickerModal) {
        if (!state.activeSessionId) return;
        state.hasChosenSession = true;
      }
      if (target === el.welcomeRoleModal) {
        if (!sessionStorage.getItem(STORAGE_ROLE_KEY) && !state.hasChosenSession) return;
      }
      closeModal(target);
    });
  });

  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        if (backdrop === el.sessionPickerModal) {
          if (!state.activeSessionId) return;
          state.hasChosenSession = true;
        }
        if (backdrop === el.welcomeRoleModal) {
          if (!sessionStorage.getItem(STORAGE_ROLE_KEY) && !state.hasChosenSession) return;
        }
        closeModal(backdrop);
      }
    });
  });

  // --- Sound Toggle UI ---
  function updateSoundUI() {
    el.soundIconOn?.classList.toggle('hidden', !state.soundEnabled);
    el.soundIconOff?.classList.toggle('hidden', state.soundEnabled);
    if (el.btnSoundToggle) {
      el.btnSoundToggle.title = state.soundEnabled
        ? 'Sonido de notificaciones activado (clic para silenciar)'
        : 'Sonido silenciado (clic para activar)';
    }
    updateGlobalChatSoundUI();
  }

  el.btnSoundToggle.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem(STORAGE_SOUND_KEY, String(state.soundEnabled));
    updateSoundUI();
    if (state.soundEnabled) playChime('info');
  });
  updateSoundUI();

  // --- User Identity UI ---
  function updateUserChipUI() {
    if (authorName) {
      el.userChipName.textContent = authorName;
      el.userChipAvatar.textContent = getInitials(authorName);
      el.userChipAvatar.style.background = getAvatarColor(authorId);
      el.userChipAvatar.style.color = '#fff';
    } else {
      el.userChipName.textContent = 'Definir nombre';
      el.userChipAvatar.textContent = '?';
      el.userChipAvatar.style.background = '';
      el.userChipAvatar.style.color = '';
    }
  }

  function setAuthorName(name, broadcast = true) {
    const clean = String(name || '').trim().slice(0, 50);
    if (!clean) return;
    const oldName = authorName;
    authorName = clean;
    localStorage.setItem(STORAGE_NAME_KEY, authorName);
    updateUserChipUI();
    updateStudentMenuUI();
    if (el.chatCurrentUserName) {
      el.chatCurrentUserName.textContent = authorName;
    }
    if (el.inputAuthor && !el.inputAuthor.value) el.inputAuthor.value = authorName;
    if (el.screenAuthorInput && !el.screenAuthorInput.value) el.screenAuthorInput.value = authorName;

    if (broadcast && oldName !== clean && socket && socket.connected) {
      socket.emit('client:name-change', {
        authorId,
        newName: clean,
        isTeacher: state.isTeacher,
        teacherToken: state.teacherToken,
      });
      socket.emit('client:register', {
        authorId,
        authorName: clean,
        teacherToken: state.teacherToken,
        teacherName: state.isTeacher ? clean : state.teacherName,
      });
    }
  }

  async function promptChangeNick() {
    const currentName = state.isTeacher ? (state.teacherName || 'Docente') : (authorName || 'Alumno');
    const res = await Swal.prompt(
      '✏️ Cambiar mi nombre / apodo',
      state.isTeacher
        ? 'Ingresa tu nombre o título como docente para la clase. Se actualizará en el encabezado, chat y publicaciones:'
        : 'Ingresa tu nuevo nombre o apodo para la clase. Tus mensajes, publicaciones y en la lista de conectados se actualizarán de inmediato manteniendo tu identidad:',
      {
        inputValue: currentName,
        inputPlaceholder: state.isTeacher ? 'Ej. Prof. García, Lic. María, etc.' : 'Ej. Juan Pérez, María G., etc.',
        confirmButtonText: 'Guardar nombre',
        confirmButtonColor: '#6366f1',
      }
    );
    if (!res || !res.trim()) return;
    const newNick = res.trim().slice(0, 50);
    if (newNick === currentName) return;

    if (state.isTeacher) {
      state.teacherName = newNick;
      localStorage.setItem(STORAGE_TEACHER_NAME_KEY, newNick);
      updateTeacherMenuUI();
      if (el.chatCurrentUserName) el.chatCurrentUserName.textContent = newNick;
      if (socket && socket.connected) {
        socket.emit('client:name-change', {
          authorId: getEffectiveAuthorId(),
          newName: newNick,
          isTeacher: true,
          teacherToken: state.teacherToken,
        });
        socket.emit('client:register', {
          authorId: getEffectiveAuthorId(),
          authorName: newNick,
          isTeacher: true,
          teacherToken: state.teacherToken,
          teacherName: newNick,
        });
      }
      showToast(`Nombre de docente actualizado a: "${newNick}"`, 'success');
    } else {
      setAuthorName(newNick, true);
      showToast(`Tu nombre se actualizó a: "${newNick}"`, 'success');
    }
    renderChatUsers(state.chatUsers);
    renderConversationsList();
  }

  updateUserChipUI();

  // --- Role & Action Menus Helpers ---
  function updateStudentMenuUI() {
    if (el.studentMenuNameDisplay) {
      el.studentMenuNameDisplay.textContent = authorName || 'Sin nombre definido';
    }
    if (el.studentMenuSoundState) {
      el.studentMenuSoundState.textContent = state.soundEnabled ? 'Activado (clic para silenciar)' : 'Silenciado (clic para activar)';
    }
    if (el.studentMenuUiState) {
      el.studentMenuUiState.textContent = state.uiMode === 'easy' ? 'Modo Fácil (clic para cambiar)' : 'Modo Completo (clic para cambiar)';
    }
  }

  function updateTeacherMenuUI() {
    const name = state.teacherName || 'Docente';
    if (el.topTeacherNameDisplay) el.topTeacherNameDisplay.textContent = name;
    if (el.teacherMenuNameDisplay) el.teacherMenuNameDisplay.textContent = name;
    if (el.inputTeacherName && !el.inputTeacherName.value) el.inputTeacherName.value = name;
    if (el.settingsTeacherName) el.settingsTeacherName.value = name;
  }

  function closeActionMenus() {
    if (el.studentActionMenu) el.studentActionMenu.classList.add('hidden');
    if (el.teacherActionMenu) el.teacherActionMenu.classList.add('hidden');
    if (el.menuBackdropOverlay) el.menuBackdropOverlay.classList.add('hidden');
    el.btnStudentMenu?.setAttribute('aria-expanded', 'false');
    el.btnTeacherMenu?.setAttribute('aria-expanded', 'false');
  }

  function openActionMenu(menuEl, triggerBtn) {
    closeActionMenus();
    if (!menuEl) return;
    menuEl.classList.remove('hidden');
    if (el.menuBackdropOverlay) el.menuBackdropOverlay.classList.remove('hidden');
    triggerBtn?.setAttribute('aria-expanded', 'true');
  }

  // --- Teacher Mode Auth & UI ---
  function updateTeacherUI() {
    // Set strict role classes on body for CSS isolation
    document.body.classList.toggle('role-teacher', state.isTeacher);
    document.body.classList.toggle('role-student', !state.isTeacher);

    updateTeacherMenuUI();
    updateStudentMenuUI();
    closeActionMenus();

    el.btnTeacherMode.classList.toggle('teacher-unlocked', state.isTeacher);
    el.teacherBtnLabel.textContent = state.isTeacher ? 'Panel Docente' : 'Docente';
    el.btnEditAssignmentInline.classList.toggle('hidden', !state.isTeacher);
    el.timerTeacherControls.classList.toggle('hidden', !state.isTeacher);

    // Point dedicated HTML Manual icon to the matching manual (Teacher vs User)
    el.btnOpenManual.href = state.isTeacher ? '/manual-profesor.html' : '/manual-usuarios.html';
    el.btnOpenManual.title = state.isTeacher
      ? 'Abrir Manual del Profesor (HTML)'
      : 'Abrir Manual de Usuarios (HTML)';
    el.btnOpenManual.classList.toggle('is-teacher-manual', state.isTeacher);

    renderSessionStatusBanner();
    renderSessionsUI();
    renderSessionPickerList();
    renderScheduledTimersUI();
    renderScreenQueue();
    renderTopicBar();
    if (window.PadletQuiz) {
      window.PadletQuiz.onTeacherChanged(state.isTeacher);
    }
    // Refresh cards to show/hide teacher pin/review/screen controls without killing streams
    state.posts.forEach((p) => {
      const cardEl = document.querySelector(`.card[data-post-id="${CSS.escape(p.id)}"]`);
      if (cardEl) patchCardInPlace(cardEl, p);
    });
  }

  async function verifySavedTeacherToken() {
    if (!state.teacherToken) return;
    try {
      const res = await fetch('/api/teacher/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: state.teacherToken }),
      });
      const data = await res.json();
      if (data.valid) {
        state.isTeacher = true;
      } else {
        state.teacherToken = '';
        state.isTeacher = false;
        sessionStorage.removeItem(STORAGE_TEACHER_TOKEN_KEY);
      }
      authorId = getEffectiveAuthorId();
      if (socket && socket.connected) {
        socket.emit('client:register', {
          authorId,
          authorName: state.isTeacher ? (state.teacherName || 'Docente') : (authorName || 'Alumno'),
          teacherToken: state.teacherToken,
          teacherName: state.teacherName,
        });
      }
      updateTeacherUI();
    } catch {}
  }

  verifySavedTeacherToken();

  function setDefaultScheduleTime() {
    const future = new Date(serverNow() + 10 * 60 * 1000);
    const hh = String(future.getHours()).padStart(2, '0');
    const mm = String(future.getMinutes()).padStart(2, '0');
    el.scheduleTimeInput.value = `${hh}:${mm}`;
  }

  function switchTeacherTab(tabName) {
    state.activeTeacherTab = tabName;
    document.querySelectorAll('.teacher-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.teacherTab === tabName);
    });
    document.querySelectorAll('.teacher-tab-pane').forEach((pane) => {
      pane.classList.toggle('hidden', pane.dataset.teacherPane !== tabName);
    });
    if (tabName === 'timers' && !el.scheduleTimeInput.value) {
      setDefaultScheduleTime();
    }
    if (tabName === 'quizzes' && window.PadletQuiz) {
      window.PadletQuiz.loadTeacherQuizzes();
    }
    if (tabName === 'assignment') {
      updateAssignmentFormHeaderUI();
    }
    if (tabName === 'students') {
      loadTeacherStudents();
    }
  }

  document.querySelectorAll('.teacher-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTeacherTab(btn.dataset.teacherTab));
  });

  function updateAssignmentFormHeaderUI() {
    if (!el.assignmentModeBadge) return;
    const hasActive = Boolean(state.assignment);
    const isEditing = Boolean(state.editingAssignmentId || (state.isEditingActiveAssignment && state.assignment));

    if (el.btnLoadActiveAssignment) {
      el.btnLoadActiveAssignment.classList.toggle('hidden', !hasActive || isEditing);
    }
    if (isEditing) {
      el.assignmentModeBadge.textContent = '✏️ Editando Tarea';
      el.assignmentModeBadge.style.background = '#f59e0b';
      if (el.assignmentModeHint) {
        el.assignmentModeHint.textContent = 'Modificando la tarea seleccionada. Los cambios se actualizarán de inmediato.';
      }
      if (el.btnSaveAssignment) {
        el.btnSaveAssignment.textContent = 'Guardar cambios de tarea';
      }
    } else {
      el.assignmentModeBadge.textContent = '📝 Nueva Tarea';
      el.assignmentModeBadge.style.background = '#4f46e5';
      if (el.assignmentModeHint) {
        el.assignmentModeHint.textContent = 'Formulario limpio para publicar una nueva tarea';
      }
      if (el.btnSaveAssignment) {
        el.btnSaveAssignment.textContent = 'Publicar tarea';
      }
    }
  }

  function resetAssignmentFormToNew() {
    state.isEditingActiveAssignment = false;
    state.editingAssignmentId = null;
    el.taskTitleInput.value = '';
    el.taskDueInput.value = '';
    el.taskInstructionsInput.value = '';
    el.taskInstructionsInput.style.height = '';
    el.taskPinnedCheck.checked = true;
    el.taskNotifyCheck.checked = true;
    state.taskSelectedFile = null;
    state.taskExistingImageUrl = null;
    state.taskExistingImageName = null;
    state.taskRemoveExistingImage = false;
    if (el.taskImageInput) el.taskImageInput.value = '';
    showTaskImagePreview(null);
    updateAssignmentFormHeaderUI();
  }

  function populateAssignmentForm(assignment, { isEditingActive = false, assignmentId = null } = {}) {
    state.isEditingActiveAssignment = Boolean(isEditingActive);
    state.editingAssignmentId = assignmentId || assignment?.id || null;
    el.taskTitleInput.value = assignment?.title || '';
    el.taskDueInput.value = assignment?.dueNote || '';
    el.taskInstructionsInput.value = assignment?.instructions || '';
    autoResizeTextarea(el.taskInstructionsInput);
    el.taskPinnedCheck.checked = assignment ? assignment.pinned !== false : true;
    state.taskSelectedFile = null;
    state.taskExistingImageUrl = assignment?.imageUrl || null;
    state.taskExistingImageName = assignment?.imageName || null;
    state.taskRemoveExistingImage = false;
    if (el.taskImageInput) el.taskImageInput.value = '';
    showTaskImagePreview(assignment?.imageUrl || null);
    updateAssignmentFormHeaderUI();
  }

  function openTeacherPanel(tab = 'assignment', { editActive = false } = {}) {
    if (!state.isTeacher) {
      state.pendingTeacherTab = tab;
      state.pendingEditActive = editActive;
      el.inputTeacherPin.value = '';
      el.teacherLoginError.classList.add('hidden');
      openModal(el.teacherLoginModal);
      el.inputTeacherPin.focus();
      return;
    }
    if (editActive && state.assignment) {
      populateAssignmentForm(state.assignment, { isEditingActive: true });
    } else {
      resetAssignmentFormToNew();
    }
    renderAssignmentHistory();
    renderScheduledTimersUI();
    renderSessionsUI();
    setDefaultScheduleTime();
    switchTeacherTab(tab);
    openModal(el.teacherPanelModal);
  }

  el.btnTeacherMode.addEventListener('click', () =>
    openTeacherPanel(state.activeTeacherTab || 'assignment', { editActive: false })
  );
  el.btnEditAssignmentInline.addEventListener('click', () =>
    openTeacherPanel('assignment', { editActive: true })
  );

  el.teacherLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = el.inputTeacherPin.value.trim();
    if (!pin) return;
    el.teacherLoginError.classList.add('hidden');

    try {
      const res = await fetch('/api/teacher/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        el.teacherLoginError.textContent = data.error || 'PIN incorrecto.';
        el.teacherLoginError.classList.remove('hidden');
        el.inputTeacherPin.select();
        return;
      }

      const enteredName = el.inputTeacherName?.value?.trim();
      if (enteredName) {
        state.teacherName = enteredName;
        localStorage.setItem(STORAGE_TEACHER_NAME_KEY, enteredName);
      }

      state.teacherToken = data.token;
      state.isTeacher = true;
      authorId = getEffectiveAuthorId();
      sessionStorage.setItem(STORAGE_TEACHER_TOKEN_KEY, data.token);
      closeModal(el.teacherLoginModal);
      socket.emit('client:register', {
        authorId,
        authorName: state.teacherName || 'Docente',
        teacherToken: state.teacherToken,
        teacherName: state.teacherName || 'Docente',
      });
      updateTeacherUI();
      showToast(`¡Bienvenido, ${state.teacherName}! Modo Docente activado.`, 'success');
      const targetTab = state.pendingTeacherTab || 'assignment';
      const targetEditActive = Boolean(state.pendingEditActive);
      state.pendingTeacherTab = null;
      state.pendingEditActive = false;
      openTeacherPanel(targetTab, { editActive: targetEditActive });
    } catch {
      el.teacherLoginError.textContent = 'No se pudo verificar el PIN.';
      el.teacherLoginError.classList.remove('hidden');
    }
  });

  el.btnTeacherLogout.addEventListener('click', () => {
    state.teacherToken = '';
    state.isTeacher = false;
    authorId = getEffectiveAuthorId();
    sessionStorage.removeItem(STORAGE_TEACHER_TOKEN_KEY);
    closeModal(el.teacherPanelModal);
    socket.emit('client:register', {
      authorId,
      authorName: authorName || 'Alumno',
      teacherToken: '',
      teacherName: '',
    });
    updateTeacherUI();
    showToast('Saliste del modo Docente');
  });

  // --- Action Menu Open / Close Event Listeners ---
  el.btnStudentMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (el.studentActionMenu && el.studentActionMenu.classList.contains('hidden')) {
      updateStudentMenuUI();
      openActionMenu(el.studentActionMenu, el.btnStudentMenu);
    } else {
      closeActionMenus();
    }
  });

  el.btnTeacherMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (el.teacherActionMenu && el.teacherActionMenu.classList.contains('hidden')) {
      updateTeacherMenuUI();
      openActionMenu(el.teacherActionMenu, el.btnTeacherMenu);
    } else {
      closeActionMenus();
    }
  });

  el.menuBackdropOverlay?.addEventListener('click', () => {
    closeActionMenus();
  });

  document.addEventListener('click', (e) => {
    if (
      !e.target.closest('#studentActionMenu') &&
      !e.target.closest('#teacherActionMenu') &&
      !e.target.closest('#btnStudentMenu') &&
      !e.target.closest('#btnTeacherMenu')
    ) {
      closeActionMenus();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeActionMenus();
      if (state.focusedCardId) {
        setFocusedCard(null);
      }
    }
  });

  // --- Student Menu Items Handlers ---
  el.btnStudentMenuEditName?.addEventListener('click', () => {
    closeActionMenus();
    openModal(el.nameModal);
    if (el.inputQuickName) {
      el.inputQuickName.value = authorName;
      el.inputQuickName.select();
    }
  });

  el.menuItemStudentPost?.addEventListener('click', () => {
    closeActionMenus();
    openModal(el.composerModal);
  });

  el.menuItemStudentScreen?.addEventListener('click', () => {
    closeActionMenus();
    openScreenShareModal();
  });

  el.menuItemStudentTasks?.addEventListener('click', () => {
    closeActionMenus();
    if (state.assignment || (state.assignmentHistory && state.assignmentHistory.length > 0)) {
      el.assignmentSection?.classList.remove('hidden');
      el.assignmentSection?.scrollIntoView({ behavior: 'smooth' });
    } else {
      showToast('No hay tareas asignadas en esta sesión aún.');
    }
  });

  el.menuItemStudentQuiz?.addEventListener('click', () => {
    closeActionMenus();
    if (window.PadletQuiz && typeof window.PadletQuiz.openQuizIfActive === 'function') {
      window.PadletQuiz.openQuizIfActive();
    } else {
      showToast('No hay test activo en este momento.');
    }
  });

  el.menuItemStudentSessions?.addEventListener('click', () => {
    closeActionMenus();
    openModal(el.sessionPickerModal);
  });

  el.menuItemStudentNetwork?.addEventListener('click', () => {
    closeActionMenus();
    openModal(el.networkModal);
  });

  el.menuItemStudentHelp?.addEventListener('click', () => {
    closeActionMenus();
    openModal(el.helpGuideModal);
  });

  el.menuItemStudentSound?.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem(STORAGE_SOUND_KEY, state.soundEnabled ? 'true' : 'false');
    updateSoundUI();
    updateStudentMenuUI();
    showToast(state.soundEnabled ? '🔔 Sonido de alertas activado' : '🔕 Sonido de alertas silenciado');
  });

  el.menuItemStudentUiMode?.addEventListener('click', () => {
    const nextMode = state.uiMode === 'easy' ? 'full' : 'easy';
    setUiMode(nextMode);
    updateStudentMenuUI();
    showToast(nextMode === 'easy' ? '🌱 Modo Fácil activado' : '⚡ Modo Completo activado');
  });

  el.menuItemStudentDev?.addEventListener('click', () => {
    closeActionMenus();
    openModal(el.aboutDevModal);
  });

  el.menuItemTeacherLogin?.addEventListener('click', () => {
    closeActionMenus();
    if (el.inputTeacherName) el.inputTeacherName.value = state.teacherName || 'Docente';
    if (el.inputTeacherPin) el.inputTeacherPin.value = '';
    el.teacherLoginError?.classList.add('hidden');
    openModal(el.teacherLoginModal);
    setTimeout(() => el.inputTeacherPin?.focus(), 120);
  });

  // --- Teacher Menu Items Handlers ---
  el.btnTeacherQuickTask?.addEventListener('click', () => {
    resetAssignmentFormToNew();
    openTeacherPanel('assignment', { editActive: false });
  });

  el.btnTeacherNewPost?.addEventListener('click', () => {
    openModal(el.composerModal);
  });

  el.menuItemTeacherTask?.addEventListener('click', () => {
    closeActionMenus();
    resetAssignmentFormToNew();
    openTeacherPanel('assignment', { editActive: false });
  });

  el.menuItemTeacherQuizzes?.addEventListener('click', () => {
    closeActionMenus();
    openTeacherPanel('quizzes');
  });

  el.menuItemTeacherNotify?.addEventListener('click', () => {
    closeActionMenus();
    openTeacherPanel('notify');
  });

  el.menuItemTeacherTimers?.addEventListener('click', () => {
    closeActionMenus();
    openTeacherPanel('timers');
  });

  el.menuItemTeacherSessions?.addEventListener('click', () => {
    closeActionMenus();
    openTeacherPanel('sessions');
  });

  el.menuItemTeacherStudents?.addEventListener('click', () => {
    closeActionMenus();
    openTeacherPanel('students');
  });

  el.menuItemTeacherScreens?.addEventListener('click', () => {
    closeActionMenus();
    setWorkspaceView('screens');
  });

  el.menuItemTeacherPost?.addEventListener('click', () => {
    closeActionMenus();
    openModal(el.composerModal);
  });

  el.menuItemTeacherCleanBoard?.addEventListener('click', async () => {
    closeActionMenus();
    const ok = await Swal.confirm(
      '¿Archivar / limpiar tablero?',
      '¿Deseas archivar y limpiar todas las publicaciones de esta sesión? Los datos quedarán a salvo en el historial.',
      { icon: 'warning', confirmButtonText: 'Sí, limpiar', confirmButtonColor: '#ef4444' }
    );
    if (!ok) return;
    socket.emit('board:clear', { teacherToken: state.teacherToken });
    showToast('Tablero limpiado');
  });

  function openTeacherSettingsModal() {
    closeActionMenus();
    if (el.settingsTeacherName) el.settingsTeacherName.value = state.teacherName || 'Docente';
    if (el.settingsCurrentPin) el.settingsCurrentPin.value = '';
    if (el.settingsNewPin) el.settingsNewPin.value = '';
    if (el.settingsConfirmPin) el.settingsConfirmPin.value = '';
    el.teacherSettingsError?.classList.add('hidden');
    openModal(el.teacherSettingsModal);
    setTimeout(() => el.settingsTeacherName?.focus(), 120);
  }

  el.btnTeacherMenuSettings?.addEventListener('click', openTeacherSettingsModal);
  el.menuItemTeacherSettings?.addEventListener('click', openTeacherSettingsModal);

  el.menuItemTeacherNetwork?.addEventListener('click', () => {
    closeActionMenus();
    openModal(el.networkModal);
  });

  el.menuItemTeacherDev?.addEventListener('click', () => {
    closeActionMenus();
    openModal(el.aboutDevModal);
  });

  el.menuItemTeacherLogout?.addEventListener('click', () => {
    closeActionMenus();
    el.btnTeacherLogout?.click();
  });

  // --- Teacher Settings Form (Change PIN & Name) Handler ---
  el.teacherSettingsForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newName = el.settingsTeacherName.value.trim();
    const currentPin = el.settingsCurrentPin.value.trim();
    const newPin = el.settingsNewPin.value.trim();
    const confirmPin = el.settingsConfirmPin.value.trim();

    el.teacherSettingsError.classList.add('hidden');

    if (!newName) {
      el.teacherSettingsError.textContent = 'Por favor ingresa tu nombre de docente.';
      el.teacherSettingsError.classList.remove('hidden');
      return;
    }

    if (newPin !== confirmPin) {
      el.teacherSettingsError.textContent = 'El nuevo PIN y su confirmación no coinciden.';
      el.teacherSettingsError.classList.remove('hidden');
      return;
    }

    if (newPin.length < 4) {
      el.teacherSettingsError.textContent = 'El nuevo PIN debe tener al menos 4 caracteres o dígitos.';
      el.teacherSettingsError.classList.remove('hidden');
      return;
    }

    try {
      const res = await fetch('/api/teacher/change-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-teacher-token': state.teacherToken,
        },
        body: JSON.stringify({
          token: state.teacherToken,
          currentPin,
          newPin,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        el.teacherSettingsError.textContent = data.error || 'Error al actualizar el PIN.';
        el.teacherSettingsError.classList.remove('hidden');
        return;
      }

      state.teacherName = newName;
      localStorage.setItem(STORAGE_TEACHER_NAME_KEY, newName);
      authorName = newName;
      localStorage.setItem(STORAGE_NAME_KEY, newName);

      if (socket && socket.connected) {
        socket.emit('client:name-change', {
          authorId,
          newName,
          isTeacher: true,
          teacherToken: state.teacherToken,
        });
      }

      closeModal(el.teacherSettingsModal);
      updateTeacherUI();
      showToast('¡Nombre y PIN del Docente actualizados correctamente!', 'success');
    } catch {
      el.teacherSettingsError.textContent = 'No se pudo conectar con el servidor para cambiar el PIN.';
      el.teacherSettingsError.classList.remove('hidden');
    }
  });

  // --- Compact Click-to-Grow Tasks ("Temas de Tareas") ---
  function getAllDisplayTasks() {
    const items = [];
    const isTeacher = Boolean(state.isTeacher);
    if (state.assignment && (isTeacher || state.assignment.pinned)) {
      if (isTeacher || !state.assignment.isHidden) {
        items.push({ ...state.assignment, isActive: true });
      }
    }
    const hist = Array.isArray(state.assignmentHistory) ? state.assignmentHistory : [];
    hist.forEach((h) => {
      if (state.assignment && String(state.assignment.id).trim() === String(h.id).trim()) return;
      if (isTeacher || !h.isHidden) {
        items.push({ ...h, isActive: false });
      }
    });
    return items;
  }

  function getExpandedTask() {
    if (!state.expandedTaskId) return null;
    return getAllDisplayTasks().find((t) => t.id === state.expandedTaskId) || null;
  }

  function renderAssignmentBanner() {
    const tasks = getAllDisplayTasks();
    if (tasks.length === 0) {
      el.assignmentSection.classList.add('hidden');
      state.expandedTaskId = null;
      return;
    }

    el.assignmentSection.classList.remove('hidden');
    el.btnEditAssignmentInline.classList.toggle('hidden', !state.isTeacher);

    // Render compact clickable mini-cards
    el.tasksMiniGrid.innerHTML = tasks
      .map((t) => {
        const isSelected = state.expandedTaskId === t.id;
        const preview = (t.instructions || '').replace(/\s+/g, ' ').trim();
        const isHidden = Boolean(t.isHidden);
        return `
          <button type="button" class="task-mini-card ${t.isActive ? 'is-active-task' : ''} ${
            isSelected ? 'is-selected' : ''
          } ${isHidden ? 'is-hidden-task' : ''}" data-task-id="${escapeHtml(t.id)}">
            <div class="task-mini-top">
              <span class="task-mini-tag ${isHidden ? 'tag-hidden' : ''}">${
                isHidden ? '🚫 Despublicada' : (t.isActive ? '📌 Activa' : '📄 Anterior')
              }</span>
              ${t.dueNote ? `<span class="task-mini-due">${escapeHtml(t.dueNote)}</span>` : ''}
            </div>
            <div class="task-mini-title">${escapeHtml(t.title)}</div>
            <div class="task-mini-preview">${escapeHtml(preview || (t.imageUrl ? '🖼️ Incluye imagen de referencia' : 'Sin descripción'))}</div>
            <span class="task-mini-cta">${isSelected ? '▾ Abierta (clic para reducir)' : '🔍 Clic para ver completa'}</span>
          </button>
        `;
      })
      .join('');

    // Render expanded panel only when user clicked a mini-card
    const selected = getExpandedTask();
    if (!selected) {
      el.assignmentExpandedCard.classList.add('hidden');
      return;
    }

    el.assignmentExpandedCard.classList.remove('hidden');
    el.assignmentExpandedBadge.textContent = selected.isHidden
      ? '🚫 Tarea Despublicada'
      : (selected.isActive ? '📌 Tarea Activa' : '📄 Tarea Anterior');
    el.assignmentTitle.textContent = selected.title;

    if (selected.dueNote) {
      el.assignmentDue.textContent = selected.dueNote;
      el.assignmentDue.classList.remove('hidden');
    } else {
      el.assignmentDue.classList.add('hidden');
    }

    el.assignmentMeta.textContent = `${selected.updatedBy || 'Profesor'} · ${formatRelativeTime(selected.updatedAt)}`;
    el.assignmentInstructions.innerHTML = selected.instructions
      ? formatTextWithLinks(selected.instructions)
      : '<em class="muted-note">Revisa la imagen de referencia adjunta.</em>';

    if (selected.imageUrl) {
      el.assignmentImage.src = selected.imageUrl;
      el.assignmentImageWrap.classList.remove('hidden');
    } else {
      el.assignmentImage.src = '';
      el.assignmentImageWrap.classList.add('hidden');
    }

    if (el.expandedTaskTeacherActions) {
      el.expandedTaskTeacherActions.classList.toggle('hidden', !state.isTeacher);
      if (el.btnToggleHideExpandedTask) {
        el.btnToggleHideExpandedTask.textContent = selected.isHidden ? '👁️ Republicar' : '🚫 Despublicar';
        el.btnToggleHideExpandedTask.title = selected.isHidden ? 'Hacer visible a los alumnos' : 'Ocultar a los alumnos';
      }
    }
  }

  el.tasksMiniGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.task-mini-card');
    if (!card) return;
    const id = card.dataset.taskId;
    state.expandedTaskId = state.expandedTaskId === id ? null : id;
    renderAssignmentBanner();
  });

  el.btnToggleAssignment.addEventListener('click', () => {
    state.expandedTaskId = null;
    renderAssignmentBanner();
  });

  el.assignmentImageWrap.addEventListener('click', () => {
    const task = getExpandedTask();
    if (!task?.imageUrl) return;
    el.lightboxImg.src = task.imageUrl;
    el.lightboxCaption.textContent = `Tarea: ${task.title}`;
    openModal(el.lightboxModal);
  });

  el.btnCopyAssignment.addEventListener('click', async () => {
    const task = getExpandedTask();
    if (!task) return;
    const text = `${task.title}${task.dueNote ? ` (${task.dueNote})` : ''}\n\n${task.instructions || ''}`.trim();
    try {
      await copyTextToClipboard(text);
      showToast('Instrucciones de la tarea copiadas', 'success');
    } catch {
      showToast('No se pudo copiar', 'error');
    }
  });

  el.btnRespondAssignment.addEventListener('click', () => {
    const task = getExpandedTask() || state.assignment;
    applyWorkspaceView('padlets');
    openComposerForCreate();
    if (task?.title) {
      el.inputTopic.value = task.title.slice(0, 100);
      if (authorName) el.inputContent.focus();
    }
    if (task?.id) {
      state.composerAssignmentId = task.id;
      state.composerAssignmentTitle = task.title || '';
      if (el.composerAssignmentId) el.composerAssignmentId.value = task.id;
      if (el.composerAssignmentRefTitle) el.composerAssignmentRefTitle.textContent = task.title || '';
      if (el.composerAssignmentTitle) el.composerAssignmentTitle.textContent = task.title || '';
      if (el.composerAssignmentRefBox) el.composerAssignmentRefBox.classList.remove('hidden');
    }
    if (el.composerTitle) {
      el.composerTitle.textContent = 'Responder tarea: ' + (task?.title || '');
    }
    if (el.btnSubmitPost) {
      el.btnSubmitPost.textContent = 'Publicar respuesta';
    }
  });

  if (el.btnRemoveAssignmentRef) {
    el.btnRemoveAssignmentRef.addEventListener('click', () => {
      state.composerAssignmentId = null;
      state.composerAssignmentTitle = null;
      if (el.composerAssignmentId) el.composerAssignmentId.value = '';
      if (el.composerAssignmentRefTitle) el.composerAssignmentRefTitle.textContent = '';
      if (el.composerAssignmentTitle) el.composerAssignmentTitle.textContent = '';
      if (el.composerAssignmentRefBox) el.composerAssignmentRefBox.classList.add('hidden');
      if (el.composerTitle) el.composerTitle.textContent = 'Nueva publicación (Padlet)';
      if (el.btnSubmitPost) el.btnSubmitPost.textContent = 'Publicar Padlet';
    });
  }

  function showTaskImagePreview(src) {
    if (src) {
      el.taskImagePreview.src = src;
      el.taskImagePreviewBox.classList.remove('hidden');
      el.taskDropzonePlaceholder.classList.add('hidden');
      setTimeout(() => {
        if (el.btnSaveAssignment) {
          el.btnSaveAssignment.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    } else {
      el.taskImagePreview.src = '';
      el.taskImagePreviewBox.classList.add('hidden');
      el.taskDropzonePlaceholder.classList.remove('hidden');
    }
  }

  function handleTaskImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 15 * 1024 * 1024) {
      showToast('La imagen supera el límite de 15 MB', 'error');
      return;
    }
    state.taskSelectedFile = file;
    state.taskRemoveExistingImage = false;
    const reader = new FileReader();
    reader.onload = () => showTaskImagePreview(reader.result);
    reader.readAsDataURL(file);
  }

  el.taskImageDropzone.addEventListener('click', (e) => {
    if (e.target.closest('#btnRemoveTaskImage')) return;
    el.taskImageInput.click();
  });

  el.taskImageInput.addEventListener('change', () => {
    if (el.taskImageInput.files?.[0]) handleTaskImageFile(el.taskImageInput.files[0]);
  });

  el.taskImageDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.taskImageDropzone.classList.add('dragover');
  });

  el.taskImageDropzone.addEventListener('dragleave', () => {
    el.taskImageDropzone.classList.remove('dragover');
  });

  el.taskImageDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    el.taskImageDropzone.classList.remove('dragover');
    if (e.dataTransfer?.files?.[0]) handleTaskImageFile(e.dataTransfer.files[0]);
  });

  el.btnRemoveTaskImage.addEventListener('click', (e) => {
    e.stopPropagation();
    state.taskSelectedFile = null;
    state.taskRemoveExistingImage = true;
    state.taskExistingImageUrl = null;
    state.taskExistingImageName = null;
    if (el.taskImageInput) el.taskImageInput.value = '';
    showTaskImagePreview(null);
    showToast('Imagen quitada de la tarea');
  });

  if (el.btnNewAssignment) {
    el.btnNewAssignment.addEventListener('click', () => {
      resetAssignmentFormToNew();
      showToast('Formulario limpio para redactar una nueva tarea');
      el.taskTitleInput.focus();
    });
  }

  if (el.btnResetTaskForm) {
    el.btnResetTaskForm.addEventListener('click', () => {
      resetAssignmentFormToNew();
      showToast('Formulario e imagen limpiados');
      el.taskTitleInput.focus();
    });
  }

  if (el.btnLoadActiveAssignment) {
    el.btnLoadActiveAssignment.addEventListener('click', () => {
      if (state.assignment) {
        populateAssignmentForm(state.assignment, { isEditingActive: true });
        showToast('Tarea activa cargada para edición');
      }
    });
  }

  function renderAssignmentHistory() {
    const list = state.assignmentHistory || [];
    if (list.length === 0) {
      el.assignmentHistoryBox.classList.add('hidden');
      return;
    }
    el.assignmentHistoryBox.classList.remove('hidden');

    const padlets = getPadletPosts();

    el.assignmentHistoryList.innerHTML = list
      .map((item) => {
        const linkedCount = padlets.filter((p) => p.assignmentId === item.id).length;
        const isHidden = Boolean(item.isHidden);
        return `
        <div class="history-item" data-task-id="${escapeHtml(item.id)}" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;background:var(--bg-input);border-radius:8px;margin-bottom:8px;border:1px solid var(--border);">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <strong style="color:var(--text);font-size:0.9rem;">${escapeHtml(item.title)}</strong>
              ${
                isHidden
                  ? '<span class="hidden-tag" style="font-size:0.68rem;padding:2px 6px;">🚫 Despublicada</span>'
                  : '<span style="font-size:0.68rem;padding:2px 6px;border-radius:4px;background:rgba(34,197,94,0.15);color:#16a34a;font-weight:600;">👁️ Publicada</span>'
              }
              ${item.pinned ? '<span class="pinned-tag" style="font-size:0.68rem;padding:2px 6px;">📌 Fijada</span>' : ''}
            </div>
            <div class="muted-note" style="font-size:0.75rem;margin-top:3px;color:var(--text-muted);">
              ${formatRelativeTime(item.updatedAt || item.createdAt)} · 📝 <strong>${linkedCount}</strong> ${
                linkedCount === 1 ? 'respuesta vinculada' : 'respuestas vinculadas'
              }
            </div>
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
            <button type="button" class="btn btn-sm btn-ghost" data-task-action="view-responses" data-task-id="${escapeHtml(
              item.id
            )}" title="Ver solo las respuestas a esta tarea en el panel">📂 Ver (${linkedCount})</button>
            <button type="button" class="btn btn-sm btn-secondary" data-task-action="edit" data-task-id="${escapeHtml(
              item.id
            )}" title="Editar tarea">✏️ Editar</button>
            <button type="button" class="btn btn-sm btn-secondary" data-task-action="toggle-hide" data-task-id="${escapeHtml(
              item.id
            )}" title="${isHidden ? 'Republicar tarea para alumnos' : 'Despublicar / Ocultar tarea a alumnos'}">${
              isHidden ? '👁️ Republicar' : '🚫 Despublicar'
            }</button>
            <button type="button" class="btn btn-sm btn-danger" data-task-action="delete" data-task-id="${escapeHtml(
              item.id
            )}" title="Eliminar tarea del historial">🗑️</button>
          </div>
        </div>
      `;
      })
      .join('');
  }

  function handleTeacherTaskEdit(task) {
    if (!state.isTeacher || !task) return;
    openTeacherPanel('assignment');
    populateAssignmentForm(task, { isEditingActive: true, assignmentId: task.id });
    switchTeacherTab('assignment');
    setTimeout(() => {
      if (el.assignmentForm) el.assignmentForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (el.taskTitleInput) el.taskTitleInput.focus();
    }, 100);
    showToast(`✏️ Tarea "${task.title}" cargada en el formulario para editar`, 'info');
  }

  function handleTeacherTaskToggleHide(task) {
    if (!state.isTeacher || !task) return;
    const linkedCount = getPadletPosts().filter((p) => p.assignmentId === task.id).length;
    if (task.isHidden) {
      socket.emit(
        'teacher:assignment:toggle-hide',
        {
          teacherToken: state.teacherToken,
          sessionId: state.activeSessionId,
          assignmentId: task.id,
          id: task.id,
          hideLinkedPosts: false,
        },
        (ack) => {
          if (ack?.ok) showToast(`👁️ Tarea "${task.title}" republicada para alumnos`, 'success');
          else showToast(ack?.error || 'Error al republicar la tarea', 'error');
        }
      );
    } else {
      if (linkedCount === 0) {
        socket.emit(
          'teacher:assignment:toggle-hide',
          {
            teacherToken: state.teacherToken,
            sessionId: state.activeSessionId,
            assignmentId: task.id,
            id: task.id,
            hideLinkedPosts: false,
          },
          (ack) => {
            if (ack?.ok) showToast(`🚫 Tarea "${task.title}" despublicada para alumnos`, 'info');
            else showToast(ack?.error || 'Error al despublicar', 'error');
          }
        );
      } else {
        state.pendingCleanAssignmentId = task.id;
        state.pendingCleanAssignmentAction = 'toggle-hide';
        if (el.cleanModalTitle) el.cleanModalTitle.textContent = `Despublicar Tarea: "${task.title}"`;
        if (el.cleanModalResponsesCount) el.cleanModalResponsesCount.textContent = String(linkedCount);
        openModal(el.assignmentCleanModal);
      }
    }
  }

  async function handleTeacherTaskDelete(task) {
    if (!state.isTeacher || !task) return;
    const linkedCount = getPadletPosts().filter((p) => p.assignmentId === task.id).length;
    if (linkedCount === 0) {
      const ok = await Swal.confirm(
        '¿Eliminar tarea?',
        `¿Eliminar permanentemente la tarea <strong>"${escapeHtml(task.title)}"</strong>?`,
        { icon: 'warning', confirmButtonText: 'Sí, eliminar', confirmButtonColor: '#ef4444' }
      );
      if (!ok) return;
      socket.emit(
        'teacher:assignment:delete',
        {
          teacherToken: state.teacherToken,
          sessionId: state.activeSessionId,
          assignmentId: task.id,
          id: task.id,
        },
        (ack) => {
          if (ack?.ok) showToast('Tarea eliminada del panel y del historial', 'success');
          else showToast(ack?.error || 'Error al eliminar tarea', 'error');
        }
      );
    } else {
      state.pendingCleanAssignmentId = task.id;
      state.pendingCleanAssignmentAction = 'delete';
      if (el.cleanModalTitle) el.cleanModalTitle.textContent = `Eliminar Tarea: "${task.title}"`;
      if (el.cleanModalResponsesCount) el.cleanModalResponsesCount.textContent = String(linkedCount);
      openModal(el.assignmentCleanModal);
    }
  }

  el.assignmentHistoryList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-task-action]');
    if (!btn) return;
    const action = btn.dataset.taskAction;
    const taskId = btn.dataset.taskId;
    const task =
      (state.assignmentHistory || []).find((h) => String(h.id).trim() === String(taskId).trim()) ||
      (state.assignment && String(state.assignment.id).trim() === String(taskId).trim() ? state.assignment : null);
    if (!task) return;

    if (action === 'view-responses') {
      state.activeTaskFilter = state.activeTaskFilter === task.id ? null : task.id;
      state.activeAuthor = null;
      state.activeTopic = '__ALL__';
      renderTopicBar();
      renderBoardFull();
      applyWorkspaceView('padlets');
      closeModal(el.teacherPanelModal);
      showToast(
        state.activeTaskFilter
          ? `Mostrando solo respuestas a la tarea "${task.title}"`
          : 'Filtro de tarea retirado',
        'info'
      );
    } else if (action === 'edit') {
      handleTeacherTaskEdit(task);
    } else if (action === 'toggle-hide') {
      handleTeacherTaskToggleHide(task);
    } else if (action === 'delete') {
      handleTeacherTaskDelete(task);
    }
  });

  // Direct Teacher Controls on Expanded Task Card (Main Screen)
  el.btnEditExpandedTask?.addEventListener('click', () => {
    const task = getExpandedTask();
    if (!task) return;
    handleTeacherTaskEdit(task);
  });

  el.btnToggleHideExpandedTask?.addEventListener('click', () => {
    const task = getExpandedTask();
    if (!task) return;
    handleTeacherTaskToggleHide(task);
  });

  el.btnDeleteExpandedTask?.addEventListener('click', () => {
    const task = getExpandedTask();
    if (!task) return;
    handleTeacherTaskDelete(task);
  });

  async function uploadFile(file) {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al subir la imagen.');
    return data;
  }

  el.assignmentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = el.taskTitleInput.value.trim();
    const dueNote = el.taskDueInput.value.trim();
    const instructions = el.taskInstructionsInput.value.trim();
    if (!title) {
      showToast('Ingresa el título de la tarea', 'error');
      return;
    }

    el.btnSaveAssignment.disabled = true;
    try {
      let imageUrl = state.taskRemoveExistingImage ? null : state.taskExistingImageUrl;
      let imageName = state.taskRemoveExistingImage ? null : state.taskExistingImageName;
      if (state.taskSelectedFile) {
        const uploaded = await uploadFile(state.taskSelectedFile);
        imageUrl = uploaded.imageUrl;
        imageName = uploaded.imageName;
      }

      if (state.editingAssignmentId) {
        const ack = await new Promise((resolve) => {
          socket.emit(
            'teacher:assignment:update',
            {
              teacherToken: state.teacherToken,
              sessionId: state.activeSessionId,
              id: state.editingAssignmentId,
              assignmentId: state.editingAssignmentId,
              title,
              dueNote,
              instructions,
              imageUrl,
              imageName,
              pinned: el.taskPinnedCheck.checked,
              author: authorName || 'Profesor',
            },
            resolve
          );
        });
        if (!ack?.ok) throw new Error(ack?.error || 'No se pudo actualizar la tarea.');
        state.editingAssignmentId = null;
        state.isEditingActiveAssignment = false;
        resetAssignmentFormToNew();
        closeModal(el.teacherPanelModal);
        showToast('Tarea actualizada correctamente', 'success');
        return;
      }

      const ack = await new Promise((resolve) => {
        socket.emit(
          'teacher:assignment:save',
          {
            teacherToken: state.teacherToken,
            title,
            dueNote,
            instructions,
            imageUrl,
            imageName,
            pinned: el.taskPinnedCheck.checked,
            notifyAll: el.taskNotifyCheck.checked,
            author: authorName || 'Profesor',
          },
          resolve
        );
      });

      if (!ack?.ok) throw new Error(ack?.error || 'No se pudo publicar la tarea.');
      state.expandedTaskId = null;
      resetAssignmentFormToNew();
      closeModal(el.teacherPanelModal);
      showToast('Siguiente tarea publicada para todos', 'success');
    } catch (err) {
      showToast(err.message || 'Error al guardar la tarea', 'error');
    } finally {
      el.btnSaveAssignment.disabled = false;
    }
  });

  el.btnClearAssignment.addEventListener('click', () => {
    if (!state.assignment) return;
    const task = state.assignment;
    const linkedCount = getPadletPosts().filter((p) => p.assignmentId === task.id).length;
    if (linkedCount > 0) {
      state.pendingCleanAssignmentId = task.id;
      state.pendingCleanAssignmentAction = 'toggle-hide';
      if (el.cleanModalTitle) el.cleanModalTitle.textContent = `Retirar Tarea Activa: "${task.title}"`;
      if (el.cleanModalResponsesCount) el.cleanModalResponsesCount.textContent = String(linkedCount);
      openModal(el.assignmentCleanModal);
      return;
    }
    socket.emit('teacher:assignment:clear', { teacherToken: state.teacherToken }, (ack) => {
      if (ack?.ok) {
        state.isEditingActiveAssignment = false;
        state.expandedTaskId = null;
        resetAssignmentFormToNew();
        showToast('Tarea actual archivada y ocultada');
      } else {
        showToast(ack?.error || 'Error al quitar tarea', 'error');
      }
    });
  });

  // Clean / Unpublish Modal Action Handlers
  if (el.btnCleanHideResponses) {
    el.btnCleanHideResponses.addEventListener('click', () => {
      const taskId = state.pendingCleanAssignmentId;
      const action = state.pendingCleanAssignmentAction;
      if (!taskId) return;
      closeModal(el.assignmentCleanModal);
      if (action === 'delete') {
        socket.emit(
          'teacher:assignment:delete',
          {
            teacherToken: state.teacherToken,
            sessionId: state.activeSessionId,
            assignmentId: taskId,
            id: taskId,
            hideLinkedPosts: true,
            deleteLinkedPosts: false,
          },
          (ack) => {
            if (ack?.ok) showToast('Tarea eliminada y respuestas despublicadas para alumnos', 'info');
            else showToast(ack?.error || 'Error al procesar tarea', 'error');
          }
        );
      } else {
        socket.emit(
          'teacher:assignment:toggle-hide',
          {
            teacherToken: state.teacherToken,
            sessionId: state.activeSessionId,
            assignmentId: taskId,
            id: taskId,
            hideLinkedPosts: true,
            deleteLinkedPosts: false,
          },
          (ack) => {
            if (ack?.ok) showToast('🚫 Tarea despublicada y respuestas ocultas para alumnos', 'info');
            else showToast(ack?.error || 'Error al despublicar', 'error');
          }
        );
      }
    });
  }

  if (el.btnCleanKeepResponses) {
    el.btnCleanKeepResponses.addEventListener('click', () => {
      const taskId = state.pendingCleanAssignmentId;
      const action = state.pendingCleanAssignmentAction;
      if (!taskId) return;
      closeModal(el.assignmentCleanModal);
      if (action === 'delete') {
        socket.emit(
          'teacher:assignment:delete',
          {
            teacherToken: state.teacherToken,
            sessionId: state.activeSessionId,
            assignmentId: taskId,
            id: taskId,
            deleteLinkedPosts: false,
            hideLinkedPosts: false,
          },
          (ack) => {
            if (ack?.ok) showToast('Tarea eliminada; respuestas conservadas en el panel', 'info');
            else showToast(ack?.error || 'Error al procesar tarea', 'error');
          }
        );
      } else {
        socket.emit(
          'teacher:assignment:toggle-hide',
          {
            teacherToken: state.teacherToken,
            sessionId: state.activeSessionId,
            assignmentId: taskId,
            id: taskId,
            hideLinkedPosts: false,
            deleteLinkedPosts: false,
          },
          (ack) => {
            if (ack?.ok) showToast('🚫 Tarea despublicada; respuestas visibles en el panel', 'info');
            else showToast(ack?.error || 'Error al despublicar', 'error');
          }
        );
      }
    });
  }

  if (el.btnCleanDeleteResponses) {
    el.btnCleanDeleteResponses.addEventListener('click', () => {
      const taskId = state.pendingCleanAssignmentId;
      const action = state.pendingCleanAssignmentAction;
      if (!taskId) return;
      closeModal(el.assignmentCleanModal);
      if (action === 'delete') {
        socket.emit(
          'teacher:assignment:delete',
          {
            teacherToken: state.teacherToken,
            sessionId: state.activeSessionId,
            assignmentId: taskId,
            id: taskId,
            deleteLinkedPosts: true,
            hideLinkedPosts: false,
          },
          (ack) => {
            if (ack?.ok) showToast('🗑️ Tarea y respuestas eliminadas permanentemente', 'success');
            else showToast(ack?.error || 'Error al procesar tarea', 'error');
          }
        );
      } else {
        socket.emit(
          'teacher:assignment:toggle-hide',
          {
            teacherToken: state.teacherToken,
            sessionId: state.activeSessionId,
            assignmentId: taskId,
            id: taskId,
            deleteLinkedPosts: true,
            hideLinkedPosts: false,
          },
          (ack) => {
            if (ack?.ok) showToast('🚫 Tarea despublicada y respuestas eliminadas del panel', 'success');
            else showToast(ack?.error || 'Error al despublicar', 'error');
          }
        );
      }
    });
  }

  // --- Teacher Notifications (Send + Receive + History) ---
  document.querySelectorAll('.quick-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      el.notifyTitleInput.value = chip.dataset.quickTitle || 'Aviso del profesor';
      el.notifyMessageInput.value = chip.dataset.quickMsg || '';
      el.notifyTypeSelect.value = chip.dataset.quickType || 'info';
      el.notifyMessageInput.focus();
    });
  });

  el.notifyForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = el.notifyTitleInput.value.trim() || 'Aviso del profesor';
    const message = el.notifyMessageInput.value.trim();
    const type = el.notifyTypeSelect.value;
    const sound = el.notifySoundCheck.checked;
    if (!message) {
      showToast('Escribe un mensaje para notificar', 'error');
      return;
    }

    socket.emit(
      'teacher:notify',
      {
        teacherToken: state.teacherToken,
        title,
        message,
        type,
        sound,
        author: authorName || 'Profesor',
      },
      (ack) => {
        if (ack?.ok) {
          el.notifyMessageInput.value = '';
          closeModal(el.teacherPanelModal);
          showToast('Notificación enviada a todos', 'success');
        } else {
          showToast(ack?.error || 'No se pudo enviar la notificación', 'error');
        }
      }
    );
  });

  function updateNotifBadge() {
    if (state.unreadNotifications > 0) {
      el.notifBadge.textContent = String(Math.min(99, state.unreadNotifications));
      el.notifBadge.classList.remove('hidden');
    } else {
      el.notifBadge.classList.add('hidden');
    }
  }

  function renderNotificationsList() {
    if ('Notification' in window && Notification.permission === 'default' && window.isSecureContext) {
      el.btnEnableBrowserNotif.classList.remove('hidden');
    } else {
      el.btnEnableBrowserNotif.classList.add('hidden');
    }

    if (state.notifications.length === 0) {
      el.notificationsList.innerHTML = '<div class="muted-note">Aún no hay avisos del profesor.</div>';
      return;
    }

    el.notificationsList.innerHTML = state.notifications
      .map(
        (n) => `
        <div class="notif-history-item type-${escapeHtml(n.type || 'info')}">
          <div class="announcement-head">
            <strong class="announcement-title">${escapeHtml(n.title)}</strong>
            <span class="announcement-foot">${formatRelativeTime(n.createdAt)}</span>
          </div>
          <div class="announcement-body">${formatTextWithLinks(n.message)}</div>
          <div class="announcement-foot">Por ${escapeHtml(n.author || 'Profesor')}</div>
        </div>
      `
      )
      .join('');
  }

  function showLiveAnnouncement(n) {
    const card = document.createElement('div');
    card.className = `announcement-card type-${n.type || 'info'}`;
    card.innerHTML = `
      <div class="announcement-head">
        <div class="announcement-title">${escapeHtml(n.title)}</div>
        <button type="button" class="icon-btn-subtle" aria-label="Cerrar aviso">✕</button>
      </div>
      <div class="announcement-body">${formatTextWithLinks(n.message)}</div>
      <div class="announcement-foot">${escapeHtml(n.author || 'Profesor')} · ahora</div>
    `;

    const dismiss = () => {
      card.style.opacity = '0';
      card.style.transition = 'opacity 0.25s ease';
      setTimeout(() => card.remove(), 260);
    };

    card.querySelector('button').addEventListener('click', dismiss);
    el.announcementStack.prepend(card);

    // Keep max 3 stacked alerts visible
    while (el.announcementStack.children.length > 3) {
      el.announcementStack.lastElementChild.remove();
    }

    setTimeout(dismiss, 11000);

    if (n.sound) {
      playChime(n.type || 'info');
    }

    // Native browser notification when tab is hidden
    if (
      document.hidden &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        new Notification(n.title, { body: n.message });
      } catch {}
    }
  }

  el.btnNotifications.addEventListener('click', () => {
    state.unreadNotifications = 0;
    updateNotifBadge();
    renderNotificationsList();
    openModal(el.notificationsModal);
  });

  el.btnEnableBrowserNotif.addEventListener('click', async () => {
    if (!('Notification' in window)) return;
    try {
      const perm = await Notification.requestPermission();
      renderNotificationsList();
      if (perm === 'granted') {
        showToast('Notificaciones del navegador activadas', 'success');
      }
    } catch {}
  });

  // --- Recess & Countdown Timers ---
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      el.timerDurationInput.value = btn.dataset.presetMin;
    });
  });

  el.timerKindSelect.addEventListener('change', () => {
    const val = el.timerLabelInput.value.trim();
    if (el.timerKindSelect.value === 'recess' && (!val || val === 'Tiempo de actividad')) {
      el.timerLabelInput.value = 'Receso';
    } else if (el.timerKindSelect.value === 'activity' && (!val || val === 'Receso')) {
      el.timerLabelInput.value = 'Tiempo de actividad';
    }
  });

  el.btnStartTimerNow.addEventListener('click', () => {
    const kind = el.timerKindSelect.value;
    const label = el.timerLabelInput.value.trim() || (kind === 'recess' ? 'Receso' : 'Actividad');
    const message = el.timerMessageInput.value.trim();
    const durationMin = Number(el.timerDurationInput.value);

    if (!Number.isFinite(durationMin) || durationMin <= 0) {
      showToast('Ingresa una duración válida en minutos', 'error');
      return;
    }

    socket.emit(
      'teacher:timer:start',
      {
        teacherToken: state.teacherToken,
        kind,
        label,
        message,
        durationMin,
        notifyAll: el.timerStartNotifyCheck.checked,
        author: authorName || 'Profesor',
      },
      (ack) => {
        if (ack?.ok) {
          closeModal(el.teacherPanelModal);
          showToast('Cuenta regresiva iniciada para todos', 'success');
        } else {
          showToast(ack?.error || 'No se pudo iniciar el temporizador', 'error');
        }
      }
    );
  });

  el.btnScheduleTimer.addEventListener('click', () => {
    const timeVal = el.scheduleTimeInput.value;
    if (!timeVal || !timeVal.includes(':')) {
      showToast('Selecciona una hora de inicio válida', 'error');
      return;
    }
    const [hh, mm] = timeVal.split(':').map(Number);
    const nowMs = serverNow();
    const target = new Date(nowMs);
    target.setHours(hh, mm, 0, 0);
    // If chosen time is already in the past today, schedule for tomorrow
    if (target.getTime() <= nowMs + 5000) {
      target.setDate(target.getDate() + 1);
    }

    const kind = el.timerKindSelect.value;
    const label = el.timerLabelInput.value.trim() || (kind === 'recess' ? 'Receso programado' : 'Actividad programada');
    const message = el.timerMessageInput.value.trim();
    const durationMin = Number(el.scheduleDurationInput.value);

    socket.emit(
      'teacher:timer:schedule',
      {
        teacherToken: state.teacherToken,
        kind,
        label,
        message,
        startAt: target.getTime(),
        durationMin,
        notifyAll: el.scheduleNotifyCheck.checked,
        author: authorName || 'Profesor',
      },
      (ack) => {
        if (ack?.ok) {
          showToast(`Programado para las ${formatClockTime(target.getTime())}`, 'success');
          renderScheduledTimersUI();
        } else {
          showToast(ack?.error || 'No se pudo programar el receso', 'error');
        }
      }
    );
  });

  // Inline teacher timer controls
  el.btnTimerPauseResume.addEventListener('click', () => {
    if (!state.timer) return;
    const event = state.timer.status === 'paused' ? 'teacher:timer:resume' : 'teacher:timer:pause';
    socket.emit(event, { teacherToken: state.teacherToken });
  });

  el.btnTimerExtend.addEventListener('click', () => {
    socket.emit('teacher:timer:extend', { teacherToken: state.teacherToken, extraMin: 5 });
  });

  el.btnTimerStop.addEventListener('click', () => {
    socket.emit('teacher:timer:stop', { teacherToken: state.teacherToken });
  });

  // Projector fullscreen overlay
  el.btnTimerProjector.addEventListener('click', () => {
    if (!state.timer) return;
    openModal(el.timerProjectorModal);
    renderTimerTick();
  });

  el.btnCloseProjector.addEventListener('click', () => closeModal(el.timerProjectorModal));

  function cancelScheduledTimer(id) {
    socket.emit('teacher:timer:cancel-scheduled', { teacherToken: state.teacherToken, id }, (ack) => {
      if (ack?.ok) showToast('Programación cancelada');
    });
  }

  el.scheduledTimersStrip.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cancel-scheduled]');
    if (btn) cancelScheduledTimer(btn.dataset.cancelScheduled);
  });

  el.teacherScheduledList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cancel-scheduled]');
    if (btn) cancelScheduledTimer(btn.dataset.cancelScheduled);
  });

  function renderScheduledTimersUI() {
    const list = state.scheduledTimers || [];
    const nowMs = serverNow();

    if (list.length === 0) {
      el.scheduledTimersStrip.classList.add('hidden');
      el.scheduledTimersStrip.innerHTML = '';
      el.teacherScheduledListBox.classList.add('hidden');
      el.teacherScheduledList.innerHTML = '';
      updateClassroomBarVisibility();
      return;
    }

    el.scheduledTimersStrip.classList.remove('hidden');
    el.scheduledTimersStrip.innerHTML = list
      .map((st) => {
        const diffSec = Math.max(0, Math.ceil((st.startAt - nowMs) / 1000));
        const icon = st.kind === 'recess' ? '☕' : '⏱';
        const mins = Math.round(st.durationSec / 60);
        return `
          <span class="scheduled-pill ${st.kind === 'activity' ? 'activity-pill' : ''}">
            <span>${icon} <strong>${escapeHtml(st.label)}</strong> a las ${formatClockTime(st.startAt)} (${mins} min)</span>
            <code>en ${formatCountdown(diffSec)}</code>
            ${
              state.isTeacher
                ? `<button type="button" class="scheduled-cancel-btn" data-cancel-scheduled="${escapeHtml(st.id)}" title="Cancelar programación">✕</button>`
                : ''
            }
          </span>
        `;
      })
      .join('');

    el.teacherScheduledListBox.classList.remove('hidden');
    el.teacherScheduledList.innerHTML = list
      .map((st) => {
        const diffSec = Math.max(0, Math.ceil((st.startAt - nowMs) / 1000));
        const mins = Math.round(st.durationSec / 60);
        return `
          <div class="history-item">
            <div>
              <strong>${st.kind === 'recess' ? '☕' : '⏱'} ${escapeHtml(st.label)}</strong>
              <div class="muted-note" style="font-size:0.76rem;">Inicio: ${formatClockTime(st.startAt)} (en ${formatCountdown(diffSec)}) · Duración: ${mins} min</div>
            </div>
            <button type="button" class="btn btn-sm btn-live" data-cancel-scheduled="${escapeHtml(st.id)}">Cancelar</button>
          </div>
        `;
      })
      .join('');

    updateClassroomBarVisibility();
  }

  function updateClassroomBarVisibility() {
    const hasActive = Boolean(state.timer);
    const hasScheduled = (state.scheduledTimers || []).length > 0;
    el.classroomBar.classList.toggle('hidden', !hasActive && !hasScheduled);
  }

  function renderTimerTick() {
    const t = state.timer;
    if (!t) {
      el.activeTimerBanner.classList.add('hidden');
      closeModal(el.timerProjectorModal);
      renderScheduledTimersUI();
      return;
    }

    el.activeTimerBanner.classList.remove('hidden');
    el.activeTimerBanner.classList.toggle('timer-activity', t.kind === 'activity');
    el.activeTimerBanner.classList.toggle('timer-paused', t.status === 'paused');
    el.activeTimerBanner.classList.toggle('timer-finished', t.status === 'finished');

    const nowMs = serverNow();
    let remSec = 0;
    if (t.status === 'running') {
      remSec = Math.max(0, Math.ceil((t.endsAt - nowMs) / 1000));
    } else if (t.status === 'paused') {
      remSec = Math.max(0, t.remainingSec || 0);
    } else {
      remSec = 0;
    }

    const pct = t.durationSec > 0 ? Math.max(0, Math.min(100, (remSec / t.durationSec) * 100)) : 0;
    const isRecess = t.kind === 'recess';
    const badgeText =
      t.status === 'finished'
        ? '🔔 Finalizado'
        : t.status === 'paused'
        ? '⏸ En pausa'
        : isRecess
        ? '☕ Receso en curso'
        : '⏱ Cuenta regresiva';

    el.timerKindBadge.textContent = badgeText;
    el.timerLabelText.textContent = t.label;
    el.timerMessageText.textContent = t.message || '';
    el.timerDigits.textContent = formatCountdown(remSec);
    el.timerProgressFill.style.width = `${pct}%`;

    if (t.status === 'running' && t.endsAt) {
      el.timerReturnText.textContent = isRecess
        ? `Volvemos a las ${formatClockTime(t.endsAt)}`
        : `Finaliza a las ${formatClockTime(t.endsAt)}`;
    } else if (t.status === 'paused') {
      el.timerReturnText.textContent = 'Pausado por el profesor';
    } else {
      el.timerReturnText.textContent = '¡Tiempo cumplido!';
    }

    el.btnTimerPauseResume.textContent = t.status === 'paused' ? 'Reanudar' : 'Pausar';
    el.btnTimerPauseResume.classList.toggle('hidden', t.status === 'finished');
    el.timerTeacherControls.classList.toggle('hidden', !state.isTeacher);

    // Sync Projector Overlay if visible
    if (!el.timerProjectorModal.classList.contains('hidden')) {
      el.projectorKindBadge.textContent = badgeText;
      el.projectorLabel.textContent = t.label;
      el.projectorDigits.textContent = formatCountdown(remSec);
      el.projectorMessage.textContent = t.message || '';
      el.projectorReturn.textContent = el.timerReturnText.textContent;
      el.projectorProgressFill.style.width = `${pct}%`;
    }

    renderScheduledTimersUI();
  }

  setInterval(() => {
    if (state.timer || (state.scheduledTimers && state.scheduledTimers.length > 0)) {
      renderTimerTick();
    }
  }, 500);

  // --- Server / Network Info ---
  async function loadServerInfo() {
    try {
      const res = await fetch('/api/info');
      if (!res.ok) return;
      state.serverInfo = await res.json();

      if (state.serverInfo.serverTime) {
        state.serverOffsetMs = state.serverInfo.serverTime - Date.now();
      }

      const httpsPort = state.serverInfo.httpsPort || 3443;
      const currentHost = window.location.hostname || state.serverInfo.primaryIP;
      const directHttpsUrl = `https://${currentHost}:${httpsPort}`;

      el.httpsSwitchLink.href = directHttpsUrl;
      el.httpsRequiredUrl.textContent = directHttpsUrl;
      el.httpsRequiredGoBtn.href = directHttpsUrl;
      if (el.btnGoHttpsDirectMobile) el.btnGoHttpsDirectMobile.href = directHttpsUrl;

      if (isMobileDevice) {
        if (el.bannerBatLink) el.bannerBatLink.classList.add('hidden');
        if (el.bannerMobileCertBtn) el.bannerMobileCertBtn.classList.remove('hidden');
        if (el.desktopCertActions) el.desktopCertActions.classList.add('hidden');
        if (el.mobileCertActions) el.mobileCertActions.classList.remove('hidden');
        if (el.httpsBannerText) {
          el.httpsBannerText.innerHTML = 'Estás en un celular o tablet por <strong>HTTP</strong>. Para usar cámara y transmisión en vivo, abre en <strong>HTTPS</strong>.';
        }
        if (el.mobileDetectedBadge) {
          el.mobileDetectedBadge.textContent = isAndroid
            ? '🤖 Celular Android detectado'
            : isIOS
            ? '🍎 iPhone / iPad (iOS) detectado'
            : '📱 Dispositivo móvil detectado';
        }
      }

      if (!window.isSecureContext && window.location.protocol === 'http:') {
        el.httpsBanner.classList.remove('hidden');
      }

      el.lanHttpsUrl.textContent = state.serverInfo.httpsUrl;
      el.lanHttpUrl.textContent = state.serverInfo.httpUrl;
      el.qrCodeImg.src = state.serverInfo.qrHttps;

      const others = (state.serverInfo.localIPs || []).slice(1);
      if (others.length > 0) {
        el.otherInterfacesBox.classList.remove('hidden');
        el.otherInterfacesList.innerHTML = others
          .map(
            (iface) =>
              `<li><strong>${escapeHtml(iface.interfaceName)}:</strong> <code>https://${escapeHtml(
                iface.address
              )}:${httpsPort}</code></li>`
          )
          .join('');
      } else {
        el.otherInterfacesBox.classList.add('hidden');
      }

      refreshTunnelStatus();
    } catch (err) {
      console.warn('No se pudo obtener /api/info:', err);
    }
  }

  // --- Cloudflare Quick Tunnel Management ---
  function updateTunnelUI(status) {
    if (!el.tunnelStatusBadge) return;
    const active = Boolean(status?.active);
    const running = Boolean(status?.running);
    const url = status?.url || '';
    const err = status?.error || '';

    if (active && url) {
      el.tunnelStatusBadge.textContent = 'En línea (Público)';
      el.tunnelStatusBadge.style.background = '#16a34a';
      el.tunnelStatusBadge.style.color = '#fff';
      if (el.tunnelActiveBox) el.tunnelActiveBox.classList.remove('hidden');
      if (el.inputTunnelUrl) el.inputTunnelUrl.value = url;
      if (el.imgTunnelQr) el.imgTunnelQr.src = '/qr?text=' + encodeURIComponent(url);
      if (el.btnToggleTunnel) {
        el.btnToggleTunnel.textContent = '⏹ Detener túnel Cloudflare';
        el.btnToggleTunnel.className = 'btn btn-sm btn-danger';
        el.btnToggleTunnel.disabled = false;
      }
      if (el.tunnelErrorBox) el.tunnelErrorBox.classList.add('hidden');
    } else if (running && !url) {
      el.tunnelStatusBadge.textContent = 'Iniciando túnel...';
      el.tunnelStatusBadge.style.background = '#f59e0b';
      el.tunnelStatusBadge.style.color = '#fff';
      if (el.tunnelActiveBox) el.tunnelActiveBox.classList.add('hidden');
      if (el.btnToggleTunnel) {
        el.btnToggleTunnel.textContent = '⏳ Conectando...';
        el.btnToggleTunnel.disabled = true;
      }
      if (el.tunnelErrorBox) el.tunnelErrorBox.classList.add('hidden');
    } else {
      el.tunnelStatusBadge.textContent = 'Detenido';
      el.tunnelStatusBadge.style.background = '#94a3b8';
      el.tunnelStatusBadge.style.color = '#fff';
      if (el.tunnelActiveBox) el.tunnelActiveBox.classList.add('hidden');
      if (el.btnToggleTunnel) {
        el.btnToggleTunnel.textContent = '▶ Iniciar túnel Cloudflare';
        el.btnToggleTunnel.className = 'btn btn-sm btn-primary';
        el.btnToggleTunnel.disabled = false;
      }
      if (err && el.tunnelErrorBox) {
        el.tunnelErrorBox.textContent = 'Error: ' + err;
        el.tunnelErrorBox.classList.remove('hidden');
      } else if (el.tunnelErrorBox) {
        el.tunnelErrorBox.classList.add('hidden');
      }
    }
  }

  async function refreshTunnelStatus() {
    try {
      const res = await fetch('/api/tunnel');
      if (res.ok) {
        const data = await res.json();
        updateTunnelUI(data);
      }
    } catch {
      // ignore
    }
  }

  if (el.btnToggleTunnel) {
    el.btnToggleTunnel.addEventListener('click', () => {
      el.btnToggleTunnel.disabled = true;
      socket.emit('teacher:tunnel:toggle', { teacherToken: state.teacherToken }, (res) => {
        el.btnToggleTunnel.disabled = false;
        if (!res?.ok) {
          showToast(res?.error || 'No se pudo cambiar estado del túnel', 'error');
        } else {
          updateTunnelUI(res.status);
          showToast(
            res.status?.active ? '☁️ Túnel Cloudflare iniciado con éxito' : 'Túnel detenido',
            res.status?.active ? 'success' : 'info'
          );
        }
      });
    });
  }

  if (el.btnCopyTunnelUrl) {
    el.btnCopyTunnelUrl.addEventListener('click', async () => {
      const url = el.inputTunnelUrl ? el.inputTunnelUrl.value : '';
      if (!url) return;
      try {
        await copyTextToClipboard(url);
        showToast('Enlace de Cloudflare copiado al portapapeles', 'success');
      } catch {
        showToast('No se pudo copiar el enlace', 'error');
      }
    });
  }

  loadServerInfo();

  el.btnDismissHttpsBanner.addEventListener('click', () => {
    el.httpsBanner.classList.add('hidden');
  });

  if (el.bannerMobileCertBtn) {
    el.bannerMobileCertBtn.addEventListener('click', () => {
      openModal(el.mobileCertModal);
    });
  }

  if (el.btnOpenMobileCertGuide) {
    el.btnOpenMobileCertGuide.addEventListener('click', () => {
      closeModal(el.httpsRequiredModal);
      openModal(el.mobileCertModal);
    });
  }

  document.querySelectorAll('[data-copy-target]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = document.getElementById(btn.dataset.copyTarget);
      if (!target) return;
      try {
        await copyTextToClipboard(target.textContent.trim());
        showToast('Enlace copiado al portapapeles', 'success');
      } catch {
        showToast('No se pudo copiar automáticamente', 'error');
      }
    });
  });

  // --- Socket.IO & WebRTC Setup ---
  const socket = io();

  const screenManager = new window.ScreenShareManager(socket, {
    onStreamReady(postId, stream, isLocal) {
      const cardEl = document.querySelector(`.card[data-post-id="${CSS.escape(postId)}"]`);
      if (!cardEl) return;
      attachVideoUI(cardEl, postId, stream, isLocal);
    },
    onStreamStopped(postId) {
      const post = state.posts.find((p) => p.id === postId);
      if (post) {
        post.screenShare = null;
      }
      refreshCard(postId);
      renderTopicBar();
    },
    onConnectionState(postId, connState) {
      const cardEl = document.querySelector(`.card[data-post-id="${CSS.escape(postId)}"]`);
      if (!cardEl) return;
      const statusOverlay = cardEl.querySelector('.screen-status-center');
      if (!statusOverlay) return;

      if (connState === 'connected') {
        statusOverlay.classList.add('hidden');
      } else if (connState === 'failed' || connState === 'disconnected') {
        statusOverlay.classList.remove('hidden');
        const msg = statusOverlay.querySelector('.screen-status-msg');
        if (msg) msg.textContent = 'Conexión de video interrumpida';
      }
    },
  });

  socket.on('connect', () => {
    state.socketId = socket.id;
    el.connectionDot.classList.remove('offline');
    authorId = getEffectiveAuthorId();
    socket.emit('client:register', {
      authorId,
      authorName: state.isTeacher ? (state.teacherName || 'Docente') : (authorName || 'Alumno'),
      teacherToken: state.teacherToken,
      teacherName: state.teacherName,
    });
  });

  socket.on('disconnect', () => {
    el.connectionDot.classList.add('offline');
  });

  function sortPostsInPlace() {
    state.posts.sort((a, b) => {
      if (Boolean(b.pinned) !== Boolean(a.pinned)) {
        return b.pinned ? 1 : -1;
      }
      const orderA = typeof a.order === 'number' ? a.order : 0;
      const orderB = typeof b.order === 'number' ? b.order : 0;
      if (orderA !== orderB) return orderA - orderB;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  function isTeacherPost(post) {
    if (!post) return false;
    if (post.isTeacher || post.authorRole === 'teacher' || post.authorIsTeacher) return true;
    if (post.author === 'Profesor') return true;
    if (state.board?.teacherName && post.author === state.board.teacherName) return true;
    return false;
  }

  function isScreenPost(post) {
    return post?.kind === 'screen';
  }

  function getPadletPosts() {
    return state.posts.filter((p) => !isScreenPost(p));
  }

  function getScreenPosts() {
    const myAuthorId = authorId;
    return state.posts
      .filter((p) => isScreenPost(p))
      .sort((a, b) => {
        const aLive = a.screenShare?.active ? 1 : 0;
        const bLive = b.screenShare?.active ? 1 : 0;
        if (bLive !== aLive) return bLive - aLive;

        // 1. Teacher screen ALWAYS first
        const aIsTeacher = isTeacherPost(a) ? 1 : 0;
        const bIsTeacher = isTeacherPost(b) ? 1 : 0;
        if (bIsTeacher !== aIsTeacher) return bIsTeacher - aIsTeacher;

        // 2. If student, student's own screen comes next
        if (!state.isTeacher) {
          const aIsMine = a.authorId === myAuthorId ? 1 : 0;
          const bIsMine = b.authorId === myAuthorId ? 1 : 0;
          if (bIsMine !== aIsMine) return bIsMine - aIsMine;
        }

        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }

  function updateWorkspaceTabBadges() {
    const padletsCount = getPadletPosts().length;
    const liveScreens = state.posts.filter((p) => p.screenShare?.active).length;
    const queueLen = (state.screenQueue || []).length;

    el.tabPadletsCount.textContent = String(padletsCount);

    if (liveScreens > 0) {
      el.tabScreensLiveBadge.textContent = `${liveScreens} en vivo`;
      el.tabScreensLiveBadge.classList.remove('hidden');
    } else {
      el.tabScreensLiveBadge.classList.add('hidden');
    }

    if (queueLen > 0) {
      el.tabQueueBadge.textContent = `${queueLen} en cola`;
      el.tabQueueBadge.classList.remove('hidden');
    } else {
      el.tabQueueBadge.classList.add('hidden');
    }

    el.screensCountLabel.textContent =
      liveScreens === 1 ? '1 pantalla en vivo' : `${liveScreens} pantallas en vivo`;
  }

  function applyWorkspaceView(view) {
    const valid = view === 'screens' || view === 'both' ? view : 'padlets';
    state.workspaceView = valid;
    localStorage.setItem('padletlocal_workspace_view', valid);

    el.workspaceTabs.querySelectorAll('.workspace-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.workspaceView === valid);
    });

    el.padletsSection.classList.toggle('hidden', valid === 'screens');
    el.screensSection.classList.toggle('hidden', valid === 'padlets');
  }

  el.workspaceTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.workspace-tab');
    if (!btn) return;
    applyWorkspaceView(btn.dataset.workspaceView);
  });

  function renderScreenQueue() {
    const queue = state.screenQueue || [];
    el.btnClearQueue.classList.toggle('hidden', !state.isTeacher || queue.length === 0);
    el.queueCountLabel.textContent =
      queue.length === 0
        ? 'Nadie en espera'
        : queue.length === 1
        ? '1 persona en espera'
        : `${queue.length} personas en espera`;

    if (queue.length === 0) {
      el.screenQueueList.innerHTML =
        '<div class="queue-empty">No hay usuarios en cola. Haz clic en <strong>+ Pedir turno</strong> para solicitar compartir tu pantalla.</div>';
      updateWorkspaceTabBadges();
      return;
    }

    el.screenQueueList.innerHTML = queue
      .map((item, idx) => {
        const isMine = item.authorId === authorId;
        const isCalled = item.status === 'called';
        return `
          <div class="queue-item ${isMine ? 'is-mine' : ''} ${isCalled ? 'is-called' : ''}" data-queue-id="${escapeHtml(item.id)}">
            <div class="queue-item-top">
              <div class="queue-person">
                <span class="queue-pos">${idx + 1}</span>
                <span class="queue-name">${escapeHtml(item.author)}${isMine ? ' (Tú)' : ''}</span>
              </div>
              <span class="post-time">${formatRelativeTime(item.createdAt)}</span>
            </div>
            <div class="queue-reason"><strong>Motivo:</strong> ${escapeHtml(item.reason)}</div>
            <div class="queue-item-actions">
              <span class="queue-status-tag">${isCalled ? '▶ Turno asignado' : '⏳ En espera'}</span>
              <div style="display:flex;gap:5px;flex-wrap:wrap;">
                ${
                  state.isTeacher
                    ? `<button type="button" class="btn btn-sm btn-primary" data-queue-action="call" title="Dar paso a este usuario para compartir pantalla">▶ Dar turno</button>
                       <button type="button" class="btn btn-sm btn-ghost" data-queue-action="remove" title="Quitar de la cola">✕</button>`
                    : ''
                }
                ${
                  isMine
                    ? `<button type="button" class="btn btn-sm btn-secondary" data-queue-action="leave">Salir</button>`
                    : ''
                }
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    updateWorkspaceTabBadges();
  }

  el.screenQueueList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-queue-action]');
    if (!btn) return;
    const itemEl = btn.closest('.queue-item');
    if (!itemEl) return;
    const id = itemEl.dataset.queueId;
    const action = btn.dataset.queueAction;

    if (action === 'leave') {
      socket.emit('screen-queue:leave', { id, authorId }, () => {
        showToast('Saliste de la cola de compartidos');
      });
    } else if (action === 'call') {
      socket.emit(
        'teacher:screen-queue:call',
        { id, teacherToken: state.teacherToken, teacherName: authorName || 'Profesor' },
        (res) => {
          if (!res?.ok) showToast(res?.error || 'No se pudo dar turno', 'error');
          else showToast(`▶ Turno enviado a ${res.entry?.author || 'el usuario'}`, 'success');
        }
      );
    } else if (action === 'remove') {
      socket.emit('teacher:screen-queue:remove', { id, teacherToken: state.teacherToken });
    }
  });

  el.btnClearQueue.addEventListener('click', async () => {
    const ok = await Swal.confirm(
      '¿Limpiar cola de compartidos?',
      '¿Deseas quitar a todos los usuarios de la cola de espera para compartir pantalla?',
      { icon: 'warning', confirmButtonText: 'Sí, limpiar cola', confirmButtonColor: '#ef4444' }
    );
    if (!ok) return;
    socket.emit('teacher:screen-queue:clear', { teacherToken: state.teacherToken });
  });

  function matchesScreenFilters(post) {
    if (!isScreenPost(post)) return false;
    const q = (state.screenSearchQuery || '').trim().toLowerCase();
    if (q) {
      const haystack = `${post.author || ''} ${post.topic || ''} ${post.content || ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }

  function renderScreensGrid() {
    const allScreens = getScreenPosts();
    const screens = allScreens.filter(matchesScreenFilters);
    el.screensGrid.innerHTML = '';

    if (allScreens.length === 0) {
      el.screensEmptyState.classList.remove('hidden');
      updateWorkspaceTabBadges();
      return;
    }

    el.screensEmptyState.classList.add('hidden');

    if (screens.length === 0) {
      const noResults = document.createElement('div');
      noResults.className = 'screens-no-results';
      noResults.style.cssText = 'grid-column: 1 / -1; text-align: center; padding: 36px 16px; color: var(--text-muted); font-size: 0.95rem;';
      noResults.innerHTML = `🔍 No se encontraron pantallas compartidas que coincidan con "<strong>${escapeHtml(state.screenSearchQuery)}</strong>".`;
      el.screensGrid.appendChild(noResults);
      updateScreensDensity();
      updateWorkspaceTabBadges();
      return;
    }

    const fragment = document.createDocumentFragment();
    screens.forEach((post) => {
      fragment.appendChild(buildCardElement(post));
    });
    el.screensGrid.appendChild(fragment);

    screens.forEach((post) => {
      if (post.screenShare?.active) {
        const cardEl = el.screensGrid.querySelector(`.card[data-post-id="${CSS.escape(post.id)}"]`);
        if (cardEl) syncCardStream(cardEl, post);
      }
    });

    updateScreensDensity();
    updateWorkspaceTabBadges();
  }

  if (el.screenSearchInput) {
    el.screenSearchInput.addEventListener('input', (e) => {
      state.screenSearchQuery = e.target.value;
      renderScreensGrid();
    });
  }

  // --- Multi-Session Class Management, Session Picker & Clean/Reset Controls ---
  function renderSessionStatusBanner() {
    const hasSession = Boolean(state.activeSessionId);
    const isPublished = state.sessionStatus?.isPublished !== false;
    const isClosed = Boolean(state.sessionStatus?.isClosed);
    const readOnlyForMe = !state.isTeacher && (!hasSession || isClosed || !isPublished);

    // Disable creation controls for students if session is closed or no session selected
    [
      el.btnNewPost,
      el.fabNewPost,
      el.btnOpenScreenModal,
      el.btnEasyPublish,
      el.btnEasyShare,
      el.btnQueueJoinQuick,
      el.btnShareScreenFromTab,
    ].forEach((btn) => {
      if (btn) btn.disabled = readOnlyForMe;
    });

    if (!hasSession) {
      el.sessionStatusBanner.classList.remove('hidden', 'is-unpublished');
      el.sessionStatusText.textContent = '📚 No hay ninguna sesión seleccionada o habilitada en este momento.';
      el.sessionStatusActions.innerHTML = `<button type="button" class="btn btn-sm btn-primary" data-status-banner-action="pick">Elegir sesión</button>`;
      return;
    }

    if (!isPublished && state.isTeacher) {
      el.sessionStatusBanner.classList.remove('hidden');
      el.sessionStatusBanner.classList.add('is-unpublished');
      el.sessionStatusText.textContent =
        '👁️‍🗨️ Esta sesión está despublicada (borrador privado — los alumnos no pueden verla ni entrar).';
      el.sessionStatusActions.innerHTML = `<button type="button" class="btn btn-sm btn-primary" data-status-banner-action="publish">📢 Publicar para alumnos</button>`;
      return;
    }

    if (isClosed) {
      el.sessionStatusBanner.classList.remove('hidden', 'is-unpublished');
      el.sessionStatusText.textContent = state.isTeacher
        ? '🔒 Sesión cerrada (los alumnos solo pueden leer; no pueden publicar ni compartir pantalla).'
        : '🔒 Esta sesión fue cerrada por el profesor (solo lectura).';
      el.sessionStatusActions.innerHTML = state.isTeacher
        ? `<button type="button" class="btn btn-sm btn-primary" data-status-banner-action="reopen">🔓 Abrir sesión</button>`
        : `<button type="button" class="btn btn-sm btn-secondary" data-status-banner-action="pick">Cambiar de sesión</button>`;
      return;
    }

    el.sessionStatusBanner.classList.add('hidden');
  }

  el.sessionStatusActions.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-status-banner-action]');
    if (!btn) return;
    const action = btn.dataset.statusBannerAction;
    if (action === 'pick') {
      openSessionPicker({ required: !state.activeSessionId });
    } else if (action === 'publish') {
      socket.emit(
        'teacher:session:set-status',
        { teacherToken: state.teacherToken, sessionId: state.activeSessionId, isPublished: true },
        (ack) => {
          if (ack?.ok) showToast('📢 Sesión habilitada para todos los alumnos', 'success');
        }
      );
    } else if (action === 'reopen') {
      socket.emit(
        'teacher:session:set-status',
        { teacherToken: state.teacherToken, sessionId: state.activeSessionId, isClosed: false },
        (ack) => {
          if (ack?.ok) showToast('🔓 Sesión reabierta para recibir respuestas', 'success');
        }
      );
    }
  });

  function renderSessionPickerList() {
    const sessions = state.sessions || [];
    el.btnPickerTeacherLogin.classList.toggle('hidden', state.isTeacher);
    el.btnPickerManageSessions.classList.toggle('hidden', !state.isTeacher);
    el.sessionPickerIntro.textContent = state.isTeacher
      ? 'Como profesor ves todas las sesiones (habilitadas, despublicadas y cerradas). Elige en cuál trabajar:'
      : 'Elige una de las sesiones habilitadas por el profesor para entrar:';

    if (sessions.length === 0) {
      el.sessionPickerList.innerHTML = `<div class="queue-empty">El profesor aún no ha habilitado ninguna sesión de clase.<br/>Espera un momento o pregunta al profesor.</div>`;
      return;
    }

    el.sessionPickerList.innerHTML = sessions
      .map((s) => {
        const isCurrent = s.id === state.activeSessionId;
        const isPub = s.isPublished !== false;
        const isClosed = Boolean(s.isClosed);
        return `
          <div class="session-picker-card ${isCurrent ? 'is-current' : ''} ${!isPub ? 'is-unpublished' : ''}" data-pick-session-id="${escapeHtml(s.id)}">
            <div class="session-item-info">
              <div class="session-item-title-row">
                <strong>${escapeHtml(s.name)}</strong>
                ${isCurrent ? '<span class="session-active-tag">Aquí estás</span>' : ''}
                ${isPub ? '<span class="session-tag-pub">🟢 Habilitada</span>' : '<span class="session-tag-unpub">👁️‍🗨️ Despublicada</span>'}
                ${isClosed ? '<span class="session-tag-closed">🔒 Cerrada</span>' : ''}
              </div>
              ${s.description ? `<div class="session-item-meta">${escapeHtml(s.description)}</div>` : ''}
              <div class="session-item-meta">
                ${s.padletCount} ${s.padletCount === 1 ? 'Padlet' : 'Padlets'}
                ${s.screenCount > 0 ? ` · ${s.screenCount} pantallas` : ''}
                ${s.quizCount > 0 ? ` · ${s.quizCount} tests` : ''}
              </div>
            </div>
            <button type="button" class="btn btn-sm ${isCurrent ? 'btn-secondary' : 'btn-primary'}" data-pick-enter="${escapeHtml(s.id)}">
              ${isCurrent ? 'Continuar aquí' : '▶ Entrar'}
            </button>
          </div>
        `;
      })
      .join('');
  }

  function openSessionPicker({ required = false } = {}) {
    renderSessionPickerList();
    el.btnCloseSessionPicker.classList.toggle('hidden', required && !state.activeSessionId);
    openModal(el.sessionPickerModal);
  }

  el.sessionPickerList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pick-enter]');
    if (!btn) return;
    const sessionId = btn.dataset.pickEnter;
    state.hasChosenSession = true;

    if (sessionId === state.activeSessionId) {
      closeModal(el.sessionPickerModal);
      return;
    }

    btn.disabled = true;
    socket.emit(
      'session:join',
      { sessionId, teacherToken: state.teacherToken },
      (ack) => {
        btn.disabled = false;
        if (!ack?.ok) {
          showToast(ack?.error || 'No se pudo entrar a esa sesión', 'error');
          return;
        }
        closeModal(el.sessionPickerModal);
        showToast(`📚 Entraste a "${ack.snapshot?.board?.title || 'la sesión'}"`, 'success');
      }
    );
  });

  el.btnPickerTeacherLogin.addEventListener('click', () => {
    closeModal(el.sessionPickerModal);
    openTeacherPanel('sessions');
  });

  el.btnPickerManageSessions.addEventListener('click', () => {
    closeModal(el.sessionPickerModal);
    openTeacherPanel('sessions');
  });

  function renderSessionsUI() {
    const sessions = state.sessions || [];
    el.sessionsCountNum.textContent = String(sessions.length);

    // Show session switcher pill in header for everyone so users/teachers can choose/switch sessions anytime
    const currentSession = sessions.find((s) => s.id === state.activeSessionId) || sessions[0];
    const currentSessionName = currentSession ? currentSession.name : 'Principal';
    el.activeSessionBadge.classList.remove('hidden');
    el.activeSessionBadge.innerHTML = `
      <span class="session-badge-icon">📚</span>
      <span class="session-badge-label">Sesión:</span>
      <strong class="session-name-text">${escapeHtml(currentSessionName)}</strong>
      ${sessions.length > 1 ? `<span class="session-badge-count">(${sessions.length})</span>` : ''}
    `;
    el.activeSessionBadge.title = `Sesión actual: ${currentSessionName}. Clic para ver o cambiar entre ${sessions.length} sesiones`;

    if (sessions.length === 0) {
      el.sessionsList.innerHTML = '<div class="muted-note">Sin sesiones registradas.</div>';
      return;
    }

    el.sessionsList.innerHTML = sessions
      .map((s) => {
        const isCurrent = s.id === state.activeSessionId;
        const isPub = s.isPublished !== false;
        const isClosed = Boolean(s.isClosed);
        const isHiddenStudents = Boolean(s.hideFromStudents);
        return `
          <div class="session-item ${isCurrent ? 'is-active' : ''} ${!isPub ? 'is-unpublished' : ''}" data-session-id="${escapeHtml(s.id)}">
            <div class="session-item-info">
              <div class="session-item-title-row">
                <strong>${escapeHtml(s.name)}</strong>
                ${isCurrent ? '<span class="session-active-tag">Actual</span>' : ''}
                ${isPub ? '<span class="session-tag-pub">Habilitada</span>' : '<span class="session-tag-unpub">Despublicada</span>'}
                ${isClosed ? '<span class="session-tag-closed">Cerrada</span>' : ''}
                ${isHiddenStudents ? '<span class="session-tag-hidden">🚫 Sin acceso alumnos</span>' : ''}
              </div>
              <div class="session-item-meta">
                ${s.padletCount} ${s.padletCount === 1 ? 'Padlet' : 'Padlets'}
                ${s.screenCount > 0 ? ` · ${s.screenCount} pantallas` : ''}
                ${s.hiddenCount > 0 ? ` · ${s.hiddenCount} ocultos` : ''}
                ${s.quizCount > 0 ? ` · ${s.quizCount} tests` : ''}
                · creada ${formatRelativeTime(s.createdAt)}
              </div>
            </div>
            <div class="session-item-actions">
              ${
                !isCurrent
                  ? `<button type="button" class="btn btn-sm btn-primary" data-session-action="switch">▶ Entrar</button>`
                  : ''
              }
              <button type="button" class="btn btn-sm btn-secondary" data-session-action="toggle-publish" title="${
                isPub ? 'Despublicar (ocultar para los alumnos)' : 'Publicar / habilitar para los alumnos'
              }">${isPub ? '👁️‍🗨️ Despublicar' : '📢 Publicar'}</button>
              <button type="button" class="btn btn-sm btn-secondary" data-session-action="toggle-hide-students" title="${
                isHiddenStudents ? 'Permitir acceso a los alumnos' : 'Ocultar y bloquear completamente para alumnos'
              }">${isHiddenStudents ? '👁️ Permitir Alumnos' : '🚫 Ocultar Alumnos'}</button>
              <button type="button" class="btn btn-sm btn-secondary" data-session-action="toggle-close" title="${
                isClosed ? 'Volver a abrir para recibir respuestas' : 'Cerrar sesión (solo lectura para alumnos)'
              }">${isClosed ? '🔓 Abrir' : '🔒 Cerrar'}</button>
              <button type="button" class="btn btn-sm btn-secondary" data-session-action="rename" title="Renombrar sesión">✏️</button>
              <button type="button" class="btn btn-sm btn-live" data-session-action="delete" title="Eliminar sesión de clase">🗑️</button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  el.activeSessionBadge.addEventListener('click', () => {
    openSessionPicker({ required: false });
  });

  el.createSessionForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = el.newSessionNameInput.value.trim();
    const description = el.newSessionDescInput.value.trim();
    const isPublished = el.newSessionPublishCheck.checked;
    const hideFromStudents = Boolean(el.newSessionHideStudentsCheck?.checked);
    const activate = el.newSessionActivateCheck.checked;
    if (!name) {
      showToast('Escribe un nombre para la nueva sesión de clase', 'error');
      return;
    }

    el.btnCreateSession.disabled = true;
    socket.emit(
      'teacher:session:create',
      { teacherToken: state.teacherToken, name, description, isPublished, hideFromStudents, activate },
      (ack) => {
        el.btnCreateSession.disabled = false;
        if (!ack?.ok) {
          showToast(ack?.error || 'No se pudo crear la sesión', 'error');
          return;
        }
        el.newSessionNameInput.value = '';
        el.newSessionDescInput.value = '';
        if (el.newSessionHideStudentsCheck) el.newSessionHideStudentsCheck.checked = false;
        if (activate) {
          state.hasChosenSession = true;
          closeModal(el.teacherPanelModal);
          showToast(
            hideFromStudents
              ? `Nueva sesión privada sin acceso para alumnos: "${name}"`
              : isPublished
              ? `Nueva sesión habilitada: "${name}"`
              : `Nueva sesión privada (despublicada): "${name}"`,
            'success'
          );
        } else {
          showToast(`Sesión "${name}" creada`, 'success');
        }
      }
    );
  });

  el.sessionsList.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-session-action]');
    if (!btn) return;
    const itemEl = btn.closest('.session-item');
    if (!itemEl) return;
    const sessionId = itemEl.dataset.sessionId;
    const session = (state.sessions || []).find((s) => s.id === sessionId);
    const action = btn.dataset.sessionAction;

    if (action === 'switch') {
      state.hasChosenSession = true;
      socket.emit('teacher:session:switch', { teacherToken: state.teacherToken, sessionId }, (ack) => {
        if (!ack?.ok) showToast(ack?.error || 'No se pudo cambiar de sesión', 'error');
        else {
          closeModal(el.teacherPanelModal);
          showToast(`Entraste a la sesión "${session?.name || ''}"`, 'success');
        }
      });
    } else if (action === 'toggle-publish') {
      const nextPub = !(session?.isPublished !== false);
      if (!nextPub) {
        const ok = await Swal.confirm(
          '¿Despublicar sesión?',
          `¿Despublicar la sesión <strong>"${escapeHtml(session?.name || '')}"</strong>?<br><br>Dejará de estar visible para los alumnos y quienes estén dentro pasarán al selector de sesiones habilitadas.`,
          { icon: 'warning', confirmButtonText: 'Sí, despublicar', confirmButtonColor: '#f59e0b' }
        );
        if (!ok) return;
      }
      socket.emit(
        'teacher:session:set-status',
        { teacherToken: state.teacherToken, sessionId, isPublished: nextPub },
        (ack) => {
          if (!ack?.ok) showToast(ack?.error || 'No se pudo actualizar', 'error');
          else showToast(nextPub ? '📢 Sesión publicada y habilitada' : '👁️‍🗨️ Sesión despublicada (oculta para alumnos)', 'success');
        }
      );
    } else if (action === 'toggle-hide-students') {
      const nextHide = !Boolean(session?.hideFromStudents);
      if (nextHide) {
        const ok = await Swal.confirm(
          '¿Ocultar sesión a alumnos?',
          `¿Ocultar la sesión <strong>"${escapeHtml(session?.name || '')}"</strong> a todos los alumnos?<br><br>Dejará de aparecer en la lista de alumnos y ningún alumno podrá entrar. Solo los profesores con Clave Maestra podrán ingresar.`,
          { icon: 'warning', confirmButtonText: 'Sí, ocultar', confirmButtonColor: '#ef4444' }
        );
        if (!ok) return;
      }
      socket.emit(
        'teacher:session:set-status',
        { teacherToken: state.teacherToken, sessionId, hideFromStudents: nextHide },
        (ack) => {
          if (!ack?.ok) showToast(ack?.error || 'No se pudo actualizar', 'error');
          else showToast(nextHide ? '🚫 Sesión oculta y sin acceso a alumnos' : '👁️ Sesión visible y disponible para alumnos', 'success');
        }
      );
    } else if (action === 'toggle-close') {
      const nextClosed = !Boolean(session?.isClosed);
      socket.emit(
        'teacher:session:set-status',
        { teacherToken: state.teacherToken, sessionId, isClosed: nextClosed },
        (ack) => {
          if (!ack?.ok) showToast(ack?.error || 'No se pudo actualizar', 'error');
          else showToast(nextClosed ? '🔒 Sesión cerrada (solo lectura para alumnos)' : '🔓 Sesión abierta nuevamente', 'success');
        }
      );
    } else if (action === 'rename') {
      const nextName = window.prompt('Nuevo nombre para esta sesión de clase:', session?.name || '');
      if (!nextName || !nextName.trim()) return;
      socket.emit(
        'teacher:session:rename',
        { teacherToken: state.teacherToken, sessionId, name: nextName.trim() },
        (ack) => {
          if (!ack?.ok) showToast(ack?.error || 'No se pudo renombrar', 'error');
          else showToast('Sesión renombrada', 'success');
        }
      );
    } else if (action === 'delete') {
      const ok = await Swal.confirm(
        '¿Eliminar sesión?',
        state.sessions.length <= 1
          ? `¿Eliminar la sesión <strong>"${escapeHtml(session?.name || '')}"</strong>? Se borrarán todas sus publicaciones e imágenes y se creará una sesión nueva en blanco.`
          : `¿Eliminar permanentemente la sesión <strong>"${escapeHtml(session?.name || '')}"</strong> y todas sus publicaciones e imágenes?`,
        { icon: 'warning', confirmButtonText: 'Sí, eliminar', confirmButtonColor: '#ef4444' }
      );
      if (!ok) return;
      socket.emit('teacher:session:delete', { teacherToken: state.teacherToken, sessionId }, (ack) => {
        if (!ack?.ok) showToast(ack?.error || 'No se pudo eliminar la sesión', 'error');
        else showToast('Sesión eliminada', 'success');
      });
    }
  });

  el.btnClearSessionPosts.addEventListener('click', async () => {
    const ok = await Swal.confirm(
      '¿Limpiar respuestas de la sesión?',
      `¿Limpiar TODAS las respuestas (Padlets y Pantallas) de <strong>"${escapeHtml(state.board.title)}"</strong>?<br><br>Se conservarán los Temas de Tareas y el título de la sesión.`,
      { icon: 'warning', confirmButtonText: 'Sí, limpiar', confirmButtonColor: '#ef4444' }
    );
    if (!ok) return;
    socket.emit('teacher:session:clear-posts', { teacherToken: state.teacherToken }, (ack) => {
      if (!ack?.ok) showToast(ack?.error || 'No se pudo limpiar el panel', 'error');
      else {
        closeModal(el.teacherPanelModal);
        showToast('🧹 Respuestas limpiadas correctamente', 'success');
      }
    });
  });

  el.btnResetSessionFull.addEventListener('click', async () => {
    const ok = await Swal.confirm(
      '¿Reiniciar POR COMPLETO la sesión?',
      `¿Reiniciar POR COMPLETO la sesión <strong>"${escapeHtml(state.board.title)}"</strong>?<br><br>Se eliminarán todas las respuestas, imágenes, tareas, avisos y temporizadores de esta sesión.`,
      { icon: 'warning', confirmButtonText: 'Sí, reiniciar todo', confirmButtonColor: '#ef4444' }
    );
    if (!ok) return;
    socket.emit('teacher:session:reset', { teacherToken: state.teacherToken }, (ack) => {
      if (!ack?.ok) showToast(ack?.error || 'No se pudo reiniciar la sesión', 'error');
      else {
        closeModal(el.teacherPanelModal);
        showToast('🔄 Sesión reiniciada desde cero', 'success');
      }
    });
  });

  // --- Teacher Students & Participants Management (Expulsar / Deshabilitar) ---
  function loadTeacherStudents() {
    if (!state.isTeacher) return;
    socket.emit(
      'teacher:students:list',
      {
        teacherToken: state.teacherToken,
        sessionId: state.activeSessionId,
      },
      (res) => {
        if (!res?.ok) {
          if (el.teacherStudentsList) {
            el.teacherStudentsList.innerHTML = `<div class="muted-note" style="text-align:center;padding:24px;color:var(--danger,#ef4444);">${escapeHtml(
              res?.error || 'No se pudo cargar la lista de alumnos.'
            )}</div>`;
          }
          return;
        }
        state.studentsList = Array.isArray(res.students) ? res.students : [];
        renderTeacherStudentsList();
      }
    );
  }

  function renderTeacherStudentsList() {
    if (!el.teacherStudentsList) return;
    const q = (state.studentsSearchQuery || '').trim().toLowerCase();
    const students = (state.studentsList || []).filter((s) => {
      if (!q) return true;
      return (s.name || '').toLowerCase().includes(q);
    });

    if (students.length === 0) {
      el.teacherStudentsList.innerHTML = `
        <div class="muted-note" style="text-align:center;padding:32px;color:var(--text-muted);">
          ${
            q
              ? `No se encontraron participantes que coincidan con "${escapeHtml(state.studentsSearchQuery)}".`
              : 'No hay participantes registrados en esta sesión aún.'
          }
        </div>
      `;
      return;
    }

    el.teacherStudentsList.innerHTML = students
      .map((s) => {
        const isMe = s.authorId === authorId;
        const isOnline = Boolean(s.isOnline);
        const isDisabled = Boolean(s.isDisabled);
        const isTeacher = Boolean(s.isTeacher);
        const postsCount = s.postsCount || 0;

        return `
        <div class="teacher-student-item ${isDisabled ? 'is-disabled' : ''}" data-student-id="${escapeHtml(
          s.authorId || ''
        )}" data-student-name="${escapeHtml(s.name)}">
          <div class="teacher-student-info">
            <div class="avatar" style="background:${getAvatarColor(s.authorId || s.name)}">${escapeHtml(
              getInitials(s.name)
            )}</div>
            <div style="min-width:0;flex:1;">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <span class="teacher-student-name">${escapeHtml(s.name)}</span>
                ${isMe ? '<span class="you-tag">Tú</span>' : ''}
                ${
                  isTeacher
                    ? '<span class="badge" style="background:#4f46e5;color:#fff;font-size:0.68rem;padding:1px 6px;border-radius:4px;">🎓 Docente</span>'
                    : '<span class="badge" style="background:#94a3b8;color:#fff;font-size:0.68rem;padding:1px 6px;border-radius:4px;">🎒 Alumno</span>'
                }
                ${
                  isOnline
                    ? '<span style="font-size:0.68rem;color:#16a34a;font-weight:600;">🟢 En línea</span>'
                    : '<span style="font-size:0.68rem;color:var(--text-muted);">⚪ Desconectado</span>'
                }
                ${
                  isDisabled
                    ? '<span class="hidden-tag" style="font-size:0.68rem;padding:1px 6px;">🚫 Deshabilitado</span>'
                    : ''
                }
              </div>
              <div class="teacher-student-meta">
                <span>📝 ${postsCount} ${postsCount === 1 ? 'padlet' : 'padlets'}</span>
                ${isDisabled && s.disabledAt ? `<span>· Deshabilitado ${formatRelativeTime(s.disabledAt)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="teacher-student-actions">
            ${
              !isTeacher
                ? `
              <button type="button" class="btn btn-sm btn-secondary" data-student-action="toggle-disable" data-student-id="${escapeHtml(
                s.authorId || ''
              )}" data-student-name="${escapeHtml(s.name)}" title="${
                    isDisabled ? 'Habilitar nuevamente a este alumno' : 'Deshabilitar al alumno (modo solo lectura)'
                  }">
                ${isDisabled ? '✅ Habilitar' : '🚫 Deshabilitar'}
              </button>
              <button type="button" class="btn btn-sm btn-danger" data-student-action="kick" data-student-id="${escapeHtml(
                s.authorId || ''
              )}" data-student-name="${escapeHtml(s.name)}" title="Expulsar al alumno de la clase">
                👢 Expulsar
              </button>
            `
                : ''
            }
          </div>
        </div>
      `;
      })
      .join('');
  }

  if (el.teacherStudentsList) {
    el.teacherStudentsList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-student-action]');
      if (!btn) return;
      const action = btn.dataset.studentAction;
      const sId = btn.dataset.studentId;
      const sName = btn.dataset.studentName;

      if (action === 'toggle-disable') {
        socket.emit(
          'teacher:student:toggle-disable',
          {
            teacherToken: state.teacherToken,
            sessionId: state.activeSessionId,
            authorId: sId,
            authorName: sName,
          },
          (res) => {
            if (!res?.ok) {
              showToast(res?.error || 'No se pudo cambiar estado del alumno', 'error');
            } else {
              showToast(
                res.disabled
                  ? `🚫 ${sName} ha sido deshabilitado (modo solo lectura)`
                  : `✅ ${sName} ha sido habilitado nuevamente`,
                res.disabled ? 'info' : 'success'
              );
              loadTeacherStudents();
            }
          }
        );
      } else if (action === 'kick') {
        Swal.confirm(
          '¿Expulsar participante?',
          `¿Expulsar a <strong>"${escapeHtml(sName)}"</strong> de la sesión de clase actual? Se cerrará su conexión.`,
          { icon: 'warning', confirmButtonText: 'Sí, expulsar', confirmButtonColor: '#ef4444' }
        ).then((ok) => {
          if (!ok) return;
          socket.emit(
            'teacher:student:kick',
            {
              teacherToken: state.teacherToken,
              sessionId: state.activeSessionId,
              authorId: sId,
              authorName: sName,
              reason: 'Expulsado de la clase por el profesor.',
            },
            (res) => {
              if (!res?.ok) {
                showToast(res?.error || 'No se pudo expulsar al alumno', 'error');
              } else {
                showToast(`👞 ${sName} ha sido expulsado de la sesión`, 'info');
                loadTeacherStudents();
              }
            }
          );
        });
      }
    });
  }

  if (el.btnRefreshStudentsList) {
    el.btnRefreshStudentsList.addEventListener('click', () => {
      loadTeacherStudents();
      showToast('Lista de participantes actualizada');
    });
  }

  if (el.inputSearchStudents) {
    el.inputSearchStudents.addEventListener('input', (e) => {
      state.studentsSearchQuery = e.target.value;
      renderTeacherStudentsList();
    });
  }

  function applySessionSnapshot(data, { isSessionChange = false } = {}) {
    if (data.socketId) state.socketId = data.socketId;
    if (data.serverTime) {
      state.serverOffsetMs = data.serverTime - Date.now();
    }
    if (isSessionChange) {
      screenManager.stopAll();
      state.activeTopic = '__ALL__';
      state.expandedTaskId = null;
      state.focusedCardId = null;
      state.expandedCards.clear();
      state.openComments.clear();
      state.unreadNotifications = 0;
      updateNotifBadge();
      resetAssignmentFormToNew();
    }

    const prevSessionId = state.activeSessionId;
    state.activeSessionId = data.sessionId !== undefined ? data.sessionId : data.activeSessionId || null;
    if (isSessionChange || (state.activeSessionId && state.activeSessionId !== prevSessionId)) {
      syncSessionStartTime(state.activeSessionId);
      updateTopbarClockAndSessionTimer();
    }
    state.sessionStatus = data.sessionStatus || { isPublished: true, isClosed: false };
    if (Array.isArray(data.sessions)) {
      state.sessions = data.sessions;
    }
    state.board = data.board || state.board;
    state.posts = Array.isArray(data.posts) ? data.posts : [];
    sortPostsInPlace();

    state.assignment = data.assignment || null;
    state.assignmentHistory = Array.isArray(data.assignmentHistory) ? data.assignmentHistory : [];
    state.notifications = Array.isArray(data.notifications) ? data.notifications : [];
    state.timer = data.timer || null;
    state.scheduledTimers = Array.isArray(data.scheduledTimers) ? data.scheduledTimers : [];
    state.screenQueue = Array.isArray(data.screenQueue) ? data.screenQueue : [];

    renderBoardMeta();
    renderSessionStatusBanner();
    renderSessionsUI();
    renderSessionPickerList();
    renderAssignmentBanner();
    renderAssignmentHistory();
    renderTimerTick();
    renderScreenQueue();
    if (data.onlineCount) el.onlineCount.textContent = String(data.onlineCount);
    renderTopicBar();
    renderBoardFull();
    renderScreensGrid();
    applyWorkspaceView(state.workspaceView);
    if (el.chatSessionBadge) {
      el.chatSessionBadge.textContent = state.board?.title || 'Clase';
    }
    if (Array.isArray(state.chatUsers)) {
      state.chatUsers.forEach((u) => {
        if (u.authorId === changedAuthorId) u.name = newName;
      });
      renderChatUsers(state.chatUsers);
    }

    if (state.isChatOpen) {
      socket.emit('chat:history', { sessionId: state.activeSessionId }, (res) => {
        if (res?.ok && Array.isArray(res.messages)) renderChatMessages(res.messages);
      });
    }
    if (window.PadletQuiz) {
      window.PadletQuiz.onSessionSnapshot(data);
    }

    state.posts.forEach((post) => {
      if (post.screenShare?.active && post.screenShare.sharerSocketId !== state.socketId) {
        if (canUserWatchScreen(post)) {
          screenManager.watchScreen(post.id, post.screenShare.sharerSocketId, authorId);
        }
      }
    });
  }

  socket.on('board:init', (data) => {
    applySessionSnapshot(data, { isSessionChange: false });
    // Let user or teacher pick role on initial entry if not chosen yet
    const chosenRole = sessionStorage.getItem(STORAGE_ROLE_KEY);
    if (!chosenRole) {
      openWelcomeModal({ dismissible: false });
    } else if (!state.hasChosenSession) {
      openSessionPicker({ required: !state.activeSessionId });
    }
  });

  socket.on('session:synced', (data) => {
    applySessionSnapshot(data, { isSessionChange: true });
    if (data.reasonMessage) {
      showToast(`📚 ${data.reasonMessage}`, 'info');
    }
  });

  socket.on('session:status-changed', ({ sessionId, isPublished, isClosed }) => {
    if (sessionId !== state.activeSessionId) return;
    state.sessionStatus = { isPublished: isPublished !== false, isClosed: Boolean(isClosed) };
    renderSessionStatusBanner();
  });

  socket.on('session:unavailable', ({ reason, sessions }) => {
    screenManager.stopAll();
    state.activeSessionId = null;
    state.hasChosenSession = false;
    if (Array.isArray(sessions)) state.sessions = sessions;
    state.posts = [];
    state.assignment = null;
    state.assignmentHistory = [];
    state.timer = null;
    state.scheduledTimers = [];
    state.screenQueue = [];
    renderSessionStatusBanner();
    renderSessionsUI();
    renderAssignmentBanner();
    renderTimerTick();
    renderScreenQueue();
    renderTopicBar();
    renderBoardFull();
    renderScreensGrid();
    showToast(reason || 'Esta sesión ya no está disponible.', 'info');
    openSessionPicker({ required: true });
  });

  socket.on('sessions:updated', ({ sessions }) => {
    if (Array.isArray(sessions)) state.sessions = sessions;
    const cur = (state.sessions || []).find((s) => s.id === state.activeSessionId);
    if (cur) {
      state.sessionStatus = { isPublished: cur.isPublished !== false, isClosed: Boolean(cur.isClosed) };
    }
    renderSessionStatusBanner();
    renderSessionsUI();
    renderSessionPickerList();
    updateWelcomeSessionsDropdown();
  });

  socket.on('screen-queue:updated', ({ queue }) => {
    state.screenQueue = Array.isArray(queue) ? queue : [];
    renderScreenQueue();
  });

  socket.on('screen:turn-granted', ({ queueId, author, reason, audience, targetAuthorIds, teacherName }) => {
    state.pendingResumePostId = null;
    state.pendingTurnGrant = { queueId, author, reason, audience, targetAuthorIds };
    el.resumeScreenText.innerHTML = `<strong>${escapeHtml(
      teacherName || 'El profesor'
    )}</strong> te dio turno para compartir tu pantalla.<br/><br/><strong>Motivo:</strong> ${escapeHtml(
      reason || 'Presentación'
    )}`;
    el.btnAcceptResumeScreen.textContent = '▶ Compartir pantalla ahora';
    playChime('recess');
    openModal(el.resumeScreenModal);
  });

  socket.on('board:updated', (board) => {
    state.board = board;
    renderBoardMeta();
  });

  socket.on('presence:count', ({ count }) => {
    el.onlineCount.textContent = String(count || 1);
  });

  socket.on('tunnel:status', (status) => {
    updateTunnelUI(status);
  });

  socket.on('student:kicked', ({ reason, sessionName }) => {
    state.isKicked = true;
    if (el.studentKickedReason) {
      el.studentKickedReason.innerHTML = `<strong>${escapeHtml(
        reason || 'Has sido expulsado de la clase por el profesor.'
      )}</strong>${
        sessionName
          ? `<br/><small style="color:var(--text-muted);display:block;margin-top:6px;">Sesión: ${escapeHtml(
              sessionName
            )}</small>`
          : ''
      }`;
    }
    openModal(el.studentKickedModal);
    playChime('recess');
  });

  socket.on('student:disabled-status', ({ disabled, reason }) => {
    state.isDisabled = Boolean(disabled);
    if (el.studentDisabledBanner) {
      el.studentDisabledBanner.classList.toggle('hidden', !state.isDisabled);
    }
    if (state.isDisabled) {
      playChime('recess');
      showToast(reason || '🚫 Tu cuenta ha sido deshabilitada por el docente (modo solo lectura)', 'error');
    } else {
      showToast('✅ Tu cuenta ha sido habilitada nuevamente por el profesor', 'success');
    }
  });

  socket.on('session:author-disabled', ({ authorId: targetId, authorName: targetName, disabled }) => {
    const isMe =
      targetId === authorId ||
      (targetName && authorName && targetName.trim().toLowerCase() === authorName.trim().toLowerCase());
    if (isMe) {
      state.isDisabled = Boolean(disabled);
      if (el.studentDisabledBanner) {
        el.studentDisabledBanner.classList.toggle('hidden', !state.isDisabled);
      }
    }
    if (state.isTeacher && state.activeTeacherTab === 'students') {
      loadTeacherStudents();
    }
  });

  if (el.btnKickedChooseSession) {
    el.btnKickedChooseSession.addEventListener('click', () => {
      closeModal(el.studentKickedModal);
      state.activeSessionId = null;
      sessionStorage.removeItem(STORAGE_ACTIVE_SESSION_KEY);
      openSessionPicker({ required: true });
    });
  }

  if (el.btnKickedReload) {
    el.btnKickedReload.addEventListener('click', () => {
      window.location.reload();
    });
  }

  socket.on('assignment:updated', ({ assignment, assignmentHistory }) => {
    state.assignment = assignment || null;
    if (Array.isArray(assignmentHistory)) {
      state.assignmentHistory = assignmentHistory;
    }
    // Keep compact by default so user clicks to grow
    if (state.expandedTaskId && !getExpandedTask()) {
      state.expandedTaskId = null;
    }
    renderAssignmentBanner();
    renderAssignmentHistory();
  });

  socket.on('notification:new', (notification) => {
    if (!notification) return;
    state.notifications.unshift(notification);
    state.notifications = state.notifications.slice(0, 25);

    if (el.notificationsModal.classList.contains('hidden')) {
      state.unreadNotifications++;
      updateNotifBadge();
    } else {
      renderNotificationsList();
    }

    showLiveAnnouncement(notification);
  });

  socket.on('timer:updated', ({ timer, scheduledTimers, serverTime }) => {
    if (serverTime) {
      state.serverOffsetMs = serverTime - Date.now();
    }
    state.timer = timer || null;
    state.scheduledTimers = Array.isArray(scheduledTimers) ? scheduledTimers : [];
    renderTimerTick();
  });

  socket.on('timer:finished', ({ timer, serverTime }) => {
    if (serverTime) {
      state.serverOffsetMs = serverTime - Date.now();
    }
    if (timer) state.timer = timer;
    renderTimerTick();
  });

  socket.on('post:created', (post) => {
    if (state.posts.some((p) => p.id === post.id)) return;
    state.posts.unshift(post);
    sortPostsInPlace();

    if (isScreenPost(post)) {
      el.screensEmptyState.classList.add('hidden');
      const cardEl = buildCardElement(post);
      el.screensGrid.prepend(cardEl);
      syncCardStream(cardEl, post);
      updateWorkspaceTabBadges();
      return;
    }

    renderTopicBar();
    if (matchesCurrentFilters(post)) {
      el.emptyState.classList.add('hidden');
      const cardEl = buildCardElement(post);
      const firstUnpinned = el.boardGrid.querySelector('.card:not(.card-pinned)');
      if (!post.pinned && firstUnpinned) {
        el.boardGrid.insertBefore(cardEl, firstUnpinned);
      } else {
        el.boardGrid.prepend(cardEl);
      }
      syncCardStream(cardEl, post);
    }
    updatePostCounter();
    updateWorkspaceTabBadges();
  });

  socket.on('post:updated', (updatedPost) => {
    const idx = state.posts.findIndex((p) => p.id === updatedPost.id);
    if (idx === -1) return;
    const pinnedChanged = Boolean(state.posts[idx].pinned) !== Boolean(updatedPost.pinned);
    state.posts[idx] = updatedPost;
    if (pinnedChanged) sortPostsInPlace();

    if (isScreenPost(updatedPost)) {
      const existingCard = el.screensGrid.querySelector(`.card[data-post-id="${CSS.escape(updatedPost.id)}"]`);
      if (existingCard) patchCardInPlace(existingCard, updatedPost);
      else renderScreensGrid();
      updateWorkspaceTabBadges();
      return;
    }

    renderTopicBar();

    if (pinnedChanged) {
      renderBoardFull();
      return;
    }

    const existingCard = el.boardGrid.querySelector(`.card[data-post-id="${CSS.escape(updatedPost.id)}"]`);
    const shouldShow = matchesCurrentFilters(updatedPost);

    if (shouldShow && existingCard) {
      patchCardInPlace(existingCard, updatedPost);
    } else if (shouldShow && !existingCard) {
      renderBoardFull();
    } else if (!shouldShow && existingCard) {
      existingCard.remove();
      updateEmptyAndCounter();
    }
  });

  socket.on('posts:reordered', ({ sessionId, postIds }) => {
    if (sessionId && sessionId !== state.activeSessionId) return;
    if (!Array.isArray(postIds)) return;
    postIds.forEach((id, idx) => {
      const p = state.posts.find((item) => item.id === id);
      if (p) p.order = idx + 1;
    });
    sortPostsInPlace();
    renderBoardFull();
    renderScreensGrid();
  });

  socket.on('author:name-changed', ({ authorId: changedAuthorId, newName, isTeacher: changedIsTeacher }) => {
    let updatedAny = false;
    state.posts.forEach((p) => {
      if (p.authorId === changedAuthorId) {
        p.author = newName;
        updatedAny = true;
      }
      if (Array.isArray(p.comments)) {
        p.comments.forEach((c) => {
          if (c.authorId === changedAuthorId) {
            c.author = newName;
            updatedAny = true;
          }
        });
      }
      if (p.screenShare && p.screenShare.sharerAuthorId === changedAuthorId) {
        p.screenShare.sharerName = newName;
      }
    });

    if (changedIsTeacher) {
      if (el.teacherBadgeText) el.teacherBadgeText.textContent = `Prof. ${newName}`;
      if (el.teacherMenuNameDisplay) el.teacherMenuNameDisplay.textContent = newName;
      if (state.isTeacher && changedAuthorId === authorId) {
        state.teacherName = newName;
        updateTeacherUI();
      }
    }

    if (updatedAny) {
      renderBoardFull();
      renderScreensGrid();
    }

    if (Array.isArray(state.chatUsers)) {
      state.chatUsers.forEach((u) => {
        if (u.authorId === changedAuthorId) u.name = newName;
      });
      renderChatUsers(state.chatUsers);
    }

    if (state.isChatOpen) {
      socket.emit('chat:history', { sessionId: state.activeSessionId }, (res) => {
        if (res?.ok && Array.isArray(res.messages)) renderChatMessages(res.messages);
      });
    }

    if (changedAuthorId !== authorId) {
      showToast(`👤 ${newName} actualizó su nombre`, 'info');
    }
  });

  socket.on('board:posts-updated', ({ posts }) => {
    if (Array.isArray(posts)) {
      state.posts = posts;
      renderBoardFull();
      renderScreensGrid();
      updatePostCounter();
    }
  });

  socket.on('post:deleted', ({ id }) => {
    const deleted = state.posts.find((p) => p.id === id);
    state.posts = state.posts.filter((p) => p.id !== id);
    screenManager.handleRemoteShareStopped(id);
    const cardEl = document.querySelector(`.card[data-post-id="${CSS.escape(id)}"]`);
    if (cardEl) cardEl.remove();

    if (deleted && isScreenPost(deleted)) {
      if (getScreenPosts().length === 0) {
        el.screensEmptyState.classList.remove('hidden');
      }
      updateWorkspaceTabBadges();
      return;
    }

    renderTopicBar();
    updateEmptyAndCounter();
    updateWorkspaceTabBadges();
  });

  socket.on(
    'screen:started',
    ({
      postId,
      sharerSocketId,
      sharerAuthorId,
      sharerName,
      sourceType,
      audience,
      targetAuthorIds,
      pausedByTeacher,
      viewerCount,
    }) => {
      const post = state.posts.find((p) => p.id === postId);
      if (!post) return;
      post.screenShare = {
        active: true,
        sharerSocketId,
        sharerAuthorId,
        sharerName,
        sourceType: sourceType || 'screen',
        audience: audience || 'all',
        targetAuthorIds: Array.isArray(targetAuthorIds) ? targetAuthorIds : [],
        pausedByTeacher: Boolean(pausedByTeacher),
        viewerCount: viewerCount || 0,
      };

      renderTopicBar();
      refreshCard(postId);
      updateWorkspaceTabBadges();

      if (sharerSocketId !== socket.id) {
        if (canUserWatchScreen(post)) {
          screenManager.watchScreen(postId, sharerSocketId, authorId);
          showToast(`🖥️ ${sharerName} está compartiendo su pantalla ("${post.topic}")`);
        } else {
          showToast(`🔒 ${sharerName} inició una transmisión privada ("${post.topic}")`, 'info');
        }
      }
    }
  );

  socket.on('screen:paused', ({ postId, paused, teacherName }) => {
    const post = state.posts.find((p) => p.id === postId);
    if (!post || !post.screenShare) return;
    post.screenShare.pausedByTeacher = Boolean(paused);

    if (screenManager.isPresenting(postId)) {
      screenManager.setTeacherPaused(postId, Boolean(paused));
      showToast(
        paused
          ? `✂ ${teacherName || 'El profesor'} cortó temporalmente tu pantalla compartida`
          : `▶ ${teacherName || 'El profesor'} retomó tu pantalla compartida`,
        paused ? 'info' : 'success'
      );
      playChime(paused ? 'warning' : 'info');
    }

    refreshCard(postId);
  });

  socket.on('screen:force-stop', ({ postId, teacherName }) => {
    screenManager.forceStopByTeacher(postId);
    playChime('warning');
    showToast(`✂ ${teacherName || 'El profesor'} finalizó tu pantalla compartida`, 'info');
  });

  socket.on('screen:resume-requested', ({ postId, topic, teacherName }) => {
    state.pendingTurnGrant = null;
    state.pendingResumePostId = postId;
    el.resumeScreenText.innerHTML = `<strong>${escapeHtml(
      teacherName || 'El profesor'
    )}</strong> te pide retomar tu pantalla compartida en la tarjeta <strong>"${escapeHtml(
      topic || 'Tu tarjeta'
    )}"</strong>.`;
    el.btnAcceptResumeScreen.textContent = '▶ Retomar pantalla ahora';
    playChime('task');
    openModal(el.resumeScreenModal);
  });

  socket.on('screen:viewers', ({ postId, viewerCount }) => {
    const post = state.posts.find((p) => p.id === postId);
    if (!post || !post.screenShare) return;
    post.screenShare.viewerCount = viewerCount;

    const cardEl = document.querySelector(`.card[data-post-id="${CSS.escape(postId)}"]`);
    if (cardEl) {
      const badge = cardEl.querySelector('.viewer-count-num');
      if (badge) badge.textContent = String(viewerCount);
    }
  });

  socket.on('screen:stopped', ({ postId }) => {
    const post = state.posts.find((p) => p.id === postId);
    if (post) {
      post.screenShare = null;
    }
    screenManager.handleRemoteShareStopped(postId);
    renderTopicBar();
    refreshCard(postId);
    updateWorkspaceTabBadges();
  });

  // --- Board Meta & Filters (Padlets Section) ---
  function renderBoardMeta() {
    const instName = state.board?.institutionName || 'Institución Educativa';
    const eventName = state.board?.eventName || state.board?.title || 'Sesión Principal';
    const instLogo = state.board?.institutionLogo || '';

    if (el.institutionNameDisplay) {
      el.institutionNameDisplay.textContent = `🏫 ${instName.replace(/^🏫\s*/, '')}`;
      el.institutionNameDisplay.title = `Institución que imparte las sesiones: ${instName}`;
    }

    if (el.eventNameDisplay) {
      el.eventNameDisplay.textContent = eventName;
      el.eventNameDisplay.title = `Evento en curso: ${eventName}`;
    }

    if (el.boardTitle) {
      el.boardTitle.textContent = eventName;
    }

    if (el.boardDescription) {
      el.boardDescription.textContent = state.board?.description || '';
    }

    if (el.institutionLogoImg && el.institutionLogoDefault) {
      if (instLogo) {
        el.institutionLogoImg.src = instLogo;
        el.institutionLogoImg.classList.remove('hidden');
        el.institutionLogoDefault.classList.add('hidden');
      } else {
        el.institutionLogoImg.classList.add('hidden');
        el.institutionLogoDefault.classList.remove('hidden');
      }
    }

    document.title = `${eventName} · ${instName} — PadletLocal`;
  }

  function matchesCurrentFilters(post) {
    if (isScreenPost(post)) return false;

    // Filter by specific assignment responses
    if (state.activeTaskFilter) {
      if (post.assignmentId !== state.activeTaskFilter) return false;
    }

    // Filter by user / author
    if (state.activeAuthor) {
      if ((post.author || '').trim().toLowerCase() !== state.activeAuthor.trim().toLowerCase()) return false;
    }

    if (state.activeTopic === '__HIGHLIGHTED__') {
      if (!post.highlighted) return false;
    } else if (state.activeTopic === '__REVIEWED__') {
      if (!post.reviewed) return false;
    } else if (state.activeTopic === '__UNREVIEWED__') {
      if (post.reviewed) return false;
    } else if (state.activeTopic !== '__ALL__') {
      if ((post.topic || '').toLowerCase() !== state.activeTopic.toLowerCase()) return false;
    }

    const q = state.searchQuery.trim().toLowerCase();
    if (q) {
      const haystack = `${post.author || ''} ${post.topic || ''} ${post.content || ''} ${post.assignmentTitle || ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  }

  function renderTopicBar() {
    const padlets = getPadletPosts();
    const authorCounts = new Map();
    let reviewedCount = 0;
    let highlightedCount = 0;

    padlets.forEach((p) => {
      if (p.reviewed) reviewedCount++;
      if (p.highlighted) highlightedCount++;
      const rawAuthor = (p.author || 'Anónimo').trim();
      if (!rawAuthor) return;
      const lower = rawAuthor.toLowerCase();
      const prev = authorCounts.get(lower);
      if (prev) {
        prev.count++;
      } else {
        authorCounts.set(lower, {
          name: rawAuthor,
          count: 1,
          isTeacher: Boolean(p.authorIsTeacher),
        });
      }
    });

    const unreviewedCount = padlets.length - reviewedCount;

    // Autocomplete suggestions for topics
    const uniqueTopics = Array.from(new Set(padlets.map((p) => (p.topic || '').trim()).filter(Boolean)));
    if (el.topicSuggestions) {
      el.topicSuggestions.innerHTML = uniqueTopics
        .map((t) => `<option value="${escapeHtml(t)}"></option>`)
        .join('');
    }

    const pills = [];

    // Filter for Active Task Responses if selected
    if (state.activeTaskFilter) {
      const taskCount = padlets.filter((p) => p.assignmentId === state.activeTaskFilter).length;
      let taskLabel = 'Tarea';
      const foundTask =
        (state.assignmentHistory || []).find((h) => h.id === state.activeTaskFilter) ||
        (state.assignment?.id === state.activeTaskFilter ? state.assignment : null);
      if (foundTask?.title) {
        taskLabel = foundTask.title;
      } else {
        const sample = padlets.find((p) => p.assignmentId === state.activeTaskFilter);
        if (sample?.assignmentTitle) taskLabel = sample.assignmentTitle;
      }
      pills.push(
        `<button type="button" class="topic-pill active" data-action="clear-task-filter" style="border-color:var(--primary);background:rgba(99,102,241,0.15);color:var(--primary);font-weight:600;" title="Clic para quitar filtro de tarea">📝 ${escapeHtml(taskLabel.slice(0, 24))} <span class="pill-count">${taskCount}</span> <span style="margin-left:4px;font-size:0.75rem;">✕</span></button>`
      );
    }

    const isAllActive = !state.activeAuthor && state.activeTopic === '__ALL__' && !state.activeTaskFilter;
    pills.push(
      `<button type="button" class="topic-pill ${isAllActive ? 'active' : ''}" data-topic="__ALL__">Todos <span class="pill-count">${padlets.length}</span></button>`
    );

    if (padlets.length > 0 && (state.isTeacher || highlightedCount > 0)) {
      pills.push(
        `<button type="button" class="topic-pill ${!state.activeAuthor && state.activeTopic === '__HIGHLIGHTED__' ? 'active' : ''}" data-topic="__HIGHLIGHTED__">⭐ Destacadas <span class="pill-count">${highlightedCount}</span></button>`
      );
    }

    if (padlets.length > 0 && (state.isTeacher || reviewedCount > 0)) {
      pills.push(
        `<button type="button" class="topic-pill ${!state.activeAuthor && state.activeTopic === '__UNREVIEWED__' ? 'active' : ''}" data-topic="__UNREVIEWED__">Pendientes <span class="pill-count">${unreviewedCount}</span></button>`
      );
      pills.push(
        `<button type="button" class="topic-pill ${!state.activeAuthor && state.activeTopic === '__REVIEWED__' ? 'active' : ''}" data-topic="__REVIEWED__">✓ Revisadas <span class="pill-count">${reviewedCount}</span></button>`
      );
    }

    // List of Users / Authors with publication count, sorted by highest count
    const sortedAuthors = Array.from(authorCounts.values()).sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name)
    );

    for (const { name, count, isTeacher } of sortedAuthors) {
      const isAuthorActive =
        Boolean(state.activeAuthor) && state.activeAuthor.toLowerCase() === name.toLowerCase();
      pills.push(
        `<button type="button" class="topic-pill author-pill ${isAuthorActive ? 'active' : ''}" data-author="${escapeHtml(name)}" title="Filtrar publicaciones de ${escapeHtml(name)}">${isTeacher ? '🎓' : '👤'} ${escapeHtml(name)} <span class="pill-count">${count}</span></button>`
      );
    }

    el.topicBar.innerHTML = pills.join('');
    el.topicBar.querySelectorAll('.topic-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.action === 'clear-task-filter') {
          state.activeTaskFilter = null;
          renderTopicBar();
          renderBoardFull();
          return;
        }

        if (btn.dataset.author) {
          const authorVal = btn.dataset.author;
          if (state.activeAuthor && state.activeAuthor.toLowerCase() === authorVal.toLowerCase()) {
            state.activeAuthor = null;
          } else {
            state.activeAuthor = authorVal;
            state.activeTopic = '__ALL__';
          }
          renderTopicBar();
          renderBoardFull();
          return;
        }

        if (btn.dataset.topic) {
          state.activeAuthor = null;
          state.activeTaskFilter = null;
          state.activeTopic = btn.dataset.topic;
          renderTopicBar();
          renderBoardFull();
        }
      });
    });
  }

  function updateBoardDensity(visibleCount) {
    const count =
      typeof visibleCount === 'number' ? visibleCount : getPadletPosts().filter(matchesCurrentFilters).length;

    // Canva vs Lista view mode
    const isList = state.viewLayout === 'list';
    el.boardGrid.classList.toggle('board-view--list', isList);

    if (el.viewLayoutControl) {
      el.viewLayoutControl.querySelectorAll('.layout-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.layout === state.viewLayout);
      });
    }

    // Card density: compact / normal / large
    const isCompact = state.densityMode === 'compact';
    const isLarge = state.densityMode === 'large';

    el.boardGrid.classList.toggle('board-grid--compact', isCompact);
    el.boardGrid.classList.toggle('board-grid--large', isLarge);
    el.compactHint.classList.toggle('hidden', isList || !isCompact || count === 0);

    if (!isCompact && state.focusedCardId) {
      state.focusedCardId = null;
      el.boardGrid.querySelectorAll('.card.card-focused').forEach((c) => c.classList.remove('card-focused'));
    }

    if (el.densityControl) {
      el.densityControl.querySelectorAll('.density-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.density === state.densityMode);
      });
    }
  }

  function updateScreensDensity() {
    const size = state.screensSize || 'compact';
    el.screensGrid.classList.toggle('screens-grid--compact', size === 'compact');
    el.screensGrid.classList.toggle('screens-grid--normal', size === 'normal');
    el.screensGrid.classList.toggle('screens-grid--large', size === 'large');

    if (el.screensDensityControl) {
      el.screensDensityControl.querySelectorAll('.density-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.screenSize === size);
      });
    }
  }

  function updatePostCounter() {
    const padlets = getPadletPosts();
    const visible = padlets.filter(matchesCurrentFilters).length;
    const total = padlets.length;
    if (visible === total) {
      el.postCounter.textContent = `${total} ${total === 1 ? 'Padlet' : 'Padlets'}`;
    } else {
      el.postCounter.textContent = `Mostrando ${visible} de ${total}`;
    }
    updateBoardDensity(visible);
    updateWorkspaceTabBadges();
  }

  function updateEmptyAndCounter() {
    updatePostCounter();
    const visibleCount = el.boardGrid.children.length;
    const totalPadlets = getPadletPosts().length;
    if (totalPadlets === 0) {
      el.emptyState.classList.remove('hidden');
    } else {
      el.emptyState.classList.add('hidden');
      if (visibleCount === 0) {
        el.boardGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1; margin: 24px auto;"><h2>Sin resultados</h2><p>No hay publicaciones que coincidan con tu filtro o búsqueda actual.</p></div>`;
      }
    }
  }

  // --- Card Rendering & Video-Safe Patching ---
  function buildScreenPausedOverlayHTML(post) {
    if (!post.screenShare?.active || !post.screenShare.pausedByTeacher) return '';
    return `
      <div class="screen-paused-overlay">
        <strong>✂ Pantalla cortada por el profesor</strong>
        <span>${
          state.isTeacher
            ? 'Puedes retomar la transmisión al instante o finalizarla.'
            : 'El profesor pausó temporalmente esta pantalla compartida.'
        }</span>
        ${
          state.isTeacher
            ? `<div class="screen-controls-group">
                 <button type="button" class="screen-ctrl-btn resume-btn" data-action="teacher-resume-screen">▶ Retomar pantalla</button>
                 <button type="button" class="screen-ctrl-btn danger" data-action="teacher-stop-screen">✕ Terminar</button>
               </div>`
            : ''
        }
      </div>
    `;
  }

  function buildScreenTeacherBtnsHTML(post) {
    if (!state.isTeacher || !post.screenShare?.active) return '';
    const isPaused = Boolean(post.screenShare.pausedByTeacher);
    return isPaused
      ? `<button type="button" class="screen-ctrl-btn resume-btn" data-action="teacher-resume-screen" title="Retomar pantalla compartida">▶ Retomar</button>`
      : `<button type="button" class="screen-ctrl-btn danger" data-action="teacher-pause-screen" title="Cortar pantalla compartida temporalmente">✂ Cortar</button>`;
  }

  function canUserWatchScreen(post) {
    if (!post?.screenShare?.active) return false;
    const isPresenter = post.authorId === authorId || post.screenShare.sharerSocketId === socket.id;
    if (isPresenter) return true;
    if (state.isTeacher) return true;
    const audience = post.screenShare.audience || 'all';
    if (audience === 'teacher') return false;
    if (audience === 'custom') {
      const targets = post.screenShare.targetAuthorIds || [];
      return targets.includes(authorId);
    }
    return true;
  }

  function buildScreenStageHTML(post) {
    if (!post.screenShare?.active) return '';
    const isPresenter = screenManager.isPresenting(post.id) || post.screenShare.sharerSocketId === socket.id;
    const isExpanded = state.expandedCards.has(post.id);
    const hasStream = Boolean(screenManager.getStream(post.id));
    const isPaused = Boolean(post.screenShare.pausedByTeacher);

    if (!canUserWatchScreen(post)) {
      const isTeacherAudience = post.screenShare.audience === 'teacher';
      return `
        <div class="screen-stage screen-stage-restricted" data-screen-post-id="${escapeHtml(post.id)}" style="display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0f172a;color:#f8fafc;padding:24px 16px;text-align:center;border-radius:10px;min-height:160px;">
          <div style="font-size:2rem;margin-bottom:6px;">🔒</div>
          <strong style="font-size:0.92rem;color:#f1f5f9;margin-bottom:4px;">Transmisión Privada</strong>
          <p style="margin:0;font-size:0.78rem;color:#94a3b8;max-width:240px;">
            ${isTeacherAudience ? 'El autor comparte esta pantalla solo con el docente.' : 'Esta pantalla se comparte exclusivamente con participantes autorizados.'}
          </p>
        </div>
      `;
    }

    return `
      <div class="screen-stage" data-screen-post-id="${escapeHtml(post.id)}">
        <video autoplay playsinline muted></video>
        <div class="screen-paused-slot">${buildScreenPausedOverlayHTML(post)}</div>

        <div class="screen-overlay-top">
          <span class="live-badge">${isPaused ? '⏸ PAUSADA' : '<span class="live-dot"></span> EN VIVO'}</span>
          <span class="viewer-badge" title="Espectadores conectados">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span class="viewer-count-num">${post.screenShare.viewerCount || 0}</span>
          </span>
        </div>

        <div class="screen-status-center ${hasStream ? 'hidden' : ''}">
          <span class="screen-status-msg">${isPresenter ? 'Iniciando transmisión...' : 'Conectando pantalla compartida...'}</span>
          ${
            !isPresenter
              ? `<button type="button" class="screen-ctrl-btn" data-action="reconnect-screen">Reconectar</button>`
              : ''
          }
        </div>

        <div class="screen-overlay-bottom">
          <div class="screen-controls-group">
            ${
              isPresenter
                ? `<button type="button" class="screen-ctrl-btn danger" data-action="stop-screen">■ Detener</button>`
                : `<button type="button" class="screen-ctrl-btn hidden" data-action="toggle-mute" title="Activar/silenciar audio">🔇 Audio</button>`
            }
            <span class="screen-teacher-slot">${buildScreenTeacherBtnsHTML(post)}</span>
          </div>
          <div class="screen-controls-group">
            <button type="button" class="screen-ctrl-btn advanced-only" data-action="toggle-expand" title="Ampliar o reducir tarjeta">${
              isExpanded ? '⤡ Reducir' : '⤢ Ampliar'
            }</button>
            ${
              document.pictureInPictureEnabled
                ? `<button type="button" class="screen-ctrl-btn advanced-only" data-action="pip-screen" title="Imagen en imagen">PiP</button>`
                : ''
            }
            <button type="button" class="screen-ctrl-btn" data-action="fullscreen-screen" title="Pantalla completa">⛶ Ver grande</button>
          </div>
        </div>
      </div>
    `;
  }

  function buildCommentsHTML(post) {
    const isOpen = state.openComments.has(post.id);
    if (!isOpen) return '';
    const comments = Array.isArray(post.comments) ? post.comments : [];
    const isClosed = Boolean(state.sessionStatus?.isClosed);
    const canComment = state.isTeacher || !isClosed;
    const listHtml =
      comments.length === 0
        ? `<div class="muted-note" style="font-size:0.78rem;">Aún no hay comentarios. ¡Sé el primero!</div>`
        : comments
            .map(
              (c) => `
          <div class="comment-item">
            <div class="comment-head">
              <span class="comment-author">${escapeHtml(c.author)}</span>
              <span class="comment-time">${formatRelativeTime(c.createdAt)}</span>
            </div>
            <div class="comment-text">${formatTextWithLinks(c.text)}</div>
          </div>
        `
            )
            .join('');

    const formHtml = canComment
      ? `
        <form class="comment-form" data-action="submit-comment">
          <input type="text" name="commentText" maxlength="500" placeholder="Escribe un comentario..." autocomplete="off" required />
          <button type="submit" class="btn btn-sm btn-primary">Enviar</button>
        </form>
      `
      : `<div class="muted-note" style="font-size:0.76rem;padding:6px 0;">🔒 Sesión cerrada en modo solo lectura. Comentarios deshabilitados.</div>`;

    return `
      <div class="card-comments">
        <div class="comments-list">${listHtml}</div>
        ${formHtml}
      </div>
    `;
  }

  function buildCardInnerParts(post) {
    const isClosed = Boolean(state.sessionStatus?.isClosed);
    const isOwner = post.authorId === authorId;
    const canManage = state.isTeacher || (isOwner && !isClosed);
    const isLive = Boolean(post.screenShare?.active);
    const isPresenter = screenManager.isPresenting(post.id) || (isLive && post.screenShare.sharerSocketId === socket.id);
    const likes = Array.isArray(post.likes) ? post.likes : [];
    const isLiked = likes.includes(authorId);
    const commentsCount = Array.isArray(post.comments) ? post.comments.length : 0;

    const pinButton = state.isTeacher
      ? `<button type="button" class="icon-btn-subtle" data-action="pin-post" title="${
          post.pinned ? 'Quitar fijado' : 'Fijar tarjeta arriba'
        }" aria-label="Fijar tarjeta">${post.pinned ? '📌' : '📍'}</button>`
      : '';

    const hideButton = state.isTeacher
      ? `<button type="button" class="icon-btn-subtle hide-post-btn" data-action="hide-post" title="${
          post.isHidden ? 'Republicar tarjeta (hacer visible a alumnos)' : 'Despublicar / ocultar tarjeta a alumnos'
        }" aria-label="Despublicar o republicar tarjeta">${post.isHidden ? '👁️' : '🚫'}</button>`
      : '';

    const highlightButton = `<button type="button" class="icon-btn-subtle highlight-post-btn ${
      post.highlighted ? 'is-highlighted' : ''
    }" data-action="highlight-post" title="${
      post.highlighted ? 'Quitar destacado' : 'Destacar esta respuesta (⭐)'
    }" aria-label="Destacar tarjeta">${post.highlighted ? '⭐' : '☆'}</button>`;

    const teacherStudentControls = state.isTeacher && !post.authorIsTeacher
      ? `<button type="button" class="icon-btn-subtle" data-action="toggle-disable-author" data-author-id="${escapeHtml(post.authorId || '')}" data-author-name="${escapeHtml(post.author)}" title="Deshabilitar/Habilitar a ${escapeHtml(post.author)}">🚫</button>
         <button type="button" class="icon-btn-subtle" data-action="kick-author" data-author-id="${escapeHtml(post.authorId || '')}" data-author-name="${escapeHtml(post.author)}" title="Expulsar a ${escapeHtml(post.author)} de la clase">👢</button>`
      : '';

    const ownerButtons = canManage
      ? `
        <div class="card-owner-actions">
          ${pinButton}
          ${hideButton}
          ${teacherStudentControls}
          <button type="button" class="icon-btn-subtle" data-action="edit-post" title="Editar tarjeta" aria-label="Editar tarjeta">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
          <button type="button" class="icon-btn-subtle" data-action="delete-post" title="Eliminar tarjeta" aria-label="Eliminar tarjeta">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          </button>
        </div>
      `
      : '';

    const isPausedByTeacher = Boolean(isLive && post.screenShare.pausedByTeacher);

    const isScreenCard = isScreenPost(post);
    const isTeacher = isTeacherPost(post);

    const reEnqueueBtn = isOwner && isScreenCard && !isLive
      ? `<button type="button" class="action-chip share-btn" data-action="re-enqueue-screen" title="Volver a encolar tu turno para compartir pantalla">🙋 Volver a encolar</button>`
      : '';

    const shareFooterBtn = isPresenter
      ? `<button type="button" class="action-chip stop-share-btn" data-action="stop-screen">■ Detener pantalla</button>`
      : state.isTeacher && isLive && !isPausedByTeacher
      ? `<button type="button" class="action-chip stop-share-btn" data-action="teacher-pause-screen" title="Cortar esta pantalla compartida">✂ Cortar pantalla</button>`
      : state.isTeacher && isLive && isPausedByTeacher
      ? `<button type="button" class="action-chip share-btn" data-action="teacher-resume-screen" title="Retomar esta pantalla compartida">▶ Retomar pantalla</button>`
      : isOwner && isScreenCard && !isLive
      ? `<button type="button" class="action-chip share-btn" data-action="start-screen" title="Volver a compartir tu pantalla aquí">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
             <rect x="2" y="3" width="20" height="14" rx="2" />
             <line x1="8" y1="21" x2="16" y2="21" />
             <line x1="12" y1="17" x2="12" y2="21" />
           </svg>
           Retomar mi pantalla
         </button>`
      : state.isTeacher && isScreenCard && !isLive
      ? `<button type="button" class="action-chip teacher-request-screen-btn" data-action="teacher-request-screen" title="Pedir al autor que retome su pantalla">🖥️ Pedir retomar</button>`
      : '';

    const reviewBtn = state.isTeacher
      ? `<button type="button" class="action-chip review-btn ${post.reviewed ? 'is-reviewed' : ''}" data-action="review-post" title="${
          post.reviewed ? 'Quitar visto de revisada' : 'Marcar esta respuesta como revisada / ya vista'
        }">${post.reviewed ? '✓✓ Revisada' : '✓ Revisar'}</button>`
      : '';

    const reviewedBadge = post.reviewed
      ? `<span class="reviewed-badge" title="Revisada por ${escapeHtml(post.reviewedBy || 'Profesor')}${
          post.reviewedAt ? ' · ' + formatRelativeTime(post.reviewedAt) : ''
        }">✓✓ Revisada</span>`
      : '';

    const teacherAuthorBadge = isTeacher
      ? `<span class="teacher-author-badge" title="Publicación oficial del profesor">👨‍🏫 Profesor</span>`
      : '';

    return {
      headerHtml: `
        <div class="card-author-block">
          <span class="drag-handle" title="Arrastra para mover de lugar esta respuesta" aria-label="Mover tarjeta">⠿</span>
          <div class="avatar" style="background:${getAvatarColor(post.authorId || post.author)}">${escapeHtml(getInitials(post.author))}</div>
          <div class="author-meta">
            <div class="author-name">
              ${escapeHtml(post.author)}
              ${isOwner ? '<span class="you-tag">Tú</span>' : ''}
              ${teacherAuthorBadge}
            </div>
            <div class="post-time" title="${new Date(post.createdAt).toLocaleString('es-ES')}${post.updatedAt ? ' · editado ' + new Date(post.updatedAt).toLocaleString('es-ES') : ''}">${formatRelativeTime(post.createdAt)}${post.updatedAt ? ' ✏️' : ''}</div>
          </div>
        </div>
        <div class="card-owner-actions">
          ${highlightButton}
          <button type="button" class="compact-shrink-btn" data-action="shrink-card" title="Volver al tamaño pequeño (Esc)">✕ Reducir (Esc)</button>
          ${ownerButtons}
        </div>
      `,
      textHtml: `
        <div class="card-topic-row">
          <h3 class="card-topic">${escapeHtml(post.topic)}</h3>
          <div class="card-badges-row" style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
            ${isScreenCard && isTeacher ? '<span class="teacher-screen-tag">👨‍🏫 Pantalla del Profesor</span>' : ''}
            ${
              post.assignmentTitle
                ? `<span class="assignment-ref-badge" data-action="filter-assignment-ref" data-assignment-id="${escapeHtml(
                    post.assignmentId || ''
                  )}" title="Clic para ver solo respuestas a esta tarea">📝 Tarea: ${escapeHtml(post.assignmentTitle)}</span>`
                : ''
            }
            ${post.highlighted ? '<span class="highlighted-tag" title="Respuesta destacada">⭐ Destacada</span>' : ''}
            ${post.isHidden ? '<span class="hidden-tag" title="Despublicada para los alumnos">🚫 Despublicada</span>' : ''}
            ${reviewedBadge}
            ${post.pinned ? '<span class="pinned-tag">📌 Fijado</span>' : ''}
          </div>
        </div>
        ${
          post.imageUrl
            ? `<div class="card-image-wrap" data-action="open-lightbox" data-img-src="${escapeHtml(post.imageUrl)}" data-img-caption="${escapeHtml(post.topic)} — ${escapeHtml(post.author)}" title="Clic para ver imagen completa en modal">
                 <img src="${escapeHtml(post.imageUrl)}" alt="${escapeHtml(post.topic)}" loading="lazy" />
               </div>`
            : ''
        }
        ${
          post.content
            ? `<div class="card-content">${
                state.focusedCardId === post.id || state.expandedCards.has(post.id)
                  ? formatTextWithLinks(post.content)
                  : getCardPreviewContent(post.content, 150)
              }</div>`
            : ''
        }
        <span class="compact-grow-hint">🔍 Clic para ver más grande</span>
      `,
      footerHtml: `
        <div class="card-footer-left">
          <button type="button" class="action-chip ${isLiked ? 'liked' : ''}" data-action="like-post" title="Me gusta">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <span>${likes.length}</span>
          </button>
          <button type="button" class="action-chip" data-action="toggle-comments" title="Comentarios">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>${commentsCount}</span>
          </button>
          ${reviewBtn}
        </div>
        <div class="card-footer-right">
          <button type="button" class="btn-choose-post" data-action="open-post-detail" title="Elegir publicación para ver en modal centrado y descargar">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <span>Ver</span>
          </button>
          ${shareFooterBtn}
          ${reEnqueueBtn}
        </div>
      `,
      commentsHtml: buildCommentsHTML(post),
    };
  }

  function buildCardElement(post) {
    const article = document.createElement('article');
    article.className = 'card';
    article.setAttribute('draggable', 'true');
    article.dataset.postId = post.id;
    article.dataset.color = post.color || 'default';
    if (post.screenShare?.active) article.classList.add('is-live');
    if (post.pinned) article.classList.add('card-pinned');
    if (post.highlighted) article.classList.add('card-highlighted');
    if (post.reviewed) article.classList.add('card-reviewed');
    if (post.isHidden) article.classList.add('card-hidden');
    if (state.expandedCards.has(post.id)) article.classList.add('card-expanded');
    if (state.focusedCardId === post.id) article.classList.add('card-focused');
    const isTeacher = isTeacherPost(post);
    if (isTeacher) article.classList.add('card-teacher');
    if (isScreenPost(post) && isTeacher) article.classList.add('card-teacher-screen');

    const parts = buildCardInnerParts(post);
    article.innerHTML = `
      <div class="card-accent"></div>
      <div class="card-header">${parts.headerHtml}</div>
      <div class="card-body">
        <div class="card-screen-slot">${buildScreenStageHTML(post)}</div>
        <div class="card-text-slot">${parts.textHtml}</div>
      </div>
      <div class="card-footer">${parts.footerHtml}</div>
      <div class="card-comments-slot">${parts.commentsHtml}</div>
    `;

    return article;
  }

  function patchCardInPlace(cardEl, post) {
    cardEl.dataset.color = post.color || 'default';
    cardEl.classList.toggle('is-live', Boolean(post.screenShare?.active));
    cardEl.classList.toggle('card-pinned', Boolean(post.pinned));
    cardEl.classList.toggle('card-highlighted', Boolean(post.highlighted));
    cardEl.classList.toggle('card-reviewed', Boolean(post.reviewed));
    cardEl.classList.toggle('card-hidden', Boolean(post.isHidden));
    cardEl.classList.toggle('card-expanded', state.expandedCards.has(post.id));
    cardEl.classList.toggle('card-focused', state.focusedCardId === post.id);
    cardEl.classList.toggle('card-hidden', Boolean(post.isHidden));
    cardEl.classList.toggle('card-expanded', state.expandedCards.has(post.id));
    cardEl.classList.toggle('card-focused', state.focusedCardId === post.id);

    const parts = buildCardInnerParts(post);
    cardEl.querySelector('.card-header').innerHTML = parts.headerHtml;
    cardEl.querySelector('.card-text-slot').innerHTML = parts.textHtml;
    cardEl.querySelector('.card-footer').innerHTML = parts.footerHtml;
    cardEl.querySelector('.card-comments-slot').innerHTML = parts.commentsHtml;

    const screenSlot = cardEl.querySelector('.card-screen-slot');
    const hasStageNow = Boolean(screenSlot.querySelector('.screen-stage'));
    const shouldHaveStage = Boolean(post.screenShare?.active);

    if (shouldHaveStage && !hasStageNow) {
      screenSlot.innerHTML = buildScreenStageHTML(post);
      syncCardStream(cardEl, post);
    } else if (!shouldHaveStage && hasStageNow) {
      screenSlot.innerHTML = '';
    } else if (shouldHaveStage && hasStageNow) {
      const pausedSlot = screenSlot.querySelector('.screen-paused-slot');
      if (pausedSlot) pausedSlot.innerHTML = buildScreenPausedOverlayHTML(post);
      const teacherSlot = screenSlot.querySelector('.screen-teacher-slot');
      if (teacherSlot) teacherSlot.innerHTML = buildScreenTeacherBtnsHTML(post);
      const liveBadge = screenSlot.querySelector('.live-badge');
      if (liveBadge) {
        liveBadge.innerHTML = post.screenShare.pausedByTeacher
          ? '⏸ PAUSADA'
          : '<span class="live-dot"></span> EN VIVO';
      }
      const numEl = screenSlot.querySelector('.viewer-count-num');
      if (numEl) numEl.textContent = String(post.screenShare.viewerCount || 0);
      const expBtn = screenSlot.querySelector('[data-action="toggle-expand"]');
      if (expBtn) expBtn.textContent = state.expandedCards.has(post.id) ? '⤡ Reducir' : '⤢ Ampliar';
      syncCardStream(cardEl, post);
    }
  }

  function refreshCard(postId) {
    const post = state.posts.find((p) => p.id === postId);
    const cardEl = document.querySelector(`.card[data-post-id="${CSS.escape(postId)}"]`);
    if (!post) {
      if (cardEl) cardEl.remove();
      return;
    }

    if (isScreenPost(post)) {
      if (cardEl) patchCardInPlace(cardEl, post);
      else renderScreensGrid();
      return;
    }

    const shouldShow = matchesCurrentFilters(post);
    if (shouldShow && cardEl) {
      patchCardInPlace(cardEl, post);
    } else if (shouldShow && !cardEl) {
      renderBoardFull();
    } else if (!shouldShow && cardEl) {
      cardEl.remove();
      updateEmptyAndCounter();
    }
  }

  function attachVideoUI(cardEl, postId, stream, isLocal) {
    const videoEl = cardEl.querySelector('.screen-stage video');
    if (!videoEl) return;
    screenManager.attachStreamToVideo(postId, videoEl);

    const statusOverlay = cardEl.querySelector('.screen-status-center');
    if (statusOverlay) statusOverlay.classList.add('hidden');

    if (!isLocal && stream) {
      const muteBtn = cardEl.querySelector('[data-action="toggle-mute"]');
      const hasAudio = stream.getAudioTracks && stream.getAudioTracks().length > 0;
      if (muteBtn) {
        if (hasAudio) {
          muteBtn.classList.remove('hidden');
          muteBtn.textContent = videoEl.muted ? '🔇 Activar sonido' : '🔊 Sonido activo';
        } else {
          muteBtn.classList.add('hidden');
        }
      }
    }
  }

  function syncCardStream(cardEl, post) {
    if (!post.screenShare?.active) return;
    if (!canUserWatchScreen(post)) return;
    const streamInfo = screenManager.getStream(post.id);
    if (streamInfo && streamInfo.stream) {
      attachVideoUI(cardEl, post.id, streamInfo.stream, streamInfo.isLocal);
    }
  }

  function renderBoardFull() {
    const padlets = getPadletPosts();
    const filtered = padlets.filter(matchesCurrentFilters);
    el.boardGrid.innerHTML = '';

    if (padlets.length === 0) {
      el.emptyState.classList.remove('hidden');
      updatePostCounter();
      return;
    }

    el.emptyState.classList.add('hidden');

    if (filtered.length === 0) {
      el.boardGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1; margin: 24px auto;"><h2>Sin resultados</h2><p>No hay publicaciones que coincidan con tu filtro o búsqueda actual.</p></div>`;
      updatePostCounter();
      return;
    }

    const fragment = document.createDocumentFragment();
    filtered.forEach((post) => {
      const cardEl = buildCardElement(post);
      fragment.appendChild(cardEl);
    });
    el.boardGrid.appendChild(fragment);

    filtered.forEach((post) => {
      if (post.screenShare?.active) {
        const cardEl = el.boardGrid.querySelector(`.card[data-post-id="${CSS.escape(post.id)}"]`);
        if (cardEl) syncCardStream(cardEl, post);
      }
    });

    updatePostCounter();
  }

  function setFocusedCard(postId) {
    const prevId = state.focusedCardId;
    state.focusedCardId = prevId === postId ? null : postId;
    if (prevId) {
      const prevEl = el.boardGrid.querySelector(`.card[data-post-id="${CSS.escape(prevId)}"]`);
      if (prevEl) prevEl.classList.remove('card-focused');
    }
    if (state.focusedCardId) {
      const nextEl = el.boardGrid.querySelector(`.card[data-post-id="${CSS.escape(state.focusedCardId)}"]`);
      if (nextEl) nextEl.classList.add('card-focused');
    }
  }

  let activeDetailPost = null;

  function openPostDetailModal(post) {
    if (!post) return;
    activeDetailPost = post;

    if (el.postDetailAvatar) {
      el.postDetailAvatar.textContent = getInitials(post.author);
      el.postDetailAvatar.style.background = getAvatarColor(post.authorId || post.author);
    }
    if (el.postDetailAuthor) {
      el.postDetailAuthor.textContent = post.author || 'Anónimo';
    }
    if (el.postDetailRoleBadge) {
      const isTeacher = Boolean(post.authorIsTeacher);
      el.postDetailRoleBadge.textContent = isTeacher ? '🎓 Profesor' : '🎒 Alumno';
      el.postDetailRoleBadge.className = `post-detail-role-badge ${isTeacher ? 'is-teacher' : ''}`;
    }
    if (el.postDetailTime) {
      el.postDetailTime.textContent = `${formatRelativeTime(post.createdAt)}${post.updatedAt ? ' · editado' : ''}`;
    }
    if (el.postDetailBadges) {
      const badges = [];
      if (post.assignmentTitle) {
        badges.push(
          `<span class="assignment-ref-badge" style="cursor:default;" title="Respuesta a una tarea">📝 Tarea: ${escapeHtml(
            post.assignmentTitle
          )}</span>`
        );
      }
      if (post.highlighted) badges.push('<span class="highlighted-tag">⭐ Destacada</span>');
      if (post.reviewed) {
        badges.push(
          `<span class="reviewed-badge" title="Revisada por ${escapeHtml(post.reviewedBy || 'Profesor')}">✓✓ Revisada</span>`
        );
      }
      if (post.pinned) badges.push('<span class="pinned-tag">📌 Fijado</span>');
      if (post.isHidden) badges.push('<span class="hidden-tag">🚫 Despublicada</span>');
      el.postDetailBadges.innerHTML = badges.join(' ');
    }
    if (el.postDetailTopic) {
      el.postDetailTopic.textContent = post.topic || 'Sin título';
    }

    if (post.imageUrl) {
      if (el.postDetailImageWrap) el.postDetailImageWrap.classList.remove('hidden');
      if (el.postDetailImage) {
        el.postDetailImage.src = post.imageUrl;
        el.postDetailImage.alt = post.topic || 'Imagen adjunta';
      }
      if (el.btnDownloadPostImage) el.btnDownloadPostImage.classList.remove('hidden');
      if (el.postDetailImageWrap) {
        el.postDetailImageWrap.onclick = () => {
          if (activeDetailPost?.imageUrl) {
            el.lightboxImg.src = activeDetailPost.imageUrl;
            el.lightboxCaption.textContent = `${activeDetailPost.topic || ''} — ${activeDetailPost.author || ''}`;
            openModal(el.lightboxModal);
          }
        };
      }
    } else {
      if (el.postDetailImageWrap) {
        el.postDetailImageWrap.classList.add('hidden');
        el.postDetailImageWrap.onclick = null;
      }
      if (el.postDetailImage) el.postDetailImage.src = '';
      if (el.btnDownloadPostImage) el.btnDownloadPostImage.classList.add('hidden');
    }

    if (el.postDetailContent) {
      el.postDetailContent.innerHTML = post.content
        ? formatTextWithLinks(post.content)
        : '<em class="muted-note" style="color:var(--text-muted);font-style:italic;">Esta publicación no contiene texto.</em>';
    }

    if (el.postDetailCommentsWrap) {
      const comments = Array.isArray(post.comments) ? post.comments : [];
      if (comments.length === 0) {
        el.postDetailCommentsWrap.innerHTML = '';
      } else {
        const commentsHtml = comments
          .map(
            (c) => `
          <div class="post-detail-comment-item" style="padding:10px 12px;background:var(--bg-input);border-radius:8px;margin-bottom:8px;border:1px solid var(--border);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;font-size:0.8rem;">
              <strong style="color:var(--text);">${escapeHtml(c.author)}</strong>
              <span style="color:var(--text-muted);font-size:0.75rem;">${formatRelativeTime(c.createdAt)}</span>
            </div>
            <div style="font-size:0.88rem;color:var(--text);">${formatTextWithLinks(c.text)}</div>
          </div>
        `
          )
          .join('');
        el.postDetailCommentsWrap.innerHTML = `
          <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px;">
            <div style="font-size:0.92rem;font-weight:700;margin-bottom:10px;color:var(--text);">💬 Comentarios (${comments.length})</div>
            <div class="post-detail-comments-list">${commentsHtml}</div>
          </div>
        `;
      }
    }

    if (el.postDetailTeacherActions) {
      const showTeacherActions = state.isTeacher && !post.authorIsTeacher;
      el.postDetailTeacherActions.classList.toggle('hidden', !showTeacherActions);
      if (showTeacherActions) {
        const isDis = (state.studentsList || []).some(
          (s) =>
            ((s.authorId && s.authorId === post.authorId) ||
              s.name.toLowerCase() === (post.author || '').toLowerCase()) &&
            s.isDisabled
        );
        if (el.btnDetailToggleDisable) {
          el.btnDetailToggleDisable.textContent = isDis ? '✅ Habilitar alumno' : '🚫 Deshabilitar alumno';
        }
      }
    }

    openModal(el.postDetailModal);
  }

  el.btnDownloadPostText?.addEventListener('click', () => {
    if (!activeDetailPost) return;
    const post = activeDetailPost;
    const createdStr = new Date(post.createdAt).toLocaleString('es-ES');
    const updatedStr = post.updatedAt ? new Date(post.updatedAt).toLocaleString('es-ES') : '';
    const comments = Array.isArray(post.comments) ? post.comments : [];

    let txt = `============================================================\n`;
    txt += `PUBLICACIÓN DE: ${post.author} (${post.authorIsTeacher ? 'Profesor' : 'Alumno'})\n`;
    txt += `TEMA: ${post.topic || '(Sin tema)'}\n`;
    txt += `============================================================\n`;
    txt += `Fecha de publicación: ${createdStr}\n`;
    if (updatedStr) txt += `Última edición: ${updatedStr}\n`;
    if (post.highlighted) txt += `Estado: ⭐ Destacada\n`;
    if (post.reviewed) txt += `Revisión: ✓✓ Revisada por ${post.reviewedBy || 'Profesor'}\n`;
    txt += `------------------------------------------------------------\n`;
    txt += `CONTENIDO:\n\n`;
    txt += `${post.content || '(Sin texto escrito)'}\n\n`;
    txt += `------------------------------------------------------------\n`;
    if (post.imageUrl) {
      txt += `Imagen adjunta: ${window.location.origin}${post.imageUrl}\n`;
      txt += `------------------------------------------------------------\n`;
    }
    if (comments.length > 0) {
      txt += `Comentarios (${comments.length}):\n`;
      comments.forEach((c) => {
        const cDate = new Date(c.createdAt).toLocaleString('es-ES');
        txt += `  [${c.author} · ${cDate}]:\n  ${c.text}\n\n`;
      });
      txt += `------------------------------------------------------------\n`;
    }
    txt += `Padlet Local · Generado el ${new Date().toLocaleString('es-ES')}\n`;
    txt += `============================================================\n`;

    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const safeTopic = (post.topic || 'publicacion').replace(/[^a-zA-Z0-9_\-áéíóúÁÉÍÓÚñÑ]/g, '_').slice(0, 35);
    const safeAuthor = (post.author || 'alumno').replace(/[^a-zA-Z0-9_\-áéíóúÁÉÍÓÚñÑ]/g, '_').slice(0, 25);
    const a = document.createElement('a');
    a.href = url;
    a.download = `padlet_${safeAuthor}_${safeTopic}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('📥 Publicación descargada en archivo de texto (.txt)', 'success');
  });

  el.btnDownloadPostImage?.addEventListener('click', () => {
    if (!activeDetailPost?.imageUrl) return;
    const post = activeDetailPost;
    const safeTopic = (post.topic || 'imagen').replace(/[^a-zA-Z0-9_\-áéíóúÁÉÍÓÚñÑ]/g, '_').slice(0, 35);
    const safeAuthor = (post.author || 'alumno').replace(/[^a-zA-Z0-9_\-áéíóúÁÉÍÓÚñÑ]/g, '_').slice(0, 25);
    const ext = post.imageUrl.split('.').pop().split('?')[0] || 'jpg';

    const a = document.createElement('a');
    a.href = post.imageUrl;
    a.download = `padlet_${safeAuthor}_${safeTopic}.${ext}`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('🖼️ Descargando imagen adjunta...', 'info');
  });

  el.btnDetailToggleDisable?.addEventListener('click', () => {
    if (!activeDetailPost) return;
    const authorId = activeDetailPost.authorId;
    const authorName = activeDetailPost.author;
    socket.emit(
      'teacher:student:toggle-disable',
      {
        teacherToken: state.teacherToken,
        sessionId: state.activeSessionId,
        authorId,
        authorName,
      },
      (res) => {
        if (!res?.ok) {
          showToast(res?.error || 'No se pudo cambiar estado del alumno', 'error');
        } else {
          showToast(
            res.disabled
              ? `🚫 ${authorName} ha sido deshabilitado (modo solo lectura)`
              : `✅ ${authorName} ha sido habilitado nuevamente`,
            res.disabled ? 'info' : 'success'
          );
          if (el.btnDetailToggleDisable) {
            el.btnDetailToggleDisable.textContent = res.disabled ? '✅ Habilitar alumno' : '🚫 Deshabilitar';
          }
          loadTeacherStudents();
        }
      }
    );
  });

  el.btnDetailKick?.addEventListener('click', async () => {
    if (!activeDetailPost) return;
    const authorId = activeDetailPost.authorId;
    const authorName = activeDetailPost.author;
    const ok = await Swal.confirm(
      '¿Expulsar participante?',
      `¿Expulsar a <strong>"${escapeHtml(authorName)}"</strong> de la sesión de clase actual? Se cerrará su conexión.`,
      { icon: 'warning', confirmButtonText: 'Sí, expulsar', confirmButtonColor: '#ef4444' }
    );
    if (!ok) return;
    socket.emit(
      'teacher:student:kick',
      {
        teacherToken: state.teacherToken,
        sessionId: state.activeSessionId,
        authorId,
        authorName,
        reason: 'Expulsado de la clase por el profesor.',
      },
      (res) => {
        if (!res?.ok) {
          showToast(res?.error || 'No se pudo expulsar al alumno', 'error');
        } else {
          showToast(`👢 ${authorName} ha sido expulsado de la clase`, 'success');
          closeModal(el.postDetailModal);
          loadTeacherStudents();
        }
      }
    );
  });

  // --- Event Delegation on Padlets Grid AND Screens Grid ---
  async function handleCardGridClick(e) {
    const cardEl = e.target.closest('.card');
    if (!cardEl) return;
    const postId = cardEl.dataset.postId;
    const post = state.posts.find((p) => p.id === postId);
    if (!post) return;

    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) {
      // If clicked on a Padlet card (not an interactive control), grow / focus it!
      if (
        cardEl.parentElement === el.boardGrid &&
        !el.boardGrid.classList.contains('board-view--list') &&
        !e.target.closest('a, button, input, textarea, form, video')
      ) {
        setFocusedCard(postId);
      } else if (
        cardEl.parentElement === el.screensGrid &&
        !e.target.closest('a, button, input, textarea, form')
      ) {
        if (state.expandedCards.has(postId)) {
          state.expandedCards.delete(postId);
        } else {
          state.expandedCards.add(postId);
        }
        cardEl.classList.toggle('card-expanded', state.expandedCards.has(postId));
        const expBtn = cardEl.querySelector('[data-action="toggle-expand"]');
        if (expBtn) {
          expBtn.textContent = state.expandedCards.has(postId) ? '⤡ Reducir' : '⤢ Ampliar';
        }
      }
      return;
    }

    const action = actionEl.dataset.action;

    if (action === 'shrink-card') {
      setFocusedCard(null);
    } else if (action === 'filter-assignment-ref') {
      const asgnId = actionEl.dataset.assignmentId;
      if (asgnId) {
        state.activeTaskFilter = state.activeTaskFilter === asgnId ? null : asgnId;
        state.activeAuthor = null;
        state.activeTopic = '__ALL__';
        renderTopicBar();
        renderBoardFull();
      }
    } else if (action === 'open-post-detail') {
      openPostDetailModal(post);
    } else if (action === 'highlight-post') {
      socket.emit('post:highlight', { id: postId, highlighterName: authorName || 'Participante' }, (res) => {
        if (!res?.ok) showToast(res?.error || 'No se pudo destacar la respuesta', 'error');
        else showToast(res.post?.highlighted ? '⭐ Tarjeta destacada' : 'Destacado retirado', 'info');
      });
    } else if (action === 'like-post') {
      socket.emit('post:like', { id: postId, authorId });
    } else if (action === 'pin-post') {
      socket.emit('teacher:post:pin', { id: postId, teacherToken: state.teacherToken }, (res) => {
        if (!res?.ok) showToast(res?.error || 'No se pudo fijar la tarjeta', 'error');
      });
    } else if (action === 'hide-post') {
      socket.emit(
        'teacher:post:toggle-hide',
        { id: postId, teacherToken: state.teacherToken, moderatorName: authorName || 'Profesor' },
        (res) => {
          if (!res?.ok) showToast(res?.error || 'No se pudo despublicar/republicar la tarjeta', 'error');
          else showToast(res.post?.isHidden ? '🚫 Tarjeta despublicada para los alumnos' : '👁️ Tarjeta republicada y visible para alumnos', 'info');
        }
      );
    } else if (action === 'toggle-disable-author') {
      const aId = actionEl.dataset.authorId;
      const aName = actionEl.dataset.authorName;
      socket.emit(
        'teacher:student:toggle-disable',
        {
          teacherToken: state.teacherToken,
          sessionId: state.activeSessionId,
          authorId: aId,
          authorName: aName,
        },
        (res) => {
          if (!res?.ok) {
            showToast(res?.error || 'No se pudo cambiar estado del alumno', 'error');
          } else {
            showToast(
              res.disabled
                ? `🚫 ${aName} ha sido deshabilitado (modo solo lectura)`
                : `✅ ${aName} ha sido habilitado nuevamente`,
              res.disabled ? 'info' : 'success'
            );
            loadTeacherStudents();
          }
        }
      );
    } else if (action === 'kick-author') {
      const aId = actionEl.dataset.authorId;
      const aName = actionEl.dataset.authorName;
      const ok = await Swal.confirm(
        '¿Expulsar participante?',
        `¿Expulsar a <strong>"${escapeHtml(aName)}"</strong> de la sesión de clase actual? Se cerrará su conexión.`,
        { icon: 'warning', confirmButtonText: 'Sí, expulsar', confirmButtonColor: '#ef4444' }
      );
      if (!ok) return;
      socket.emit(
        'teacher:student:kick',
        {
          teacherToken: state.teacherToken,
          sessionId: state.activeSessionId,
          authorId: aId,
          authorName: aName,
          reason: 'Expulsado de la clase por el profesor.',
        },
        (res) => {
          if (!res?.ok) {
            showToast(res?.error || 'No se pudo expulsar al alumno', 'error');
          } else {
            showToast(`👢 ${aName} ha sido expulsado de la clase`, 'success');
            loadTeacherStudents();
          }
        }
      );
    } else if (action === 'review-post') {
      socket.emit(
        'teacher:post:review',
        { id: postId, teacherToken: state.teacherToken, reviewerName: authorName || 'Profesor' },
        (res) => {
          if (!res?.ok) showToast(res?.error || 'No se pudo marcar como revisada', 'error');
          else showToast(res.post?.reviewed ? '✓✓ Tarjeta marcada como revisada' : 'Visto de revisada retirado', 'success');
        }
      );
    } else if (action === 'teacher-pause-screen') {
      socket.emit(
        'teacher:screen:pause',
        { postId, paused: true, teacherToken: state.teacherToken, teacherName: authorName || 'Profesor' },
        (res) => {
          if (!res?.ok) showToast(res?.error || 'No se pudo cortar la pantalla', 'error');
          else showToast('✂ Pantalla compartida cortada (puedes retomarla cuando quieras)', 'info');
        }
      );
    } else if (action === 'teacher-resume-screen') {
      socket.emit(
        'teacher:screen:pause',
        { postId, paused: false, teacherToken: state.teacherToken, teacherName: authorName || 'Profesor' },
        (res) => {
          if (!res?.ok) showToast(res?.error || 'No se pudo retomar la pantalla', 'error');
          else showToast('▶ Pantalla compartida retomada', 'success');
        }
      );
    } else if (action === 'teacher-stop-screen') {
      socket.emit(
        'teacher:screen:stop',
        { postId, teacherToken: state.teacherToken, teacherName: authorName || 'Profesor' },
        (res) => {
          if (!res?.ok) showToast(res?.error || 'No se pudo finalizar la transmisión', 'error');
          else showToast('Transmisión finalizada por el profesor');
        }
      );
    } else if (action === 'teacher-request-screen') {
      socket.emit(
        'teacher:screen:request-resume',
        { postId, teacherToken: state.teacherToken, teacherName: authorName || 'Profesor' },
        (res) => {
          if (!res?.ok) showToast(res?.error || 'No se pudo solicitar pantalla', 'error');
          else if (res.mode === 'resumed-instant') showToast('▶ Pantalla retomada al instante', 'success');
          else showToast(`📢 Solicitud enviada a ${res.author || post.author} para compartir/retomar pantalla`, 'success');
        }
      );
    } else if (action === 'toggle-comments') {
      if (state.openComments.has(postId)) {
        state.openComments.delete(postId);
      } else {
        state.openComments.add(postId);
      }
      patchCardInPlace(cardEl, post);
      if (state.openComments.has(postId)) {
        const input = cardEl.querySelector('.comment-form input');
        if (input) input.focus();
      }
    } else if (action === 'edit-post') {
      openComposerForEdit(post);
    } else if (action === 'delete-post') {
      const ok = await Swal.confirm(
        '¿Eliminar publicación?',
        `¿Eliminar la publicación <strong>"${escapeHtml(post.topic)}"</strong> de ${escapeHtml(post.author)}?`,
        { icon: 'warning', confirmButtonText: 'Sí, eliminar', confirmButtonColor: '#ef4444' }
      );
      if (!ok) return;
      socket.emit('post:delete', { id: postId, authorId, teacherToken: state.teacherToken }, (res) => {
        if (!res?.ok) showToast(res?.error || 'No se pudo eliminar', 'error');
        else showToast('Publicación eliminada');
      });
    } else if (action === 're-enqueue-screen') {
      const reason = post.topic || 'Compartir pantalla';
      socket.emit(
        'screen-queue:join',
        {
          authorId,
          author: authorName || post.author,
          reason,
          audience: post.screenShare?.audience || 'all',
          targetAuthorIds: post.screenShare?.targetAuthorIds || [],
        },
        (ack) => {
          if (!ack?.ok) {
            showToast(ack?.error || 'No se pudo agregar a la cola', 'error');
          } else {
            showToast('🙋 Te volviste a encolar para compartir pantalla', 'success');
          }
        }
      );
    } else if (action === 'open-lightbox') {
      el.lightboxImg.src = actionEl.dataset.imgSrc || '';
      el.lightboxCaption.textContent = actionEl.dataset.imgCaption || '';
      openModal(el.lightboxModal);
    } else if (action === 'start-screen') {
      await triggerStartScreenShare(post);
    } else if (action === 'stop-screen') {
      screenManager.stopSharing(postId);
      showToast('Pantalla compartida detenida');
    } else if (action === 'reconnect-screen') {
      if (post.screenShare?.sharerSocketId && canUserWatchScreen(post)) {
        screenManager.reconnectWatch(postId, post.screenShare.sharerSocketId, authorId);
        showToast('Reconectando transmisión...');
      }
    } else if (action === 'toggle-mute') {
      const videoEl = cardEl.querySelector('.screen-stage video');
      if (videoEl) {
        videoEl.muted = !videoEl.muted;
        actionEl.textContent = videoEl.muted ? '🔇 Activar sonido' : '🔊 Sonido activo';
      }
    } else if (action === 'toggle-expand') {
      if (state.expandedCards.has(postId)) {
        state.expandedCards.delete(postId);
      } else {
        state.expandedCards.add(postId);
      }
      cardEl.classList.toggle('card-expanded', state.expandedCards.has(postId));
      actionEl.textContent = state.expandedCards.has(postId) ? '⤡ Reducir' : '⤢ Ampliar';
    } else if (action === 'fullscreen-screen') {
      const stage = cardEl.querySelector('.screen-stage');
      const videoEl = cardEl.querySelector('.screen-stage video');
      const target = stage || videoEl;
      if (target) {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else if (target.requestFullscreen) {
          target.requestFullscreen().catch(() => {
            if (videoEl?.webkitEnterFullscreen) videoEl.webkitEnterFullscreen();
          });
        } else if (videoEl?.webkitEnterFullscreen) {
          videoEl.webkitEnterFullscreen();
        }
      }
    } else if (action === 'pip-screen') {
      const videoEl = cardEl.querySelector('.screen-stage video');
      if (videoEl && document.pictureInPictureEnabled) {
        try {
          if (document.pictureInPictureElement === videoEl) {
            await document.exitPictureInPicture();
          } else {
            await videoEl.requestPictureInPicture();
          }
        } catch {
          showToast('No se pudo activar Imagen en imagen', 'error');
        }
      }
    }
  }

  el.boardGrid.addEventListener('click', handleCardGridClick);
  el.screensGrid.addEventListener('click', handleCardGridClick);

  // Handle inline comment submission on BOTH grids
  function handleCardCommentSubmit(e) {
    const form = e.target.closest('.comment-form');
    if (!form) return;
    e.preventDefault();

    const cardEl = form.closest('.card');
    if (!cardEl) return;
    const postId = cardEl.dataset.postId;
    const input = form.querySelector('input[name="commentText"]');
    const text = input.value.trim();
    if (!text) return;

    if (!authorName) {
      const prompted = window.prompt('Ingresa tu nombre para comentar:');
      if (!prompted || !prompted.trim()) return;
      setAuthorName(prompted);
    }

    input.disabled = true;
    socket.emit(
      'post:comment',
      { id: postId, authorId, author: authorName, text },
      (res) => {
        input.disabled = false;
        if (res?.ok) {
          input.value = '';
        } else {
          showToast(res?.error || 'No se pudo enviar el comentario', 'error');
        }
      }
    );
  }

  el.boardGrid.addEventListener('submit', handleCardCommentSubmit);
  el.screensGrid.addEventListener('submit', handleCardCommentSubmit);

  // --- Drag & Drop Reordering for Posts ---
  function setupGridDragAndDrop(gridEl) {
    if (!gridEl) return;
    let draggedCard = null;

    gridEl.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.card');
      if (!card) return;

      // Avoid initiating drag when selecting text or clicking buttons/inputs unless using drag handle
      const targetIsHandle = Boolean(e.target.closest('.drag-handle'));
      const targetIsInteractive = Boolean(e.target.closest('input, textarea, button, a, select, video, .card-image-wrap'));
      if (targetIsInteractive && !targetIsHandle) {
        e.preventDefault();
        return;
      }

      draggedCard = card;
      card.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.dataset.postId || '');
    });

    gridEl.addEventListener('dragover', (e) => {
      if (!draggedCard) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const targetCard = e.target.closest('.card');
      if (!targetCard || targetCard === draggedCard) return;

      gridEl.querySelectorAll('.card.drop-before, .card.drop-after').forEach((c) => {
        if (c !== targetCard) {
          c.classList.remove('drop-before', 'drop-after');
        }
      });

      const rect = targetCard.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const midX = rect.left + rect.width / 2;
      const isBefore = e.clientY < midY || (Math.abs(e.clientY - midY) < 30 && e.clientX < midX);

      if (isBefore) {
        targetCard.classList.add('drop-before');
        targetCard.classList.remove('drop-after');
      } else {
        targetCard.classList.add('drop-after');
        targetCard.classList.remove('drop-before');
      }
    });

    gridEl.addEventListener('dragleave', (e) => {
      const targetCard = e.target.closest('.card');
      if (targetCard && !targetCard.contains(e.relatedTarget)) {
        targetCard.classList.remove('drop-before', 'drop-after');
      }
    });

    gridEl.addEventListener('drop', (e) => {
      if (!draggedCard) return;
      e.preventDefault();

      const targetCard = e.target.closest('.card');
      if (targetCard && targetCard !== draggedCard) {
        const isBefore = targetCard.classList.contains('drop-before');
        if (isBefore) {
          gridEl.insertBefore(draggedCard, targetCard);
        } else {
          gridEl.insertBefore(draggedCard, targetCard.nextSibling);
        }

        const postIds = Array.from(gridEl.querySelectorAll('.card'))
          .map((c) => c.dataset.postId)
          .filter(Boolean);

        postIds.forEach((id, idx) => {
          const p = state.posts.find((item) => item.id === id);
          if (p) p.order = idx + 1;
        });

        socket.emit('post:reorder', {
          sessionId: state.activeSessionId,
          postIds,
        });
      }

      cleanupDrag();
    });

    gridEl.addEventListener('dragend', () => {
      cleanupDrag();
    });

    function cleanupDrag() {
      if (draggedCard) {
        draggedCard.classList.remove('is-dragging');
        draggedCard = null;
      }
      gridEl.querySelectorAll('.card.drop-before, .card.drop-after').forEach((c) => {
        c.classList.remove('drop-before', 'drop-after');
      });
    }
  }

  setupGridDragAndDrop(el.boardGrid);
  setupGridDragAndDrop(el.screensGrid);

  // --- Screen Sharing Trigger ---
  async function triggerStartScreenShare(post, options = {}) {
    if (!screenManager.isSecureContext()) {
      openModal(el.httpsRequiredModal);
      return false;
    }

    const streamSource = options.streamSource || (isMobileDevice ? 'camera' : 'screen');
    const facingMode = options.facingMode || el.cameraFacingSelect?.value || 'environment';

    try {
      await screenManager.startSharing(post.id, {
        authorId,
        authorName: authorName || post.author,
        streamSource,
        facingMode,
        audience: options.audience || post.screenShare?.audience || 'all',
        targetAuthorIds: options.targetAuthorIds || post.screenShare?.targetAuthorIds || [],
      });
      showToast(
        streamSource === 'camera'
          ? '📷 Transmitiendo cámara / cuaderno en vivo'
          : '🖥️ Compartiendo tu pantalla en tiempo real',
        'success'
      );
      return true;
    } catch (err) {
      if (err.code === 'HTTPS_REQUIRED') {
        openModal(el.httpsRequiredModal);
      } else if (err.code === 'SCREEN_CAPTURE_UNSUPPORTED') {
        showToast('Captura de pantalla no soportada en este navegador móvil. Usa "Cámara / Cuaderno" para transmitir.', 'warning');
      } else if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
        showToast('Transmisión cancelada');
      } else {
        showToast(err.message || 'No se pudo iniciar la transmisión', 'error');
      }
      return false;
    }
  }

  // --- Simple Screen Share / Queue Modal (ONLY Name & Reason) ---
  function openScreenShareModal() {
    if (state.isDisabled) {
      showToast('🚫 Tu cuenta está deshabilitada por el profesor para compartir pantalla.', 'error');
      return;
    }
    if (state.sessionStatus?.isClosed && !state.isTeacher) {
      showToast('🔒 Esta sesión está cerrada por el profesor (solo lectura).', 'error');
      return;
    }
    el.screenAuthorInput.value = authorName;
    el.screenReasonInput.value = '';
    el.screenModalError.textContent = '';
    el.screenModalError.classList.add('hidden');

    // Reset audience selector to "all"
    if (el.optAudienceAll) {
      el.optAudienceAll.classList.add('active');
      const radio = el.optAudienceAll.querySelector('input');
      if (radio) radio.checked = true;
    }
    el.optAudienceTeacher?.classList.remove('active');
    el.optAudienceCustom?.classList.remove('active');
    el.screenTargetUsersBox?.classList.add('hidden');

    if (isMobileDevice) {
      if (el.screenSourceSelectorGroup) el.screenSourceSelectorGroup.classList.remove('hidden');
      if (el.btnUploadScreenCapture) el.btnUploadScreenCapture.classList.remove('hidden');
      if (el.screenShareModalTitle) el.screenShareModalTitle.textContent = '📱 Transmitir en Vivo / Cuaderno';
      if (el.btnStartScreenDirect) el.btnStartScreenDirect.innerHTML = '🔴 Transmitir ahora';
    } else {
      if (el.screenSourceSelectorGroup) el.screenSourceSelectorGroup.classList.add('hidden');
      if (el.btnUploadScreenCapture) el.btnUploadScreenCapture.classList.add('hidden');
      if (el.screenShareModalTitle) el.screenShareModalTitle.textContent = '🖥️ Compartir pantalla';
      if (el.btnStartScreenDirect) el.btnStartScreenDirect.innerHTML = '🖥️ Compartir ahora';
    }

    openModal(el.screenShareModal);
    if (!authorName) {
      el.screenAuthorInput.focus();
    } else {
      el.screenReasonInput.focus();
    }
  }

  // Handle mobile screen source selector (Camera vs Screen)
  if (el.optSourceCamera && el.optSourceScreen) {
    el.optSourceCamera.addEventListener('click', () => {
      el.optSourceCamera.classList.add('active');
      el.optSourceScreen.classList.remove('active');
      const radio = el.optSourceCamera.querySelector('input');
      if (radio) radio.checked = true;
      if (el.cameraFacingRow) el.cameraFacingRow.classList.remove('hidden');
    });
    el.optSourceScreen.addEventListener('click', () => {
      el.optSourceScreen.classList.add('active');
      el.optSourceCamera.classList.remove('active');
      const radio = el.optSourceScreen.querySelector('input');
      if (radio) radio.checked = true;
      if (el.cameraFacingRow) el.cameraFacingRow.classList.add('hidden');
    });
  }

  // Handle screen audience selector (All, Teacher, Custom)
  function renderScreenTargetUsersList() {
    if (!el.screenTargetUsersList) return;
    const otherUsers = (state.chatUsers || []).filter((u) => u.authorId !== authorId);
    if (otherUsers.length === 0) {
      el.screenTargetUsersList.innerHTML = `
        <div class="muted-note" style="padding:8px 10px;font-size:0.8rem;">
          No hay otros participantes conectados ahora. Si inicias, solo tú o quien se una después con permiso podrá verla.
        </div>
      `;
      return;
    }
    el.screenTargetUsersList.innerHTML = otherUsers
      .map((u) => {
        const roleLabel = u.isTeacher ? '🎓 Docente' : '🎒 Alumno';
        return `
          <label class="screen-target-user-item" style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;cursor:pointer;background:var(--bg-input);margin-bottom:4px;">
            <input type="checkbox" name="screenTargetUser" value="${escapeHtml(u.authorId)}" checked style="accent-color:var(--primary);" />
            <div class="avatar" style="width:24px;height:24px;font-size:0.7rem;background:${getAvatarColor(u.name || u.authorId)}">${escapeHtml(getInitials(u.name))}</div>
            <strong style="font-size:0.84rem;flex:1;color:var(--text);">${escapeHtml(u.name)}</strong>
            <span style="font-size:0.72rem;color:var(--text-muted);">${roleLabel}</span>
          </label>
        `;
      })
      .join('');
  }

  if (el.optAudienceAll && el.optAudienceTeacher && el.optAudienceCustom) {
    const audOptions = [
      { el: el.optAudienceAll, val: 'all' },
      { el: el.optAudienceTeacher, val: 'teacher' },
      { el: el.optAudienceCustom, val: 'custom' },
    ];
    audOptions.forEach((opt) => {
      opt.el.addEventListener('click', () => {
        audOptions.forEach((o) => o.el.classList.remove('active'));
        opt.el.classList.add('active');
        const radio = opt.el.querySelector('input');
        if (radio) radio.checked = true;
        if (opt.val === 'custom') {
          el.screenTargetUsersBox?.classList.remove('hidden');
          renderScreenTargetUsersList();
        } else {
          el.screenTargetUsersBox?.classList.add('hidden');
        }
      });
    });
  }

  if (el.btnUploadScreenCapture) {
    el.btnUploadScreenCapture.addEventListener('click', () => {
      closeModal(el.screenShareModal);
      openComposerForCreate();
      showToast('📸 Selecciona una foto de tu cuaderno o captura de pantalla', 'info');
    });
  }

  function showScreenModalError(msg) {
    el.screenModalError.textContent = msg;
    el.screenModalError.classList.remove('hidden');
  }

  async function createScreenCardAndShare({
    author,
    reason,
    streamSource = 'screen',
    facingMode = 'environment',
    audience = 'all',
    targetAuthorIds = [],
  }) {
    if (!screenManager.isSecureContext()) {
      openModal(el.httpsRequiredModal);
      return false;
    }

    setAuthorName(author);
    const isCamera = streamSource === 'camera';
    const displayTopic = isCamera ? `[Cámara] ${reason}` : reason;

    const ack = await new Promise((resolve) => {
      socket.emit(
        'post:create',
        {
          sessionId: state.activeSessionId,
          kind: 'screen',
          authorId,
          author,
          topic: displayTopic,
          content: '',
          color: 'default',
          screenShare: {
            audience,
            targetAuthorIds,
            sourceType: streamSource,
          },
        },
        resolve
      );
    });

    if (!ack?.ok || !ack.post) {
      throw new Error(ack?.error || 'No se pudo crear la tarjeta de pantalla.');
    }

    if (state.workspaceView === 'padlets') {
      applyWorkspaceView('screens');
    }

    return triggerStartScreenShare(ack.post, { streamSource, facingMode, audience, targetAuthorIds });
  }

  el.btnJoinScreenQueue.addEventListener('click', () => {
    const author = el.screenAuthorInput.value.trim();
    const reason = el.screenReasonInput.value.trim();
    el.screenModalError.classList.add('hidden');

    if (!author) {
      showScreenModalError('Por favor ingresa tu nombre.');
      el.screenAuthorInput.focus();
      return;
    }
    if (!reason) {
      showScreenModalError('Por favor escribe el motivo para compartir tu pantalla.');
      el.screenReasonInput.focus();
      return;
    }

    const audienceRadio = el.screenShareForm.querySelector('input[name="screenAudienceChoice"]:checked');
    const audience = audienceRadio ? audienceRadio.value : 'all';
    const targetAuthorIds = [];
    if (audience === 'custom' && el.screenTargetUsersList) {
      const checkedBoxes = el.screenTargetUsersList.querySelectorAll('input[name="screenTargetUser"]:checked');
      checkedBoxes.forEach((cb) => targetAuthorIds.push(cb.value));
    }

    setAuthorName(author);
    el.btnJoinScreenQueue.disabled = true;
    socket.emit('screen-queue:join', { authorId, author, reason, audience, targetAuthorIds }, (ack) => {
      el.btnJoinScreenQueue.disabled = false;
      if (!ack?.ok) {
        showScreenModalError(ack?.error || 'No se pudo agregar a la cola.');
        return;
      }
      closeModal(el.screenShareModal);
      if (state.workspaceView === 'padlets') {
        applyWorkspaceView('screens');
      }
      showToast(
        ack.updated
          ? 'Tu solicitud en la cola fue actualizada'
          : '🙋 Te agregaste a la cola para compartir pantalla',
        'success'
      );
    });
  });

  el.screenShareForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const author = el.screenAuthorInput.value.trim();
    const reason = el.screenReasonInput.value.trim();
    el.screenModalError.classList.add('hidden');

    if (!author) {
      showScreenModalError('Por favor ingresa tu nombre.');
      el.screenAuthorInput.focus();
      return;
    }
    if (!reason) {
      showScreenModalError('Por favor escribe el motivo para compartir tu pantalla.');
      el.screenReasonInput.focus();
      return;
    }

    if (!screenManager.isSecureContext()) {
      closeModal(el.screenShareModal);
      openModal(el.httpsRequiredModal);
      return;
    }

    let streamSource = 'screen';
    if (isMobileDevice) {
      const selectedRadio = el.screenShareForm.querySelector('input[name="screenSourceChoice"]:checked');
      if (selectedRadio) streamSource = selectedRadio.value;
    }
    const facingMode = el.cameraFacingSelect ? el.cameraFacingSelect.value : 'environment';

    const audienceRadio = el.screenShareForm.querySelector('input[name="screenAudienceChoice"]:checked');
    const audience = audienceRadio ? audienceRadio.value : 'all';
    const targetAuthorIds = [];
    if (audience === 'custom' && el.screenTargetUsersList) {
      const checkedBoxes = el.screenTargetUsersList.querySelectorAll('input[name="screenTargetUser"]:checked');
      checkedBoxes.forEach((cb) => targetAuthorIds.push(cb.value));
      if (targetAuthorIds.length === 0) {
        showScreenModalError('Debes seleccionar al menos un participante para compartir de forma personalizada.');
        return;
      }
    }

    el.btnStartScreenDirect.disabled = true;
    try {
      closeModal(el.screenShareModal);
      await createScreenCardAndShare({ author, reason, streamSource, facingMode, audience, targetAuthorIds });
    } catch (err) {
      showToast(err.message || 'No se pudo iniciar la transmisión', 'error');
    } finally {
      el.btnStartScreenDirect.disabled = false;
    }
  });

  // --- Composer Modal (Create / Edit Padlet) ---
  function resetComposer() {
    el.editPostId.value = '';
    el.composerTitle.textContent = 'Nueva publicación (Padlet)';
    el.btnSubmitPost.textContent = 'Publicar Padlet';
    el.inputAuthor.value = authorName;
    el.inputAuthor.disabled = false;
    el.inputTopic.value = '';
    el.inputContent.value = '';
    el.inputContent.style.height = '';
    state.selectedFile = null;
    state.existingImageUrl = null;
    state.existingImageName = null;
    state.removeExistingImage = false;
    state.composerAssignmentId = null;
    state.composerAssignmentTitle = null;
    if (el.composerAssignmentId) el.composerAssignmentId.value = '';
    if (el.composerAssignmentRefTitle) el.composerAssignmentRefTitle.textContent = '';
    if (el.composerAssignmentTitle) el.composerAssignmentTitle.textContent = '';
    if (el.composerAssignmentRefBox) el.composerAssignmentRefBox.classList.add('hidden');
    el.inputImage.value = '';
    showImagePreview(null);
    selectColor('default');
    hideComposerError();
  }

  function openComposerForCreate() {
    if (state.isDisabled) {
      showToast('🚫 Tu cuenta está deshabilitada por el profesor (solo lectura).', 'error');
      return;
    }
    if (state.sessionStatus?.isClosed && !state.isTeacher) {
      showToast('🔒 Esta sesión está cerrada por el profesor (solo lectura).', 'error');
      return;
    }
    resetComposer();
    openModal(el.composerModal);
    if (!authorName) {
      el.inputAuthor.focus();
    } else {
      el.inputTopic.focus();
    }
  }

  function openComposerForEdit(post) {
    if (state.isDisabled) {
      showToast('🚫 Tu cuenta está deshabilitada por el profesor para editar.', 'error');
      return;
    }
    if (state.sessionStatus?.isClosed && !state.isTeacher) {
      showToast('🔒 Esta sesión está cerrada por el profesor (solo lectura).', 'error');
      return;
    }
    resetComposer();
    el.editPostId.value = post.id;
    el.composerTitle.textContent = isScreenPost(post) ? 'Editar motivo de pantalla' : 'Editar publicación';
    el.btnSubmitPost.textContent = 'Guardar cambios';
    el.inputAuthor.value = post.author;
    el.inputAuthor.disabled = true;
    el.inputTopic.value = post.topic;
    el.inputContent.value = post.content || '';
    autoResizeTextarea(el.inputContent);
    state.existingImageUrl = post.imageUrl || null;
    state.existingImageName = post.imageName || null;
    if (post.imageUrl) {
      showImagePreview(post.imageUrl);
    }
    if (post.assignmentId && post.assignmentTitle) {
      state.composerAssignmentId = post.assignmentId;
      state.composerAssignmentTitle = post.assignmentTitle;
      if (el.composerAssignmentId) el.composerAssignmentId.value = post.assignmentId;
      if (el.composerAssignmentRefTitle) el.composerAssignmentRefTitle.textContent = post.assignmentTitle;
      if (el.composerAssignmentTitle) el.composerAssignmentTitle.textContent = post.assignmentTitle;
      if (el.composerAssignmentRefBox) el.composerAssignmentRefBox.classList.remove('hidden');
    }
    selectColor(post.color || 'default');
    openModal(el.composerModal);
    el.inputTopic.focus();
  }

  function showComposerError(msg) {
    el.composerError.textContent = msg;
    el.composerError.classList.remove('hidden');
  }

  function hideComposerError() {
    el.composerError.textContent = '';
    el.composerError.classList.add('hidden');
  }

  function selectColor(color) {
    state.selectedColor = color;
    el.colorPicker.querySelectorAll('.color-swatch').forEach((swatch) => {
      swatch.classList.toggle('selected', swatch.dataset.color === color);
    });
  }

  el.colorPicker.addEventListener('click', (e) => {
    const swatch = e.target.closest('.color-swatch');
    if (!swatch) return;
    selectColor(swatch.dataset.color);
  });

  function showImagePreview(src) {
    if (src) {
      el.imagePreview.src = src;
      el.imagePreviewBox.classList.remove('hidden');
      el.dropzonePlaceholder.classList.add('hidden');
      setTimeout(() => {
        if (el.btnSubmitPost) {
          el.btnSubmitPost.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    } else {
      el.imagePreview.src = '';
      el.imagePreviewBox.classList.add('hidden');
      el.dropzonePlaceholder.classList.remove('hidden');
    }
  }

  function handleSelectedImageFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showComposerError('El archivo seleccionado no es una imagen válida.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      showComposerError('La imagen supera el máximo permitido de 15 MB.');
      return;
    }
    hideComposerError();
    state.selectedFile = file;
    state.removeExistingImage = false;
    const reader = new FileReader();
    reader.onload = () => showImagePreview(reader.result);
    reader.readAsDataURL(file);
  }

  el.imageDropzone.addEventListener('click', (e) => {
    if (e.target.closest('#btnRemoveImage')) return;
    el.inputImage.click();
  });

  el.inputImage.addEventListener('change', () => {
    if (el.inputImage.files && el.inputImage.files[0]) {
      handleSelectedImageFile(el.inputImage.files[0]);
    }
  });

  el.imageDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.imageDropzone.classList.add('dragover');
  });

  el.imageDropzone.addEventListener('dragleave', () => {
    el.imageDropzone.classList.remove('dragover');
  });

  el.imageDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    el.imageDropzone.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleSelectedImageFile(file);
  });

  el.btnRemoveImage.addEventListener('click', (e) => {
    e.stopPropagation();
    state.selectedFile = null;
    if (state.existingImageUrl) {
      state.removeExistingImage = true;
    }
    el.inputImage.value = '';
    showImagePreview(null);
  });

  // Paste screenshot directly in Composer OR Teacher Assignment modal
  window.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const composerOpen = !el.composerModal.classList.contains('hidden');
    const taskOpen =
      !el.teacherPanelModal.classList.contains('hidden') && state.activeTeacherTab === 'assignment';

    if (!composerOpen && !taskOpen) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          if (composerOpen) {
            handleSelectedImageFile(file);
          } else if (taskOpen) {
            handleTaskImageFile(file);
          }
          showToast('Imagen pegada desde el portapapeles');
          break;
        }
      }
    }
  });

  async function submitComposer() {
    hideComposerError();
    const editingId = el.editPostId.value;
    const author = el.inputAuthor.value.trim();
    const topic = el.inputTopic.value.trim();
    const content = el.inputContent.value.trim();

    if (!editingId && !author) {
      showComposerError('Por favor ingresa tu nombre.');
      el.inputAuthor.focus();
      return;
    }
    if (!topic) {
      showComposerError('Por favor ingresa un tema para la publicación.');
      el.inputTopic.focus();
      return;
    }

    if (!editingId) {
      setAuthorName(author);
    }

    el.btnSubmitPost.disabled = true;

    try {
      const uploaded = state.selectedFile ? await uploadFile(state.selectedFile) : null;

      if (editingId) {
        const ack = await new Promise((resolve) => {
          socket.emit(
            'post:update',
            {
              id: editingId,
              sessionId: state.activeSessionId,
              authorId,
              teacherToken: state.teacherToken,
              topic,
              content,
              color: state.selectedColor,
              imageUrl: uploaded ? uploaded.imageUrl : state.existingImageUrl,
              imageName: uploaded ? uploaded.imageName : state.existingImageName,
              removeImage: state.removeExistingImage && !uploaded,
              assignmentId: state.composerAssignmentId || null,
              assignmentTitle: state.composerAssignmentTitle || null,
            },
            resolve
          );
        });
        if (!ack?.ok) throw new Error(ack?.error || 'No se pudo actualizar.');
        closeModal(el.composerModal);
        showToast('Publicación actualizada', 'success');
      } else {
        const ack = await new Promise((resolve) => {
          socket.emit(
            'post:create',
            {
              sessionId: state.activeSessionId,
              kind: 'padlet',
              authorId,
              author,
              topic,
              content,
              color: state.selectedColor,
              imageUrl: uploaded ? uploaded.imageUrl : null,
              imageName: uploaded ? uploaded.imageName : null,
              assignmentId: state.composerAssignmentId || null,
              assignmentTitle: state.composerAssignmentTitle || null,
            },
            resolve
          );
        });
        if (!ack?.ok) throw new Error(ack?.error || 'No se pudo crear la publicación.');
        closeModal(el.composerModal);
        if (state.workspaceView === 'screens') {
          applyWorkspaceView('padlets');
        }
        showToast('Publicado en el panel de Padlets', 'success');
      }
    } catch (err) {
      showComposerError(err.message || 'Ocurrió un error al publicar.');
    } finally {
      el.btnSubmitPost.disabled = false;
    }
  }

  el.composerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitComposer();
  });

  // --- UI Mode (Modo Fácil vs Modo Completo), Density, Help Guide & Resume Request ---
  function applyUiMode(mode) {
    state.uiMode = mode === 'easy' ? 'easy' : 'full';
    localStorage.setItem(STORAGE_UI_MODE_KEY, state.uiMode);
    const isEasy = state.uiMode === 'easy';
    document.body.classList.toggle('mode-easy', isEasy);
    el.easyModeBar.classList.toggle('hidden', !isEasy);

    el.uiModeToggle.querySelectorAll('.mode-switch-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.uiMode === state.uiMode);
    });

    el.btnHelpSwitchEasy.textContent = isEasy ? '⚡ Cambiar a Modo Completo' : '🌱 Activar Modo Fácil';
    el.btnNewPost.querySelector('span').textContent = isEasy ? 'Escribir respuesta' : 'Publicar';
  }

  el.uiModeToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.mode-switch-btn');
    if (!btn) return;
    applyUiMode(btn.dataset.uiMode);
    showToast(
      state.uiMode === 'easy'
        ? '🌱 Modo Fácil activado: botones grandes y simples'
        : '⚡ Modo Completo activado: todas las opciones visibles'
    );
  });

  el.btnHelpGuide.addEventListener('click', () => openModal(el.helpGuideModal));
  el.btnEasyHelp.addEventListener('click', () => openModal(el.helpGuideModal));
  el.btnEasyPublish.addEventListener('click', () => openComposerForCreate());
  el.btnEasyShare.addEventListener('click', () => openScreenShareModal());
  el.btnOpenScreenModal.addEventListener('click', () => openScreenShareModal());
  el.btnQueueJoinQuick.addEventListener('click', () => openScreenShareModal());
  el.btnShareScreenFromTab.addEventListener('click', () => openScreenShareModal());
  el.btnScreensEmptyShare.addEventListener('click', () => openScreenShareModal());

  el.btnHelpSwitchEasy.addEventListener('click', () => {
    applyUiMode(state.uiMode === 'easy' ? 'full' : 'easy');
    closeModal(el.helpGuideModal);
    showToast(state.uiMode === 'easy' ? '🌱 Modo Fácil activado' : '⚡ Modo Completo activado');
  });

  el.densityControl.addEventListener('click', (e) => {
    const btn = e.target.closest('.density-btn');
    if (!btn) return;
    state.densityMode = btn.dataset.density;
    localStorage.setItem(STORAGE_DENSITY_KEY, state.densityMode);
    updateBoardDensity();
  });

  el.viewLayoutControl?.addEventListener('click', (e) => {
    const btn = e.target.closest('.layout-btn');
    if (!btn) return;
    state.viewLayout = btn.dataset.layout || 'canva';
    localStorage.setItem(STORAGE_VIEW_LAYOUT_KEY, state.viewLayout);
    updateBoardDensity();
    showToast(state.viewLayout === 'list' ? '📋 Modo Lista activado' : '🎨 Modo Canva activado', 'info');
  });

  el.screensDensityControl?.addEventListener('click', (e) => {
    const btn = e.target.closest('.density-btn');
    if (!btn) return;
    state.screensSize = btn.dataset.screenSize || 'compact';
    localStorage.setItem(STORAGE_SCREENS_SIZE_KEY, state.screensSize);
    updateScreensDensity();
  });

  el.btnAcceptResumeScreen.addEventListener('click', async () => {
    const postId = state.pendingResumePostId;
    const turnGrant = state.pendingTurnGrant;
    closeModal(el.resumeScreenModal);
    state.pendingResumePostId = null;
    state.pendingTurnGrant = null;

    if (turnGrant) {
      try {
        await createScreenCardAndShare({
          author: turnGrant.author || authorName || 'Participante',
          reason: turnGrant.reason || 'Pantalla compartida',
          audience: turnGrant.audience || 'all',
          targetAuthorIds: turnGrant.targetAuthorIds || [],
        });
      } catch (err) {
        showToast(err.message || 'No se pudo compartir la pantalla', 'error');
      }
      return;
    }

    if (!postId) return;
    const post = state.posts.find((p) => p.id === postId);
    if (!post) return;
    if (state.workspaceView === 'padlets') {
      applyWorkspaceView('screens');
    }
    await triggerStartScreenShare(post);
  });

  // --- Rich Text Formatting Editor Toolbar (preserves spaces, line heights & emojis) ---
  function autoResizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(76, Math.min(520, textarea.scrollHeight)) + 'px';
  }

  function insertFormatIntoTextarea(textarea, prefix, suffix = '', defaultText = '') {
    if (!textarea) return;
    textarea.focus();
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    const text = textarea.value;
    const selected = text.substring(start, end) || defaultText;
    const replacement = prefix + selected + suffix;

    let applied = false;
    try {
      applied = document.execCommand('insertText', false, replacement);
    } catch {}

    if (!applied) {
      textarea.value = text.substring(0, start) + replacement + text.substring(end);
      textarea.selectionStart = start + prefix.length;
      textarea.selectionEnd = start + prefix.length + selected.length;
    }
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    autoResizeTextarea(textarea);
  }

  function applyFormatToTextarea(textarea, fmt) {
    if (!textarea) return;
    switch (fmt) {
      case 'bold':
        insertFormatIntoTextarea(textarea, '**', '**', 'texto en negrita');
        break;
      case 'italic':
        insertFormatIntoTextarea(textarea, '*', '*', 'texto en cursiva');
        break;
      case 'underline':
        insertFormatIntoTextarea(textarea, '<u>', '</u>', 'texto subrayado');
        break;
      case 'strike':
        insertFormatIntoTextarea(textarea, '~~', '~~', 'texto tachado');
        break;
      case 'heading':
        insertFormatIntoTextarea(textarea, '### ', '', 'Título');
        break;
      case 'list-ul':
        insertFormatIntoTextarea(textarea, '• ', '', 'Elemento de lista');
        break;
      case 'list-ol':
        insertFormatIntoTextarea(textarea, '1. ', '', 'Elemento numerado');
        break;
      case 'quote':
        insertFormatIntoTextarea(textarea, '> ', '', 'Cita destacada');
        break;
      case 'code':
        insertFormatIntoTextarea(textarea, '`', '`', 'código');
        break;
    }
  }

  function initRichEditorToolbars() {
    document.querySelectorAll('.rich-editor-toolbar').forEach((toolbar) => {
      const targetId = toolbar.dataset.for;
      const textarea = document.getElementById(targetId);
      if (!textarea) return;

      // Auto-adapt textarea height to content on typing and pasting
      textarea.addEventListener('input', () => autoResizeTextarea(textarea));
      textarea.addEventListener('paste', () => {
        setTimeout(() => autoResizeTextarea(textarea), 0);
      });

      const emojiMenu = toolbar.querySelector('.emoji-picker-menu');
      const emojiTrigger = toolbar.querySelector('.emoji-trigger');

      if (emojiTrigger && emojiMenu) {
        emojiTrigger.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          emojiMenu.classList.toggle('hidden');
        });

        emojiMenu.addEventListener('click', (e) => {
          const chip = e.target.closest('.emoji-chip');
          if (!chip) return;
          const emoji = chip.dataset.emoji;
          insertFormatIntoTextarea(textarea, emoji);
          emojiMenu.classList.add('hidden');
        });

        document.addEventListener('click', (e) => {
          if (!toolbar.contains(e.target)) {
            emojiMenu.classList.add('hidden');
          }
        });
      }

      toolbar.querySelectorAll('.fmt-btn:not(.emoji-trigger)').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const fmt = btn.dataset.format;
          applyFormatToTextarea(textarea, fmt);
        });
      });
    });
  }

  // --- Topbar Live Clock and Elapsed Session Timer ---
  const STORAGE_SESSION_START_TIME = 'padletlocal_session_start_time';
  const STORAGE_SESSION_START_ID = 'padletlocal_session_start_id';
  let sessionStartTime = Number(sessionStorage.getItem(STORAGE_SESSION_START_TIME)) || Date.now();

  function syncSessionStartTime(sessionId) {
    const sessionKey = sessionId || '__DEFAULT__';
    const storedSessionId = sessionStorage.getItem(STORAGE_SESSION_START_ID);
    const storedTime = Number(sessionStorage.getItem(STORAGE_SESSION_START_TIME));
    if (storedSessionId === sessionKey && storedTime && !isNaN(storedTime)) {
      sessionStartTime = storedTime;
    } else {
      sessionStartTime = Date.now();
      sessionStorage.setItem(STORAGE_SESSION_START_ID, sessionKey);
      sessionStorage.setItem(STORAGE_SESSION_START_TIME, String(sessionStartTime));
    }
  }

  function updateTopbarClockAndSessionTimer() {
    if (!el.topbarClockDigits || !el.topbarSessionDuration) return;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const h = pad(now.getHours());
    const m = pad(now.getMinutes());
    const s = pad(now.getSeconds());

    el.topbarClockDigits.innerHTML = `<span class="clock-hm">${h}:${m}</span><span class="clock-sec">:${s}</span>`;

    const elapsedSec = Math.max(0, Math.floor((Date.now() - sessionStartTime) / 1000));
    const hrs = Math.floor(elapsedSec / 3600);
    const mins = Math.floor((elapsedSec % 3600) / 60);
    const secs = elapsedSec % 60;

    let sessionStr = '';
    if (hrs > 0) {
      sessionStr = `${hrs}h ${mins}m`;
    } else if (mins > 0) {
      sessionStr = `${mins}m ${secs}s`;
    } else {
      sessionStr = `${secs}s`;
    }

    el.topbarSessionDuration.textContent = sessionStr;

    if (el.topbarClockWidget) {
      el.topbarClockWidget.title = `Hora local: ${h}:${m}:${s} · Tiempo en sesión: ${
        hrs > 0 ? `${hrs}h ` : ''
      }${mins > 0 ? `${mins}m ` : ''}${secs}s`;
    }
  }

  function initTopbarClockAndSessionTimer() {
    syncSessionStartTime(state.activeSessionId);
    updateTopbarClockAndSessionTimer();
    setInterval(updateTopbarClockAndSessionTimer, 1000);
  }

  applyUiMode(state.uiMode);
  applyWorkspaceView(state.workspaceView);
  updateBoardDensity();
  updateScreensDensity();
  initRichEditorToolbars();
  initTopbarClockAndSessionTimer();

  // --- Header & Toolbar Listeners ---
  el.btnNewPost?.addEventListener('click', () => openComposerForCreate());
  el.fabNewPost?.addEventListener('click', () => openComposerForCreate());
  el.btnEmptyCreate?.addEventListener('click', () => openComposerForCreate());
  el.btnEmptyShare?.addEventListener('click', () => openScreenShareModal());

  el.btnNetworkInfo.addEventListener('click', async () => {
    await loadServerInfo();
    openModal(el.networkModal);
  });

  el.searchInput.addEventListener('input', () => {
    state.searchQuery = el.searchInput.value;
    renderBoardFull();
  });

  function openBoardEditModalForTeacher() {
    if (!state.isTeacher) {
      showToast('Acceso restringido. Solo el profesor puede editar la institución y el evento.', 'error');
      return;
    }
    if (el.inputBoardInstitution) {
      el.inputBoardInstitution.value = (state.board.institutionName || 'Institución Educativa').replace(/^🏫\s*/, '');
    }
    if (el.inputBoardLogo) {
      el.inputBoardLogo.value = state.board.institutionLogo || '';
    }
    el.inputBoardTitle.value = state.board.eventName || state.board.title || '';
    el.inputBoardDesc.value = state.board.description || '';
    openModal(el.boardEditModal);
    if (el.inputBoardTitle) el.inputBoardTitle.focus();
  }

  el.btnEditBoard.addEventListener('click', () => {
    openBoardEditModalForTeacher();
  });

  if (el.menuItemTeacherEditBoard) {
    el.menuItemTeacherEditBoard.addEventListener('click', () => {
      closeAllRoleMenus();
      openBoardEditModalForTeacher();
    });
  }

  el.boardEditForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.isTeacher) {
      showToast('Acceso restringido. Solo el profesor puede guardar cambios de la institución y evento.', 'error');
      return;
    }
    const title = el.inputBoardTitle.value.trim();
    const eventName = title;
    const institutionName = el.inputBoardInstitution ? el.inputBoardInstitution.value.trim() : '';
    const institutionLogo = el.inputBoardLogo ? el.inputBoardLogo.value.trim() : '';
    const description = el.inputBoardDesc.value.trim();
    if (!title) return;
    try {
      const res = await fetch('/api/board', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-teacher-token': state.teacherToken || '',
        },
        body: JSON.stringify({
          sessionId: state.activeSessionId,
          teacherToken: state.teacherToken || '',
          title,
          eventName,
          institutionName,
          institutionLogo,
          description,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al guardar');
      }
      closeModal(el.boardEditModal);
      showToast('Institución y evento actualizados correctamente', 'success');
    } catch (err) {
      showToast(err.message || 'No se pudo actualizar el panel', 'error');
    }
  });

  // Screen horizontal scroll navigation buttons
  if (el.btnScrollScreensLeft && el.screensGrid) {
    el.btnScrollScreensLeft.addEventListener('click', () => {
      el.screensGrid.scrollBy({ left: -340, behavior: 'smooth' });
    });
  }
  if (el.btnScrollScreensRight && el.screensGrid) {
    el.btnScrollScreensRight.addEventListener('click', () => {
      el.screensGrid.scrollBy({ left: 340, behavior: 'smooth' });
    });
  }

  el.btnUserChip.addEventListener('click', () => {
    el.inputQuickName.value = authorName;
    openModal(el.nameModal);
    el.inputQuickName.focus();
  });

  el.nameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = el.inputQuickName.value.trim();
    if (!name) return;
    setAuthorName(name);
    closeModal(el.nameModal);
    showToast(`Hola, ${name}`);
  });

  el.lightboxClose.addEventListener('click', () => closeModal(el.lightboxModal));
  el.lightboxModal.addEventListener('click', (e) => {
    if (e.target === el.lightboxModal) closeModal(el.lightboxModal);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      [
        el.timerProjectorModal,
        el.lightboxModal,
        el.composerModal,
        el.screenShareModal,
        el.teacherPanelModal,
        el.teacherLoginModal,
        el.notificationsModal,
        el.helpGuideModal,
        el.resumeScreenModal,
        el.networkModal,
        el.httpsRequiredModal,
        el.boardEditModal,
        el.nameModal,
        el.aboutDevModal,
        document.getElementById('liveQuizModal'),
        document.getElementById('quizAnalyticsModal'),
      ].filter(Boolean).forEach(closeModal);
      return;
    }

    const activeTag = document.activeElement?.tagName;
    const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';
    const anyModalOpen = Boolean(
      document.querySelector('.modal-backdrop:not(.hidden), .lightbox:not(.hidden), .projector-overlay:not(.hidden)')
    );

    if (!isTyping && !anyModalOpen && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault();
      openComposerForCreate(false);
    }
  });

  // --- About CoDevNexus & Check Updates Listeners ---
  if (el.btnOpenDevInfo && el.aboutDevModal) {
    el.btnOpenDevInfo.addEventListener('click', () => {
      openModal(el.aboutDevModal);
    });
  }

  if (el.btnAboutDev && el.aboutDevModal) {
    el.btnAboutDev.addEventListener('click', () => {
      openModal(el.aboutDevModal);
    });
  }

  if (el.btnCheckUpdates && el.updatesResultBox) {
    el.btnCheckUpdates.addEventListener('click', async () => {
      el.btnCheckUpdates.disabled = true;
      el.updatesResultBox.classList.remove('hidden');
      el.updatesResultBox.innerHTML = `
        <div class="updates-status updates-status--checking" style="display:flex;align-items:center;gap:8px;font-size:0.85rem;color:var(--text-subtle);">
          <span class="spinner" style="display:inline-block;width:14px;height:14px;border:2px solid #3b82f6;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;"></span>
          <span>Verificando estado del repositorio y actualizaciones...</span>
        </div>
      `;
      try {
        const res = await fetch('/api/updates/check');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo verificar el repositorio');

        if (el.appCurrentVersionBadge) {
          el.appCurrentVersionBadge.textContent = `v${data.currentVersion || '1.2.0'}`;
        }

        const isGit = Boolean(data.isGitRepo);
        const branchBadge = isGit
          ? `<span style="background:rgba(16,185,129,0.15);color:#10b981;padding:2px 8px;border-radius:12px;font-weight:600;font-size:0.75rem;">Rama: ${escapeHtml(
              data.gitBranch || 'main'
            )}</span>`
          : `<span style="background:rgba(245,158,11,0.15);color:#f59e0b;padding:2px 8px;border-radius:12px;font-weight:600;font-size:0.75rem;">Sin Git (.zip)</span>`;

        el.updatesResultBox.innerHTML = `
          <div class="updates-status updates-status--ready" style="padding:10px 12px;background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.2);border-radius:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span style="font-size:0.88rem;font-weight:700;">Versión activa: v${escapeHtml(data.currentVersion || '1.2.0')}</span>
              ${branchBadge}
            </div>
            <p style="margin:0 0 8px 0;font-size:0.82rem;color:var(--text-subtle);line-height:1.4;">
              ${escapeHtml(data.message || 'Sistema listo y operativo en red local.')}
            </p>
            <div style="background:var(--bg-card);border:1px dashed var(--border-color);padding:8px 10px;border-radius:6px;font-size:0.78rem;line-height:1.45;">
              <strong>¿Cómo actualizar sin borrar tus publicaciones?:</strong>
              <ol style="margin:4px 0 0 16px;padding:0;">
                <li>Cierra el servidor y abre <code>PadletLocal.bat</code>.</li>
                <li>Selecciona la opción <strong>[9] Actualizar sistema (Git / Backup)</strong>.</li>
                <li>O manualmente ejecuta: <code>git pull origin main &amp;&amp; npm install</code>.</li>
                <li>Tus datos en <code>data/posts.json</code> y fotos en <code>uploads/</code> están 100% protegidos y respaldados automáticamente.</li>
              </ol>
            </div>
          </div>
        `;
      } catch (err) {
        el.updatesResultBox.innerHTML = `
          <div class="updates-status updates-status--error" style="padding:8px 10px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;color:#ef4444;font-size:0.82rem;">
            ✕ ${escapeHtml(err.message || 'Error al conectar')}
          </div>
        `;
      } finally {
        el.btnCheckUpdates.disabled = false;
      }
    });
  }

  setInterval(() => {
    state.posts.forEach((post) => {
      const cardEl = document.querySelector(`.card[data-post-id="${CSS.escape(post.id)}"]`);
      if (!cardEl) return;
      const timeEl = cardEl.querySelector('.post-time');
      if (timeEl) {
        timeEl.textContent = `${formatRelativeTime(post.createdAt)}${post.updatedAt ? ' · editado' : ''}`;
      }
    });
    const expandedTask = getExpandedTask();
    if (expandedTask) {
      el.assignmentMeta.textContent = `${expandedTask.updatedBy || 'Profesor'} · ${formatRelativeTime(
        expandedTask.updatedAt
      )}`;
    }
  }, 60000);

  // =====================================================================
  // WELCOME & ROLE SELECTION (Multi-Profesor & Alumnos)
  // =====================================================================
  function updateWelcomeSessionsDropdown() {
    if (!el.welcomeStudentSessionSelect) return;
    const accessible = (state.sessions || []).filter(
      (s) => s.isPublished !== false && !s.hideFromStudents
    );
    if (accessible.length === 0) {
      el.welcomeStudentSessionSelect.innerHTML = `<option value="${escapeHtml(state.activeSessionId || '')}">Clase Principal</option>`;
      return;
    }
    el.welcomeStudentSessionSelect.innerHTML = accessible
      .map(
        (s) =>
          `<option value="${escapeHtml(s.id)}" ${
            s.id === state.activeSessionId ? 'selected' : ''
          }>${escapeHtml(s.name)}${s.isClosed ? ' (🔒 Solo lectura)' : ''}</option>`
      )
      .join('');
  }

  function openWelcomeModal({ dismissible = false } = {}) {
    if (!el.welcomeRoleModal) return;
    if (el.welcomeStudentName) el.welcomeStudentName.value = authorName || '';
    if (el.welcomeTeacherName) el.welcomeTeacherName.value = state.teacherName || 'Docente';
    if (el.welcomeTeacherPin) el.welcomeTeacherPin.value = '';
    if (el.welcomeTeacherError) el.welcomeTeacherError.classList.add('hidden');

    updateWelcomeSessionsDropdown();

    if (el.btnCloseWelcomeModal) {
      el.btnCloseWelcomeModal.classList.toggle('hidden', !dismissible);
    }
    openModal(el.welcomeRoleModal);
  }

  if (el.welcomeStudentForm) {
    el.welcomeStudentForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = el.welcomeStudentName?.value?.trim();
      const targetSessionId = el.welcomeStudentSessionSelect?.value || state.activeSessionId;
      if (!name) {
        showToast('Por favor escribe tu nombre de estudiante', 'error');
        el.welcomeStudentName?.focus();
        return;
      }

      setAuthorName(name);
      state.isTeacher = false;
      authorId = getEffectiveAuthorId();
      state.teacherToken = '';
      sessionStorage.removeItem(STORAGE_TEACHER_TOKEN_KEY);
      sessionStorage.setItem(STORAGE_ROLE_KEY, 'student');
      state.hasChosenSession = true;
      updateTeacherUI();
      updateStudentMenuUI();

      if (targetSessionId && targetSessionId !== state.activeSessionId) {
        socket.emit('session:join', { sessionId: targetSessionId, teacherToken: '' }, (ack) => {
          if (!ack?.ok) showToast(ack?.error || 'No se pudo entrar a la clase seleccionada', 'error');
          else showToast(`📚 Entraste a "${ack.snapshot?.board?.title || 'la clase'}"`, 'success');
        });
      }

      socket.emit('client:register', {
        authorId,
        authorName: name,
        teacherToken: '',
        teacherName: '',
      });

      closeModal(el.welcomeRoleModal);
      showToast(`🎒 ¡Bienvenido/a, ${name}! Has ingresado como Alumno.`, 'success');
    });
  }

  if (el.welcomeTeacherForm) {
    el.welcomeTeacherForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const enteredName = el.welcomeTeacherName?.value?.trim() || 'Docente';
      const pin = el.welcomeTeacherPin?.value?.trim();
      if (!pin) {
        if (el.welcomeTeacherError) {
          el.welcomeTeacherError.textContent = 'Ingresa el PIN de profesor.';
          el.welcomeTeacherError.classList.remove('hidden');
        }
        el.welcomeTeacherPin?.focus();
        return;
      }
      el.welcomeTeacherError?.classList.add('hidden');

      try {
        const res = await fetch('/api/teacher/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin }),
        });
        const data = await res.json();
        if (!res.ok || !data.token) {
          if (el.welcomeTeacherError) {
            el.welcomeTeacherError.textContent = data.error || 'PIN incorrecto.';
            el.welcomeTeacherError.classList.remove('hidden');
          }
          el.welcomeTeacherPin?.select();
          return;
        }

        state.teacherName = enteredName;
        localStorage.setItem(STORAGE_TEACHER_NAME_KEY, enteredName);
        state.teacherToken = data.token;
        state.isTeacher = true;
        authorId = getEffectiveAuthorId();
        sessionStorage.setItem(STORAGE_TEACHER_TOKEN_KEY, data.token);
        sessionStorage.setItem(STORAGE_ROLE_KEY, 'teacher');
        state.hasChosenSession = true;

        socket.emit('client:register', {
          authorId,
          authorName: enteredName,
          teacherToken: data.token,
          teacherName: enteredName,
        });

        updateTeacherUI();
        closeModal(el.welcomeRoleModal);
        showToast(`🎓 ¡Bienvenido, ${state.teacherName}! Modo Docente activado.`, 'success');
        openTeacherPanel('assignment');
      } catch {
        if (el.welcomeTeacherError) {
          el.welcomeTeacherError.textContent = 'No se pudo verificar el PIN.';
          el.welcomeTeacherError.classList.remove('hidden');
        }
      }
    });
  }

  if (el.btnWelcomeAboutDev) {
    el.btnWelcomeAboutDev.addEventListener('click', () => {
      openModal(el.aboutDevModal);
    });
  }

  // Role Switching Menu Items
  el.menuItemStudentSwitchRole?.addEventListener('click', () => {
    closeActionMenus();
    openWelcomeModal({ dismissible: true });
  });

  el.menuItemTeacherSwitchRole?.addEventListener('click', () => {
    closeActionMenus();
    openWelcomeModal({ dismissible: true });
  });

  // =====================================================================
  // LIVE SESSION CHAT DRAWER & INDEPENDENT ENCRYPTED MESSAGING
  // =====================================================================
  function updateGlobalChatSoundUI() {
    if (!el.btnToggleChatSoundGlobal) return;
    const isMuted = state.chatSoundEnabled === false || state.soundEnabled === false;
    el.btnToggleChatSoundGlobal.textContent = isMuted ? '🔕' : '🔔';
    el.btnToggleChatSoundGlobal.title = isMuted
      ? 'Sonido de chat silenciado en general (clic para activar sonido)'
      : 'Sonido de chat activado (clic para silenciar todo el chat)';
    el.btnToggleChatSoundGlobal.classList.toggle('is-muted', isMuted);
  }

  function updateThreadMuteUI() {
    if (!el.btnToggleMuteCurrentThread) return;
    const thread = state.activeChatThread || 'all';
    const isMuted = state.mutedThreads.has(thread);
    el.btnToggleMuteCurrentThread.textContent = isMuted ? '🔕' : '🔔';
    el.btnToggleMuteCurrentThread.title = isMuted
      ? 'Esta conversación está silenciada (clic para activar sonido)'
      : 'Silenciar sonido de notificación para esta conversación';
    el.btnToggleMuteCurrentThread.classList.toggle('is-muted', isMuted);
  }

  function toggleCurrentThreadMute() {
    const thread = state.activeChatThread || 'all';
    if (state.mutedThreads.has(thread)) {
      state.mutedThreads.delete(thread);
      showToast('🔔 Sonido activado para esta conversación', 'success');
    } else {
      state.mutedThreads.add(thread);
      showToast('🔕 Sonido silenciado para esta conversación', 'info');
    }
    localStorage.setItem(STORAGE_MUTED_THREADS_KEY, JSON.stringify(Array.from(state.mutedThreads)));
    updateThreadMuteUI();
    renderConversationsList();
  }

  function toggleThreadMuteByKey(threadKey) {
    if (!threadKey) return;
    if (state.mutedThreads.has(threadKey)) {
      state.mutedThreads.delete(threadKey);
      showToast('🔔 Sonido activado para esta conversación', 'success');
    } else {
      state.mutedThreads.add(threadKey);
      showToast('🔕 Sonido silenciado para esta conversación', 'info');
    }
    localStorage.setItem(STORAGE_MUTED_THREADS_KEY, JSON.stringify(Array.from(state.mutedThreads)));
    if (state.activeChatThread === threadKey) {
      updateThreadMuteUI();
    }
    renderConversationsList();
  }

  function toggleGlobalChatSound() {
    state.chatSoundEnabled = !state.chatSoundEnabled;
    localStorage.setItem(STORAGE_CHAT_SOUND_KEY, String(state.chatSoundEnabled));
    updateGlobalChatSoundUI();
    if (state.chatSoundEnabled) {
      showToast('🔔 Sonido de notificaciones activado para el chat', 'success');
      playChime('info');
    } else {
      showToast('🔕 Sonido de notificaciones silenciado para TODO el chat', 'info');
    }
  }

  function getThreadKeyForMessage(msg) {
    if (!msg) return 'all';
    if (!msg.isPrivate || msg.to === 'all') return 'all';
    const mFrom = msg.fromId || msg.authorId;
    const mTo = msg.to;
    if (mTo === 'teacher' || mTo === 'teachers' || msg.fromRole === 'teacher' || msg.isTeacher) {
      if (state.isTeacher) {
        const studentId = (msg.fromRole === 'teacher' || msg.isTeacher)
          ? (mTo.startsWith('user:') ? mTo.slice(5) : mTo)
          : mFrom;
        return `user:${studentId}`;
      } else {
        return 'teachers';
      }
    }
    const otherId = (mFrom === authorId)
      ? (mTo.startsWith('user:') ? mTo.slice(5) : mTo)
      : mFrom;
    return `user:${otherId}`;
  }

  function calculateUnreads() {
    const unreads = {};
    let totalUnread = 0;
    (state.chatMessages || []).forEach((m) => {
      const isFromMe = (m.authorId === authorId || m.fromId === authorId);
      if (isFromMe) return;
      if (!state.readMessageIds.has(m.id)) {
        const threadKey = getThreadKeyForMessage(m);
        unreads[threadKey] = (unreads[threadKey] || 0) + 1;
        totalUnread++;
      }
    });
    state.unreadByThread = unreads;
    state.unreadChatCount = totalUnread;

    // Update tab badge
    if (el.tabChatUnreadBadge) {
      if (totalUnread > 0) {
        el.tabChatUnreadBadge.textContent = String(totalUnread);
        el.tabChatUnreadBadge.classList.remove('hidden');
      } else {
        el.tabChatUnreadBadge.textContent = '0';
        el.tabChatUnreadBadge.classList.add('hidden');
      }
    }

    // Update floating buttons
    const countStr = String(Math.min(99, totalUnread));
    if (el.chatUnreadBadge) {
      el.chatUnreadBadge.textContent = countStr;
      el.chatUnreadBadge.classList.toggle('hidden', totalUnread === 0);
    }
    if (el.fabChatBadge) {
      el.fabChatBadge.textContent = countStr;
      el.fabChatBadge.classList.toggle('hidden', totalUnread === 0);
    }
  }

  function markThreadAsRead(threadKey) {
    if (!threadKey) return;
    (state.chatMessages || []).forEach((m) => {
      if (isMsgInThread(m, threadKey)) {
        state.readMessageIds.add(m.id);
      }
    });
    try {
      const arr = Array.from(state.readMessageIds).slice(-500);
      localStorage.setItem('padletlocal_read_msgs', JSON.stringify(arr));
    } catch {}
    calculateUnreads();
    renderConversationsList();
  }

  function updateChatThreadBannerUI() {
    const thread = state.activeChatThread || 'all';
    if (!el.chatThreadTitle) return;
    if (thread === 'all') {
      if (el.chatThreadIcon) el.chatThreadIcon.textContent = '📢';
      if (el.chatThreadTitle) el.chatThreadTitle.textContent = 'Canal General (Toda la clase)';
      if (el.chatThreadBadge) {
        el.chatThreadBadge.className = 'chat-thread-badge badge-public';
        el.chatThreadBadge.textContent = 'Público';
      }
      el.chatPrivacyNote?.classList.add('hidden');
    } else if (thread === 'teachers') {
      if (el.chatThreadIcon) el.chatThreadIcon.textContent = '🎓';
      if (el.chatThreadTitle) el.chatThreadTitle.textContent = 'Chat con Docente (Privado)';
      if (el.chatThreadBadge) {
        el.chatThreadBadge.className = 'chat-thread-badge badge-private';
        el.chatThreadBadge.textContent = '🔒 Privado e Independiente';
      }
      el.chatPrivacyNote?.classList.remove('hidden');
    } else if (thread.startsWith('user:')) {
      const targetId = thread.slice(5);
      const targetUser = (state.chatUsers || []).find((u) => u.authorId === targetId);
      const targetName = targetUser?.name || 'Usuario';
      if (el.chatThreadIcon) el.chatThreadIcon.textContent = targetUser?.isTeacher ? '🎓' : '💬';
      if (el.chatThreadTitle) el.chatThreadTitle.textContent = `Chat con ${targetName}`;
      if (el.chatThreadBadge) {
        el.chatThreadBadge.className = 'chat-thread-badge badge-private';
        el.chatThreadBadge.textContent = '🔒 Privado e Independiente';
      }
      el.chatPrivacyNote?.classList.remove('hidden');
    }
    updateThreadMuteUI();
  }

  function isMsgInThread(m, thread) {
    if (!m) return false;
    const mFrom = m.fromId || m.authorId;
    const mTo = m.to;
    if (thread === 'all') {
      return !m.isPrivate || mTo === 'all';
    }
    if (thread === 'teachers') {
      if (mTo === 'teacher' || mTo === 'teachers') {
        return mFrom === authorId || state.isTeacher;
      }
      if (m.fromRole === 'teacher' || m.isTeacher) {
        return mTo === authorId || mTo === `user:${authorId}`;
      }
      return false;
    }
    if (thread.startsWith('user:')) {
      const targetId = thread.slice(5);
      if (mFrom === authorId && (mTo === targetId || mTo === `user:${targetId}`)) return true;
      if (mFrom === targetId && (mTo === authorId || mTo === `user:${authorId}`)) return true;
      if (state.isTeacher) {
        if (mFrom === targetId && (mTo === 'teacher' || mTo === 'teachers')) return true;
        if ((m.fromRole === 'teacher' || m.isTeacher) && (mTo === targetId || mTo === `user:${targetId}`)) return true;
      }
      return false;
    }
    return false;
  }

  function openConversationThread(threadKey) {
    state.activeChatThread = threadKey || 'all';
    state.chatCurrentView = 'thread';

    if (el.chatConversationsListView) el.chatConversationsListView.classList.add('hidden');
    if (el.chatThreadView) el.chatThreadView.classList.remove('hidden');

    if (el.chatRecipientSelect) {
      if (!el.chatRecipientSelect.querySelector(`option[value="${CSS.escape(state.activeChatThread)}"]`)) {
        const opt = document.createElement('option');
        opt.value = state.activeChatThread;
        opt.textContent = `💬 ${state.activeChatThread} (Privado)`;
        el.chatRecipientSelect.appendChild(opt);
      }
      el.chatRecipientSelect.value = state.activeChatThread;
    }

    updateChatThreadBannerUI();
    renderChatMessages(state.chatMessages);
    markThreadAsRead(state.activeChatThread);

    if (!state.isChatOpen) {
      openChatDrawer();
    }
    switchChatTab('messages');

    setTimeout(() => {
      if (el.chatInputText) el.chatInputText.focus();
    }, 120);
  }

  function openConversationsListView() {
    state.chatCurrentView = 'list';
    if (el.chatConversationsListView) el.chatConversationsListView.classList.remove('hidden');
    if (el.chatThreadView) el.chatThreadView.classList.add('hidden');
    calculateUnreads();
    renderConversationsList();
  }

  function formatChatSummary(m, defaultText) {
    if (!m) return defaultText;
    const author = m.authorName || (m.isTeacher ? 'Docente' : 'Alumno');
    if (m.imageUrl && !m.text) return `${author}: 📷 [Imagen]`;
    if (m.imageUrl && m.text) return `${author}: 📷 ${m.text}`;
    return `${author}: ${m.text || ''}`;
  }

  function renderConversationsList() {
    if (!el.chatConversationsList) return;

    calculateUnreads();

    // Collect all conversations
    const convMap = new Map();

    // 1. Canal General
    const allMsgs = (state.chatMessages || []).filter((m) => !m.isPrivate || m.to === 'all');
    const lastAll = allMsgs[allMsgs.length - 1];
    convMap.set('all', {
      threadKey: 'all',
      title: 'Canal General (Toda la clase)',
      roleTag: '<span class="chat-bubble-role-tag" style="background:rgba(59,130,246,0.15);color:#3b82f6;">📢 Público</span>',
      avatarBg: '#3b82f6',
      avatarContent: '📢',
      isOnline: true,
      lastMsg: formatChatSummary(lastAll, 'Canal público de la sesión de clase'),
      lastTime: lastAll ? formatRelativeTime(lastAll.createdAt) : '',
      lastTimestamp: lastAll ? lastAll.timestamp || 0 : 1,
      unread: state.unreadByThread['all'] || 0,
    });

    // 2. Docente (for students)
    if (!state.isTeacher) {
      const teacherMsgs = (state.chatMessages || []).filter((m) => isMsgInThread(m, 'teachers'));
      const lastTeacher = teacherMsgs[teacherMsgs.length - 1];
      const teacherOnline = (state.chatUsers || []).some((u) => u.isTeacher);
      convMap.set('teachers', {
        threadKey: 'teachers',
        title: 'Docente (Privado)',
        roleTag: '<span class="chat-bubble-role-tag role-tag-teacher">🎓 Docente</span>',
        avatarBg: '#6366f1',
        avatarContent: '🎓',
        isOnline: teacherOnline,
        lastMsg: formatChatSummary(lastTeacher, 'Chat privado e independiente con el profesor'),
        lastTime: lastTeacher ? formatRelativeTime(lastTeacher.createdAt) : '',
        lastTimestamp: lastTeacher ? lastTeacher.timestamp || 0 : 2,
        unread: state.unreadByThread['teachers'] || 0,
      });
    }

    // 3. Private 1-to-1 conversations with other users
    const partnerIds = new Set();
    (state.chatMessages || []).forEach((m) => {
      if (m.isPrivate && m.to !== 'all') {
        const mFrom = m.fromId || m.authorId;
        const mTo = m.to;
        if (state.isTeacher && (mTo === 'teacher' || mTo === 'teachers' || m.fromRole === 'teacher')) {
          const studentId = (m.fromRole === 'teacher')
            ? (mTo.startsWith('user:') ? mTo.slice(5) : mTo)
            : mFrom;
          if (studentId && studentId !== authorId) partnerIds.add(studentId);
        } else {
          if (mFrom && mFrom !== authorId) partnerIds.add(mFrom);
          if (mTo && mTo.startsWith('user:')) {
            const tId = mTo.slice(5);
            if (tId !== authorId) partnerIds.add(tId);
          }
        }
      }
    });

    // Also include online users so you can tap them directly in the chat list
    (state.chatUsers || []).forEach((u) => {
      if (u.authorId && u.authorId !== authorId) {
        partnerIds.add(u.authorId);
      }
    });

    partnerIds.forEach((pId) => {
      const threadKey = `user:${pId}`;
      const threadMsgs = (state.chatMessages || []).filter((m) => isMsgInThread(m, threadKey));
      const lastMsg = threadMsgs[threadMsgs.length - 1];
      const partnerUser = (state.chatUsers || []).find((u) => u.authorId === pId);
      const isOnline = Boolean(partnerUser);
      const name = partnerUser?.name || lastMsg?.authorName || lastMsg?.toName || 'Usuario';
      const isTeacherPartner = Boolean(partnerUser?.isTeacher || lastMsg?.fromRole === 'teacher');
      const initials = getInitials(name);
      const color = getAvatarColor(name || pId);
      const roleTag = isTeacherPartner
        ? '<span class="chat-bubble-role-tag role-tag-teacher">🎓 Docente</span>'
        : '<span class="chat-bubble-role-tag role-tag-student">🎒 Alumno</span>';

      convMap.set(threadKey, {
        threadKey,
        title: name,
        roleTag,
        avatarBg: color,
        avatarContent: escapeHtml(initials),
        isOnline,
        lastMsg: formatChatSummary(lastMsg, 'Toca para iniciar una conversación privada'),
        lastTime: lastMsg ? formatRelativeTime(lastMsg.createdAt) : '',
        lastTimestamp: lastMsg ? lastMsg.timestamp || 0 : 0,
        unread: state.unreadByThread[threadKey] || 0,
      });
    });

    // Sort: Conversations with unread first, then by last timestamp (newest first)
    const sorted = Array.from(convMap.values()).sort((a, b) => {
      if (a.unread > 0 && b.unread === 0) return -1;
      if (a.unread === 0 && b.unread > 0) return 1;
      return (b.lastTimestamp || 0) - (a.lastTimestamp || 0);
    });

    el.chatConversationsList.innerHTML = sorted
      .map((c) => {
        const hasUnread = c.unread > 0;
        const isMuted = state.mutedThreads.has(c.threadKey);
        return `
          <div class="chat-conv-item ${hasUnread ? 'has-unread' : ''}" data-conv-thread="${escapeHtml(c.threadKey)}">
            <div class="chat-conv-avatar" style="background:${c.avatarBg};">
              ${c.avatarContent}
              ${c.isOnline ? '<span class="chat-conv-online-dot" title="En línea"></span>' : ''}
            </div>
            <div class="chat-conv-body">
              <div class="chat-conv-row-top">
                <span class="chat-conv-name">
                  ${escapeHtml(c.title)}
                  ${isMuted ? '<span class="chat-conv-muted-icon" title="Sonido silenciado en este chat">🔕</span>' : ''}
                  ${c.roleTag}
                </span>
                <span class="chat-conv-time">${escapeHtml(c.lastTime)}</span>
              </div>
              <div class="chat-conv-row-bottom">
                <span class="chat-conv-last-msg">${escapeHtml(c.lastMsg)}</span>
                <button type="button" class="btn-chat-conv-mute ${isMuted ? 'is-muted' : ''}" data-mute-thread="${escapeHtml(c.threadKey)}" title="${isMuted ? 'Activar sonido de notificación para este chat' : 'Silenciar sonido de notificación para este chat'}">${isMuted ? '🔕' : '🔔'}</button>
                ${hasUnread ? `<span class="chat-unread-pill">${c.unread}</span>` : ''}
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function openChatDrawer() {
    state.isChatOpen = true;
    if (el.chatDrawer) el.chatDrawer.classList.remove('hidden');
    updateGlobalChatSoundUI();
    updateThreadMuteUI();
    if (el.chatSessionBadge) {
      el.chatSessionBadge.textContent = state.board?.eventName || state.board?.title || 'Sesión';
    }
    if (el.chatCurrentUserName) {
      el.chatCurrentUserName.textContent = state.isTeacher ? (state.teacherName || 'Docente') : (authorName || 'Alumno');
    }

    socket.emit('chat:history', { sessionId: state.activeSessionId }, (res) => {
      if (res?.ok && Array.isArray(res.messages)) {
        state.chatMessages = res.messages;
        calculateUnreads();
        if (state.chatCurrentView === 'thread') {
          renderChatMessages(state.chatMessages);
          markThreadAsRead(state.activeChatThread);
        } else {
          renderConversationsList();
        }
      }
    });

    socket.emit('chat:get-users', { sessionId: state.activeSessionId }, (res) => {
      if (res?.ok && Array.isArray(res.users)) {
        renderChatUsers(res.users);
      }
    });

    if (state.chatCurrentView === 'thread') {
      if (el.chatConversationsListView) el.chatConversationsListView.classList.add('hidden');
      if (el.chatThreadView) el.chatThreadView.classList.remove('hidden');
      updateChatThreadBannerUI();
      renderChatMessages(state.chatMessages);
      markThreadAsRead(state.activeChatThread);
      setTimeout(() => {
        if (el.chatInputText) el.chatInputText.focus();
      }, 150);
    } else {
      if (el.chatConversationsListView) el.chatConversationsListView.classList.remove('hidden');
      if (el.chatThreadView) el.chatThreadView.classList.add('hidden');
      renderConversationsList();
    }
  }

  function closeChatDrawer() {
    state.isChatOpen = false;
    if (el.chatDrawer) el.chatDrawer.classList.add('hidden');
    if (el.chatDrawerBackdrop) el.chatDrawerBackdrop.classList.add('hidden');
  }

  function switchChatTab(tab) {
    state.activeChatTab = tab;
    if (el.tabChatMessages) el.tabChatMessages.classList.toggle('active', tab === 'messages');
    if (el.tabChatUsers) el.tabChatUsers.classList.toggle('active', tab === 'users');
    if (el.chatMessagesPane) el.chatMessagesPane.classList.toggle('hidden', tab !== 'messages');
    if (el.chatUsersPane) el.chatUsersPane.classList.toggle('hidden', tab !== 'users');
    if (tab === 'users') {
      socket.emit('chat:get-users', { sessionId: state.activeSessionId }, (res) => {
        if (res?.ok && Array.isArray(res.users)) {
          renderChatUsers(res.users);
        }
      });
    } else if (tab === 'messages') {
      if (state.chatCurrentView === 'list') {
        renderConversationsList();
      } else {
        renderChatMessages(state.chatMessages);
      }
    }
  }

  function renderChatMessages(messages) {
    state.chatMessages = Array.isArray(messages) ? messages : [];
    if (!el.chatMessagesList) return;

    const thread = state.activeChatThread || 'all';
    const threadMessages = state.chatMessages.filter((m) => isMsgInThread(m, thread));

    if (threadMessages.length === 0) {
      const emptyNote =
        thread === 'all'
          ? 'No hay mensajes en el canal general de la sesión.'
          : thread === 'teachers'
          ? 'No hay mensajes privados con el docente aún. Escribe aquí para consultar de forma privada.'
          : 'No hay mensajes en este chat privado aún. Todo lo que conversen aquí es independiente y privado.';
      el.chatMessagesList.innerHTML = `
        <div class="chat-empty-state">
          <div class="chat-empty-icon">${thread === 'all' ? '📢' : '🔒'}</div>
          <p>${emptyNote}</p>
          <span class="muted-note">Privacidad garantizada y protegida por sesión.</span>
        </div>
      `;
      return;
    }

    el.chatMessagesList.innerHTML = threadMessages
      .map((m) => {
        const isOutgoing = (m.authorId === authorId || m.fromId === authorId);
        const isPriv = Boolean(m.isPrivate);
        const roleTag = m.isTeacher
          ? '<span class="chat-bubble-role-tag role-tag-teacher">🎓 Docente</span>'
          : '<span class="chat-bubble-role-tag role-tag-student">🎒 Alumno</span>';
        const privateBadge = isPriv
          ? `<span class="chat-bubble-badge-private">🔒 ${
              isOutgoing
                ? `Para: ${escapeHtml(m.toName || 'Privado')}`
                : `De: ${escapeHtml(m.authorName || 'Usuario')}`
            }</span>`
          : '';
        const encBadge = (m.isEncrypted || isPriv)
          ? `<span class="chat-bubble-encrypted-badge" title="Mensaje cifrado y protegido">🔒 Cifrado</span>`
          : '';
        const deleteBtn = isOutgoing
          ? `<button type="button" class="btn-chat-delete-msg" data-msg-id="${escapeHtml(m.id)}" title="Eliminar mi mensaje">🗑️</button>`
          : '';
        const imgHtml = m.imageUrl
          ? `
            <div class="chat-bubble-img-wrap" data-img-src="${escapeHtml(m.imageUrl)}" data-img-author="${escapeHtml(m.authorName || 'Usuario')}" title="Clic para ver imagen completa">
              <img src="${escapeHtml(m.imageUrl)}" class="chat-bubble-img" alt="Imagen enviada" loading="lazy" />
            </div>
          `
          : '';
        const textHtml = m.text ? `<p class="chat-bubble-text">${formatTextWithLinks(m.text)}</p>` : '';

        return `
          <div class="chat-bubble ${isOutgoing ? 'is-outgoing' : 'is-incoming'} ${isPriv ? 'is-private' : ''}">
            <div class="chat-bubble-head">
              <span class="chat-bubble-author">${escapeHtml(
                m.authorName || (m.isTeacher ? 'Docente' : 'Alumno')
              )}</span>
              ${roleTag}
              ${privateBadge}
              ${encBadge}
              <span class="chat-bubble-time">${formatRelativeTime(m.createdAt)}</span>
              ${deleteBtn}
            </div>
            ${imgHtml}
            ${textHtml}
          </div>
        `;
      })
      .join('');

    el.chatMessagesList.scrollTop = el.chatMessagesList.scrollHeight;
  }

  function appendChatMessage(msg) {
    if (!msg) return;
    const isForThisSession = !msg.sessionId || msg.sessionId === state.activeSessionId;
    if (!isForThisSession) return;

    if (!Array.isArray(state.chatMessages)) state.chatMessages = [];
    state.chatMessages.push(msg);

    const msgThread = getThreadKeyForMessage(msg);
    const isFromMe = (msg.authorId === authorId || msg.fromId === authorId);

    // If chat drawer is open AND viewing this thread:
    if (state.isChatOpen && state.chatCurrentView === 'thread' && state.activeChatThread === msgThread) {
      state.readMessageIds.add(msg.id);
      calculateUnreads();

      const empty = el.chatMessagesList.querySelector('.chat-empty-state');
      if (empty) empty.remove();

      const isOutgoing = isFromMe;
      const isPriv = Boolean(msg.isPrivate);
      const roleTag = msg.isTeacher
        ? '<span class="chat-bubble-role-tag role-tag-teacher">🎓 Docente</span>'
        : '<span class="chat-bubble-role-tag role-tag-student">🎒 Alumno</span>';
      const privateBadge = isPriv
        ? `<span class="chat-bubble-badge-private">🔒 ${
            isOutgoing
              ? `Para: ${escapeHtml(msg.toName || 'Privado')}`
              : `De: ${escapeHtml(msg.authorName || 'Usuario')}`
          }</span>`
        : '';
      const encBadge = (msg.isEncrypted || isPriv)
        ? `<span class="chat-bubble-encrypted-badge" title="Mensaje cifrado y protegido">🔒 Cifrado</span>`
        : '';
      const deleteBtn = isOutgoing
        ? `<button type="button" class="btn-chat-delete-msg" data-msg-id="${escapeHtml(msg.id)}" title="Eliminar mi mensaje">🗑️</button>`
        : '';
      const imgHtml = msg.imageUrl
        ? `
          <div class="chat-bubble-img-wrap" data-img-src="${escapeHtml(msg.imageUrl)}" data-img-author="${escapeHtml(msg.authorName || 'Usuario')}" title="Clic para ver imagen completa">
            <img src="${escapeHtml(msg.imageUrl)}" class="chat-bubble-img" alt="Imagen enviada" loading="lazy" />
          </div>
        `
        : '';
      const textHtml = msg.text ? `<p class="chat-bubble-text">${formatTextWithLinks(msg.text)}</p>` : '';

      const bubble = document.createElement('div');
      bubble.className = `chat-bubble ${isOutgoing ? 'is-outgoing' : 'is-incoming'} ${
        isPriv ? 'is-private' : ''
      }`;
      bubble.innerHTML = `
        <div class="chat-bubble-head">
          <span class="chat-bubble-author">${escapeHtml(
            msg.authorName || (msg.isTeacher ? 'Docente' : 'Alumno')
          )}</span>
          ${roleTag}
          ${privateBadge}
          ${encBadge}
          <span class="chat-bubble-time">${formatRelativeTime(msg.createdAt)}</span>
          ${deleteBtn}
        </div>
        ${imgHtml}
        ${textHtml}
      `;
      el.chatMessagesList.appendChild(bubble);
      el.chatMessagesList.scrollTop = el.chatMessagesList.scrollHeight;
    } else {
      // Received while in another thread or while chat closed
      calculateUnreads();
      if (state.isChatOpen && state.chatCurrentView === 'list') {
        renderConversationsList();
      }

      if (!isFromMe) {
        const isGlobalMuted = (state.soundEnabled === false || state.chatSoundEnabled === false);
        const isThreadMuted = state.mutedThreads.has(msgThread);
        if (!isGlobalMuted && !isThreadMuted) {
          playChime('info');
        }
        const sender = msg.authorName || (msg.isTeacher ? 'Docente' : 'Alumno');
        const rawSnippet = msg.text || (msg.imageUrl ? '📷 [Imagen adjunta]' : '');
        const shortSnippet = rawSnippet.length > 50 ? rawSnippet.slice(0, 47) + '...' : rawSnippet;
        const mutedBadge = isThreadMuted ? '<span style="opacity:0.75;font-size:0.8rem;margin-left:4px;" title="Conversación silenciada">🔕</span>' : '';
        const toastHtml = `
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:1.15rem;">💬</span>
            <div>
              <strong>${escapeHtml(sender)}</strong>${mutedBadge}: "${escapeHtml(shortSnippet)}"<br>
              <small style="opacity:0.85;color:#818cf8;font-weight:600;">👉 Toca aquí para abrir y responder</small>
            </div>
          </div>
        `;
        showToast(toastHtml, 'info', () => openConversationThread(msgThread));
      }
    }
  }

  function renderChatUsers(users) {
    state.chatUsers = Array.isArray(users) ? users : [];
    const count = state.chatUsers.length;
    if (el.chatOnlineUsersCount) el.chatOnlineUsersCount.textContent = String(count);
    if (el.chatPresenceInfo) {
      el.chatPresenceInfo.textContent = `${count} ${count === 1 ? 'conectado' : 'conectados'} en esta sesión`;
    }

    if (el.chatRecipientSelect) {
      const currentVal = state.activeChatThread || el.chatRecipientSelect.value || 'all';
      let optionsHtml = `
        <option value="all" ${currentVal === 'all' ? 'selected' : ''}>📢 Canal General (Toda la clase)</option>
        <option value="teachers" ${currentVal === 'teachers' ? 'selected' : ''}>🎓 Chat con Docente (Privado)</option>
      `;

      state.chatUsers.forEach((u) => {
        if (u.authorId !== authorId) {
          const roleLabel = u.isTeacher ? '🎓 Prof.' : '🎒';
          const optVal = `user:${u.authorId}`;
          const isSel = currentVal === optVal ? 'selected' : '';
          optionsHtml += `<option value="${escapeHtml(optVal)}" ${isSel} data-user-name="${escapeHtml(
            u.name
          )}">${roleLabel} ${escapeHtml(u.name)} (Privado)</option>`;
        }
      });
      el.chatRecipientSelect.innerHTML = optionsHtml;
      if (currentVal && el.chatRecipientSelect.querySelector(`option[value="${CSS.escape(currentVal)}"]`)) {
        el.chatRecipientSelect.value = currentVal;
      }
    }

    if (el.chatUsersList) {
      if (state.chatUsers.length === 0) {
        el.chatUsersList.innerHTML = '<div class="muted-note" style="padding:16px;text-align:center;">No hay usuarios detectados en esta sesión.</div>';
        return;
      }

      // Sort: Teachers first, current user next, then alphabetical
      const sortedUsers = [...state.chatUsers].sort((a, b) => {
        if (a.isTeacher && !b.isTeacher) return -1;
        if (!a.isTeacher && b.isTeacher) return 1;
        if (a.authorId === authorId) return -1;
        if (b.authorId === authorId) return 1;
        return (a.name || '').localeCompare(b.name || '');
      });

      el.chatUsersList.innerHTML = sortedUsers
        .map((u) => {
          const isMe = u.authorId === authorId;
          const initials = getInitials(u.name);
          const color = getAvatarColor(u.name || u.authorId);
          const roleTag = u.isTeacher
            ? '<span class="chat-bubble-role-tag role-tag-teacher">🎓 Docente</span>'
            : '<span class="chat-bubble-role-tag role-tag-student">🎒 Alumno</span>';

          if (isMe) {
            return `
              <div class="chat-user-item chat-user-item-me">
                <div class="chat-user-left">
                  <div class="chat-user-avatar" style="background:${color}">${escapeHtml(initials)}</div>
                  <div class="chat-user-details">
                    <div class="chat-user-name">${escapeHtml(u.name)} <span class="chat-me-tag">(Tú)</span></div>
                    <div class="chat-user-status-row">
                      <span class="chat-user-status-dot"></span>
                      ${roleTag}
                    </div>
                  </div>
                </div>
                <div class="chat-user-actions">
                  <button type="button" class="btn btn-xs btn-secondary btn-chat-edit-nick" title="Cambiar tu nombre o apodo">✏️ Mi nick</button>
                </div>
              </div>
            `;
          }

          return `
            <div class="chat-user-item" data-author-id="${escapeHtml(u.authorId)}" data-author-name="${escapeHtml(u.name)}">
              <div class="chat-user-left">
                <div class="chat-user-avatar" style="background:${color}">${escapeHtml(initials)}</div>
                <div class="chat-user-details">
                  <div class="chat-user-name">${escapeHtml(u.name)}</div>
                  <div class="chat-user-status-row">
                    <span class="chat-user-status-dot"></span>
                    ${roleTag}
                  </div>
                </div>
              </div>
              <div class="chat-user-actions">
                <button type="button" class="btn btn-xs btn-primary btn-chat-action-private" data-author-id="${escapeHtml(u.authorId)}" data-author-name="${escapeHtml(u.name)}" title="Abrir chat privado independiente con esta persona">💬 Privado</button>
                <button type="button" class="btn btn-xs btn-secondary btn-chat-action-filter" data-author-id="${escapeHtml(u.authorId)}" data-author-name="${escapeHtml(u.name)}" title="Ver las publicaciones de este usuario">🔍 Posts</button>
                <button type="button" class="btn btn-xs btn-ghost btn-chat-action-mention" data-author-name="${escapeHtml(u.name)}" title="Mencionar a este usuario en el chat">@</button>
                ${
                  state.isTeacher && !u.isTeacher
                    ? `
                      <button type="button" class="btn btn-xs btn-warning btn-chat-action-mute" data-author-id="${escapeHtml(u.authorId)}" data-author-name="${escapeHtml(u.name)}" title="Mover a modo solo lectura (deshabilitar/habilitar)">🚫</button>
                      <button type="button" class="btn btn-xs btn-danger btn-chat-action-kick" data-author-id="${escapeHtml(u.authorId)}" data-author-name="${escapeHtml(u.name)}" title="Expulsar a este alumno de la clase">👢</button>
                    `
                    : ''
                }
              </div>
            </div>
          `;
        })
        .join('');
    }
  }

  // Chat Trigger Buttons
  el.btnOpenChat?.addEventListener('click', () => {
    if (state.isChatOpen) closeChatDrawer();
    else openChatDrawer();
  });
  el.fabChat?.addEventListener('click', () => {
    if (state.isChatOpen) closeChatDrawer();
    else openChatDrawer();
  });
  el.btnCloseChat?.addEventListener('click', closeChatDrawer);
  el.chatDrawerBackdrop?.addEventListener('click', closeChatDrawer);
  el.btnChatEditMyNick?.addEventListener('click', promptChangeNick);
  el.btnToggleChatSoundGlobal?.addEventListener('click', toggleGlobalChatSound);
  el.btnToggleMuteCurrentThread?.addEventListener('click', toggleCurrentThreadMute);

  el.menuItemStudentChat?.addEventListener('click', () => {
    closeActionMenus();
    openChatDrawer();
  });
  el.menuItemTeacherChat?.addEventListener('click', () => {
    closeActionMenus();
    openChatDrawer();
  });

  el.tabChatMessages?.addEventListener('click', () => switchChatTab('messages'));
  el.tabChatUsers?.addEventListener('click', () => switchChatTab('users'));

  // Navigation: Back from Open Thread to Conversations List
  el.btnBackToConvList?.addEventListener('click', () => {
    openConversationsListView();
  });

  // Navigation: Quick jump to online users from conversation list
  el.btnChatGoToOnline?.addEventListener('click', () => {
    switchChatTab('users');
  });

  // Clicking an item in the conversations list opens that thread, or mutes it
  el.chatConversationsList?.addEventListener('click', (e) => {
    const btnMute = e.target.closest('.btn-chat-conv-mute');
    if (btnMute) {
      e.stopPropagation();
      const threadKey = btnMute.dataset.muteThread;
      if (threadKey) {
        toggleThreadMuteByKey(threadKey);
      }
      return;
    }
    const item = e.target.closest('[data-conv-thread]');
    if (!item) return;
    const threadKey = item.dataset.convThread;
    if (threadKey) {
      openConversationThread(threadKey);
    }
  });

  el.chatRecipientSelect?.addEventListener('change', () => {
    state.activeChatThread = el.chatRecipientSelect.value;
    updateChatThreadBannerUI();
    renderChatMessages(state.chatMessages);
    markThreadAsRead(state.activeChatThread);
  });

  // Message list clicks: Image lightbox and message deletion
  el.chatMessagesList?.addEventListener('click', async (e) => {
    // 1. Click on image inside bubble -> Open full size in Lightbox modal
    const imgWrap = e.target.closest('.chat-bubble-img-wrap');
    if (imgWrap) {
      const src = imgWrap.dataset.imgSrc;
      const author = imgWrap.dataset.imgAuthor;
      if (src && el.lightboxModal && el.lightboxImg) {
        el.lightboxImg.src = src;
        if (el.lightboxCaption) el.lightboxCaption.textContent = `Imagen enviada por ${author}`;
        openModal(el.lightboxModal);
      }
      return;
    }

    // 2. Author can delete their own message
    const btnDel = e.target.closest('.btn-chat-delete-msg');
    if (!btnDel) return;
    const msgId = btnDel.dataset.msgId;
    if (!msgId) return;

    const ok = await Swal.confirm(
      '¿Eliminar mensaje?',
      '¿Seguro que deseas eliminar este mensaje? Solo tú como autor puedes eliminarlo y se borrará para todos en este hilo.',
      { icon: 'warning', confirmButtonText: 'Sí, eliminar', confirmButtonColor: '#ef4444' }
    );
    if (!ok) return;

    socket.emit('chat:message:delete', { sessionId: state.activeSessionId, messageId: msgId, authorId }, (ack) => {
      if (!ack?.ok) {
        showToast(ack?.error || 'No se pudo eliminar el mensaje', 'error');
      } else {
        showToast('Mensaje eliminado', 'info');
        state.chatMessages = (state.chatMessages || []).filter((m) => m.id !== msgId);
        renderChatMessages(state.chatMessages);
        calculateUnreads();
      }
    });
  });

  // =====================================================================
  // CHAT IMAGES & EMOJIS SYSTEM
  // =====================================================================
  let pendingChatImageFile = null;

  function setChatPendingImage(file) {
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      showToast('Solo se permiten archivos de imagen (JPG, PNG, GIF, WebP)', 'error');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      showToast('La imagen no debe superar los 15 MB', 'error');
      return;
    }
    pendingChatImageFile = file;
    const objectUrl = URL.createObjectURL(file);
    if (el.chatImagePreviewThumb) el.chatImagePreviewThumb.src = objectUrl;
    if (el.chatImagePreviewName) el.chatImagePreviewName.textContent = file.name || 'captura_imagen.png';
    if (el.chatImagePreviewRow) el.chatImagePreviewRow.classList.remove('hidden');
    if (el.chatInputText) el.chatInputText.focus();
  }

  function clearChatPendingImage() {
    pendingChatImageFile = null;
    if (el.chatImagePreviewThumb) el.chatImagePreviewThumb.src = '';
    if (el.chatImagePreviewRow) el.chatImagePreviewRow.classList.add('hidden');
    if (el.chatFileInput) el.chatFileInput.value = '';
  }

  async function uploadChatImage(file) {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Error al subir la imagen al servidor');
    }
    const data = await res.json();
    return data.imageUrl;
  }

  el.btnChatAttachImage?.addEventListener('click', () => {
    el.chatFileInput?.click();
  });

  el.chatFileInput?.addEventListener('change', (e) => {
    if (e.target.files?.[0]) {
      setChatPendingImage(e.target.files[0]);
    }
  });

  el.btnCancelChatImage?.addEventListener('click', clearChatPendingImage);

  // Paste image directly from clipboard (e.g. Win + Shift + S or screenshots)
  el.chatInputText?.addEventListener('paste', (e) => {
    const items = (e.clipboardData || window.clipboardData)?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type && item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          setChatPendingImage(file);
          showToast('📷 Imagen pegada del portapapeles lista para enviar', 'info');
          break;
        }
      }
    }
  });

  // Emojis Picker
  const CHAT_EMOJIS = [
    '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣',
    '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😋',
    '😎', '🥳', '🤔', '🤫', '😴', '🤩', '😱', '🤯',
    '👍', '👎', '👏', '🙌', '🤝', '✌️', '🤞', '✍️',
    '🙋‍♂️', '🙋‍♀️', '🙏', '💡', '🔥', '⭐', '✨', '💯',
    '📚', '📖', '📝', '✏️', '🎨', '💻', '📱', '🚀',
    '❓', '❗', '✅', '❌', '⏳', '⏰', '❤️', '🎉'
  ];

  function initChatEmojiPicker() {
    if (!el.chatEmojiGrid) return;
    el.chatEmojiGrid.innerHTML = CHAT_EMOJIS.map(
      (em) => `<button type="button" class="chat-emoji-btn" data-emoji="${em}" title="${em}">${em}</button>`
    ).join('');

    el.chatEmojiGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.chat-emoji-btn');
      if (!btn) return;
      const emoji = btn.dataset.emoji;
      if (!emoji || !el.chatInputText) return;

      const input = el.chatInputText;
      const start = input.selectionStart != null ? input.selectionStart : input.value.length;
      const end = input.selectionEnd != null ? input.selectionEnd : input.value.length;
      const text = input.value;
      input.value = text.substring(0, start) + emoji + text.substring(end);
      input.selectionStart = input.selectionEnd = start + emoji.length;
      input.focus();
    });

    el.btnChatEmoji?.addEventListener('click', (e) => {
      e.stopPropagation();
      el.chatEmojiPicker?.classList.toggle('hidden');
    });

    el.btnCloseEmojiPicker?.addEventListener('click', (e) => {
      e.stopPropagation();
      el.chatEmojiPicker?.classList.add('hidden');
    });

    document.addEventListener('click', (e) => {
      if (el.chatEmojiPicker && !el.chatEmojiPicker.classList.contains('hidden')) {
        if (!el.chatEmojiPicker.contains(e.target) && e.target !== el.btnChatEmoji) {
          el.chatEmojiPicker.classList.add('hidden');
        }
      }
    });
  }

  initChatEmojiPicker();

  el.chatForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = el.chatInputText?.value?.trim() || '';
    if (!text && !pendingChatImageFile) return;

    let imageUrl = null;
    if (pendingChatImageFile) {
      try {
        if (el.btnSendChat) el.btnSendChat.disabled = true;
        imageUrl = await uploadChatImage(pendingChatImageFile);
      } catch (err) {
        showToast(err.message || 'Error al subir la imagen', 'error');
        if (el.btnSendChat) el.btnSendChat.disabled = false;
        return;
      } finally {
        if (el.btnSendChat) el.btnSendChat.disabled = false;
      }
    }

    const thread = state.activeChatThread || el.chatRecipientSelect?.value || 'all';
    const to = thread;
    const selectedOpt = el.chatRecipientSelect?.selectedOptions[0];
    const toName = selectedOpt?.dataset?.userName || selectedOpt?.textContent?.trim() || '';

    socket.emit(
      'chat:send',
      {
        sessionId: state.activeSessionId,
        text,
        imageUrl,
        to,
        toName,
        authorName: state.isTeacher ? (state.teacherName || 'Docente') : (authorName || 'Alumno'),
      },
      (ack) => {
        if (ack?.ok) {
          if (el.chatInputText) el.chatInputText.value = '';
          clearChatPendingImage();
          if (el.chatEmojiPicker) el.chatEmojiPicker.classList.add('hidden');
        } else {
          showToast(ack?.error || 'No se pudo enviar el mensaje', 'error');
        }
      }
    );
  });

  el.btnClearChat?.addEventListener('click', async () => {
    const ok = await Swal.confirm(
      '¿Limpiar chat de la sesión?',
      '¿Deseas limpiar todos los mensajes del chat de esta sesión para todos los usuarios?',
      { icon: 'warning', confirmButtonText: 'Sí, limpiar chat', confirmButtonColor: '#ef4444' }
    );
    if (!ok) return;
    socket.emit('chat:clear', { teacherToken: state.teacherToken, sessionId: state.activeSessionId }, (ack) => {
      if (!ack?.ok) showToast(ack?.error || 'No se pudo limpiar el chat', 'error');
      else showToast('Chat de la sesión limpiado');
    });
  });

  // Action buttons on Online Users List
  el.chatUsersList?.addEventListener('click', async (e) => {
    const btnEditNick = e.target.closest('.btn-chat-edit-nick');
    if (btnEditNick) {
      promptChangeNick();
      return;
    }

    const btnPrivate = e.target.closest('.btn-chat-action-private');
    if (btnPrivate) {
      const targetAuthorId = btnPrivate.dataset.authorId;
      openConversationThread(`user:${targetAuthorId}`);
      return;
    }

    const btnFilter = e.target.closest('.btn-chat-action-filter');
    if (btnFilter) {
      const targetName = btnFilter.dataset.authorName;
      if (el.inputSearch) {
        el.inputSearch.value = targetName;
        state.searchQuery = targetName;
        renderBoard();
        showToast(`Filtrando publicaciones de "${targetName}"`);
      }
      return;
    }

    const btnMention = e.target.closest('.btn-chat-action-mention');
    if (btnMention) {
      const targetName = btnMention.dataset.authorName;
      if (state.chatCurrentView === 'list') {
        openConversationThread('all');
      }
      switchChatTab('messages');
      if (el.chatInputText) {
        el.chatInputText.value = `@${targetName} ${el.chatInputText.value}`;
        el.chatInputText.focus();
      }
      return;
    }

    const btnMute = e.target.closest('.btn-chat-action-mute');
    if (btnMute && state.isTeacher) {
      const sId = btnMute.dataset.authorId;
      const sName = btnMute.dataset.authorName;
      socket.emit('teacher:student:toggle-disable', { teacherToken: state.teacherToken, sessionId: state.activeSessionId, authorId: sId, authorName: sName }, (res) => {
        if (!res?.ok) showToast(res?.error || 'No se pudo cambiar estado', 'error');
        else {
          showToast(res.disabled ? `🚫 ${sName} deshabilitado` : `✅ ${sName} habilitado`, 'info');
          socket.emit('chat:get-users', { sessionId: state.activeSessionId }, (r) => { if (r?.ok) renderChatUsers(r.users); });
        }
      });
      return;
    }

    const btnKick = e.target.closest('.btn-chat-action-kick');
    if (btnKick && state.isTeacher) {
      const sId = btnKick.dataset.authorId;
      const sName = btnKick.dataset.authorName;
      const ok = await Swal.confirm('¿Expulsar participante?', `¿Expulsar a "${sName}" de la clase actual?`, { icon: 'warning', confirmButtonText: 'Sí, expulsar', confirmButtonColor: '#ef4444' });
      if (!ok) return;
      socket.emit('teacher:student:kick', { teacherToken: state.teacherToken, sessionId: state.activeSessionId, authorId: sId, authorName: sName, reason: 'Expulsado por el profesor' }, (res) => {
        if (!res?.ok) showToast(res?.error || 'No se pudo expulsar', 'error');
        else {
          showToast(`👞 ${sName} ha sido expulsado`, 'info');
          socket.emit('chat:get-users', { sessionId: state.activeSessionId }, (r) => { if (r?.ok) renderChatUsers(r.users); });
        }
      });
      return;
    }
  });

  // Socket chat listeners
  socket.on('chat:users', (data) => {
    const list = Array.isArray(data) ? data : (data?.users || []);
    const sid = data?.sessionId;
    if (!sid || sid === state.activeSessionId) {
      renderChatUsers(list);
      if (state.chatCurrentView === 'list') {
        renderConversationsList();
      }
    }
  });

  socket.on('chat:message', (msg) => {
    appendChatMessage(msg);
  });

  socket.on('chat:message:deleted', ({ sessionId, messageId }) => {
    if (!sessionId || sessionId === state.activeSessionId) {
      state.chatMessages = (state.chatMessages || []).filter((m) => m.id !== messageId);
      calculateUnreads();
      if (state.chatCurrentView === 'thread') {
        renderChatMessages(state.chatMessages);
      } else {
        renderConversationsList();
      }
    }
  });

  socket.on('chat:cleared', ({ sessionId }) => {
    if (sessionId === state.activeSessionId) {
      state.chatMessages = [];
      calculateUnreads();
      if (state.chatCurrentView === 'thread') {
        renderChatMessages([]);
      } else {
        renderConversationsList();
      }
      showToast('Chat de la sesión limpiado');
    }
  });

  // Clean bridge for modular extensions (quiz.js)
  window.PadletApp = {
    socket,
    state,
    getAuthorId: () => authorId,
    getAuthorName: () => authorName,
    setAuthorName,
    serverNow,
    escapeHtml,
    formatRelativeTime,
    openModal,
    closeModal,
    showToast,
    playChime,
    copyTextToClipboard,
    closeTeacherPanel: () => closeModal(el.teacherPanelModal),
  };
})();
