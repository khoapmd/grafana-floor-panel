Here's a basic `README.md` structure for your project. It highlights the key features, setup instructions, usage, and technical details you've shared.

# Floor Plan Indoor Environment Quality Monitoring

![Floor Plan IEQ Monitoring](https://github.com/khoapmd/grafana-floor-panel/blob/main/sample/floor-environment.png?raw=true)

## Features
- [x] Real-time environment quality visualization (temperature, humidity)
- [x] Easy configuration and setup using Grafana
- [x] Automated plugin build with GitHub Actions

## Overview
This project provides indoor environment quality monitoring via a floor plan visualization in Grafana. It integrates temperature and humidity sensors and displays the data on a customizable SVG-based floor plan. This allows users to monitor real-time conditions and historical data, enhancing environmental management in various spaces like offices, labs, and buildings.

### Key Benefits:
- Easily monitor temperature and humidity across different rooms
- Visualize data on a floor plan with color-coded environmental conditions
- Utilize Grafana's powerful alerting system to respond to environmental issues
- Automate deployment and updates with GitHub Actions

## Public Dashboard Example
You can see a public demo of the dashboard here:
[Public Dashboard](https://grafana.zerok.cloud/public-dashboards/1e7530530e5a4d01a604903b0379cbbc?orgId=1&refresh=30s)

## Required Data Format in Gradient Mode
For proper functionality, sensor data should be provided in the following format (CSV):
```
sensor_id, _field, _time, _value
```
[InfluxDB Example CSV](https://github.com/khoapmd/grafana-floor-panel/blob/main/sample/influxdb-sample.csv)

## Required Data Format in Single Color Mode (Gradient is off)
For proper functionality, the data should be provided in the following format:
```
line, timestamp, number
```

## Sample Flux Query (InfluxDB)
```flux
from(bucket: "my_bucket")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r["_measurement"] == "environment")
  |> map(fn: (r) => ({r with _value: string(v: r._value)}))
  |> last()
  |> group(columns: ["sensor_id"])
  |> drop(columns: ["_start", "_stop", "_measurement", "location"])
```
[Other SQL Example CSV](https://github.com/khoapmd/grafana-floor-panel/blob/main/sample/postgre-sample.csv)

## Sample Flux Query (PostgreSQL)
```sql
SELECT DISTINCT ON (line)
    line::TEXT AS line,
    timestamp,
    number
FROM public.line_status
ORDER BY line, timestamp DESC;
```

## Sample Flux Query (InfluxDB - Normalization of Temperature and Humidity Data)
If your edge device doesn’t handle normalization, you can calculate normalized values with this Flux query:
```flux
originalData = from(bucket: "SAMPLE")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r._measurement == "TEMPSENSOR")
  |> last()
  |> rename(
      fn: (column) => {
          newColumnName = if column =~ /^deviceNo/ then "sensor_id" else column
          return newColumnName
      }
  )
  |> group(columns: ["sensor_id"])
  |> drop(columns: ["_start", "_stop", "_measurement"])

normalizedTemperature = originalData
  |> filter(fn: (r) => r._field == "temperature" and exists r.temp_min and exists r.temp_max)
  |> map(fn: (r) => ({
      sensor_id: r.sensor_id,
      _time: r._time,
      normalized_temperature: 
        (float(v: r._value) - float(v: r.temp_min)) / (float(v: r.temp_max) - float(v: r.temp_min)) * 100.0
    })
  )

normalizedHumidity = originalData
  |> filter(fn: (r) => r._field == "humidity" and exists r.hum_min and exists r.hum_max)
  |> map(fn: (r) => ({
      sensor_id: r.sensor_id,
      _time: r._time,
      normalized_humidity: 
        (float(v: r._value) - float(v: r.hum_min)) / (float(v: r.hum_max) - float(v: r.hum_min)) * 100.0
    })
  )

joinedData = join(
    tables: {t1: normalizedTemperature, t2: normalizedHumidity},
    on: ["sensor_id", "_time"]
)

normalizedValue = joinedData
  |> map(fn: (r) => ({
      sensor_id: r.sensor_id,
      _time: r._time,
      _field: "normalized",
      _value: (r.normalized_temperature + r.normalized_humidity) / 2.0
    })
  )

union(tables: [originalData, normalizedValue])
  |> keep(columns: ["sensor_id", "_time", "_field", "_value"])
```

## Sample Floor Plan SVG Data
You can view an example of the SVG floor plan used for visualization:
[Sample Floor Plan](https://github.com/khoapmd/grafana-floor-panel/blob/main/sample/floor-envirnment.svg)

### SVG ID Convention:
- Room areas: id=`room:<room_name>` (e.g., `room:livingroom`)
- Room labels: id=`name:<room_name>` (e.g., `name:livingroom`)
- Room number labels: id=`roomname` (e.g., `livingroom`)
  Note that when Gradient Mode is off, only room areas was displayed

## Building the Plugin with GitHub Actions

This plugin is built using GitHub Actions to automate the build and release process. Here’s how you can set up and trigger builds for your own Grafana environment monitoring plugin.

### GitHub Actions Setup:
1. In your GitHub repository, go to **Settings** > **Secrets and variables** > **Actions**.
2. Add the following secrets:
   - `GRAFANA_ACCESS_POLICY_TOKEN`: Your Grafana Access Policy Token
   - `PLUGIN_SIGNATURE_PRIVATE_KEY`: Your private key for signing the plugin
3. Update the `.github/workflows/ci.yml` with the build and release script.

#### Workflow Example:
```yaml
name: Build and Release

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main

jobs:
  cache-and-install:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        name: Install pnpm
        with:
          version: 8.9.2
          run_install: false

      - name: Install Node.js
        uses: actions/setup-node@v4 
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Get pnpm store directory
        shell: bash
        run: |
          echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV

      - uses: actions/cache@v4
        name: Setup pnpm cache
        with:
          path: ${{ env.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-

      - name: Install dependencies
        run: pnpm install

      - name: Build the project
        run: pnpm run build
      
      - name: Sign Grafana Plugin Private Mode
        env:
          GRAFANA_ACCESS_POLICY_TOKEN: ${{ secrets.GRAFANA_ACCESS_POLICY_TOKEN }}
        run: npx @grafana/sign-plugin@latest --rootUrls http://your-grafana-instance.com

      - name: Package and Push to Release
        run: |
          chmod +x pack.sh
          ./pack.sh

      - name: Create Release
        id: create_release
        uses: actions/create-release@v1.1.4
        env:
          GITHUB_TOKEN: ${{ secrets.BUILD_RELEASE }}
        with:
          tag_name: v${{ github.sha }}
          release_name: Release ${{ github.sha }}
          draft: false
          prerelease: false

      - name: Upload Release Asset
        id: upload-release-asset
        uses: actions/upload-release-asset@v1.0.2
        env:
          GITHUB_TOKEN: ${{ secrets.BUILD_RELEASE }}
        with:
          upload_url: ${{ steps.create_release.outputs.upload_url }}
          asset_path: ./khoapmd-environment-panel.zip
          asset_name: khoapmd-environment-panel.zip
          asset_content_type: application/zip
```

With this setup, every push to the `main` branch triggers an automated build and release process.

## Contributing
Contributions are welcome! Please feel free to submit a Pull Request.

## License
This project is licensed under the MIT License.
