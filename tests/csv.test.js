import { describe, it, expect } from 'vitest';
import { csvRow, parseCsv, dateStamp } from '../src/lib/csv.js';

describe('csvRow', () => {
  it('encodes simple fields without quoting', () => {
    expect(csvRow(['hello', 'world'])).toBe('hello,world');
  });

  it('quotes fields containing a comma', () => {
    expect(csvRow(['hello, world'])).toBe('"hello, world"');
  });

  it('escapes double-quotes by doubling them', () => {
    expect(csvRow(['say "hi"'])).toBe('"say ""hi"""');
  });

  it('quotes fields containing a newline', () => {
    expect(csvRow(['line1\nline2'])).toBe('"line1\nline2"');
  });

  it('handles null/undefined as empty string', () => {
    expect(csvRow([null, undefined, 'x'])).toBe(',,x');
  });

  it('converts numbers to string', () => {
    expect(csvRow([42, 3.14])).toBe('42,3.14');
  });
});

describe('parseCsv', () => {
  it('parses simple two-row CSV', () => {
    const result = parseCsv('title,url\nGitHub,https://github.com');
    expect(result).toEqual([
      ['title', 'url'],
      ['GitHub', 'https://github.com'],
    ]);
  });

  it('strips UTF-8 BOM', () => {
    const result = parseCsv('\uFEFFtitle,url\nX,https://x.com');
    expect(result[0]).toEqual(['title', 'url']);
  });

  it('handles CRLF line endings', () => {
    const result = parseCsv('a,b\r\nc,d');
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual(['c', 'd']);
  });

  it('handles quoted fields with embedded commas', () => {
    const result = parseCsv('"hello, world",end');
    expect(result[0]).toEqual(['hello, world', 'end']);
  });

  it('handles escaped double-quotes inside quoted fields', () => {
    const result = parseCsv('"say ""hi"""');
    expect(result[0]).toEqual(['say "hi"']);
  });

  it('handles multi-line quoted fields', () => {
    const result = parseCsv('"line1\nline2",end');
    expect(result[0]).toEqual(['line1\nline2', 'end']);
  });

  it('skips blank rows', () => {
    const result = parseCsv('a,b\n\nc,d');
    expect(result).toHaveLength(2);
  });
});

describe('dateStamp', () => {
  it('formats date as YYYY-MM-DD', () => {
    expect(dateStamp(new Date(2024, 0, 5))).toBe('2024-01-05');
  });

  it('pads month and day with leading zeros', () => {
    expect(dateStamp(new Date(2024, 8, 3))).toBe('2024-09-03');
  });

  it('returns string for last day of year', () => {
    expect(dateStamp(new Date(2023, 11, 31))).toBe('2023-12-31');
  });
});
