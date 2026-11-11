// Things the engine did on its own during a state step (refused, dropped,
// merged, fell back) so they can be seen in Settings → Debug. Pure data:
// the state step returns them, the game context records them.

export type DebugEventKind = 'fallback' | 'mode' | 'refused' | 'merged' | 'dropped' | 'retry' | 'violation';

export type DebugEvent = { kind: DebugEventKind; text: string };
