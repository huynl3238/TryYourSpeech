import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Loads Google Identity Services once, even if several buttons mount.
let scriptPromise = null;

function loadGoogleScript() {
  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Không tải được Google Sign-In'));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export function GoogleSignInButton({ onSignedIn }) {
  const { loginWithGoogle } = useAuth();
  const containerRef = useRef(null);
  const [error, setError] = useState('');
  const callbackRef = useRef(null);

  // Keep the latest handlers in a ref so Google's callback (registered once)
  // never calls a stale closure.
  callbackRef.current = async (response) => {
    setError('');
    try {
      const signedInUser = await loginWithGoogle(response.credential);
      onSignedIn?.(signedInUser);
    } catch (err) {
      setError(err.message || 'Đăng nhập thất bại');
    }
  };

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setError('Chưa cấu hình VITE_GOOGLE_CLIENT_ID');
      return;
    }

    let cancelled = false;

    loadGoogleScript()
      .then(() => {
        if (cancelled || !containerRef.current) return;

        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => callbackRef.current?.(response),
        });

        window.google.accounts.id.renderButton(containerRef.current, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'signin_with',
          locale: 'vi',
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={containerRef} />
      {error && <p className="text-[12.5px] text-red-600 text-center">{error}</p>}
    </div>
  );
}
