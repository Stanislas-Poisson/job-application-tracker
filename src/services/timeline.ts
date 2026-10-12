import type { Activity, Interaction } from '../models'

// One line of the timeline of an application: something the extension recorded, or an exchange with someone.
export type TimelineEntry =
  | { kind: 'activity'; at: string; id: string; activity: Activity }
  | { kind: 'interaction'; at: string; id: string; interaction: Interaction }

// The activities and the exchanges of an application as one list, the most recent first. Two entries at the same
// moment keep a stable order: exchanges before what the extension recorded.
export function buildTimeline(activities: Activity[], interactions: Interaction[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...interactions.map((interaction) => ({
      kind: 'interaction' as const,
      at: interaction.occurredAt,
      id: interaction.id,
      interaction,
    })),
    ...activities.map((activity) => ({
      kind: 'activity' as const,
      at: activity.occurredAt,
      id: activity.id,
      activity,
    })),
  ]
  return entries.sort((a, b) => b.at.localeCompare(a.at))
}
