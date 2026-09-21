import { useMemo } from "react";

// Tokenize serialized JSON, never HTML. React escapes every token before rendering.
export function JsonCode({ value }: { value: unknown }) {
  const tokens = useMemo(() => {
    const json = JSON.stringify(value, null, 2) ?? "null";
    const pattern =
      /("(?:\\.|[^"\\])*"\s*:)|("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])/g;
    const result: { text: string; kind?: string }[] = [];
    let cursor = 0;
    for (const match of json.matchAll(pattern)) {
      if (match.index > cursor)
        result.push({ text: json.slice(cursor, match.index) });
      result.push({
        text: match[0],
        kind: match[1]
          ? "key"
          : match[2]
            ? "string"
            : match[3]
              ? "number"
              : match[4]
                ? "literal"
                : "punctuation",
      });
      cursor = match.index + match[0].length;
    }
    if (cursor < json.length) result.push({ text: json.slice(cursor) });
    return result;
  }, [value]);
  return (
    <pre className="json-code" tabIndex={0} aria-label="JSON request body">
      <code>
        {tokens.map((token, i) => (
          <span
            key={i}
            className={token.kind ? `json-${token.kind}` : undefined}
          >
            {token.text}
          </span>
        ))}
      </code>
    </pre>
  );
}
