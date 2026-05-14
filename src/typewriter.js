/**
 * 创建一个打字机输出器。
 * @param {{ write: (chunk: string) => void }} output 输出接口。
 * @param {{ intervalMs?: number }} [options] 配置项。
 * @returns {{ write: (text: string) => Promise<void>, newline: () => void }}
 */
function createTypewriter(output, options = {}) {
  const intervalMs = options.intervalMs ?? 18;

  /**
   * 延迟指定毫秒数。
   * @param {number} ms 延迟时长。
   * @returns {Promise<void>} 延迟完成的 Promise。
   */
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  return {
    /**
     * 逐字符输出文本。
     * @param {string} text 待输出文本。
     * @returns {Promise<void>} 输出完成后的 Promise。
     */
    async write(text) {
      for (const char of text) {
        output.write(char);
        if (intervalMs > 0) {
          await sleep(intervalMs);
        }
      }
    },

    /**
     * 输出换行。
     */
    newline() {
      output.write('\n');
    },
  };
}

module.exports = {
  createTypewriter,
};
