export const THEME_PRESET_IDS = [
  'araucaria',
  'pino',
  'eucalipto',
  'coigue',
  'roble',
  'quillay',
  'maule',
  'biobio',
  'nuble',
] as const;

export type ThemePresetId = (typeof THEME_PRESET_IDS)[number];

export const SIDEBAR_PRESET_IDS = [
  'bosque',
  'noche',
  'carbon',
  'pizarra',
  'bruma',
  'cordillera',
] as const;

export type SidebarPresetId = (typeof SIDEBAR_PRESET_IDS)[number];

export interface ThemePresetPreview {
  bg: string;
  primary: string;
  card: string;
  accent: string;
}

export interface ThemePreset {
  id: ThemePresetId;
  name: string;
  description: string;
  preview: {
    light: ThemePresetPreview;
    dark: ThemePresetPreview;
  };
}

export interface SidebarPresetPreview {
  sidebar: string;
  accent: string;
  foreground: string;
}

export interface SidebarPreset {
  id: SidebarPresetId;
  name: string;
  description: string;
  preview: {
    light: SidebarPresetPreview;
    dark: SidebarPresetPreview;
  };
}

// Presets de tema principal — solo afectan tokens NO-sidebar
// (--background, --primary, --card, --accent, etc.). El sidebar se
// configura por separado en SIDEBAR_PRESETS.
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'araucaria',
    name: 'Araucaria',
    description: 'Verde Arauco profundo, identidad institucional',
    preview: {
      light: { bg: '#F2F4EE', primary: '#3D5A2F', card: '#FFFFFF', accent: '#E5EBDC' },
      dark: { bg: '#1A1F16', primary: '#7A9B5E', card: '#252A1F', accent: '#2D3326' },
    },
  },
  {
    id: 'pino',
    name: 'Pino',
    description: 'Verde forestal clásico',
    preview: {
      light: { bg: '#F4F7F2', primary: '#3D6B47', card: '#FFFFFF', accent: '#E5EDE3' },
      dark: { bg: '#1A201B', primary: '#5A8B65', card: '#222B25', accent: '#2A332C' },
    },
  },
  {
    id: 'eucalipto',
    name: 'Eucalipto',
    description: 'Verde plateado con tinte azulado',
    preview: {
      light: { bg: '#F2F5F4', primary: '#5C9189', card: '#FFFFFF', accent: '#DEE9E6' },
      dark: { bg: '#1A2422', primary: '#7CB5AB', card: '#222F2C', accent: '#2A3A36' },
    },
  },
  {
    id: 'coigue',
    name: 'Coigüe',
    description: 'Verde follaje vivo, fresco',
    preview: {
      light: { bg: '#F1F6EE', primary: '#5C8A5E', card: '#FFFFFF', accent: '#E0EDD9' },
      dark: { bg: '#1A211B', primary: '#85B385', card: '#252C25', accent: '#2C362D' },
    },
  },
  {
    id: 'roble',
    name: 'Roble',
    description: 'Cobre y otoño cálido',
    preview: {
      light: { bg: '#F8F4EE', primary: '#A0633D', card: '#FFFFFF', accent: '#EFE3D4' },
      dark: { bg: '#241D17', primary: '#C99268', card: '#2D241D', accent: '#3A2D22' },
    },
  },
  {
    id: 'quillay',
    name: 'Quillay',
    description: 'Oliva y dorado, cálido seco',
    preview: {
      light: { bg: '#F7F4ED', primary: '#8B6914', card: '#FFFFFF', accent: '#EDE5D0' },
      dark: { bg: '#1F1B12', primary: '#C5A14B', card: '#28221A', accent: '#332C1E' },
    },
  },
  {
    id: 'maule',
    name: 'Maule',
    description: 'Azul río, equilibrado y clásico',
    preview: {
      light: { bg: '#EDF2F7', primary: '#3182CE', card: '#FFFFFF', accent: '#E2E8F0' },
      dark: { bg: '#282C34', primary: '#3182CE', card: '#2C313A', accent: '#2A3038' },
    },
  },
  {
    id: 'biobio',
    name: 'Biobío',
    description: 'Azul nítido, limpio y moderno',
    preview: {
      light: { bg: '#F6F8FA', primary: '#0969DA', card: '#FFFFFF', accent: '#EAEEF2' },
      dark: { bg: '#0D1117', primary: '#0969DA', card: '#161B22', accent: '#21262D' },
    },
  },
  {
    id: 'nuble',
    name: 'Ñuble',
    description: 'Azul intenso, decidido y vibrante',
    preview: {
      light: { bg: '#F7F7F8', primary: '#2E5CFF', card: '#FFFFFF', accent: '#EDEDF0' },
      dark: { bg: '#131418', primary: '#4B7BFF', card: '#1E2025', accent: '#252830' },
    },
  },
];

// Presets de sidebar — solo afectan tokens --sidebar* y --sidebar-gradient-*
// Independientes del tema principal: cualquier combinación es válida.
export const SIDEBAR_PRESETS: SidebarPreset[] = [
  {
    id: 'bosque',
    name: 'Bosque',
    description: 'Verde-negro forestal, default Arauco',
    preview: {
      light: { sidebar: '#1A2620', accent: '#0F1814', foreground: '#FFFFFF' },
      dark: { sidebar: '#141C18', accent: '#0A120E', foreground: '#FFFFFF' },
    },
  },
  {
    id: 'noche',
    name: 'Noche',
    description: 'Navy oscuro, look clásico',
    preview: {
      light: { sidebar: '#253347', accent: '#161F2E', foreground: '#FFFFFF' },
      dark: { sidebar: '#1A2030', accent: '#0F1520', foreground: '#FFFFFF' },
    },
  },
  {
    id: 'carbon',
    name: 'Carbón',
    description: 'Gris azulado oscuro, neutro',
    preview: {
      light: { sidebar: '#1F2328', accent: '#13161A', foreground: '#FFFFFF' },
      dark: { sidebar: '#15191D', accent: '#0A0D10', foreground: '#FFFFFF' },
    },
  },
  {
    id: 'pizarra',
    name: 'Pizarra',
    description: 'Gris piedra, sobrio',
    preview: {
      light: { sidebar: '#2A2D33', accent: '#1B1D22', foreground: '#FFFFFF' },
      dark: { sidebar: '#1E2026', accent: '#13151A', foreground: '#FFFFFF' },
    },
  },
  {
    id: 'bruma',
    name: 'Bruma',
    description: 'Gris-azul niebla, suave',
    preview: {
      light: { sidebar: '#3A4250', accent: '#2A303C', foreground: '#FFFFFF' },
      dark: { sidebar: '#2A3140', accent: '#1C2230', foreground: '#FFFFFF' },
    },
  },
  {
    id: 'cordillera',
    name: 'Cordillera',
    description: 'Gris-marrón roca, terroso',
    preview: {
      light: { sidebar: '#2D2A26', accent: '#1F1D1A', foreground: '#FFFFFF' },
      dark: { sidebar: '#211F1C', accent: '#161513', foreground: '#FFFFFF' },
    },
  },
];
