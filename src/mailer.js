/**
 * Envoi d'e-mails transactionnels.
 *
 * Fournisseur : Resend, SendGrid ou SMTP (le premier configuré gagne).
 * - Les clés sont lues via la configuration centralisée (assainies : sans
 *   espace ni retour à la ligne parasite).
 * - Un corps de message n'est JAMAIS journalisé (donc aucun code secret).
 * - On renvoie toujours une issue explicite : { delivered, provider, reason }.
 */
import { config } from './config.js';

export function emailProvider() {
  return config.email.provider;
}

export function emailConfigured() {
  return config.email.configured;
}

/** Avertissement de format (jamais de valeur affichée). */
export function validateEmailProvider() {
  const warnings = [];
  if (config.email.provider === 'resend' && !/^re_/.test(config.email.resendKey)) {
    warnings.push('RESEND_API_KEY ne ressemble pas à une clé Resend (préfixe attendu : « re_ »).');
  }
  if (config.email.provider === 'resend' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(config.email.fromEmail)) {
    warnings.push('MAIL_FROM_EMAIL n’est pas une adresse valide.');
  }
  return warnings;
}

async function sendViaResend({ to, subject, text, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.email.resendKey}` },
    body: JSON.stringify({ from: config.email.from, to: [to], subject, text, html }),
  });
  if (!res.ok) {
    let detail = '';
    try { const body = await res.json(); detail = body?.message || body?.error?.message || ''; } catch { /* ignore */ }
    throw new Error(`resend HTTP ${res.status}${detail ? ` : ${detail}` : ''}`);
  }
  return true;
}

async function sendViaSendgrid({ to, subject, text, html }) {
  const content = [{ type: 'text/plain', value: text }];
  if (html) content.push({ type: 'text/html', value: html });
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.email.sendgridKey}` },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: config.email.fromEmail, name: config.email.fromName },
      subject,
      content,
    }),
  });
  if (!res.ok) throw new Error(`sendgrid HTTP ${res.status}`);
  return true;
}

async function sendViaSmtp({ to, subject, text, html }) {
  let nodemailer;
  try {
    nodemailer = await import('nodemailer');
  } catch {
    throw new Error('nodemailer n’est pas installé (nécessaire pour SMTP_URL)');
  }
  const transporter = nodemailer.createTransport(config.email.smtpUrl);
  await transporter.sendMail({ from: config.email.from, to, subject, text, html });
  return true;
}

export async function sendMail(message) {
  const provider = config.email.provider;
  if (!provider) return { delivered: false, reason: 'not_configured' };
  try {
    if (provider === 'resend') await sendViaResend(message);
    else if (provider === 'sendgrid') await sendViaSendgrid(message);
    else await sendViaSmtp(message);
    return { delivered: true, provider };
  } catch (err) {
    // On journalise le fournisseur et l'erreur — jamais le corps du message.
    console.error(`[mailer] échec ${provider} : ${err.message}`);
    return { delivered: false, reason: 'send_failed', provider, error: err.message };
  }
}

export const MAIL_FROM = config.email.from;
