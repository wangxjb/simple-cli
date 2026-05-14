const test = require('node:test');
const assert = require('node:assert/strict');

const { createSession } = require('../src/session');
const {
  runAgentTurn,
  requiresLocalContextRequest,
  buildProtocolCorrectionMessage,
  formatToolResultForModel,
} = require('../src/agent-loop');

test('runAgentTurn accepts final answers for requests that do not need local context', async () => {
  const calls = [];
  const toolResults = [];
  const session = createSession('system prompt');
  const client = {
    async streamChat(messages) {
      calls.push(messages);
      return {
        content: 'final answer',
        reasoningContent: '',
      };
    },
  };

  const result = await runAgentTurn({
    client,
    session,
    userInput: '你好',
    cwd: process.cwd(),
    onToolResult: (toolResult) => toolResults.push(toolResult),
  });

  assert.equal(result.content, 'final answer');
  assert.equal(calls.length, 1);
  assert.equal(toolResults.length, 0);
  assert.equal(calls[0].at(-1).role, 'user');
  assert.equal(calls[0].at(-1).content, '你好');
});

test('runAgentTurn rejects local-context answers that skip tool calls', async () => {
  const calls = [];
  const toolCalls = [];
  const toolResults = [];
  const session = createSession('system prompt');
  const client = {
    async streamChat(messages) {
      calls.push(messages);
      if (calls.length === 1) {
        return {
          content: 'fake package.json content',
          reasoningContent: '',
        };
      }
      if (calls.length === 2) {
        return {
          content: '{"tool":"read_file","args":{"path":"package.json"}}',
          reasoningContent: '',
        };
      }
      return {
        content: 'final answer',
        reasoningContent: '',
      };
    },
  };

  const result = await runAgentTurn({
    client,
    session,
    userInput: '查看package.json文件的内容',
    cwd: process.cwd(),
    onToolCall: (toolCall) => toolCalls.push(toolCall),
    onToolResult: (toolResult) => toolResults.push(toolResult),
  });

  assert.equal(result.content, 'final answer');
  assert.equal(calls.length, 3);
  assert.match(calls[1].at(-1).content, /Protocol correction/);
  assert.equal(toolCalls.length, 1);
  assert.equal(toolCalls[0].tool, 'read_file');
  assert.equal(toolResults.length, 1);
});

test('runAgentTurn executes model tool calls and loops until final answer', async () => {
  const calls = [];
  const payloads = [];
  const modelReplies = [];
  const toolCalls = [];
  const toolResults = [];
  const session = createSession('system prompt');
  const client = {
    async streamChat(messages) {
      calls.push(messages);
      if (calls.length === 1) {
        return {
          content: '{"tool":"list_files","args":{"path":"."}}',
          reasoningContent: 'need files',
        };
      }
      if (calls.length === 2) {
        return {
          content: '{"tool":"read_file","args":{"path":"package.json"}}',
          reasoningContent: 'need package',
        };
      }
      return {
        content: 'final answer',
        reasoningContent: 'enough info',
      };
    },
  };

  const result = await runAgentTurn({
    client,
    session,
    userInput: 'what is this project?',
    cwd: process.cwd(),
    onPayload: (payload) => payloads.push(payload),
    onModelReply: (reply) => modelReplies.push(reply),
    onToolCall: (toolCall) => toolCalls.push(toolCall),
    onToolResult: (toolResult) => toolResults.push(toolResult),
  });

  assert.equal(result.content, 'final answer');
  assert.equal(calls.length, 3);
  assert.equal(payloads.length, 3);
  assert.deepEqual(modelReplies.map((reply) => reply.reasoningContent), [
    'need files',
    'need package',
    'enough info',
  ]);
  assert.equal(toolCalls.length, 2);
  assert.equal(toolResults.length, 2);
  assert.equal(toolCalls[0].tool, 'list_files');
  assert.equal(toolCalls[1].tool, 'read_file');
  assert.match(calls[1].at(-1).content, /Tool result/);
  assert.match(calls[2].at(-1).content, /Tool result/);
});

test('runAgentTurn stops when max tool rounds is reached', async () => {
  const session = createSession('system prompt');
  const client = {
    async streamChat() {
      return {
        content: '{"tool":"list_files","args":{"path":"."}}',
        reasoningContent: '',
      };
    },
  };

  const result = await runAgentTurn({
    client,
    session,
    userInput: 'keep looping',
    cwd: process.cwd(),
    maxToolRounds: 0,
  });

  assert.match(result.content, /工具调用达到最大轮次/);
});

test('requiresLocalContextRequest detects obvious local context requests', () => {
  assert.equal(requiresLocalContextRequest('查看package.json文件的内容'), true);
  assert.equal(requiresLocalContextRequest('列出当前目录下所有文件'), true);
  assert.equal(requiresLocalContextRequest('read package.json file content'), true);
  assert.equal(requiresLocalContextRequest('你好'), false);
});

test('buildProtocolCorrectionMessage asks the model for a tool JSON object', () => {
  const message = buildProtocolCorrectionMessage('查看package.json文件的内容');

  assert.match(message, /Protocol correction/);
  assert.match(message, /requires local project context/);
  assert.match(message, /exactly one valid tool JSON object/);
  assert.match(message, /read_file/);
});

test('formatToolResultForModel tells the model to continue or finalize', () => {
  const content = formatToolResultForModel(
    { tool: 'read_file', args: { path: 'package.json' } },
    { ok: true, tool: 'read_file', path: 'package.json', content: '{}' }
  );

  assert.match(content, /Tool result/);
  assert.match(content, /read_file/);
  assert.match(content, /output exactly one tool JSON object/);
  assert.match(content, /final answer/);
});
