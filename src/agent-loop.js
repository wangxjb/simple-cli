const { appendUserMessage, appendAssistantMessage, buildChatMessages } = require('./session');
const { parseToolCall } = require('./tool-parser');
const { executeToolCall } = require('./tools');

/**
 * 运行一个由模型驱动的工具调用循环。
 * @param {{
 *   client: { streamChat: (messages: Array<{role: string, content: string}>, onDelta?: (text: string) => Promise<void> | void) => Promise<{content: string, reasoningContent?: string}> },
 *   session: { messages: Array<{ role: string, content: string }> },
 *   userInput: string,
 *   cwd?: string,
 *   maxToolRounds?: number,
 *   onPayload?: (payload: Array<{role: string, content: string}>) => void,
 *   onModelReply?: (reply: {round: number, content: string, reasoningContent?: string}) => void,
 *   onToolCall?: (call: {tool: string, args: Record<string, unknown>}) => void,
 *   onToolResult?: (result: {ok: boolean, tool: string, content: string, path?: string}) => void
 * }} options Agent 配置。
 * @returns {Promise<{ content: string, reasoningContent?: string }>} 最终模型回复。
 */
async function runAgentTurn(options) {
  const {
    client,
    session,
    userInput,
    cwd = process.cwd(),
    maxToolRounds = 3,
    onPayload,
    onModelReply,
    onToolCall,
    onToolResult,
  } = options;

  appendUserMessage(session, userInput);
  let toolCallsThisTurn = 0;

  for (let round = 0; round <= maxToolRounds; round += 1) {
    const payload = buildChatMessages(session);
    await onPayload?.(payload);

    const reply = await client.streamChat(payload, async () => {});
    await onModelReply?.({
      round,
      content: reply.content,
      reasoningContent: reply.reasoningContent || '',
    });
    const toolCall = parseToolCall(reply.content);

    if (!toolCall) {
      if (toolCallsThisTurn === 0 && requiresLocalContextRequest(userInput)) {
        session.messages.push({
          role: 'user',
          content: buildProtocolCorrectionMessage(userInput),
        });
        continue;
      }

      appendAssistantMessage(session, reply.content);
      return reply;
    }

    toolCallsThisTurn += 1;
    await runToolCall({
      session,
      call: toolCall,
      cwd,
      onToolCall,
      onToolResult,
    });
  }

  const finalContent = [
    '【思路摘要】',
    '- 工具调用达到最大轮次，已停止继续执行。',
    '',
    '【回复】',
    '工具调用达到最大轮次，未得到最终回答。请缩小问题范围或提高最大工具轮次。',
  ].join('\n');
  appendAssistantMessage(session, finalContent);
  return {
    content: finalContent,
    reasoningContent: '',
  };
}

/**
 * 判断用户请求是否明显需要读取本地上下文。
 * @param {string} userInput 用户输入。
 * @returns {boolean} 是否需要本地上下文。
 */
function requiresLocalContextRequest(userInput) {
  const text = String(userInput || '').trim();
  if (!text) {
    return false;
  }

  const hasLocalAction = /(查看|读取|打开|显示|展示|列出|搜索|查找|分析|总结|read|show|open|display|list|search|find|inspect|analyze|summarize)/i.test(text);
  const hasLocalTarget = /(当前目录|目录|文件|源码|代码|项目|package\.json|src|test|\.js|\.json|\.md)/i.test(text);
  return hasLocalAction && hasLocalTarget;
}

/**
 * 构造协议纠正消息，要求模型先返回工具调用。
 * @param {string} userInput 用户输入。
 * @returns {string} 纠正消息。
 */
function buildProtocolCorrectionMessage(userInput) {
  return [
    'Protocol correction:',
    `The user request "${userInput}" requires local project context.`,
    'Your previous response attempted to answer without a tool result, which is not allowed because it may hallucinate local file contents.',
    'Return exactly one valid tool JSON object now, with no Markdown and no explanation.',
    'Examples:',
    '{"tool":"read_file","args":{"path":"package.json"}}',
    '{"tool":"list_files","args":{"path":"."}}',
  ].join('\n');
}

/**
 * 执行模型请求的工具调用，并把工具结果写回会话。
 * @param {{
 *   session: { messages: Array<{ role: string, content: string }> },
 *   call: {tool: string, args: Record<string, unknown>},
 *   cwd: string,
 *   onToolCall?: (call: {tool: string, args: Record<string, unknown>}) => void,
 *   onToolResult?: (result: {ok: boolean, tool: string, content: string, path?: string}) => void
 * }} options 工具执行配置。
 * @returns {Promise<{ok: boolean, tool: string, content: string, path?: string}>} 工具结果。
 */
async function runToolCall(options) {
  const {
    session,
    call,
    cwd,
    onToolCall,
    onToolResult,
  } = options;

  await onToolCall?.(call);
  const toolResult = await executeToolCall(call, cwd);
  await onToolResult?.(toolResult);

  appendAssistantMessage(session, JSON.stringify(call));
  session.messages.push({
    role: 'user',
    content: formatToolResultForModel(call, toolResult),
  });

  return toolResult;
}

/**
 * 格式化工具结果，作为模型可读上下文。
 * @param {{tool: string, args: Record<string, unknown>}} call 工具调用。
 * @param {{ok: boolean, tool: string, content: string, path?: string}} result 工具结果。
 * @returns {string} 消息内容。
 */
function formatToolResultForModel(call, result) {
  return [
    'Tool result:',
    JSON.stringify({
      tool: call.tool,
      args: call.args,
      ok: result.ok,
      path: result.path,
      content: result.content,
    }, null, 2),
    'Continue the loop. If you need another tool, output exactly one tool JSON object. If you have enough information, output the final answer in Chinese.',
  ].join('\n');
}

module.exports = {
  runAgentTurn,
  runToolCall,
  requiresLocalContextRequest,
  buildProtocolCorrectionMessage,
  formatToolResultForModel,
};
