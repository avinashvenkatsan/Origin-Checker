# Known limitations

- No detector identifies every AI-generated image or text with certainty; false positives and false negatives occur.
- Adapters are untested against live provider APIs in this repo (mocked in tests).
- Images: cropping, screenshots, resizing, compression, filters, and editing affect results; new generators may be missed; missing C2PA data proves nothing. Only C2PA is inspected, and only if `c2patool` is installed. Trust-list evaluation of signers is whatever `c2patool` reports.
- Text: mixed human/AI writing, editing, translation, paraphrasing, short samples, and non-English text reduce reliability. Results must never be used to accuse a person of misconduct or infer authorship.
- Rate limiting is single-process and in-memory.
- No authentication, accounts, or abuse-reporting; add them before public deployment.
- No accuracy has been measured; see README.
