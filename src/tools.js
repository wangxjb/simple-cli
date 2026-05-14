const fs = require('node:fs/promises');
const path = require('node:path');

const SKIPPED_DIRS = new Set(['.git', 'node_modules']);

/**
 * Execute a read-only local tool call.
 * @param {{ tool: string, args?: Record<string, unknown> }} call Tool call.
 * @param {string} cwd Workspace root.
 * @returns {Promise<{ ok: boolean, tool: string, content: string, path?: string }>} Tool result.
 */
async function executeToolCall(call, cwd = process.cwd()) {
  try {
    if (call.tool === 'read_file') {
      return await readFileTool(call.args || {}, cwd);
    }
    if (call.tool === 'list_files') {
      return await listFilesTool(call.args || {}, cwd);
    }
    if (call.tool === 'search_text') {
      return await searchTextTool(call.args || {}, cwd);
    }

    return {
      ok: false,
      tool: call.tool,
      content: `Unknown tool: ${call.tool}`,
    };
  } catch (error) {
    return {
      ok: false,
      tool: call.tool,
      content: error.message,
    };
  }
}

/**
 * Read a file inside the workspace.
 * @param {Record<string, unknown>} args Tool args.
 * @param {string} cwd Workspace root.
 * @returns {Promise<{ ok: boolean, tool: string, content: string, path: string }>} Tool result.
 */
async function readFileTool(args, cwd) {
  const filePath = resolveWorkspacePath(String(args.path || ''), cwd);
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error('Path is not a file.');
  }

  const content = await fs.readFile(filePath, 'utf8');
  return {
    ok: true,
    tool: 'read_file',
    path: filePath,
    content: content.slice(0, 120000),
  };
}

/**
 * List files inside the workspace.
 * @param {Record<string, unknown>} args Tool args.
 * @param {string} cwd Workspace root.
 * @returns {Promise<{ ok: boolean, tool: string, content: string, path: string }>} Tool result.
 */
async function listFilesTool(args, cwd) {
  const root = resolveWorkspacePath(String(args.path || '.'), cwd);
  const maxEntries = Number(args.maxEntries || 200);
  const files = [];
  await walkFiles(root, cwd, files, maxEntries);

  return {
    ok: true,
    tool: 'list_files',
    path: root,
    content: files.join('\n'),
  };
}

/**
 * Search text inside workspace files.
 * @param {Record<string, unknown>} args Tool args.
 * @param {string} cwd Workspace root.
 * @returns {Promise<{ ok: boolean, tool: string, content: string, path: string }>} Tool result.
 */
async function searchTextTool(args, cwd) {
  const query = String(args.query || '');
  if (!query) {
    throw new Error('Missing search query.');
  }

  const root = resolveWorkspacePath(String(args.path || '.'), cwd);
  const files = [];
  await walkFiles(root, cwd, files, Number(args.maxFiles || 200));

  const matches = [];
  for (const relativeFile of files) {
    const absoluteFile = path.join(cwd, relativeFile);
    let content = '';
    try {
      content = await fs.readFile(absoluteFile, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].includes(query)) {
        matches.push(`${relativeFile}:${index + 1}: ${lines[index]}`);
      }
    }
  }

  return {
    ok: true,
    tool: 'search_text',
    path: root,
    content: matches.slice(0, 200).join('\n') || 'No matches.',
  };
}

/**
 * Resolve and validate a workspace path.
 * @param {string} input User-provided path.
 * @param {string} cwd Workspace root.
 * @returns {string} Absolute path.
 */
function resolveWorkspacePath(input, cwd) {
  if (!input) {
    throw new Error('Missing path.');
  }

  const root = path.resolve(cwd);
  const target = path.resolve(root, input);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path is outside workspace.');
  }
  return target;
}

/**
 * Walk workspace files recursively with a hard entry limit.
 * @param {string} root Absolute root.
 * @param {string} cwd Workspace root.
 * @param {string[]} files Output files.
 * @param {number} maxEntries Maximum entries.
 * @returns {Promise<void>} Completion.
 */
async function walkFiles(root, cwd, files, maxEntries) {
  if (files.length >= maxEntries) {
    return;
  }

  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (files.length >= maxEntries) {
      return;
    }
    if (SKIPPED_DIRS.has(entry.name)) {
      continue;
    }

    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(absolute, cwd, files, maxEntries);
    } else if (entry.isFile()) {
      files.push(path.relative(cwd, absolute));
    }
  }
}

module.exports = {
  executeToolCall,
  resolveWorkspacePath,
};
