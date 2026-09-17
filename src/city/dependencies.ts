import { assets } from './config';
import type {
  Asset,
  AssetKind,
  DependencyAlternative,
  DependencyAnalysis,
  DependencyImpactNode,
  DependencyRelation,
} from './types';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const byId = (id: string) => assets.find((a) => a.id === id);
const distance = (a: Asset, b: Asset) => Math.hypot(a.x - b.x, a.y - b.y);

const known: DependencyRelation[] = [
  { id: 'DEP-P2-H1', from: 'P2', to: 'H1', category: 'POWER', label: 'PRIMARY POWER FEED', strength: .94, confidence: .98, hidden: false, inferred: false, description: 'Hospital H1 depends on the central substation for normal operation.' },
  { id: 'DEP-P2-W1', from: 'P2', to: 'W1', category: 'POWER', label: 'PUMP / TREATMENT POWER', strength: .88, confidence: .96, hidden: false, inferred: false, description: 'Water treatment output depends on grid power for pumping and treatment.' },
  { id: 'DEP-P1-H2', from: 'P1', to: 'H2', category: 'POWER', label: 'PRIMARY POWER FEED', strength: .84, confidence: .95, hidden: false, inferred: false, description: 'Hospital H2 is supplied by the north grid zone.' },
  { id: 'DEP-P3-H2', from: 'P3', to: 'H2', category: 'BACKUP', label: 'SECONDARY FEED', strength: .62, confidence: .82, hidden: false, inferred: false, backup: true, description: 'A second substation can partially backfeed H2 during a primary outage.' },
  { id: 'DEP-W1-H1', from: 'W1', to: 'H1', category: 'WATER', label: 'CRITICAL WATER SUPPLY', strength: .72, confidence: .91, hidden: false, inferred: false, description: 'Hospital H1 needs treated water for care, sanitation and cooling.' },
  { id: 'DEP-P2-T1', from: 'P2', to: 'T1', category: 'POWER', label: 'TRANSIT POWER / CONTROL', strength: .74, confidence: .9, hidden: false, inferred: false, description: 'Transit operations and station control are exposed to the central grid.' },
];

function relationExists(list: DependencyRelation[], from: string, to: string) {
  return list.some((r) => r.from === from && r.to === to);
}

function inferredRelations(): DependencyRelation[] {
  const out: DependencyRelation[] = [];
  const add = (from: Asset, to: Asset, category: DependencyRelation['category'], label: string, maxD: number, base: number, description: string) => {
    if (from.id === to.id || relationExists(known, from.id, to.id) || relationExists(out, from.id, to.id)) return;
    const d = distance(from, to);
    if (d > maxD) return;
    const confidence = clamp(base + (1 - d / maxD) * .18, .55, .91);
    out.push({
      id: `INF-${from.id}-${to.id}-${category}`,
      from: from.id,
      to: to.id,
      category,
      label,
      strength: clamp(.48 + (1 - d / maxD) * .32, .45, .82),
      confidence,
      hidden: true,
      inferred: true,
      description,
    });
  };

  const power = assets.filter((a) => a.kind === 'POWER');
  const water = assets.filter((a) => a.kind === 'WATER');
  const transit = assets.filter((a) => a.kind === 'TRANSIT');
  const hospitals = assets.filter((a) => a.kind === 'HOSPITAL');

  for (const p of power) {
    for (const a of assets) {
      if (['HOSPITAL', 'WATER', 'EMS', 'FIRE', 'TRANSIT'].includes(a.kind)) {
        add(p, a, 'POWER', 'INFERRED SERVICE-ZONE POWER DEPENDENCY', 1550, .62,
          `CITADEL inferred a likely ${a.kind.toLowerCase()} power dependency from service-zone proximity and asset class.`);
      }
    }
  }

  for (const w of water) {
    for (const a of assets) {
      if (a.kind === 'HOSPITAL' || a.kind === 'FIRE') {
        add(w, a, 'WATER', 'INFERRED WATER / FIRE-FLOW DEPENDENCY', 1850, .61,
          `CITADEL inferred a non-obvious water dependency relevant to ${a.kind === 'FIRE' ? 'fire suppression' : 'clinical operations'}.`);
      }
    }
  }

  for (const t of transit) {
    for (const a of assets) {
      if (a.kind === 'HOSPITAL' || a.kind === 'EMS' || a.kind === 'FIRE') {
        add(t, a, 'ACCESS', 'INFERRED ACCESS / MOBILITY DEPENDENCY', 1800, .58,
          `CITADEL inferred that loss of the transit/access hub could increase response or staff-access time for ${a.name}.`);
      }
    }
  }

  for (const h of hospitals) {
    for (const e of assets.filter((a) => a.kind === 'EMS')) {
      add(h, e, 'OPERATIONAL', 'INFERRED CARE-DESTINATION DEPENDENCY', 1500, .6,
        `EMS turnaround depends on reachable receiving capacity; ${h.name} is a likely destination for ${e.name}.`);
    }
  }

  return out;
}

