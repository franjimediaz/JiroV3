// Auth is authoritative. The journal is persisted BEFORE any Auth mutation.
// A claimed operation is never automatically unlocked after a timeout: it may have committed.
export type EmailSnapshot = { auth: string; database: string | null; pending?: string };
export type EmailOperation = { id: string; old_auth_email: string; old_db_email: string | null; new_email: string };
export type EmailStore = {
  read(): Promise<EmailSnapshot>;
  writeDatabase(previous: string | null, next: string): Promise<void>;
  restoreAuth(email: string): Promise<void>;
  close(status: "completed" | "rolled_back" | "reconciliation_required", reason?: string): Promise<void>;
  log(reason: string): void;
};
export async function finishEmailChange(op: EmailOperation, store: EmailStore): Promise<void> {
  const unresolved = async (reason: string): Promise<never> => {
    store.log(reason);
    try { await store.close("reconciliation_required", reason); } catch { store.log("journal_update_failed"); }
    // Even if this write fails, the durable 'applying' journal entry stays open.
    throw Error("PROFILE_EMAIL_RECONCILIATION");
  };
  let before: EmailSnapshot;
  try { before = await store.read(); } catch { return unresolved("initial_read_failed"); }
  if (before.auth !== op.new_email || (before.database !== op.old_db_email && before.database !== op.new_email)) return unresolved("concurrent_change");
  try {
    if (before.database !== op.new_email) await store.writeDatabase(op.old_db_email, op.new_email);
    const after = await store.read();
    if (after.auth !== op.new_email || after.database !== op.new_email) throw Error("verification_failed");
  } catch {
    let state: EmailSnapshot;
    try { state = await store.read(); } catch { return unresolved("database_outcome_unknown"); }
    // A transport error can occur after COMMIT. Verify before compensating.
    if (state.auth === op.new_email && state.database === op.new_email) {
      try { await store.close("completed"); return; } catch { return unresolved("completion_journal_failed"); }
    }
    if (state.auth !== op.new_email || state.database !== op.old_db_email) return unresolved("concurrent_change_on_rollback");
    try {
      await store.restoreAuth(op.old_auth_email);
      const restored = await store.read();
      if (restored.auth !== op.old_auth_email || restored.database !== op.old_db_email || restored.pending) throw Error("rollback_verification_failed");
      await store.close("rolled_back");
    } catch { return unresolved("auth_rollback_failed"); }
    throw Error("PROFILE_EMAIL_ROLLED_BACK");
  }
  try { await store.close("completed"); } catch { return unresolved("completion_journal_failed"); }
}
