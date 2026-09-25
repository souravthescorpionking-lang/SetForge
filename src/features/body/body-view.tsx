"use client";

// Body feature entry: Track | History | Graph tabs over the measurement config.

import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { useMeasurements } from "@/lib/client/query";
import type { MeasurementDTO } from "@/lib/types";
import { Activity, History, LineChart, Settings2, TrendingUp } from "lucide-react";
import { TrackTab } from "./track-tab";
import { HistoryTab } from "./history-tab";
import { GraphTab } from "./graph-tab";
import { MeasurementConfigDialog } from "./measurement-config";

export function BodyView() {
  const { data, isLoading } = useMeasurements();
  const measurements: MeasurementDTO[] = useMemo(
    () => [...(data?.measurements ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [data],
  );

  const [configOpen, setConfigOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");

  // selection falls back to the default measurement until the user picks one
  const effectiveId = useMemo(() => {
    if (selectedId && measurements.some((m) => m.id === selectedId)) return selectedId;
    return measurements.find((m) => m.isDefault)?.id ?? measurements[0]?.id ?? "";
  }, [selectedId, measurements]);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Activity className="h-5 w-5" />}
        title="Body"
        subtitle="Track body measurements, watch trends and chase targets."
        actions={
          <Button variant="outline" className="gap-1.5" onClick={() => setConfigOpen(true)}>
            <Settings2 className="h-4 w-4" />
            Configure
          </Button>
        }
      />

      {isLoading && measurements.length === 0 ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-64 rounded-xl" />
          <Skeleton className="h-52 w-full rounded-2xl" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-48 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        </div>
      ) : (
        <Tabs defaultValue="track" className="gap-4">
          <TabsList className="h-11 w-full max-w-sm rounded-xl p-1">
            <TabsTrigger value="track" className="flex-1 gap-1.5">
              <TrendingUp className="h-4 w-4" />
              Track
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1 gap-1.5">
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
            <TabsTrigger value="graph" className="flex-1 gap-1.5">
              <LineChart className="h-4 w-4" />
              Graph
            </TabsTrigger>
          </TabsList>
          <TabsContent value="track" className="mt-0">
            <TrackTab
              measurements={measurements}
              loading={isLoading}
              onConfigure={() => setConfigOpen(true)}
            />
          </TabsContent>
          <TabsContent value="history" className="mt-0">
            <HistoryTab
              measurements={measurements}
              selectedId={effectiveId}
              onSelect={setSelectedId}
            />
          </TabsContent>
          <TabsContent value="graph" className="mt-0">
            <GraphTab
              measurements={measurements}
              selectedId={effectiveId}
              onSelect={setSelectedId}
            />
          </TabsContent>
        </Tabs>
      )}

      <MeasurementConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        measurements={measurements}
      />
    </div>
  );
}
