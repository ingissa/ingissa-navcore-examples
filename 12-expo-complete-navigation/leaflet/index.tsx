/**
 * LeafletNavigationScreen — Universal @ingissa/navcore-sdk example
 *
 * Renderer   : react-native-webview + Leaflet.js (CDN)
 * Map Tiles  : CartoDB Dark (OpenStreetMap-based, zero key required)
 * Directions : OSRMDirectionsProvider (free, public — router.project-osrm.org)
 * Engine     : useNavCore (Kalman filter + route snapping + FSMs)
 * GPS source : useSimulator (synthetic route walk)
 * ETA        : ETAEngine (rolling-window, offline)
 * Voice      : VoiceTriggerEngine (proximity-gated cues)
 *
 * ✅ Works in standard Expo Go — no custom dev build required
 * ✅ Requires zero API keys
 * ✅ Full NavCore SDK feature demonstration
 * ✅ Best starting point for testing in Expo Go
 *
 * Route: Casablanca old medina loop
 */

import React, {
    useState, useCallback, useRef, useEffect,
} from 'react';
import {
    View, Text, TouchableOpacity, ScrollView, StyleSheet,
    Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

// ── NavCore SDK ────────────────────────────────────────────────────────────────
import { OSRMDirectionsProvider, ETAEngine, VoiceTriggerEngine } from '@ingissa/navcore-core';
import { useNavCore } from '@ingissa/navcore-react-native';
import type { ETAResult, Coordinate, NavInstruction } from '@ingissa/navcore-core';

// ── Simulator ─────────────────────────────────────────────────────────────────
import { NoiseEngine, useSimulator } from '@ingissa/navcore-simulator';

// ─── Design Tokens ───────────────────────────────────────────────────────────
const KW = {
    navyDeep: '#081525', navyCard: '#152240', navyBorder: '#1E3255',
    emerald: '#00BF76', emeraldDark: '#04342C',
    amber: '#F5A623', slate: '#6B7FA3', slateLight: '#8FA3C8',
    fault: '#FF4848', white: '#FFFFFF', cyan: '#22D3EE', purple: '#A855F7',
    leaf: '#2BB333',
    mono: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
} as const;

// ─── Fallback route: Casablanca coast loop ────────────────────────────────────
const ANCHORS: [number, number][] = [
    [-7.6328, 33.5950], [-7.6400, 33.6000], [-7.6500, 33.6050],
    [-7.6600, 33.6100], [-7.6700, 33.6080], [-7.6650, 33.6000],
    [-7.6500, 33.5900], [-7.6328, 33.5950],
];

function lerp(a: [number, number], b: [number, number], n = 10): Coordinate[] {
    return Array.from({ length: n }, (_, i) => {
        const t = i / n;
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as Coordinate;
    });
}

const FALLBACK_ROUTE: Coordinate[] = ANCHORS.reduce((acc, curr, i) => {
    if (i === ANCHORS.length - 1) return acc;
    return [...acc, ...lerp(curr, ANCHORS[i + 1]!)];
}, [] as Coordinate[]);

// ─── Instruction builder ──────────────────────────────────────────────────────
function buildInstructions(route: Coordinate[]): NavInstruction[] {
    const step = Math.floor(route.length / 5);
    const turns = [
        'Head north on Blvd Mohammed V',
        'Turn left towards the old medina',
        'Continue through Rue Riad Zitoun',
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

// ─── Leaflet HTML (injected into WebView) ─────────────────────────────────────
const LEAFLET_HTML = `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        body { margin: 0; padding: 0; background: #081525; }
        #map { width: 100vw; height: 100vh; }
        .leaflet-container { background: #081525 !important; }
    </style>
</head>
<body>
    <div id="map"></div>
    <script>
        const map = L.map('map', { zoomControl: false, attributionControl: false })
            .setView([33.5950, -7.6328], 14);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19
        }).addTo(map);

        let routeLine = L.polyline([], { color: '#00BF76', weight: 5, opacity: 0.85 }).addTo(map);
        let vehicleMarker = L.circleMarker([0, 0], {
            radius: 9, color: '#FFFFFF', weight: 2.5,
            fillColor: '#A855F7', fillOpacity: 1
        }).addTo(map);
        let vehicleInitialized = false;

        window.updateRoute = function(coords) {
            const latlngs = coords.map(c => [c[1], c[0]]);
            routeLine.setLatLngs(latlngs);
            if (latlngs.length > 0) map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
        };

        window.updatePosition = function(lat, lng) {
            vehicleMarker.setLatLng([lat, lng]);
            if (!vehicleInitialized) {
                vehicleInitialized = true;
            }
            map.panTo([lat, lng], { animate: true, duration: 0.5 });
        };
    </script>
</body>
</html>
`;

// ─── Helper Formatters ────────────────────────────────────────────────────────
const fmtSpeed = (mps: number) => `${(mps * 3.6).toFixed(0)} km/h`;
const fmtDist = (m: number | null) =>
    m === null ? '—' : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m.toFixed(0)} m`;
const fmtEta = (s: number) => {
    const m = Math.floor(s / 60);
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

// ─── StatCard component ───────────────────────────────────────────────────────
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
export default function LeafletNavigationScreen() {
    const webviewRef = useRef<WebView>(null);

    // ── State ────────────────────────────────────────────────────────────────
    const [route, setRoute] = useState<Coordinate[]>(FALLBACK_ROUTE);
    const [instructions, setInstr] = useState<NavInstruction[]>(() => buildInstructions(FALLBACK_ROUTE));
    const [routeSource, setRouteSource] = useState<'fallback' | 'osrm'>('fallback');
    const [isNavigating, setIsNavigating] = useState(false);
    const [simActive, setSimActive] = useState(false);
    const [voiceLog, setVoiceLog] = useState<string[]>([]);
    const [eta, setEta] = useState<ETAResult | null>(null);

    // ── Engine Refs ───────────────────────────────────────────────────────────
    const etaRef = useRef(new ETAEngine({ speedWindowSize: 8, fallbackSpeedMs: 8 }));
    const voiceRef = useRef(new VoiceTriggerEngine({ earlyTriggerMeters: 120 }));
    const lastCue = useRef('');

    // ── Fetch live route from public OSRM ────────────────────────────────────
    useEffect(() => {
        const provider = new OSRMDirectionsProvider({
            baseUrl: 'https://router.project-osrm.org',
        });
        provider.getRoute([[-7.6328, 33.5950], [-7.6700, 33.6080]])
            .then(res => {
                const geom = res.geometry as Coordinate[];
                setRoute(geom);
                const instrs = buildInstructions(geom);
                setInstr(instrs);
                voiceRef.current.setInstructions(instrs);
                setRouteSource('osrm');
                webviewRef.current?.injectJavaScript(
                    `window.updateRoute(${JSON.stringify(geom)}); true;`
                );
            })
            .catch(() => {
                // Fallback route is already set in initial state
                voiceRef.current.setInstructions(instructions);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sync voice engine when instructions change
    useEffect(() => {
        voiceRef.current.setInstructions(instructions);
    }, [instructions]);

    // ── Simulator ─────────────────────────────────────────────────────────────
    const { position, controls } = useSimulator({
        routeGeometry: route,
        active: simActive,
        config: { speedKmh: 40, noiseProfile: NoiseEngine.STANDARD, loop: false },
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
                setVoiceLog(prev => [`🔊 ${cue.text}`, ...prev].slice(0, 8));
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []),
        onArrival: useCallback(() => {
            Alert.alert('🎉 Arrived!', 'You have reached your destination.');
            setSimActive(false);
            setIsNavigating(false);
        }, []),
        onDeviation: useCallback(() => {
            setVoiceLog(prev => ['⚠️ Off route — recalculating…', ...prev].slice(0, 8));
        }, []),
    });

    // ── ETA + Voice Polling ───────────────────────────────────────────────────
    useEffect(() => {
        if (!isNavigating || !position) return;
        setEta(etaRef.current.update(navState));
        const cue = voiceRef.current.update(navState);
        if (cue && cue.triggerId !== lastCue.current) {
            lastCue.current = cue.triggerId;
            setVoiceLog(prev => [`🔊 ${cue.text}`, ...prev].slice(0, 8));
        }
    }, [navState, isNavigating, position]);

    // ── Map position sync ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!position?.coord) return;
        const [lng, lat] = navState.snappedCoord ?? position.coord;
        webviewRef.current?.injectJavaScript(
            `window.updatePosition(${lat}, ${lng}); true;`
        );
    }, [navState.snappedCoord, position]);

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleStart = useCallback(() => {
        etaRef.current.reset();
        voiceRef.current.reset();
        setVoiceLog([]);
        setIsNavigating(true);
        setSimActive(true);
    }, []);

    const handleStop = useCallback(() => {
        setIsNavigating(false);
        setSimActive(false);
    }, []);

    const nextInstr = navState.nextInstructionIndex != null
        ? instructions[navState.nextInstructionIndex]
        : null;

    return (
        <SafeAreaView style={s.safe} edges={['top']}>
            {/* Header */}
            <View style={s.header}>
                <View>
                    <Text style={s.title}>LEAFLET · UNIVERSAL</Text>
                    <Text style={s.sub}>Expo Go · OpenStreetMap · OSRMDirectionsProvider</Text>
                </View>
                <View style={[s.badge, isNavigating && s.badgeLive]}>
                    <Text style={s.badgeText}>{isNavigating ? 'LIVE' : 'IDLE'}</Text>
                </View>
            </View>

            {/* Map */}
            <View style={s.mapContainer}>
                <WebView
                    ref={webviewRef}
                    originWhitelist={['*']}
                    source={{ html: LEAFLET_HTML }}
                    style={s.webview}
                    onLoadEnd={() => {
                        webviewRef.current?.injectJavaScript(
                            `window.updateRoute(${JSON.stringify(route)}); true;`
                        );
                    }}
                />
                {/* Off-route overlay on map */}
                {navState.isOffRoute && (
                    <View style={s.offRouteBanner}>
                        <Text style={s.offRouteText}>⚠️ OFF ROUTE</Text>
                    </View>
                )}
                {/* Instruction overlay on map */}
                {nextInstr && isNavigating && (
                    <View style={s.instrOverlay}>
                        <Text style={s.instrDist}>{fmtDist(navState.distanceToNextInstruction)}</Text>
                        <Text style={s.instrText} numberOfLines={2}>{nextInstr.text}</Text>
                    </View>
                )}
            </View>

            <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
                {/* Source badge */}
                <View style={s.sourceBadge}>
                    <Text style={s.sourceText}>
                        {routeSource === 'osrm' ? '✅ Live OSRM route' : '📦 Fallback route'}
                        {' · '}{route.length} pts
                    </Text>
                </View>

                {/* Start / Stop */}
                <TouchableOpacity
                    style={[s.btn, isNavigating && s.btnStop]}
                    onPress={isNavigating ? handleStop : handleStart}
                    activeOpacity={0.8}
                >
                    <Text style={s.btnText}>
                        {isNavigating ? '■  STOP NAVIGATION' : '▶  START NAVIGATION'}
                    </Text>
                </TouchableOpacity>

                {/* Telemetry */}
                <Text style={s.sectionTitle}>TELEMETRY</Text>
                <View style={s.row}>
                    <StatCard label="Speed" value={position ? fmtSpeed(position.speed) : '—'} accent={KW.leaf} />
                    <StatCard label="ETA" value={eta?.isReliable ? fmtEta(eta.etaSeconds) : '—'} accent={KW.cyan} />
                    <StatCard label="Dist Remain" value={fmtDist(navState.distanceToDestination)} accent={KW.purple} />
                </View>
                <View style={s.row}>
                    <StatCard label="Off Route" value={navState.isOffRoute ? 'YES' : 'NO'} accent={navState.isOffRoute ? KW.fault : KW.emerald} />
                    <StatCard label="Seg" value={`${navState.routeIndex} / ${route.length}`} />
                    <StatCard label="Accuracy" value={position ? `±${position.accuracy.toFixed(0)}m` : '—'} accent={KW.amber} />
                </View>

                {/* Voice log */}
                <Text style={s.sectionTitle}>VOICE CUES</Text>
                <View style={s.log}>
                    {voiceLog.map((l, i) => <Text key={i} style={s.logText}>{l}</Text>)}
                    {voiceLog.length === 0 && (
                        <Text style={s.logText}>Press START to begin simulation…</Text>
                    )}
                </View>

                <View style={{ height: 32 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const sc = StyleSheet.create({
    card: { flex: 1, backgroundColor: KW.navyDeep, borderRadius: 8, padding: 10, marginHorizontal: 3, borderWidth: 1, borderColor: KW.navyBorder },
    label: { fontSize: 9, letterSpacing: 1.2, color: KW.slate, textTransform: 'uppercase', marginBottom: 4 },
    value: { fontSize: 14, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
});

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: KW.navyDeep },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: KW.navyCard, borderBottomWidth: 1, borderBottomColor: KW.navyBorder },
    title: { fontSize: 11, fontWeight: '900', color: KW.white, letterSpacing: 2 },
    sub: { fontSize: 9, color: KW.slate, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: KW.navyBorder },
    badgeLive: { borderColor: KW.leaf, backgroundColor: KW.emeraldDark },
    badgeText: { fontSize: 10, fontWeight: '800', color: KW.slate, letterSpacing: 1 },
    mapContainer: { height: 290, backgroundColor: KW.navyDeep },
    webview: { flex: 1, backgroundColor: 'transparent' },
    offRouteBanner: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(61,0,0,0.95)', padding: 10, alignItems: 'center' },
    offRouteText: { fontSize: 12, fontWeight: '800', color: KW.fault, letterSpacing: 1 },
    instrOverlay: { position: 'absolute', top: 8, left: 8, right: 8, backgroundColor: 'rgba(8,21,37,0.92)', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: KW.leaf },
    instrDist: { fontSize: 11, color: KW.leaf, fontWeight: '700', marginBottom: 2 },
    instrText: { fontSize: 13, color: KW.white, fontWeight: '600' },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 12, paddingTop: 10 },
    sourceBadge: { backgroundColor: KW.navyCard, borderRadius: 6, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: KW.navyBorder },
    sourceText: { fontSize: 10, color: KW.slateLight, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
    btn: { backgroundColor: KW.leaf, padding: 16, borderRadius: 10, alignItems: 'center', marginBottom: 16 },
    btnStop: { backgroundColor: KW.fault },
    btnText: { color: KW.white, fontWeight: '900', letterSpacing: 1.5, fontSize: 14 },
    sectionTitle: { fontSize: 10, fontWeight: '800', color: KW.slate, letterSpacing: 1.5, marginTop: 14, marginBottom: 8 },
    row: { flexDirection: 'row', marginBottom: 4 },
    log: { backgroundColor: KW.navyCard, padding: 12, borderRadius: 8, minHeight: 80, borderWidth: 1, borderColor: KW.navyBorder },
    logText: { color: KW.slateLight, fontSize: 11, marginBottom: 3, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
});
