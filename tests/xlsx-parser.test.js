import { describe, it, expect } from 'vitest';
import { extractSheetId, parseCSVLine, normalizeRows, parseCSV } from '../app/xlsx-parser.js';

// ─── extractSheetId ───

describe('extractSheetId', () => {
  it('extracts ID from full Google Sheets URL', () => {
    expect(extractSheetId('https://docs.google.com/spreadsheets/d/1rl-NP8v0fuUB5AjEAKJvPJTxmukMS57obmrjvNpT--c/edit?usp=sharing'))
      .toBe('1rl-NP8v0fuUB5AjEAKJvPJTxmukMS57obmrjvNpT--c');
  });

  it('extracts ID from URL without query params', () => {
    expect(extractSheetId('https://docs.google.com/spreadsheets/d/abc123_-XYZ/edit'))
      .toBe('abc123_-XYZ');
  });

  it('returns bare ID as-is', () => {
    expect(extractSheetId('1rl-NP8v0fuUB5AjEAKJvPJTxmukMS57obmrjvNpT--c'))
      .toBe('1rl-NP8v0fuUB5AjEAKJvPJTxmukMS57obmrjvNpT--c');
  });

  it('returns null for invalid input', () => {
    expect(extractSheetId('not a url')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractSheetId('')).toBeNull();
  });

  it('handles URL with gid param', () => {
    expect(extractSheetId('https://docs.google.com/spreadsheets/d/1abc123/edit#gid=0'))
      .toBe('1abc123');
  });
});

// ─── parseCSVLine ───

describe('parseCSVLine', () => {
  it('parses simple comma-separated values', () => {
    expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('trims whitespace', () => {
    expect(parseCSVLine(' a , b , c ')).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted fields with commas', () => {
    expect(parseCSVLine('"hello, world",b,c')).toEqual(['hello, world', 'b', 'c']);
  });

  it('handles escaped quotes inside quoted fields', () => {
    expect(parseCSVLine('"say ""hello""",b')).toEqual(['say "hello"', 'b']);
  });

  it('handles empty fields', () => {
    expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c']);
  });

  it('handles single field', () => {
    expect(parseCSVLine('hello')).toEqual(['hello']);
  });

  it('handles empty string', () => {
    expect(parseCSVLine('')).toEqual(['']);
  });
});

// ─── normalizeRows ───

describe('normalizeRows', () => {
  it('maps standard column names', () => {
    const rows = [{ Name: 'Alice', Title: 'CEO', Company: 'Acme' }];
    const result = normalizeRows(rows);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
    expect(result[0].title).toBe('CEO');
    expect(result[0].company).toBe('Acme');
  });

  it('maps alias column names', () => {
    const rows = [{ 'Full Name': 'Bob', 'Job Title': 'CTO', 'Organization': 'Corp' }];
    const result = normalizeRows(rows);
    expect(result[0].name).toBe('Bob');
    expect(result[0].title).toBe('CTO');
    expect(result[0].company).toBe('Corp');
  });

  it('maps case-insensitively', () => {
    const rows = [{ 'NAME': 'Carol', 'COMPANY': 'BigCo' }];
    const result = normalizeRows(rows);
    expect(result[0].name).toBe('Carol');
    expect(result[0].company).toBe('BigCo');
  });

  it('filters rows without names', () => {
    const rows = [
      { Name: 'Alice', Company: 'A' },
      { Name: '', Company: 'B' },
      { Name: 'Charlie', Company: 'C' },
    ];
    const result = normalizeRows(rows);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Alice');
    expect(result[1].name).toBe('Charlie');
  });

  it('returns empty array for empty input', () => {
    expect(normalizeRows([])).toEqual([]);
  });

  it('fills missing fields with empty strings', () => {
    const rows = [{ Name: 'Dave' }];
    const result = normalizeRows(rows);
    expect(result[0]).toEqual({
      name: 'Dave',
      title: '',
      company: '',
      tier: '',
      companyOverview: '',
      industryContext: '',
      talkingPoints: '',
      roleContext: '',
    });
  });

  it('maps priority tier aliases', () => {
    const rows = [{ Name: 'Eve', 'Outreach Tier': 'Tier 1' }];
    const result = normalizeRows(rows);
    expect(result[0].tier).toBe('Tier 1');
  });

  it('maps talking points aliases', () => {
    const rows = [{ Name: 'Frank', 'Crib Equity Angle': 'Great fit for lending' }];
    const result = normalizeRows(rows);
    expect(result[0].talkingPoints).toBe('Great fit for lending');
  });
});

// ─── parseCSV (integration) ───

describe('parseCSV', () => {
  it('parses a simple CSV string into contacts', () => {
    const csv = 'Name,Title,Company\nAlice,CEO,Acme\nBob,CTO,Corp';
    const { contacts } = parseCSV(csv);
    expect(contacts).toHaveLength(2);
    expect(contacts[0].name).toBe('Alice');
    expect(contacts[1].company).toBe('Corp');
  });

  it('handles CSV with quoted fields containing commas', () => {
    const csv = 'Name,Title,Company\n"Smith, John",CEO,"Acme, Inc."';
    const { contacts } = parseCSV(csv);
    expect(contacts[0].name).toBe('Smith, John');
    expect(contacts[0].company).toBe('Acme, Inc.');
  });

  it('skips empty rows', () => {
    const csv = 'Name,Title\nAlice,CEO\n\nBob,CTO';
    const { contacts } = parseCSV(csv);
    expect(contacts).toHaveLength(2);
  });
});
