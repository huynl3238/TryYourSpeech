import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_BIND_HOST, isPubliclyBound, resolveBindHost } from '../src/config/network.js';

// Node mặc định nghe trên mọi card mạng, và trên VPS điều đó từng làm cổng 3001
// vào được thẳng từ Internet — bỏ qua nginx, bỏ qua HTTPS, và làm rỗng nghĩa của
// cơ chế giới hạn tần suất (nó tin header X-Forwarded-For, thứ chỉ đáng tin khi
// duy nhất nginx gọi tới được).
//
// Mấy bài dưới đây khoá lại mặc định đó. Nếu có ai đổi mặc định về '0.0.0.0' cho
// tiện lúc phát triển, bài đầu tiên sẽ đỏ.

test('mặc định chỉ nghe trên localhost, không phải mọi card mạng', () => {
  assert.equal(resolveBindHost({}), '127.0.0.1');
  assert.equal(DEFAULT_BIND_HOST, '127.0.0.1');
  assert.equal(isPubliclyBound(resolveBindHost({})), false);
});

test('HOST rỗng hoặc chỉ có khoảng trắng vẫn về localhost', () => {
  // Một dòng `HOST=` bỏ trống trong .env không được hiểu thành "mở ra Internet".
  assert.equal(resolveBindHost({ HOST: '' }), '127.0.0.1');
  assert.equal(resolveBindHost({ HOST: '   ' }), '127.0.0.1');
});

test('mở ra mạng LAN phải là lựa chọn nói rõ thành lời', () => {
  assert.equal(resolveBindHost({ HOST: '0.0.0.0' }), '0.0.0.0');
  assert.equal(resolveBindHost({ HOST: ' 0.0.0.0 ' }), '0.0.0.0');
  assert.equal(isPubliclyBound('0.0.0.0'), true);
  assert.equal(isPubliclyBound('::'), true);
});

test('nghe trên một địa chỉ cụ thể thì không bị coi là mở công khai', () => {
  assert.equal(resolveBindHost({ HOST: '10.0.0.5' }), '10.0.0.5');
  assert.equal(isPubliclyBound('10.0.0.5'), false);
  assert.equal(isPubliclyBound('127.0.0.1'), false);
});
