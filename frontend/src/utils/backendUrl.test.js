import assert from 'node:assert/strict';
import test from 'node:test';
import { isAbsoluteFileUrl, resolveBackendFileUrl } from './backendUrl.js';

const BASE = 'https://try-your-speech.lehuytramy.site';

// Bản ghi của đối tác ở màn Review chỉ nằm trong bộ nhớ tab, nên đường dẫn tới nó
// là một blob URL. Ghép thêm địa chỉ máy chủ vào đầu là hỏng hẳn — và hỏng im
// lặng, vì thẻ audio chỉ báo "không phát được" chứ không nói vì sao.
test('blob URL đi thẳng, không bị ghép địa chỉ máy chủ', () => {
  const blobUrl = `blob:${BASE}/8f2c1d94-0b7e-4a11-9d33-6a1f2c4e7b90`;

  assert.equal(resolveBackendFileUrl(BASE, blobUrl), blobUrl);
  assert.equal(isAbsoluteFileUrl(blobUrl), true);
});

test('data URL cũng đi thẳng', () => {
  const dataUrl = 'data:audio/webm;base64,GkXfo59ChoEB';

  assert.equal(resolveBackendFileUrl(BASE, dataUrl), dataUrl);
});

test('đường dẫn tương đối vẫn được ghép như cũ', () => {
  assert.equal(
    resolveBackendFileUrl(BASE, '/api/turns/abc/audio'),
    `${BASE}/api/turns/abc/audio`
  );
  assert.equal(
    resolveBackendFileUrl('', '/api/turns/abc/audio'),
    '/api/turns/abc/audio'
  );
});

test('địa chỉ tuyệt đối http và https giữ nguyên như trước', () => {
  assert.equal(resolveBackendFileUrl(BASE, 'http://x.test/a.webm'), 'http://x.test/a.webm');
  assert.equal(resolveBackendFileUrl(BASE, 'https://x.test/a.webm'), 'https://x.test/a.webm');
});

test('rỗng và giá trị không dùng được trả về chuỗi rỗng', () => {
  assert.equal(resolveBackendFileUrl(BASE, ''), '');
  assert.equal(resolveBackendFileUrl(BASE, null), '');
  assert.equal(resolveBackendFileUrl(BASE, undefined), '');
});

test('tên tệp bắt đầu bằng chữ giống tên giao thức vẫn được ghép', () => {
  // "blobfoo" không phải giao thức `blob:`. Nếu chỉ so tiền tố mà quên dấu hai
  // chấm thì những tệp này lặng lẽ mất địa chỉ máy chủ.
  assert.equal(resolveBackendFileUrl(BASE, '/uploads/blobfoo.webm'), `${BASE}/uploads/blobfoo.webm`);
  assert.equal(isAbsoluteFileUrl('/uploads/datafile.webm'), false);
});
