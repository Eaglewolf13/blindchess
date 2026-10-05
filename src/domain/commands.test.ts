import { describe, expect, it } from 'vitest';
import { parseCommand, COMMANDS } from './commands';

describe('command grammar', () => {
  it('recognizes the wake word and command in one utterance', () => {
    expect(parseCommand('Apex, move knight g one f three.', true)).toEqual({
      type: 'move',
      piece: 'n',
      from: 'g1',
      to: 'f3',
    });
  });
  it('normalizes square homophones only inside a full command', () => {
    expect(parseCommand('apex move night gee one eff three', true)).toMatchObject({
      type: 'move',
      piece: 'n',
      from: 'g1',
      to: 'f3',
    });
    expect(parseCommand('vision see for')).toEqual({ type: 'vision', square: 'c4' });
  });
  it.each([
    'I am playing chess',
    'next week',
    'we should move pawn e2 e4',
    'apex move pawn e2 e4 and do something else',
    'apex',
    'apex move pawn e9 e4',
    'apex new game engine nine',
  ])('ignores unrelated or malformed speech: %s', (text) => {
    expect(parseCommand(text, true)).toBeNull();
  });
  it('requires the wake prefix only for configured voice input', () => {
    expect(parseCommand('move pawn e2 e4', true)).toBeNull();
    expect(parseCommand('move pawn e2 e4')).toMatchObject({ type: 'move' });
  });
  it('supports promotion and new-game levels', () => {
    expect(parseCommand('apex move pawn a seven a eight promote to knight')).toMatchObject({
      promotion: 'n',
    });
    expect(parseCommand('new game engine full power')).toEqual({
      type: 'newGame',
      mode: 'engine',
      level: 8,
    });
    expect(parseCommand('new game self')).toMatchObject({ type: 'newGame', mode: 'self' });
  });
  it('reads review numbers and next counts without conflating them', () => {
    expect(parseCommand('review twenty three')).toEqual({ type: 'review', move: 23 });
    expect(parseCommand('next three')).toEqual({ type: 'next', count: 3 });
    expect(parseCommand('review')).toEqual({ type: 'review', move: 1 });
    expect(parseCommand('next zero')).toBeNull();
    expect(parseCommand('next one two')).toBeNull();
  });
  it('keeps every documented example executable', () => {
    for (const command of COMMANDS)
      expect(parseCommand(command.example, true)?.type).toBe(command.id);
  });
});
