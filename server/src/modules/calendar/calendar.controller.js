import * as calendarService from './calendar.service.js';

// Returns the consent URL as JSON rather than issuing a raw 302 directly.
// Deliberate deviation from the brief's literal "GET .../connect -> 302"
// wire format: this app's access token lives in memory on the client
// (brief §15), never in a cookie, so a plain browser navigation to this
// endpoint would carry no proof of who's asking. Calling it as an
// authenticated fetch (like every other endpoint in this API) and having
// the frontend do window.location.href = authUrl achieves the same
// end-user result — the browser still ends up on Google's consent
// screen — without needing to smuggle a token through a URL.
export async function connect(req, res) {
  const authUrl = calendarService.getConnectUrl(req.user.id);
  res.json({ authUrl });
}

// This one IS a raw browser redirect — from Google, not from our own
// frontend — so there's no Authorization header to check here at all.
// The state param (verified inside the service) is what ties this request
// back to a specific user.
export async function callback(req, res) {
  const result = await calendarService.handleCallback(req.query);
  res.redirect(result.redirectUrl);
}

export async function disconnect(req, res) {
  await calendarService.disconnect(req.user.id);
  res.status(204).send();
}

export async function getStatus(req, res) {
  const status = await calendarService.getStatus(req.user.id);
  res.json(status);
}
