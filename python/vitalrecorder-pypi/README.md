# vitalrecorder

VitalRecorder simulator that downloads sample vital signs data from [VitalDB](https://vitaldb.net) open dataset and streams it as HL7 v2.6 messages to a VitalServer via Socket.IO.

Acts as a VitalRecorder client, sending real-time HL7 data for 5 simulated beds.

## Installation

```bash
pip install vitalrecorder
```

## Usage

```bash
# Stream to default server (vitaldb.net)
vitalrecorder

# Stream to a custom server
vitalrecorder https://my-server.com

# With custom VitalRecorder code
vitalrecorder https://my-server.com --vrcode MY_DEMO
```

### Options

| Argument | Default | Description |
|----------|---------|-------------|
| `server` | `https://vitaldb.net` | VitalServer URL |
| `--vrcode` | `VITALDEMO` | VitalRecorder device identifier |

## What It Does

1. Downloads 5 sample `.vital` files from `api.vitaldb.net` on startup
2. Connects to the specified VitalServer via Socket.IO (WebSocket)
3. Emits `join_vr` with the vrcode to register as a VitalRecorder
4. Sends gzip-compressed HL7 v2.6 payloads via `send_data` event every 1 second
5. Loops data infinitely - when a file ends, it restarts from the beginning

## HL7 v2.6 Message Format

Each payload contains HL7 messages for all 5 beds concatenated together:

```
MSH|^~\&|VitalRecorder|VITALDEMO|||20250401120000||ORU^R01|1|P|2.6
PID|||
PV1||I|BED-1
OBR|1|||VITAL_SIGNS|||20250401115959|20250401120000
OBX|1|NM|ECG_HR^Monitor/HR||72|bpm|40^200||||R
OBX|2|NA|ECG_WAV^Monitor/ECG_II@100||0.12^0.15^...||mV|-1.5^1.5||||R
MSH|^~\&|VitalRecorder|VITALDEMO|||20250401120000||ORU^R01|2|P|2.6
PID|||
PV1||I|BED-2
...
```

### OBX Value Types

| Type | Description | Example |
|------|-------------|---------|
| `NM` | Numeric | `72` |
| `NA` | Waveform (`^`-separated) | `0.12^0.15^0.09` |
| `ST` | String event | `Induction Start` |

## Node.js Version

A JavaScript version is also available:

```bash
npx vitalrecorder [server_url] [--vrcode CODE]
```

## License

MIT
