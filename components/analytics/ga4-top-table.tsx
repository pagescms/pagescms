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
import type { Ga4TopRow } from "@/lib/analytics/queries";

type Props = {
  rows: Ga4TopRow[];
  valueLabel: string;
  valueIsPath?: boolean;
};

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const num = (n: number) => new Intl.NumberFormat("en-US").format(n);

export function Ga4TopTable({ rows, valueLabel, valueIsPath }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "sessions", desc: true }]);

  const columns = useMemo<ColumnDef<Ga4TopRow>[]>(
    () => [
      {
        accessorKey: "value",
        header: valueLabel,
        cell: (info) => {
          const v = info.getValue<string>();
          const display = valueIsPath ? v : v || "(not set)";
          return <span className="text-sm break-all">{display}</span>;
        },
      },
      {
        accessorKey: "sessions",
        header: ({ column }) => (
          <Button variant="ghost" size="sm" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Sessions <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: (info) => <span className="tabular-nums">{num(info.getValue<number>())}</span>,
      },
      {
        accessorKey: "activeUsers",
        header: ({ column }) => (
          <Button variant="ghost" size="sm" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Users <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: (info) => <span className="tabular-nums">{num(info.getValue<number>())}</span>,
      },
      {
        accessorKey: "engagedSessions",
        header: ({ column }) => (
          <Button variant="ghost" size="sm" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Engaged <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: (info) => <span className="tabular-nums">{num(info.getValue<number>())}</span>,
      },
      {
        accessorKey: "engagementRate",
        header: ({ column }) => (
          <Button variant="ghost" size="sm" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Engagement rate <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: (info) => <span className="tabular-nums">{pct(info.getValue<number>())}</span>,
      },
    ],
    [valueLabel, valueIsPath],
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
