import { test, expect } from 'vitest';

import { parseRequest } from '../src/application/requests';
import { parseResponse } from '../src/application/responses';
import { defaultSettings, validateSettings } from '../src/application/settings';
import { emptyMemory, validateMemory } from '../src/domain/review';

test('message boundary rejects malformed and oversized requests', () => {
  for (const value of [
    null,
    [],
    {},
    { type: 'unknown' },
    { type: 'review', text: 12, token: 'a' },
    { type: 'review', text: 'x'.repeat(6001), token: 'a' },
    { type: 'review', text: 'Hello.', token: '' },
    { type: 'review', text: 'Hello.', token: 'x'.repeat(101) },
    { type: 'feedback', token: 1, id: '0', outcome: 'accepted' },
    { type: 'feedback', token: 'x'.repeat(101), id: '0', outcome: 'accepted' },
    { type: 'feedback', token: 'a', id: null, outcome: 'accepted' },
    { type: 'feedback', token: 'a', id: 'x'.repeat(101), outcome: 'accepted' },
    { type: 'feedback', token: 'a', id: '0', outcome: 'copied' },
    { type: 'save-memory', memory: { version: 2 } },
  ]) {
    expect(() => parseRequest(value)).toThrow();
  }

  expect(parseRequest({ type: 'review', text: 'Hello.', token: 'a' })).toEqual({
    type: 'review',
    text: 'Hello.',
    token: 'a',
  });
  expect(parseRequest({ type: 'review', text: 'x'.repeat(6000), token: 'x'.repeat(100) })).toEqual({
    type: 'review',
    text: 'x'.repeat(6000),
    token: 'x'.repeat(100),
  });
  expect(parseRequest({ type: 'feedback', token: 'a', id: '0', outcome: 'too-soft' })).toEqual({
    type: 'feedback',
    token: 'a',
    id: '0',
    outcome: 'too-soft',
  });
});

test('client boundary rejects invalid results and exposes worker errors', () => {
  expect(() => parseResponse('review', { ok: true, suggestions: [{}] })).toThrow();
  expect(() => parseResponse('review', { ok: true, suggestions: [null] })).toThrow();
  expect(() => parseResponse('models', { ok: true, models: [null] })).toThrow();
  expect(() => parseResponse('settings', { ok: false, error: 'Disabled.' })).toThrow('Disabled.');
  expect(parseResponse('review', { ok: true, suggestions: [] })).toEqual({ suggestions: [] });
});

test('settings migrate the unversioned foundation without mutating it', () => {
  const original = { model: ' local ', disabledSites: ['EXAMPLE.COM', 'example.com'] };
  expect(validateSettings(original)).toEqual({
    version: 1,
    model: 'local',
    disabledSites: ['example.com'],
  });
  expect(original.disabledSites).toHaveLength(2);
  expect(validateSettings(defaultSettings())).toEqual(defaultSettings());

  for (const value of [
    { ...original, version: 2 },
    { ...original, disabledSites: ['https://example.com'] },
    null,
  ]) {
    expect(() => validateSettings(value)).toThrow();
  }
});

test('memory validation rejects unsafe counts and unknown versions', () => {
  for (const value of [
    { ...emptyMemory(), version: 2 },
    { ...emptyMemory(), patterns: { agreement: { accepted: -1, rejected: 0 } } },
    { ...emptyMemory(), terms: [null] },
  ]) {
    expect(() => validateMemory(value)).toThrow();
  }
});

test.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null])(
  'memory rejects unsafe counter %s on every boundary',
  (counter) => {
    expect(() => validateMemory({ ...emptyMemory(), tooSoft: counter })).toThrow(
      'Invalid memory format.',
    );

    for (const key of ['accepted', 'rejected']) {
      expect(() =>
        validateMemory({
          ...emptyMemory(),
          patterns: { agreement: { accepted: 0, rejected: 0, [key]: counter } },
        }),
      ).toThrow('Invalid pattern counts.');
    }
  },
);

test('memory accepts inclusive safe integer limits', () => {
  const memory = {
    ...emptyMemory(),
    tooSoft: Number.MAX_SAFE_INTEGER,
    patterns: { agreement: { accepted: 0, rejected: Number.MAX_SAFE_INTEGER } },
  };
  expect(validateMemory(memory)).toEqual(memory);
});

test.each([
  'cancel',
  'disable-site',
  'feedback',
  'open-options',
  'save-memory',
  'save-settings',
] as const)('%s acknowledgement requires a successful response', (requestType) => {
  expect(parseResponse(requestType, { ok: true })).toEqual({});
  expect(() => parseResponse(requestType, { ok: false, error: 'Rejected.' })).toThrow('Rejected.');
});

