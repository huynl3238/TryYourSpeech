import { useCallback, useEffect } from 'react';
import { useSession } from '../context/SessionContext';
import { getConfig } from '../services/api';
import { cleanupMediaSession, rememberMediaStream } from '../utils/mediaCleanup';

export function useWebRTC({ sendSignal, onSignal, onRemoteStream }) {
  const { refs } = useSession();

  const initPeerConnection = useCallback(async () => {
    const existingPc = refs.current.peerConnection;
    if (existingPc && existingPc.signalingState !== 'closed') {
      return existingPc;
    }

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
    };

    return pc;
  }, [sendSignal, onRemoteStream, refs]);

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

    const stream = rememberMediaStream(await navigator.mediaDevices.getUserMedia(constraints));
    refs.current.localStream = stream;
    return stream;
  }, [refs]);

  const stopAll = useCallback(() => {
    cleanupMediaSession(refs);
  }, [refs]);

  return { initPeerConnection, addLocalTracks, startCall, getLocalStream, stopAll };
}
