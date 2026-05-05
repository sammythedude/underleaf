import type { InlineSegment } from '../../shared/types';

interface SegmentTextProps {
  segments: InlineSegment[];
  emptyFallback?: string;
}

export function SegmentText({ segments, emptyFallback = '' }: SegmentTextProps) {
  if (segments.length === 0) {
    return emptyFallback ? <span>{emptyFallback}</span> : null;
  }

  return (
    <>
      {segments.map((segment, index) => {
        const key = `${segment.type}-${index}`;
        switch (segment.type) {
          case 'bold':
            return <strong key={key}>{segment.value}</strong>;
          case 'italic':
            return <em key={key}>{segment.value}</em>;
          case 'underline':
            return (
              <span key={key} style={{ textDecoration: 'underline' }}>
                {segment.value}
              </span>
            );
          case 'math':
            return (
              <code key={key} className="inline-math">
                {segment.value}
              </code>
            );
          case 'linebreak':
            return <br key={key} />;
          default:
            return <span key={key}>{segment.value}</span>;
        }
      })}
    </>
  );
}
