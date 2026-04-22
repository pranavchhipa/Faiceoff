/**
 * Markdown → PDF renderer for click-to-accept contracts.
 *
 * - Parses the markdown string via `marked.lexer()` into a token stream.
 * - Maps block/inline tokens to `@react-pdf/renderer` primitives.
 * - Returns a Node `Buffer` suitable for upload to R2.
 *
 * Font: Helvetica (system default) — good enough for MVP. If/when we need
 * devanagari rendering we will register Noto Sans here.
 *
 * Page: A4, 1 inch (72pt) margins.
 */

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { marked, type Token, type Tokens } from "marked";

const PAGE_MARGIN_PT = 72; // 1 inch

const styles = StyleSheet.create({
  page: {
    paddingTop: PAGE_MARGIN_PT,
    paddingBottom: PAGE_MARGIN_PT,
    paddingHorizontal: PAGE_MARGIN_PT,
    fontFamily: "Helvetica",
    fontSize: 11,
    lineHeight: 1.45,
    color: "#1a1513",
  },
  h1: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    marginBottom: 12,
    marginTop: 0,
  },
  h2: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginTop: 14,
    marginBottom: 6,
  },
  h3: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 10,
    marginBottom: 4,
  },
  paragraph: {
    fontSize: 11,
    marginBottom: 8,
  },
  listItem: {
    fontSize: 11,
    marginBottom: 4,
    flexDirection: "row",
  },
  listBullet: {
    width: 14,
  },
  listBody: {
    flex: 1,
  },
  table: {
    marginTop: 4,
    marginBottom: 10,
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#c9a96e",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5d9c2",
  },
  tableRowLast: {
    flexDirection: "row",
  },
  tableHeader: {
    backgroundColor: "#fdfbf7",
  },
  tableCell: {
    flex: 1,
    padding: 6,
    fontSize: 11,
  },
  tableCellHeader: {
    flex: 1,
    padding: 6,
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: "#c9a96e",
    paddingLeft: 10,
    marginVertical: 8,
    fontStyle: "italic",
    fontSize: 11,
  },
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: "#c9a96e",
    marginVertical: 10,
  },
  strong: {
    fontFamily: "Helvetica-Bold",
  },
  em: {
    fontFamily: "Helvetica-Oblique",
  },
  code: {
    fontFamily: "Courier",
    fontSize: 10,
    backgroundColor: "#f4efe5",
  },
});

/**
 * Render a list of inline tokens as a sequence of styled <Text> runs.
 * Nested within a <Text> (which is what @react-pdf/renderer requires).
 */
function renderInlineTokens(
  tokens: Tokens.Generic[] | undefined,
  keyPrefix: string,
): React.ReactNode[] {
  if (!tokens || tokens.length === 0) return [];
  return tokens.map((t, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (t.type) {
      case "text": {
        // `text` inline tokens may themselves have nested tokens (e.g. from a
        // list_item shell). Recurse if so.
        const inner = (t as Tokens.Text).tokens;
        if (inner && inner.length > 0) {
          return (
            <Text key={key}>{renderInlineTokens(inner, key)}</Text>
          );
        }
        return <Text key={key}>{(t as Tokens.Text).text}</Text>;
      }
      case "strong":
        return (
          <Text key={key} style={styles.strong}>
            {renderInlineTokens((t as Tokens.Strong).tokens, key)}
          </Text>
        );
      case "em":
        return (
          <Text key={key} style={styles.em}>
            {renderInlineTokens((t as Tokens.Em).tokens, key)}
          </Text>
        );
      case "codespan":
        return (
          <Text key={key} style={styles.code}>
            {(t as Tokens.Codespan).text}
          </Text>
        );
      case "del":
        // Render struck-through text as plain with a bracketed annotation —
        // @react-pdf supports textDecoration but only for block text; easier to
        // just emit the text. Not expected in our contracts.
        return (
          <Text key={key}>
            {renderInlineTokens((t as Tokens.Del).tokens, key)}
          </Text>
        );
      case "link":
        return (
          <Text key={key} style={styles.strong}>
            {(t as Tokens.Link).text}
          </Text>
        );
      case "br":
        return <Text key={key}>{"\n"}</Text>;
      case "escape":
        return <Text key={key}>{(t as Tokens.Escape).text}</Text>;
      case "html":
        // Strip tags, preserve text
        return (
          <Text key={key}>
            {(t as Tokens.HTML).text.replace(/<[^>]+>/g, "")}
          </Text>
        );
      default: {
        // Unknown token — render raw text if present
        const fallback = t as unknown as { text?: unknown };
        if (typeof fallback.text === "string") {
          return <Text key={key}>{fallback.text}</Text>;
        }
        return null;
      }
    }
  });
}

