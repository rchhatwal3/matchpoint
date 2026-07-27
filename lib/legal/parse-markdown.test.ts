import { parseMarkdown, type Block } from './parse-markdown';

describe('parseMarkdown — blocks', () => {
  it('parses ATX headings at levels 1-3', () => {
    const b = parseMarkdown('# One\n\n## Two\n\n### Three');
    expect(b.map((x) => x.type)).toEqual(['heading', 'heading', 'heading']);
    expect((b[0] as Extract<Block, { type: 'heading' }>).level).toBe(1);
    expect((b[2] as Extract<Block, { type: 'heading' }>).level).toBe(3);
  });

  it('parses a paragraph split by blank lines', () => {
    const b = parseMarkdown('First para.\n\nSecond para.');
    expect(b).toHaveLength(2);
    expect(b[0].type).toBe('paragraph');
  });

  it('parses a bullet list into one block', () => {
    const b = parseMarkdown('- a\n- b\n- c');
    expect(b).toHaveLength(1);
    const list = b[0] as Extract<Block, { type: 'bullets' }>;
    expect(list.type).toBe('bullets');
    expect(list.items).toHaveLength(3);
  });

  it('parses a blockquote and a horizontal rule', () => {
    const b = parseMarkdown('> note\n\n---');
    expect(b[0].type).toBe('quote');
    expect(b[1].type).toBe('rule');
  });

  it('parses a GFM table, skipping the separator row', () => {
    const src = '| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |';
    const t = parseMarkdown(src)[0] as Extract<Block, { type: 'table' }>;
    expect(t.type).toBe('table');
    expect(t.header).toHaveLength(2);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0][1][0].text).toBe('2');
  });
});

describe('parseMarkdown — inline', () => {
  it('parses bold, italic, and links', () => {
    const p = parseMarkdown('a **b** c *d* [e](https://x.io)')[0] as Extract<
      Block,
      { type: 'paragraph' }
    >;
    const bold = p.spans.find((s) => s.bold);
    const italic = p.spans.find((s) => s.italic);
    const link = p.spans.find((s) => s.href);
    expect(bold?.text).toBe('b');
    expect(italic?.text).toBe('d');
    expect(link).toEqual({ text: 'e', href: 'https://x.io' });
  });

  it('returns [] for empty input', () => {
    expect(parseMarkdown('')).toEqual([]);
  });
});
