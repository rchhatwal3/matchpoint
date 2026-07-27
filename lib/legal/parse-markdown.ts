export type Inline = { text: string; bold?: boolean; italic?: boolean; href?: string };

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; spans: Inline[] }
  | { type: 'paragraph'; spans: Inline[] }
  | { type: 'bullets'; items: Inline[][] }
  | { type: 'quote'; spans: Inline[] }
  | { type: 'rule' }
  | { type: 'table'; header: Inline[][]; rows: Inline[][][] };

// Split "| a | b |" into ["a", "b"] (drop leading/trailing empty cells).
function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());
}

const isTableSep = (line: string) => /^\|?\s*:?-{1,}\s*:?\s*(\|\s*:?-{1,}\s*:?\s*)*\|?$/.test(line.trim());

// Inline: **bold**, *italic*, [text](href). Single left-to-right scan.
export function parseInline(text: string): Inline[] {
  const spans: Inline[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) spans.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) spans.push({ text: m[1], bold: true });
    else if (m[2] !== undefined) spans.push({ text: m[2], italic: true });
    else spans.push({ text: m[3], href: m[4] });
    last = re.lastIndex;
  }
  if (last < text.length) spans.push({ text: text.slice(last) });
  return spans.length > 0 ? spans : [{ text }];
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') { i++; continue; }

    if (/^-{3,}$/.test(trimmed)) { blocks.push({ type: 'rule' }); i++; continue; }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        spans: parseInline(heading[2]),
      });
      i++;
      continue;
    }

    if (trimmed.startsWith('>')) {
      blocks.push({ type: 'quote', spans: parseInline(trimmed.replace(/^>\s?/, '')) });
      i++;
      continue;
    }

    // Table: a pipe row immediately followed by a separator row.
    if (trimmed.startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(trimmed).map(parseInline);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i].trim()).map(parseInline));
        i++;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(parseInline(lines[i].trim().replace(/^[-*]\s+/, '')));
        i++;
      }
      blocks.push({ type: 'bullets', items });
      continue;
    }

    // Paragraph: gather consecutive non-blank, non-special lines.
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,3}\s|>|[-*]\s|-{3,}$|\|)/.test(lines[i].trim())) {
      para.push(lines[i].trim());
      i++;
    }
    // Guarantee forward progress: if the inner loop above consumed nothing
    // (e.g. a stray "|" line that no other branch claimed), consume this
    // line as a paragraph so `i` always advances and the outer loop can't spin.
    if (para.length === 0) {
      para.push(trimmed);
      i++;
    }
    blocks.push({ type: 'paragraph', spans: parseInline(para.join(' ')) });
  }

  return blocks;
}
