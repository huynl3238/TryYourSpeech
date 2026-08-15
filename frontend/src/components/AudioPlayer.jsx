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
  shouldProbeDuration,
} from '../utils/audioPlayer';

// Bản ghi do trình duyệt tạo ra không ghi độ dài vào phần đầu file — nó được ghi
// theo kiểu phát trực tiếp, lúc bắt đầu ghi thì chưa biết sẽ dài bao nhiêu. Nên
// `audio.duration` trả về vô cực cho tới khi trình duyệt đọc hết file.
//
// Cách chữa tiêu chuẩn: nhảy tới một mốc rất xa. Trình duyệt buộc phải quét tới
// cuối, biết được độ dài thật rồi báo lại, sau đó ta trả kim về 0. Con số này chỉ
// cần lớn hơn mọi lượt nói có thể có; dùng số quá lớn thì một số trình duyệt bỏ
// qua luôn lệnh tua.
const DURATION_PROBE_SECONDS = 24 * 60 * 60;
// Dò không xong trong chừng này thì thôi, quay về dùng độ dài dự kiến. Không có
// mốc bỏ cuộc thì một file hỏng sẽ treo thanh tiến độ mãi mãi.
const DURATION_PROBE_TIMEOUT_MS = 2000;

export const AudioPlayer = forwardRef(function AudioPlayer({
  src,
  durationMs = 0,
  className = '',
}, forwardedRef) {
  const mediaRef = useRef(null);
  const fallbackUrlRef = useRef('');
  const fallbackAttemptedRef = useRef(false);
  const probeStateRef = useRef('idle');
  const probeTimerRef = useRef(null);
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

  function stopDurationProbe(nextState) {
    clearTimeout(probeTimerRef.current);
    probeTimerRef.current = null;
    probeStateRef.current = nextState;
  }

  useEffect(() => {
    releaseFallbackUrl();
    fallbackAttemptedRef.current = false;
    stopDurationProbe('idle');
    setResolvedSrc(getBackendFileUrl(src));
    setCurrentTime(0);
    setDuration(getPlayableDuration(0, durationMs));
    setIsPlaying(false);
    setIsLoadingFallback(false);
    setError('');

    return () => {
      releaseFallbackUrl();
      clearTimeout(probeTimerRef.current);
    };
  }, [src, durationMs]);

  function seekTo(seconds) {
    const media = mediaRef.current;
    if (!media) return;

    // Người dùng bấm một mốc lỗi ngay lúc đang dò độ dài: bỏ dở việc dò, nếu
    // không thì vài trăm mili giây sau nó kéo kim về 0 và nuốt mất cú bấm đó.
    // Độ dài thật vẫn được cập nhật bình thường qua `durationchange`.
    stopDurationProbe('done');

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

  function finishDurationProbe() {
    stopDurationProbe('done');

    const media = mediaRef.current;
    if (!media) return;

    // Kim đang nằm ở cuối file sau khi dò. Trả về 0 để người dùng bấm phát là
    // nghe từ đầu, đúng như khi chưa dò gì.
    try {
      media.currentTime = 0;
    } catch {
      // Một số trình duyệt từ chối tua khi chưa nạp đủ; không sao, lần phát đầu
      // vẫn bắt đầu từ 0.
    }
    setCurrentTime(0);
  }

  function handleLoadedMetadata() {
    const media = mediaRef.current;
    if (!media) return;

    if (!shouldProbeDuration(media.duration, probeStateRef.current)) {
      syncDuration();
      return;
    }

    probeStateRef.current = 'probing';
    // Mọi đường thoát đều đi qua `finishDurationProbe`, để kim luôn được trả về 0
    // dù việc dò thành công, hết giờ, hay trình duyệt từ chối tua.
    probeTimerRef.current = setTimeout(() => {
      syncDuration();
      finishDurationProbe();
    }, DURATION_PROBE_TIMEOUT_MS);

    try {
      media.currentTime = DURATION_PROBE_SECONDS;
    } catch {
      syncDuration();
      finishDurationProbe();
    }
  }

  function handleDurationChange() {
    const media = mediaRef.current;

    if (probeStateRef.current === 'probing') {
      if (media && Number.isFinite(media.duration) && media.duration > 0) {
        syncDuration();
        finishDurationProbe();
      }
      return;
    }

    syncDuration();
  }

  function handleTimeUpdate() {
    // Trong lúc dò, kim bị đẩy tới cuối file. Con số đó không phải chỗ người dùng
    // đang nghe, nên không được đưa lên thanh tiến độ.
    if (probeStateRef.current === 'probing') return;

    setCurrentTime(clampAudioTime(mediaRef.current?.currentTime, displayedDuration));
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
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={handleDurationChange}
        onTimeUpdate={handleTimeUpdate}
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
