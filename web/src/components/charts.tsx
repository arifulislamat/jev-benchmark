import { BarChart, BoxplotChart, EffectScatterChart, HeatmapChart, LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useMemo, useRef } from "react";
import { cumulative, FIELDS, quartiles, type Run } from "@/lib/run";

echarts.use([
  LineChart,
  EffectScatterChart,
  BarChart,
  BoxplotChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

const INK = "#52514e";
const GRID_LINE = "#e6e5e1";
const money = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

const base = {
  animation: false,
  textStyle: { fontFamily: "inherit" },
  grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
  tooltip: { trigger: "item", borderWidth: 0, textStyle: { fontSize: 12 } },
};

const axisLine = { lineStyle: { color: GRID_LINE } };
const splitLine = { lineStyle: { color: GRID_LINE } };
const axisLabel = { color: INK, fontSize: 11 };

function useChart(option: unknown, height: number) {
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
    chart.current?.setOption(option as never, { notMerge: false, lazyUpdate: false });
  }, [option]);

  return <div ref={el} style={{ height }} className="w-full" />;
}

/** The race itself: cumulative answers against elapsed time, clipped to the playhead. */
export function RaceChart({ run, elapsed }: { run: Run; elapsed: number }) {
  const curves = useMemo(() => run.lanes.map((l) => cumulative(l, run.concurrency)), [run]);

  const option = useMemo(() => {
    const series = run.lanes.flatMap((l, i) => {
      const visible = curves[i].filter((p) => p.t <= elapsed);
      const pts = visible.map((p) => [p.t / 1000, p.n]);
      const head = visible.at(-1);
      const finished = visible.length === curves[i].length;

      return [
        {
          name: l.label,
          type: "line",
          showSymbol: false,
          // Curved rather than stepped. Every point is a real completion; the path
          // between them is a drawing choice either way. Monotone on x so the curve
          // can never dip, because a cumulative count never goes backwards.
          smooth: 0.35,
          smoothMonotone: "x",
          lineStyle: { width: 2.5, color: l.color, cap: "round", join: "round" },
          itemStyle: { color: l.color },
          emphasis: { focus: "series", lineStyle: { width: 3.5 } },
          z: 10 - i,
          // A wash under each line, strongest at the curve and gone by the axis.
          areaStyle: {
            opacity: 1,
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: `${l.color}1f` },
                { offset: 1, color: `${l.color}00` },
              ],
            },
          },
          endLabel: {
            show: pts.length > 0,
            formatter: () => (finished ? `${l.label}  ${(curves[i].at(-1)!.t / 1000).toFixed(1)}s` : l.label),
            color: l.color,
            fontSize: 12,
            fontWeight: 600,
            offset: [10, i % 2 === 0 ? -8 : 8],
          },
          data: pts,
        },
        // The head of each line: a dot that rides the curve while the race plays,
        // and settles on the finish once it is done.
        {
          name: l.label,
          type: "effectScatter",
          symbolSize: finished ? 7 : 9,
          showEffectOn: "render",
          rippleEffect: { scale: finished ? 0 : 3, brushType: "stroke", period: 3 },
          itemStyle: { color: l.color, borderColor: "#fff", borderWidth: 2 },
          tooltip: { show: false },
          legendHoverLink: false,
          silent: true,
          z: 5,
          data: head ? [[head.t / 1000, head.n]] : [],
        },
      ];
    });

    return {
      ...base,
      grid: { ...base.grid, right: 150, top: 36, bottom: 4 },
      tooltip: {
        ...base.tooltip,
        trigger: "axis",
        backgroundColor: "rgba(17,17,16,0.92)",
        borderRadius: 8,
        padding: [8, 12],
        textStyle: { color: "#fff", fontSize: 12 },
        axisPointer: { type: "line", lineStyle: { color: "#a8a7a1", type: "dashed" } },
        valueFormatter: (v: number) => `${v} answered`,
      },
      legend: {
        show: true,
        top: 0,
        right: 0,
        icon: "roundRect",
        itemWidth: 10,
        itemHeight: 3,
        itemGap: 16,
        textStyle: { color: INK, fontSize: 12 },
        data: run.lanes.map((l) => l.label),
      },
      xAxis: {
        type: "value",
        min: 0,
        max: Math.ceil(Math.max(...curves.map((c) => c.at(-1)!.t)) / 1000),
        axisLabel: { ...axisLabel, formatter: "{value}s", margin: 14 },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: run.dataset.n,
        axisLabel: { ...axisLabel, margin: 14 },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: GRID_LINE, type: "dashed" } },
      },
      series,
    };
  }, [run, curves, elapsed]);

  return useChart(option, 340);
}

