import influxdb_client, os, time
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS
import random

token = "your-token"
org = "my_org"
bucket = "my_bucket"
url = "https://influxdb.zerok.cloud"

client = influxdb_client.InfluxDBClient(url=url, token=token, org=org)

write_api = client.write_api(write_options=SYNCHRONOUS)

sensor_id = [f"sensor_{i+1}" for i in range(21)]

low_temp = 20
high_temp = 30
low_humidity = 60
high_humidity = 80

while True:

    for sensor in sensor_id:
        temp_value = random.uniform(15, 35)
        humid_value = random.uniform(55, 85)
        # Normalize temperature and humidity
        normalized_temp = (temp_value - low_temp) / (high_temp - low_temp)
        normalized_humidity = (humid_value - low_humidity) / (high_humidity - low_humidity)

        # Calculate the average normalized value
        average_normalized_value = (normalized_temp + normalized_humidity) / 2

        # Convert average normalized value to 0-100 range
        average_number = average_normalized_value * 100

        point = (
            Point("environment")
            .tag("sensor_id", sensor)
            .field("temperature", temp_value)
            .field("humidity", humid_value)
            .field("normalized", average_number)
        )
        
        write_api.write(bucket=bucket, org=org, record=point)

    time.sleep(30) # separate points by 30 seconds
