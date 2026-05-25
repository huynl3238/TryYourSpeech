import { useCallback, useEffect } from 'react';
import { useSession } from '../context/SessionContext';
import { getConfig } from '../services/api';

export function useWebRTC({ sendSignal, onSignal, onRemoteStream }) {
  const { refs } = useSession();

  const initPeerConnection = useCallback(async () => {
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
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', pc.connectionState);
    };

    return pc;
  }, [sendSignal, onRemoteStream, refs]);

  const startCall = useCallback(async (localStream, isInitiator) => {
    const pc = refs.current.peerConnection;
    if (!pc) return;

    // Add local tracks
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal('offer', offer);
    }
  }, [sendSignal, refs]);

  // Handle incoming signals
  useEffect(() => {
    const cleanup = onSignal(async ({ type, payload }) => {
      const pc = refs.current.peerConnection;
      if (!pc) return;

      try {
        if (type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(payload));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal('answer', answer);
        } else if (type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(payload));
        } else if (type === 'ice-candidate') {
          await pc.addIceCandidate(new RTCIceCandidate(payload));
        }
      } catch (err) {
        console.error('[WebRTC] Signal handling error:', err.message);
      }
    });

    return cleanup;
  }, [onSignal, sendSignal, refs]);

  const getLocalStream = useCallback(async (constraints = { audio: true, video: true }) => {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    refs.current.localStream = stream;
    return stream;
  }, [refs]);

  const stopAll = useCallback(() => {
    if (refs.current.localStream) {
      refs.current.localStream.getTracks().forEach((t) => t.stop());
      refs.current.localStream = null;
    }
    if (refs.current.peerConnection) {
      refs.current.peerConnection.close();
      refs.current.peerConnection = null;
    }
    refs.current.remoteStream = null;
  }, [refs]);

  return { initPeerConnection, startCall, getLocalStream, stopAll };
}
