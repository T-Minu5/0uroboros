import type { ReactNode } from 'react';

/** Just enough Markdown for the agents' notebooks, journals and reports, rendered as React elements (never as HTML). */
const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|(?<!\w)_[^_\s][^_]*_(?!\w)|\[[^\]]+\]\([^)\s]+\))/g;
function inline(text: string): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) && part.length > 2) return <em key={index}>{part.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) return /^https?:\/\//.test(link[2]) ? <a key={index} href={link[2]} target='_blank' rel='noreferrer'>{link[1]}</a> : <span key={index}>{link[1]}</span>;
    return part;
  });
}

const BULLET = /^\s*[-*+]\s+/, NUMBER = /^\s*\d+[.)]\s+/, HEADING = /^(#{1,6})\s+(.*)$/, TABLE = /^\s*\|.*\|\s*$/, TABLE_RULE = /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/;
const startsBlock = (line: string) => HEADING.test(line) || BULLET.test(line) || NUMBER.test(line) || TABLE.test(line) || line.startsWith('```') || line.startsWith('>') || /^-{3,}\s*$/.test(line);
const cells = (line: string) => line.trim().slice(1, -1).split('|').map(cell => cell.trim());

/** Splits a document at `<!-- tab: Name -->` lines; text before the first marker is the preamble. */
export function splitTabs(text: string): { preamble: string; tabs: { title: string; text: string }[] } {
  const parts = text.split(/^<!--\s*tab:\s*(.+?)\s*-->\s*$/m);
  const tabs: { title: string; text: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) tabs.push({ title: parts[i], text: parts[i + 1] ?? '' });
  return { preamble: parts[0], tabs };
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).filter(line => !/^\s*<!--.*-->\s*$/.test(line));
  const blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const key = blocks.length;
    const heading = HEADING.exec(line);
    if (heading) { const level = Math.min(4, heading[1].length); const Tag = `h${level}` as 'h1'; blocks.push(<Tag key={key}>{inline(heading[2])}</Tag>); i++; continue; }
    if (/^-{3,}\s*$/.test(line)) { blocks.push(<hr key={key}/>); i++; continue; }
    if (line.startsWith('```')) {
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) code.push(lines[i]);
      blocks.push(<pre key={key}><code>{code.join('\n')}</code></pre>); i++; continue;
    }
    if (TABLE.test(line) && TABLE_RULE.test(lines[i + 1] ?? '')) {
      const head = cells(line), rows: string[][] = [];
      for (i += 2; i < lines.length && TABLE.test(lines[i]); i++) rows.push(cells(lines[i]));
      blocks.push(<table key={key}><thead><tr>{head.map((cell, index) => <th key={index}>{inline(cell)}</th>)}</tr></thead>
        <tbody>{rows.map((row, r) => <tr key={r}>{head.map((_, index) => <td key={index}>{inline(row[index] ?? '')}</td>)}</tr>)}</tbody></table>);
      continue;
    }
    if (line.startsWith('>')) {
      const quote: string[] = [];
      for (; i < lines.length && lines[i].startsWith('>'); i++) quote.push(lines[i].replace(/^>\s?/, ''));
      blocks.push(<blockquote key={key}>{inline(quote.join(' '))}</blockquote>); continue;
    }
    const list = BULLET.test(line) ? BULLET : NUMBER.test(line) ? NUMBER : null;
    if (list) {
      const items: string[] = [];
      for (; i < lines.length && lines[i].trim(); i++) {
        if (list.test(lines[i])) items.push(lines[i].replace(list, ''));
        else if (/^\s+/.test(lines[i]) && items.length) items[items.length - 1] += ` ${lines[i].trim()}`;
        else break;
      }
      const Tag = list === BULLET ? 'ul' : 'ol';
      blocks.push(<Tag key={key}>{items.map((item, index) => <li key={index}>{inline(item)}</li>)}</Tag>); continue;
    }
    const paragraph: string[] = [];
    for (; i < lines.length && lines[i].trim() && (paragraph.length === 0 || !startsBlock(lines[i])); i++) paragraph.push(lines[i].trim());
    blocks.push(<p key={key}>{inline(paragraph.join(' '))}</p>);
  }
  return <>{blocks}</>;
}
