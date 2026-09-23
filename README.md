# Vivienne Haftarah Trainer

A static trainer for **Isaiah 49:1–4**, adapted from `bradyhaftorah`.

Open `index.html`, or run `python -m http.server 8000` and visit `http://localhost:8000`. Microphone recording requires localhost or HTTPS.

- Hebrew text with vowels and cantillation; the Trope button hides only cantillation.
- Fifteen fixed phrases, divided at major cantillation breaks, with alternating highlights.
- Hover over a recorded phrase to hear it. Select a verse number to play its recordings in order, with silence trimming and short pauses.
- Use **Record missing audio** to record the next unfinished phrase. There are no Isaiah recordings initially; Brady's recordings are not reused.
- Audio toggle, responsive layout, and recording quality settings match the source trainer.
- Phrase groups are read-only, and recording deletion is disabled. As in the source, audio can be uploaded and replaced without sign-in.

Dedicated tables and bucket in the existing Supabase project keep Vivienne's data separate. `supabase-setup.sql` records the one-time setup already applied; do not rerun it on the configured project.

Hebrew source: [Sefaria, Isaiah 49:1–4](https://www.sefaria.org/Isaiah.49.1-4?lang=he), retrieved September 23, 2026. HTML formatting and the trailing paragraph marker were removed from the displayed text.
