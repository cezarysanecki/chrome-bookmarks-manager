import { describe, it, expect } from 'vitest';
import { escapeHtml, escapeRegex, highlight } from '../src/lib/dom.js';

describe('escapeHtml', () => {
  it('escapes ampersand', () => expect(escapeHtml('a&b')).toBe('a&amp;b'));
  it('escapes less-than', () => expect(escapeHtml('<script>')).toBe('&lt;script&gt;'));
  it('escapes greater-than', () => expect(escapeHtml('1>0')).toBe('1&gt;0'));
  it('escapes double-quote', () => expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;'));
  it('escapes single-quote', () => expect(escapeHtml("it's")).toBe('it&#39;s'));
  it('escapes forward-slash', () => expect(escapeHtml('a/b')).toBe('a&#x2F;b'));

  it('coerces number to string', () => {
    expect(escapeHtml(42)).toBe('42');
  });

  it('coerces null to string', () => {
    expect(escapeHtml(null)).toBe('null');
  });

  it('escapes all dangerous chars in a combined string', () => {
    expect(escapeHtml('<script>alert("xss & \'test\' / end")</script>'))
      .toBe('&lt;script&gt;alert(&quot;xss &amp; &#39;test&#39; &#x2F; end&quot;)&lt;&#x2F;script&gt;');
  });
});

describe('escapeRegex', () => {
  it('escapes dot', () => expect(escapeRegex('.')).toBe('\\.'));
  it('escapes asterisk', () => expect(escapeRegex('*')).toBe('\\*'));
  it('escapes plus', () => expect(escapeRegex('+')).toBe('\\+'));
  it('escapes question mark', () => expect(escapeRegex('?')).toBe('\\?'));
  it('escapes parentheses', () => expect(escapeRegex('()')).toBe('\\(\\)'));
  it('escapes curly braces', () => expect(escapeRegex('{}')).toBe('\\{\\}'));
  it('escapes square brackets', () => expect(escapeRegex('[]')).toBe('\\[\\]'));
  it('escapes caret', () => expect(escapeRegex('^')).toBe('\\^'));
  it('escapes dollar', () => expect(escapeRegex('$')).toBe('\\$'));
  it('escapes pipe', () => expect(escapeRegex('|')).toBe('\\|'));
  it('escapes backslash', () => expect(escapeRegex('\\')).toBe('\\\\'));
  it('leaves normal chars unescaped', () => expect(escapeRegex('hello world')).toBe('hello world'));
});

describe('highlight', () => {
  it('wraps matching text in <mark>', () => {
    expect(highlight('hello world', 'hello')).toBe('<mark>hello</mark> world');
  });

  it('is case-insensitive', () => {
    expect(highlight('Hello World', 'hello')).toBe('<mark>Hello</mark> World');
  });

  it('highlights all occurrences', () => {
    expect(highlight('foo foo foo', 'foo')).toBe('<mark>foo</mark> <mark>foo</mark> <mark>foo</mark>');
  });

  it('returns escaped text when query is empty', () => {
    expect(highlight('hello', '')).toBe('hello');
  });

  it('returns escaped text when query is whitespace', () => {
    expect(highlight('hello', '   ')).toBe('hello');
  });

  it('escapes HTML in original text', () => {
    expect(highlight('<b>hello</b>', 'b')).toBe('&lt;<mark>b</mark>&gt;hello&lt;&#x2F;<mark>b</mark>&gt;');
  });

  it('handles regex special chars in query', () => {
    const result = highlight('price: $10.00', '$10.00');
    expect(result).toBe('price: <mark>$10.00</mark>');
  });
});