export const dependencyRelations: DependencyRelation[] = [...known, ...inferredRelations()];

function consequenceFor(a: Asset): string {
  switch (a.kind) {
    case 'HOSPITAL': return `${a.id} may enter degraded-care / diversion mode; emergency treatment access falls.`;
    case 'POWER': return `${a.id} load would redistribute across surviving grid assets, increasing overload risk.`;
    case 'WATER': return `${a.id} treatment / pumping output may fall, reducing reserve and fire-flow availability.`;
    case 'FIRE': return `${a.id} response coverage degrades and travel time from the remaining station increases.`;
    case 'EMS': return `${a.id} ambulance coverage and turnaround capacity decrease.`;
    case 'TRANSIT': return `${a.id} mobility and emergency-access routes lose throughput.`;
  }
}

function exposureWeight(kind: AssetKind) {
  return ({ HOSPITAL: 4800, POWER: 3600, WATER: 6200, FIRE: 1800, EMS: 2100, TRANSIT: 5200 } as Record<AssetKind, number>)[kind];
}

function alternativesFor(source: Asset, direct: DependencyImpactNode[]): DependencyAlternative[] {
  const out: DependencyAlternative[] = [];
  for (const impact of direct) {
    const target = byId(impact.assetId);
    if (!target) continue;
    const candidates = assets
      .filter((a) => a.kind === source.kind && a.id !== source.id && a.status !== 'FAILED')
      .sort((a, b) => distance(a, target) - distance(b, target));
    const alt = candidates[0];
    if (alt) {
      out.push({
        id: `ALT-${source.id}-${target.id}-${alt.id}`,
        targetAssetId: target.id,
        replacementAssetId: alt.id,
        type: source.kind === 'EMS' || source.kind === 'FIRE' || source.kind === 'HOSPITAL' ? 'MUTUAL AID' : 'ALTERNATE CONNECTION',
        label: `${alt.id} // ${alt.name}`,
        confidence: .72,
        description: `${alt.name} is the nearest surviving ${source.kind.toLowerCase()} asset that could provide partial redundancy to ${target.id}; switching capacity is modelled, not claimed as a live municipal configuration.`,
      });
    }

    if (source.kind === 'POWER' && target.kind === 'HOSPITAL') {
      out.push({ id: `BACKUP-GEN-${target.id}`, targetAssetId: target.id, type: 'BACKUP SYSTEM', label: `${target.id} ON-SITE GENERATOR`, confidence: .74, description: 'Modelled hospital generator can sustain essential loads temporarily while grid service is restored.' });
    }
    if (source.kind === 'POWER' && target.kind === 'WATER') {
      out.push({ id: `BACKUP-PUMP-${target.id}`, targetAssetId: target.id, type: 'BACKUP SYSTEM', label: `${target.id} BACKUP GENSET / PUMP`, confidence: .69, description: 'Modelled standby power keeps minimum treatment and pumping capacity available.' });
    }
    if (source.kind === 'WATER' && target.kind === 'HOSPITAL') {
      out.push({ id: `BACKUP-WATER-${target.id}`, targetAssetId: target.id, type: 'BACKUP SYSTEM', label: `${target.id} EMERGENCY WATER STORAGE`, confidence: .66, description: 'Modelled onsite storage delays clinical disruption after a network water loss.' });
    }
    if (source.kind === 'WATER' && target.kind === 'FIRE') {
      out.push({ id: `BACKUP-FIREWATER-${target.id}`, targetAssetId: target.id, type: 'BACKUP SYSTEM', label: `${target.id} MOBILE WATER SUPPORT`, confidence: .61, description: 'Tanker/static reserve support can partially substitute for reduced hydrant/fire-flow availability.' });
    }
  }

  if (source.kind === 'HOSPITAL') {
    const alt = assets.filter((a) => a.kind === 'HOSPITAL' && a.id !== source.id && a.status !== 'FAILED').sort((a, b) => distance(a, source) - distance(b, source))[0];
    if (alt) out.push({ id: `DIVERT-${source.id}-${alt.id}`, targetAssetId: source.id, replacementAssetId: alt.id, type: 'MUTUAL AID', label: `PATIENT DIVERSION → ${alt.id}`, confidence: .82, description: `${alt.name} is the nearest modelled receiving alternative if ${source.name} is unavailable.` });
  }

  return out.filter((x, i, arr) => arr.findIndex((y) => y.id === x.id) === i).slice(0, 8);
}

