import { describe, expect, it } from 'vitest';
import { createNextRequestInitDecorator } from '../next-request-init';

describe('createNextRequestInitDecorator', () => {
  it('adds next.revalidate to GET requests when cache ttl is positive', () => {
    const decorate = createNextRequestInitDecorator();

    const result = decorate({
      url: 'https://example.com/api/enabled-languages',
      method: 'GET',
      requestInit: {
        method: 'GET',
        cache: 'force-cache',
      },
      cacheTtlSeconds: 90,
    });

    expect(result.next).toEqual({ revalidate: 90 });
    expect(result.cache).toBe('force-cache');
  });

  it('leaves non-GET requests unchanged', () => {
    const decorate = createNextRequestInitDecorator();
    const requestInit = {
      method: 'POST',
      body: '{"hello":"world"}',
    };

    const result = decorate({
      url: 'https://example.com/translate',
      method: 'POST',
      requestInit,
      cacheTtlSeconds: 90,
    });

    expect(result).toBe(requestInit);
  });
});
