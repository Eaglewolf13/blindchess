# Third-party components

Original Apex application code is covered by the repository's existing MIT license. Third-party code and model data retain their upstream licenses.

| Component                         | License      | Source                                                                               |
| --------------------------------- | ------------ | ------------------------------------------------------------------------------------ |
| React                             | MIT          | https://github.com/facebook/react                                                    |
| chess.js                          | BSD-2-Clause | https://github.com/jhlywa/chess.js                                                   |
| idb                               | ISC          | https://github.com/jakearchibald/idb                                                 |
| Lucide icons                      | ISC          | https://github.com/lucide-icons/lucide                                               |
| Stockfish.js 18.0.5 and Stockfish | GPL-3.0      | https://github.com/nmrugg/stockfish.js/tree/082eeba46b0c5f8f8065e5386750aa0ecfa2062c |
| Vosk Browser                      | Apache-2.0   | https://github.com/ccoreilly/vosk-browser                                            |
| Vosk small English US model 0.15  | Apache-2.0   | https://alphacephei.com/vosk/models                                                  |
| Workbox                           | MIT          | https://github.com/GoogleChrome/workbox                                              |

`npm run assets` copies Stockfish's license into `/engine/COPYING.txt` and exact corresponding-source references into `/engine/SOURCE.txt`. Keep these files when deploying. The original upstream source archive is available at https://github.com/nmrugg/stockfish.js/archive/082eeba46b0c5f8f8065e5386750aa0ecfa2062c.tar.gz. This commit is the `gitHead` recorded by the exact npm release; do not infer a Git tag from an npm version.

The bundled runtime libraries are also recorded in `package-lock.json`. Development tools retain the licenses in their npm packages. Do not remove upstream notices from copied assets.
