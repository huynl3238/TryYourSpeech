import assert from 'node:assert/strict';
import test from 'node:test';
import { isTouchPrimaryDevice, vibrateOnTouchDevice } from './haptics.js';

// Cái bẫy ở đây: `navigator.vibrate` CÓ trên Chrome máy tính và trả về true, nó
// chỉ không làm gì vì máy không có mô-tơ rung. Nghĩa là code sai kiểu "rung cả
// trên máy bàn" sẽ không tự lộ ra ở đâu cả — không có lỗi, không có cảnh báo,
// và người viết code trên laptop thì không bao giờ thấy. Bộ test này là chỗ duy
// nhất bắt được.

function setEnvironment({ touchPrimary, hasVibrateApi = true, vibrateImpl }) {
  const calls = [];

  globalThis.window = {
    matchMedia(query) {
      // Chỉ trả lời đúng câu hỏi mà `isTouchPrimaryDevice` hỏi; câu khác mà
      // khớp nhầm thì test sẽ vô tình xanh với một truy vấn sai.
      assert.equal(query, '(hover: none) and (pointer: coarse)');
      return { matches: touchPrimary };
    },
  };

  const navigatorStub = {};
  if (hasVibrateApi) {
    navigatorStub.vibrate = vibrateImpl || ((pattern) => {
      calls.push(pattern);
      return true;
    });
  }

  Object.defineProperty(globalThis, 'navigator', {
    value: navigatorStub,
    configurable: true,
    writable: true,
  });

  return calls;
}

test.afterEach(() => {
  delete globalThis.window;
});

test('máy tính KHÔNG rung, dù trình duyệt có sẵn hàm rung', () => {
  // Đây là yêu cầu chính: chỉ rung trên điện thoại.
  const calls = setEnvironment({ touchPrimary: false, hasVibrateApi: true });

  const result = vibrateOnTouchDevice();

  assert.equal(result, false, 'máy tính thì không được rung');
  assert.deepEqual(calls, [], 'không được gọi navigator.vibrate lấy một lần');
});

test('điện thoại thì rung, và rung đúng nhịp đã đặt', () => {
  const calls = setEnvironment({ touchPrimary: true });

  const result = vibrateOnTouchDevice();

  assert.equal(result, true);
  assert.deepEqual(calls, [15], 'một nhịp ngắn, không phải một tràng dài');
});

test('điện thoại không hỗ trợ rung thì im lặng bỏ qua', () => {
  // Safari trên iPhone không có API rung. Đó là giới hạn hệ điều hành, không
  // phải lỗi — và tuyệt đối không được làm hỏng việc đánh dấu.
  setEnvironment({ touchPrimary: true, hasVibrateApi: false });

  assert.equal(vibrateOnTouchDevice(), false);
});

test('trình duyệt ném lỗi khi rung thì việc đánh dấu vẫn phải chạy tiếp', () => {
  setEnvironment({
    touchPrimary: true,
    vibrateImpl: () => {
      throw new Error('vibration blocked before user gesture');
    },
  });

  // Không được ném ra ngoài: chỗ gọi là hành động đánh dấu lỗi của người dùng,
  // và mất một cái rung thì không đáng để mất luôn cái marker.
  assert.equal(vibrateOnTouchDevice(), false);
});

test('không có window thì không đoán bừa là điện thoại', () => {
  delete globalThis.window;

  assert.equal(isTouchPrimaryDevice(), false);
  assert.equal(vibrateOnTouchDevice(), false);
});
