import React, { useCallback, useState } from 'react';
import { FieldColorModeId, fieldColorModeRegistry } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import { Props } from '../@types/PanelProps';
import { SensorData, Series } from '../@types/QueryData';
import { Room } from '../@types/Graphics';
import Rainbow from 'rainbowvis.js';
import { now } from 'lodash';
import DOMPurify from 'dompurify';
import { SimpleOptions } from 'types';

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
        if (colors) {
            settings.colors = colors.sort((a, b) => a.value - b.value);
        }
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

    const updateRoomMetrics = () => {
        // Force clean cache
        roomMetrics.clear();
        
        if (options.gradientMode) {
            const measurements: SensorData[] = mapData(data.series as unknown as Series[]);
            const sensorMappings: Map<string, string> = new Map(
                options.sensorMappings ? JSON.parse(options.sensorMappings) : []
            );
            
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
        } else {
            const measurements: SensorData[] = mapData2(data.series as unknown as Series[]);
            const sensorMappings: Map<string, string> = new Map(
                options.sensorMappings ? JSON.parse(options.sensorMappings) : []
            );
            
            for (let sensorData of measurements) {
                const room = sensorMappings.get(sensorData.id);
                if (!room) continue;
                const values = sensorData.values;
                const normalized = values.get('normalized');
                if (normalized !== undefined) {
                    roomMetrics.set(room, { normalized, temperature: 0.0, humidity: 0.0 });
                }
            }
        }

        // Force refresh animation
        if (container) {
            clearInterval(interval.id);
            interval.id = window.setInterval(() => {
                animateQualityTransition(
                    id,
                    rainbow,
                    settings.colors,
                    container,
                    rooms,
                    roomMetrics,
                    interval.id,
                    options,
                    theme
                );
            }, 50);
        }
    };

    // Call the update function whenever data changes
    React.useEffect(() => {
        updateRoomMetrics();
    }, [data, options.gradientMode, options.sensorMappings]);

    // Modify the update interval to be more reasonable
    const UPDATE_INTERVAL = 3000; // 3 seconds interval

    // Add this useEffect to handle regular updates
    React.useEffect(() => {
        const updateTimer = setInterval(() => {
            if (now() - lastUpdate > UPDATE_INTERVAL) {
                setLastUpdate(now());
                updateRoomMetrics();
            }
        }, UPDATE_INTERVAL);

        // Cleanup on unmount
        return () => clearInterval(updateTimer);
    }, [data, options.gradientMode, options.sensorMappings]);

    // Keep the animation interval at 50ms for smooth transitions
    clearInterval(interval.id);
    if (container) {
        interval.id = window.setInterval(() => {
            animateQualityTransition(
                id, 
                rainbow, 
                settings.colors, 
                container, 
                rooms, 
                roomMetrics, 
                interval.id, 
                options, 
                theme
            );
        }, 50);
    }

    const svgRef = useCallback(
        (node: HTMLElement | null) => {
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

    const colorsCount = settings.colors?.length ?? 0;

    // const getColor = (index: number, defaultColor: string = 'grey') => {
    //     return index >= 0 && index < colorsCount ? theme.visualization.getColorByName(settings.colors[index].name) : defaultColor;
    // };

    let firstColor;
    let secondColor;
    let thirdColor;
    let fourthColor;
    let lastColor;
    if(colorsCount >= 5){
        firstColor = getColor(0, settings.colors, theme);
        secondColor = getColor(colorsCount - 4, settings.colors, theme);
        thirdColor = getColor(colorsCount - 3, settings.colors, theme);
        fourthColor = getColor(colorsCount - 2, settings.colors, theme);
        lastColor = getColor(colorsCount - 1, settings.colors, theme);
    }
    else{
        firstColor = getColor(0, settings.colors, theme);
        secondColor = getColor(colorsCount - 2, settings.colors, theme);
        lastColor = getColor(colorsCount - 1, settings.colors, theme);
    }
    

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
                <div style={{ maxWidth: '500px', width: '80%' }}>
                    {options.gradientMode ? (
                        <><div
                            style={{
                                borderRadius: '3px',
                                padding: '0.5em',
                                background: `linear-gradient(90deg, ${firstColor} 0%, ${secondColor} 50%, ${lastColor} 100%)`,
                            }}
                        ></div><div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'space-between' }}>
                                <span>Low</span>
                                <span>Normal</span>
                                <span>High</span>
                            </div></>

                    ) : (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div
                                    style={{
                                        borderRadius: '3px',
                                        padding: '0.5em',
                                        backgroundColor: firstColor,
                                        flex: '1',
                                        marginInline: '1em'
                                    }}
                                ></div>
                                <div
                                    style={{
                                        borderRadius: '3px',
                                        padding: '0.5em',
                                        backgroundColor: secondColor,
                                        flex: '1',
                                        marginInline: '1em'
                                    }}
                                ></div>
                                <div
                                    style={{
                                        borderRadius: '3px',
                                        padding: '0.5em',
                                        backgroundColor: thirdColor,
                                        flex: '1',
                                        marginInline: '1em'
                                    }}
                                ></div>
                                <div
                                    style={{
                                        borderRadius: '3px',
                                        padding: '0.5em',
                                        backgroundColor: fourthColor,
                                        flex: '1',
                                        marginInline: '1em'
                                    }}
                                ></div>
                                <div
                                    style={{
                                        borderRadius: '3px',
                                        padding: '0.5em',
                                        backgroundColor: lastColor,
                                        flex: '1',
                                        marginInline: '1em'
                                    }}
                                ></div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5em' }}>
                                <span style={{ flex: '1', textAlign: 'center' }}>Running</span>
                                <span style={{ flex: '1', textAlign: 'center' }}>Line Down</span>
                                <span style={{ flex: '1', textAlign: 'center' }}>Change Over</span>
                                <span style={{ flex: '1', textAlign: 'center' }}>No Plan</span>
                                <span style={{ flex: '1', textAlign: 'center' }}>NPD</span>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export function mapData(series: Series[]) {
    return series
        .map((s) => {
            //const time = (s.fields.find((x) => x.name === '_time')?.values as number[])[0] ?? Date.now();
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

export function mapData2(series: Series[]): SensorData[] {
    return series.flatMap((s) => {
        const timestamps = s.fields.find((x) => x.name === 'timestamp')?.values as number[] ?? [];
        const sensorIds = s.fields.find((x) => x.name === 'line')?.values as string[] ?? [];
        const fieldValues = s.fields.find((x) => x.name === 'number')?.values as number[] ?? [];

        // Ensure all arrays are the same length
        const length = Math.min(timestamps.length, sensorIds.length, fieldValues.length);

        const result: SensorData[] = [];

        for (let i = 0; i < length; i++) {
            const valueMap = new Map<string, number>();
            valueMap.set('normalized', parseFloat(fieldValues[i].toString()));

            result.push({
                id: sensorIds[i],
                values: valueMap,
                time: timestamps[i],
            } as SensorData);
        }

        return result;
    });
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
    intervalId: number,
    options: SimpleOptions,
    theme: any
) {
    const redrawNeeded = rooms.filter((room) => {
        const metric = roomMetrics.get(room.name);
        const escapedId = CSS.escape(`name:${room.name.replace(/\./g, "\\.")}`);
        const nameElement = container.querySelector(`#${escapedId} tspan`);
        const textElement = container.querySelector(`#${CSS.escape(room.name.replace(/\./g, "\\."))} tspan`);
        const roomElement = container.querySelector(`#room\\:${room.name.replace(/\./g, '\\.')}`);

        if (!metric) {
            if (textElement && nameElement) {
                // Handle disconnected state
                textElement.innerHTML = '';
                const disconnectedTspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                disconnectedTspan.textContent = "Disconnected ";
                disconnectedTspan.setAttribute("fill", "red");
                const xValue = textElement.getAttribute('x');
                if (xValue !== null) {
                    disconnectedTspan.setAttribute('x', xValue);
                }
                nameElement.setAttribute("fill", "red"); // Set room name to red
            }
            if (roomElement) {
                roomElement.setAttribute('fill', 'transparent'); // Clear room color
                roomElement.setAttribute('fill-opacity', '0.3'); // Make it semi-transparent
            }
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
            const nameElement = container.querySelector(`#${CSS.escape(`name:${room.name.replace(/\./g, "\\.")}`)} tspan`);

            if (roomElement) {
                if (options.gradientMode) {
                    // Use rainbow coloring for gradientMode
                    createOrModifyRadialGradient(id, container, { name: rainbow.colorAt(room.quality), value: 0 }, room);
                    roomElement.setAttribute('fill', `url(#rg-${id}-${room.name})`);
                } else {
                    // Use direct coloring without rainbow
                    const metric = roomMetrics.get(room.name);
                    if (metric) {
                        const normalizedValue = metric.normalized;
                        let color = 'grey';  // Default color
                        color = getColorForValue(normalizedValue, colors,theme);
                        roomElement.setAttribute('fill', color);
                    }
                }
                roomElement.setAttribute('fill-opacity', '1');
            }
            if (textElement && nameElement) {
                const metric = roomMetrics.get(room.name);
                if (metric) {
                    const temperature = metric.temperature.toFixed(2);
                    const humidity = metric.humidity.toFixed(2);
                    
                    // Clear existing content
                    textElement.innerHTML = '';
                    
                    // Create tspan for temperature and humidity
                    const tempTspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                    const humTspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');

                    tempTspan.textContent = `${temperature}°C`;
                    humTspan.textContent = `${humidity}%`;
                    tempTspan.setAttribute('fill', 'white');
                    humTspan.setAttribute('fill', 'white');
                    nameElement.setAttribute('fill', 'white'); // Set room name to white when connected

                    // Set positions
                    const xValue = textElement.getAttribute('x');
                    if (xValue !== null) {
                        humTspan.setAttribute('x', xValue);
                    }
                    humTspan.setAttribute('dy', '1.2em');

                    // Append tspans
                    textElement.appendChild(tempTspan);
                    textElement.appendChild(humTspan);
                }
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

function getColor(index: number, colors: Color[], theme: any, defaultColor: string = 'grey') {
    const colorsCount = colors?.length ?? 0;
    return index >= 0 && index < colorsCount
        ? theme.visualization.getColorByName(colors[index].name)
        : defaultColor;
}

function getColorForValue(normalizedValue: number, colors: Color[], theme: any) {
    if (colors.length === 0) {
        return '#000000'; // Default color if the array is empty
    }
    const index = Math.floor(normalizedValue / 25);
    if (index < 0) {
        return getColor(0, colors, theme);
    }
    if (index >= colors.length) {
        return getColor(colors.length - 1, colors, theme);
    }
    return getColor(index, colors, theme);
}
