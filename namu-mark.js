/**
 * Namu Mark Parser
 * Converts Namu Wiki markup syntax to HTML
 */

export function parseNamuMark(text) {
  if (!text) return '';

  let html = text;

  // Escape HTML special characters but preserve what we've added
  html = escapeHtml(html);

  // Process in order of priority (from most to least nested)

  // Code blocks (preserve content)
  html = html.replace(/\{{{([\s\S]*?)\}}}/g, (match, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Headings: ==text== becomes <h2>, ===text=== becomes <h3>, etc.
  html = html.replace(/^======\s*(.+?)\s*======$/gm, '<h6>$1</h6>');
  html = html.replace(/^=====\s*(.+?)\s*=====$/gm, '<h5>$1</h5>');
  html = html.replace(/^====\s*(.+?)\s*====$/gm, '<h4>$1</h4>');
  html = html.replace(/^===\s*(.+?)\s*===$/gm, '<h3>$1</h3>');
  html = html.replace(/^==\s*(.+?)\s*==$/gm, '<h2>$1</h2>');

  // Process lines for lists and other block elements
  const lines = html.split('\n');
  let inList = false;
  let inOrderedList = false;
  let listLevel = 0;
  const processedLines = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Check for unordered list: * item (can be nested with ** *** etc.)
    const unorderedMatch = line.match(/^(\*+)\s+(.+)$/);
    if (unorderedMatch) {
      const level = unorderedMatch[1].length;
      const content = unorderedMatch[2];

      if (!inList || level > listLevel) {
        for (let j = listLevel; j < level; j++) {
          processedLines.push('<ul>');
        }
        inList = true;
        inOrderedList = false;
      } else if (level < listLevel) {
        for (let j = level; j < listLevel; j++) {
          processedLines.push('</ul>');
        }
      }
      listLevel = level;
      processedLines.push(`<li>${content}</li>`);
      continue;
    }

    // Check for ordered list: 1. item, 2. item, etc.
    const orderedMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      const content = orderedMatch[2];

      if (!inOrderedList) {
        if (inList) {
          for (let j = 0; j < listLevel; j++) {
            processedLines.push('</ul>');
          }
        }
        processedLines.push('<ol>');
        inOrderedList = true;
        inList = false;
        listLevel = 1;
      }
      processedLines.push(`<li>${content}</li>`);
      continue;
    }

    // Not a list item
    if (inList) {
      for (let j = 0; j < listLevel; j++) {
        processedLines.push('</ul>');
      }
      inList = false;
      listLevel = 0;
    }
    if (inOrderedList) {
      processedLines.push('</ol>');
      inOrderedList = false;
    }

    processedLines.push(line);
  }

  // Close any open lists
  if (inList) {
    for (let j = 0; j < listLevel; j++) {
      processedLines.push('</ul>');
    }
  }
  if (inOrderedList) {
    processedLines.push('</ol>');
  }

  html = processedLines.join('\n');

  // Horizontal line: ----
  html = html.replace(/^-{4,}$/gm, '<hr>');

  // Bold: '''text'''
  html = html.replace(/'''(.+?)'''/g, '<strong>$1</strong>');

  // Italic: ''text''
  html = html.replace(/''(.+?)''/g, '<em>$1</em>');

  // Strikethrough: ~~text~~
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Underline: __text__
  html = html.replace(/__(.+?)__/g, '<u>$1</u>');

  // Links: [link|description] or [link]
  html = html.replace(/\[([^\|]+)\|([^\]]+)\]/g, '<a href="$1" target="_blank">$2</a>');
  html = html.replace(/\[([^\]]+)\]/g, '<a href="$1" target="_blank">$1</a>');

  // Line breaks
  html = html.split('\n').map(line => {
    // Skip if it's a block element
    if (line.match(/^<[a-z]/i)) {
      return line;
    }
    if (line.trim() === '') {
      return '</p>';
    }
    if (!line.match(/^<[a-z]/i) && line.trim() !== '') {
      return line;
    }
    return line;
  }).join('\n');

  // Wrap text content in paragraphs
  html = html.split('\n').reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return acc + '\n';
    }
    if (trimmed.match(/^<(h[1-6]|ul|ol|li|pre|hr|blockquote|code|table|p|strong|em|del|u|a)/i)) {
      return acc + line + '\n';
    }
    if (trimmed.match(/^<\/(ul|ol|p)/i)) {
      return acc + line + '\n';
    }
    if (trimmed.startsWith('<')) {
      return acc + line + '\n';
    }
    return acc + '<p>' + line + '</p>\n';
  }, '').trim();

  // Clean up multiple consecutive br tags
  html = html.replace(/(<br>\s*)+/g, '<br>');

  // Fix paragraph wrapping issues
  html = html.replace(/<p><(h[1-6]|ul|ol|pre|hr)/g, '<$1');
  html = html.replace(/<\/(h[1-6]|ul|ol|pre)><\/p>/g, '</$1');
  html = html.replace(/<p><\/p>/g, '');

  return html;
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Quick reference for Namu Mark syntax
export const NAMU_MARK_GUIDE = `
== Namu Mark 문법 ==

=== 제목 ===
== 제목 1 ==
=== 제목 2 ===
==== 제목 3 ====

=== 텍스트 스타일 ===
'''굵은 텍스트''' → bold
''기울인 텍스트'' → italic
~~취소선~~ → strikethrough
__밑줄__ → underline

=== 링크 ===
[https://example.com]
[https://example.com|링크 설명]

=== 목록 ===
* 항목 1
** 항목 1-1
*** 항목 1-1-1

1. 번호 항목 1
2. 번호 항목 2

=== 코드 ===
\{{{
function hello() {
  console.log("Hello");
}
}}}

=== 구분선 ===
----
`;
