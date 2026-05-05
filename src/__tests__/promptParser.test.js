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

  // Build 136 — Bug A regression test.
  // Real user prompt that produced a white-couch render when "brown leather"
  // wasn't pinned to any category. The orphan-color fallback should now
  // attach brown to the living-room centerpiece (sofa).
  it('attaches orphan color+soft-material pair to room centerpiece (Build 136 Bug A)', () => {
    const prompt = 'Living room with brown leather and black metal accents, ' +
      'warm lamplight casting deep shadows, earthy richness';
    const result = parseDesignPrompt(prompt);
    expect(result.roomType).toBe('living-room');
    expect(result.colors).toContain('brown');
    expect(result.colorByCategory.sofa).toBe('brown');
    expect(result.materialByCategory.sofa).toBe('leather');
  });

  it('does NOT attach orphan color to centerpiece without a soft material (Build 136 Bug A safety)', () => {
    // "brown" without leather/velvet/etc should NOT auto-default to sofa —
    // brown could refer to anything (table, frame, walls). We only default
    // when a clear upholstery cue is paired with the color.
    const prompt = 'Living room with brown accents and warm tones';
    const result = parseDesignPrompt(prompt);
    expect(result.colorByCategory.sofa).toBeUndefined();
  });

  it('does NOT overwrite an explicit color attachment (Build 136 Bug A safety)', () => {
    // If the user already specified "white sofa with brown leather", the
    // explicit "white" attachment must win — the orphan brown+leather
    // pair must NOT overwrite it.
    const prompt = 'Living room with white sofa and brown leather throw';
    const result = parseDesignPrompt(prompt);
    expect(result.colorByCategory.sofa).toBe('white');
  });

  it('defaults orphan color to bed in bedroom (Build 136 Bug A)', () => {
    // "cream" is a synonym for the "white" color family in colorMap.js,
    // so colorByCategory stores the canonical family name 'white'. This
    // matches what findMatchingColorVariant expects downstream.
    const prompt = 'Bedroom with cream linen and warm wood tones';
    const result = parseDesignPrompt(prompt);
    expect(result.roomType).toBe('bedroom');
    expect(result.colorByCategory.bed).toBe('white');
    expect(result.materialByCategory.bed).toBe('linen');
  });

  it('resolves color synonyms to family name in orphan defaulting (Build 136 Bug A)', () => {
    // "cognac" should resolve to family "brown".
    const prompt = 'Living room with cognac leather and matte black accents';
    const result = parseDesignPrompt(prompt);
    expect(result.colorByCategory.sofa).toBe('brown');
    expect(result.materialByCategory.sofa).toBe('leather');
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
