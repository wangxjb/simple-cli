/**
 * 创建 DeepSeek 聊天客户端。
 * @param {{ apiKey: string, baseUrl: string, model: string, proxyUrl?: string, fetchImpl?: typeof fetch, retryCount?: number, timeoutMs?: number }} config 配置对象。
 * @returns {{
 *   chat: (messages: Array<{role: string, content: string}>) => Promise<{content: string, reasoningContent: string}>,
 *   streamChat: (messages: Array<{role: string, content: string}>, onDelta?: (text: string) => Promise<void> | void, onReasoningDelta?: (text: string) => Promise<void> | void) => Promise<{content: string, reasoningContent: string}>
 * }}
 */
function createDeepSeekClient(config) {
  const baseUrl = config.baseUrl.replace(/\/$/, '');
  const endpoint = `${baseUrl}/chat/completions`;
  const proxyUrl = String(config.proxyUrl || '').trim();
  const proxyRuntime = proxyUrl ? createProxyRuntime(proxyUrl) : null;
  const fetchImpl = config.fetchImpl || proxyRuntime?.fetch || globalThis.fetch;
  const dispatcher = proxyRuntime?.dispatcher;
  const retryCount = Number.isInteger(config.retryCount) ? config.retryCount : 1;
  const timeoutMs = Number.isInteger(config.timeoutMs) ? config.timeoutMs : 60000;

  if (typeof fetchImpl !== 'function') {
    throw new Error('当前 Node.js 运行时不支持 fetch，请使用 Node.js 18 或更高版本。');
  }

  /**
   * 创建代理请求运行时。
   * @param {string} url 代理地址。
   * @returns {{ fetch: typeof fetch, dispatcher: unknown }} 代理运行时。
   */
  function createProxyRuntime(url) {
    try {
      const { fetch: undiciFetch, ProxyAgent } = require('undici');
      return {
        fetch: undiciFetch,
        dispatcher: new ProxyAgent(url),
      };
    } catch (error) {
      throw new Error(`当前项目缺少 undici 代理能力，无法使用代理 ${url}：${error.message}`);
    }
  }

  /**
   * 等待指定毫秒数。
   * @param {number} ms 等待时长。
   * @returns {Promise<void>} 等待完成后的 Promise。
   */
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 判断是否属于可重试的网络错误。
   * @param {unknown} error 异常对象。
   * @returns {boolean} 是否可重试。
   */
  function isRetryableNetworkError(error) {
    if (!error) {
      return false;
    }

    const message = String(error.message || error);
    return error.name === 'TypeError'
      || error.name === 'AbortError'
      || /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket|network/i.test(message);
  }

  /**
   * 创建带上下文的请求错误。
   * @param {unknown} error 原始异常。
   * @param {number} attempts 已尝试次数。
   * @returns {Error} 包装后的异常。
   */
  function createNetworkError(error, attempts) {
    const cause = error?.cause;
    const causeCode = cause?.code ? `，底层错误码：${cause.code}` : '';
    const causeMessage = cause?.message ? `，底层原因：${cause.message}` : '';
    const originalMessage = error?.message ? `，原始错误：${error.message}` : '';

    return new Error(
      `DeepSeek 网络请求失败，已尝试 ${attempts} 次。请检查网络、代理或 DEEPSEEK_BASE_URL 配置${causeCode}${causeMessage}${originalMessage}`
    );
  }

  /**
   * 发送带超时和轻量重试的请求。
   * @param {object} body 请求体。
   * @returns {Promise<Response>} HTTP 响应。
   */
  async function fetchWithRetry(body) {
    let lastError;

    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        return await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
          ...(dispatcher ? { dispatcher } : {}),
        });
      } catch (error) {
        lastError = error;
        if (attempt >= retryCount || !isRetryableNetworkError(error)) {
          throw createNetworkError(error, attempt + 1);
        }
        await sleep(300 * (attempt + 1));
      } finally {
        clearTimeout(timeout);
      }
    }

    throw createNetworkError(lastError, retryCount + 1);
  }

  /**
   * 处理聊天响应。
   * @param {Array<{role: string, content: string}>} messages 消息列表。
   * @param {boolean} stream 是否使用流式输出。
   * @param {(text: string) => Promise<void> | void} [onDelta] 内容增量回调。
   * @param {(text: string) => Promise<void> | void} [onReasoningDelta] 思考过程增量回调。
   * @returns {Promise<{content: string, reasoningContent: string}>} 模型回复。
   */
  async function request(messages, stream, onDelta, onReasoningDelta) {
    const response = await fetchWithRetry({
      model: config.model,
      messages,
      stream,
      thinking: { type: 'enabled' },
      stream_options: stream ? { include_usage: true } : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek 请求失败：${response.status} ${response.statusText}\n${errorText}`);
    }

    if (!stream) {
      const data = await response.json();
      const choice = data?.choices?.[0];
      const message = choice?.message || {};

      return {
        content: String(message.content || ''),
        reasoningContent: String(message.reasoning_content || ''),
      };
    }

    if (!response.body) {
      throw new Error('DeepSeek 流式响应不可用。');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let content = '';
    let reasoningContent = '';

    /**
     * 处理一行 SSE 数据。
     * @param {string} dataLine SSE 行。
     * @returns {Promise<boolean>} 是否继续处理。
     */
    async function handleDataLine(dataLine) {
      const payload = dataLine.slice(6).trim();
      if (!payload || payload === '[DONE]') {
        return false;
      }

      const chunk = JSON.parse(payload);
      const delta = chunk?.choices?.[0]?.delta || {};
      const deltaContent = String(delta.content || '');
      const deltaReasoning = String(delta.reasoning_content || '');

      if (deltaReasoning) {
        reasoningContent += deltaReasoning;
        await onReasoningDelta?.(deltaReasoning);
      }

      if (deltaContent) {
        content += deltaContent;
        await onDelta?.(deltaContent);
      }

      return true;
    }

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

      let lineBreakIndex = buffer.indexOf('\n');
      while (lineBreakIndex !== -1) {
        const line = buffer.slice(0, lineBreakIndex).replace(/\r$/, '');
        buffer = buffer.slice(lineBreakIndex + 1);

        if (line.startsWith('data:')) {
          const shouldContinue = await handleDataLine(line);
          if (!shouldContinue) {
            return { content, reasoningContent };
          }
        }

        lineBreakIndex = buffer.indexOf('\n');
      }

      if (done) {
        break;
      }
    }

    return { content, reasoningContent };
  }

  return {
    /**
     * 发送对话消息到 DeepSeek。
     * @param {Array<{role: string, content: string}>} messages 消息列表。
     * @returns {Promise<{content: string, reasoningContent: string}>} 模型回复。
     */
    chat(messages) {
      return request(messages, false);
    },

    /**
     * 以流式方式发送对话消息到 DeepSeek。
     * @param {Array<{role: string, content: string}>} messages 消息列表。
     * @param {(text: string) => Promise<void> | void} [onDelta] 接收内容增量文本的回调。
     * @param {(text: string) => Promise<void> | void} [onReasoningDelta] 接收思考过程增量文本的回调。
     * @returns {Promise<{content: string, reasoningContent: string}>} 最终模型回复。
     */
    streamChat(messages, onDelta, onReasoningDelta) {
      return request(messages, true, onDelta, onReasoningDelta);
    },
  };
}

module.exports = {
  createDeepSeekClient,
};
