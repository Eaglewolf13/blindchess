# Scope and decisions

## Agreed first release

- TypeScript PWA, local-first, targeting Chrome/Edge and Apple Safari.
- English commands with **apex** as a prefix in the same utterance, continuously listening after a user activates microphone access.
- Self play and local Stockfish with 8 strength levels, short move/evaluation budgets.
- Hidden board during play; optional reveal; visible saved-game review.
- Move, vision, review, next, current eval, and new game commands with matching text controls.
- Review N begins at White's Nth move. Next N advances exactly N individual moves and announces the destination.
- Local saved games, PGN copy/download, settings, optional disabled commands, offline asset preparation.
- A portable development setup and documentation suitable for a beginner learning the code.

## Account release (implemented; provider deployment required)

- Firebase email/password authentication and password recovery, unique public usernames.
- Public account practice histories with owner-only writes; email remains private.
- Per-account local cache/outbox, realtime history syncing, deletion tombstones, and preserved conflicting continuations.
- Guest history stays in the current tab and never uploads; localhost test histories are not imported.
- Cloudflare Pages hosting with explicit offline readiness and optional persistent-storage request.

## Later online play

1. Add profile/history browsing, friends, invitations, accept/reject, and game-color assignment through ordinary UI.
2. Add server-authoritative, revision-checked untimed friend games with subscriptions, reconnect, and explicit disconnection state.
3. Consider a local whole-database backup/export and a tested restore workflow; PGN exports remain available now.

## Quality work before a broad launch

- Test on a real iPhone/iPad and Mac Safari, especially audio activation, interruption, installed-PWA behavior, and storage eviction.
- Build a consented set of real command recordings and background conversation. Measure false activations, missed commands, latency, and repeated-command behavior.
- Compare Vosk with a small local Whisper model using the same recordings if accuracy is inadequate. Vosk is the first implemented adapter, not a benchmark-proven winner.
- Check battery/CPU use and memory on low-end phones; tune voice confidence and engine budgets using evidence.
- Finish keyboard/screen-reader and contrast checks with users; the interface is designed for blindfold practice, not yet certified for accessibility.
- Consider per-game assistance rules for friends and turn-confirmation preferences, without making a cloud model part of the critical path.

## Later

Hints, optional alternative wake phrases, other languages, optional larger engine builds, native speech adapters, and packaged mobile/desktop apps can be added through the existing boundaries.
