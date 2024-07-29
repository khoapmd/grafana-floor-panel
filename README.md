# Floor Plan Indoor Environment Quality Monitoring
<p style="text-align:center; opacity: 0.5">(soon interactive)</p>

![img.png](https://github.com/khoapmd/grafana-floor-panel/blob/main/sample/floor-environment.png?raw=true)

### Features
- [x] Environment Quality rendering
- [x] Easy configuration and setup
- [ ] Interactive rooms

### Short description
Monitoring indoor temperature and humidity through floor plan visualization in Grafana provides valuable insights into the environmental conditions of different areas within a building. By integrating sensors and data collection points throughout the building, Grafana can display real-time and historical temperature and humidity data on a floor plan layout.<br />
This enables users to easily identify areas with undesirable conditions and take appropriate actions to improve them, such as adjusting HVAC systems or implementing dehumidifiers. Overall, this approach enhances indoor environmental management, contributing to creating healthier and more comfortable spaces for occupants.

The plugin finds rooms in the provided floor plan SVG by looking for prefix of:
- Drawing color: id = `room:` (example: `room:livingroom`)
- Drawing room name label: id = `name:` (example: `name:livingroom`) 
- Drawing number label: id = `roomname` (example: `livingroom`) 

### Public Dashboard Example
https://grafana.zerok.cloud/public-dashboards/1e7530530e5a4d01a604903b0379cbbc?orgId=1&refresh=30s

### Required Data Example (CSV)
https://github.com/khoapmd/grafana-floor-panel/blob/main/sample/sample-data.csv

**Data should be grouped as**
```
<sensor_id, <_field, _time, _value, sensor_id>>
```

A flux example query would be
```flux
from(bucket: "my_bucket")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r["_measurement"] == "environment")
  |> map(fn: (r) => ({r with _value: string(v: r._value)}))
  |> last()
  |> group(columns: ["sensor_id"])
  |> drop(columns: ["_start", "_stop", "_measurement", "location"])
```

#### Sample Floor plan SVG Data
https://github.com/khoapmd/grafana-floor-panel/blob/main/sample/floor-envirnment.svg
