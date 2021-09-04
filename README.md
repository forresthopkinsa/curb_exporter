# curb_exporter

Export Prometheus metrics from CURB energy API

See also: [CURB](https://energycurb.com/), [Prometheus](https://prometheus.io/)

## Usage

1. Download `curb_exporter` binary from Releases tab if your platform is prebuilt, or build manually (see below)

1. Write a `config.yml` file (can be named anything) following the format of [`example-config.yml`](https://github.com/forresthopkinsa/curb_exporter/blob/master/example-config.yml)

1. Start the server by running `curb_exporter`.
By default, it will use `config.yml` in the same directory, but this can be overridden by passing a path as the first argument: `curb_exporter /etc/prometheus/curb.yml`.
It will start listening on port 9895. This can be configured with the `PORT` environment variable, e.g. `PORT=1234 curb_exporter`.

1. Configure Prometheus to scrape the `curb_exporter` server, e.g. something like this:

```yaml
# prometheus.yml
- job_name: curb
  scrape_interval: 1m # The CURB API only updates once per minute, so any higher value here will result in stale data
  # If the following configuration looks weird to you, see: https://prometheus.io/docs/guides/multi-target-exporter/
  static_configs:
    - targets:
      # The following must be your CURB location ID
      # Your location ID is in the URL of your personal CURB dashboard after you log in, e.g. for the dashboard URL:
      # https://app.energycurb.com/dash/99f36fac-595f-4e16-ad29-111a6f64a781
      # ...your location ID would be:
      - 99f36fac-595f-4e16-ad29-111a6f64a781
  metrics_path: /latest
  relabel_configs:
    - source_labels: [__address__]
      target_label: __param_target
    - source_labels: [__param_target]
      target_label: instance
    - target_label: __address__
      replacement: localhost:9895 # Replace with your server address
```

5. (Optional) Configure a systemd service for the exporter, e.g. something like this:

```ini
# curb_exporter.service
[Unit]
Description=CURB Energy Prometheus exporter
Wants=prometheus.service
After=prometheus.service

[Service]
User=prometheus
Group=prometheus
Type=simple
Restart=on-failure
ConfigurationDirectory=prometheus
ExecStart=curb_exporter ${CONFIGURATION_DIRECTORY}/curb.yml

[Install]
WantedBy=multi-user.target
```

The above would use a configuration file located at `/etc/prometheus/curb.yml` and would find `curb_exporter` anywhere in system PATH.

## Building

Building should be very simple. Just run `yarn build` in the package directory.
It's configured to target linux-x64, but you can adjust the [pkg target](https://github.com/vercel/pkg/#targets) in the respective package.json script to build for another platform.
