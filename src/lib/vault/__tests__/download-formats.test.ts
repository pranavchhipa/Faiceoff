import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock fetch globally — we don't want real HTTP calls in tests
// ---------------------------------------------------------------------------

const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG_1X1_BUFFER = Buffer.from(PNG_1X1_BASE64, 'base64');

// Mock the global fetch to return a 1x1 PNG for any image URL
const mockFetch = vi.fn().mockImplementation(async (url: string) => {
  if (typeof url === 'string' && (url.startsWith('http') || url.startsWith('https'))) {
    return {
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => (name === 'content-type' ? 'image/png' : null),
      },
      arrayBuffer: async () => PNG_1X1_BUFFER.buffer.slice(
        PNG_1X1_BUFFER.byteOffset,
        PNG_1X1_BUFFER.byteOffset + PNG_1X1_BUFFER.byteLength,
      ),
    };
  }
  return { ok: false, status: 404 };
});

vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { generateOriginalZip, generatePdfPackage, generateDocxPackage } from '../download-formats';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const IMAGE_URL = 'https://cdn.faiceoff.com/gen-test.png';
const GENERATION_ID = 'gen-uuid-test-1234';

const SAMPLE_BRIEF = {
  product: 'summer dress',
  scene: 'beach sunset',
  mood: 'vibrant',
  aesthetic: 'editorial',
};

const SAMPLE_CREATOR = {
  display_name: 'Priya Singh',
  instagram_handle: '@priyasingh',
};

const SAMPLE_BRAND = {
  company_name: 'StyleCo India',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateOriginalZip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('returns a Buffer starting with ZIP magic bytes (PK\\x03\\x04)', async () => {
    const buffer = await generateOriginalZip({
      imageUrl: IMAGE_URL,
      generationId: GENERATION_ID,
    });

    expect(buffer).toBeInstanceOf(Buffer);
    // ZIP magic bytes: 50 4B 03 04 (PK\x03\x04)
    expect(buffer[0]).toBe(0x50); // P
    expect(buffer[1]).toBe(0x4b); // K
    expect(buffer[2]).toBe(0x03);
    expect(buffer[3]).toBe(0x04);
  });

  it('produces a non-empty buffer', async () => {
    const buffer = await generateOriginalZip({
      imageUrl: IMAGE_URL,
      generationId: GENERATION_ID,
    });

    expect(buffer.length).toBeGreaterThan(100);
  });

  it('includes readme.txt by checking ZIP contains the file name', async () => {
    const buffer = await generateOriginalZip({
      imageUrl: IMAGE_URL,
      generationId: GENERATION_ID,
    });

    // Readme filename should appear in the ZIP central directory
    const zipText = buffer.toString('binary');
    expect(zipText).toContain('readme.txt');
  });

  it('includes the image file in the ZIP', async () => {
    const buffer = await generateOriginalZip({
      imageUrl: IMAGE_URL,
      generationId: GENERATION_ID,
    });

    const zipText = buffer.toString('binary');
    expect(zipText).toContain('image.');
  });

  it('gracefully omits cert when certUrl fetch fails', async () => {
    // Cert URL will return 404
    const failFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('cert')) {
        return { ok: false, status: 404 };
      }
      return mockFetch(url);
    });
    vi.stubGlobal('fetch', failFetch);

    const buffer = await generateOriginalZip({
      imageUrl: IMAGE_URL,
      certUrl: 'https://cdn.faiceoff.com/cert.pdf',
      generationId: GENERATION_ID,
    });

    // Should still return a valid ZIP
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it('fetches image from the provided URL', async () => {
    await generateOriginalZip({ imageUrl: IMAGE_URL, generationId: GENERATION_ID });
    expect(mockFetch).toHaveBeenCalledWith(IMAGE_URL);
  });
});

