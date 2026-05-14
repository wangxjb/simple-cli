const test = require('node:test');
const assert = require('node:assert/strict');

const { createTextViewport } = require('../src/viewport');

test('createTextViewport sticks to bottom when autoScroll is enabled', () => {
  const viewport = createTextViewport({
    content: ['a', 'b', 'c', 'd'].join('\n'),
    height: 2,
    scrollOffset: 0,
    autoScroll: true,
  });

  assert.equal(viewport.content, 'c\nd');
  assert.equal(viewport.scrollOffset, 2);
});

test('createTextViewport preserves manual scroll offset', () => {
  const viewport = createTextViewport({
    content: ['a', 'b', 'c', 'd'].join('\n'),
    height: 2,
    scrollOffset: 1,
    autoScroll: false,
  });

  assert.equal(viewport.content, 'b\nc');
  assert.equal(viewport.scrollOffset, 1);
});

test('createTextViewport clamps out-of-range offsets', () => {
  const viewport = createTextViewport({
    content: ['a', 'b'].join('\n'),
    height: 5,
    scrollOffset: 100,
    autoScroll: false,
  });

  assert.equal(viewport.content, 'a\nb');
  assert.equal(viewport.scrollOffset, 0);
});
