/**
 * PadletLocal Timed Multiple-Choice Quizzes & Comprehension Analytics Module
 */
(() => {
  const app = window.PadletApp;
  if (!app) return;

  const { socket, state, escapeHtml, openModal, closeModal, showToast, playChime, copyTextToClipboard } = app;
  const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

  const qState = {
    quizzes: [],
    allSessionsQuizzes: [],
    activeQuiz: null,
    lastOpenedQuizRunId: null,
    selectedAnswers: {}, // `${runId}:${questionId}` -> optionIndex
    builderQuestions: [],
    copySourceQuizId: null,
    lastAnalytics: null,
  };

  const qEl = {
    liveQuizBanner: document.getElementById('liveQuizBanner'),
    liveQuizBannerTitle: document.getElementById('liveQuizBannerTitle'),
    liveQuizBannerMeta: document.getElementById('liveQuizBannerMeta'),
    liveQuizBannerCountdown: document.getElementById('liveQuizBannerCountdown'),
    btnOpenLiveQuiz: document.getElementById('btnOpenLiveQuiz'),

    quizLibraryView: document.getElementById('quizLibraryView'),
    btnToggleImportQuiz: document.getElementById('btnToggleImportQuiz'),
    btnNewQuiz: document.getElementById('btnNewQuiz'),
    quizImportBox: document.getElementById('quizImportBox'),
    btnCloseImportQuiz: document.getElementById('btnCloseImportQuiz'),
    quizImportSelect: document.getElementById('quizImportSelect'),
    btnConfirmImportQuiz: document.getElementById('btnConfirmImportQuiz'),
    quizCopyBox: document.getElementById('quizCopyBox'),
    quizCopyBoxTitle: document.getElementById('quizCopyBoxTitle'),
    btnCloseCopyQuiz: document.getElementById('btnCloseCopyQuiz'),
    quizCopyTargetSelect: document.getElementById('quizCopyTargetSelect'),
    btnConfirmCopyQuiz: document.getElementById('btnConfirmCopyQuiz'),
    teacherQuizList: document.getElementById('teacherQuizList'),

    quizBuilderView: document.getElementById('quizBuilderView'),
    editQuizId: document.getElementById('editQuizId'),
    btnQuizBackToList: document.getElementById('btnQuizBackToList'),
    quizBuilderHeading: document.getElementById('quizBuilderHeading'),
    quizTitleInput: document.getElementById('quizTitleInput'),
    quizDescInput: document.getElementById('quizDescInput'),
    quizQuestionsEditor: document.getElementById('quizQuestionsEditor'),
    quizBuilderError: document.getElementById('quizBuilderError'),
    btnAddQuizQuestion: document.getElementById('btnAddQuizQuestion'),
    btnSaveQuiz: document.getElementById('btnSaveQuiz'),

    liveQuizModal: document.getElementById('liveQuizModal'),
    liveQuizTitle: document.getElementById('liveQuizTitle'),
    liveQuizBody: document.getElementById('liveQuizBody'),
    liveQuizFooter: document.getElementById('liveQuizFooter'),

    quizAnalyticsModal: document.getElementById('quizAnalyticsModal'),
    quizAnalyticsTitle: document.getElementById('quizAnalyticsTitle'),
    quizAnalyticsBody: document.getElementById('quizAnalyticsBody'),
    btnCopyQuizAnalytics: document.getElementById('btnCopyQuizAnalytics'),
  };

  function getLevelClass(percent, hasResponses = true) {
    if (!hasResponses) return 'level-none';
    if (percent >= 80) return 'level-excellent';
    if (percent >= 60) return 'level-good';
    if (percent >= 40) return 'level-medium';
    return 'level-low';
  }

  // --- Teacher Quiz Library ---
  function loadTeacherQuizzes() {
    if (!state.isTeacher) return;
    socket.emit('teacher:quiz:list', { teacherToken: state.teacherToken }, (ack) => {
      if (!ack?.ok) return;
      qState.quizzes = Array.isArray(ack.quizzes) ? ack.quizzes : [];
      qState.allSessionsQuizzes = Array.isArray(ack.allSessionsQuizzes) ? ack.allSessionsQuizzes : [];
      renderQuizLibrary();
    });
  }

  function renderQuizLibrary() {
    const list = qState.quizzes || [];
    const otherSessionQuizzes = (qState.allSessionsQuizzes || []).filter((item) => !item.isCurrentSession);
    qEl.btnToggleImportQuiz.classList.toggle('hidden', otherSessionQuizzes.length === 0);

    if (list.length === 0) {
      qEl.teacherQuizList.innerHTML =
        '<div class="queue-empty">No hay tests creados en esta sesión. Haz clic en <strong>+ Crear nuevo test</strong> para preparar preguntas y respuestas antes de publicarlas.</div>';
      return;
    }

    qEl.teacherQuizList.innerHTML = list
      .map((quiz) => {
        const totalSec = (quiz.questions || []).reduce((acc, q) => acc + (Number(q.timeLimitSec) || 30), 0);
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        const durationText = mins > 0 ? `${mins}m ${secs > 0 ? secs + 's' : ''}` : `${secs}s`;
        const isLive = qState.activeQuiz?.quizId === quiz.id;
        const summary = quiz.latestRunSummary;
        const pctBadge = summary
          ? `<span class="quiz-pct-pill ${getLevelClass(summary.overallPercent, summary.totalParticipants > 0)}">${summary.overallPercent}% entendimiento (${summary.totalParticipants} resp.)</span>`
          : `<span class="quiz-draft-pill">Borrador listo</span>`;

        return `
          <div class="quiz-lib-item ${isLive ? 'is-live-quiz' : ''}" data-quiz-id="${escapeHtml(quiz.id)}">
            <div class="quiz-lib-info">
              <div class="quiz-lib-title-row">
                <strong>${escapeHtml(quiz.title)}</strong>
                ${isLive ? '<span class="session-active-tag" style="background:#4f46e5;">En vivo</span>' : ''}
                ${pctBadge}
              </div>
              <div class="session-item-meta">
                ${quiz.questions.length} ${quiz.questions.length === 1 ? 'pregunta' : 'preguntas'} · ~${durationText} total
                ${quiz.description ? ` · ${escapeHtml(quiz.description)}` : ''}
              </div>
            </div>
            <div class="session-item-actions">
              ${
                isLive
                  ? `<button type="button" class="btn btn-sm btn-primary" data-quiz-action="open-live">▶ Controlar</button>`
                  : `<button type="button" class="btn btn-sm btn-primary" data-quiz-action="start">▶ Publicar</button>`
              }
              ${
                quiz.runCount > 0
                  ? `<button type="button" class="btn btn-sm btn-secondary" data-quiz-action="analytics">📊 Análisis</button>`
                  : ''
              }
              <button type="button" class="btn btn-sm btn-secondary" data-quiz-action="copy" title="Copiar a otra sesión">📋 Copiar</button>
              <button type="button" class="btn btn-sm btn-secondary" data-quiz-action="edit" title="Editar preguntas">✏️</button>
              <button type="button" class="btn btn-sm btn-live" data-quiz-action="delete" title="Eliminar test">🗑️</button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // --- Copy / Import Across Sessions ---
  qEl.btnToggleImportQuiz.addEventListener('click', () => {
    const others = (qState.allSessionsQuizzes || []).filter((item) => !item.isCurrentSession);
    if (others.length === 0) {
      showToast('No hay tests en otras sesiones todavía');
      return;
    }
    qEl.quizCopyBox.classList.add('hidden');
    qEl.quizImportSelect.innerHTML = others
      .map(
        (item) =>
          `<option value="${escapeHtml(item.sessionId)}::${escapeHtml(item.quizId)}">[${escapeHtml(
            item.sessionName
          )}] ${escapeHtml(item.title)} (${item.questionCount} preg.)</option>`
      )
      .join('');
    qEl.quizImportBox.classList.toggle('hidden');
  });

  qEl.btnCloseImportQuiz.addEventListener('click', () => qEl.quizImportBox.classList.add('hidden'));

  qEl.btnConfirmImportQuiz.addEventListener('click', () => {
    const val = qEl.quizImportSelect.value;
    if (!val || !val.includes('::')) return;
    const [sourceSessionId, quizId] = val.split('::');
    socket.emit(
      'teacher:quiz:copy',
      {
        teacherToken: state.teacherToken,
        sourceSessionId,
        quizId,
        targetSessionId: state.activeSessionId,
      },
      (ack) => {
        if (!ack?.ok) {
          showToast(ack?.error || 'No se pudo importar el test', 'error');
          return;
        }
        qState.quizzes = ack.quizzes || qState.quizzes;
        qState.allSessionsQuizzes = ack.allSessionsQuizzes || qState.allSessionsQuizzes;
        qEl.quizImportBox.classList.add('hidden');
        renderQuizLibrary();
        showToast(`📥 Test "${ack.quiz?.title || ''}" copiado a esta sesión`, 'success');
      }
    );
  });

  function openCopyToSessionBox(quiz) {
    qState.copySourceQuizId = quiz.id;
    qEl.quizImportBox.classList.add('hidden');
    qEl.quizCopyBoxTitle.textContent = `📋 Copiar "${quiz.title}" hacia otra sesión`;

    const sessions = state.sessions || [];
    qEl.quizCopyTargetSelect.innerHTML = sessions
      .map(
        (s) =>
          `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}${
            s.id === state.activeSessionId ? ' (esta sesión — duplicar)' : ''
          }</option>`
      )
      .join('');
    // Pre-select another session if available
    const other = sessions.find((s) => s.id !== state.activeSessionId);
    if (other) qEl.quizCopyTargetSelect.value = other.id;

    qEl.quizCopyBox.classList.remove('hidden');
  }

  qEl.btnCloseCopyQuiz.addEventListener('click', () => {
    qState.copySourceQuizId = null;
    qEl.quizCopyBox.classList.add('hidden');
  });

  qEl.btnConfirmCopyQuiz.addEventListener('click', () => {
    const targetSessionId = qEl.quizCopyTargetSelect.value;
    if (!qState.copySourceQuizId || !targetSessionId) return;
    socket.emit(
      'teacher:quiz:copy',
      {
        teacherToken: state.teacherToken,
        sourceSessionId: state.activeSessionId,
        quizId: qState.copySourceQuizId,
        targetSessionId,
      },
      (ack) => {
        if (!ack?.ok) {
          showToast(ack?.error || 'No se pudo copiar el test', 'error');
          return;
        }
        qState.quizzes = ack.quizzes || qState.quizzes;
        qState.allSessionsQuizzes = ack.allSessionsQuizzes || qState.allSessionsQuizzes;
        qEl.quizCopyBox.classList.add('hidden');
        renderQuizLibrary();
        showToast(`📋 Test copiado a "${ack.targetSessionName}"`, 'success');
      }
    );
  });

  // --- Quiz Library Click Delegation ---
  qEl.teacherQuizList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-quiz-action]');
    if (!btn) return;
    const itemEl = btn.closest('.quiz-lib-item');
    if (!itemEl) return;
    const quizId = itemEl.dataset.quizId;
    const quiz = qState.quizzes.find((q) => q.id === quizId);
    if (!quiz) return;
    const action = btn.dataset.quizAction;

    if (action === 'edit') {
      openQuizBuilder(quiz);
    } else if (action === 'copy') {
      openCopyToSessionBox(quiz);
    } else if (action === 'delete') {
      if (!window.confirm(`¿Eliminar el test "${quiz.title}" y su historial de resultados?`)) return;
      socket.emit('teacher:quiz:delete', { teacherToken: state.teacherToken, id: quizId }, (ack) => {
        if (!ack?.ok) {
          showToast(ack?.error || 'No se pudo eliminar', 'error');
          return;
        }
        qState.quizzes = ack.quizzes || [];
        qState.allSessionsQuizzes = ack.allSessionsQuizzes || [];
        renderQuizLibrary();
        showToast('Test eliminado');
      });
    } else if (action === 'start') {
      if (qState.activeQuiz && !window.confirm('Ya hay otro test en vivo. ¿Reemplazarlo con este test?')) return;
      socket.emit(
        'teacher:quiz:start',
        {
          teacherToken: state.teacherToken,
          quizId,
          notifyAll: true,
          author: app.getAuthorName() || 'Profesor',
        },
        (ack) => {
          if (!ack?.ok) {
            showToast(ack?.error || 'No se pudo iniciar el test', 'error');
            return;
          }
          app.closeTeacherPanel();
          openModal(qEl.liveQuizModal);
          showToast(`🧠 Test "${quiz.title}" publicado en vivo`, 'success');
        }
      );
    } else if (action === 'open-live') {
      app.closeTeacherPanel();
      renderLiveQuizModal();
      openModal(qEl.liveQuizModal);
    } else if (action === 'analytics') {
      openAnalyticsForQuiz(quizId);
    }
  });

  // --- Quiz Builder (Create / Edit Drafts) ---
  function createEmptyQuestion() {
    return {
      id: '',
      text: '',
      options: ['', '', '', ''],
      correctIndex: 0,
      timeLimitSec: 30,
    };
  }

  function showLibraryView() {
    qEl.quizBuilderView.classList.add('hidden');
    qEl.quizLibraryView.classList.remove('hidden');
    renderQuizLibrary();
  }

  function openQuizBuilder(quiz = null) {
    qEl.quizBuilderError.classList.add('hidden');
    qEl.quizImportBox.classList.add('hidden');
    qEl.quizCopyBox.classList.add('hidden');

    if (quiz) {
      qEl.editQuizId.value = quiz.id;
      qEl.quizBuilderHeading.textContent = 'Editar test (borrador)';
      qEl.quizTitleInput.value = quiz.title || '';
      qEl.quizDescInput.value = quiz.description || '';
      qState.builderQuestions = (quiz.questions || []).map((q) => ({
        id: q.id || '',
        text: q.text || '',
        options: [...(q.options || ['', ''])],
        correctIndex: Number(q.correctIndex) || 0,
        timeLimitSec: Number(q.timeLimitSec) || 30,
      }));
    } else {
      qEl.editQuizId.value = '';
      qEl.quizBuilderHeading.textContent = 'Nuevo test (borrador)';
      qEl.quizTitleInput.value = '';
      qEl.quizDescInput.value = '';
      qState.builderQuestions = [createEmptyQuestion()];
    }

    renderBuilderQuestions();
    qEl.quizLibraryView.classList.add('hidden');
    qEl.quizBuilderView.classList.remove('hidden');
    qEl.quizTitleInput.focus();
  }

  function syncBuilderQuestionsFromDOM() {
    const cards = qEl.quizQuestionsEditor.querySelectorAll('.quiz-q-card');
    cards.forEach((card, qIdx) => {
      const target = qState.builderQuestions[qIdx];
      if (!target) return;
      const textInput = card.querySelector('.quiz-q-text');
      const timeInput = card.querySelector('.quiz-q-time');
      if (textInput) target.text = textInput.value;
      if (timeInput) target.timeLimitSec = Number(timeInput.value) || 30;

      const optInputs = card.querySelectorAll('.quiz-opt-input');
      target.options = Array.from(optInputs).map((inp) => inp.value);

      const checkedRadio = card.querySelector('.quiz-opt-radio:checked');
      if (checkedRadio) target.correctIndex = Number(checkedRadio.value) || 0;
    });
  }

  function renderBuilderQuestions() {
    qEl.quizQuestionsEditor.innerHTML = qState.builderQuestions
      .map((q, qIdx) => {
        const optsHtml = q.options
          .map(
            (opt, oIdx) => `
            <div class="quiz-opt-row">
              <label class="quiz-opt-correct" title="Marcar como respuesta correcta">
                <input type="radio" class="quiz-opt-radio" name="correct_q_${qIdx}" value="${oIdx}" ${
              q.correctIndex === oIdx ? 'checked' : ''
            } />
                <span class="quiz-letter">${OPTION_LETTERS[oIdx] || oIdx + 1}</span>
              </label>
              <input type="text" class="quiz-opt-input" maxlength="200" placeholder="Opción ${
                OPTION_LETTERS[oIdx] || oIdx + 1
              }..." value="${escapeHtml(opt)}" />
              ${
                q.options.length > 2
                  ? `<button type="button" class="icon-btn-subtle" data-builder-action="remove-opt" data-q-idx="${qIdx}" data-o-idx="${oIdx}" title="Quitar opción">✕</button>`
                  : ''
              }
            </div>
          `
          )
          .join('');

        return `
          <div class="quiz-q-card" data-q-idx="${qIdx}">
            <div class="quiz-q-header">
              <strong>Pregunta #${qIdx + 1}</strong>
              <div class="quiz-q-header-controls">
                <label class="quiz-time-label">
                  ⏱ Tiempo (seg):
                  <input type="number" class="quiz-q-time" min="5" max="300" value="${q.timeLimitSec || 30}" />
                </label>
                ${
                  qIdx > 0
                    ? `<button type="button" class="icon-btn-subtle" data-builder-action="move-up" data-q-idx="${qIdx}" title="Subir">↑</button>`
                    : ''
                }
                ${
                  qIdx < qState.builderQuestions.length - 1
                    ? `<button type="button" class="icon-btn-subtle" data-builder-action="move-down" data-q-idx="${qIdx}" title="Bajar">↓</button>`
                    : ''
                }
                ${
                  qState.builderQuestions.length > 1
                    ? `<button type="button" class="icon-btn-subtle" data-builder-action="remove-q" data-q-idx="${qIdx}" title="Eliminar pregunta">🗑️</button>`
                    : ''
                }
              </div>
            </div>
            <input type="text" class="quiz-q-text" maxlength="400" placeholder="Escribe la pregunta..." value="${escapeHtml(
              q.text
            )}" />
            <div class="quiz-opts-list">${optsHtml}</div>
            <div class="quiz-q-footer">
              <small class="muted-note">Marca el círculo de la respuesta correcta.</small>
              ${
                q.options.length < 6
                  ? `<button type="button" class="btn btn-sm btn-ghost" data-builder-action="add-opt" data-q-idx="${qIdx}">+ Opción</button>`
                  : ''
              }
            </div>
          </div>
        `;
      })
      .join('');
  }

  qEl.btnNewQuiz.addEventListener('click', () => openQuizBuilder(null));
  qEl.btnQuizBackToList.addEventListener('click', showLibraryView);

  qEl.btnAddQuizQuestion.addEventListener('click', () => {
    syncBuilderQuestionsFromDOM();
    qState.builderQuestions.push(createEmptyQuestion());
    renderBuilderQuestions();
    const lastInput = qEl.quizQuestionsEditor.querySelector('.quiz-q-card:last-child .quiz-q-text');
    if (lastInput) lastInput.focus();
  });

  qEl.quizQuestionsEditor.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-builder-action]');
    if (!btn) return;
    syncBuilderQuestionsFromDOM();
    const action = btn.dataset.builderAction;
    const qIdx = Number(btn.dataset.qIdx);
    const oIdx = Number(btn.dataset.oIdx);

    if (action === 'add-opt') {
      if (qState.builderQuestions[qIdx].options.length < 6) {
        qState.builderQuestions[qIdx].options.push('');
        renderBuilderQuestions();
      }
    } else if (action === 'remove-opt') {
      const q = qState.builderQuestions[qIdx];
      if (q.options.length > 2) {
        q.options.splice(oIdx, 1);
        if (q.correctIndex >= q.options.length) q.correctIndex = 0;
        else if (q.correctIndex === oIdx) q.correctIndex = 0;
        else if (q.correctIndex > oIdx) q.correctIndex--;
        renderBuilderQuestions();
      }
    } else if (action === 'remove-q') {
      if (qState.builderQuestions.length > 1) {
        qState.builderQuestions.splice(qIdx, 1);
        renderBuilderQuestions();
      }
    } else if (action === 'move-up' && qIdx > 0) {
      const tmp = qState.builderQuestions[qIdx - 1];
      qState.builderQuestions[qIdx - 1] = qState.builderQuestions[qIdx];
      qState.builderQuestions[qIdx] = tmp;
      renderBuilderQuestions();
    } else if (action === 'move-down' && qIdx < qState.builderQuestions.length - 1) {
      const tmp = qState.builderQuestions[qIdx + 1];
      qState.builderQuestions[qIdx + 1] = qState.builderQuestions[qIdx];
      qState.builderQuestions[qIdx] = tmp;
      renderBuilderQuestions();
    }
  });

  qEl.quizBuilderView.addEventListener('submit', (e) => {
    e.preventDefault();
    syncBuilderQuestionsFromDOM();
    qEl.quizBuilderError.classList.add('hidden');

    const title = qEl.quizTitleInput.value.trim();
    const description = qEl.quizDescInput.value.trim();
    const id = qEl.editQuizId.value || null;

    if (!title) {
      qEl.quizBuilderError.textContent = 'Escribe un título para el test.';
      qEl.quizBuilderError.classList.remove('hidden');
      qEl.quizTitleInput.focus();
      return;
    }

    // Validate options cleanly before sending (preserving correct index even if trailing empty options removed)
    const preparedQuestions = [];
    for (let i = 0; i < qState.builderQuestions.length; i++) {
      const q = qState.builderQuestions[i];
      if (!q.text.trim()) {
        qEl.quizBuilderError.textContent = `Escribe el texto de la pregunta #${i + 1}.`;
        qEl.quizBuilderError.classList.remove('hidden');
        return;
      }
      const nonEmptyOpts = [];
      let mappedCorrect = -1;
      q.options.forEach((opt, idx) => {
        const clean = opt.trim();
        if (clean) {
          if (idx === q.correctIndex) mappedCorrect = nonEmptyOpts.length;
          nonEmptyOpts.push(clean);
        }
      });
      if (nonEmptyOpts.length < 2) {
        qEl.quizBuilderError.textContent = `La pregunta #${i + 1} necesita al menos 2 opciones con texto.`;
        qEl.quizBuilderError.classList.remove('hidden');
        return;
      }
      if (mappedCorrect === -1) {
        qEl.quizBuilderError.textContent = `La opción marcada como correcta en la pregunta #${i + 1} está vacía.`;
        qEl.quizBuilderError.classList.remove('hidden');
        return;
      }
      preparedQuestions.push({
        id: q.id || undefined,
        text: q.text.trim(),
        options: nonEmptyOpts,
        correctIndex: mappedCorrect,
        timeLimitSec: Math.max(5, Math.min(300, Number(q.timeLimitSec) || 30)),
      });
    }

    qEl.btnSaveQuiz.disabled = true;
    socket.emit(
      'teacher:quiz:save',
      {
        teacherToken: state.teacherToken,
        id,
        title,
        description,
        questions: preparedQuestions,
      },
      (ack) => {
        qEl.btnSaveQuiz.disabled = false;
        if (!ack?.ok) {
          qEl.quizBuilderError.textContent = ack?.error || 'No se pudo guardar el test.';
          qEl.quizBuilderError.classList.remove('hidden');
          return;
        }
        qState.quizzes = ack.quizzes || qState.quizzes;
        qState.allSessionsQuizzes = ack.allSessionsQuizzes || qState.allSessionsQuizzes;
        showLibraryView();
        showToast('💾 Test guardado (listo para publicar cuando quieras)', 'success');
      }
    );
  });

  // --- Comprehension Analytics Rendering (Shared by Live Summary & Analytics Modal) ---
  function buildAnalyticsHTML(analytics, { showStudents = false } = {}) {
    if (!analytics) return '<div class="muted-note">No hay datos de análisis todavía.</div>';

    const levelClass = getLevelClass(analytics.overallPercent, analytics.totalAnswers > 0);
    const weakestHtml =
      analytics.weakestQuestions && analytics.weakestQuestions.length > 0
        ? `
          <div class="quiz-weak-box">
            <strong>⚠️ Puntos recomendados para reforzar (&lt; 60% entendimiento):</strong>
            <ul>
              ${analytics.weakestQuestions
                .map(
                  (wq) =>
                    `<li><strong>P${wq.index + 1} (${wq.comprehensionPercent}%):</strong> ${escapeHtml(
                      wq.text
                    )} — <em>Correcta: ${escapeHtml(wq.options[wq.correctIndex])}</em></li>`
                )
                .join('')}
            </ul>
          </div>
        `
        : analytics.totalAnswers > 0
        ? `<div class="quiz-strong-box">✅ ¡Excelente! Todas las preguntas superaron el 60% de comprensión.</div>`
        : '';

    const questionsHtml = (analytics.questions || [])
      .map((q) => {
        const qClass = getLevelClass(q.comprehensionPercent, q.totalResponses > 0);
        const optBars = q.options
          .map((opt, idx) => {
            const isCorrect = idx === q.correctIndex;
            const pct = q.optionPercents[idx] || 0;
            const cnt = q.optionCounts[idx] || 0;
            return `
              <div class="quiz-stat-opt ${isCorrect ? 'is-correct' : ''}">
                <div class="quiz-stat-opt-top">
                  <span><strong>${OPTION_LETTERS[idx] || idx + 1}.</strong> ${escapeHtml(opt)} ${
              isCorrect ? '✓' : ''
            }</span>
                  <span><strong>${pct}%</strong> (${cnt})</span>
                </div>
                <div class="quiz-bar-track"><div class="quiz-bar-fill" style="width:${pct}%"></div></div>
              </div>
            `;
          })
          .join('');

        return `
          <div class="quiz-analytics-q ${q.needsReview ? 'needs-review' : ''}">
            <div class="quiz-analytics-q-head">
              <div>
                <strong>P${q.index + 1}. ${escapeHtml(q.text)}</strong>
                <div class="muted-note" style="font-size:0.76rem;">${q.correctCount} de ${q.totalResponses} acertaron · tiempo: ${q.timeLimitSec}s</div>
              </div>
              <span class="quiz-pct-pill ${qClass}">${q.comprehensionPercent}% entendimiento</span>
            </div>
            <div class="quiz-stat-opts-grid">${optBars}</div>
          </div>
        `;
      })
      .join('');

    const studentsHtml =
      showStudents && analytics.students && analytics.students.length > 0
        ? `
          <div class="quiz-students-box">
            <h4>Desempeño por participante (${analytics.students.length})</h4>
            <div class="quiz-students-list">
              ${analytics.students
                .map(
                  (st) => `
                  <div class="quiz-student-row">
                    <span><strong>${escapeHtml(st.author)}</strong></span>
                    <span class="quiz-pct-pill ${getLevelClass(st.percent, st.answeredCount > 0)}">${
                    st.correctCount
                  }/${st.totalQuestions} (${st.percent}%)</span>
                  </div>
                `
                )
                .join('')}
            </div>
          </div>
        `
        : '';

    return `
      <div class="quiz-summary-hero ${levelClass}">
        <div class="quiz-gauge-num">${analytics.overallPercent}%</div>
        <div class="quiz-gauge-meta">
          <strong>Porcentaje de entendimiento grupal</strong>
          <span>${escapeHtml(analytics.levelLabel)}</span>
          <small>${analytics.totalParticipants} participantes · ${analytics.totalCorrect} aciertos de ${analytics.totalAnswers} respuestas</small>
        </div>
      </div>
      ${weakestHtml}
      <div class="quiz-analytics-questions">${questionsHtml}</div>
      ${studentsHtml}
    `;
  }

  function formatAnalyticsPlainText(analytics) {
    if (!analytics) return '';
    const lines = [
      `ANÁLISIS DE ENTENDIMIENTO — ${analytics.title}`,
      `Comprensión global: ${analytics.overallPercent}% (${analytics.levelLabel})`,
      `Participantes: ${analytics.totalParticipants} | Aciertos: ${analytics.totalCorrect}/${analytics.totalAnswers}`,
      '',
      'POR PREGUNTA:',
      ...analytics.questions.map(
        (q) =>
          `- P${q.index + 1}: ${q.comprehensionPercent}% (${q.correctCount}/${q.totalResponses}) — ${q.text} [Correcta: ${q.options[q.correctIndex]}]`
      ),
    ];
    if (analytics.students?.length) {
      lines.push('', 'POR PARTICIPANTE:');
      analytics.students.forEach((st) => {
        lines.push(`- ${st.author}: ${st.correctCount}/${st.totalQuestions} (${st.percent}%)`);
      });
    }
    return lines.join('\n');
  }

  function openAnalyticsForQuiz(quizId) {
    socket.emit('teacher:quiz:analytics', { teacherToken: state.teacherToken, quizId }, (ack) => {
      if (!ack?.ok || !ack.analytics) {
        showToast(ack?.error || 'No se pudo cargar el análisis', 'error');
        return;
      }
      qState.lastAnalytics = ack.analytics;
      qEl.quizAnalyticsTitle.textContent = `📊 Análisis: ${ack.analytics.title}`;
      qEl.quizAnalyticsBody.innerHTML = buildAnalyticsHTML(ack.analytics, { showStudents: true });
      openModal(qEl.quizAnalyticsModal);
    });
  }

  qEl.btnCopyQuizAnalytics.addEventListener('click', async () => {
    if (!qState.lastAnalytics) return;
    try {
      await copyTextToClipboard(formatAnalyticsPlainText(qState.lastAnalytics));
      showToast('Resumen de entendimiento copiado al portapapeles', 'success');
    } catch {
      showToast('No se pudo copiar el resumen', 'error');
    }
  });

  // --- Live Quiz Banner & Modal (Students + Teacher) ---
  function getRemainingQuestionSeconds(aq) {
    if (!aq || aq.status !== 'question' || !aq.questionEndsAt) return 0;
    return Math.max(0, Math.ceil((aq.questionEndsAt - app.serverNow()) / 1000));
  }

  function renderLiveQuizBanner() {
    const aq = qState.activeQuiz;
    if (!aq) {
      qEl.liveQuizBanner.classList.add('hidden');
      closeModal(qEl.liveQuizModal);
      return;
    }

    qEl.liveQuizBanner.classList.remove('hidden');
    qEl.liveQuizBannerTitle.textContent = aq.title;

    if (aq.status === 'question') {
      const rem = getRemainingQuestionSeconds(aq);
      qEl.liveQuizBannerMeta.textContent = `Pregunta ${aq.currentQuestionIndex + 1} de ${aq.totalQuestions} · ${aq.responseCount} resp.`;
      qEl.liveQuizBannerCountdown.textContent = `⏱ ${rem}s`;
    } else if (aq.status === 'reveal') {
      const pct = aq.reveal?.comprehensionPercent ?? 0;
      qEl.liveQuizBannerMeta.textContent = `Resultado Pregunta ${aq.currentQuestionIndex + 1}/${aq.totalQuestions} · ${pct}% entendimiento`;
      qEl.liveQuizBannerCountdown.textContent = '✓ Revelada';
    } else {
      const pct = aq.analytics?.overallPercent ?? 0;
      qEl.liveQuizBannerMeta.textContent = `Análisis final · ${pct}% entendimiento grupal`;
      qEl.liveQuizBannerCountdown.textContent = '📊 Finalizado';
    }

    qEl.btnOpenLiveQuiz.textContent = state.isTeacher ? 'Controlar test' : 'Responder / Ver test';
  }

  function renderLiveQuizModal() {
    const aq = qState.activeQuiz;
    if (!aq) return;

    qEl.liveQuizTitle.textContent = aq.title;
    const myId = app.getAuthorId();
    const myName = app.getAuthorName();

    if (aq.status === 'question' && aq.question) {
      const q = aq.question;
      const rem = getRemainingQuestionSeconds(aq);
      const pctTime = q.timeLimitSec > 0 ? Math.max(0, Math.min(100, (rem / q.timeLimitSec) * 100)) : 0;
      const answerKey = `${aq.runId}:${q.id}`;
      const alreadyAnswered = (aq.answeredAuthorIds || []).includes(myId);
      const myChoice = qState.selectedAnswers[answerKey];

      const nameRow =
        !state.isTeacher && !myName && !alreadyAnswered
          ? `<div class="form-group">
               <label for="quizStudentNameInput">Tu nombre para registrar tu respuesta <span class="req">*</span></label>
               <input id="quizStudentNameInput" type="text" maxlength="50" placeholder="Ej. Sofía López" />
             </div>`
          : '';

      const optionsHtml = q.options
        .map((opt, idx) => {
          const isChosen = myChoice === idx;
          const disabled = alreadyAnswered || rem <= 0 || state.isTeacher;
          return `
            <button type="button" class="quiz-answer-btn ${isChosen ? 'is-selected' : ''}" data-answer-idx="${idx}" ${
            disabled ? 'disabled' : ''
          }>
              <span class="quiz-letter">${OPTION_LETTERS[idx] || idx + 1}</span>
              <span class="quiz-answer-text">${escapeHtml(opt)}</span>
            </button>
          `;
        })
        .join('');

      qEl.liveQuizBody.innerHTML = `
        <div class="quiz-live-topbar">
          <span class="quiz-q-counter">Pregunta ${aq.currentQuestionIndex + 1} de ${aq.totalQuestions}</span>
          <span class="quiz-live-resp-count">👥 ${aq.responseCount} ${aq.responseCount === 1 ? 'respuesta' : 'respuestas'}</span>
          <span id="liveQuizModalTimer" class="quiz-timer-pill">⏱ ${rem}s</span>
        </div>
        <div class="quiz-time-track">
          <div id="liveQuizModalTimerFill" class="quiz-time-fill" style="width:${pctTime}%"></div>
        </div>
        <h3 class="quiz-question-heading">${escapeHtml(q.text)}</h3>
        ${nameRow}
        <div class="quiz-answers-grid">${optionsHtml}</div>
        ${
          alreadyAnswered
            ? `<div class="quiz-strong-box">✓ ¡Respuesta enviada! Espera a que termine el tiempo para ver el resultado.</div>`
            : state.isTeacher
            ? `<div class="info-callout"><strong>Vista del Profesor:</strong> los alumnos están respondiendo ahora mismo. Cuando el contador llegue a 0s (o cuando pulses <em>Revelar ahora</em>), se mostrará la respuesta correcta y el porcentaje de entendimiento.</div>`
            : ''
        }
      `;
    } else if (aq.status === 'reveal' && aq.question && aq.reveal) {
      const q = aq.question;
      const rev = aq.reveal;
      const myAns = rev.answersByAuthor ? rev.answersByAuthor[myId] : null;
      const feedbackBanner = !state.isTeacher
        ? myAns
          ? myAns.isCorrect
            ? `<div class="quiz-strong-box">🎉 ¡Correcto! Elegiste la opción ${OPTION_LETTERS[myAns.optionIndex]}.</div>`
            : `<div class="quiz-weak-box">❌ Incorrecto. Elegiste ${OPTION_LETTERS[myAns.optionIndex]}, pero la correcta era <strong>${OPTION_LETTERS[rev.correctIndex]}</strong>.</div>`
          : `<div class="info-callout">⏱ No se registró respuesta tuya en esta pregunta.</div>`
        : '';

      const barsHtml = q.options
        .map((opt, idx) => {
          const isCorrect = idx === rev.correctIndex;
          const isMine = myAns && myAns.optionIndex === idx;
          const pct = rev.optionPercents[idx] || 0;
          const cnt = rev.optionCounts[idx] || 0;
          return `
            <div class="quiz-stat-opt ${isCorrect ? 'is-correct' : ''} ${isMine && !isCorrect ? 'is-wrong-mine' : ''}">
              <div class="quiz-stat-opt-top">
                <span><strong>${OPTION_LETTERS[idx] || idx + 1}.</strong> ${escapeHtml(opt)} ${
            isCorrect ? '✓ Correcta' : ''
          } ${isMine ? '(Tu respuesta)' : ''}</span>
                <span><strong>${pct}%</strong> (${cnt})</span>
              </div>
              <div class="quiz-bar-track"><div class="quiz-bar-fill" style="width:${pct}%"></div></div>
            </div>
          `;
        })
        .join('');

      qEl.liveQuizBody.innerHTML = `
        <div class="quiz-live-topbar">
          <span class="quiz-q-counter">Resultado · Pregunta ${aq.currentQuestionIndex + 1} de ${aq.totalQuestions}</span>
          <span class="quiz-pct-pill ${getLevelClass(rev.comprehensionPercent, rev.totalResponses > 0)}">${rev.comprehensionPercent}% entendimiento (${rev.correctCount}/${rev.totalResponses})</span>
        </div>
        <h3 class="quiz-question-heading">${escapeHtml(q.text)}</h3>
        ${feedbackBanner}
        <div class="quiz-stat-opts-grid">${barsHtml}</div>
      `;
    } else if (aq.status === 'summary' && aq.analytics) {
      qState.lastAnalytics = aq.analytics;
      const myStudent = (aq.analytics.students || []).find((st) => st.authorId === myId);
      const myScoreBanner =
        !state.isTeacher && myStudent
          ? `<div class="quiz-strong-box">🎯 Tu resultado: <strong>${myStudent.correctCount} de ${myStudent.totalQuestions} correctas (${myStudent.percent}%)</strong></div>`
          : '';
      qEl.liveQuizBody.innerHTML =
        myScoreBanner + buildAnalyticsHTML(aq.analytics, { showStudents: state.isTeacher });
    }

    // Teacher live controls footer
    if (state.isTeacher) {
      qEl.liveQuizFooter.classList.remove('hidden');
      const isLastQuestion = aq.currentQuestionIndex >= aq.totalQuestions - 1;
      if (aq.status === 'question') {
        qEl.liveQuizFooter.innerHTML = `
          <button type="button" class="btn btn-sm btn-live" data-live-quiz-action="close">⏹ Cancelar test</button>
          <button type="button" class="btn btn-sm btn-primary" data-live-quiz-action="reveal">👁 Revelar respuesta ahora</button>
        `;
      } else if (aq.status === 'reveal') {
        qEl.liveQuizFooter.innerHTML = `
          <button type="button" class="btn btn-sm btn-live" data-live-quiz-action="close">⏹ Cerrar test</button>
          <button type="button" class="btn btn-sm btn-primary" data-live-quiz-action="next">${
            isLastQuestion ? '📊 Ver análisis final' : '➡ Siguiente pregunta'
          }</button>
        `;
      } else {
        qEl.liveQuizFooter.innerHTML = `
          <button type="button" class="btn btn-sm btn-secondary" data-live-quiz-action="copy-summary">📋 Copiar resumen</button>
          <button type="button" class="btn btn-sm btn-primary" data-live-quiz-action="close">✓ Finalizar y cerrar test</button>
        `;
      }
    } else {
      qEl.liveQuizFooter.classList.add('hidden');
      qEl.liveQuizFooter.innerHTML = '';
    }
  }

  // Student answer click
  qEl.liveQuizBody.addEventListener('click', (e) => {
    const btn = e.target.closest('.quiz-answer-btn');
    if (!btn || btn.disabled) return;
    const aq = qState.activeQuiz;
    if (!aq || aq.status !== 'question' || !aq.question) return;

    let name = app.getAuthorName();
    if (!name) {
      const nameInput = document.getElementById('quizStudentNameInput');
      const typed = nameInput ? nameInput.value.trim() : '';
      if (!typed) {
        showToast('Escribe tu nombre arriba antes de responder', 'error');
        if (nameInput) nameInput.focus();
        return;
      }
      app.setAuthorName(typed);
      name = typed;
    }

    const optionIndex = Number(btn.dataset.answerIdx);
    const questionId = aq.question.id;
    qState.selectedAnswers[`${aq.runId}:${questionId}`] = optionIndex;

    // Disable all buttons immediately
    qEl.liveQuizBody.querySelectorAll('.quiz-answer-btn').forEach((b) => {
      b.disabled = true;
    });
    btn.classList.add('is-selected');

    socket.emit(
      'quiz:answer',
      {
        authorId: app.getAuthorId(),
        author: name,
        questionId,
        optionIndex,
      },
      (ack) => {
        if (!ack?.ok) {
          showToast(ack?.error || 'No se pudo enviar tu respuesta', 'error');
        } else {
          showToast('✓ Respuesta registrada', 'success');
        }
      }
    );
  });

  // Teacher live quiz control clicks
  qEl.liveQuizFooter.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-live-quiz-action]');
    if (!btn) return;
    const action = btn.dataset.liveQuizAction;

    if (action === 'reveal') {
      socket.emit('teacher:quiz:reveal', { teacherToken: state.teacherToken });
    } else if (action === 'next') {
      socket.emit('teacher:quiz:next', { teacherToken: state.teacherToken });
    } else if (action === 'close') {
      socket.emit('teacher:quiz:close', { teacherToken: state.teacherToken }, (ack) => {
        if (ack?.ok) {
          if (Array.isArray(ack.quizzes)) qState.quizzes = ack.quizzes;
          closeModal(qEl.liveQuizModal);
          renderQuizLibrary();
          showToast('Test cerrado (resultados guardados en Análisis)');
        }
      });
    } else if (action === 'copy-summary' && qState.lastAnalytics) {
      try {
        await copyTextToClipboard(formatAnalyticsPlainText(qState.lastAnalytics));
        showToast('Resumen copiado al portapapeles', 'success');
      } catch {
        showToast('No se pudo copiar', 'error');
      }
    }
  });

  qEl.btnOpenLiveQuiz.addEventListener('click', () => {
    if (!qState.activeQuiz) return;
    renderLiveQuizModal();
    openModal(qEl.liveQuizModal);
  });

  // Smooth countdown tick for active quiz question
  setInterval(() => {
    const aq = qState.activeQuiz;
    if (!aq || aq.status !== 'question') return;
    renderLiveQuizBanner();

    if (!qEl.liveQuizModal.classList.contains('hidden')) {
      const rem = getRemainingQuestionSeconds(aq);
      const timerEl = document.getElementById('liveQuizModalTimer');
      const fillEl = document.getElementById('liveQuizModalTimerFill');
      if (timerEl) timerEl.textContent = `⏱ ${rem}s`;
      if (fillEl && aq.question?.timeLimitSec) {
        const pct = Math.max(0, Math.min(100, (rem / aq.question.timeLimitSec) * 100));
        fillEl.style.width = `${pct}%`;
      }
      if (rem <= 0) {
        qEl.liveQuizBody.querySelectorAll('.quiz-answer-btn').forEach((b) => {
          b.disabled = true;
        });
      }
    }
  }, 250);

  // --- Socket.IO Real-Time Quiz Sync ---
  socket.on('quiz:updated', ({ activeQuiz, serverTime }) => {
    if (serverTime) {
      state.serverOffsetMs = serverTime - Date.now();
    }
    const prev = qState.activeQuiz;
    qState.activeQuiz = activeQuiz || null;

    renderLiveQuizBanner();
    if (state.isTeacher) renderQuizLibrary();

    if (!qState.activeQuiz) {
      closeModal(qEl.liveQuizModal);
      return;
    }

    const isNewRun = qState.lastOpenedQuizRunId !== qState.activeQuiz.runId;
    const movedQuestion =
      prev &&
      (prev.currentQuestionIndex !== qState.activeQuiz.currentQuestionIndex ||
        prev.status !== qState.activeQuiz.status);

    if (isNewRun) {
      qState.lastOpenedQuizRunId = qState.activeQuiz.runId;
      renderLiveQuizModal();
      openModal(qEl.liveQuizModal);
      playChime('task');
    } else if (!qEl.liveQuizModal.classList.contains('hidden')) {
      // Avoid resetting student's typed name when only responseCount ticks up!
      if (movedQuestion || qState.activeQuiz.status !== 'question') {
        renderLiveQuizModal();
        if (movedQuestion && qState.activeQuiz.status === 'question') playChime('info');
        if (movedQuestion && qState.activeQuiz.status === 'reveal') playChime('recess');
      } else {
        // Patch response count & answered state cleanly without losing name input focus
        const respEl = qEl.liveQuizBody.querySelector('.quiz-live-resp-count');
        if (respEl) {
          respEl.textContent = `👥 ${qState.activeQuiz.responseCount} ${
            qState.activeQuiz.responseCount === 1 ? 'respuesta' : 'respuestas'
          }`;
        }
        const alreadyAnswered = (qState.activeQuiz.answeredAuthorIds || []).includes(app.getAuthorId());
        if (alreadyAnswered && !qEl.liveQuizBody.querySelector('.quiz-strong-box')) {
          renderLiveQuizModal();
        }
      }
    }
  });

  // Expose lifecycle hooks to app.js
  window.PadletQuiz = {
    loadTeacherQuizzes,
    onTeacherChanged(isTeacher) {
      if (isTeacher) {
        loadTeacherQuizzes();
      } else {
        qState.quizzes = [];
        qState.allSessionsQuizzes = [];
      }
      renderLiveQuizBanner();
      if (!qEl.liveQuizModal.classList.contains('hidden')) {
        renderLiveQuizModal();
      }
    },
    onSessionSnapshot(data) {
      qState.activeQuiz = data.activeQuiz || null;
      qState.lastOpenedQuizRunId = qState.activeQuiz ? qState.activeQuiz.runId : null;
      renderLiveQuizBanner();
      if (state.isTeacher) {
        loadTeacherQuizzes();
      }
    },
  };
})();
