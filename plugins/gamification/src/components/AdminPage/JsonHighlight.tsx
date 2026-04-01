import { useMemo } from 'react';
import hljs from 'highlight.js';
import 'highlight.js/styles/atom-one-dark.css';

type JsonHighlightProps = {
  value: unknown;
};

export const JsonHighlight = ({ value }: JsonHighlightProps) => {
  const highlightedHtml = useMemo(() => {
    const json = JSON.stringify(value ?? {}, null, 2);
    return hljs.highlight(json, { language: 'json' }).value;
  }, [value]);

  return (
    <pre
      style={{
        margin: '8px 0 0 0',
        padding: 14,
        background: '#1e1e11',
        border: '1px solid #555',
        borderRadius: 6,
        overflow: 'auto',
        minHeight: '18rem',
        maxHeight: '65vh',
        whiteSpace: 'pre',
        fontSize: 15,
        lineHeight: 1.6,
      }}
    >
      <code
        className="hljs language-json"
        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      />
    </pre>
  );
};
