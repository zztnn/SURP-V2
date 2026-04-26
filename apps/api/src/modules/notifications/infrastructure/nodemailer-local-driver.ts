import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import {
  type EmailDriverPort,
  type EmailEnvelope,
  type EmailSendResult,
} from '../ports/email-driver.port';
import { SMTP_CONFIG, type SmtpConfig } from './smtp-config.token';

/**
 * Driver de email para dev local — habla con MailHog (1025) sin auth ni
 * TLS. En prod este driver se reemplaza por AzureAcsDriver vía DI.
 */
@Injectable()
export class NodemailerLocalDriver implements EmailDriverPort, OnModuleDestroy {
  private readonly logger = new Logger(NodemailerLocalDriver.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(@Inject(SMTP_CONFIG) cfg: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: false,
      ignoreTLS: true,
      // MailHog acepta sin auth.
    });
  }

  async send(envelope: EmailEnvelope): Promise<EmailSendResult> {
    // Nodemailer tipa sendMail como Promise<SentMessageInfo> donde
    // SentMessageInfo es `any` (transport-dependent). Lo restringimos
    // al subset que usamos.
    const info = (await this.transporter.sendMail({
      from: { address: envelope.from.address, name: envelope.from.displayName },
      to: [...envelope.to],
      subject: envelope.subject,
      text: envelope.text,
      ...(envelope.html !== undefined ? { html: envelope.html } : {}),
    })) as { messageId?: string };
    const messageId = info.messageId ?? null;
    this.logger.debug(`Email despachado a MailHog — messageId=${messageId ?? 'n/a'}`);
    return {
      smtpMessageId: messageId,
      acsMessageId: null,
    };
  }

  onModuleDestroy(): void {
    this.transporter.close();
  }
}
