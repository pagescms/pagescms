"use client";

import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type ColumnDef,
} from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TopRow } from "@/lib/analytics/queries";

type Props = {
  rows: TopRow[];
  /** "query" → value column is shown as plain text; "page" → rendered as a link */
  valueLabel: string;
  valueIsUrl?: boolean;
};

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const pos = (p: number | null) => (p == null ? "—" : p.toFixed(1));

export function TopTable({ rows, valueLabel, valueIsUrl }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "clicks", desc: true }]);

  const columns = useMemo<ColumnDef<TopRow>[]>(
    () => [
      {
        accessorKey: "value",
        header: valueLabel,
        cell: (info) => {
          const v = info.getValue<string>();
          return valueIsUrl ? (
            <a href={v} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline text-sm break-all">
              {v.replace(/^https?:\/\//, "")}
            </a>
          ) : (
            <span className="text-sm">{v}</span>
          );
        },
      },
      {
        accessorKey: "clicks",
        header: ({ column }) => (
          <Button variant="ghost" size="sm" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Clicks <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: (info) => <span className="tabular-nums">{info.getValue<number>()}</span>,
      },
      {
        accessorKey: "impressions",
        header: ({ column }) => (
          <Button variant="ghost" size="sm" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Impressions <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: (info) => <span className="tabular-nums">{info.getValue<number>()}</span>,
      },
      {
        accessorKey: "ctr",
        header: ({ column }) => (
          <Button variant="ghost" size="sm" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            CTR <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: (info) => <span className="tabular-nums">{pct(info.getValue<number>())}</span>,
      },
      {
        accessorKey: "position",
        header: ({ column }) => (
          <Button variant="ghost" size="sm" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Avg pos <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: (info) => <span className="tabular-nums">{pos(info.getValue<number | null>())}</span>,
      },
    ],
    [valueLabel, valueIsUrl],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((h) => (
                <TableHead key={h.id} className="h-9">
                  {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                No data yet for this window.
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
