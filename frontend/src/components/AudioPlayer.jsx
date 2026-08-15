import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { fetchAudioBlob, getBackendFileUrl } from '../services/api';
import {
  clampAudioTime,
  formatAudioTime,
  getPlayableDuration,
} from '../utils/audioPlayer';

export const AudioPlayer = forwardRef(function AudioPlayer({
  src,
  durationMs = 0,
  className = '',
}, forwardedRef) {
  const mediaRef = useRef(null);
  const fallbackUrlRef = useRef('');
  const fallbackAttemptedRef = useRef(false);
  const [resolvedSrc, setResolvedSrc] = useState(() => getBackendFileUrl(src));
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(() => getPlayableDuration(0, durationMs));
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingFallback, setIsLoadingFallback] = useState(false);
  const [error, setError] = useState('');

  function releaseFallbackUrl() {
    if (fallbackUrlRef.current) {
      URL.revokeObjectURL(fallbackUrlRef.current);
      fallbackUrlRef.current = '';
    }
  }

  useEffect(() => {
    releaseFallbackUrl();
    fallbackAttemptedRef.current = false;
    setResolvedSrc(getBackendFileUrl(src));
    setCurrentTime(0);
    setDuration(getPlayableDuration(0, durationMs));
    setIsPlaying(false);
    setIsLoadingFallback(false);
    setError('');

    return releaseFallbackUrl;
  }, [src, durationMs]);

  function seekTo(seconds) {
    const media = mediaRef.current;
    if (!media) return;

    const nextTime = clampAudioTime(seconds, duration || media.duration);
    media.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  useImperativeHandle(forwardedRef, () => ({
    seekTo,
    play: async () => {
      try {
        await mediaRef.current?.play();
      } catch {
        setError('Trình duyệt chưa thể phát audio. Vui lòng thử lại.');
      }
    },
    pause: () => mediaRef.current?.pause(),
  }));

  function syncDuration() {
    const nextDuration = getPlayableDuration(mediaRef.current?.duration, durationMs);
    if (nextDuration > 0) {
      setDuration(nextDuration);
    }
  }

  async function handleMediaError() {
    if (!src || fallbackAttemptedRef.current || !String(src).includes('/api/turns/')) {
      setError('Không thể phát bản ghi âm này.');
      setIsPlaying(false);
      return;
    }

    fallbackAttemptedRef.current = true;
    setIsLoadingFallback(true);
    setError('');

    try {
      const blob = await fetchAudioBlob(src);
      releaseFallbackUrl();
      fallbackUrlRef.current = URL.createObjectURL(blob);
      setResolvedSrc(fallbackUrlRef.current);
    } catch (err) {
      setError(err.message || 'Không thể tải bản ghi âm.');
    } finally {
      setIsLoadingFallback(false);
    }
  }

  async function togglePlayback() {
    const media = mediaRef.current;
    if (!media || isLoadingFallback) return;

    if (media.paused) {
      try {
        setError('');
        await media.play();
      } catch {
        setError('Trình duyệt chưa thể phát audio. Vui lòng thử lại.');
      }
    } else {
      media.pause();
    }
  }

  const displayedDuration = duration || getPlayableDuration(0, durationMs);

  return (
    <div className={`rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 ${className}`}>
      <audio
        ref={mediaRef}
        src={resolvedSrc || undefined}
        preload="metadata"
        onLoadedMetadata={syncDuration}
        onDurationChange={syncDuration}
        onTimeUpdate={() => setCurrentTime(clampAudioTime(mediaRef.current?.currentTime, displayedDuration))}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={handleMediaError}
        className="hidden"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlayback}
          disabled={!resolvedSrc || isLoadingFallback}
          aria-label={isPlaying ? 'Tạm dừng audio' : 'Phát audio'}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#D97757] text-white disabled:opacity-50"
        >
          <span className="material-symbols-rounded icon-fill" style={{ fontSize: 20 }}>
            {isLoadingFallback ? 'progress_activity' : isPlaying ? 'pause' : 'play_arrow'}
          </span>
        </button>

        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-zinc-500">
          {formatAudioTime(currentTime)}
        </span>
        <input
          type="range"
          min="0"
          max={displayedDuration || 0}
          step="0.1"
          value={clampAudioTime(currentTime, displayedDuration)}
          onChange={(event) => seekTo(Number(event.target.value))}
          disabled={!displayedDuration || Boolean(error)}
          aria-label="Tiến độ audio"
          className="min-w-0 flex-1 accent-[#D97757]"
        />
        <span className="w-10 shrink-0 text-xs tabular-nums text-zinc-500">
          {formatAudioTime(displayedDuration)}
        </span>
      </div>

      {isLoadingFallback && (
        <p className="mt-2 text-xs text-zinc-500">Đang tải lại audio an toàn...</p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
});
