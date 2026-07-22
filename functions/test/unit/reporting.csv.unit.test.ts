import { describe, it, expect } from 'vitest';
import { csvCell } from '../../src/reporting';

describe('csvCell — CSV formula-injection guard (M4)', () => {
  it('prefixes a leading formula character with a single quote', () => {
    // A note/activity/name a spreadsheet would execute as a formula.
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(
      '"\'=HYPERLINK(""http://evil"",""x"")"',
    );
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell('@cmd')).toBe("'@cmd");
  });

  it('neutralizes a leading tab too (prefix only; tab isn\'t in the quote set)', () => {
    expect(csvCell('\t=1')).toBe("'\t=1");
  });

  it('leaves ordinary values untouched', () => {
    expect(csvCell('Tutoring')).toBe('Tutoring');
    expect(csvCell('Math with the kids')).toBe('Math with the kids');
    expect(csvCell(120)).toBe('120');
    expect(csvCell('a-b')).toBe('a-b'); // '-' not at the start
  });

  it('still quotes cells with commas / quotes / newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('she said "hi"')).toBe('"she said ""hi"""');
  });
});
