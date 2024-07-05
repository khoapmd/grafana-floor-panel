import React, { useCallback, useState } from 'react';
import { FieldColorModeId, fieldColorModeRegistry } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import { Props } from '../@types/PanelProps';
import { SensorData, Series } from '../@types/QueryData';
import { Room } from '../@types/Graphics';
import Rainbow from 'rainbowvis.js';
import { now } from 'lodash';
import DOMPurify from 'dompurify';

type Color = {
    name: string;
    value: number;
};

export const SimplePanel: React.FC<Props> = ({ options, data, width, height, fieldConfig }) => {
    const [id] = useState(() => now());
    let theme = useTheme2();
    const fieldColor = fieldConfig.defaults.color || { mode: FieldColorModeId.ContinuousGrYlRd };
    const fieldColorMode = fieldColorModeRegistry.get(fieldColor.mode);
    const [roomMetrics] = useState<Map<string, { normalized: number; temperature: number; humidity: number }>>(
        () => new Map()
    );
    const [rooms, setRooms] = useState<Room[]>(() => []);
    const [interval] = useState<{ id: number }>({ id: 0 });
    const [rainbow] = useState(() => new Rainbow());
    const [container, setContainer] = useState<SVGElement | undefined>(undefined);
    const [settings] = useState<{ colors: Color[] }>(() => ({ colors: [{ name: 'transparent', value: 0 }] }));
    const [lastUpdate, setLastUpdate] = useState<number>(0);

    if (fieldColorMode.getColors) {
        const colors = fieldColorMode.getColors(theme);
        settings.colors = colors.map((x, i) => ({ name: x, value: i / colors.length }));
    } else if (fieldColorMode.id === 'thresholds') {
        const colors = fieldConfig.defaults.thresholds?.steps.map((x) => ({
            name: x.color,
            value: Math.max(x.value, 0),
        }));
        settings.colors = colors.sort((a, b) => a.value - b.value);
    }
    rainbow.setSpectrumByArray(settings.colors.map((x) => theme.visualization.getColorByName(x.name)));
    const all: Room[] = parseRooms(options.svg).map((name) => ({
        name: name,
        quality: 80,
        temperature: 25,
        humidity: 70,
    }));
    if (all.some((x) => !rooms.some((y) => x.name === y.name))) {
        setRooms(all);
    }

    if (now() - lastUpdate > 3000) {
        setLastUpdate(now());
        const measurements: SensorData[] = mapData(data.series as unknown as Series[]);
        const sensorMappings: Map<string, string> = new Map(options.sensorMappings ? JSON.parse(options.sensorMappings) : []);
        for (let sensorData of measurements) {
            const room = sensorMappings.get(sensorData.id);
            if (!room) continue;
            const values = sensorData.values;
            const normalized = values.get('normalized');
            const temperature = values.get('temperature');
            const humidity = values.get('humidity');
            if (normalized !== undefined && temperature !== undefined && humidity !== undefined) {
                roomMetrics.set(room, { normalized, temperature, humidity });
            }
        }
    }

    clearInterval(interval.id);
    if (container) {
        interval.id = window.setInterval(() => animateQualityTransition(id, rainbow, settings.colors, container, rooms, roomMetrics, interval.id), 50);
    }

    const svgRef = useCallback(
        (node) => {
            if (node instanceof HTMLElement) {
                node.innerHTML = DOMPurify.sanitize(options.svg);
                const svg = node.getElementsByTagName('svg')[0];
                if (svg) {
                    setContainer(svg);
                    svg.removeAttribute('width');
                    svg.removeAttribute('height');
                }
            }
        },
        [options]
    );

    const colorsCount = settings.colors.length;
    const firstColor = theme.visualization.getColorByName(settings.colors[0].name);
    const secondColor = theme.visualization.getColorByName(settings.colors[colorsCount - 2].name);
    const lastColor = theme.visualization.getColorByName(settings.colors[colorsCount - 1].name);

    return (
        <div
            style={{
                display: 'grid',
                gap: '2em',
                gridTemplateRows: '1fr auto',
                flexWrap: 'wrap',
                width: width,
                height: height,
            }}
        >
            <div
                ref={svgRef}
                style={{
                    overflow: 'hidden',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'stretch',
                    justifyContent: 'center',
                }}
            ></div>

            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ maxWidth: '300px', width: '80%' }}>
                    <div
                        style={{
                            borderRadius: '3px',
                            padding: '0.5em',
                            background: `linear-gradient(90deg, ${firstColor} 0%, ${secondColor} 50%, ${lastColor} 100%)`,
                        }}
                    ></div>
                    <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'space-between' }}>
                        <span>Low</span>
                        <span>Good</span>
                        <span>High</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export function mapData(series: Series[]) {
    return series
        .map((s) => {
            const time = s.fields.find((x) => x.name === '_time')?.values?.get(0) as number ?? Date.now();
            const fieldOrder = s.fields.find((x) => x.name === '_field');
            if (!fieldOrder) return null;
            const fields = fieldOrder.values;
            const sensorId = fieldOrder.labels.sensor_id;
            const fieldValues = s.fields.find((x) => x.name === '_value')?.values ?? [];
            const valueMap = new Map<string, number>();
            for (let i = 0; i < fields.length; i++) {
                valueMap.set(fields[i], parseFloat(fieldValues[i]));
            }
            return { id: sensorId, values: valueMap, time: time } as SensorData;
        })
        .filter((x) => x) as SensorData[];
}

