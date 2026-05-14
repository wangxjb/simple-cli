/**
 * 将模型回复拆分为“思路摘要”和“回复”两部分。
 * @param {string} text 模型输出文本。
 * @returns {{ summary: string[], answer: string }} 解析结果。
 */
function parseAssistantOutput(text) {
  const content = String(text || '');
  const summaryMarker = '【思路摘要】';
  const answerMarker = '【回复】';
  const summary = [];

  const summaryStart = content.indexOf(summaryMarker);
  const answerStart = content.indexOf(answerMarker);
  let answer = content.trim();

  if (summaryStart !== -1 && answerStart !== -1 && answerStart > summaryStart) {
    const summaryBlock = content.slice(summaryStart + summaryMarker.length, answerStart).trim();
    const answerBlock = content.slice(answerStart + answerMarker.length).trim();

    for (const line of summaryBlock.split(/\r?\n/)) {
      const cleaned = line.replace(/^[\s\-•]+/, '').trim();
      if (cleaned) {
        summary.push(cleaned);
      }
    }

    answer = answerBlock;
  }

  return {
    summary,
    answer,
  };
}

/**
 * 格式化助手消息卡片。
 * @param {{ summary?: string[], answer?: string, pending?: boolean }} message 助手消息。
 * @returns {string} 格式化文本。
 */
function formatAssistantCard(message) {
  const summary = Array.isArray(message.summary) ? message.summary : [];
  const answer = String(message.answer || '').trim();
  const lines = ['[助手]', '思路摘要'];

  if (summary.length === 0) {
    lines.push(message.pending ? '- 分析中...' : '- 未提供摘要');
  } else {
    for (const item of summary) {
      lines.push(`- ${item}`);
    }
  }

  lines.push('');
  lines.push('回复');
  if (message.pending && !answer) {
    lines.push('生成中...');
  } else if (answer) {
    lines.push(...splitLines(answer));
  } else {
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 格式化用户消息卡片。
 * @param {string} content 用户输入内容。
 * @returns {string} 格式化文本。
 */
function formatUserCard(content) {
  return ['[用户]', ...splitLines(String(content || ''))].join('\n');
}

/**
 * 格式化发送给模型的调试信息。
 * @param {Array<{ role: string, content: string }>} messages 发送给模型的消息。
 * @returns {string} 调试文本。
 */
function formatModelPayload(messages) {
  return ['[发送给模型]', JSON.stringify(messages, null, 2)].join('\n');
}

/**
 * 格式化模型返回的原始信息。
 * @param {{ round?: number, content?: string, reasoningContent?: string }} message 模型返回消息。
 * @returns {string} 格式化文本。
 */
function formatModelReply(message) {
  const lines = [`[模型返回 #${Number(message.round || 0) + 1}]`, '思考过程'];
  const reasoning = String(message.reasoningContent || '').trim();
  const content = String(message.content || '').trim();

  if (reasoning) {
    lines.push(...splitLines(reasoning));
  } else {
    lines.push('(无 reasoning_content)');
  }

  lines.push('');
  lines.push('原始输出');
  if (content) {
    lines.push(...splitLines(content));
  } else {
    lines.push('(空输出)');
  }

  return lines.join('\n');
}

/**
 * 格式化工具调用消息。
 * @param {{ name?: string, args?: Record<string, unknown>, result?: { ok?: boolean, content?: string, path?: string } }} message 工具消息。
 * @returns {string} 格式化文本。
 */
function formatToolMessage(message) {
  const lines = ['[工具]', `名称: ${message.name || 'unknown'}`];

  if (message.args) {
    lines.push('参数:');
    lines.push(JSON.stringify(message.args, null, 2));
  }

  if (message.result) {
    lines.push('结果:');
    lines.push(message.result.ok ? '状态: 成功' : '状态: 失败');
    if (message.result.path) {
      lines.push(`路径: ${message.result.path}`);
    }
    lines.push(...splitLines(String(message.result.content || '')));
  } else {
    lines.push('结果: 执行中...');
  }

  return lines.join('\n');
}

/**
 * 格式化底部输入栏。
 * @param {string} content 当前输入内容。
 * @returns {string} 输入栏文本。
 */
function formatInputBar(content) {
  const value = String(content || '');
  return value ? `> ${value}` : '> ';
}

/**
 * 渲染 transcript 文本。
 * @param {Array<{ type: string, content?: string, payload?: Array<{role: string, content: string}>, summary?: string[], answer?: string, pending?: boolean, name?: string, args?: Record<string, unknown>, result?: {ok?: boolean, content?: string, path?: string}, round?: number, reasoningContent?: string }>} messages 消息列表。
 * @param {number} width 终端宽度。
 * @returns {string} 渲染后的文本。
 */
function renderTranscript(messages, width) {
  const maxWidth = Math.max(20, width || 80);
  const sections = [];

  for (const message of messages) {
    let block = formatTranscriptMessage(message);
    if (Number.isInteger(message.visibleChars)) {
      block = sliceVisibleText(block, message.visibleChars);
    }
    sections.push(wrapParagraph(block, maxWidth));
  }

  return sections.join('\n\n');
}

/**
 * 格式化单条 transcript 消息。
 * @param {{ type: string, content?: string, payload?: Array<{role: string, content: string}>, summary?: string[], answer?: string, pending?: boolean, name?: string, args?: Record<string, unknown>, result?: {ok?: boolean, content?: string, path?: string}, round?: number, reasoningContent?: string }} message 消息。
 * @returns {string} 格式化文本。
 */
function formatTranscriptMessage(message) {
  if (message.type === 'user') {
    return formatUserCard(message.content || '');
  }
  if (message.type === 'debug') {
    return formatModelPayload(message.payload || []);
  }
  if (message.type === 'model-reply') {
    return formatModelReply(message);
  }
  if (message.type === 'tool') {
    return formatToolMessage(message);
  }
  return formatAssistantCard(message);
}

/**
 * 按可见字符数截取文本。
 * @param {string} text 输入文本。
 * @param {number} count 字符数。
 * @returns {string} 截取后的文本。
 */
function sliceVisibleText(text, count) {
  return Array.from(String(text || '')).slice(0, Math.max(0, count)).join('');
}

/**
 * 将文本切分为多行。
 * @param {string} text 输入文本。
 * @returns {string[]} 行数组。
 */
function splitLines(text) {
  return String(text || '').split(/\r?\n/);
}

/**
 * 按指定宽度折行。
 * @param {string} text 输入文本。
 * @param {number} width 折行宽度。
 * @returns {string} 折行后的文本。
 */
function wrapParagraph(text, width) {
  const lines = [];

  for (const line of String(text || '').split(/\r?\n/)) {
    if (line.length === 0) {
      lines.push('');
      continue;
    }

    let buffer = '';
    for (const char of line) {
      buffer += char;
      if (buffer.length >= width) {
        lines.push(buffer);
        buffer = '';
      }
    }

    if (buffer) {
      lines.push(buffer);
    }
  }

  return lines.join('\n');
}

module.exports = {
  parseAssistantOutput,
  formatAssistantCard,
  formatUserCard,
  formatModelPayload,
  formatModelReply,
  formatToolMessage,
  formatInputBar,
  renderTranscript,
  formatTranscriptMessage,
  sliceVisibleText,
  splitLines,
  wrapParagraph,
};
