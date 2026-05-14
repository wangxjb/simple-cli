const test = require('node:test');
const assert = require('node:assert/strict');

const { createDeepSeekClient } = require('../src/deepseek-client');

test('chat retries transient fetch failures', async () => {
  let calls = 0;
  const client = createDeepSeekClient({
    apiKey: 'test-key',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-test',
    retryCount: 1,
    timeoutMs: 1000,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        throw new TypeError('fetch failed');
      }

      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: 'ok',
              reasoning_content: 'reason',
            },
          },
        ],
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    },
  });

  const reply = await client.chat([{ role: 'user', content: 'hello' }]);

  assert.equal(calls, 2);
  assert.equal(reply.content, 'ok');
  assert.equal(reply.reasoningContent, 'reason');
});

test('chat wraps fetch failures with actionable context', async () => {
  const client = createDeepSeekClient({
    apiKey: 'test-key',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-test',
    retryCount: 0,
    timeoutMs: 1000,
    fetchImpl: async () => {
      throw new TypeError('fetch failed');
    },
  });

  await assert.rejects(
    () => client.chat([{ role: 'user', content: 'hello' }]),
    /DeepSeek 网络请求失败，已尝试 1 次/
  );
});

test('chat passes proxy dispatcher when proxyUrl is configured', async () => {
  let dispatcherSeen = false;
  const client = createDeepSeekClient({
    apiKey: 'test-key',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-test',
    proxyUrl: 'http://127.0.0.1:7897',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.deepseek.com/chat/completions');
      dispatcherSeen = Boolean(options.dispatcher);

      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: 'ok',
            },
          },
        ],
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    },
  });

  const reply = await client.chat([{ role: 'user', content: 'hello' }]);

  assert.equal(dispatcherSeen, true);
  assert.equal(reply.content, 'ok');
});

test('streamChat exposes reasoning and content deltas', async () => {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"think","content":""}}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"","content":"answer"}}]}\n\n'));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  const contentDeltas = [];
  const reasoningDeltas = [];
  const client = createDeepSeekClient({
    apiKey: 'test-key',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-test',
    fetchImpl: async () => new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
      },
    }),
  });

  const reply = await client.streamChat(
    [{ role: 'user', content: 'hello' }],
    (chunk) => contentDeltas.push(chunk),
    (chunk) => reasoningDeltas.push(chunk)
  );

  assert.equal(reply.content, 'answer');
  assert.equal(reply.reasoningContent, 'think');
  assert.deepEqual(contentDeltas, ['answer']);
  assert.deepEqual(reasoningDeltas, ['think']);
});
