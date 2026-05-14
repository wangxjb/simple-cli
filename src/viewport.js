/**
 * 根据完整文本和滚动状态计算当前可见窗口。
 * @param {{ content: string, height: number, scrollOffset: number, autoScroll: boolean }} options 视口参数。
 * @returns {{ content: string, scrollOffset: number, maxOffset: number, totalLines: number }} 视口结果。
 */
function createTextViewport(options) {
  const lines = String(options.content || '').split(/\r?\n/);
  const height = Math.max(1, Number(options.height || 1));
  const maxOffset = Math.max(0, lines.length - height);
  const requestedOffset = options.autoScroll ? maxOffset : Number(options.scrollOffset || 0);
  const scrollOffset = Math.min(maxOffset, Math.max(0, requestedOffset));
  const visibleLines = lines.slice(scrollOffset, scrollOffset + height);

  return {
    content: visibleLines.join('\n'),
    scrollOffset,
    maxOffset,
    totalLines: lines.length,
  };
}

module.exports = {
  createTextViewport,
};
