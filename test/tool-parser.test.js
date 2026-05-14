const test = require('node:test');
const assert = require('node:assert/strict');

const { parseToolCall } = require('../src/tool-parser');

test('parseToolCall reads a fenced JSON tool request', () => {
  const call = parseToolCall([
    'I need a file.',
    '```json',
    '{"tool":"read_file","args":{"path":"package.json"}}',
    '```',
  ].join('\n'));

  assert.deepEqual(call, {
    tool: 'read_file',
    args: { path: 'package.json' },
  });
});

test('parseToolCall returns null when no tool request exists', () => {
  assert.equal(parseToolCall('normal assistant response'), null);
});
