/**
 * Programmatic access to design tokens for use in JS/TS code.
 * The canonical source is preset.css — keep these in sync.
 */

export const colors = {
  brand: {
    50: "#E6F3FF",
    100: "#CCE7FF",
    200: "#99CFFF",
    300: "#66B7FF",
    400: "#339FFF",
    500: "#007AFF",
    600: "#0062CC",
    700: "#004999",
    800: "#003166",
    900: "#001833",
  },
  bubble: {
    self: "#007AFF",
    other: "#E9E9EB",
    guide: "#F2F2F7",
  },
  system: {
    text: "#8E8E93",
  },
} as const;
