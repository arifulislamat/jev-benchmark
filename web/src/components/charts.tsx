import {
  BarChart,
  BoxplotChart,
  EffectScatterChart,
  HeatmapChart,
  LineChart,
} from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { cumulative, FIELDS, quartiles, type Run } from "@/lib/run";
import { modelColor, modelFill } from "@/lib/presentation";

echarts.use([
  LineChart,
  BarChart,
  BoxplotChart,
  EffectScatterChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

const INK = "#514b43";
const GRID = "#ded8cd";
const money = (n: number) => `$${n.toFixed(4)}`;
const axisLabel = {
  color: INK,
  fontSize: 14,
  hideOverlap: true,
  lineHeight: 19,
  formatter: (value: string | number) =>
    String(value)
      .replace("Claude ", "Claude\n")
      .replace("Gemini ", "Gemini\n")
      .replace("GPT-", "GPT-\n"),
};
const axisLine = { lineStyle: { color: GRID } };
const splitLine = { lineStyle: { color: GRID, type: "dashed" } };
const legend = {
  type: "scroll",
  top: 0,
  left: 0,
  right: 0,
  itemWidth: 16,
  itemHeight: 10,
  textStyle: { color: INK, fontSize: 15 },
};
const base = {
  animation: false,
  textStyle: { fontFamily: "Geist Variable, sans-serif" },
  grid: { left: 0, right: 16, top: 24, bottom: 8, containLabel: true },
  tooltip: {
    trigger: "item",
    confine: true,
    borderWidth: 1,
    borderColor: GRID,
    textStyle: { fontSize: 15 },
  },
};

function useChart(option: unknown, height: number, description: string) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    if (!el.current) return;
    chart.current = echarts.init(el.current, undefined, { renderer: "canvas" });
    const ro = new ResizeObserver(() => chart.current?.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      chart.current?.dispose();
    };
  }, []);
  useEffect(() => {
    chart.current?.setOption(option as never, { notMerge: false });
  }, [option]);
  return (
    <div
      ref={el}
      style={{ height }}
      className="w-full min-w-0"
      role="img"
      aria-label={description}
    />
  );
}

const motionPreference = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)");
const subscribeMotion = (notify: () => void) => {
  const query = motionPreference();
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};

export function RaceChart({ run, elapsed }: { run: Run; elapsed: number }) {
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    () => motionPreference().matches,
    () => true,
  );
  const curves = useMemo(
    () => run.lanes.map((l) => cumulative(l, run.concurrency)),
    [run],
  );
  const option = useMemo(
    () => ({
      ...base,
      grid: { ...base.grid, top: 40 },
      legend: { show: false },
      tooltip: { ...base.tooltip, trigger: "axis" },
      xAxis: {
        type: "value",
        min: 0,
        max: Math.ceil(Math.max(...curves.map((c) => c.at(-1)!.t)) / 1000),
        axisLabel: { ...axisLabel, formatter: "{value} s" },
        axisLine,
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: run.dataset.n,
        axisLabel,
        axisLine: { show: false },
        splitLine,
      },
      series: run.lanes.flatMap((l, i) => {
        const visible = curves[i].filter((p) => p.t <= elapsed);
        const head = visible.at(-1);
        const finished = visible.length === curves[i].length;
        return [
          {
            id: `${l.key}-line`,
            name: l.label,
            type: "line",
            step: "end",
            showSymbol: false,
            lineStyle: {
              width: 2.5,
              color: modelColor(l.key),
              cap: "round",
              join: "round",
              type: "solid",
            },
            itemStyle: { color: modelColor(l.key) },
            areaStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: `${modelColor(l.key)}16` },
                  { offset: 1, color: `${modelColor(l.key)}00` },
                ],
              },
            },
            emphasis: { focus: "series", lineStyle: { width: 3.5 } },
            // Rounded steps retain the recorded completion counts without interpolation.
            data: [[0, 0], ...visible.map((p) => [p.t / 1000, p.n])],
            z: 5,
          },
          {
            id: `${l.key}-head`,
            name: l.label,
            type: "effectScatter",
            symbolSize: finished ? 8 : 10,
            showEffectOn: "render",
            rippleEffect: {
              scale: reducedMotion || finished ? 1 : 2.5,
              brushType: "stroke",
              period: 2.5,
            },
            itemStyle: {
              color: modelColor(l.key),
              borderColor: "#fff",
              borderWidth: 2,
            },
            tooltip: { show: false },
            silent: true,
            z: 10,
            data: head ? [[head.t / 1000, head.n]] : [],
          },
        ];
      }),
    }),
    [run, curves, elapsed, reducedMotion],
  );
  const plot = useChart(
    option,
    350,
    "Completed requests over elapsed seconds. Colors and the legend identify models. Measured wall times for each model are in the metrics table.",
  );
  return (
    <>
      <ul className="model-legend" aria-label="Chart legend">
        {run.lanes.map((l) => (
          <li key={l.key}>
            <svg width="30" height="16" aria-hidden="true">
              <line
                x1="0"
                x2="30"
                y1="8"
                y2="8"
                stroke={modelColor(l.key)}
                strokeWidth="3"
              />
            </svg>
            <span>{l.label}</span>
          </li>
        ))}
      </ul>
      {plot}
    </>
  );
}

