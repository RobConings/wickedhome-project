export type HaCamera = {
  entityId: string;
  name: string;
  available: boolean;
  canCapture: boolean;
  canStream: boolean;
};

export type HaDeviceCameras = { connected: boolean; cameras: HaCamera[] };
export type HaCameraStream = { sessionId: string; url: string; expiresAt: string };
