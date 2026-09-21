// Presentation only. Recorded lane colors and measurements are untouched.
// Outlines exceed 3:1 against white for graphical contrast. Text uses darker ink.
export const MODEL_COLORS: Record<string, string> = {
  jev: "#8870c7",
  sonnet: "#c37545",
  gpt: "#4b7fc7",
  gemini: "#18876c",
};
const MODEL_FILLS: Record<string, string> = {
  jev: "#d7caf1",
  sonnet: "#f4cfb4",
  gpt: "#bbd1f1",
  gemini: "#a7dfd0",
};
export const modelColor = (key: string) => MODEL_COLORS[key] ?? "#514b43";
export const modelFill = (key: string) => MODEL_FILLS[key] ?? "#d5d9d6";
