// lib/exportExcel.ts
// Export chart data + raw query results to a .xlsx file with two sheets.
// Sheet 1 "Chart Data" — only the columns shown in the chart
// Sheet 2 "Raw Data"  — all columns from the full query result
//
// Uses the `xlsx` package which is already installed.

import * as XLSX from 'xlsx';
import type { ChartSpec } from '@/components/AgentChart';

export interface RawDataRow {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Exports a chart's data + full raw query results to an Excel file.
 * @param chartSpec  The chart spec (contains data array used for the chart)
 * @param rawData    Full query result rows (all columns). If null, only Chart Data sheet is created.
 * @param filename   Optional filename (without extension). Defaults to "fundsagent-data-{date}"
 */
export function exportChartToExcel(
  chartSpec: ChartSpec,
  rawData:   RawDataRow[] | null,
  filename?: string
): void {
  const dateStr  = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const safeName = filename ?? `fundsagent-data-${dateStr}`;

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Chart Data ─────────────────────────────────────────────────────
  // Use the data array already inside the chart spec (already reduced to plotted columns)
  const chartRows = chartSpec.data ?? [];
  if (chartRows.length > 0) {
    const ws1 = XLSX.utils.json_to_sheet(chartRows);
    styleHeaderRow(ws1, Object.keys(chartRows[0]));
    XLSX.utils.book_append_sheet(wb, ws1, 'Chart Data');
  } else {
    // Empty chart data — add an empty sheet with a note
    const ws1 = XLSX.utils.aoa_to_sheet([['No chart data available']]);
    XLSX.utils.book_append_sheet(wb, ws1, 'Chart Data');
  }

  // ── Sheet 2: Raw Data ───────────────────────────────────────────────────────
  if (rawData && rawData.length > 0) {
    const ws2 = XLSX.utils.json_to_sheet(rawData);
    styleHeaderRow(ws2, Object.keys(rawData[0]));
    XLSX.utils.book_append_sheet(wb, ws2, 'Raw Data');
  } else {
    const ws2 = XLSX.utils.aoa_to_sheet([['No raw data available']]);
    XLSX.utils.book_append_sheet(wb, ws2, 'Raw Data');
  }

  // ── Download ────────────────────────────────────────────────────────────────
  XLSX.writeFile(wb, `${safeName}.xlsx`);
}

/**
 * Export a plain table (array of objects) as a single-sheet Excel file.
 * Useful for non-chart data exports.
 */
export function exportTableToExcel(
  rows:     RawDataRow[],
  sheetName: string = 'Data',
  filename?: string
): void {
  const dateStr  = new Date().toISOString().slice(0, 10);
  const safeName = filename ?? `fundsagent-export-${dateStr}`;

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ 'No data': '' }]);
  if (rows.length > 0) styleHeaderRow(ws, Object.keys(rows[0]));
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${safeName}.xlsx`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Bold the header row and auto-size columns (approximate).
 */
function styleHeaderRow(ws: XLSX.WorkSheet, headers: string[]): void {
  // Set column widths based on header length (min 10, max 40)
  ws['!cols'] = headers.map(h => ({
    wch: Math.min(Math.max(h.length + 4, 10), 40),
  }));

  // Bold header cells (row 0 = A1, B1, etc.)
  headers.forEach((_, i) => {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c: i });
    if (ws[cellAddr]) {
      ws[cellAddr].s = { font: { bold: true } };
    }
  });
}