function renderBlockToken(
  token: Token,
  key: string,
): React.ReactNode | null {
  switch (token.type) {
    case "heading": {
      const h = token as Tokens.Heading;
      const style =
        h.depth === 1 ? styles.h1 : h.depth === 2 ? styles.h2 : styles.h3;
      return (
        <Text key={key} style={style}>
          {renderInlineTokens(h.tokens, key)}
        </Text>
      );
    }
    case "paragraph": {
      const p = token as Tokens.Paragraph;
      return (
        <Text key={key} style={styles.paragraph}>
          {renderInlineTokens(p.tokens, key)}
        </Text>
      );
    }
    case "list": {
      const l = token as Tokens.List;
      return (
        <View key={key}>
          {l.items.map((item, idx) => {
            const bullet = l.ordered ? `${(l.start || 1) + idx}.` : "\u2022";
            return (
              <View key={`${key}-i${idx}`} style={styles.listItem}>
                <Text style={styles.listBullet}>{bullet} </Text>
                <Text style={styles.listBody}>
                  {renderInlineTokens(item.tokens, `${key}-i${idx}`)}
                </Text>
              </View>
            );
          })}
        </View>
      );
    }
    case "table": {
      const t = token as Tokens.Table;
      const totalRows = 1 + t.rows.length;
      return (
        <View key={key} style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            {t.header.map((cell, hi) => (
              <Text
                key={`${key}-h${hi}`}
                style={styles.tableCellHeader}
              >
                {renderInlineTokens(cell.tokens, `${key}-h${hi}`)}
              </Text>
            ))}
          </View>
          {t.rows.map((row, ri) => (
            <View
              key={`${key}-r${ri}`}
              style={ri === t.rows.length - 1 && totalRows > 1
                ? styles.tableRowLast
                : styles.tableRow}
            >
              {row.map((cell, ci) => (
                <Text
                  key={`${key}-r${ri}c${ci}`}
                  style={styles.tableCell}
                >
                  {renderInlineTokens(cell.tokens, `${key}-r${ri}c${ci}`)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
    }
    case "blockquote": {
      const bq = token as Tokens.Blockquote;
      return (
        <View key={key} style={styles.blockquote}>
          {bq.tokens.map((child, ci) =>
            renderBlockToken(child, `${key}-bq${ci}`),
          )}
        </View>
      );
    }
    case "code": {
      const c = token as Tokens.Code;
      return (
        <Text key={key} style={styles.code}>
          {c.text}
        </Text>
      );
    }
    case "hr":
      return <View key={key} style={styles.hr} />;
    case "space":
      return null;
    case "html":
      // Strip simple HTML fragments to plain text
      return (
        <Text key={key} style={styles.paragraph}>
          {(token as Tokens.HTML).text.replace(/<[^>]+>/g, "")}
        </Text>
      );
    default:
      return null;
  }
}

function ContractDocument({ tokens }: { tokens: Token[] }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {tokens.map((t, i) => renderBlockToken(t, `b-${i}`))}
      </Page>
    </Document>
  );
}

export async function renderContractPdf(markdown: string): Promise<Buffer> {
  const tokens = marked.lexer(markdown);
  const buf = await renderToBuffer(<ContractDocument tokens={tokens} />);
  return buf;
}
