"use client";

// Tools view — three offline-capable calculators.
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { motion } from "framer-motion";
import { Calculator, Disc3, Layers, TrendingUp } from "lucide-react";
import { OneRmCalculator } from "./one-rm-calculator";
import { SetCalculator } from "./set-calculator";
import { PlateCalculator } from "./plate-calculator";

export function ToolsView() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title="Tools"
        subtitle="Calculators run entirely on your device — no connection needed"
        icon={<Calculator className="h-5 w-5" />}
      />

      <Tabs defaultValue="one-rm">
        <TabsList className="grid h-auto w-full grid-cols-3 sm:max-w-md">
          <TabsTrigger value="one-rm" className="gap-1.5 py-2.5">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">1RM</span>
          </TabsTrigger>
          <TabsTrigger value="set" className="gap-1.5 py-2.5">
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">Sets</span>
          </TabsTrigger>
          <TabsTrigger value="plate" className="gap-1.5 py-2.5">
            <Disc3 className="h-4 w-4" />
            <span className="hidden sm:inline">Plates</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="one-rm" className="mt-4">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <OneRmCalculator />
          </motion.div>
        </TabsContent>
        <TabsContent value="set" className="mt-4">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <SetCalculator />
          </motion.div>
        </TabsContent>
        <TabsContent value="plate" className="mt-4">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <PlateCalculator />
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
