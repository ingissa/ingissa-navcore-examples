/**
 * MapboxNavigationScreen — Complete @ingissa/navcore-sdk example
 *
 * Renderer   : @rnmapbox/maps
 * Directions : MapboxDirectionsProvider  (Mapbox Directions API v5)
 * Engine     : useNavCore                (Kalman + snap + FSMs)
 * GPS source : useSimulator              (synthetic route walk)
 * ETA        : ETAEngine                 (rolling-window, offline)
 * Voice      : VoiceTriggerEngine        (proximity-gated cues)
 *
 * Features demonstrated:
 *   ✅ MapboxDirectionsProvider.getRoute() — live route fetch + chunking
 *   ✅ Step parsing → NavInstruction[]    — maneuver.instruction text
 *   ✅ useNavCore                         — snapped coord, off-route FSM
 *   ✅ useSimulator + SimulatorControls   — synthetic GPS
 *   ✅ ETAEngine                          — ETA computed locally
 *   ✅ VoiceTriggerEngine                 — proximity-gated voice cues
 *   ✅ Arrival detection                  — alert on hasArrived
 *
 * Env: EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN
 */

import React, {
    useState, useCallback, useMemo, useRef, useEffect,
} from 'react';
import {
    View, Text, TouchableOpacity, ScrollView, StyleSheet,
    Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapboxGL, {
    Camera, MapView, ShapeSource, LineLayer, CircleLayer,
} from '@rnmapbox/maps';

// ── NavCore SDK ────────────────────────────────────────────────────────────────
import { MapboxDirectionsProvider } from '@ingissa/navcore-mapbox';
import { useNavCore } from '@ingissa/navcore-react-native';
import { ETAEngine, VoiceTriggerEngine } from '@ingissa/navcore-core';
import type { NavInstruction, ETAResult, Coordinate } from '@ingissa/navcore-core';

// ── Simulator ─────────────────────────────────────────────────────────────────
import { NoiseEngine, ScenarioInjector, useSimulator, SimulatorControls } from '@ingissa/navcore-simulator';
import type { Scenario, SimSession, ScenarioLogEntry } from '@ingissa/navcore-simulator';

// ─── Tokens ───────────────────────────────────────────────────────────────────
const KW = {
    navyDeep: '#081525', navyCard: '#152240', navyBorder: '#1E3255',
    emerald: '#00BF76', emeraldDark: '#04342C', emeraldMid: '#009A5F',
    amber: '#F5A623', slate: '#6B7FA3', slateLight: '#8FA3C8',
    fault: '#FF4848', faultDark: '#3D0000',
    white: '#FFFFFF', cyan: '#22D3EE', purple: '#A855F7',
    mono: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
} as const;

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';
MapboxGL.setAccessToken(MAPBOX_TOKEN);

// ─── Fallback route: Agadir coastal loop ──────────────────────────────────────
const ANCHORS: [number, number][] = [
    [-9.5981, 30.4278], [-9.6100, 30.4310], [-9.6210, 30.4370],
    [-9.6280, 30.4440], [-9.6240, 30.4530], [-9.6100, 30.4600],
    [-9.5930, 30.4620], [-9.5750, 30.4560], [-9.5610, 30.4450],
    [-9.5540, 30.4320], [-9.5570, 30.4190], [-9.5680, 30.4090],
    [-9.5820, 30.4050], [-9.5981, 30.4278],
];

function lerp(a: [number, number], b: [number, number], n = 8): Coordinate[] {
    return Array.from({ length: n }, (_, i) => {
        const t = i / n;
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as Coordinate;
    });
}
function buildFallbackRoute(): Coordinate[] {
    const pts: Coordinate[] = [];
    for (let i = 0; i < ANCHORS.length - 1; i++) pts.push(...lerp(ANCHORS[i]!, ANCHORS[i + 1]!));
    pts.push(ANCHORS[ANCHORS.length - 1] as Coordinate);
    return pts;
}
const FALLBACK_ROUTE = buildFallbackRoute();
const ROUTE_CENTER: Coordinate = [-9.5981, 30.4278];

// ─── Build synthetic instructions from route ──────────────────────────────────
function buildInstructions(route: Coordinate[]): NavInstruction[] {
    const step = Math.floor(route.length / 6);
    const turns = [
        'Turn right onto Rue El Houria',
        'Turn left onto Blvd Mohammed V',
        'Continue straight 400 m',
        'Turn right onto Ave Hassan II',
        'Arrive — destination on right',
    ];
    return turns.map((text, i) => ({
        geometryIndex: (i + 1) * step,
        location: route[(i + 1) * step] ?? route[route.length - 1]!,
        text,
        instruction: text,
    }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const compass = (d: number) =>
    ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8] ?? 'N';
const fmtSpeed = (mps: number) => `${(mps * 3.6).toFixed(0)} km/h`;
const fmtDist = (m: number | null) =>
    m == null ? '—' : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m.toFixed(0)} m`;
const fmtEta = (s: number) => {
    const m = Math.floor(s / 60);
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatCard({ label, value, accent = KW.slateLight }: {
    label: string; value: string; accent?: string;
}) {
    return (
        <View style={sc.card}>
            <Text style={sc.label}>{label}</Text>
            <Text style={[sc.value, { color: accent }]}>{value}</Text>
        </View>
    );
}

function InstructionBanner({ text, dist }: { text: string; dist: number | null }) {
    return (
        <View style={sc.instrBanner}>
            <Text style={sc.instrDist}>{fmtDist(dist)}</Text>
            <Text style={sc.instrText} numberOfLines={2}>{text}</Text>
        </View>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function MapboxNavigationScreen() {

    // ── Route state ───────────────────────────────────────────────────────────
    const [route, setRoute] = useState<Coordinate[]>(FALLBACK_ROUTE);
    const [instructions, setInstr] = useState<NavInstruction[]>(() => buildInstructions(FALLBACK_ROUTE));
    const [routeSource, setRouteSource] = useState<'fallback' | 'api'>('fallback');

    // ── Navigation / sim state ────────────────────────────────────────────────
    const [isNavigating, setIsNavigating] = useState(false);
    const [simActive, setSimActive] = useState(false);
    const [scenarioLog, setScenarioLog] = useState<ScenarioLogEntry[]>([]);
    const [voiceLog, setVoiceLog] = useState<string[]>([]);
    const [eta, setEta] = useState<ETAResult | null>(null);

    // ── Engine refs ───────────────────────────────────────────────────────────
    const etaRef = useRef(new ETAEngine({ speedWindowSize: 8 }));
    const voiceRef = useRef(new VoiceTriggerEngine({ earlyTriggerMeters: 150 }));
    const lastCue = useRef('');

    // ── Live route fetch (optional — falls back gracefully) ───────────────────
    useEffect(() => {
        if (!MAPBOX_TOKEN) return;
        const provider = new MapboxDirectionsProvider({
            accessToken: MAPBOX_TOKEN,
            profile: 'driving',
        });
        // In production use real origin/destination coordinates here
        const ORIGIN: [number, number] = [-9.5981, 30.4278];
        const DEST: [number, number] = [-9.5820, 30.4050];

        provider.getRoute([ORIGIN, DEST], { steps: true, language: 'en' })
            .then((result) => {
                setRoute(result.geometry as Coordinate[]);
                // Parse Mapbox step maneuvers → NavInstruction[]
                const instrs: NavInstruction[] = result.legs
                    .flatMap(leg => leg.steps ?? [])
                    .filter(s => s.maneuver.type !== 'depart')
                    .map(s => ({
                        geometryIndex: result.geometry.findIndex(
                            c => c[0] === s.maneuver.location[0] && c[1] === s.maneuver.location[1]
                        ) || 0,
                        location: s.maneuver.location as Coordinate,
                        text: s.maneuver.instruction ?? s.maneuver.type,
                        instruction: s.maneuver.type,
                    }));
                if (instrs.length > 0) setInstr(instrs);
                voiceRef.current.setInstructions(instrs.length > 0 ? instrs : buildInstructions(result.geometry as Coordinate[]));
                setRouteSource('api');
            })
            .catch(() => {
                // Fallback already set — silently continue
            });
    }, []);

    // ── Sync voice engine instructions on change ──────────────────────────────
    useEffect(() => {
        voiceRef.current.setInstructions(instructions);
    }, [instructions]);

    // ── Scenarios ─────────────────────────────────────────────────────────────
    const scenarios = useMemo<Scenario[]>(() => [
        ScenarioInjector.gpsBlackout(20, 3000),
        ScenarioInjector.accuracyDrop(50, 45, 5000),
        ScenarioInjector.speedSpike(80, 120),
    ], []);

    const onScenarioFired = useCallback((s: Scenario) => {
        setScenarioLog(prev => [...prev, { ts: Date.now(), name: s.name, type: s.type }]);
    }, []);

    // ── Simulator ─────────────────────────────────────────────────────────────
    const { position, controls, session, isRecording } = useSimulator({
        routeGeometry: route,
        active: simActive,
        config: { speedKmh: 50, speedMultiplier: 1, noiseProfile: NoiseEngine.STANDARD, loop: false },
        scenarios,
        onScenarioFired,
    });

    // ── NavCore ───────────────────────────────────────────────────────────────
    const navState = useNavCore({
        gpsCoord: position?.coord ?? null,
        gpsBearing: position?.bearing ?? null,
        gpsAccuracy: position?.accuracy ?? null,
        gpsTimestamp: position?.timestamp ?? null,
        speed: position?.speed ?? 0,
        routeGeometry: route,
        instructions,
        isNavigating,
        options: { isDev: true },
        onInstruction: useCallback((instr: NavInstruction) => {
            const cue = voiceRef.current.onInstruction(instr, navState);
            if (cue && cue.triggerId !== lastCue.current) {
                lastCue.current = cue.triggerId;
                setVoiceLog(prev => [`🔊 ${cue.text}`, ...prev].slice(0, 6));
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []),
        onArrival: useCallback(() => {
            Alert.alert('🎉 Arrived!', 'You have reached your destination.');
            setSimActive(false);
            setIsNavigating(false);
        }, []),
        onDeviation: useCallback(() => {
            setVoiceLog(prev => ['⚠️ Off route — recalculating…', ...prev].slice(0, 6));
        }, []),
    });

    // ── ETA + voice polling ───────────────────────────────────────────────────
    useEffect(() => {
        if (!isNavigating || !position) return;
        const result = etaRef.current.update(navState);
        setEta(result);
        const cue = voiceRef.current.update(navState);
        if (cue && cue.triggerId !== lastCue.current) {
            lastCue.current = cue.triggerId;
            setVoiceLog(prev => [`🔊 ${cue.text}`, ...prev].slice(0, 6));
        }
    }, [navState, isNavigating, position]);

    // ── Start / stop ──────────────────────────────────────────────────────────
    const handleStart = useCallback(() => {
        etaRef.current.reset();
        voiceRef.current.reset();
        setVoiceLog([]);
        setScenarioLog([]);
        setIsNavigating(true);
        setSimActive(true);
    }, []);

    const handleStop = useCallback(() => {
        setIsNavigating(false);
        setSimActive(false);
    }, []);

    // ── GeoJSON ───────────────────────────────────────────────────────────────
    const routeGeoJSON = useMemo(() => ({
        type: 'FeatureCollection' as const,
        features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: route } }],
    }), [route]);

    const posGeoJSON = useMemo(() => {
        const coord = navState.snappedCoord ?? position?.coord;
        if (!coord) return null;
        return {
            type: 'FeatureCollection' as const,
            features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: coord } }],
        };
    }, [navState.snappedCoord, position]);

    // ─── Next instruction ──────────────────────────────────────────────────────
    const nextInstr = navState.nextInstructionIndex != null
        ? instructions[navState.nextInstructionIndex]
        : null;

    return (
        <SafeAreaView style={s.safe} edges={['top']}>
            {/* Header */}
            <View style={s.header}>
                <View>
                    <Text style={s.title}>MAPBOX NAVIGATION</Text>
                    <Text style={s.sub}>@rnmapbox/maps · MapboxDirectionsProvider · useNavCore</Text>
                </View>
                <View style={[s.badge, isNavigating && s.badgeLive]}>
                    <Text style={s.badgeText}>{isNavigating ? 'LIVE' : 'IDLE'}</Text>
                </View>
            </View>

            <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

                {/* Source badge */}
                <View style={s.sourceBadge}>
                    <Text style={s.sourceText}>
                        {routeSource === 'api' ? '✅ Route: Mapbox API' : '📦 Route: Fallback (no token)'}
                        {' · '}{route.length} pts
                    </Text>
                </View>

                {/* Map */}
                <View style={s.mapWrap}>
                    <MapView
                        style={s.map}
                        styleURL="mapbox://styles/mapbox/dark-v11"
                        logoEnabled={false}
                        attributionEnabled={false}
                        scaleBarEnabled={false}
                    >
                        <Camera
                            centerCoordinate={navState.snappedCoord ?? ROUTE_CENTER}
                            zoomLevel={position ? 14 : 12}
                            animationDuration={600}
                            heading={isNavigating ? navState.bearing : 0}
                        />
                        {/* Route line */}
                        <ShapeSource id="route" shape={routeGeoJSON}>
                            <LineLayer id="route-bg" style={{ lineColor: KW.emerald, lineWidth: 5, lineOpacity: 0.25, lineCap: 'round', lineJoin: 'round' }} />
                            <LineLayer id="route-fg" style={{ lineColor: KW.emerald, lineWidth: 3, lineCap: 'round', lineJoin: 'round' }} />
                        </ShapeSource>
                        {/* Vehicle dot */}
                        {posGeoJSON && (
                            <ShapeSource id="vehicle" shape={posGeoJSON}>
                                <CircleLayer id="vehicle-outer" style={{ circleRadius: 12, circleColor: KW.emerald, circleOpacity: 0.25 }} />
                                <CircleLayer id="vehicle-inner" style={{ circleRadius: 5, circleColor: KW.white, circleStrokeColor: KW.emerald, circleStrokeWidth: 2 }} />
                            </ShapeSource>
                        )}
                    </MapView>

                    {/* Off-route overlay */}
                    {navState.isOffRoute && (
                        <View style={s.offRouteBanner}>
                            <Text style={s.offRouteText}>⚠️ OFF ROUTE</Text>
                        </View>
                    )}

                    {/* Instruction overlay */}
                    {nextInstr && isNavigating && (
                        <View style={s.instrOverlay}>
                            <Text style={s.instrDist}>{fmtDist(navState.distanceToNextInstruction)}</Text>
                            <Text style={s.instrText} numberOfLines={2}>{nextInstr.text}</Text>
                        </View>
                    )}
                </View>

                {/* Start / Stop */}
                <TouchableOpacity
                    style={[s.mainBtn, isNavigating && s.mainBtnStop]}
                    onPress={isNavigating ? handleStop : handleStart}
                    activeOpacity={0.8}
                >
                    <Text style={s.mainBtnText}>
                        {isNavigating ? '■  STOP NAVIGATION' : '▶  START NAVIGATION'}
                    </Text>
                </TouchableOpacity>

                {/* Telemetry */}
                <Text style={s.sectionTitle}>TELEMETRY</Text>
                <View style={s.row}>
                    <StatCard label="Speed" value={position ? fmtSpeed(position.speed) : '—'} accent={KW.emerald} />
                    <StatCard label="Bearing" value={position ? `${navState.bearing.toFixed(0)}° ${compass(navState.bearing)}` : '—'} accent={KW.cyan} />
                    <StatCard label="Accuracy" value={position ? `±${position.accuracy.toFixed(0)}m` : '—'} accent={KW.amber} />
                </View>
                <View style={s.row}>
                    <StatCard label="Dist Remain" value={fmtDist(navState.distanceToDestination)} accent={KW.purple} />
                    <StatCard label="ETA" value={eta?.isReliable ? fmtEta(eta.etaSeconds) : '—'} accent={KW.cyan} />
                    <StatCard label="Route Idx" value={`${navState.routeIndex} / ${route.length}`} />
                </View>

                {/* Simulator controls */}
                {simActive && (
                    <>
                        <Text style={s.sectionTitle}>SIMULATOR</Text>
                        <SimulatorControls
                            simulator={controls}
                            session={session}
                            style="full"
                            showScenarioLog
                            showSessionRecorder={false}
                            scenarioLog={scenarioLog}
                            currentSpeed={1}
                            engineState={simActive ? 'running' : 'idle'}
                            isRecording={isRecording}
                            onExportSession={(s: SimSession) =>
                                Alert.alert('Session', `${s.positions.length} pts · ${(s.stats.distanceTravelledM / 1000).toFixed(2)} km`)
                            }
                        />
                    </>
                )}

                {/* Voice log */}
                {voiceLog.length > 0 && (
                    <>
                        <Text style={s.sectionTitle}>VOICE CUES</Text>
                        <View style={s.logCard}>
                            {voiceLog.map((l, i) => (
                                <Text key={i} style={s.logLine}>{l}</Text>
                            ))}
                        </View>
                    </>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const sc = StyleSheet.create({
    card: {
        flex: 1, backgroundColor: KW.navyDeep, borderRadius: 8,
        padding: 10, marginHorizontal: 3, borderWidth: 1, borderColor: KW.navyBorder,
    },
    label: { fontSize: 9, letterSpacing: 1.2, color: KW.slate, textTransform: 'uppercase', marginBottom: 4 },
    value: { fontSize: 14, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
    instrBanner: {
        backgroundColor: 'rgba(8,21,37,0.92)', padding: 12, borderRadius: 8,
        borderWidth: 1, borderColor: KW.emerald,
    },
    instrDist: { fontSize: 11, color: KW.emerald, fontWeight: '700', marginBottom: 2 },
    instrText: { fontSize: 13, color: KW.white, fontWeight: '600' },
});

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: KW.navyDeep },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: KW.navyCard, borderBottomWidth: 1, borderBottomColor: KW.navyBorder },
    title: { fontSize: 13, fontWeight: '900', color: KW.white, letterSpacing: 2 },
    sub: { fontSize: 9, color: KW.slate, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: KW.navyBorder },
    badgeLive: { borderColor: KW.emerald, backgroundColor: KW.emeraldDark },
    badgeText: { fontSize: 10, fontWeight: '800', color: KW.slate, letterSpacing: 1 },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 12, paddingTop: 10 },
    sourceBadge: { backgroundColor: KW.navyCard, borderRadius: 6, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: KW.navyBorder },
    sourceText: { fontSize: 10, color: KW.slateLight, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
    mapWrap: { height: 260, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: KW.navyBorder, marginBottom: 10 },
    map: { flex: 1 },
    offRouteBanner: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(61,0,0,0.95)', padding: 10, alignItems: 'center' },
    offRouteText: { fontSize: 12, fontWeight: '800', color: KW.fault, letterSpacing: 1 },
    instrOverlay: { position: 'absolute', top: 8, left: 8, right: 8, backgroundColor: 'rgba(8,21,37,0.92)', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: KW.emerald },
    instrDist: { fontSize: 11, color: KW.emerald, fontWeight: '700', marginBottom: 2 },
    instrText: { fontSize: 13, color: KW.white, fontWeight: '600' },
    mainBtn: { backgroundColor: KW.emerald, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginVertical: 10 },
    mainBtnStop: { backgroundColor: KW.fault },
    mainBtnText: { fontSize: 14, fontWeight: '900', color: KW.white, letterSpacing: 1.5 },
    sectionTitle: { fontSize: 10, fontWeight: '800', color: KW.slate, letterSpacing: 1.5, marginTop: 14, marginBottom: 8 },
    row: { flexDirection: 'row', marginBottom: 4 },
    logCard: { backgroundColor: KW.navyCard, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: KW.navyBorder },
    logLine: { fontSize: 11, color: KW.slateLight, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', marginBottom: 3 },
});
