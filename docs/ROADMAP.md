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

## Online release

1. Choose a managed authentication service. Email is acceptable if it materially simplifies secure accounts; usernames remain the public identity. Username-only login is not a reason to invent password storage.
2. Add profiles, friends, invitations, accept/reject, and game-color assignment through ordinary UI.
3. Add server-authoritative, revision-checked untimed friend games with subscriptions, reconnect, and explicit disconnection state.
4. Sync all practice/game history to accounts, preserve local offline history, and decide public/private game visibility explicitly.
5. Add account-recovery policy appropriate to the chosen provider. No sensitive credentials in client bundles.

## Quality work before a broad launch

- Test on a real iPhone/iPad and Mac Safari, especially audio activation, interruption, installed-PWA behavior, and storage eviction.
- Build a consented set of real command recordings and background conversation. Measure false activations, missed commands, latency, and repeated-command behavior.
- Compare Vosk with a small local Whisper model using the same recordings if accuracy is inadequate. Vosk is the first implemented adapter, not a benchmark-proven winner.
- Check battery/CPU use and memory on low-end phones; tune voice confidence and engine budgets using evidence.
- Finish keyboard/screen-reader and contrast checks with users; the interface is designed for blindfold practice, not yet certified for accessibility.
- Consider per-game assistance rules for friends and turn-confirmation preferences, without making a cloud model part of the critical path.

## Later

Hints, optional alternative wake phrases, other languages, optional larger engine builds, native speech adapters, and packaged mobile/desktop apps can be added through the existing boundaries.
