import { Fragment, type ReactNode } from 'react';

function inline(source: string): ReactNode[] {
  const result: ReactNode[] = [];
  const token = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let offset = 0;
  for (const match of source.matchAll(token)) {
    const index = match.index ?? 0;
    if (index > offset) result.push(source.slice(offset, index));
    const value = match[0];
    if (value.startsWith('**')) result.push(<strong key={index} className="font-semibold text-slate-900">{value.slice(2, -2)}</strong>);
    else if (value.startsWith('`')) result.push(<code key={index} className="rounded bg-slate-100 px-1 py-0.5 text-[.88em]">{value.slice(1, -1)}</code>);
    else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(value);
      const href = link?.[2] || '';
      result.push(link && /^(https?:\/\/|\/|#)/i.test(href)
        ? <a key={index} href={href} className="text-indigo-700 underline underline-offset-2" target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}>{link[1]}</a>
        : <Fragment key={index}>{value}</Fragment>);
    }
    offset = index + value.length;
  }
  if (offset < source.length) result.push(source.slice(offset));
  return result;
}

function tableCells(line: string) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
}

function isTableRule(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

export function MarkdownDocument({ content }: { content: string }) {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push(<pre key={i} className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-5 text-slate-100"><code aria-label={language || 'Código'}>{code.join('\n')}</code></pre>);
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const className = level === 1 ? 'mt-2 text-2xl font-semibold text-slate-950' :
        level === 2 ? 'mt-9 border-b border-slate-200 pb-2 text-xl font-semibold text-slate-900' :
          'mt-6 text-base font-semibold text-slate-900';
      const text = heading[2];
      const id = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const props = { id, className, children: inline(text) };
      blocks.push(level === 1 ? <h1 key={i} {...props}/> : level === 2 ? <h2 key={i} {...props}/> : level === 3 ? <h3 key={i} {...props}/> : <h4 key={i} {...props}/>);
      i++;
      continue;
    }
    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableRule(lines[i + 1])) {
      const headers = tableCells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(tableCells(lines[i++]));
      blocks.push(<div key={i} className="overflow-x-auto rounded-lg border border-slate-200"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50"><tr>{headers.map((cell, index) => <th key={index} className="border-b px-3 py-2 font-semibold">{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className="border-t border-slate-100">{headers.map((_, cellIndex) => <td key={cellIndex} className="px-3 py-2 align-top leading-6">{inline(row[cellIndex] || '')}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\s*\d+\.\s+/.test(lines[i]) : /^\s*[-*]\s+/.test(lines[i])))
        items.push(lines[i++].replace(ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/, ''));
      const className = `space-y-1 pl-6 leading-7 ${ordered ? 'list-decimal' : 'list-disc'}`;
      blocks.push(ordered ? <ol key={i} className={className}>{items.map((item, n) => <li key={n}>{inline(item)}</li>)}</ol>
        : <ul key={i} className={className}>{items.map((item, n) => <li key={n}>{inline(item)}</li>)}</ul>);
      continue;
    }
    if (line.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) quote.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(<blockquote key={i} className="border-l-4 border-indigo-200 bg-indigo-50/50 px-4 py-3 leading-7 text-slate-700">{quote.map((part, index) => <p key={index}>{inline(part)}</p>)}</blockquote>);
      continue;
    }
    if (/^\s*---+\s*$/.test(line)) { blocks.push(<hr key={i} className="border-slate-200"/>); i++; continue; }
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*[-*]\s|\s*\d+\.\s|>|\|)/.test(lines[i])) paragraph.push(lines[i++].trim());
    if (paragraph.length) blocks.push(<p key={i} className="leading-7 text-slate-700">{inline(paragraph.join(' '))}</p>);
    else { blocks.push(<p key={i} className="leading-7 text-slate-700">{inline(lines[i])}</p>); i++; }
  }
  return <article className="space-y-4 text-sm text-slate-800 sm:text-[15px]">{blocks}</article>;
}
