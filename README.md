# CITADEL — Bengaluru Resilience Digital Twin

Browser-based Cesium prototype for Manipal Hackathon 2026.

## What is real vs simulated

- **Real geospatial context:** Cesium / Google Photorealistic 3D Tiles when available, with Cesium OSM Buildings fallback.
- **Synthetic resilience network:** roads, hospitals, substations, water, emergency units and dependencies used for repeatable scenario testing.
- **Computed outputs:** routing, capacity loss, cascading failures, evacuation, intervention ranking and recovery sequencing.

The prototype does **not** claim that the synthetic operational values are live BBMP, BESCOM, BWSSB or hospital telemetry.

## Simulation algorithms implemented

1. **Dynamic Dijkstra routing** — road cost responds to capacity, closures and congestion; civilian and emergency vehicles recalculate routes.
2. **Flood exposure model** — rainfall × synthetic drainage × radial exposure changes road capacity and asset state.
3. **Earthquake fragility model** — distance-decay shaking × deterministic asset fragility produces repeatable probabilistic-style damage.
4. **Grid cascading failure** — lost load is redistributed to surviving substations; threshold overloads propagate to dependent services.
5. **Evacuation routing** — visible population agents are sent to reachable safe zones using the same graph engine.
6. **Emergency resource dispatch** — nearest available EMS / fire unit is routed with emergency-priority cost and traffic signal priority.
7. **Intervention ranking** — response options are ranked by resilience gain × cascade reduction / cost.
8. **Recovery sequencing** — repairs are ordered by criticality × dependency unlock / restoration time.
9. **Resilience Red Team** — asset pairs are structurally scored to expose hidden systemic combinations.

## Working scenarios

- Normal city accident + EMS / police dispatch
- Urban fire + fire response
- Urban flood
- M6.4 earthquake
- Grid cascade
- Compound crisis
- Evacuation + safe zones
- Response interventions
- Recovery optimisation
- Hidden weakness / Red Team scan

## Run

```bash
npm install
npm run dev
```

Create `.env`:

```text
VITE_CESIUM_ION_TOKEN=YOUR_NEW_CESIUM_TOKEN
```

Open the localhost URL shown by Vite.

## Demo flow

1. Enter CITADEL.
2. Open **SIM** in the left layer dock.
3. Run **Urban Flood** or **M6.4 Earthquake**.
4. Watch roads re-weight, vehicles reroute, people evacuate and emergency units dispatch.
5. Use the right-side **LIVE / RESPOND / RECOVER / ALGO** console.
6. Apply the recommended response and observe resilience improve.
7. Run recovery steps.
8. Reset and run **Resilience Red Team**.

## Real-world data connectors for a later deployment

The UI explicitly labels these as connectors / future data modes, not current live data:

- OpenStreetMap roads and points of interest
- BBMP / city GIS civic layers
- Live weather and hazard feeds
- Hospital capacity / emergency telemetry
- Utility / IoT sensor feeds


## Live Fusion Mode (added)

CITADEL now supports two operational modes:

- **LIVE FUSION** — current Open-Meteo weather, optional TomTom live traffic flow, and OpenStreetMap Overpass emergency/safe-site POIs feed the model.
- **SCENARIO LAB** — live influence is paused and the operator can impose custom weather, traffic and disaster conditions for repeatable what-if analysis.

### Environment variables

```bash
VITE_CESIUM_ION_TOKEN=...
VITE_TOMTOM_API_KEY=...   # optional, required for live traffic flow
```

Open-Meteo and OpenStreetMap Overpass do not require a key for this prototype.

### Data honesty

CITADEL does **not** claim that Bengaluru traffic-signal controller phases, casualty counts, hospital capacity, or utility telemetry are live municipal data. Signal timing is an adaptive model informed by congestion and emergency priority. Human-impact and response-batch figures are model estimates and are labelled as such in the UI.
