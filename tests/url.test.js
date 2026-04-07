import { describe, it, expect } from 'vitest';
import { normalizeUrl, cleanTrackingParams, urlHostname, isAllowedProtocol } from '../src/lib/url.js';

describe('normalizeUrl', () => {
  it('returns lowercase URL', () => {
    expect(normalizeUrl('HTTPS://EXAMPLE.COM/PATH')).toBe('https://example.com/path');
  });

  it('strips www. from hostname', () => {
    expect(normalizeUrl('https://www.example.com/page')).toBe('https://example.com/page');
  });

  it('strips UTM tracking parameters', () => {
    const url = 'https://example.com/page?utm_source=google&utm_medium=cpc';
    expect(normalizeUrl(url)).toBe('https://example.com/page');
  });

  it('strips known tracking parameters (fbclid, gclid)', () => {
    const url = 'https://example.com/?fbclid=abc123&gclid=xyz';
    expect(normalizeUrl(url)).toBe('https://example.com/');
  });

  it('strips URL fragment (#hash)', () => {
    expect(normalizeUrl('https://example.com/page#section')).toBe('https://example.com/page');
  });

  it('strips trailing slash from path', () => {
    expect(normalizeUrl('https://example.com/page/')).toBe('https://example.com/page');
  });

  it('keeps root path as /', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('preserves functional query params', () => {
    expect(normalizeUrl('https://example.com/search?q=hello')).toBe('https://example.com/search?q=hello');
  });

  it('returns lowercased string for unparsable URL', () => {
    expect(normalizeUrl('  NOT A URL  ')).toBe('not a url');
  });

  it('treats www and non-www as the same URL', () => {
    const a = normalizeUrl('https://www.github.com/user/repo');
    const b = normalizeUrl('https://github.com/user/repo');
    expect(a).toBe(b);
  });
});

describe('cleanTrackingParams', () => {
  it('removes UTM parameters', () => {
    const result = cleanTrackingParams('https://example.com/?utm_source=email&utm_campaign=summer');
    expect(result).toBe('https://example.com/');
  });

  it('removes fbclid', () => {
    const result = cleanTrackingParams('https://example.com/?fbclid=abc');
    expect(result).toBe('https://example.com/');
  });

  it('removes gclid and gbraid', () => {
    const result = cleanTrackingParams('https://example.com/?gclid=x&gbraid=y&page=1');
    expect(result).toBe('https://example.com/?page=1');
  });

  it('preserves non-tracking params', () => {
    const result = cleanTrackingParams('https://example.com/?q=search&page=2');
    expect(result).toBe('https://example.com/?q=search&page=2');
  });

  it('returns original string for unparsable URL', () => {
    expect(cleanTrackingParams('not-a-url')).toBe('not-a-url');
  });
});

describe('urlHostname', () => {
  it('returns hostname without www', () => {
    expect(urlHostname('https://www.github.com/user')).toBe('github.com');
  });

  it('returns hostname for non-www URL', () => {
    expect(urlHostname('https://example.com/path')).toBe('example.com');
  });

  it('returns empty string for invalid URL', () => {
    expect(urlHostname('not a url')).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(urlHostname('')).toBe('');
  });
});

describe('isAllowedProtocol', () => {
  it('allows http:', () => expect(isAllowedProtocol('http://example.com')).toBe(true));
  it('allows https:', () => expect(isAllowedProtocol('https://example.com')).toBe(true));
  it('allows ftp:', () => expect(isAllowedProtocol('ftp://example.com')).toBe(true));
  it('allows file:', () => expect(isAllowedProtocol('file:///home/user/file.html')).toBe(true));
  it('rejects javascript:', () => expect(isAllowedProtocol('javascript:alert(1)')).toBe(false));
  it('rejects data:', () => expect(isAllowedProtocol('data:text/html,<h1>hi</h1>')).toBe(false));
  it('rejects chrome:', () => expect(isAllowedProtocol('chrome://settings')).toBe(false));
  it('rejects invalid URL', () => expect(isAllowedProtocol('not-a-url')).toBe(false));
});
