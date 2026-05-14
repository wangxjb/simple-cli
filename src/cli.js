#!/usr/bin/env node

const { createTerminalApp } = require('./terminal-app');

async function main() {
  try {
    await createTerminalApp().start();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

main();
