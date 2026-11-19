/**
 * PadletLocal - SweetAlert2 Offline-First Modal System (Swal)
 * 100% Autónomo, sin dependencias externas ni CDNs. Diseñado para redes locales LAN y offline.
 */
(function (global) {
  'use strict';

  let currentResolve = null;
  let backdropEl = null;

  function ensureBackdrop() {
    if (backdropEl && document.body.contains(backdropEl)) return backdropEl;

    backdropEl = document.createElement('div');
    backdropEl.id = 'swalLocalBackdrop';
    backdropEl.className = 'swal-backdrop swal-hidden';
    backdropEl.setAttribute('role', 'dialog');
    backdropEl.setAttribute('aria-modal', 'true');

    backdropEl.innerHTML = `
      <div class="swal-popup" id="swalLocalPopup" role="document">
        <div class="swal-icon-container" id="swalIconContainer"></div>
        <h3 class="swal-title" id="swalTitle"></h3>
        <div class="swal-content" id="swalContent"></div>
        <div class="swal-actions" id="swalActions">
          <button type="button" class="swal-btn swal-btn-cancel swal-hidden" id="swalBtnCancel">Cancelar</button>
          <button type="button" class="swal-btn swal-btn-confirm" id="swalBtnConfirm">Aceptar</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdropEl);

    const btnConfirm = backdropEl.querySelector('#swalBtnConfirm');
    const btnCancel = backdropEl.querySelector('#swalBtnCancel');

    btnConfirm.addEventListener('click', () => closeSwal(true));
    btnCancel.addEventListener('click', () => closeSwal(false));

    backdropEl.addEventListener('click', (e) => {
      if (e.target === backdropEl && backdropEl.dataset.allowOutsideClick !== 'false') {
        closeSwal(false);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!backdropEl || backdropEl.classList.contains('swal-hidden')) return;
      if (e.key === 'Escape' && backdropEl.dataset.allowEscapeKey !== 'false') {
        e.preventDefault();
        closeSwal(false);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        const active = document.activeElement;
        if (active && active.id === 'swalBtnCancel') {
          closeSwal(false);
        } else {
          e.preventDefault();
          closeSwal(true);
        }
      }
    });

    return backdropEl;
  }

  function getIconSvg(icon) {
    switch (icon) {
      case 'success':
        return `
          <div class="swal-icon swal-icon-success">
            <svg viewBox="0 0 52 52" class="swal-svg-icon" aria-hidden="true">
              <circle class="swal-circle" cx="26" cy="26" r="25" fill="none"/>
              <path class="swal-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
            </svg>
          </div>
        `;
      case 'error':
        return `
          <div class="swal-icon swal-icon-error">
            <svg viewBox="0 0 52 52" class="swal-svg-icon" aria-hidden="true">
              <circle class="swal-circle" cx="26" cy="26" r="25" fill="none"/>
              <line class="swal-line" x1="16" y1="16" x2="36" y2="36"/>
              <line class="swal-line" x1="36" y1="16" x2="16" y2="36"/>
            </svg>
          </div>
        `;
      case 'warning':
        return `
          <div class="swal-icon swal-icon-warning">
            <svg viewBox="0 0 52 52" class="swal-svg-icon" aria-hidden="true">
              <circle class="swal-circle" cx="26" cy="26" r="25" fill="none"/>
              <line class="swal-line" x1="26" y1="14" x2="26" y2="30"/>
              <circle cx="26" cy="38" r="3" fill="currentColor"/>
            </svg>
          </div>
        `;
      case 'question':
        return `
          <div class="swal-icon swal-icon-question">
            <svg viewBox="0 0 52 52" class="swal-svg-icon" aria-hidden="true">
              <circle class="swal-circle" cx="26" cy="26" r="25" fill="none"/>
              <path class="swal-question-mark" fill="none" d="M20 20a6 6 0 1 1 9.5 5c-2 1.5-3.5 3-3.5 5.5v1"/>
              <circle cx="26" cy="38" r="3" fill="currentColor"/>
            </svg>
          </div>
        `;
      case 'info':
      default:
        return `
          <div class="swal-icon swal-icon-info">
            <svg viewBox="0 0 52 52" class="swal-svg-icon" aria-hidden="true">
              <circle class="swal-circle" cx="26" cy="26" r="25" fill="none"/>
              <line class="swal-line" x1="26" y1="23" x2="26" y2="38"/>
              <circle cx="26" cy="15" r="3" fill="currentColor"/>
            </svg>
          </div>
        `;
    }
  }

  function closeSwal(isConfirmed = false) {
    if (!backdropEl || backdropEl.classList.contains('swal-hidden')) return;

    backdropEl.classList.remove('swal-visible');
    backdropEl.classList.add('swal-closing');

    setTimeout(() => {
      backdropEl.classList.add('swal-hidden');
      backdropEl.classList.remove('swal-closing');
      if (currentResolve) {
        const res = currentResolve;
        currentResolve = null;
        res({
          isConfirmed,
          isDenied: false,
          isDismissed: !isConfirmed,
        });
      }
    }, 180);
  }

  function fire(titleOrOptions, text = '', icon = 'info') {
    return new Promise((resolve) => {
      ensureBackdrop();

      let options = {};
      if (typeof titleOrOptions === 'object' && titleOrOptions !== null) {
        options = { ...titleOrOptions };
      } else {
        options = {
          title: String(titleOrOptions || ''),
          text: String(text || ''),
          icon: String(icon || 'info'),
        };
      }

      currentResolve = resolve;

      const titleEl = backdropEl.querySelector('#swalTitle');
      const contentEl = backdropEl.querySelector('#swalContent');
      const iconContainer = backdropEl.querySelector('#swalIconContainer');
      const btnConfirm = backdropEl.querySelector('#swalBtnConfirm');
      const btnCancel = backdropEl.querySelector('#swalBtnCancel');

      // Title
      if (options.title) {
        titleEl.textContent = options.title;
        titleEl.classList.remove('swal-hidden');
      } else {
        titleEl.textContent = '';
        titleEl.classList.add('swal-hidden');
      }

      // Content (HTML or Text)
      if (options.html) {
        contentEl.innerHTML = options.html;
        contentEl.classList.remove('swal-hidden');
      } else if (options.text) {
        contentEl.textContent = options.text;
        contentEl.classList.remove('swal-hidden');
      } else {
        contentEl.innerHTML = '';
        contentEl.classList.add('swal-hidden');
      }

      // Icon
      if (options.icon) {
        iconContainer.innerHTML = getIconSvg(options.icon);
        iconContainer.classList.remove('swal-hidden');
      } else {
        iconContainer.innerHTML = '';
        iconContainer.classList.add('swal-hidden');
      }

      // Buttons
      btnConfirm.textContent = options.confirmButtonText || 'Aceptar';
      btnConfirm.className = 'swal-btn swal-btn-confirm';
      if (options.confirmButtonClass) {
        btnConfirm.classList.add(options.confirmButtonClass);
      }
      if (options.confirmButtonColor) {
        btnConfirm.style.backgroundColor = options.confirmButtonColor;
        btnConfirm.style.borderColor = options.confirmButtonColor;
      } else {
        btnConfirm.style.backgroundColor = '';
        btnConfirm.style.borderColor = '';
      }

      if (options.showCancelButton) {
        btnCancel.textContent = options.cancelButtonText || 'Cancelar';
        btnCancel.classList.remove('swal-hidden');
        if (options.cancelButtonColor) {
          btnCancel.style.color = options.cancelButtonColor;
        } else {
          btnCancel.style.color = '';
        }
      } else {
        btnCancel.classList.add('swal-hidden');
      }

      backdropEl.dataset.allowOutsideClick = options.allowOutsideClick === false ? 'false' : 'true';
      backdropEl.dataset.allowEscapeKey = options.allowEscapeKey === false ? 'false' : 'true';

      backdropEl.classList.remove('swal-hidden', 'swal-closing');
      requestAnimationFrame(() => {
        backdropEl.classList.add('swal-visible');
        if (options.focusCancel && options.showCancelButton) {
          btnCancel.focus();
        } else {
          btnConfirm.focus();
        }
      });

      // Sound chime if available in parent
      if (typeof global.playChime === 'function') {
        if (options.icon === 'error' || options.icon === 'warning') {
          global.playChime('warning');
        } else if (options.icon === 'success') {
          global.playChime('success');
        }
      }

      // Auto close timer
      if (typeof options.timer === 'number' && options.timer > 0) {
        setTimeout(() => {
          closeSwal(false);
        }, options.timer);
      }
    });
  }

  const Swal = {
    fire,
    close: () => closeSwal(false),
    confirm: async function (title, textOrHtml = '', customOptions = {}) {
      const isHtml = /<[a-z][\s\S]*>/i.test(textOrHtml);
      const res = await fire({
        title,
        ...(isHtml ? { html: textOrHtml } : { text: textOrHtml }),
        icon: customOptions.icon || 'question',
        showCancelButton: true,
        confirmButtonText: customOptions.confirmButtonText || 'Sí, continuar',
        cancelButtonText: customOptions.cancelButtonText || 'Cancelar',
        confirmButtonColor: customOptions.confirmButtonColor || '#4f46e5',
        ...customOptions,
      });
      return Boolean(res.isConfirmed);
    },
    alert: async function (title, textOrHtml = '', icon = 'info') {
      const isHtml = /<[a-z][\s\S]*>/i.test(textOrHtml);
      return fire({
        title,
        ...(isHtml ? { html: textOrHtml } : { text: textOrHtml }),
        icon,
        showCancelButton: false,
        confirmButtonText: 'Entendido',
      });
    },
    success: (title, text = '') => fire({ title, text, icon: 'success' }),
    error: (title, text = '') => fire({ title, text, icon: 'error' }),
    warning: (title, text = '') => fire({ title, text, icon: 'warning' }),
    info: (title, text = '') => fire({ title, text, icon: 'info' }),
  };

  global.Swal = Swal;
})(window);
