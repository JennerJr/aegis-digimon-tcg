export const RollbackKind = {
  ACTION: { name: "ACTION", value: "action" },
  TURN: { name: "TURN", value: "turn" },
} as const;

export type RollbackKind = (typeof RollbackKind)[keyof typeof RollbackKind]["value"];

export const ROLLBACK_CHANNEL = "rollback";
export const ROLLBACK_RESET_CHANNEL = "rollbackReset";
