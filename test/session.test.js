const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSession,
  appendUserMessage,
  appendAssistantMessage,
  buildChatMessages,
} = require('../src/session');

test('createSession starts with the system prompt', () => {
  const session = createSession('你是一个代码助手');

  assert.deepEqual(session.messages, [
    { role: 'system', content: '你是一个代码助手' },
  ]);
});

test('appendUserMessage and appendAssistantMessage preserve turn history', () => {
  const session = createSession('你是一个代码助手');
  appendUserMessage(session, '帮我写一个函数');
  appendAssistantMessage(session, '当然，可以。');

  assert.deepEqual(buildChatMessages(session), [
    { role: 'system', content: '你是一个代码助手' },
    { role: 'user', content: '帮我写一个函数' },
    { role: 'assistant', content: '当然，可以。' },
  ]);
});