export function analyseDependencyFailure(sourceAssetId: string, populationActive = 38420): DependencyAnalysis | null {
  const source = byId(sourceAssetId);
  if (!source) return null;

  const affected = new Map<string, DependencyImpactNode>();
  const usedRelationIds = new Set<string>();
  const queue: Array<{ id: string; depth: number; path: string[]; rels: string[]; hidden: boolean }> = [
    { id: source.id, depth: 0, path: [source.id], rels: [], hidden: false },
  ];
  const expanded = new Set<string>();

  while (queue.length) {
    const cur = queue.shift()!;
    if (expanded.has(cur.id)) continue;
    expanded.add(cur.id);
    for (const rel of dependencyRelations.filter((r) => r.from === cur.id)) {
      const next = byId(rel.to);
      if (!next || rel.to === source.id) continue;
      usedRelationIds.add(rel.id);
      const node: DependencyImpactNode = {
        assetId: rel.to,
        depth: cur.depth + 1,
        path: [...cur.path, rel.to],
        relationIds: [...cur.rels, rel.id],
        hiddenPath: cur.hidden || rel.hidden,
        consequence: consequenceFor(next),
      };
      const existing = affected.get(rel.to);
      if (!existing || node.depth < existing.depth) affected.set(rel.to, node);
      if (node.depth < 5) queue.push({ id: rel.to, depth: node.depth, path: node.path, rels: node.relationIds, hidden: node.hiddenPath });
    }
  }

  const nodes = [...affected.values()].sort((a, b) => a.depth - b.depth || a.assetId.localeCompare(b.assetId));
  const direct = nodes.filter((n) => n.depth === 1);
  const indirect = nodes.filter((n) => n.depth > 1);
  const relations = dependencyRelations.filter((r) => usedRelationIds.has(r.id));
  const hiddenRelations = relations.filter((r) => r.hidden);
  const alternatives = alternativesFor(source, direct);

  const kindCriticality = nodes.reduce((sum, n) => {
    const a = byId(n.assetId);
    return sum + (a ? exposureWeight(a.kind) : 0) / 1000;
  }, 0);
  const cascadeRisk = Math.round(clamp(24 + direct.length * 10 + indirect.length * 7 + hiddenRelations.length * 6 + kindCriticality * 1.2, 0, 99));
  const rawExposure = exposureWeight(source.kind) + nodes.reduce((sum, n) => {
    const a = byId(n.assetId);
    if (!a) return sum;
    return sum + exposureWeight(a.kind) * (n.depth === 1 ? .75 : .38) * (n.hiddenPath ? .88 : 1);
  }, 0);
  const estimatedPeopleAffected = Math.round(Math.min(populationActive * .78, rawExposure));

  const consequences = [
    consequenceFor(source),
    ...direct.map((n) => n.consequence),
    ...(indirect.length ? [`${indirect.length} additional asset${indirect.length === 1 ? '' : 's'} become exposed through second- or higher-order dependencies.`] : []),
    ...(hiddenRelations.length ? [`${hiddenRelations.length} non-obvious cross-layer relationship${hiddenRelations.length === 1 ? '' : 's'} were inferred by the dependency engine.`] : []),
  ].filter((x, i, arr) => arr.indexOf(x) === i).slice(0, 7);

  return {
    sourceAssetId: source.id,
    direct,
    indirect,
    affected: nodes,
    relations,
    hiddenRelations,
    alternatives,
    consequences,
    cascadeRisk,
    estimatedPeopleAffected,
    algorithm: 'directed multi-layer BFS + asset-class inference + redundancy search',
  };
}
