export const MINUTE = 60000; // Assuming 1 minute equals 60000 milliseconds

export const stages = {
  0: [
    {
      min: 10 * MINUTE,
      max: 15 * MINUTE,
      indicator: "❕",
      buttonStyle: "Primary",
    },
    {
      min: 15 * MINUTE,
      max: 25 * MINUTE,
      indicator: "❗",
      buttonStyle: "Primary",
    },
    { min: 25 * MINUTE, max: Infinity, indicator: "⏰", buttonStyle: "Danger" },
  ],
  1: [
    {
      min: 20 * MINUTE,
      max: 30 * MINUTE,
      indicator: "❕",
      buttonStyle: "Primary",
    },
    {
      min: 30 * MINUTE,
      max: 50 * MINUTE,
      indicator: "❗",
      buttonStyle: "Primary",
    },
    { min: 50 * MINUTE, max: Infinity, indicator: "⏰", buttonStyle: "Danger" },
  ],
  2: [
    {
      min: 60 * MINUTE,
      max: 120 * MINUTE,
      indicator: "❕",
      buttonStyle: "Primary",
    },
    {
      min: 120 * MINUTE,
      max: 200 * MINUTE,
      indicator: "❗",
      buttonStyle: "Primary",
    },
    {
      min: 200 * MINUTE,
      max: Infinity,
      indicator: "⏰",
      buttonStyle: "Danger",
    },
  ],
  3: [
    {
      min: 120 * MINUTE,
      max: 240 * MINUTE,
      indicator: "❕",
      buttonStyle: "Primary",
    },
    {
      min: 240 * MINUTE,
      max: 320 * MINUTE,
      indicator: "❗",
      buttonStyle: "Primary",
    },
    {
      min: 320 * MINUTE,
      max: Infinity,
      indicator: "⏰",
      buttonStyle: "Danger",
    },
  ],
  4: [
    {
      min: 120 * MINUTE,
      max: 240 * MINUTE,
      indicator: "❕",
      buttonStyle: "Primary",
    },
    {
      min: 240 * MINUTE,
      max: 460 * MINUTE,
      indicator: "❗",
      buttonStyle: "Primary",
    },
    {
      min: 460 * MINUTE,
      max: Infinity,
      indicator: "⏰",
      buttonStyle: "Danger",
    },
  ],
  5: [
    {
      min: 240 * MINUTE,
      max: 480 * MINUTE,
      indicator: "❕",
      buttonStyle: "Primary",
    },
    {
      min: 480 * MINUTE,
      max: 720 * MINUTE,
      indicator: "❗",
      buttonStyle: "Primary",
    },
    {
      min: 720 * MINUTE,
      max: Infinity,
      indicator: "⏰",
      buttonStyle: "Danger",
    },
  ],
  default: [
    {
      min: 20 * MINUTE,
      max: 40 * MINUTE,
      indicator: "❕",
      buttonStyle: "Primary",
    },
    {
      min: 40 * MINUTE,
      max: 60 * MINUTE,
      indicator: "❗",
      buttonStyle: "Primary",
    },
    { min: 60 * MINUTE, max: Infinity, indicator: "⏰", buttonStyle: "Danger" },
  ],
};

export const actionTypes = {
  0: "Check",
  1: "Kill",
  2: "Poof",
  3: "Randomkill",
  4: "Mistake",
  5: "Daily",
};
