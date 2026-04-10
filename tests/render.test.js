import { describe, it, expect } from 'vitest';
import { tierClass, tierLabel, initials, companyInitials, html } from '../app/render.js';

// ─── tierClass ───

describe('tierClass', () => {
  it('returns tier-1 for Tier 1', () => {
    expect(tierClass('Tier 1')).toBe('tier-1');
  });

  it('returns tier-2 for Tier 2', () => {
    expect(tierClass('Tier 2')).toBe('tier-2');
  });

  it('returns tier-3 for Tier 3', () => {
    expect(tierClass('Tier 3')).toBe('tier-3');
  });

  it('returns tier-3 for unknown tiers', () => {
    expect(tierClass('Unknown')).toBe('tier-3');
  });

  it('returns tier-3 for empty string', () => {
    expect(tierClass('')).toBe('tier-3');
  });

  it('returns tier-3 for null/undefined', () => {
    expect(tierClass(null)).toBe('tier-3');
    expect(tierClass(undefined)).toBe('tier-3');
  });
});

// ─── tierLabel ───

describe('tierLabel', () => {
  it('returns Priority for Tier 1', () => {
    expect(tierLabel('Tier 1')).toBe('Priority');
  });

  it('returns Strong for Tier 2', () => {
    expect(tierLabel('Tier 2')).toBe('Strong');
  });

  it('returns Lower for Tier 3', () => {
    expect(tierLabel('Tier 3')).toBe('Lower');
  });

  it('returns Lower for unknown non-empty tiers', () => {
    expect(tierLabel('Custom')).toBe('Lower');
  });

  it('returns empty string for falsy input', () => {
    expect(tierLabel('')).toBe('');
    expect(tierLabel(null)).toBe('');
  });
});

// ─── initials ───

describe('initials', () => {
  it('returns first letters of first and last name', () => {
    expect(initials('John Smith')).toBe('JS');
  });

  it('returns single letter for single name', () => {
    expect(initials('Alice')).toBe('A');
  });

  it('handles three-word names (first + last)', () => {
    expect(initials('John Paul Jones')).toBe('JP');
  });

  it('returns ? for empty string', () => {
    expect(initials('')).toBe('?');
  });

  it('returns ? for undefined', () => {
    expect(initials(undefined)).toBe('?');
  });

  it('returns ? for null', () => {
    expect(initials(null)).toBe('?');
  });
});

// ─── companyInitials ───

describe('companyInitials', () => {
  it('returns first 2 chars for single-word company', () => {
    expect(companyInitials('Google')).toBe('GO');
  });

  it('returns initials for multi-word company', () => {
    expect(companyInitials('Goldman Sachs')).toBe('GS');
  });

  it('splits on & and takes initials', () => {
    expect(companyInitials('Johnson & Johnson')).toBe('JJ');
  });

  it('returns ? for empty string', () => {
    expect(companyInitials('')).toBe('?');
  });

  it('returns ? for undefined', () => {
    expect(companyInitials(undefined)).toBe('?');
  });
});

// ─── html (tagged template) ───

describe('html', () => {
  it('interpolates values', () => {
    const name = 'World';
    expect(html`Hello ${name}`).toBe('Hello World');
  });

  it('joins arrays', () => {
    const items = ['<li>a</li>', '<li>b</li>'];
    expect(html`<ul>${items}</ul>`).toBe('<ul><li>a</li><li>b</li></ul>');
  });

  it('handles undefined values as empty string', () => {
    expect(html`Hello ${undefined}`).toBe('Hello ');
  });
});
