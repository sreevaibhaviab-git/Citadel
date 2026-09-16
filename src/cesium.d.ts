export {};

declare global {
  interface Window {
    Cesium: any;
    CESIUM_BASE_URL: string;
  }
}