/** What the same job costs, per model. Linear: Jev is the sliver, and that is the point. */
export function CostChart({ run }: { run: Run }) {
  const option = useMemo(() => {
    const lanes = [...run.lanes].sort((a, b) => b.cost - a.cost);
    return {
      ...base,
      grid: { ...base.grid, left: 8, right: 90 },
      tooltip: {
        ...base.tooltip,
        formatter: (p: { dataIndex: number }) => {
          const l = lanes[p.dataIndex];
          return `${l.label}<br/>${money(l.cost)} for ${run.dataset.n} tickets<br/>${money((l.cost / run.dataset.n) * 1e6)} per million`;
        },
      },
      xAxis: {
        type: "value",
        axisLabel: { ...axisLabel, formatter: (v: number) => `$${v.toFixed(2)}` },
        axisLine,
        splitLine,
      },
      yAxis: { type: "category", data: lanes.map((l) => l.label), axisLabel, axisLine, axisTick: { show: false } },
      series: [
        {
          type: "bar",
          barWidth: 18,
          itemStyle: { color: (p: { dataIndex: number }) => lanes[p.dataIndex].color, borderRadius: [0, 4, 4, 0] },
          label: {
            show: true,
            position: "right",
            color: INK,
            fontSize: 11,
            formatter: (p: { dataIndex: number }) => {
              const floor = Math.min(...lanes.map((l) => l.cost));
              const l = lanes[p.dataIndex];
              return `${money(l.cost)}  (${(l.cost / floor).toFixed(0)}x)`;
            },
          },
          data: lanes.map((l) => l.cost),
        },
      ],
    };
  }, [run]);

  return useChart(option, 200);
}

/** Per-request latency spread. A median hides the tail; a box does not. */
export function LatencyChart({ run }: { run: Run }) {
  const option = useMemo(() => {
    const lanes = run.lanes;
    return {
      ...base,
      grid: { ...base.grid, left: 8, right: 24 },
      tooltip: {
        ...base.tooltip,
        formatter: (p: { dataIndex: number; data: number[] }) => {
          const [, lo, q1, med, q3, hi] = p.data;
          return `${lanes[p.dataIndex].label}<br/>min ${lo.toFixed(0)}ms<br/>q1 ${q1.toFixed(0)}ms<br/>median ${med.toFixed(0)}ms<br/>q3 ${q3.toFixed(0)}ms<br/>max ${hi.toFixed(0)}ms`;
        },
      },
      xAxis: { type: "category", data: lanes.map((l) => l.label), axisLabel, axisLine, axisTick: { show: false } },
      yAxis: {
        type: "value",
        name: "ms per request",
        nameTextStyle: { color: INK, fontSize: 11, align: "left" },
        nameGap: 12,
        axisLabel,
        axisLine: { show: false },
        splitLine,
      },
      series: [
        {
          type: "boxplot",
          boxWidth: [12, 34],
          data: lanes.map((l, i) => ({
            value: quartiles(l.results.map((r) => r.ms)),
            itemStyle: { color: `${l.color}22`, borderColor: l.color, borderWidth: 2 },
            name: lanes[i].label,
          })),
        },
      ],
    };
  }, [run]);

  return useChart(option, 260);
}

/** Accuracy per question, graded against the other models' majority. */
export function AccuracyChart({ run }: { run: Run }) {
  const option = useMemo(
    () => ({
      ...base,
      tooltip: { ...base.tooltip, trigger: "axis", valueFormatter: (v: number) => `${v}%` },
      legend: { show: true, top: 0, left: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: INK, fontSize: 12 } },
      xAxis: { type: "category", data: [...FIELDS], axisLabel, axisLine, axisTick: { show: false } },
      yAxis: {
        type: "value",
        max: 100,
        axisLabel: { ...axisLabel, formatter: "{value}%" },
        axisLine: { show: false },
        splitLine,
      },
      series: run.lanes.map((l) => ({
        name: l.label,
        type: "bar",
        barMaxWidth: 22,
        itemStyle: { color: l.color, borderRadius: [4, 4, 0, 0] },
        data: FIELDS.map((f) => +((l.vs_consensus?.[f]?.acc ?? l.vs_spec[f].acc) * 100).toFixed(1)),
      })),
    }),
    [run],
  );

  return useChart(option, 300);
}

/** How often each pair of models gives the identical answer to all four questions. */
export function AgreementChart({ run }: { run: Run }) {
  const option = useMemo(() => {
    const names = run.lanes.map((l) => l.label);
    const data = run.agreement.flatMap((row, i) => row.map((v, j) => [j, i, +(v * 100).toFixed(1)]));
    return {
      ...base,
      grid: { ...base.grid, top: 12, left: 8, right: 8, bottom: 40 },
      tooltip: {
        ...base.tooltip,
        formatter: (p: { data: number[] }) =>
          `${names[p.data[1]]} and ${names[p.data[0]]}<br/>identical on ${p.data[2]}% of tickets`,
      },
      xAxis: { type: "category", data: names, axisLabel: { ...axisLabel, interval: 0 }, axisLine, splitArea: { show: true } },
      yAxis: { type: "category", data: names, axisLabel, axisLine, splitArea: { show: true } },
      visualMap: {
        min: 0,
        max: 100,
        calculable: false,
        show: false,
        inRange: { color: ["#fcfcfb", "#1baf7a"] },
      },
      series: [
        {
          type: "heatmap",
          data,
          label: { show: true, formatter: (p: { data: number[] }) => `${p.data[2]}%`, fontSize: 11 },
          itemStyle: { borderColor: "#fcfcfb", borderWidth: 2, borderRadius: 4 },
        },
      ],
    };
  }, [run]);

  return useChart(option, 300);
}
