import React from 'react';

interface WhatsAppTextProps {
  text: string;
  className?: string;
}

/**
 * Parsea e interpreta la sintaxis de formato de WhatsApp:
 * - *negrita* -> <strong>
 * - _cursiva_ -> <em>
 * - ~tachado~ -> <del>
 * - ```código bloque``` -> <code>
 * - `código inline` -> <code>
 * - URLs -> <a> clickeables
 * - Saltos de línea y emojis
 */
export const WhatsAppText: React.FC<WhatsAppTextProps> = ({ text, className = '' }) => {
  if (!text) return null;

  const renderFormattedText = (content: string): React.ReactNode[] => {
    // Regex para capturar tokens de WhatsApp: code blocks, inline code, bold, italic, strikethrough, URLs
    const tokenRegex = /(```[\s\S]*?```|`[^`\n]+`|\*(?!\s)([^\*\n]+?)(?<!\s)\*|_(?!\s)([^_\n]+?)(?<!\s)_|~(?!\s)([^~\n]+?)(?<!\s)~|https?:\/\/[^\s]+)/g;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(content.substring(lastIndex, match.index));
      }

      const matchedText = match[0];

      if (matchedText.startsWith('```') && matchedText.endsWith('```')) {
        const codeContent = matchedText.slice(3, -3);
        parts.push(
          <pre
            key={match.index}
            className="font-mono bg-black/10 dark:bg-black/30 p-1.5 rounded my-1 text-[11px] whitespace-pre-wrap overflow-x-auto"
          >
            {codeContent}
          </pre>
        );
      } else if (matchedText.startsWith('`') && matchedText.endsWith('`')) {
        const codeContent = matchedText.slice(1, -1);
        parts.push(
          <code
            key={match.index}
            className="font-mono bg-black/10 dark:bg-black/30 px-1 py-0.5 rounded text-[11px]"
          >
            {codeContent}
          </code>
        );
      } else if (matchedText.startsWith('*') && matchedText.endsWith('*')) {
        const boldContent = matchedText.slice(1, -1);
        parts.push(
          <strong key={match.index} className="font-bold">
            {renderFormattedText(boldContent)}
          </strong>
        );
      } else if (matchedText.startsWith('_') && matchedText.endsWith('_')) {
        const italicContent = matchedText.slice(1, -1);
        parts.push(
          <em key={match.index} className="italic">
            {renderFormattedText(italicContent)}
          </em>
        );
      } else if (matchedText.startsWith('~') && matchedText.endsWith('~')) {
        const strikeContent = matchedText.slice(1, -1);
        parts.push(
          <del key={match.index} className="line-through opacity-80">
            {renderFormattedText(strikeContent)}
          </del>
        );
      } else if (matchedText.startsWith('http://') || matchedText.startsWith('https://')) {
        parts.push(
          <a
            key={match.index}
            href={matchedText}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 underline hover:opacity-80 break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {matchedText}
          </a>
        );
      }

      lastIndex = tokenRegex.lastIndex;
    }

    if (lastIndex < content.length) {
      parts.push(content.substring(lastIndex));
    }

    return parts;
  };

  return (
    <span className={`whitespace-pre-wrap break-words leading-relaxed ${className}`}>
      {renderFormattedText(text)}
    </span>
  );
};
