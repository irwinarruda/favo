export const RolloutHeadBytes = 2_048;

const RolloutName = /rollout-[^/]*?-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/;
const StartedAt = /^\{"timestamp":"([^"]+)"/;
const WorkingFolder = /"cwd":("(?:[^"\\]|\\.)*")/;
const SubagentSource = /"source":\{"subagent"|"thread_source":"subagent"/;

export function rolloutThreadOf(path: string, head: string | undefined) {
  if (!head || SubagentSource.test(head)) return undefined;
  const id = RolloutName.exec(path)?.[1];
  const updatedAt = StartedAt.exec(head)?.[1];
  const folder = WorkingFolder.exec(head)?.[1];
  if (!id || !updatedAt || !folder) return undefined;
  return { id, updatedAt, directory: JSON.parse(folder) as string };
}
