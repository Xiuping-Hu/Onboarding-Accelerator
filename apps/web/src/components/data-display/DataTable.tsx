import React, { type ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
    <Table className="min-w-180">
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column.id} scope="col">
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length > 0 ? (
          rows.map((row) => (
            <TableRow key={row.id}>
              {columns.map((column, cellIndex) => (
                <TableCell key={column.id}>{row.cells[cellIndex] ?? null}</TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell className="h-24 text-center text-muted-foreground" colSpan={columns.length}>
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
