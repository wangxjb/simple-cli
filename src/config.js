const fs = require('node:fs');
const path = require('node:path');

/**
 * 读取 DeepSeek CLI 所需配置。
 * @param {NodeJS.ProcessEnv} env 环境变量对象。
 * @param {{ localConfigPath?: string, readLocalConfig?: boolean }} [options] 读取选项。
 * @returns {{ apiKey: string, baseUrl: string, model: string, proxyUrl: string }}
 * @throws {Error} 当缺少必要的 API Key 时抛出异常。
 */
function loadConfig(env = process.env, options = {}) {
  const localConfig = options.readLocalConfig === false
    ? {}
    : readLocalConfig(options.localConfigPath || path.join(process.cwd(), 'config.local.json'));

  const apiKey = readConfigValue(env.DEEPSEEK_API_KEY, localConfig.apiKey);
  if (!apiKey) {
    throw new Error('缺少 DEEPSEEK_API_KEY，请先通过环境变量或 config.local.json 配置。');
  }

  return {
    apiKey,
    baseUrl: readConfigValue(env.DEEPSEEK_BASE_URL, localConfig.baseUrl) || 'https://api.deepseek.com',
    model: readConfigValue(env.DEEPSEEK_MODEL, localConfig.model) || 'deepseek-v4-flash',
    proxyUrl: readConfigValue(
      env.DEEPSEEK_PROXY,
      localConfig.proxyUrl,
      env.HTTPS_PROXY,
      env.HTTP_PROXY
    ),
  };
}

/**
 * 读取本地配置文件。
 * @param {string} configPath 配置文件路径。
 * @returns {{ apiKey?: string, baseUrl?: string, model?: string, proxyUrl?: string }} 配置对象。
 */
function readLocalConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

/**
 * 按优先级读取第一个非空配置值。
 * @param {...unknown} values 候选值。
 * @returns {string} 配置值。
 */
function readConfigValue(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) {
      return text;
    }
  }
  return '';
}

module.exports = {
  loadConfig,
  readLocalConfig,
};
