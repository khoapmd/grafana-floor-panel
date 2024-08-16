import { ThresholdsConfig } from '@grafana/data';
export interface SimpleOptions {
    json: string,
    sensorMappings: string,
    scale: number,
    svg: string,
    gradientMode: boolean,
    thresholds: ThresholdsConfig;
}
