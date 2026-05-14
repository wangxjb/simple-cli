const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseAssistantOutput,
  formatAssistantCard,
  formatModelPayload,
  formatModelReply,
  formatToolMessage,
  renderTranscript,
  sliceVisibleText,
  formatInputBar,
} = require('../src/ui');

test('parseAssistantOutput splits summary and answer', () => {
  const parsed = parseAssistantOutput([
    '【思路摘要】',
    '- 识别需求',
    '- 整理方案',
    '【回复】',
    '这是最终答案。',
  ].join('\n'));

  assert.deepEqual(parsed.summary, ['识别需求', '整理方案']);
  assert.equal(parsed.answer, '这是最终答案。');
});

test('formatAssistantCard includes summary and answer sections', () => {
  const card = formatAssistantCard({
    summary: ['识别需求', '组织上下文'],
    answer: '这是最终答案。',
    pending: false,
  });

  assert.match(card, /思路摘要/);
  assert.match(card, /- 识别需求/);
  assert.match(card, /- 组织上下文/);
  assert.match(card, /回复/);
  assert.match(card, /这是最终答案。/);
});

test('formatModelPayload prints the exact messages sent to the model', () => {
  const payload = formatModelPayload([
    { role: 'system', content: '你是一个代码助手' },
    { role: 'user', content: '你好' },
  ]);

  assert.match(payload, /发送给模型/);
  assert.match(payload, /"role": "system"/);
  assert.match(payload, /"content": "你好"/);
});

test('formatModelReply prints reasoning and raw output', () => {
  const reply = formatModelReply({
    round: 1,
    reasoningContent: '需要读取文件。',
    content: '{"tool":"read_file","args":{"path":"package.json"}}',
  });

  assert.match(reply, /模型返回 #2/);
  assert.match(reply, /思考过程/);
  assert.match(reply, /需要读取文件。/);
  assert.match(reply, /原始输出/);
  assert.match(reply, /read_file/);
});

test('formatToolMessage prints tool call and result', () => {
  const message = formatToolMessage({
    name: 'read_file',
    args: { path: 'package.json' },
    result: {
      ok: true,
      path: 'C:/project/package.json',
      content: '{"name":"demo"}',
    },
  });

  assert.match(message, /工具/);
  assert.match(message, /read_file/);
  assert.match(message, /package\.json/);
  assert.match(message, /状态: 成功/);
});

test('formatInputBar renders a static input line', () => {
  const input = formatInputBar('hello');

  assert.equal(input, '> hello');
});

test('renderTranscript supports visible character reveal', () => {
  const output = renderTranscript([
    {
      type: 'debug',
      payload: [{ role: 'user', content: 'hello' }],
      visibleChars: 8,
    },
  ], 120);

  assert.equal(output, '[发送给模型]\n');
});

test('sliceVisibleText counts unicode characters safely', () => {
  assert.equal(sliceVisibleText('你好abc', 3), '你好a');
});
