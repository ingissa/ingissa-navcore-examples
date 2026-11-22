import { memo, useCallback, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Camera,
  CircleLayer,
  Images,
  LineLayer,
  MapView,
  ShapeSource,
  SymbolLayer,
} from '@maplibre/maplibre-react-native';
import type { Coordinate, LocationSample, NeutralRoute } from '../navigation/types';

interface GuidanceMapProps {
  route: NeutralRoute;
  rawGpsPosition: LocationSample | null;
  corePosition: Coordinate | null;
  proSnappedPosition: Coordinate | null;
  bearing: number;
  rawTrail: Coordinate[];
  snappedTrail: Coordinate[];
  simulatedDeviationPath: Coordinate[];
  /**
   * Physical GPS positions collected after NavCore detected a sustained
   * corridor breach. Kept independently from the ordinary trails so the
   * driver can still see the divergence while the replacement route appears.
   */
  deviationTrail: Coordinate[];
  alertState?: 'NONE' | 'DEVIATING' | 'RECALCULATING' | 'REJOINING' | 'REJOINED';
  isOffRoute?: boolean;
  isDeviationScenarioActive?: boolean;
  distanceToRoute?: number;
  corridor?: number;
  onRouteRendered?: (route: NeutralRoute) => void;
}

function computeHeadingPoint(coord: Coordinate, bearingDeg: number, distanceMeters: number): Coordinate {
  const rad = (bearingDeg * Math.PI) / 180;
  const lat = coord[1];
  const lng = coord[0];
  const deltaLat = (distanceMeters * Math.cos(rad)) / 111320;
  const deltaLng = (distanceMeters * Math.sin(rad)) / (111320 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  return [lng + deltaLng, lat + deltaLat];
}

const navcoreVehicleImage = require('../../assets/veh-3d.png');

export const GuidanceMap = memo(function GuidanceMap({
  route,
  rawGpsPosition,
  corePosition,
  proSnappedPosition,
  bearing,
  rawTrail,
  snappedTrail,
  simulatedDeviationPath,
  deviationTrail,
  alertState = 'NONE',
  isOffRoute = false,
  isDeviationScenarioActive = false,
  distanceToRoute = 0,
  corridor = 30,
  onRouteRendered,
}: GuidanceMapProps) {
  const routeRef = useRef(route);
  const lastRenderedRouteRef = useRef<NeutralRoute | null>(null);
  routeRef.current = route;
  const handleRenderedFrame = useCallback(() => {
    const renderedRoute = routeRef.current;
    if (renderedRoute === lastRenderedRouteRef.current) {
      return;
    }
    lastRenderedRouteRef.current = renderedRoute;
    onRouteRendered?.(renderedRoute);
  }, [onRouteRendered]);
  const isDeviatingOrOff =
    alertState === 'DEVIATING' ||
    alertState === 'RECALCULATING' ||
    isOffRoute ||
    isDeviationScenarioActive;

  // Route geometry
  const routeShape = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: route.geometry },
    }),
    [route.geometry],
  );

  // 1. Raw GPS (No SDK / Sensor)
  const rawGpsPoint = useMemo(
    () =>
      rawGpsPosition
        ? {
            type: 'Feature' as const,
            properties: {},
            geometry: { type: 'Point' as const, coordinates: rawGpsPosition.coordinate },
          }
        : null,
    [rawGpsPosition],
  );

  // 2. NavCore Core (Filtered)
  const corePoint = useMemo(
    () =>
      corePosition
        ? {
            type: 'Feature' as const,
            properties: {},
            geometry: { type: 'Point' as const, coordinates: corePosition },
          }
        : null,
    [corePosition],
  );

  // 3. NavCore Pro Snapped Anchor (on route)
  const proAnchorPoint = useMemo(
    () =>
      proSnappedPosition
        ? {
            type: 'Feature' as const,
            properties: {},
            geometry: { type: 'Point' as const, coordinates: proSnappedPosition },
          }
        : null,
    [proSnappedPosition],
  );

  // The supplied vehicle asset is placed at NavCore's snapped coordinate while
  // on-route and at physical GPS while deviating.
  const vehiclePoint = useMemo(() => {
    const coordinate = isDeviatingOrOff
      ? rawGpsPosition?.coordinate ?? proSnappedPosition
      : proSnappedPosition ?? rawGpsPosition?.coordinate;
    if (!coordinate) {
      return null;
    }
    const vehicleBearing = isDeviatingOrOff
      ? rawGpsPosition?.bearing ?? bearing
      : bearing;
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Point' as const, coordinates: coordinate },
      vehicleBearing,
    };
  }, [bearing, isDeviatingOrOff, proSnappedPosition, rawGpsPosition?.bearing, rawGpsPosition?.coordinate]);

  // Trails
  const rawTrailShape = useMemo(
    () =>
      rawTrail.length > 1
        ? {
            type: 'Feature' as const,
            properties: {},
            geometry: { type: 'LineString' as const, coordinates: rawTrail },
          }
        : null,
    [rawTrail],
  );

  const snappedTrailShape = useMemo(
    () =>
      snappedTrail.length > 1
        ? {
            type: 'Feature' as const,
            properties: {},
            geometry: { type: 'LineString' as const, coordinates: snappedTrail },
          }
        : null,
    [snappedTrail],
  );

  // This is deliberately separate from the generic raw-GPS trail. The latter
  // is reset when a new route is applied; the deviation trace must remain
  // visible through that transition to make the scenario understandable.
  const deviationTrailShape = useMemo(
    () =>
      deviationTrail.length > 1
        ? {
            type: 'Feature' as const,
            properties: {},
            geometry: { type: 'LineString' as const, coordinates: deviationTrail },
          }
        : null,
    [deviationTrail],
  );

  const simulatedDeviationPathShape = useMemo(
    () =>
      simulatedDeviationPath.length > 1
        ? {
            type: 'Feature' as const,
            properties: {},
            geometry: { type: 'LineString' as const, coordinates: simulatedDeviationPath },
          }
        : null,
    [simulatedDeviationPath],
  );

  // Elastic deviation tether between Raw GPS and Route Anchor
  const tetherShape = useMemo(() => {
    if (!rawGpsPosition?.coordinate || !proSnappedPosition || distanceToRoute < 2) {
      return null;
    }
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: [rawGpsPosition.coordinate, proSnappedPosition],
      },
    };
  }, [distanceToRoute, proSnappedPosition, rawGpsPosition?.coordinate]);

  // Heading pointer line projected forward
  const headingShape = useMemo(() => {
    // When deviating, heading projects from the real car coordinate
    // When normal, heading projects from the snapped road coordinate
    const anchor = isDeviatingOrOff
      ? (rawGpsPosition?.coordinate ?? proSnappedPosition)
      : (proSnappedPosition ?? rawGpsPosition?.coordinate);

    if (!anchor) return null;
    const activeBearing = isDeviatingOrOff
      ? (rawGpsPosition?.bearing ?? bearing)
      : (bearing ?? rawGpsPosition?.bearing ?? 0);

    const tip = computeHeadingPoint(anchor, activeBearing, 18);
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: [anchor, tip],
      },
    };
  }, [bearing, isDeviatingOrOff, proSnappedPosition, rawGpsPosition?.bearing, rawGpsPosition?.coordinate]);

  // Turn-by-turn navigation camera:
  // - While ON_ROUTE: Camera tracks the Pro snapped vehicle position smoothly along the road
  // - While DEVIATING / OFF_ROUTE: Camera tracks the physical vehicle driving into the side street
  const centerCoordinate = isDeviatingOrOff && rawGpsPosition?.coordinate
    ? rawGpsPosition.coordinate
    : (proSnappedPosition ?? corePosition ?? rawGpsPosition?.coordinate ?? route.geometry[0] ?? ([0, 0] as Coordinate));

  const cameraHeading = isDeviatingOrOff && rawGpsPosition?.bearing !== undefined && rawGpsPosition?.bearing !== null
    ? rawGpsPosition.bearing
    : bearing;

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        style={StyleSheet.absoluteFill}
        mapStyle="https://tiles.openfreemap.org/styles/liberty"
        attributionEnabled
        compassEnabled
        logoEnabled
        onDidFinishRenderingFrameFully={handleRenderedFrame}
      >
        <Camera
          centerCoordinate={centerCoordinate}
          zoomLevel={16.8}
          heading={cameraHeading}
          pitch={46}
          padding={{
            paddingBottom: 220,
            paddingTop: 60,
            paddingLeft: 0,
            paddingRight: 0,
          }}
          animationMode="linearTo"
          animationDuration={80}
        />
        <Images images={{ 'navcore-vehicle': navcoreVehicleImage }} />

        {/* 1. Dynamic route corridor buffer envelope */}
        <ShapeSource id="route-corridor" shape={routeShape}>
          <LineLayer
            id="route-corridor-line"
            style={{
              lineColor: isDeviatingOrOff ? '#fecaca' : '#dbeafe',
              lineWidth: Math.max(16, Math.min(corridor * 1.2, 40)),
              lineOpacity: 0.55,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        </ShapeSource>

        {/* 2. Main route polyline */}
        <ShapeSource id="route" shape={routeShape}>
          <LineLayer
            id="route-line"
            style={{
              lineColor: isDeviatingOrOff ? '#94a3b8' : '#2563eb',
              lineWidth: 6,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        </ShapeSource>

        {/* 3. Historical Trails */}
        {rawTrailShape ? (
          <ShapeSource id="raw-trail" shape={rawTrailShape}>
            <LineLayer id="raw-trail-line" style={{ lineColor: '#f59e0b', lineWidth: 2, lineOpacity: 0.6 }} />
          </ShapeSource>
        ) : null}
        {snappedTrailShape ? (
          <ShapeSource id="snapped-trail" shape={snappedTrailShape}>
            <LineLayer id="snapped-trail-line" style={{ lineColor: '#10b981', lineWidth: 3, lineOpacity: 0.85 }} />
          </ShapeSource>
        ) : null}

        {/* 4. The path the click-triggered vehicle simulation will physically follow. */}
        {simulatedDeviationPathShape ? (
          <ShapeSource id="simulated-deviation-path" shape={simulatedDeviationPathShape}>
            <LineLayer
              id="simulated-deviation-path-line"
              style={{
                lineColor: '#fb7185',
                lineWidth: 3,
                lineOpacity: 0.85,
                lineDasharray: [1.5, 1.5],
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        ) : null}

        {/* 5. Confirmed physical divergence, retained while a new route is rendered. */}
        {deviationTrailShape ? (
          <ShapeSource id="deviation-trail" shape={deviationTrailShape}>
            <LineLayer
              id="deviation-trail-outline"
              style={{
                lineColor: '#7f1d1d',
                lineWidth: 8,
                lineOpacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
            <LineLayer
              id="deviation-trail-line"
              style={{
                lineColor: '#ef4444',
                lineWidth: 4,
                lineOpacity: 1,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        ) : null}

        {/* 6. Elastic deviation tether */}
        {tetherShape ? (
          <ShapeSource id="deviation-tether" shape={tetherShape}>
            <LineLayer
              id="deviation-tether-line"
              style={{
                lineColor: isDeviatingOrOff ? '#ef4444' : '#f59e0b',
                lineWidth: 3,
                lineDasharray: [2, 2],
                lineOpacity: 0.95,
              }}
            />
          </ShapeSource>
        ) : null}

        {/* 5. LOCATION 1: Raw GPS (No SDK / Sensor) — High-visibility Orange beacon */}
        {rawGpsPoint ? (
          <ShapeSource id="raw-gps-source" shape={rawGpsPoint}>
            <CircleLayer
              id="raw-gps-radar-ring"
              style={{
                circleColor: 'rgba(245, 158, 11, 0.22)',
                circleRadius: 18,
                circleStrokeColor: '#f59e0b',
                circleStrokeWidth: 1.5,
              }}
            />
            <CircleLayer
              id="raw-gps-core-dot"
              style={{
                circleColor: '#f59e0b',
                circleRadius: 6,
                circleStrokeColor: '#ffffff',
                circleStrokeWidth: 2,
              }}
            />
          </ShapeSource>
        ) : null}

        {/* 6. LOCATION 2: NavCore Core (Filtered) — High-visibility Purple Diamond/Circle */}
        {corePoint ? (
          <ShapeSource id="core-position-source" shape={corePoint}>
            <CircleLayer
              id="core-position-ring"
              style={{
                circleColor: 'rgba(139, 92, 246, 0.25)',
                circleRadius: 12,
                circleStrokeColor: '#8b5cf6',
                circleStrokeWidth: 2,
              }}
            />
            <CircleLayer
              id="core-position-dot"
              style={{
                circleColor: '#7c3aed',
                circleRadius: 6,
                circleStrokeColor: '#ffffff',
                circleStrokeWidth: 1.5,
              }}
            />
          </ShapeSource>
        ) : null}

        {/* 7. Directional forward heading beam */}
        {headingShape ? (
          <ShapeSource id="pro-heading-source" shape={headingShape}>
            <LineLayer
              id="pro-heading-line"
              style={{
                lineColor: isDeviatingOrOff ? '#dc2626' : '#059669',
                lineWidth: 4.5,
                lineCap: 'round',
              }}
            />
          </ShapeSource>
        ) : null}

        {/* 8. Snapped anchor: shown only while it differs from the physical vehicle. */}
        {proAnchorPoint && isDeviatingOrOff ? (
          <ShapeSource id="pro-anchor-source" shape={proAnchorPoint}>
            <CircleLayer
              id="pro-anchor-halo"
              style={{
                circleColor: isDeviatingOrOff ? 'rgba(6, 182, 212, 0.2)' : 'rgba(16, 185, 129, 0.25)',
                circleRadius: isDeviatingOrOff ? 12 : 16,
                circleStrokeColor: isDeviatingOrOff ? '#06b6d4' : '#10b981',
                circleStrokeWidth: isDeviatingOrOff ? 2 : 1.5,
              }}
            />
            <CircleLayer
              id="pro-anchor-puck"
              style={{
                circleColor: isDeviatingOrOff ? '#06b6d4' : '#059669',
                circleRadius: isDeviatingOrOff ? 6.5 : 9.5,
                circleStrokeColor: '#ffffff',
                circleStrokeWidth: 3,
              }}
            />
          </ShapeSource>
        ) : null}

        {/* 9. Supplied Waze-like vehicle marker, rotated from public NavCore bearing. */}
        {vehiclePoint ? (
          <ShapeSource id="vehicle-source" shape={vehiclePoint}>
            <SymbolLayer
              id="vehicle-marker"
              style={{
                iconImage: 'navcore-vehicle',
                iconSize: 0.64,
                iconRotate: vehiclePoint.vehicleBearing,
                iconRotationAlignment: 'map',
                iconPitchAlignment: 'map',
                iconAllowOverlap: true,
                iconIgnorePlacement: true,
              }}
            />
          </ShapeSource>
        ) : null}
      </MapView>
    </View>
  );
});
