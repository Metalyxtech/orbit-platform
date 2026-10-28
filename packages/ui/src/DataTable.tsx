import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  num?: boolean;
  width?: number | string;
  render: (row: T) => ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  selectedKey,
  onRowClick,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  selectedKey?: string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
}) {
  return (
    <table className="o-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} className={c.num ? 'num' : undefined} style={{ width: c.width }}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && empty ? (
          <tr>
            <td colSpan={columns.length}>{empty}</td>
          </tr>
        ) : (
          rows.map((r) => (
            <tr
              key={rowKey(r)}
              className={selectedKey === rowKey(r) ? 'selected' : undefined}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={c.num ? 'num' : undefined}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
