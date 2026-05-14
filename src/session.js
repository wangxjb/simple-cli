/**
 * 创建一个新的会话对象。
 * @param {string} systemPrompt 系统提示词。
 * @returns {{ messages: Array<{ role: string, content: string }> }}
 */
function createSession(systemPrompt) {
  return {
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
    ],
  };
}

/**
 * 向会话中追加用户消息。
 * @param {{ messages: Array<{ role: string, content: string }> }} session 会话对象。
 * @param {string} content 用户输入内容。
 * @returns {{ role: string, content: string }} 新增消息对象。
 */
function appendUserMessage(session, content) {
  const message = {
    role: 'user',
    content,
  };
  session.messages.push(message);
  return message;
}

/**
 * 向会话中追加助手消息。
 * @param {{ messages: Array<{ role: string, content: string }> }} session 会话对象。
 * @param {string} content 助手回复内容。
 * @returns {{ role: string, content: string }} 新增消息对象。
 */
function appendAssistantMessage(session, content) {
  const message = {
    role: 'assistant',
    content,
  };
  session.messages.push(message);
  return message;
}

/**
 * 获取可发送给模型的消息列表。
 * @param {{ messages: Array<{ role: string, content: string }> }} session 会话对象。
 * @returns {Array<{ role: string, content: string }>} 消息列表。
 */
function buildChatMessages(session) {
  return session.messages.slice();
}

module.exports = {
  createSession,
  appendUserMessage,
  appendAssistantMessage,
  buildChatMessages,
};
