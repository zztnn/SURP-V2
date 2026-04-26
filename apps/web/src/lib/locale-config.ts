import { useLocaleStore } from '@/stores/locale-store';

import type { RegionalFormat } from '@/stores/locale-store';

export type DateSegmentOrder = 'MDY' | 'DMY';

export interface LocaleConfig {
  locale: string;
  currency: string;
  currencySymbol: string;
  currencyPosition: 'prefix' | 'suffix';
  decimalSeparator: string;
  thousandsSeparator: string;
  decimalPlaces: number;
  phonePrefix: string;
  phoneMask: string;
  taxIdLabel: string;
  taxIdMask: string;
  dateFormat: string;
  dateInputFormat: string;
  dateInputPlaceholder: string;
  dateSegmentOrder: DateSegmentOrder;
}

// Configuración chilena única. CLP sin decimales (Banco Central de Chile),
// RUT como taxId con máscara XX.XXX.XXX-X, teléfonos +56 9 XXXX XXXX,
// fechas DD/MM/YYYY.
const LOCALE_CONFIGS: Record<RegionalFormat, LocaleConfig> = {
  'es-CL': {
    locale: 'es-CL',
    currency: 'CLP',
    currencySymbol: '$',
    currencyPosition: 'prefix',
    decimalSeparator: ',',
    thousandsSeparator: '.',
    decimalPlaces: 0,
    phonePrefix: '+56',
    phoneMask: '# #### ####',
    taxIdLabel: 'RUT',
    taxIdMask: '##.###.###-#',
    dateFormat: 'DD MMM YYYY',
    dateInputFormat: 'DD/MM/YYYY',
    dateInputPlaceholder: 'DD/MM/YYYY',
    dateSegmentOrder: 'DMY',
  },
};

export function getLocaleConfig(): LocaleConfig {
  const format = useLocaleStore.getState().regionalFormat;
  return LOCALE_CONFIGS[format];
}

/** Formatea un entero con el separador de miles configurado */
export function formatInteger(value: number): string {
  const config = getLocaleConfig();
  return new Intl.NumberFormat(config.locale).format(value);
}
