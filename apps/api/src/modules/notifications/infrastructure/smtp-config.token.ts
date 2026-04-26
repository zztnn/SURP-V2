export const SMTP_CONFIG = Symbol('SMTP_CONFIG');

export interface SmtpConfig {
  host: string;
  port: number;
}
