"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Part 6 — Dictionary (§4.9). Searchable training-methods glossary.
// TermRow 56 → inline expand (max 160px) with definition + "Used in SetForge".
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, SubBar, ScrollBody } from "@/components/layout";
import { dictionaryApi } from "@/lib/client/api";
import type { DictionaryTermDTO } from "@/lib/types";
import { hapticTap } from "@/lib/client/haptics";

export default function DictionaryScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ["dictionary"],
    queryFn: () => dictionaryApi.get(),
    staleTime: 10 * 60 * 1000,
  });
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const terms = useMemo(() => {
    const all = data?.terms ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((t) => t.term.toLowerCase().includes(q) || t.definition.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <Screen
      topBar={
        <TopBar
          leading={
            <button
              type="button"
              aria-label="Go back"
              className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-accent/40"
              onClick={() => {
                hapticTap();
                window.history.back();
              }}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          }
          title="Dictionary"
        />
      }
      subBar={
        <SubBar>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
              placeholder="Search terms"
            aria-label="Search dictionary terms"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
        </SubBar>
      }
    >
      <ScrollBody>
        {isLoading ? (
          <p className="p-4 text-xs text-muted-foreground" aria-busy="true">Loading terms…</p>
        ) : terms.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
            No terms match “{search}”
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {terms.map((t: DictionaryTermDTO) => {
              const open = expanded === t.term;
              return (
                <section key={t.term} className="flex flex-none flex-col overflow-hidden rounded-lg border bg-card">
                  <button
                    type="button"
                    data-row
                    aria-expanded={open}
                    className="flex h-14 select-none items-center gap-2 overflow-hidden whitespace-nowrap pl-3 pr-2 text-left hover:bg-accent/40"
                    onClick={() => {
                      hapticTap();
                      setExpanded(open ? null : t.term);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.term}</span>
                    <span className="w-[180px] flex-none truncate text-xs text-muted-foreground">{t.definition}</span>
                  </button>
                  <div
                    className="grid transition-[grid-template-rows] duration-200 ease-out"
                    style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
                  >
                    <div className="min-h-0 overflow-hidden">
                      {open ? (
                        <div className="flex flex-col gap-1 border-t px-3 py-2">
                          <p className="max-h-[160px] overflow-y-auto text-xs leading-5 text-foreground">{t.definition}</p>
                          {t.setforge ? (
                            <p className="text-xs leading-5 text-muted-foreground">
                              <span className="font-semibold">Used in SetForge as:</span> {t.setforge}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </ScrollBody>
    </Screen>
  );
}
