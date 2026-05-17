/**
 * GoogleMapsNavigationScreen — Complete @ingissa/navcore-sdk example
 *
 * Renderer   : react-native-maps (PROVIDER_GOOGLE)
 * Directions : OSRMDirectionsProvider  (free, no API key)
 * Engine     : useNavCore              (Kalman + snap + FSMs)
 * GPS source : useSimulator            (synthetic route walk)
 * ETA        : ETAEngine               (rolling-window, offline)
 * Voice      : VoiceTriggerEngine      (proximity-gated cues)
 *
 * Features demonstrated:
 *   ✅ OSRMDirectionsProvider.getRoute() — free routing, no key required
 *   ✅ useNavCore                        — snapped coord, off-route FSM
 *   ✅ useSimulator + SimulatorControls  — synthetic GPS
 *   ✅ ETAEngine                         — local ETA, zero API calls
 *   ✅ VoiceTriggerEngine                — voice cue logging
 *   ✅ react-native-maps Polyline+Marker — native Google tile rendering
 *   ✅ GeofencingEngine                  — POI zone enter/exit events
 *
 * Env: EXPO_PUBLIC_GOOGLE_MAPS_API_KEY  (for tile rendering on Android/iOS)
 */

import React, {
    useState, useCallback, useMemo, useRef, useEffect,
} from 'react';
import {
    View, Text, TouchableOpacity, ScrollView, StyleSheet,
    Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Polyline, Marker, PROVIDER_GOOGLE, Circle } from 'react-native-maps';

// ── NavCore SDK ────────────────────────────────────────────────────────────────
import { OSRMDirectionsProvider } from '@ingissa/navcore-core';
import { useNavCore } from '@ingissa/navcore-react-native';
import { ETAEngine, VoiceTriggerEngine, GeofencingEngine } from '@ingissa/navcore-core';
import type {
    NavInstruction, ETAResult, Coordinate, GeofenceEvent,
} from '@ingissa/navcore-core';

// ── Simulator ─────────────────────────────────────────────────────────────────
import { NoiseEngine, ScenarioInjector, useSimulator, SimulatorControls } from '@ingissa/navcore-simulator';
import type { Scenario, SimSession, ScenarioLogEntry } from '@ingissa/navcore-simulator';

// ─── Tokens ───────────────────────────────────────────────────────────────────
const KW = {
    navyDeep: '#081525', navyCard: '#152240', navyBorder: '#1E3255',
    emerald: '#00BF76', emeraldDark: '#04342C',
    amber: '#F5A623', slate: '#6B7FA3', slateLight: '#8FA3C8',
    fault: '#FF4848', faultDark: '#3D0000',
    white: '#FFFFFF', cyan: '#22D3EE', purple: '#A855F7',
    google: '#4285F4',
    mono: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
} as const;

// ─── Fallback route: Marrakech medina loop ────────────────────────────────────
const ANCHORS: [number, number][] = [
    [-7.9897, 31.6295], [-7.9940, 31.6330], [-7.9980, 31.6370],
    [-7.9960, 31.6420], [-7.9900, 31.6450], [-7.9840, 31.6430],
    [-7.9800, 31.6380], [-7.9810, 31.6330], [-7.9860, 31.6300],
    [-7.9897, 31.6295],
];