export function CostChart({ run }: { run: Run }) {
  const option = useMemo(
    () => ({
      ...base,
      grid: { ...base.grid, right: 85 },
      tooltip: {
        ...base.tooltip,
        formatter: (p: { dataIndex: number }) =>
          `${run.lanes[p.dataIndex].label}<br/>${money(run.lanes[p.dataIndex].cost)} for ${run.dataset.n} tickets`,
      },
      xAxis: {
        type: "value",
        min: 0,
        splitNumber: 2,
        axisLabel: {
          ...axisLabel,
          formatter: (v: number) => `$${v.toFixed(2)}`,
        },
        axisLine,
        splitLine,
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: run.lanes.map((l) => l.label),
        axisLabel,
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          type: "bar",
          barWidth: 20,
          itemStyle: {
            color: (p: { dataIndex: number }) =>
              modelFill(run.lanes[p.dataIndex].key),
            borderRadius: [0, 5, 5, 0],
          },
          label: {
            show: true,
            position: "right",
            color: INK,
            fontSize: 15,
            formatter: (p: { dataIndex: number }) => {
              const l = run.lanes[p.dataIndex];
              return money(l.cost);
            },
          },
          data: run.lanes.map((l) => ({
            value: l.cost,
            itemStyle: { borderColor: modelColor(l.key), borderWidth: 1.5 },
          })),
        },
      ],
    }),
    [run],
  );
  return useChart(
    option,
    280,
    `API cost in USD: ${run.lanes.map((l) => `${l.label} ${money(l.cost)}`).join(", ")}.`,
  );
}

export function LatencyChart({ run }: { run: Run }) {
  const option = useMemo(
    () => ({
      ...base,
      tooltip: {
        ...base.tooltip,
        formatter: (p: { dataIndex: number }) => {
          const l = run.lanes[p.dataIndex];
          const values = quartiles(l.results.map((r) => r.ms));
          return `${l.label}<br/>${values.map((v, i) => `${["Min", "Q1", "Median", "Q3", "Max"][i]}: ${(v / 1000).toFixed(3)} s`).join("<br/>")}`;
        },
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: run.lanes.map((l) => l.label),
        axisLabel,
        axisLine: { show: false },
        axisTick: { show: false },
      },
      xAxis: {
        type: "value",
        min: 0,
        splitNumber: 4,
        axisLabel: { ...axisLabel, formatter: (v: number) => `${v / 1000} s` },
        axisLine,
        splitLine,
      },
      series: [
        {
          type: "boxplot",
          layout: "horizontal",
          boxWidth: [12, 26],
          data: run.lanes.map((l) => ({
            value: quartiles(l.results.map((r) => r.ms)),
            itemStyle: {
              color: modelFill(l.key),
              borderColor: modelColor(l.key),
              borderWidth: 2,
            },
          })),
        },
      ],
    }),
    [run],
  );
  return useChart(
    option,
    280,
    "Request latency distributions in seconds. Boxes show the interquartile range, with median lines and minimum to maximum whiskers. Median and p95 values appear in the metrics table.",
  );
}

