export type Coordinate = [longitude: number, latitude: number];

export interface RouteInstruction {
  coordinate: Coordinate;
  geometryIndex: number;
  text: string;
  maneuverType: string;
}

export interface NeutralRoute {
  geometry: Coordinate[];
  distanceMeters: number;
  durationSeconds: number;
  instructions: RouteInstruction[];
}

export interface LocationSample {
  coordinate: Coordinate;
  bearing: number;
  accuracyMeters: number;
  speedMetersPerSecond: number;
  timestamp: number;
}

export interface RouteRequest {
  origin: Coordinate;
  destination: Coordinate;
  signal?: AbortSignal;
}

export interface RoutingProvider {
  route(request: RouteRequest): Promise<NeutralRoute>;
}

export type RoutingErrorKind =
  | 'configuration'
  | 'cancelled'
  | 'timeout'
  | 'network'
  | 'http'
  | 'invalid_response';

export class RoutingError extends Error {
  public readonly kind: RoutingErrorKind;
  public readonly status?: number;

  constructor(
    kind: RoutingErrorKind,
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = 'RoutingError';
    this.kind = kind;
    this.status = status;
  }
}
