import assert from 'node:assert/strict';
import test from 'node:test';
import { areAiResultsTerminal } from './aiResultStatus.js';

test('không mở Results khi các lượt xong nhưng chấm cả bài vẫn đang chạy', () => {
  assert.equal(areAiResultsTerminal({
    sessionMode: 'peer',
    turnResults: [{ aiStatus: 'completed' }],
    holistic: { status: 'processing' },
  }), false);
});

test('chỉ hoàn tất khi cả lượt nói và chấm cả bài đều kết thúc', () => {
  assert.equal(areAiResultsTerminal({
    sessionMode: 'peer',
    turnResults: [{ aiStatus: 'completed' }, { aiStatus: 'failed' }],
    holistic: { status: 'completed' },
  }), true);
});

test('thiếu holistic result không được coi là đã chấm xong', () => {
  assert.equal(areAiResultsTerminal({
    sessionMode: 'peer',
    turnResults: [{ aiStatus: 'completed' }],
    holistic: null,
  }), false);
});
