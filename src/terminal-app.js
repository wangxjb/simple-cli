const blessed = require('blessed');
const { loadConfig } = require('./config');
const { buildSystemPrompt } = require('./prompt');
const { createSession } = require('./session');
const { createDeepSeekClient } = require('./deepseek-client');
const { runAgentTurn } = require('./agent-loop');
const { createTypewriter } = require('./typewriter');
const { createTextViewport } = require('./viewport');
const {
  parseAssistantOutput,
  renderTranscript,
  formatTranscriptMessage,
  formatInputBar,
} = require('./ui');

/**
 * 创建全屏终端应用。
 * @returns {{ start: () => Promise<void> }} 应用实例。
 */
function createTerminalApp() {
  const config = loadConfig(process.env);
  const client = createDeepSeekClient(config);
  const session = createSession(buildSystemPrompt());

  const state = {
    status: 'Ready',
    messages: [],
    input: '',
    autoScroll: true,
    scrollOffset: 0,
  };

  let pending = false;
  let assistantIndex = -1;
  let activeToolIndex = -1;
  let typedAnswer = '';
  let spinnerTimer = null;
  let spinnerIndex = 0;

  const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  const screen = blessed.screen({
    smartCSR: false,
    fullUnicode: true,
    warnings: false,
  });
  const originalShowCursor = screen.program.showCursor.bind(screen.program);

  const header = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    style: {
      fg: 'white',
      bg: '#0f172a',
      border: {
        fg: '#334155',
      },
    },
    border: {
      type: 'line',
    },
    tags: false,
  });

  const transcript = blessed.box({
    parent: screen,
    top: 3,
    bottom: 3,
    left: 0,
    right: 0,
    scrollable: false,
    alwaysScroll: false,
    keys: false,
    mouse: true,
    style: {
      fg: 'white',
      bg: '#020617',
      border: {
        fg: '#334155',
      },
    },
    border: {
      type: 'line',
    },
    padding: {
      left: 1,
      right: 1,
      top: 1,
      bottom: 1,
    },
    tags: false,
  });

  const inputBar = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    style: {
      fg: 'white',
      bg: '#0f172a',
      border: {
        fg: '#22d3ee',
      },
    },
    border: {
      type: 'line',
    },
    padding: {
      left: 1,
      right: 1,
      top: 0,
      bottom: 0,
    },
    tags: false,
  });

  const typewriter = createTypewriter({
    write: (chunk) => {
      typedAnswer += chunk;
      updateAssistantMessage({
        answer: typedAnswer,
        pending: true,
      });
    },
  }, { intervalMs: 12 });

  /**
   * 等待指定毫秒数。
   * @param {number} ms 等待时长。
   * @returns {Promise<void>} 等待完成后的 Promise。
   */
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 获取单条消息的完整可见字符数。
   * @param {Record<string, unknown>} message 消息对象。
   * @returns {number} 字符数。
   */
  function getMessageVisibleLength(message) {
    return Array.from(formatTranscriptMessage({
      ...message,
      visibleChars: undefined,
    })).length;
  }

  /**
   * 以打字机效果展示指定消息。
   * @param {number} index 消息索引。
   * @param {{ step?: number, intervalMs?: number }} [options] 动画配置。
   * @returns {Promise<void>} 动画完成后的 Promise。
   */
  async function revealMessage(index, options = {}) {
    const step = options.step || 18;
    const intervalMs = options.intervalMs ?? 4;
    const message = state.messages[index];
    if (!message) {
      return;
    }

    const total = getMessageVisibleLength(message);
    message.visibleChars = 0;
    renderAll();

    while (message.visibleChars < total) {
      message.visibleChars = Math.min(total, message.visibleChars + step);
      renderAll();
      if (intervalMs > 0) {
        await sleep(intervalMs);
      }
    }

    delete message.visibleChars;
    renderAll();
  }

  /**
   * 强制隐藏终端光标。
   */
  function forceHideCursor() {
    screen.program.cursorHidden = true;
    screen.program.hideCursor();
    screen.program._write('\x1b[?25l');
  }

  /**
   * 刷新顶部状态栏。
   */
  function renderHeader() {
    header.setContent(
      ` Minimal Codex CLI    ${config.model}    ${state.status}\n` +
      ' Enter 发送    Esc 清空    ↑/↓ 滚动    PgUp/PgDn 翻页    End 到底部    Ctrl+C 退出'
    );
  }

  /**
   * 获取消息区可显示的内部高度。
   * @returns {number} 可见行数。
   */
  function getTranscriptViewportHeight() {
    return Math.max(1, Number(transcript.height || 1) - 4);
  }

  /**
   * 刷新中间消息区。
   */
  function renderTranscriptView() {
    const fullContent = renderTranscript(state.messages, Math.max(40, transcript.width - 4));
    const viewport = createTextViewport({
      content: fullContent,
      height: getTranscriptViewportHeight(),
      scrollOffset: state.scrollOffset,
      autoScroll: state.autoScroll,
    });

    state.scrollOffset = viewport.scrollOffset;
    transcript.setContent(viewport.content);
  }

  /**
   * 刷新底部输入栏。
   */
  function renderInputBar() {
    inputBar.setContent(formatInputBar(state.input));
  }

  /**
   * 统一刷新界面。
   */
  function renderAll() {
    renderHeader();
    renderTranscriptView();
    renderInputBar();
    screen.render();
    forceHideCursor();
  }

  /**
   * 滚动消息区，并在用户手动查看历史时暂停自动贴底。
   * @param {number | 'top' | 'bottom'} delta 滚动距离或目标位置。
   */
  function scrollTranscript(delta) {
    if (delta === 'top') {
      state.autoScroll = false;
      state.scrollOffset = 0;
    } else if (delta === 'bottom') {
      state.autoScroll = true;
    } else {
      state.autoScroll = false;
      state.scrollOffset += delta;
    }

    renderAll();
  }

  /**
   * 停止状态动画。
   */
  function stopSpinner() {
    if (spinnerTimer) {
      clearInterval(spinnerTimer);
      spinnerTimer = null;
    }
  }

  /**
   * 启动状态动画。
   * @param {string} prefix 状态前缀。
   */
  function startSpinner(prefix) {
    stopSpinner();
    state.status = `${prefix} ${spinnerFrames[spinnerIndex % spinnerFrames.length]}`;
    renderAll();
    spinnerTimer = setInterval(() => {
      spinnerIndex += 1;
      state.status = `${prefix} ${spinnerFrames[spinnerIndex % spinnerFrames.length]}`;
      renderAll();
    }, 120);
  }

  /**
   * 添加用户消息到界面。
   * @param {string} content 用户输入内容。
   */
  function addUserMessage(content) {
    state.messages.push({
      type: 'user',
      content,
    });
  }

  /**
   * 添加发送给模型的调试消息。
   * @param {Array<{ role: string, content: string }>} payload 模型请求消息。
   */
  async function addDebugMessage(payload) {
    const index = state.messages.length;
    state.messages.push({
      type: 'debug',
      payload,
    });
    await revealMessage(index, { step: 28, intervalMs: 3 });
  }

  /**
   * 添加模型原始返回消息。
   * @param {{round: number, content: string, reasoningContent?: string}} reply 模型返回。
   */
  async function addModelReplyMessage(reply) {
    const index = state.messages.length;
    state.messages.push({
      type: 'model-reply',
      round: reply.round,
      content: reply.content,
      reasoningContent: reply.reasoningContent || '',
    });
    await revealMessage(index, { step: 18, intervalMs: 5 });
  }

  /**
   * 添加工具调用消息。
   * @param {{tool: string, args: Record<string, unknown>}} call 工具调用。
   */
  async function addToolMessage(call) {
    activeToolIndex = state.messages.length;
    state.messages.push({
      type: 'tool',
      name: call.tool,
      args: call.args,
      result: null,
    });
    await revealMessage(activeToolIndex, { step: 16, intervalMs: 5 });
  }

  /**
   * 更新工具调用结果。
   * @param {{ok: boolean, content: string, path?: string}} result 工具结果。
   */
  async function updateToolMessage(result) {
    if (activeToolIndex < 0) {
      return;
    }

    const index = activeToolIndex;
    state.messages[activeToolIndex] = {
      ...state.messages[activeToolIndex],
      result,
    };
    activeToolIndex = -1;
    await revealMessage(index, { step: 30, intervalMs: 3 });
  }

  /**
   * 添加助手消息占位。
   * @param {string[]} summary 思路摘要。
   * @returns {number} 助手消息索引。
   */
  function addAssistantPlaceholder(summary) {
    assistantIndex = state.messages.length;
    state.messages.push({
      type: 'assistant',
      summary,
      answer: '',
      pending: true,
    });
    renderAll();
    return assistantIndex;
  }

  /**
   * 更新助手消息。
   * @param {{ summary?: string[], answer?: string, pending?: boolean }} patch 更新内容。
   */
  function updateAssistantMessage(patch) {
    if (assistantIndex < 0) {
      return;
    }
    state.messages[assistantIndex] = {
      ...state.messages[assistantIndex],
      ...patch,
    };
    renderAll();
  }

  /**
   * 处理提交。
   * @param {string} value 输入内容。
   * @returns {Promise<void>} 处理完成后的 Promise。
   */
  async function handleSubmit(value) {
    const inputValue = String(value || '').trim();
    if (!inputValue || pending) {
      return;
    }

    if (inputValue === '/exit' || inputValue === '/quit') {
      shutdown();
      return;
    }

    pending = true;
    assistantIndex = -1;
    activeToolIndex = -1;
    state.input = '';
    state.autoScroll = true;
    typedAnswer = '';

    addUserMessage(inputValue);
    state.status = '分析中';
    renderAll();

    try {
      startSpinner('分析中');
      const reply = await runAgentTurn({
        client,
        session,
        userInput: inputValue,
        cwd: process.cwd(),
        onPayload: addDebugMessage,
        onModelReply: addModelReplyMessage,
        onToolCall: addToolMessage,
        onToolResult: updateToolMessage,
      });
      stopSpinner();

      const parsed = parseAssistantOutput(reply.content);
      addAssistantPlaceholder(parsed.summary);

      state.status = '打字中';
      renderAll();
      await typewriter.write(parsed.answer);

      updateAssistantMessage({
        summary: parsed.summary,
        answer: typedAnswer,
        pending: false,
      });
      state.status = 'Ready';
      renderAll();
    } catch (error) {
      stopSpinner();
      if (assistantIndex < 0) {
        addAssistantPlaceholder(['请求失败']);
      }
      updateAssistantMessage({
        summary: ['请求失败'],
        answer: error.message,
        pending: false,
      });
      state.status = 'Error';
      renderAll();
    } finally {
      pending = false;
    }
  }

  /**
   * 关闭应用。
   */
  function shutdown() {
    stopSpinner();
    screen.program.showCursor = originalShowCursor;
    screen.program.showCursor();
    screen.destroy();
    process.exit(0);
  }

  /**
   * 处理按键输入。
   * @param {string} ch 按键字符。
   * @param {{ name?: string, sequence?: string, ctrl?: boolean, meta?: boolean }} key 按键信息。
   */
  async function onKeypress(ch, key) {
    if (key?.ctrl && key.name === 'c') {
      shutdown();
      return;
    }

    if (key?.name === 'pageup') {
      scrollTranscript(-getTranscriptViewportHeight());
      return;
    }

    if (key?.name === 'pagedown') {
      scrollTranscript(getTranscriptViewportHeight());
      return;
    }

    if (key?.name === 'up') {
      scrollTranscript(-3);
      return;
    }

    if (key?.name === 'down') {
      scrollTranscript(3);
      return;
    }

    if (key?.name === 'home') {
      scrollTranscript('top');
      return;
    }

    if (key?.name === 'end') {
      scrollTranscript('bottom');
      return;
    }

    if (pending) {
      return;
    }

    if (key?.name === 'return') {
      await handleSubmit(state.input);
      return;
    }

    if (key?.name === 'backspace') {
      state.input = state.input.slice(0, -1);
      renderInputBar();
      screen.render();
      forceHideCursor();
      return;
    }

    if (key?.name === 'escape') {
      state.input = '';
      renderInputBar();
      screen.render();
      forceHideCursor();
      return;
    }

    if (ch && !key?.ctrl && !key?.meta) {
      state.input += ch;
      renderInputBar();
      screen.render();
      forceHideCursor();
    }
  }

  /**
   * 启动应用。
   * @returns {Promise<void>} 启动结果。
   */
  async function start() {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error('当前终端不支持全屏交互模式。');
    }

    screen.program.showCursor = () => {
      forceHideCursor();
      return undefined;
    };
    forceHideCursor();
    screen.key(['C-c'], shutdown);
    screen.on('keypress', onKeypress);
    screen.on('resize', renderAll);
    transcript.on('wheelup', () => scrollTranscript(-5));
    transcript.on('wheeldown', () => scrollTranscript(5));

    renderAll();
  }

  return {
    start,
  };
}

module.exports = {
  createTerminalApp,
};
