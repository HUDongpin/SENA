import type { SenaModel } from "./analysis-runtime";
import { MetricCell } from "./workspace-primitives";

function formatStatsNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

export function SocialMetricsTable({ actors }: { actors: SenaModel["socialReport"]["actors"] }) {
  const sortedActors = [...actors].sort((a, b) => b.strength - a.strength || b.degree - a.degree || a.label.localeCompare(b.label));

  if (sortedActors.length === 0) {
    return <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-sm text-muted">Upload interactions to calculate actor-level SNA metrics.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-cardBorder/45 bg-background/25">
      <table className="min-w-full text-left text-xs">
        <thead>
          <tr className="border-b border-cardBorder/35 text-muted">
            <th className="px-3 py-2 font-black">Actor</th>
            <th className="px-3 py-2 font-black">Strength</th>
            <th className="px-3 py-2 font-black">Degree</th>
            <th className="px-3 py-2 font-black">Betweenness</th>
            <th className="px-3 py-2 font-black">Closeness</th>
            <th className="px-3 py-2 font-black">Reach</th>
            <th className="px-3 py-2 font-black">Community</th>
            <th className="px-3 py-2 font-black">Component</th>
          </tr>
        </thead>
        <tbody>
          {sortedActors.map((actor) => (
            <tr key={actor.id} className="border-t border-cardBorder/20">
              <td className="whitespace-nowrap px-3 py-2">
                <div className="font-black text-foreground">{actor.label}</div>
                <div className="text-[0.68rem] font-semibold text-muted">{actor.role} - {actor.group}</div>
              </td>
              <td className="px-3 py-2 font-semibold text-foreground/82">{formatStatsNumber(actor.strength, 1)}</td>
              <td className="px-3 py-2 font-semibold text-foreground/82">{formatStatsNumber(actor.degree, 1)}</td>
              <td className="px-3 py-2 font-semibold text-foreground/82">{formatStatsNumber(actor.betweenness)}</td>
              <td className="px-3 py-2 font-semibold text-foreground/82">{formatStatsNumber(actor.closeness)}</td>
              <td className="px-3 py-2 font-semibold text-foreground/82">{formatStatsNumber(actor.reachable, 0)}</td>
              <td className="px-3 py-2 font-semibold text-foreground/82">{actor.community >= 0 ? actor.community + 1 : "NA"}</td>
              <td className="px-3 py-2 font-semibold text-foreground/82">{actor.component >= 0 ? actor.component + 1 : "NA"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CommunityList({ communities }: { communities: SenaModel["socialReport"]["communities"] }) {
  if (communities.length === 0) {
    return <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-sm text-muted">No communities detected yet.</div>;
  }

  return (
    <div className="grid gap-3">
      {communities.map((community) => (
        <div key={community.id} className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-black text-foreground">{community.label}</div>
            <div className="text-xs font-black text-cyanGlow">{community.size} actor{community.size === 1 ? "" : "s"}</div>
          </div>
          <div className="mt-2 text-sm font-semibold leading-6 text-muted">{community.members.join(", ")}</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MetricCell label="Internal weight" value={formatStatsNumber(community.internalWeight, 1)} />
            <MetricCell label="External weight" value={formatStatsNumber(community.externalWeight, 1)} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PairContributionTable({ pairs }: { pairs: SenaModel["pairReport"] }) {
  const activePairs = pairs
    .filter((pair) => pair.totalContribution > 0)
    .sort((a, b) => b.totalContribution - a.totalContribution || a.label.localeCompare(b.label));

  if (activePairs.length === 0) {
    return <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-sm text-muted">Upload coded segments to calculate person-code-pair contributions.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-cardBorder/45 bg-background/25">
      <table className="min-w-full text-left text-xs">
        <thead>
          <tr className="border-b border-cardBorder/35 text-muted">
            <th className="px-3 py-2 font-black">Code-pair</th>
            <th className="px-3 py-2 font-black">Total G</th>
            <th className="px-3 py-2 font-black">Top contributors</th>
            <th className="px-3 py-2 font-black">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {activePairs.map((pair) => (
            <tr key={pair.id} className="border-t border-cardBorder/20">
              <td className="whitespace-nowrap px-3 py-2 font-black text-foreground">{pair.label}</td>
              <td className="px-3 py-2 font-semibold text-foreground/82">{formatStatsNumber(pair.totalContribution, 1)}</td>
              <td className="min-w-56 px-3 py-2 font-semibold text-foreground/82">
                {pair.topContributors.map((contributor) => (
                  `${contributor.label} ${formatStatsNumber(contributor.weight, 1)} (D ${formatStatsNumber(contributor.directWeight, 1)} / S ${formatStatsNumber(contributor.supportingWeight, 1)})`
                )).join(", ")}
              </td>
              <td className="px-3 py-2 font-semibold text-foreground/82">{pair.evidence.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
