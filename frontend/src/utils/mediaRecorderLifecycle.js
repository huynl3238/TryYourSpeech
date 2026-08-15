// MediaRecorder emits its final data asynchronously before `stop`. Keeping the
// Promise in session refs lets the page wait even when a turn effect initiated
// the stop just before the whole practice timeline ended.
export function stopRecorderAndWait(refs, recorderKey) {
  const recorder = refs.current[recorderKey];
  if (!recorder || recorder.state === 'inactive') {
    return Promise.resolve();
  }

  refs.current[recorderKey] = null;
  refs.current.recorderStopPromises ||= new Set();

  let finishStop;
  let timeoutId;
  const stopPromise = new Promise((resolve) => {
    let finished = false;
    finishStop = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      resolve();
    };

    recorder.addEventListener('stop', finishStop, { once: true });
    timeoutId = setTimeout(finishStop, 3000);
  });

  refs.current.recorderStopPromises.add(stopPromise);
  stopPromise.finally(() => refs.current.recorderStopPromises?.delete(stopPromise));

  try {
    recorder.stop();
  } catch (err) {
    console.warn(`[Recorder] Cannot stop ${recorderKey}:`, err.message);
    finishStop();
  }

  return stopPromise;
}
