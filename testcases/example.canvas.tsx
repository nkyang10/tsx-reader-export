import {
  Callout,
  H1,
  H2,
  Row,
  Stack,
  Stat,
  Text,
  useHostTheme,
} from "cursor/canvas";

// A synthetic sample canvas. It deliberately exercises the same parts of the
// public cursor/canvas surface the tool must support - theme tokens via
// useHostTheme(), the typography/layout/stat/callout primitives, and a
// hand-rolled grid with token-driven cell colours.

type Cell = {
  service: string;
  check: string;
  status: "success" | "failed" | "partial";
  note: string;
};

const rows: Cell[] = [
  { service: "web-billing", check: "GET /api/invoices", status: "success", note: "200 in 84 ms" },
  { service: "web-billing", check: "POST /api/invoices", status: "success", note: "201 in 142 ms" },
  { service: "auth-service", check: "POST /oauth/token", status: "failed", note: "500 upstream" },
  { service: "auth-service", check: "GET /oauth/introspect", status: "partial", note: "1 of 2 regions" },
  { service: "reporting", check: "GET /reports/daily", status: "success", note: "200 in 1.2 s" },
  { service: "reporting", check: "GET /reports/weekly", status: "failed", note: "timed out" },
  { service: "search", check: "GET /search?q=invoice", status: "success", note: "200 in 210 ms" },
  { service: "search", check: "GET /search?q=receipt", status: "partial", note: "degraded" },
];

const statusColor = (theme: ReturnType<typeof useHostTheme>, status: Cell["status"]) => {
  switch (status) {
    case "success":
      return theme.diff.insertedLine;
    case "failed":
      return theme.diff.removedLine;
    default:
      return theme.category.yellow;
  }
};

function StatusGrid() {
  const theme = useHostTheme();
  const columns = "minmax(200px, 2fr) minmax(220px, 2fr) 120px minmax(200px, 1fr)";

  return (
    <div
      style={{
        border: `1px solid ${theme.stroke.secondary}`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: columns,
          backgroundColor: theme.bg.chrome,
          color: theme.text.primary,
          fontWeight: 600,
        }}
      >
        {["Service", "Check", "Status", "Note"].map((heading) => (
          <div
            key={heading}
            style={{ padding: 10, borderRight: `1px solid ${theme.stroke.tertiary}` }}
          >
            {heading}
          </div>
        ))}
      </div>

      {rows.map((row) => (
        <div
          key={`${row.service}-${row.check}`}
          style={{
            display: "grid",
            gridTemplateColumns: columns,
            color: theme.text.primary,
            borderTop: `1px solid ${theme.stroke.tertiary}`,
          }}
        >
          <div style={{ padding: 10, backgroundColor: theme.bg.editor }}>{row.service}</div>
          <div style={{ padding: 10, backgroundColor: theme.bg.editor }}>{row.check}</div>
          <div
            style={{
              padding: 10,
              backgroundColor: statusColor(theme, row.status),
              textTransform: "capitalize",
            }}
          >
            {row.status}
          </div>
          <div style={{ padding: 10, backgroundColor: theme.bg.editor }}>{row.note}</div>
        </div>
      ))}
    </div>
  );
}

export default function ServiceHealth() {
  return (
    <Stack gap={20} style={{ padding: 24, maxWidth: 1100 }}>
      <Stack gap={8}>
        <H1>Service health sample</H1>
        <Text tone="secondary">
          A synthetic canvas used to exercise the converter. It calls the same
          cursor/canvas primitives a real canvas does, and reads design tokens
          through useHostTheme().
        </Text>
      </Stack>

      <Row gap={24} align="start">
        <Stat value="8" label="Checks in this sample" />
        <Stat value="4" label="Services" tone="success" />
        <Stat value="2" label="Failing" tone="warning" />
        <Stat value="Sample" label="Not real data" tone="info" />
      </Row>

      <Callout tone="info" title="This is a fixture">
        Every value on this page is invented. It exists so the converter and the
        viewer can be verified end to end.
      </Callout>

      <Stack gap={10}>
        <H2>Checks by service</H2>
        <StatusGrid />
        <Text size="small" tone="tertiary">
          Cell colours come from theme.diff and theme.category tokens.
        </Text>
      </Stack>

      <Stack gap={8}>
        <H2>How to read it</H2>
        <Text>
          A green cell means the check passed, a red cell means it failed, and a
          yellow cell means it partially succeeded.
        </Text>
        <Text>
          Replace this file with your own canvas .tsx to convert something real.
        </Text>
      </Stack>
    </Stack>
  );
}