const settingsFailures = [
  { label: 'non-record', value: [] },
  { label: 'missing fields', value: {} },
  { label: 'null version', value: { ...defaultSettings(), version: null } },
  { label: 'model type', value: { ...defaultSettings(), model: null } },
  { label: 'model length', value: { ...defaultSettings(), model: 'x'.repeat(201) } },
  { label: 'site list type', value: { ...defaultSettings(), disabledSites: 'example.com' } },
  { label: 'site item type', value: { ...defaultSettings(), disabledSites: [null] } },
  {
    label: 'site count',
    value: { ...defaultSettings(), disabledSites: Array<string>(1001).fill('example.com') },
  },
  { label: 'empty hostname', value: { ...defaultSettings(), disabledSites: [''] } },
  { label: 'hostname path', value: { ...defaultSettings(), disabledSites: ['example.com/path'] } },
];

test.each(settingsFailures)('settings reject $label', ({ value }) => {
  expect(() => validateSettings(value)).toThrow('Invalid settings. Use hostnames only.');
});

test('settings preserve inclusive limits, normalization, and hostname formats', () => {
  const settings = {
    version: 1,
    model: 'x'.repeat(200),
    disabledSites: Array<string>(1000).fill('EXAMPLE.COM'),
  };
  expect(validateSettings(settings)).toEqual({
    version: 1,
    model: settings.model,
    disabledSites: ['example.com'],
  });
  expect(settings.disabledSites).toHaveLength(1000);
  expect(
    validateSettings({ model: ' ', disabledSites: ['localhost', '127.0.0.1', '[::1]'] }),
  ).toEqual({
    version: 1,
    model: '',
    disabledSites: ['localhost', '127.0.0.1', '[::1]'],
  });
});

test.each([
  { label: 'pattern record', patch: { patterns: [] } },
  { label: 'pattern entry', patch: { patterns: { agreement: null } } },
  { label: 'term count', patch: { terms: Array<string>(101).fill('term') } },
  { label: 'blank term', patch: { terms: ['  '] } },
  { label: 'term length', patch: { terms: ['x'.repeat(101)] } },
  { label: 'preferences type', patch: { tonePreferences: null } },
  { label: 'preferences length', patch: { tonePreferences: 'x'.repeat(2001) } },
])('memory rejects $label', ({ patch }) => {
  expect(() => validateMemory({ ...emptyMemory(), ...patch })).toThrow();
});

test('memory preserves inclusive text limits and deduplicates terms without mutation', () => {
  const memory = {
    ...emptyMemory(),
    terms: Array<string>(100).fill('x'.repeat(100)),
    tonePreferences: 'x'.repeat(2000),
  };
  expect(validateMemory(memory)).toEqual({ ...memory, terms: [memory.terms[0]] });
  expect(memory.terms).toHaveLength(100);
});

const returnedSuggestion = {
  id: '0',
  category: 'grammar',
  pattern: 'agreement',
  original: 'Tests is failing.',
  replacement: 'Tests are failing.',
  explanation: 'Plural agreement.',
  start: 0,
  end: 'Tests is failing.'.length,
};

test.each([
  { label: 'id', patch: { id: null } },
  { label: 'empty id', patch: { id: '' } },
  { label: 'id length', patch: { id: 'x'.repeat(101) } },
  { label: 'category-pattern mismatch', patch: { pattern: 'harsh' } },
  { label: 'empty passage', patch: { original: '', end: 0 } },
  { label: 'blank replacement', patch: { replacement: ' ' } },
  { label: 'explanation length', patch: { explanation: 'x'.repeat(6001) } },
  {
    label: 'unsafe end',
    patch: {
      start: Number.MAX_SAFE_INTEGER,
      end: Number.MAX_SAFE_INTEGER + returnedSuggestion.original.length,
    },
  },
  { label: 'category', patch: { category: 'unknown' } },
  { label: 'pattern', patch: { pattern: 'unknown' } },
  { label: 'original', patch: { original: null } },
  { label: 'replacement', patch: { replacement: null } },
  { label: 'explanation', patch: { explanation: null } },
  { label: 'start type', patch: { start: '0' } },
  { label: 'fractional start', patch: { start: 0.5 } },
  { label: 'negative start', patch: { start: -1 } },
  { label: 'unsafe start', patch: { start: Number.MAX_SAFE_INTEGER + 1 } },
  { label: 'end type', patch: { end: '16' } },
  { label: 'passage offsets', patch: { end: 1 } },
])('response rejects invalid suggestion $label', ({ patch }) => {
  expect(() =>
    parseResponse('review', { ok: true, suggestions: [{ ...returnedSuggestion, ...patch }] }),
  ).toThrow('Invalid suggestions.');
});

test('response preserves valid suggestion fields and feedback string boundaries', () => {
  expect(parseResponse('review', { ok: true, suggestions: [returnedSuggestion] })).toEqual({
    suggestions: [returnedSuggestion],
  });
  const feedback = { type: 'feedback', token: '', id: '', outcome: 'accepted' };
  expect(parseRequest(feedback)).toEqual(feedback);
});

test('response accepts twenty suggestions and rejects twenty-one', () => {
  const suggestions = Array.from({ length: 20 }, () => ({ ...returnedSuggestion }));
  expect(parseResponse('review', { ok: true, suggestions })).toEqual({ suggestions });
  expect(() =>
    parseResponse('review', { ok: true, suggestions: [...suggestions, returnedSuggestion] }),
  ).toThrow('Invalid suggestions.');
});