/**
 * Slowly and smoothly recolors rooms to avoid flickering
 * @param rainbow
 * @param colors
 * @param container
 * @param rooms
 * @param roomMetrics
 * @param intervalId
 */
function animateQualityTransition(
    id: number,
    rainbow: Rainbow,
    colors: Color[],
    container: SVGElement,
    rooms: Room[],
    roomMetrics: Map<string, { normalized: number; temperature: number; humidity: number }>,
    intervalId: number
) {
    const redrawNeeded = rooms.filter((room) => {
        const metric = roomMetrics.get(room.name);
        const escapedId = CSS.escape(`name:${room.name.replace(/\./g, "\\.")}`);
        // Find the element with the modified ID
        const nameElement = container.querySelector(`#${escapedId} tspan`);
        const textElement = container.querySelector(`#${CSS.escape(room.name.replace(/\./g, "\\."))} tspan`);
        if (!metric){
            // Clear existing content
            textElement.innerHTML = '';
            // Create tspan for temperature
            const tempTspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
            tempTspan.textContent = "Disconnected";
            tempTspan.setAttribute("fill", "black");
            const xValue = textElement.getAttribute('x');
            tempTspan.removeAttribute("x");
            tempTspan.setAttribute('x', (parseFloat(xValue) - 10).toString());
            nameElement.setAttribute("fill", "black");
            // Append tspans to text element
            textElement.appendChild(tempTspan);
            return false;
        } 
        return metric.normalized !== room.quality;
    });
    redrawNeeded.forEach((room) => {
        const desiredIAQ = roomMetrics.get(room.name)?.normalized;
        if (desiredIAQ !== undefined) {
            const difference = Math.abs(desiredIAQ - room.quality);
            const add = desiredIAQ > room.quality ? 1 : -1;
            room.quality += add * Math.min(difference, 1);
        }
    });
    rooms
        .filter((r) => roomMetrics.get(r.name))
        .forEach((room) => {
            const roomElement = container.querySelector(`#room\\:${room.name.replace(/\./g, '\\.')}`);
            const textElement = container.querySelector(`#${CSS.escape(room.name.replace(/\./g, "\\."))} tspan`);
            // const nameElement = container.querySelector(`#name${CSS.escape(room.name.replace(/\./g, "\\."))} tspan`);
            if (roomElement) {
                createOrModifyRadialGradient(id, container, { name: rainbow.colorAt(room.quality), value: 0 }, room);
                roomElement.setAttribute('fill', `url(#rg-${id}-${room.name})`);
                roomElement.setAttribute('fill-opacity', '1');
            }
            if (textElement) {
                const temperature = roomMetrics.get(room.name)?.temperature.toFixed(2);
                const humidity = roomMetrics.get(room.name)?.humidity.toFixed(2);
                // Clear existing content
                textElement.innerHTML = '';
                // Create tspan for temperature
                const tempTspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                // Create tspan for humidity
                const humTspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                
                tempTspan.textContent = `${temperature}°C`;
                humTspan.textContent = `${humidity}%`;
                tempTspan.setAttribute('fill', 'while')
                humTspan.setAttribute('fill', 'while');

                // Set the x attribute of humTspan to be the same as tempTspan
                const xValue = textElement.getAttribute('x');
                humTspan.setAttribute('x', xValue);
                humTspan.setAttribute('dy', '1.2em'); // Move to the next line

                // Append tspans to text element
                textElement.appendChild(tempTspan);
                textElement.appendChild(humTspan);
            }
        });
    if (redrawNeeded.length === 0) {
        clearInterval(intervalId);
    }
}

/**
 * Calculates Indoor Air Quality based on a few parameters.
 * @param co2
 * @param temp
 * @param rh
 * @param voc
 */
function calculateIAQ(co2: number, temp: number, rh: number, voc: number) {
    const co2Index = Math.min(6, Math.round(co2 / 400)); // 1 - 6
    const vocIndex = Math.min(6, Math.round(voc / 50)); // 1 - 6
    const worstOfTheTwo = Math.max(co2Index, vocIndex);
    const worst = 6;
    const aqi = Math.min(Math.max(0, 100.0 - (100 * (co2Index / worst))), 100);
    return aqi ?? 0.0;
}

export function parseRooms(svg: string) {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(svg, 'image/svg+xml');
    const rooms = parsed.querySelectorAll('[id^="room"]');
    const roomNames: string[] = [...rooms].map((x) => x.id.replace(/room:/g, ''));
    return roomNames;
}

function createOrModifyRadialGradient(id: number, container: SVGElement, rightColor: Color, room: Room) {
    let gradientElement = container.querySelector(`#rg-${id}-${room.name.replace(/\./g, '\\.')}`);
    if (!gradientElement) {
        gradientElement = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
        gradientElement.setAttribute('id', `rg-${id}-${room.name}`);
        container.appendChild(gradientElement);
    }
    gradientElement.setAttribute('r', '0%');
    gradientElement.innerHTML = `
    <stop offset="0.1" stop-color="transparent" />
    <stop offset="1" stop-color="#${rightColor.name}" />
    `;
}
