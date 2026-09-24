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
  stone: {
    50: "#F5F1EA",
    100: "#ECE6DB",
    200: "#DDD5C6",
    300: "#C9BEAB",
  },
  ink: {
    500: "#4A5670",
    700: "#2A3654",
    900: "#14213D",
  },
  brick: {
    100: "#F3DDD5",
    500: "#B5452B",
    600: "#9A3A24",
  },
  muted: "#5C5A55",
} as const;

export const fonts = {
  display: "Georgia, serif",
} as const;
