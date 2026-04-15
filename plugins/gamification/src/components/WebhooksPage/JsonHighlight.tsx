import { useMemo } from 'react';

type JsonHighlightProps = {
  value: unknown;
};

export const JsonHighlight = ({ value }: JsonHighlightProps) => {
  const formattedJson = useMemo(
    () => JSON.stringify(value ?? {}, null, 2),
    [value],
  );

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
      <code>{formattedJson}</code>
    </pre>
  );
};
