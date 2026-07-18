import React, { type ReactNode } from 'react';

export interface DataTableColumn {
  header: ReactNode;
  id: string;
}

export interface DataTableRow {
  cells: ReactNode[];
  id: string;
}

export function DataTable({
  columns,
  emptyMessage = 'No records.',
  rows,
}: {
  columns: DataTableColumn[];
  emptyMessage?: ReactNode;
  rows: DataTableRow[];
}) {
  return (
    <div className="common-data-table-wrap">
      <table className="common-data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.id} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row) => (
              <tr key={row.id}>
                {columns.map((column, cellIndex) => (
                  <td key={column.id}>{row.cells[cellIndex] ?? null}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length}>{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
