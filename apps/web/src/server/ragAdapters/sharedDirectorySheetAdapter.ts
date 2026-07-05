import { SharedDirectoryTextAdapter } from './sharedDirectoryBase';
import type { SharedDirectoryAdapterOptions } from './types';

export class SharedDirectorySheetAdapter extends SharedDirectoryTextAdapter {
  constructor(options: SharedDirectoryAdapterOptions) {
    super('shared-directory-sheets', 'shared_directory_sheet', ['.csv'], options);
  }

  protected normalizeText(_filePath: string, text: string): string {
    const rows = parseCsv(text);
    const [headers = [], ...dataRows] = rows;

    if (headers.length === 0) {
      return text;
    }

    return dataRows
      .map((row, index) => {
        const cells = headers.map((header, cellIndex) => `${header}: ${row[cellIndex] ?? ''}`);
        return `Row ${index + 1}. ${cells.join('; ')}`;
      })
      .join('\n\n');
  }
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') {
        index += 1;
      }
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  if (cell || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }

  return rows.filter((cells) => cells.some(Boolean));
}
