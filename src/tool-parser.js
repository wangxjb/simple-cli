/**
 * Parse a model-authored tool call from text.
 * @param {string} text Model output.
 * @returns {{ tool: string, args: Record<string, unknown> } | null} Parsed tool call.
 */
function parseToolCall(text) {
  const source = String(text || '').trim();
  if (!source) {
    return null;
  }

  const candidates = [
    ...extractFencedJson(source),
    source,
  ];

  for (const candidate of candidates) {
    const parsed = parseJsonObject(candidate);
    if (parsed && isToolCall(parsed)) {
      return {
        tool: parsed.tool,
        args: parsed.args || {},
      };
    }
  }

  return null;
}

/**
 * Extract fenced JSON blocks from model text.
 * @param {string} text Model output.
 * @returns {string[]} JSON candidates.
 */
function extractFencedJson(text) {
  const blocks = [];
  const pattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match = pattern.exec(text);
  while (match) {
    blocks.push(match[1].trim());
    match = pattern.exec(text);
  }
  return blocks;
}

/**
 * Parse a JSON object if possible.
 * @param {string} text JSON text.
 * @returns {Record<string, unknown> | null} Parsed object.
 */
function parseJsonObject(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/**
 * Check whether an object is a tool call.
 * @param {Record<string, unknown>} value Parsed object.
 * @returns {boolean} True when valid.
 */
function isToolCall(value) {
  return typeof value.tool === 'string'
    && value.tool.length > 0
    && (value.args == null || (typeof value.args === 'object' && !Array.isArray(value.args)));
}

module.exports = {
  parseToolCall,
  extractFencedJson,
};
