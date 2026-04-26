export const THEME_PRESET_IDS = [
  'atom',
  'github',
  'dracula',
  'nord',
  'polymarket',
  'speyside',
  'tartan',
  'orkney',
] as const;

export type ThemePresetId = (typeof THEME_PRESET_IDS)[number];

export interface ThemePreset {
  id: ThemePresetId;
  name: string;
  description: string;
  preview: {
    light: { bg: string; sidebar: string; primary: string; card: string };
    dark: { bg: string; sidebar: string; primary: string; card: string };
  };
}

// Port literal de IWH (iwarehouse-2.0/iwh-web-client/src/config/themes.ts).
// Los sidebar colors de preview son los del "FIXED SIDEBAR" de globals.css
// (#132144 → #0b1530) para que el preview sea fiel a la realidad visible.
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'atom',
    name: 'Tweed',
    description: 'Azul profundo, refinado y atemporal',
    preview: {
      light: { bg: '#EDF2F7', sidebar: '#132144', primary: '#3182CE', card: '#FFFFFF' },
      dark: { bg: '#282c34', sidebar: '#132144', primary: '#3182CE', card: '#2c313a' },
    },
  },
  {
    id: 'github',
    name: 'Clyde',
    description: 'Limpio y moderno, cómodo a la vista',
    preview: {
      light: { bg: '#f6f8fa', sidebar: '#132144', primary: '#0969da', card: '#ffffff' },
      dark: { bg: '#0d1117', sidebar: '#132144', primary: '#58a6ff', card: '#161b22' },
    },
  },
  {
    id: 'dracula',
    name: 'Heather',
    description: 'Tonos púrpura de las tierras altas',
    preview: {
      light: { bg: '#f8f8f2', sidebar: '#132144', primary: '#bd93f9', card: '#ffffff' },
      dark: { bg: '#282a36', sidebar: '#132144', primary: '#bd93f9', card: '#44475a' },
    },
  },
  {
    id: 'nord',
    name: 'Cairngorm',
    description: 'Azules árticos, cristalinos y tranquilos',
    preview: {
      light: { bg: '#ECEFF4', sidebar: '#132144', primary: '#5E81AC', card: '#FFFFFF' },
      dark: { bg: '#2E3440', sidebar: '#132144', primary: '#88C0D0', card: '#3B4252' },
    },
  },
  {
    id: 'polymarket',
    name: 'Forth',
    description: 'Azul intenso, nítido y decidido',
    preview: {
      light: { bg: '#F7F7F8', sidebar: '#132144', primary: '#2E5CFF', card: '#FFFFFF' },
      dark: { bg: '#131418', sidebar: '#132144', primary: '#4B7BFF', card: '#1E2025' },
    },
  },
  {
    id: 'speyside',
    name: 'Speyside',
    description: 'Ámbar y verde cálidos, como single malt',
    preview: {
      light: { bg: '#f9f7f3', sidebar: '#132144', primary: '#8B6914', card: '#FFFFFF' },
      dark: { bg: '#1a1a17', sidebar: '#132144', primary: '#D4A34A', card: '#242420' },
    },
  },
  {
    id: 'tartan',
    name: 'Tartan',
    description: 'Rojo profundo, con carácter',
    preview: {
      light: { bg: '#faf6f6', sidebar: '#132144', primary: '#A63D40', card: '#FFFFFF' },
      dark: { bg: '#1a1214', sidebar: '#132144', primary: '#D4686B', card: '#261C1E' },
    },
  },
  {
    id: 'orkney',
    name: 'Orkney',
    description: 'Gris piedra, neutral y sobrio',
    preview: {
      light: { bg: '#f4f4f2', sidebar: '#132144', primary: '#5C6B73', card: '#FFFFFF' },
      dark: { bg: '#1b1d1e', sidebar: '#132144', primary: '#8FA3AD', card: '#252829' },
    },
  },
];
