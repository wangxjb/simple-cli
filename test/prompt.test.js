const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSystemPrompt } = require('../src/prompt');

test('buildSystemPrompt describes the model-driven agent loop', () => {
  const prompt = buildSystemPrompt();

  assert.match(prompt, /CLI Agent 循环/);
  assert.match(prompt, /工具调用/);
  assert.match(prompt, /最终回答/);
  assert.match(prompt, /合法 JSON 对象/);
  assert.match(prompt, /思路摘要/);
  assert.match(prompt, /回复/);
  assert.match(prompt, /不要展示隐藏推理/);
  assert.match(prompt, /list_files/);
  assert.match(prompt, /read_file/);
  assert.match(prompt, /search_text/);
});
