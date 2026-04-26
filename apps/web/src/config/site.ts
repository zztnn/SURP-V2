export const siteConfig = {
  name: 'SURP 2.0',
  shortName: 'SURP',
  description: 'Sistema de Unidad de Resguardo Patrimonial — Forestal Arauco',
  templateVersion: '0.1.0',
  url: process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3200',
  logo: {
    icon: 'Shield',
    text: 'SURP 2.0',
  },
  defaultTheme: 'system' as const,
  supportedThemes: ['light', 'dark', 'system'] as const,
  defaultPreset: 'github' as const,
  supportedPresets: ['atom', 'github', 'dracula', 'nord', 'polymarket'] as const,
  sidebar: {
    expandedWidth: 260,
    collapsedWidth: 80,
  },
  pagination: {
    defaultPageSize: 10,
    pageSizeOptions: [5, 10, 25, 50, 100] as const,
  },
} as const;

export type SiteConfig = typeof siteConfig;
