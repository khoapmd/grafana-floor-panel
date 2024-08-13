import {PanelPlugin} from '@grafana/data';
import {SimpleOptions} from './types';
import {SimplePanel} from './components/SimplePanel';
import {RoomSensorPicker} from "./components/RoomSensorPicker";

export const plugin = new PanelPlugin<SimpleOptions>(SimplePanel)
        .useFieldConfig()
        .setPanelOptions(builder => {
            builder.addBooleanSwitch({
                path: 'colorMode',
                name: 'Use Gradient Color',
                defaultValue: true,
                category: ["Floor Plan"],
              })
            builder.addTextInput({
                name: "Floor plan SVG",
                path: "svg",
                settings: {useTextarea: true},
                defaultValue: ``,
                category: ["Floor Plan"]
            })
            builder.addCustomEditor({
                editor: RoomSensorPicker,
                id: "sensorMappings",
                name: "Sensor picker",
                path: 'sensorMappings',
                category: ["Floor Plan"],
            })
        })
    // { "rooms": [], "objects": [] }
;
