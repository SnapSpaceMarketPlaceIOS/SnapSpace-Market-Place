/**
 * openai.test.js — request-schema contract for the GPT Image 2 (via fal) client.
 *
 * These tests pin the model swap's correctness WITHOUT spending money or
 * hitting the network: proxyFetch is mocked. We assert the request body the
 * client sends to fal is shaped for openai/gpt-image-2/edit — quality knob
 * present, jpeg output, correct image_urls, and crucially NO flux-only params
 * (seed / safety_tolerance) that GPT Image 2 would reject.
 *
 * Submit-capture trick: the proxyFetch POST mock returns an envelope MISSING
 * status_url/response_url, so submitGptWithRetry throws "malformed envelope"
 * (a non-retryable error) right after we've captured the request body — no
 * polling, no timers, exactly one proxyFetch call to inspect.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

// Mock the transport. Mocking apiProxy also cuts its supabase/env import chain.
jest.mock('../services/apiProxy', () => ({ proxyFetch: jest.fn() }));

import { proxyFetch } from '../services/apiProxy';
import {
  generateWithProductPanel,
  generateWithProductRefs,
  generateSingleProductInRoom,
} from '../services/openai';

const GPT_QUEUE_URL = 'https://queue.fal.run/openai/gpt-image-2/edit';
const QUALITY_ENUM = ['auto', 'low', 'medium', 'high'];

// proxyFetch POST → ok envelope missing status_url/response_url → the client
// captures the body then throws "malformed envelope" (non-retryable).
function mockSubmitCapture() {
  proxyFetch.mockReset();
  proxyFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
}

// Pull the body of the first (POST) proxyFetch call.
function firstCall() {
  const call = proxyFetch.mock.calls[0];
  return { provider: call[0], url: call[1], opts: call[2], body: call[2].body };
}

const SAMPLE_PRODUCTS = [
  { id: 'amz-1', name: 'Cognac Leather Loveseat', category: 'sofa', materials: ['leather'], tags: ['cognac'], imageUrl: 'https://m.media-amazon.com/images/I/abc._AC_SL1000_.jpg' },
  { id: 'amz-2', name: 'Walnut Coffee Table', category: 'coffee-table', materials: ['wood'], tags: ['walnut'], imageUrl: 'https://m.media-amazon.com/images/I/def._AC_SL1000_.jpg' },
];

describe('openai (GPT Image 2 via fal) — generateWithProductPanel', () => {
  it('posts to the gpt-image-2 edit endpoint via the fal provider', async () => {
    mockSubmitCapture();
    await expect(
      generateWithProductPanel('room.jpg', 'cozy loft', SAMPLE_PRODUCTS, 'panel.jpg', '16:9'),
    ).rejects.toThrow(/malformed/i);
    const { provider, url } = firstCall();
    expect(provider).toBe('fal');
    expect(url).toBe(GPT_QUEUE_URL);
  });

  it('sends a GPT Image 2 schema — quality + jpeg, NO seed / safety_tolerance', async () => {
    mockSubmitCapture();
    await expect(
      generateWithProductPanel('room.jpg', 'cozy loft', SAMPLE_PRODUCTS, 'panel.jpg', '1:1'),
    ).rejects.toThrow();
    const { body } = firstCall();
    expect(QUALITY_ENUM).toContain(body.quality);
    expect(body.output_format).toBe('jpeg');
    expect(body).not.toHaveProperty('seed');
    expect(body).not.toHaveProperty('safety_tolerance');
    expect(typeof body.prompt).toBe('string');
    expect(body.prompt.length).toBeGreaterThan(0);
  });

  it('sends [roomPhotoUrl, panelUrl] as image_urls', async () => {
    mockSubmitCapture();
    await expect(
      generateWithProductPanel('room.jpg', 'x', SAMPLE_PRODUCTS, 'panel.jpg', '1:1'),
    ).rejects.toThrow();
    expect(firstCall().body.image_urls).toEqual(['room.jpg', 'panel.jpg']);
  });

  it('passes image_size as a GPT Image 2 enum string, not a {width,height} object', async () => {
    mockSubmitCapture();
    await expect(
      generateWithProductPanel('room.jpg', 'x', SAMPLE_PRODUCTS, 'panel.jpg', '1:1'),
    ).rejects.toThrow();
    expect(typeof firstCall().body.image_size).toBe('string');
  });

  it('requires room + panel URLs', async () => {
    mockSubmitCapture();
    await expect(generateWithProductPanel(null, 'x', [], 'panel.jpg', '1:1')).rejects.toThrow(/room photo/i);
    await expect(generateWithProductPanel('room.jpg', 'x', [], null, '1:1')).rejects.toThrow(/panel/i);
  });
});

describe('openai — aspect ratio → GPT Image 2 image_size enum', () => {
  const cases = [
    ['21:9', 'landscape_16_9'],
    ['16:9', 'landscape_16_9'],
    ['3:2', 'landscape_4_3'],
    ['4:3', 'landscape_4_3'],
    ['1:1', 'square_hd'],
    ['3:4', 'portrait_4_3'],
    ['2:3', 'portrait_4_3'],
    ['9:16', 'portrait_16_9'],
    ['9:21', 'portrait_16_9'],
    ['match_input_image', 'auto'],
    [undefined, 'auto'],
  ];
  it.each(cases)('maps %s → %s', async (aspect, expected) => {
    mockSubmitCapture();
    await expect(
      generateWithProductPanel('room.jpg', 'x', [], 'panel.jpg', aspect),
    ).rejects.toThrow();
    expect(firstCall().body.image_size).toBe(expected);
  });
});

describe('openai — generateWithProductRefs', () => {
  it('sends room first then up to 4 product images, dropping refs with no imageUrl', async () => {
    mockSubmitCapture();
    const products = [
      ...SAMPLE_PRODUCTS,
      { id: 'amz-3', name: 'No image rug', category: 'rug' }, // no imageUrl → dropped
      { id: 'amz-4', name: 'Brass Lamp', category: 'floor-lamp', imageUrl: 'https://x/lamp.jpg' },
      { id: 'amz-5', name: 'Vase', category: 'vase', imageUrl: 'https://x/vase.jpg' },
      { id: 'amz-6', name: 'Extra', category: 'mirror', imageUrl: 'https://x/extra.jpg' }, // 5th valid → capped out
    ];
    await expect(generateWithProductRefs('room.jpg', 'x', products, '1:1')).rejects.toThrow();
    const { body } = firstCall();
    expect(body.image_urls[0]).toBe('room.jpg');
    expect(body.image_urls.length).toBe(5); // room + max 4 products
    expect(body.image_urls).not.toContain(undefined);
    expect(QUALITY_ENUM).toContain(body.quality);
    expect(body).not.toHaveProperty('seed');
    expect(body).not.toHaveProperty('safety_tolerance');
  });

  it('requires a room photo URL', async () => {
    mockSubmitCapture();
    await expect(generateWithProductRefs(null, 'x', SAMPLE_PRODUCTS, '1:1')).rejects.toThrow(/room photo/i);
  });
});

describe('openai — generateSingleProductInRoom', () => {
  it('sends exactly [room, product] and upscales Amazon images to 1500px', async () => {
    mockSubmitCapture();
    await expect(
      generateSingleProductInRoom('room.jpg', SAMPLE_PRODUCTS[0], '1:1'),
    ).rejects.toThrow();
    const { body } = firstCall();
    expect(body.image_urls.length).toBe(2);
    expect(body.image_urls[0]).toBe('room.jpg');
    expect(body.image_urls[1]).toContain('_AC_SL1500_');
    expect(QUALITY_ENUM).toContain(body.quality);
    expect(body).not.toHaveProperty('seed');
    expect(body).not.toHaveProperty('safety_tolerance');
  });

  it('throws when the product has no imageUrl', async () => {
    mockSubmitCapture();
    await expect(
      generateSingleProductInRoom('room.jpg', { name: 'no img', category: 'sofa' }, '1:1'),
    ).rejects.toThrow(/imageUrl/i);
  });
});

describe('openai — happy path returns the contract shape', () => {
  afterEach(() => jest.useRealTimers());

  it('polls to COMPLETED and returns { url, predictionId, seed:null }', async () => {
    jest.useFakeTimers();
    proxyFetch.mockReset();
    proxyFetch.mockImplementation((provider, url, opts) => {
      if ((opts?.method || 'POST') === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            request_id: 'req-123',
            status_url: 'https://queue.fal.run/openai/gpt-image-2/requests/req-123/status',
            response_url: 'https://queue.fal.run/openai/gpt-image-2/requests/req-123',
          }),
        });
      }
      if (url.endsWith('/status')) {
        return Promise.resolve({ json: async () => ({ status: 'COMPLETED' }) });
      }
      return Promise.resolve({ json: async () => ({ images: [{ url: 'https://cdn/final.jpg' }] }) });
    });

    const p = generateWithProductPanel('room.jpg', 'x', SAMPLE_PRODUCTS, 'panel.jpg', '1:1');
    // Advance past the first poll interval so the status GET fires.
    await jest.advanceTimersByTimeAsync(3000);
    await expect(p).resolves.toEqual({
      url: 'https://cdn/final.jpg',
      predictionId: 'req-123',
      seed: null,
    });
  });
});
