import assert from 'node:assert/strict';
import test from 'node:test';
import { stopRecorderAndWait } from './mediaRecorderLifecycle.js';

test('chờ sự kiện stop trước khi cho phép dọn media', async () => {
  class FakeRecorder extends EventTarget {
    state = 'recording';

    stop() {
      this.state = 'inactive';
      setTimeout(() => this.dispatchEvent(new Event('stop')), 10);
    }
  }

  const refs = {
    current: {
      remoteRecorder: new FakeRecorder(),
      recorderStopPromises: new Set(),
    },
  };

  let resolved = false;
  const stopped = stopRecorderAndWait(refs, 'remoteRecorder').then(() => {
    resolved = true;
  });

  await Promise.resolve();
  assert.equal(resolved, false);
  assert.equal(refs.current.remoteRecorder, null);
  assert.equal(refs.current.recorderStopPromises.size, 1);

  await stopped;
  assert.equal(resolved, true);
  assert.equal(refs.current.recorderStopPromises.size, 0);
});
