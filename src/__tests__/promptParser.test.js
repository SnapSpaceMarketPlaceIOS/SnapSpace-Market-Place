import { parseDesignPrompt, summarizeParsed } from '../utils/promptParser';

describe('parseDesignPrompt', () => {
  it('returns default values for empty input', () => {
    const result = parseDesignPrompt('');
    expect(result.roomType).toBe('living-room');
    expect(Array.isArray(result.styles)).toBe(true);
    expect(Array.isArray(result.materials)).toBe(true);
  });

  it('extracts room type from prompt', () => {
    const result = parseDesignPrompt('modern bedroom with wood accents');
    expect(result.roomType).toBe('bedroom');
  });

  it('extracts style keywords', () => {
    const result = parseDesignPrompt('minimalist Japandi living room');
    expect(result.styles).toContain('minimalist');
    expect(result.styles).toContain('japandi');
  });

  it('extracts material keywords', () => {
    const result = parseDesignPrompt('living room with marble and wood');
    expect(result.materials).toContain('marble');
    expect(result.materials).toContain('wood');
  });
});

describe('summarizeParsed', () => {
  it('formats parsed prompt into readable string', () => {
    const parsed = {
      roomType: 'bedroom',
      styles: ['minimalist'],
      materials: ['wood'],
      moods: [],
      furnitureCategories: [],
    };
    const summary = summarizeParsed(parsed);
    expect(summary).toContain('bedroom');
    expect(summary).toContain('minimalist');
    expect(summary).toContain('wood');
  });
});
