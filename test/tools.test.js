const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { executeToolCall } = require('../src/tools');

test('executeToolCall rejects paths outside the workspace', async () => {
  const result = await executeToolCall({
    tool: 'read_file',
    args: { path: '..\\outside.txt' },
  }, process.cwd());

  assert.equal(result.ok, false);
  assert.match(result.content, /outside workspace/);
});

test('executeToolCall can read a file inside the workspace', async () => {
  const result = await executeToolCall({
    tool: 'read_file',
    args: { path: 'package.json' },
  }, process.cwd());

  assert.equal(result.ok, true);
  assert.match(result.content, /simple-cli/);
  assert.equal(path.isAbsolute(result.path), true);
});
