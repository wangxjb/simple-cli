const test = require('node:test');
const assert = require('node:assert/strict');

const { loadConfig } = require('../src/config');

test('loadConfig reads DeepSeek settings from environment', () => {
  const config = loadConfig(
    {
      DEEPSEEK_API_KEY: '  test-key  ',
      DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
      DEEPSEEK_MODEL: 'deepseek-v4-flash',
      DEEPSEEK_PROXY: 'http://127.0.0.1:7897',
    },
    {
      readLocalConfig: false,
    }
  );

  assert.equal(config.apiKey, 'test-key');
  assert.equal(config.baseUrl, 'https://api.deepseek.com');
  assert.equal(config.model, 'deepseek-v4-flash');
  assert.equal(config.proxyUrl, 'http://127.0.0.1:7897');
});

test('loadConfig throws when the API key is missing', () => {
  assert.throws(() => loadConfig({}, { readLocalConfig: false }), /DEEPSEEK_API_KEY/);
});

test('loadConfig reads settings from local config file', () => {
  const config = loadConfig(
    {},
    {
      localConfigPath: 'test/fixtures/config.local.test.json',
    }
  );

  assert.equal(config.apiKey, 'local-test-key');
  assert.equal(config.baseUrl, 'https://api.deepseek.com');
  assert.equal(config.model, 'deepseek-v4-flash');
  assert.equal(config.proxyUrl, 'http://127.0.0.1:7897');
});
