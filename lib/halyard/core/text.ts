/** Shared text helpers for the call-intelligence core (ported from the Halyard desktop app, docs/architecture/62 H1). */
export type Channel = "you" | "them"
export interface Turn { channel: Channel | string; text: string }