function lerp(a: [number, number], b: [number, number], n = 10): Coordinate[] {
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
const ROUTE_CENTER = { latitude: 31.6370, longitude: -7.9897 };

// ─── Geofence zones (POIs along the route) ───────────────────────────────────
const GEOFENCE_ZONES = [
    { id: 'jemaa', name: 'Jemaa el-Fna', coord: [-7.9897, 31.6295] as Coordinate, radius: 80 },
    { id: 'souk', name: 'Souks Entrance', coord: [-7.9940, 31.6330] as Coordinate, radius: 60 },
    { id: 'bahia', name: 'Bahia Palace', coord: [-7.9810, 31.6380] as Coordinate, radius: 70 },
];

// ─── Build instructions from route ───────────────────────────────────────────
function buildInstructions(route: Coordinate[]): NavInstruction[] {
    const step = Math.floor(route.length / 6);
    const turns = [
        'Head north on Rue Riad Zitoun',
        'Turn left towards Jemaa el-Fna',
        'Continue onto Av Mohammed V',
        'Turn right at the roundabout',
        'Arrive at destination',
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

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function GoogleMapsNavigationScreen() {

    // ── Route & instructions ─────────────────────────────────────────────────
    const [route, setRoute] = useState<Coordinate[]>(FALLBACK_ROUTE);
    const [instructions, setInstr] = useState<NavInstruction[]>(() => buildInstructions(FALLBACK_ROUTE));
    const [routeSource, setRouteSource] = useState<'fallback' | 'osrm'>('fallback');

    // ── Navigation state ─────────────────────────────────────────────────────
    const [isNavigating, setIsNavigating] = useState(false);
    const [simActive, setSimActive] = useState(false);
    const [scenarioLog, setScenarioLog] = useState<ScenarioLogEntry[]>([]);
    const [voiceLog, setVoiceLog] = useState<string[]>([]);
    const [geofenceLog, setGeofenceLog] = useState<string[]>([]);
    const [eta, setEta] = useState<ETAResult | null>(null);

    // ── Engine refs ───────────────────────────────────────────────────────────
    const etaRef = useRef(new ETAEngine({ speedWindowSize: 8 }));
    const voiceRef = useRef(new VoiceTriggerEngine({ earlyTriggerMeters: 130 }));
    const geofenceRef = useRef(new GeofencingEngine({
        zones: GEOFENCE_ZONES.map(z => ({
            id: z.id,
            name: z.name,
            type: 'circle' as const,
            center: z.coord,
            radiusMeters: z.radius,
        })),
        onEvent: (event: GeofenceEvent) => {
            const emoji = event.type === 'enter' ? '📍' : '👋';
            setGeofenceLog(prev =>
                [`${emoji} ${event.type.toUpperCase()}: ${event.name}`, ...prev].slice(0, 5)
            );
        },
    }));
    const lastCue = useRef('');

    // ── Live OSRM route fetch ─────────────────────────────────────────────────
    useEffect(() => {
        const provider = new OSRMDirectionsProvider({
            baseUrl: 'http://router.project-osrm.org',
        });
        const ORIGIN: [number, number] = [-7.9897, 31.6295];
        const DEST: [number, number] = [-7.9810, 31.6380];

        provider.getRoute([ORIGIN, DEST])
            .then((result) => {
                setRoute(result.geometry as Coordinate[]);
                const instrs = buildInstructions(result.geometry as Coordinate[]);
                setInstr(instrs);
                voiceRef.current.setInstructions(instrs);
                setRouteSource('osrm');
            })
            .catch(() => {
                // Fallback route already set
            });
    }, []);

    useEffect(() => {
        voiceRef.current.setInstructions(instructions);
    }, [instructions]);

    // ── Scenarios ─────────────────────────────────────────────────────────────
    const scenarios = useMemo<Scenario[]>(() => [
        ScenarioInjector.gpsBlackout(15, 2500),
        ScenarioInjector.accuracyDrop(40, 45, 4000),
    ], []);

    const onScenarioFired = useCallback((s: Scenario) => {
        setScenarioLog(prev => [...prev, { ts: Date.now(), name: s.name, type: s.type }]);
    }, []);

    // ── Simulator ─────────────────────────────────────────────────────────────
    const { position, controls, session, isRecording } = useSimulator({
        routeGeometry: route,
        active: simActive,
        config: { speedKmh: 40, speedMultiplier: 1, noiseProfile: NoiseEngine.STANDARD, loop: false },
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
    });

    // ── ETA + voice + geofence polling ───────────────────────────────────────
    useEffect(() => {
        if (!isNavigating || !position) return;
        setEta(etaRef.current.update(navState));
        const cue = voiceRef.current.update(navState);
        if (cue && cue.triggerId !== lastCue.current) {
            lastCue.current = cue.triggerId;
            setVoiceLog(prev => [`🔊 ${cue.text}`, ...prev].slice(0, 6));
        }
        if (navState.snappedCoord) {
            geofenceRef.current.update(navState.snappedCoord);
        }
    }, [navState, isNavigating, position]);

    // ── Start / stop ──────────────────────────────────────────────────────────
    const handleStart = useCallback(() => {
        etaRef.current.reset();
        voiceRef.current.reset();
        setVoiceLog([]);
        setScenarioLog([]);
        setGeofenceLog([]);
        setIsNavigating(true);
        setSimActive(true);
    }, []);

    const handleStop = useCallback(() => {
        setIsNavigating(false);
        setSimActive(false);
    }, []);

    // ── Map data ──────────────────────────────────────────────────────────────
    const polylineCoords = useMemo(() =>
        route.map(c => ({ latitude: c[1], longitude: c[0] })),
        [route]);

    const vehicleCoord = useMemo(() => {
        const coord = navState.snappedCoord ?? position?.coord;
        return coord ? { latitude: coord[1], longitude: coord[0] } : null;
    }, [navState.snappedCoord, position]);

    const nextInstr = navState.nextInstructionIndex != null
        ? instructions[navState.nextInstructionIndex]
        : null;

    return (
        <SafeAreaView style={s.safe} edges={['top']}>
            {/* Header */}
            <View style={s.header}>
                <View>
                    <Text style={s.title}>GOOGLE MAPS NAVIGATION</Text>
                    <Text style={s.sub}>react-native-maps · OSRMDirectionsProvider · useNavCore</Text>
                </View>
                <View style={[s.badge, isNavigating && s.badgeLive]}>
                    <Text style={s.badgeText}>{isNavigating ? 'LIVE' : 'IDLE'}</Text>
                </View>
            </View>

            <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

                {/* Source badge */}
                <View style={s.sourceBadge}>
                    <Text style={s.sourceText}>
                        {routeSource === 'osrm' ? '✅ Route: OSRM (free, public)' : '📦 Route: Fallback'}
                        {' · '}{route.length} pts
                    </Text>
                </View>

                {/* Map */}
                <View style={s.mapWrap}>
                    <MapView
                        style={s.map}
                        provider={PROVIDER_GOOGLE}
                        initialRegion={{ ...ROUTE_CENTER, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
                        region={vehicleCoord ? {
                            ...vehicleCoord,
                            latitudeDelta: 0.015,
                            longitudeDelta: 0.015,
                        } : undefined}
                        customMapStyle={darkMapStyle}
                    >
                        {/* Route polyline */}
                        <Polyline
                            coordinates={polylineCoords}
                            strokeColor={KW.google}
                            strokeWidth={4}
                            lineDashPattern={undefined}
                        />

                        {/* Geofence circles */}
                        {GEOFENCE_ZONES.map(z => (
                            <Circle
                                key={z.id}
                                center={{ latitude: z.coord[1], longitude: z.coord[0] }}
                                radius={z.radius}
                                fillColor="rgba(66,133,244,0.08)"
                                strokeColor="rgba(66,133,244,0.4)"
                                strokeWidth={1}
                            />
                        ))}

                        {/* Vehicle marker */}
                        {vehicleCoord && (
                            <Marker
                                coordinate={vehicleCoord}
                                anchor={{ x: 0.5, y: 0.5 }}
                                rotation={navState.bearing}
                                flat
                            >
                                <View style={s.vehicleDot}>
                                    <View style={s.vehicleInner} />
                                </View>
                            </Marker>
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
                    <StatCard label="Speed" value={position ? fmtSpeed(position.speed) : '—'} accent={KW.google} />
                    <StatCard label="Bearing" value={position ? `${navState.bearing.toFixed(0)}° ${compass(navState.bearing)}` : '—'} accent={KW.cyan} />
                    <StatCard label="Accuracy" value={position ? `±${position.accuracy.toFixed(0)}m` : '—'} accent={KW.amber} />
                </View>
                <View style={s.row}>
                    <StatCard label="Dist Remain" value={fmtDist(navState.distanceToDestination)} accent={KW.purple} />
                    <StatCard label="ETA" value={eta?.isReliable ? fmtEta(eta.etaSeconds) : '—'} accent={KW.cyan} />
                    <StatCard label="Seg" value={`${navState.routeIndex} / ${route.length}`} />
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

                {/* Geofence log */}
                {geofenceLog.length > 0 && (
                    <>
                        <Text style={s.sectionTitle}>GEOFENCE EVENTS</Text>
                        <View style={s.logCard}>
                            {geofenceLog.map((l, i) => (
                                <Text key={i} style={s.logLine}>{l}</Text>
                            ))}
                        </View>
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

// ─── Dark map style for Google Maps ──────────────────────────────────────────
const darkMapStyle = [
    { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#98a5be' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

// ─── Styles ───────────────────────────────────────────────────────────────────
const sc = StyleSheet.create({
    card: { flex: 1, backgroundColor: KW.navyDeep, borderRadius: 8, padding: 10, marginHorizontal: 3, borderWidth: 1, borderColor: KW.navyBorder },
    label: { fontSize: 9, letterSpacing: 1.2, color: KW.slate, textTransform: 'uppercase', marginBottom: 4 },
    value: { fontSize: 14, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
});

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: KW.navyDeep },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: KW.navyCard, borderBottomWidth: 1, borderBottomColor: KW.navyBorder },
    title: { fontSize: 12, fontWeight: '900', color: KW.white, letterSpacing: 2 },
    sub: { fontSize: 9, color: KW.slate, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: KW.navyBorder },
    badgeLive: { borderColor: KW.google, backgroundColor: 'rgba(66,133,244,0.15)' },
    badgeText: { fontSize: 10, fontWeight: '800', color: KW.slate, letterSpacing: 1 },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 12, paddingTop: 10 },
    sourceBadge: { backgroundColor: KW.navyCard, borderRadius: 6, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: KW.navyBorder },
    sourceText: { fontSize: 10, color: KW.slateLight, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
    mapWrap: { height: 270, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: KW.navyBorder, marginBottom: 10 },
    map: { flex: 1 },
    vehicleDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(66,133,244,0.3)', alignItems: 'center', justifyContent: 'center' },
    vehicleInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: KW.white, borderWidth: 2, borderColor: KW.google },
    offRouteBanner: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(61,0,0,0.95)', padding: 10, alignItems: 'center' },
    offRouteText: { fontSize: 12, fontWeight: '800', color: KW.fault, letterSpacing: 1 },
    instrOverlay: { position: 'absolute', top: 8, left: 8, right: 8, backgroundColor: 'rgba(8,21,37,0.92)', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: KW.google },
    instrDist: { fontSize: 11, color: KW.google, fontWeight: '700', marginBottom: 2 },
    instrText: { fontSize: 13, color: KW.white, fontWeight: '600' },
    mainBtn: { backgroundColor: KW.google, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginVertical: 10 },
    mainBtnStop: { backgroundColor: KW.fault },
    mainBtnText: { fontSize: 14, fontWeight: '900', color: KW.white, letterSpacing: 1.5 },
    sectionTitle: { fontSize: 10, fontWeight: '800', color: KW.slate, letterSpacing: 1.5, marginTop: 14, marginBottom: 8 },
    row: { flexDirection: 'row', marginBottom: 4 },
    logCard: { backgroundColor: KW.navyCard, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: KW.navyBorder },
    logLine: { fontSize: 11, color: KW.slateLight, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', marginBottom: 3 },
});
