import { useCallback, useEffect } from 'react';
import { useSession } from '../context/SessionContext';
import { getConfig } from '../services/api';
import { cleanupMediaSession, rememberMediaStream } from '../utils/mediaCleanup';

export function useWebRTC({ sendSignal, onSignal, onRemoteStream, onConnectionStateChange }) {
  const { refs } = useSession();

  const buildPeerConnection = useCallback(async () => {
    // Fetch ICE config from backend
    let iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    try {
      const config = await getConfig();
      iceServers = config.iceServers;
    } catch (err) {
      console.warn('[WebRTC] Could not fetch ICE config, using default STUN:', err.message);
    }

    refs.current.iceServers = iceServers;
    const pc = new RTCPeerConnection({ iceServers });
    refs.current.peerConnection = pc;
    refs.current.pendingIceCandidates = [];

    // Forward ICE candidates to partner
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal('ice-candidate', event.candidate);
      }
    };

    // Receive remote stream
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      refs.current.remoteStream = remoteStream;
      if (onRemoteStream) {
        onRemoteStream(remoteStream);
      }
      window.dispatchEvent(new Event('remote_stream_ready'));
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', pc.connectionState);
      if (onConnectionStateChange) {
        onConnectionStateChange(pc.connectionState);
      }
    };

    return pc;
  }, [sendSignal, onRemoteStream, onConnectionStateChange, refs]);

  const initPeerConnection = useCallback(async () => {
    const existingPc = refs.current.peerConnection;
    if (existingPc && existingPc.signalingState !== 'closed') {
      return existingPc;
    }

    // Same in-flight guard as getLocalStream, and for the same reason: the await
    // on getConfig() sits between the check above and the assignment inside
    // buildPeerConnection, so overlapping calls each built their own
    // RTCPeerConnection and the first was silently orphaned along with any
    // tracks already added to it.
    if (!refs.current.peerConnectionPromise) {
      refs.current.peerConnectionPromise = buildPeerConnection().finally(() => {
        refs.current.peerConnectionPromise = null;
      });
    }

    return refs.current.peerConnectionPromise;
  }, [buildPeerConnection, refs]);

  const addLocalTracks = useCallback((localStream) => {
    const pc = refs.current.peerConnection;
    if (!pc || !localStream) return null;

    const existingTracks = new Set(pc.getSenders().map((sender) => sender.track).filter(Boolean));
    localStream.getTracks().forEach((track) => {
      if (!existingTracks.has(track)) {
        pc.addTrack(track, localStream);
      }
    });

    return pc;
  }, [refs]);

  const startCall = useCallback(async (localStream, isInitiator) => {
    const pc = addLocalTracks(localStream);
    if (!pc) return;

    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal('offer', offer);
    }
  }, [addLocalTracks, sendSignal]);

  // Handle incoming signals
  useEffect(() => {
    async function flushPendingIceCandidates(pc) {
      const pendingCandidates = refs.current.pendingIceCandidates || [];
      refs.current.pendingIceCandidates = [];

      for (const candidate of pendingCandidates) {
        await pc.addIceCandidate(candidate);
      }
    }

    const cleanup = onSignal(async ({ type, payload }) => {
      const pc = refs.current.peerConnection;
      if (!pc) return;

      try {
        if (type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(payload));
          await flushPendingIceCandidates(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal('answer', answer);
        } else if (type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(payload));
          await flushPendingIceCandidates(pc);
        } else if (type === 'ice-candidate') {
          const candidate = new RTCIceCandidate(payload);
          if (pc.remoteDescription) {
            await pc.addIceCandidate(candidate);
          } else {
            refs.current.pendingIceCandidates = refs.current.pendingIceCandidates || [];
            refs.current.pendingIceCandidates.push(candidate);
          }
        }
      } catch (err) {
        console.error('[WebRTC] Signal handling error:', err.message);
      }
    });

    return cleanup;
  }, [onSignal, sendSignal, refs]);

  const getLocalStream = useCallback(async (constraints = { audio: true, video: true }) => {
    const existingStream = refs.current.localStream;
    if (existingStream?.getTracks().some((track) => track.readyState === 'live')) {
      return existingStream;
    }

    // The check above runs before the await while the assignment runs after it,
    // so two overlapping calls both saw "no stream yet" and both opened the
    // camera — React StrictMode does exactly that in development. The second
    // stream replaced the first, leaving its tracks live with the camera light
    // still on and an extra track already added to the peer connection. Sharing
    // the in-flight promise makes the second caller wait for the first.
    if (!refs.current.localStreamPromise) {
      refs.current.localStreamPromise = navigator.mediaDevices
        .getUserMedia(constraints)
        .then((stream) => {
          refs.current.localStream = rememberMediaStream(stream);
          return refs.current.localStream;
        })
        .finally(() => {
          refs.current.localStreamPromise = null;
        });
    }

    return refs.current.localStreamPromise;
  }, [refs]);

  const stopAll = useCallback(() => {
    cleanupMediaSession(refs);
  }, [refs]);

  return { initPeerConnection, addLocalTracks, startCall, getLocalStream, stopAll };
}
