/**
 * MapLibreNavigationScreen — Complete @ingissa/navcore-sdk example
 *
 * Renderer   : @maplibre/maplibre-react-native
 * Directions : ValhallaDirectionsProvider  (free, OSM-hosted)
 * Engine     : useNavCore                  (Kalman + snap + FSMs)
 * GPS source : useSimulator                (synthetic route walk)
 * ETA        : ETAEngine                   (rolling-window, offline)
 * Voice      : VoiceTriggerEngine          (proximity-gated cues)
 *
 * Features demonstrated:
 *   ✅ ValhallaDirectionsProvider.getRoute() — fully open-source routing
 *   ✅ useNavCore                            — Kalman filter, route snapping
 *   ✅ useSimulator + SimulatorControls      — synthetic GPS engine
 *   ✅ ETAEngine                             — local ETA, no API needed
 *   ✅ VoiceTriggerEngine                    — proximity-gated cues
 *   ✅ MapLibreGL ShapeSource + LineLayer    — GeoJSON route rendering
 *   ✅ Route progress bar                    — visual segment progress
 *   ✅ 100% open-source stack               — zero paid API required
 *
 * Self-host Valhalla: docker run -p 8002:8002 ghcr.io/valhalla/valhalla:latest
 * Set: EXPO_PUBLIC_VALHALLA_URL=http://your-server:8002
 */

