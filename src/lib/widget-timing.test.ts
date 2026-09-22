import { describe, expect, it } from 'vitest';
import {
  computeSlower,
  isValidWidgetId,
  parseDurationMs,
  parseOk,
  parseTimingHost,
} from './widget-timing';

describe('parseTimingHost', () => {
  it('accepts bare hostnames and lowercases them', () => {
    expect(parseTimingHost('Example.COM')).toBe('example.com');
    expect(parseTimingHost('localhost')).toBe('localhost');
    expect(parseTimingHost('127.0.0.1')).toBe('127.0.0.1');
  });

  it('rejects scheme, path, port, query, or whitespace', () => {
    expect(parseTimingHost('https://example.com')).toBeNull();
    expect(parseTimingHost('example.com/path')).toBeNull();
    expect(parseTimingHost('example.com:443')).toBeNull();
    expect(parseTimingHost('example.com?x=1')).toBeNull();
    expect(parseTimingHost(' exam ple.com ')).toBeNull();
    expect(parseTimingHost('')).toBeNull();
    expect(parseTimingHost(null)).toBeNull();
    expect(parseTimingHost(12)).toBeNull();
  });
});

describe('parseDurationMs', () => {
  it('allows null and integers 0..60000', () => {
    expect(parseDurationMs(null)).toBeNull();
    expect(parseDurationMs(0)).toBe(0);
    expect(parseDurationMs(60000)).toBe(60000);
    expect(parseDurationMs(1234)).toBe(1234);
  });

  it('rejects non-integers and out-of-range values', () => {
    expect(parseDurationMs(1.5)).toBeUndefined();
    expect(parseDurationMs(-1)).toBeUndefined();
    expect(parseDurationMs(60001)).toBeUndefined();
    expect(parseDurationMs('10')).toBeUndefined();
    expect(parseDurationMs(undefined)).toBeUndefined();
  });
});

describe('computeSlower', () => {
  it('returns null when either duration is missing', () => {
    expect(computeSlower(null, 10)).toBeNull();
    expect(computeSlower(10, null)).toBeNull();
    expect(computeSlower(null, null)).toBeNull();
  });

  it('picks the slower file; ties favor data', () => {
    expect(computeSlower(100, 50)).toBe('data');
    expect(computeSlower(40, 90)).toBe('renderer');
    expect(computeSlower(70, 70)).toBe('data');
  });
});

describe('isValidWidgetId / parseOk', () => {
  it('validates UUID widget ids and boolean ok', () => {
    expect(isValidWidgetId('11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isValidWidgetId('not-a-uuid')).toBe(false);
    expect(parseOk(true)).toBe(true);
    expect(parseOk(false)).toBe(false);
    expect(parseOk('true')).toBeUndefined();
  });
});
