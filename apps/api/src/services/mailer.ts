import nodemailer from 'nodemailer';
import type { Env } from '../config/env.js';
import { logger } from '../config/logger.js';

export interface OutboundMail {
  to: string;
  subject: string;
  text: string;
}

export const sentMails: OutboundMail[] = [];

export function resetSentMails(): void {
  sentMails.length = 0;
}

export interface Mailer {
  sendPasswordReset(to: string, resetUrl: string): Promise<void>;
  sendOrderRequest(to: string, reference: string, text: string): Promise<void>;
}

async function deliver(env: Env, message: OutboundMail): Promise<void> {
  if (env.NODE_ENV === 'test') {
    sentMails.push(message);
    return;
  }
  if (!env.SMTP_HOST || !env.SMTP_FROM) {
    if (env.NODE_ENV === 'development') {
      logger.info({ to: message.to, subject: message.subject, text: message.text }, 'Email was not sent because SMTP is not configured');
      return;
    }
    logger.error({ to: message.to, subject: message.subject }, 'Email was not sent because SMTP is not configured');
    return;
  }
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  await transport.sendMail({ from: env.SMTP_FROM, to: message.to, subject: message.subject, text: message.text });
}

export function createMailer(env: Env): Mailer {
  return {
    async sendPasswordReset(to: string, resetUrl: string) {
      await deliver(env, {
        to,
        subject: 'Reset your Aprotel Solar administrator password',
        text: `A password reset was requested for your administrator account. This link expires soon:\n\n${resetUrl}\n\nIf you did not request this, you can ignore the message.`,
      });
    },
    async sendOrderRequest(to: string, reference: string, text: string) {
      await deliver(env, {
        to,
        subject: `Aprotel catalogue request ${reference}`,
        text,
      });
    },
  };
}
