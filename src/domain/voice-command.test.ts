import { describe, expect, it } from 'vitest';
import { VoiceCommandAssembler } from './voice-command';
import { COMMANDS, parseCommand } from './commands';
import { voiceTokens } from './voice-grammar';

const options = { requireWakeWord: true, voiceConfidence: 0.5 };
function speak(assembler: VoiceCommandAssembler, text: string) {
  return assembler.accept(text, undefined, options);
}
describe('voice commands assembled from slots', () => {
  it.each([
    'Apex Move Bond A2A3',
    'Apex Move Pawn A2A3',
    'So I would have to do something like apex move pawn a2 a3',
    'Apex, move on A2 A3.',
    'apex move bon a to a three',
    '[unk] play apex move pawn a two a three',
  ])('assembles the reported transcript: %s', (text) => {
    const result = speak(new VoiceCommandAssembler(), text);
    expect(result.kind).toBe('command');
    expect(parseCommand(result.commandText!)).toMatchObject({
      type: 'move',
      piece: 'p',
      from: 'a2',
      to: 'a3',
    });
  });
  it('skips words that do not fit the current slot, exactly as requested', () => {
    const result = speak(
      new VoiceCommandAssembler(),
      'apex move hello nice queen wrong what bishop c4 c5',
    );
    expect(parseCommand(result.commandText!)).toMatchObject({
      type: 'move',
      piece: 'q',
      from: 'c4',
      to: 'c5',
    });
    expect(result.detail).toContain('“bishop” did not fit');
    expect(result.pending).toBe('');
  });
  it('keeps confirmed slots across pauses and ignores unknown sounds inside a segment', () => {
    const assembler = new VoiceCommandAssembler();
    expect(speak(assembler, 'apex move king [unk]').pending).toBe('apex move king');
    expect(speak(assembler, '').pending).toBe('apex move king');
    expect(speak(assembler, 'e').pending).toBe('apex move king e');
    expect(speak(assembler, 'one [unk] words').pending).toBe('apex move king e one');
    const result = speak(assembler, 'g one');
    expect(parseCommand(result.commandText!)).toMatchObject({ from: 'e1', to: 'g1' });
  });
  it('does not accept a vocabulary word in the wrong slot or infer a missing square', () => {
    const assembler = new VoiceCommandAssembler();
    const result = speak(assembler, 'apex move pawn e 2 new 4');
    expect(result.kind).toBe('pending');
    expect(result.pending).toBe('apex move pawn e two');
    expect(result.detail).toContain('“new” did not fit');
    expect(parseCommand(speak(assembler, 'e four').commandText!)).toMatchObject({
      from: 'e2',
      to: 'e4',
    });
  });
  it('allows the wake word after background words without considering their confidence', () => {
    const result = new VoiceCommandAssembler().accept(
      '',
      [
        { word: '[unk]', conf: 0.1 },
        { word: 'one', conf: 0.2 },
        { word: 'apex', conf: 1 },
        { word: 'move king e one g one', conf: 1 },
      ],
      options,
    );
    expect(result.kind).toBe('command');
  });
  it('does not turn next into the wake word or accept commands without it', () => {
    for (const text of ['Next, move on A2 A3.', 'move pawn a2 a3', 'I am playing chess'])
      expect(speak(new VoiceCommandAssembler(), text).kind).toBe('ignored');
  });
  it('restarts when apex is repeated, within a segment or later', () => {
    const assembler = new VoiceCommandAssembler();
    speak(assembler, 'apex move queen c four');
    expect(speak(assembler, 'apex vision a three').commandText).toBe('apex vision a three');
    expect(speak(assembler, 'apex move queen apex last move').commandText).toBe('apex last move');
    expect(speak(assembler, 'apex').pending).toBe('apex');
    expect(speak(assembler, 'last move').commandText).toBe('apex last move');
  });
  it('keeps waiting for a mode after new game', () => {
    const assembler = new VoiceCommandAssembler();
    expect(speak(assembler, '[unk] apex new game').kind).toBe('pending');
    expect(speak(assembler, 'self').commandText).toBe('apex new game self');
  });
  it('uses the current confidence setting, independent of any debug UI', () => {
    const words = [
      { word: 'apex move', conf: 1 },
      { word: 'bon', conf: 0.4 },
      { word: 'a2 a3', conf: 1 },
    ];
    const high = new VoiceCommandAssembler().accept('', words, options);
    expect(high.pending).toBe('apex move');
    expect(high.detail).toContain('below 50%');
    const low = new VoiceCommandAssembler().accept('', words, {
      ...options,
      voiceConfidence: 0.35,
    });
    expect(low.kind).toBe('command');
    const retry = new VoiceCommandAssembler();
    retry.accept('', words, options);
    expect(speak(retry, 'pawn a two a three').kind).toBe('command');
  });
  it('requires a sufficiently confident wake word and resets an old chain on an uncertain apex', () => {
    const assembler = new VoiceCommandAssembler();
    speak(assembler, 'apex move pawn');
    expect(
      assembler.accept(
        '',
        [
          { word: 'apex', conf: 0.2 },
          { word: 'vision a3', conf: 1 },
        ],
        options,
      ).kind,
    ).toBe('ignored');
    expect(speak(assembler, 'a two a three').kind).toBe('ignored');
  });
  it('can be reset on cancellation or a context change', () => {
    const assembler = new VoiceCommandAssembler();
    speak(assembler, 'apex move pawn a two');
    assembler.reset();
    expect(speak(assembler, 'a three').kind).toBe('ignored');
  });
  it('honors optional wake-word settings', () => {
    expect(
      new VoiceCommandAssembler().accept('move pawn a2a3', undefined, {
        ...options,
        requireWakeWord: false,
      }).kind,
    ).toBe('command');
  });
  it('keeps all registered commands reachable through their spoken examples', () => {
    for (const command of COMMANDS) {
      const result = speak(new VoiceCommandAssembler(), command.example);
      expect(parseCommand(result.commandText!), command.id).toEqual(parseCommand(command.example));
    }
  });
  it.each([
    'review 999',
    'review nine hundred ninety nine',
    'next twenty three',
    'new game engine full power',
    'move pawn a7 a8 promote to knight',
  ])('preserves optional arguments: %s', (text) => {
    expect(parseCommand(speak(new VoiceCommandAssembler(), `apex ${text}`).commandText!)).toEqual(
      parseCommand(text),
    );
  });
  it('keeps an explicitly started promotion suffix across a pause', () => {
    const assembler = new VoiceCommandAssembler();
    expect(speak(assembler, 'apex move pawn a seven a eight promote').kind).toBe('pending');
    expect(parseCommand(speak(assembler, 'to knight').commandText!)).toMatchObject({
      promotion: 'n',
    });
  });
  it('accepts joined coordinates in strict typed commands too', () => {
    expect(parseCommand('move pawn a2a3')).toMatchObject({ from: 'a2', to: 'a3' });
    expect(parseCommand('move pawn a2a3 extra')).toBeNull();
  });
  it('preserves confidence when splitting a joined coordinate token', () => {
    expect(voiceTokens('', [{ word: 'A2A3', conf: 0.3 }])).toEqual(
      ['a', '2', 'a', '3'].map((word) => ({ word, conf: 0.3 })),
    );
  });
  it('never matches inherited object property names as aliases', () => {
    const result = speak(new VoiceCommandAssembler(), 'apex move constructor toString __proto__');
    expect(result.pending).toBe('apex move');
  });
});