export function AccuracyChart({
  run,
  grading,
}: {
  run: Run;
  grading: "consensus" | "spec";
}) {
  const option = useMemo(
    () => ({
      ...base,
      grid: { ...base.grid, top: 48 },
      legend,
      tooltip: {
        ...base.tooltip,
        trigger: "axis",
        valueFormatter: (v: number) => (v == null ? "N/A" : `${v}%`),
      },
      xAxis: {
        type: "category",
        data: ["Team", "Urgency", "Refund", "Angry"],
        axisLabel: { ...axisLabel, interval: 0 },
        axisLine,
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 100,
        axisLabel: { ...axisLabel, formatter: "{value}%" },
        axisLine: { show: false },
        splitLine,
      },
      series: run.lanes.map((l) => ({
        name: l.label,
        type: "bar",
        barMaxWidth: 24,
        itemStyle: {
          color: modelFill(l.key),
          borderColor: modelColor(l.key),
          borderWidth: 1.5,
          borderRadius: [4, 4, 0, 0],
        },
        data: FIELDS.map((f) => {
          const stat =
            grading === "consensus" ? l.vs_consensus?.[f] : l.vs_spec[f];
          return stat ? +(stat.acc * 100).toFixed(1) : null;
        }),
      })),
    }),
    [run, grading],
  );
  return useChart(
    option,
    300,
    `Agreement with ${grading === "consensus" ? "other models" : "generated labels"} by question. Exact percentages and sample counts follow in the table.`,
  );
}

export function AgreementChart({ run }: { run: Run }) {
  const option = useMemo(() => {
    const names = run.lanes.map((l) => l.label);
    return {
      ...base,
      grid: { ...base.grid, top: 12, bottom: 16 },
      tooltip: {
        ...base.tooltip,
        formatter: (p: { data: number[] }) =>
          `${names[p.data[1]]} and ${names[p.data[0]]}<br/>Identical on ${p.data[2]}% of tickets`,
      },
      xAxis: {
        type: "category",
        data: names,
        axisLabel: {
          ...axisLabel,
          interval: 0,
          formatter: (v: string) => v.replaceAll(" ", "\n"),
        },
        axisLine,
        axisTick: { show: false },
      },
      yAxis: {
        type: "category",
        data: names,
        axisLabel,
        axisLine,
        axisTick: { show: false },
      },
      visualMap: {
        min: 0,
        max: 100,
        show: false,
        inRange: { color: ["#f3f6fa", "#94b3d1"] },
      },
      series: [
        {
          type: "heatmap",
          data: run.agreement.flatMap((row, i) =>
            row.map((v, j) => [j, i, +(v * 100).toFixed(1)]),
          ),
          label: {
            show: true,
            formatter: (p: { data: number[] }) => `${p.data[2]}%`,
            fontSize: 15,
            color: "#29251f",
          },
          itemStyle: { borderColor: "#fff", borderWidth: 3 },
        },
      ],
    };
  }, [run]);
  return useChart(
    option,
    360,
    `Pairwise exact agreement: ${run.lanes.flatMap((l, i) => run.lanes.slice(i + 1).map((other, j) => `${l.label} and ${other.label}: ${(run.agreement[i][i + j + 1] * 100).toFixed(1)}%`)).join("; ")}.`,
  );
}
