# Privacy

- Submitted images/text are held in memory for the request only and are **not stored**. The only file written is a temporary copy for `c2patool` (mode 0600), deleted in a `finally` block.
- The server logs no request bodies, pasted text, images, or secrets (unhandled errors log only the error class name). Put no body-logging proxy in front of it.
- **Data sent to third parties:** images go to Sightengine; text goes to GPTZero (when configured). The UI states this beside each form and links the provider's privacy policy (Sightengine: https://sightengine.com/privacy, GPTZero: https://gptzero.me/privacy-policy). Review their terms, retention, and training policies yourself before deploying — this repo cannot verify them.
- OriginCheck does **not** use submissions for training and has no opt-in mechanism.
- API credentials live only in server environment variables and are never sent to the browser (`/api/config` exposes no secrets).
- Rate limiting is in-memory per client IP (`TRUST_PROXY=true` only behind a trusted proxy that sets `X-Forwarded-For`). Use a shared store and a WAF/CDN for multi-instance deployments.
- Don't submit others' personal content without the right to do so.