describe('generatePdfPackage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('returns a Buffer starting with PDF magic bytes (%PDF)', async () => {
    const buffer = await generatePdfPackage({
      imageUrl: IMAGE_URL,
      generationId: GENERATION_ID,
      brief: SAMPLE_BRIEF,
    });

    expect(buffer).toBeInstanceOf(Buffer);
    // PDF magic bytes: 25 50 44 46 (%PDF)
    const header = buffer.slice(0, 4).toString('ascii');
    expect(header).toBe('%PDF');
  });

  it('produces a non-empty buffer', async () => {
    const buffer = await generatePdfPackage({
      imageUrl: IMAGE_URL,
      generationId: GENERATION_ID,
    });

    expect(buffer.length).toBeGreaterThan(500);
  });

  it('works without brief, creator, or brand', async () => {
    const buffer = await generatePdfPackage({
      imageUrl: IMAGE_URL,
      generationId: GENERATION_ID,
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer[0]).toBe(0x25); // %
  });

  it('works with full brief and metadata', async () => {
    const buffer = await generatePdfPackage({
      imageUrl: IMAGE_URL,
      generationId: GENERATION_ID,
      brief: SAMPLE_BRIEF,
      creator: SAMPLE_CREATOR,
      brand: SAMPLE_BRAND,
    });

    expect(buffer).toBeInstanceOf(Buffer);
  });

  it('fetches image for embedding', async () => {
    await generatePdfPackage({ imageUrl: IMAGE_URL, generationId: GENERATION_ID });
    expect(mockFetch).toHaveBeenCalledWith(IMAGE_URL);
  });
});

describe('generateDocxPackage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('returns a Buffer starting with ZIP magic bytes (PK\\x03\\x04 — DOCX is a ZIP)', async () => {
    const buffer = await generateDocxPackage({
      imageUrl: IMAGE_URL,
      generationId: GENERATION_ID,
      brief: SAMPLE_BRIEF,
      creator: SAMPLE_CREATOR,
      brand: SAMPLE_BRAND,
    });

    expect(buffer).toBeInstanceOf(Buffer);
    // DOCX = OOXML ZIP. Magic bytes: PK\x03\x04
    expect(buffer[0]).toBe(0x50); // P
    expect(buffer[1]).toBe(0x4b); // K
    expect(buffer[2]).toBe(0x03);
    expect(buffer[3]).toBe(0x04);
  });

  it('contains [Content_Types].xml signature in the ZIP', async () => {
    const buffer = await generateDocxPackage({
      imageUrl: IMAGE_URL,
      generationId: GENERATION_ID,
    });

    const zipText = buffer.toString('binary');
    expect(zipText).toContain('[Content_Types].xml');
  });

  it('produces a non-empty buffer', async () => {
    const buffer = await generateDocxPackage({
      imageUrl: IMAGE_URL,
      generationId: GENERATION_ID,
    });

    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('works without creator or brand', async () => {
    const buffer = await generateDocxPackage({
      imageUrl: IMAGE_URL,
      generationId: GENERATION_ID,
      brief: SAMPLE_BRIEF,
    });

    expect(buffer).toBeInstanceOf(Buffer);
  });

  it('works with all fields provided', async () => {
    const buffer = await generateDocxPackage({
      imageUrl: IMAGE_URL,
      generationId: GENERATION_ID,
      brief: SAMPLE_BRIEF,
      creator: SAMPLE_CREATOR,
      brand: SAMPLE_BRAND,
    });

    expect(buffer).toBeInstanceOf(Buffer);
  });

  it('fetches image for embedding', async () => {
    await generateDocxPackage({
      imageUrl: IMAGE_URL,
      generationId: GENERATION_ID,
    });

    expect(mockFetch).toHaveBeenCalledWith(IMAGE_URL);
  });
});

describe('data: URI support', () => {
  it('generateOriginalZip handles data: URI image', async () => {
    const dataUri = `data:image/png;base64,${PNG_1X1_BASE64}`;
    const buffer = await generateOriginalZip({
      imageUrl: dataUri,
      generationId: GENERATION_ID,
    });

    expect(buffer[0]).toBe(0x50); // ZIP PK
    expect(buffer[1]).toBe(0x4b);
  });
});
