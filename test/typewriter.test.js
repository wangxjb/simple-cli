const test = require('node:test');
const assert = require('node:assert/strict');

const { createTypewriter } = require('../src/typewriter');

test('typewriter writes text in order', async () => {
  const chunks = [];
  const writer = createTypewriter({
    write: (chunk) => {
      chunks.push(chunk);
    },
  }, { intervalMs: 0 });

  await writer.write('你好');

  assert.deepEqual(chunks, ['你', '好']);
});