import React, {
    useState, useCallback, useMemo, useRef, useEffect,
} from 'react';
import {
    View, Text, TouchableOpacity, ScrollView, StyleSheet,
    Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as MapLibreGL from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';

// ── Initialize MapLibre Engine ───────────────────────────────────────────────
//MapLibreGL.setAccessToken(null);
//(MapLibreGL as any).setAccessToken(null);
// ── NavCore SDK ────────────────────────────────────────────────────────────────
import { ValhallaDirectionsProvider } from '@ingissa/navcore-core';
//import { useNavCore } from '@ingissa/navcore-react-native';
import { ETAEngine, VoiceTriggerEngine } from '@ingissa/navcore-core';
import type { NavInstruction, ETAResult, Coordinate } from '@ingissa/navcore-core';

// ── Simulator ─────────────────────────────────────────────────────────────────
import { NoiseEngine, ScenarioInjector, useSimulator, SimulatorControls } from '@ingissa/navcore-simulator';
import type { Scenario, SimSession, ScenarioLogEntry } from '@ingissa/navcore-simulator';
import { useNavCore } from '@ingissa/navcore-react-native';

// ─── Tokens ───────────────────────────────────────────────────────────────────
const KW = {
    navyDeep: '#081525', navyCard: '#152240', navyBorder: '#1E3255',
    emerald: '#00BF76', emeraldDark: '#04342C',
    amber: '#F5A623', slate: '#6B7FA3', slateLight: '#8FA3C8',
    fault: '#FF4848', faultDark: '#3D0000',
    white: '#FFFFFF', cyan: '#22D3EE', purple: '#A855F7',
    mono: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
} as const;

const VALHALLA_URL =
    process.env.EXPO_PUBLIC_VALHALLA_URL ?? 'https://valhalla1.openstreetmap.de';

// ─── Fallback route: Fez, Morocco ─────────────────────────────────────────
const ANCHORS: [number, number][] = [
    [-4.9740, 34.0650], // Start (near Bab Bou Jeloud)
    [-4.9730, 34.0665], // Waypoint 1 (Talaa Kebira)
    [-4.9715, 34.0678], // Waypoint 2
    [-4.9700, 34.0685], // Waypoint 3
    [-4.9685, 34.0690], // Waypoint 4 (near Al Attarine Madrasa)
    [-4.9675, 34.0705], // Waypoint 5
    [-4.9660, 34.0720], // Waypoint 6
    [-4.9650, 34.0735], // Waypoint 7
    [-4.9640, 34.0750], // Waypoint 8 (near Chouara Tannery)
];


function lerp(a: [number, number], b: [number, number], n = 10): Coordinate[] {
    return Array.from({ length: n }, (_, i) => {
        const t = i / n;
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as Coordinate;
    });
}

function buildFallbackRoute(): Coordinate[] {
    const pts: Coordinate[] = [];
    for (let i = 0; i < ANCHORS.length - 1; i++) {
        pts.push(...lerp(ANCHORS[i]!, ANCHORS[i + 1]!));
    }
    pts.push(ANCHORS[ANCHORS.length - 1] as Coordinate);
    return pts;
}

const FALLBACK_ROUTE = buildFallbackRoute();
const ROUTE_CENTER: Coordinate = [-4.9700, 34.0700]; // Fez, Morocco

// ─── Build instructions from route ───────────────────────────────────────────
function buildInstructions(route: Coordinate[]): NavInstruction[] {
    const step = Math.floor(route.length / 6);
    const turns = [
        'Head north on Talaa Kebira',
        'Turn left at Bab Bou Jeloud',
        'Continue through the medina',
        'Turn right towards Al-Qarawiyyin',
        'Arrive at Bab Rcif',
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

function ProgressBar({ progress }: { progress: number }) {
    const pct = Math.min(1, Math.max(0, progress));
    return (
        <View style={sc.progressTrack}>
            <View style={[sc.progressFill, { width: `${pct * 100}%` as any }]} />
            <Text style={sc.progressLabel}>{(pct * 100).toFixed(0)}% complete</Text>
        </View>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function MapLibreNavigationScreen() {

    // ── Route & instructions ─────────────────────────────────────────────────
    const [route, setRoute] = useState<Coordinate[]>(FALLBACK_ROUTE);
    const [instructions, setInstr] = useState<NavInstruction[]>(() => buildInstructions(FALLBACK_ROUTE));
    const [routeSource, setRouteSource] = useState<'fallback' | 'valhalla'>('fallback');
    const [routeDistance, setRouteDist] = useState<number | null>(null);

    // ── Navigation state ─────────────────────────────────────────────────────
    const [isNavigating, setIsNavigating] = useState(false);
    const [simActive, setSimActive] = useState(false);
    const [scenarioLog, setScenarioLog] = useState<ScenarioLogEntry[]>([]);
    const [voiceLog, setVoiceLog] = useState<string[]>([]);
    const [eta, setEta] = useState<ETAResult | null>(null);

    // ── Engine refs ───────────────────────────────────────────────────────────
    const etaRef = useRef(new ETAEngine({ speedWindowSize: 8, fallbackSpeedMs: 6.94 /* 25 km/h */ }));
    const voiceRef = useRef(new VoiceTriggerEngine({ earlyTriggerMeters: 120, reannounceMeters: 250 }));
    const lastCue = useRef('');

    useEffect(() => {
        const provider = new ValhallaDirectionsProvider({
            baseUrl: VALHALLA_URL,
            costing: 'pedestrian', // Fez medina is pedestrian-friendly
        });
        const ORIGIN: [number, number] = [-4.9740, 34.0650];
        const DEST: [number, number] = [-4.9700, 34.0780];

        // ── Permissions ────────────────────────────────────────────────────────
        (async () => {
            const enabled = await Location.hasServicesEnabledAsync();
            if (!enabled) {
                Alert.alert('Location Disabled', 'Please enable location services in your device settings.');
            }
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                console.warn('Location permission denied');
            }
        })();

        provider.getRoute([ORIGIN, DEST])
            .then((result) => {
                setRoute(result.geometry as Coordinate[]);
                const instrs = buildInstructions(result.geometry as Coordinate[]);
                setInstr(instrs);
                voiceRef.current.setInstructions(instrs);
                setRouteDist(result.distance);
                setRouteSource('valhalla');
            })
            .catch(() => {
                // Fallback already set; Valhalla may be unreachable in dev
            });
    }, []);

    useEffect(() => {
        voiceRef.current.setInstructions(instructions);
    }, [instructions]);

    // ── Scenarios ─────────────────────────────────────────────────────────────
    const scenarios = useMemo<Scenario[]>(() => [
        ScenarioInjector.gpsBlackout(20, 3000),
        ScenarioInjector.accuracyDrop(45, 40, 5000),
        ScenarioInjector.speedSpike(60, 100),
    ], []);

    const onScenarioFired = useCallback((s: Scenario) => {
        setScenarioLog(prev => [...prev, { ts: Date.now(), name: s.name, type: s.type }]);
    }, []);

    // ── Simulator ─────────────────────────────────────────────────────────────
    const { position, controls, session, isRecording } = useSimulator({
        routeGeometry: route,
        active: simActive,
        config: {
            speedKmh: 25,          // pedestrian-ish speed for medina
            speedMultiplier: 1,
            noiseProfile: NoiseEngine.STANDARD,
            loop: false,
        },
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
        options: { isDev: true, arrivalThresholdMeters: 20 },
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
        setEta(etaRef.current.update(navState));
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
        features: [{
            type: 'Feature' as const,
            properties: {},
            geometry: { type: 'LineString' as const, coordinates: route },
        }],
    }), [route]);

    const posGeoJSON = useMemo(() => {
        const coord = navState.snappedCoord ?? position?.coord;
        if (!coord) return null;
        return {
            type: 'FeatureCollection' as const,
            features: [{
                type: 'Feature' as const,
                properties: {},
                geometry: { type: 'Point' as const, coordinates: coord },
            }],
        };
    }, [navState.snappedCoord, position]);

    // ── Progress ──────────────────────────────────────────────────────────────
    const progress = route.length > 1 ? navState.routeIndex / (route.length - 1) : 0;

    const nextInstr = navState.nextInstructionIndex != null
        ? instructions[navState.nextInstructionIndex]
        : null;

    return (
        <SafeAreaView style={s.safe} edges={['top']}>
            {/* Header */}
            <View style={s.header}>
                <View>
                    <Text style={s.title}>MAPLIBRE NAVIGATION</Text>
                    <Text style={s.sub}>@maplibre/maplibre-react-native · Valhalla · useNavCore</Text>
                </View>
                <View style={[s.badge, isNavigating && s.badgeLive]}>
                    <Text style={s.badgeText}>{isNavigating ? 'LIVE' : 'IDLE'}</Text>
                </View>
            </View>

            <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

                {/* Open-source stack badge */}
                <View style={s.osBadge}>
                    <Text style={s.osText}>
                        🟢 100% Open-Source Stack · MapLibre + Valhalla + NavCore
                    </Text>
                    <Text style={s.osText}>
                        {routeSource === 'valhalla'
                            ? `✅ Route: Valhalla OSM · ${routeDistance ? `${(routeDistance / 1000).toFixed(2)} km` : '—'}`
                            : '📦 Route: Fallback (Valhalla unreachable)'}
                        {' · '}{route.length} pts
                    </Text>
                </View>

                {/* Map */}
                <View style={s.mapContainer}>
                    <MapLibreGL.Map
                        style={s.map}
                        mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
                        logo={false}
                        attribution={false}
                    >
                        <MapLibreGL.Camera
                            zoom={16}
                            easing={isNavigating ? 'linear' : 'fly'}
                            duration={isNavigating ? 1000 : 1100}
                            center={isNavigating && position ? position.coord : ROUTE_CENTER}
                            bearing={isNavigating && position ? position.bearing : 0}
                            pitch={isNavigating ? 45 : 0}
                        />

                        {/* Route Line */}
                        {routeGeoJSON && (
                            <MapLibreGL.GeoJSONSource id="route-source" data={routeGeoJSON}>
                                <MapLibreGL.Layer
                                    id="route-line"
                                    type="line"
                                    paint={{
                                        lineColor: KW.emerald,
                                        lineWidth: 8,
                                        lineOpacity: 0.8,
                                    } as any}
                                    layout={{
                                        lineCap: 'round',
                                        lineJoin: 'round',
                                    } as any}
                                />
                            </MapLibreGL.GeoJSONSource>
                        )}

                        {/* Vehicle dot */}
                        {posGeoJSON && (
                            <MapLibreGL.GeoJSONSource id="vehicle" data={posGeoJSON}>
                                <MapLibreGL.Layer
                                    id="vehicle-outer"
                                    type="circle"
                                    paint={{
                                        circleRadius: 14,
                                        circleColor: KW.purple,
                                        circleOpacity: 0.2,
                                    } as any}
                                />
                                <MapLibreGL.Layer
                                    id="vehicle-inner"
                                    type="circle"
                                    paint={{
                                        circleRadius: 5,
                                        circleColor: KW.white,
                                        circleStrokeColor: KW.purple,
                                        circleStrokeWidth: 2,
                                    } as any}
                                />
                            </MapLibreGL.GeoJSONSource>
                        )}
                    </MapLibreGL.Map>

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

                {/* Progress bar */}
                {isNavigating && <ProgressBar progress={progress} />}

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
                    <StatCard label="Speed" value={position ? fmtSpeed(position.speed) : '—'} accent={KW.purple} />
                    <StatCard label="Bearing" value={position ? `${navState.bearing.toFixed(0)}° ${compass(navState.bearing)}` : '—'} accent={KW.cyan} />
                    <StatCard label="Accuracy" value={position ? `±${position.accuracy.toFixed(0)}m` : '—'} accent={KW.amber} />
                </View>
                <View style={s.row}>
                    <StatCard label="Dist Remain" value={fmtDist(navState.distanceToDestination)} accent={KW.emerald} />
                    <StatCard label="ETA" value={eta?.isReliable ? fmtEta(eta.etaSeconds) : '—'} accent={KW.cyan} />
                    <StatCard label="Seg" value={`${navState.routeIndex} / ${route.length}`} />
                </View>

                {/* Engine debug row */}
                <View style={s.row}>
                    <StatCard label="Off-Route" value={navState.isOffRoute ? 'YES' : 'NO'} accent={navState.isOffRoute ? KW.fault : KW.emerald} />
                    <StatCard label="Corridor" value={`${navState.corridor.toFixed(0)}m`} accent={KW.amber} />
                    <StatCard label="Lifecycle" value={navState.lifecycleState ?? '—'} />
                </View>

                {/* Simulator controls */}
                {simActive && (
                    <>
                        <Text style={s.sectionTitle}>SIMULATOR</Text>
                        <SimulatorControls
                            simulator={controls}
                            session={session}
                            style="minimal"
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

                {/* Self-hosting note */}
                <View style={s.noteCard}>
                    <Text style={s.noteTitle}>💡 Self-host Valhalla</Text>
                    <Text style={s.noteText}>
                        {'docker run -p 8002:8002 ghcr.io/valhalla/valhalla:latest\n'}
                        {'Set EXPO_PUBLIC_VALHALLA_URL=http://your-server:8002\n'}
                        {'OSM data: download from geofabrik.de and mount via -v'}
                    </Text>
                </View>

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
    label: {
        fontSize: 9, letterSpacing: 1.2, color: KW.slate,
        textTransform: 'uppercase', marginBottom: 4,
    },
    value: {
        fontSize: 14, fontWeight: '700',
        fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    },
    progressTrack: {
        height: 6, backgroundColor: KW.navyCard, borderRadius: 3,
        marginBottom: 10, overflow: 'hidden',
    },
    progressFill: {
        height: '100%', backgroundColor: KW.purple, borderRadius: 3,
    },
    progressLabel: {
        position: 'absolute', right: 0, top: -14,
        fontSize: 9, color: KW.slate,
    },
});

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: KW.navyDeep },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: KW.navyCard, borderBottomWidth: 1, borderBottomColor: KW.navyBorder },
    title: { fontSize: 12, fontWeight: '900', color: KW.white, letterSpacing: 2 },
    sub: { fontSize: 9, color: KW.slate, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: KW.navyBorder },
    badgeLive: { borderColor: KW.purple, backgroundColor: 'rgba(168,85,247,0.15)' },
    badgeText: { fontSize: 10, fontWeight: '800', color: KW.slate, letterSpacing: 1 },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 12, paddingTop: 10 },
    osBadge: { backgroundColor: KW.navyCard, borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: KW.navyBorder, gap: 4 },
    osText: { fontSize: 10, color: KW.slateLight, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
    mapContainer: { height: 270, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: KW.navyBorder, marginBottom: 10 },
    map: { flex: 1 },
    offRouteBanner: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(61,0,0,0.95)', padding: 10, alignItems: 'center' },
    offRouteText: { fontSize: 12, fontWeight: '800', color: KW.fault, letterSpacing: 1 },
    instrOverlay: { position: 'absolute', top: 8, left: 8, right: 8, backgroundColor: 'rgba(8,21,37,0.92)', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: KW.purple },
    instrDist: { fontSize: 11, color: KW.purple, fontWeight: '700', marginBottom: 2 },
    instrText: { fontSize: 13, color: KW.white, fontWeight: '600' },
    mainBtn: { backgroundColor: KW.purple, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginVertical: 10 },
    mainBtnStop: { backgroundColor: KW.fault },
    mainBtnText: { fontSize: 14, fontWeight: '900', color: KW.white, letterSpacing: 1.5 },
    sectionTitle: { fontSize: 10, fontWeight: '800', color: KW.slate, letterSpacing: 1.5, marginTop: 14, marginBottom: 8 },
    row: { flexDirection: 'row', marginBottom: 4 },
    logCard: { backgroundColor: KW.navyCard, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: KW.navyBorder },
    logLine: { fontSize: 11, color: KW.slateLight, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', marginBottom: 3 },
    noteCard: { backgroundColor: KW.navyCard, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: KW.navyBorder, marginTop: 14 },
    noteTitle: { fontSize: 11, fontWeight: '700', color: KW.purple, marginBottom: 6 },
    noteText: { fontSize: 10, color: KW.slate, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', lineHeight: 16 },
});
