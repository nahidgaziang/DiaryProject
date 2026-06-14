/**
 * Lightweight markdown renderer — zero dependencies.
 * Converts a subset of markdown to sanitized HTML for diary entries.
 *
 * Supported:
 *  # H1  ## H2  ### H3
 *  > Blockquote
 *  - bullet list / * bullet list
 *  1. ordered list
 *  ---  (horizontal rule)
 *  **bold**  *italic*  `inline code`
 *  Blank lines become paragraph breaks
 */
export function renderMarkdown(text: string): string {
  if (!text) return '';

  const lines = text.split('\n');
  const output: string[] = [];
  let inList = false;
  let listType: 'ul' | 'ol' | null = null;
  let inBlockquote = false;
  let blockquoteLines: string[] = [];

  const closeList = () => {
    if (inList && listType) {
      output.push(`</${listType}>`);
      inList = false;
      listType = null;
    }
  };

  const closeBlockquote = () => {
    if (inBlockquote && blockquoteLines.length > 0) {
      output.push(`<blockquote>${blockquoteLines.map(l => `<p>${inlineMarkdown(l)}</p>`).join('')}</blockquote>`);
      blockquoteLines = [];
      inBlockquote = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      closeList();
      closeBlockquote();
      output.push('<hr />');
      continue;
    }

    // Headings
    const h3Match = line.match(/^###\s+(.*)/);
    const h2Match = line.match(/^##\s+(.*)/);
    const h1Match = line.match(/^#\s+(.*)/);
    if (h1Match) {
      closeList(); closeBlockquote();
      output.push(`<h1>${inlineMarkdown(h1Match[1])}</h1>`);
      continue;
    }
    if (h2Match) {
      closeList(); closeBlockquote();
      output.push(`<h2>${inlineMarkdown(h2Match[1])}</h2>`);
      continue;
    }
    if (h3Match) {
      closeList(); closeBlockquote();
      output.push(`<h3>${inlineMarkdown(h3Match[1])}</h3>`);
      continue;
    }

    // Blockquote
    const bqMatch = line.match(/^>\s?(.*)/);
    if (bqMatch) {
      closeList();
      inBlockquote = true;
      blockquoteLines.push(bqMatch[1]);
      continue;
    } else if (inBlockquote) {
      closeBlockquote();
    }

    // Unordered list
    const ulMatch = line.match(/^[-*]\s+(.*)/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        closeList();
        output.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      output.push(`<li>${inlineMarkdown(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^\d+\.\s+(.*)/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        closeList();
        output.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      output.push(`<li>${inlineMarkdown(olMatch[1])}</li>`);
      continue;
    }

    // Blank line — close open blocks
    if (line.trim() === '') {
      closeList();
      closeBlockquote();
      output.push('<br />');
      continue;
    }

    // Close list if we hit a non-list line
    if (inList) closeList();

    // Regular paragraph
    output.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  // Close any still-open blocks
  closeList();
  closeBlockquote();

  return output.join('\n');
}

/**
 * Processes inline markdown within a single line:
 * **bold**, *italic*, `code`
 */
function inlineMarkdown(text: string): string {
  return text
    // Bold (must come before italic)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

/**
 * Strips all markdown syntax from a string, returning clean plain text.
 * Used for card 2-line preview text where we don't want raw symbols.
 */
export function stripMarkdown(text: string): string {
  if (!text) return '';
  return text
    .replace(/^#{1,3}\s+/gm, '')          // Headings
    .replace(/^[-*]\s+/gm, '')             // Bullet lists
    .replace(/^\d+\.\s+/gm, '')            // Ordered lists
    .replace(/^>\s?/gm, '')               // Blockquotes
    .replace(/^---+$/gm, '')              // Horizontal rules
    .replace(/\*\*(.+?)\*\*/g, '$1')      // Bold => plain
    .replace(/\*(.+?)\*/g, '$1')          // Italic => plain
    .replace(/`(.+?)`/g, '$1')            // Inline code => plain
    .replace(/\n{2,}/g, '\n')             // Collapse multiple newlines
    .trim();
}
