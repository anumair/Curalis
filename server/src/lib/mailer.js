import sgMail from '@sendgrid/mail';
import { env } from '../config/env.js';

sgMail.setApiKey(env.SENDGRID_API_KEY);

// MAIL_FROM is given as an RFC 5322 "Name <email>" string in .env, but
// @sendgrid/mail's `from` field wants { email, name } separately — a
// combined string risks being read as one (invalid) address.
const fromEmailMatch = env.MAIL_FROM.match(/<([^>]+)>/);
const fromEmail = fromEmailMatch ? fromEmailMatch[1] : env.MAIL_FROM;

// attachments: [{ filename, content (utf8 string), contentType }] — the
// caller passes raw text/ics content; base64 encoding for the SendGrid
// wire format happens here so callers never think about transport detail.
export async function sendEmail({ to, subject, html, attachments }) {
  const [response] = await sgMail.send({
    to,
    from: { email: fromEmail, name: env.MAIL_FROM_NAME },
    subject,
    html,
    attachments: attachments?.map((attachment) => ({
      filename: attachment.filename,
      type: attachment.contentType,
      content: Buffer.from(attachment.content, 'utf8').toString('base64'),
      disposition: 'attachment',
    })),
  });
  return response.headers['x-message-id'];
}
