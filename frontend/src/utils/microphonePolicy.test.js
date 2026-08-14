import assert from 'node:assert/strict';
import test from 'node:test';
import { canEnableMicrophoneDuringSession } from './microphonePolicy.js';

const turns = [
  { speakerRole: 'A' },
  { speakerRole: 'B' },
];

test('both people may talk during the pre-practice briefing', () => {
  assert.equal(canEnableMicrophoneDuringSession({
    practiceStarted: false,
    turns,
    currentTurnIndex: 0,
    role: 'B',
  }), true);
});

test('only the assigned speaker may enable their mic during a speaking turn', () => {
  assert.equal(canEnableMicrophoneDuringSession({
    practiceStarted: true,
    turns,
    currentTurnIndex: 0,
    role: 'A',
  }), true);
  assert.equal(canEnableMicrophoneDuringSession({
    practiceStarted: true,
    turns,
    currentTurnIndex: 0,
    role: 'B',
  }), false);
});
