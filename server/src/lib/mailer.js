import sgMail from '@sendgrid/mail';
import { env } from '../config/env.js';

sgMail.setApiKey(env.SENDGRID_API_KEY);

// MAIL_FROM is given as an RFC 5322 "Name <email>" string in .env, but
// @sendgrid/mail's `from` field wants { email, name } separately — a
// combined string risks being read as one (invalid) address.
const fromEmailMatch = env.MAIL_FROM.match(/<([^>]+)>/);
const fromEmail = fromEmailMatch ? fromEmailMatch[1] : env.MAIL_FROM;

export async function sendEmail({ to, subject, html }) {
  const [response] = await sgMail.send({
    to,
    from: { email: fromEmail, name: env.MAIL_FROM_NAME },
    subject,
    html,
  });
  return response.headers['x-message-id'];
}
