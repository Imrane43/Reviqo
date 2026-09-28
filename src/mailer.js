/**
 * Pluggable transactional email.
 *
 * Providers (first one configured wins):
 *   - RESEND_API_KEY      -> https://resend.com
 *   - SENDGRID_API_KEY    -> https://sendgrid.com
 *   - SMTP_URL            -> any SMTP server (requires `nodemailer`)
 *
 * If none is configured, `sendMail` returns { delivered: false, reason: 'not_configured' }
 * and the caller decides what to do. We NEVER log message bodies, so verification
 * codes can never leak into the logs.
 */
const FROM_NAME = process.env.MAIL_FROM_NAME || 'REVIQO';
const FROM_EMAIL = process.env.MAIL_FROM_EMAIL || 'no-reply@reviqo.app';
const FROM = `${FROM_NAME} <${FROM_EMAIL}>`;

export function emailProvider() {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.SENDGRID_API_KEY) return 'sendgrid';
  if (process.env.SMTP_URL) return 'smtp';
  return null;
}

export function emailConfigured() {
  return !!emailProvider();
}

async function sendViaResend({ to, subject, text, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: FROM, to: [to], subject, text, html }),
  });
  if (!res.ok) throw new Error(`resend HTTP ${res.status}`);
}

async function sendViaSendgrid({ to, subject, text, html }) {
  const content = [{ type: 'text/plain', value: text }];
  if (html) content.push({ type: 'text/html', value: html });
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SENDGRID_API_KEY}` },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      content,
    }),
  });
  if (!res.ok) throw new Error(`sendgrid HTTP ${res.status}`);
}

async function sendViaSmtp({ to, subject, text, html }) {
  let nodemailer;
  try {
    nodemailer = await import('nodemailer');
  } catch {
    throw new Error('nodemailer is not installed (required for SMTP_URL)');
  }
  const transporter = nodemailer.createTransport(process.env.SMTP_URL);
  await transporter.sendMail({ from: FROM, to, subject, text, html });
}

export async function sendMail(message) {
  const provider = emailProvider();
  if (!provider) return { delivered: false, reason: 'not_configured' };
  try {
    if (provider === 'resend') await sendViaResend(message);
    else if (provider === 'sendgrid') await sendViaSendgrid(message);
    else await sendViaSmtp(message);
    return { delivered: true, provider };
  } catch (err) {
    // Log only the provider and the error message — never the body.
    console.error(`[mailer] ${provider} send failed: ${err.message}`);
    return { delivered: false, reason: 'send_failed', provider };
  }
}

export const MAIL_FROM = FROM;
