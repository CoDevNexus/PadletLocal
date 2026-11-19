/**
 * PadletLocal WebRTC Screen Sharing Manager
 * Supports 1-to-N screen sharing per card over LAN using Socket.IO signaling.
 */
(function (global) {
  const RTC_CONFIG = {
    iceServers: [],
  };

  class ScreenShareManager {
    constructor(socket, callbacks = {}) {
      this.socket = socket;
      this.callbacks = callbacks;

      // Presenter state: postId -> MediaStream
      this.localStreams = new Map();
      // Presenter peer connections: `${postId}:${watcherId}` -> { pc, pendingCandidates }
      this.presenterPeers = new Map();

      // Viewer state: postId -> { pc, sharerSocketId, stream, pendingCandidates }
      this.viewerPeers = new Map();

      this.bindSignalingEvents();
    }

    isSecureContext() {
      return Boolean(
        window.isSecureContext ||
          window.location.protocol === 'https:' ||
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1'
      );
    }

    isMobileDevice() {
      return Boolean(
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
          (navigator.maxTouchPoints > 1 && window.innerWidth <= 1024)
      );
    }

    canShareScreen() {
      return Boolean(
        this.isSecureContext() &&
          navigator.mediaDevices &&
          typeof navigator.mediaDevices.getDisplayMedia === 'function'
      );
    }

    canShareCamera() {
      return Boolean(
        this.isSecureContext() &&
          navigator.mediaDevices &&
          typeof navigator.mediaDevices.getUserMedia === 'function'
      );
    }

    isSecureContextAvailable() {
      // Returns true if device can share either screen or camera
      return this.canShareScreen() || this.canShareCamera();
    }

    isPresenting(postId) {
      return this.localStreams.has(postId);
    }

    getStream(postId) {
      if (this.localStreams.has(postId)) {
        return { stream: this.localStreams.get(postId), isLocal: true };
      }
      const viewer = this.viewerPeers.get(postId);
      if (viewer && viewer.stream) {
        return { stream: viewer.stream, isLocal: false };
      }
      return null;
    }

    attachStreamToVideo(postId, videoEl) {
      if (!videoEl) return false;
      const info = this.getStream(postId);
      if (!info || !info.stream) return false;

      if (videoEl.srcObject !== info.stream) {
        videoEl.srcObject = info.stream;
      }

      if (info.isLocal) {
        videoEl.muted = true;
      }

      const playPromise = videoEl.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          // Autoplay fallback: mute and retry
          videoEl.muted = true;
          videoEl.play().catch(() => {});
        });
      }
      return true;
    }

    async startSharing(
      postId,
      {
        authorId,
        authorName,
        streamSource = 'screen',
        facingMode = 'environment',
        audience = 'all',
        targetAuthorIds = [],
      } = {}
    ) {
      if (!this.isSecureContext()) {
        const err = new Error('HTTPS_REQUIRED');
        err.code = 'HTTPS_REQUIRED';
        throw err;
      }

      if (this.localStreams.has(postId)) {
        return this.localStreams.get(postId);
      }

      let stream;
      const isCamera = streamSource === 'camera';

      if (isCamera) {
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
          const err = new Error('Tu dispositivo o navegador no admite acceso a la cámara.');
          err.code = 'CAMERA_UNSUPPORTED';
          throw err;
        }
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facingMode || 'environment' },
              width: { ideal: 1280, max: 1920 },
              height: { ideal: 720, max: 1080 },
            },
            audio: true,
          });
        } catch (camErr) {
          if (camErr.name === 'NotAllowedError' || camErr.name === 'AbortError') {
            throw camErr;
          }
          // Retry without audio if microphone was rejected
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facingMode || 'environment' },
              width: { ideal: 1280, max: 1920 },
              height: { ideal: 720, max: 1080 },
            },
            audio: false,
          });
        }
      } else {
        // Screen capture
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
          const err = new Error('SCREEN_CAPTURE_UNSUPPORTED');
          err.code = 'SCREEN_CAPTURE_UNSUPPORTED';
          throw err;
        }
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              cursor: 'always',
              frameRate: { ideal: 24, max: 30 },
            },
            audio: true,
          });
        } catch (err) {
          if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
            throw err;
          }
          // Retry without audio if device/browser rejected audio capture
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              cursor: 'always',
              frameRate: { ideal: 24, max: 30 },
            },
            audio: false,
          });
        }
      }

      this.localStreams.set(postId, stream);

      // Listen for native browser "Stop sharing" button
      const [videoTrack] = stream.getVideoTracks();
      if (videoTrack) {
        videoTrack.onended = () => {
          if (this.localStreams.has(postId)) {
            this.stopSharing(postId);
          }
        };
      }

      // Notify server
      const ack = await new Promise((resolve) => {
        this.socket.emit(
          'screen:start',
          {
            postId,
            authorId,
            authorName,
            sourceType: isCamera ? 'camera' : 'screen',
            audience,
            targetAuthorIds,
          },
          (response) => resolve(response || { ok: false, error: 'Sin respuesta del servidor.' })
        );
      });

      if (!ack.ok) {
        this.cleanupLocalStream(postId);
        throw new Error(ack.error || 'No se pudo iniciar la transmisión.');
      }

      if (this.callbacks.onStreamReady) {
        this.callbacks.onStreamReady(postId, stream, true);
      }

      return stream;
    }

    stopSharing(postId) {
      if (!this.localStreams.has(postId)) return;

      this.cleanupLocalStream(postId);
      this.socket.emit('screen:stop', { postId });

      if (this.callbacks.onStreamStopped) {
        this.callbacks.onStreamStopped(postId, true);
      }
    }

    setTeacherPaused(postId, paused) {
      const stream = this.localStreams.get(postId);
      if (!stream) return false;
      stream.getTracks().forEach((track) => {
        track.enabled = !paused;
      });
      return true;
    }

    forceStopByTeacher(postId) {
      if (!this.localStreams.has(postId)) return;
      this.cleanupLocalStream(postId);
      if (this.callbacks.onStreamStopped) {
        this.callbacks.onStreamStopped(postId, true);
      }
    }

    cleanupLocalStream(postId) {
      const stream = this.localStreams.get(postId);
      if (stream) {
        stream.getTracks().forEach((track) => {
          track.onended = null;
          track.stop();
        });
        this.localStreams.delete(postId);
      }

      // Close all outgoing peer connections for this post
      for (const [key, entry] of Array.from(this.presenterPeers.entries())) {
        if (key.startsWith(`${postId}:`)) {
          try {
            entry.pc.close();
          } catch {}
          this.presenterPeers.delete(key);
        }
      }
    }

    watchScreen(postId, sharerSocketId, authorId = null) {
      if (this.localStreams.has(postId)) return;
      if (sharerSocketId && sharerSocketId === this.socket.id) return;

      const existing = this.viewerPeers.get(postId);
      if (existing && existing.sharerSocketId === sharerSocketId) {
        const state = existing.pc?.connectionState;
        if (state && state !== 'failed' && state !== 'closed' && state !== 'disconnected') {
          return;
        }
      }

      this.unwatchScreen(postId, false);
      this.viewerPeers.set(postId, {
        pc: null,
        sharerSocketId,
        stream: null,
        pendingCandidates: [],
      });

      this.socket.emit('screen:watch', { postId, authorId });
    }

    reconnectWatch(postId, sharerSocketId, authorId = null) {
      this.unwatchScreen(postId, true);
      this.watchScreen(postId, sharerSocketId, authorId);
    }

    unwatchScreen(postId, notifyServer = true) {
      const entry = this.viewerPeers.get(postId);
      if (!entry) return;

      if (entry.pc) {
        try {
          entry.pc.ontrack = null;
          entry.pc.onicecandidate = null;
          entry.pc.onconnectionstatechange = null;
          entry.pc.close();
        } catch {}
      }

      this.viewerPeers.delete(postId);

      if (notifyServer) {
        this.socket.emit('screen:unwatch', { postId });
      }
    }

    handleRemoteShareStopped(postId) {
      if (this.localStreams.has(postId)) {
        this.cleanupLocalStream(postId);
      }
      this.unwatchScreen(postId, false);
      if (this.callbacks.onStreamStopped) {
        this.callbacks.onStreamStopped(postId, false);
      }
    }

    stopAll() {
      for (const postId of Array.from(this.localStreams.keys())) {
        this.stopSharing(postId);
      }
      for (const postId of Array.from(this.viewerPeers.keys())) {
        this.unwatchScreen(postId, false);
      }
    }

    // --- Signaling Handlers ---
    bindSignalingEvents() {
      // Presenter: a viewer wants to watch our screen
      this.socket.on('screen:watcher-joined', async ({ postId, watcherId }) => {
        const stream = this.localStreams.get(postId);
        if (!stream || !watcherId) return;

        const key = `${postId}:${watcherId}`;
        const existing = this.presenterPeers.get(key);
        if (existing) {
          try {
            existing.pc.close();
          } catch {}
          this.presenterPeers.delete(key);
        }

        const pc = new RTCPeerConnection(RTC_CONFIG);
        const peerEntry = { pc, pendingCandidates: [] };
        this.presenterPeers.set(key, peerEntry);

        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            this.socket.emit('webrtc:ice-candidate', {
              to: watcherId,
              postId,
              candidate: event.candidate,
            });
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            this.presenterPeers.delete(key);
          }
        };

        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          this.socket.emit('webrtc:offer', {
            to: watcherId,
            postId,
            offer: pc.localDescription,
          });
        } catch (err) {
          console.error('Error creando oferta WebRTC:', err);
          pc.close();
          this.presenterPeers.delete(key);
        }
      });

      // Presenter: viewer left
      this.socket.on('screen:watcher-left', ({ postId, watcherId }) => {
        const key = `${postId}:${watcherId}`;
        const entry = this.presenterPeers.get(key);
        if (entry) {
          try {
            entry.pc.close();
          } catch {}
          this.presenterPeers.delete(key);
        }
      });

      // Viewer: received offer from presenter
      this.socket.on('webrtc:offer', async ({ from, postId, offer }) => {
        if (this.localStreams.has(postId)) return;

        const existing = this.viewerPeers.get(postId);
        if (existing?.pc) {
          try {
            existing.pc.close();
          } catch {}
        }

        const pc = new RTCPeerConnection(RTC_CONFIG);
        const viewerEntry = {
          pc,
          sharerSocketId: from,
          stream: null,
          pendingCandidates: existing?.pendingCandidates || [],
        };
        this.viewerPeers.set(postId, viewerEntry);

        pc.ontrack = (event) => {
          const [remoteStream] = event.streams;
          if (!remoteStream) return;
          viewerEntry.stream = remoteStream;
          if (this.callbacks.onStreamReady) {
            this.callbacks.onStreamReady(postId, remoteStream, false);
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            this.socket.emit('webrtc:ice-candidate', {
              to: from,
              postId,
              candidate: event.candidate,
            });
          }
        };

        pc.onconnectionstatechange = () => {
          if (this.callbacks.onConnectionState) {
            this.callbacks.onConnectionState(postId, pc.connectionState);
          }
        };

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          // Flush queued candidates
          for (const cand of viewerEntry.pendingCandidates) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
          viewerEntry.pendingCandidates = [];

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.socket.emit('webrtc:answer', {
            to: from,
            postId,
            answer: pc.localDescription,
          });
        } catch (err) {
          console.error('Error procesando oferta WebRTC:', err);
        }
      });

      // Presenter: received answer from viewer
      this.socket.on('webrtc:answer', async ({ from, postId, answer }) => {
        const key = `${postId}:${from}`;
        const entry = this.presenterPeers.get(key);
        if (!entry) return;

        try {
          await entry.pc.setRemoteDescription(new RTCSessionDescription(answer));
          for (const cand of entry.pendingCandidates) {
            await entry.pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
          entry.pendingCandidates = [];
        } catch (err) {
          console.error('Error procesando respuesta WebRTC:', err);
        }
      });

      // Both sides: received ICE candidate
      this.socket.on('webrtc:ice-candidate', async ({ from, postId, candidate }) => {
        if (!candidate) return;

        // Check presenter peer first
        const presenterKey = `${postId}:${from}`;
        const presenterEntry = this.presenterPeers.get(presenterKey);
        if (presenterEntry) {
          if (presenterEntry.pc.remoteDescription) {
            await presenterEntry.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
          } else {
            presenterEntry.pendingCandidates.push(candidate);
          }
          return;
        }

        // Check viewer peer
        const viewerEntry = this.viewerPeers.get(postId);
        if (viewerEntry && viewerEntry.pc) {
          if (viewerEntry.pc.remoteDescription) {
            await viewerEntry.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
          } else {
            viewerEntry.pendingCandidates.push(candidate);
          }
        } else if (viewerEntry) {
          viewerEntry.pendingCandidates.push(candidate);
        }
      });
    }
  }

  global.ScreenShareManager = ScreenShareManager;
})(window);
