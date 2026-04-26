export const EMAIL_DRIVER = Symbol('EMAIL_DRIVER');

export interface EmailEnvelope {
  from: { address: string; displayName: string };
  to: readonly string[];
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSendResult {
  /**
   * Identificador devuelto por el SMTP server (Message-ID en Nodemailer,
   * GUID en Azure ACS). NULL si el driver no lo expone.
   */
  smtpMessageId: string | null;
  acsMessageId: string | null;
}

/**
 * Driver de envío de email. Dual:
 *   - LocalSmtpDriver (Nodemailer → MailHog en dev)
 *   - AzureAcsDriver  (post-MVP)
 *
 * El use case del processor llama `send()` y captura cualquier error
 * para mapearlo a `markFailed`.
 */
export interface EmailDriverPort {
  send(envelope: EmailEnvelope): Promise<EmailSendResult>;
}
