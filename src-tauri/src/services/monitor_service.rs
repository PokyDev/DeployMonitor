use std::time::Duration;

use chrono::Utc;
use russh::{client, ChannelMsg, Disconnect};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::task::JoinHandle;
use tokio::time::sleep;

use crate::error::AppError;
use crate::services::ssh_connect::{connect_authenticated, SshHandler};
use crate::state::AppState;

const POLL_INTERVAL: Duration = Duration::from_secs(2);
const INITIAL_BACKOFF: Duration = Duration::from_secs(1);
const MAX_BACKOFF: Duration = Duration::from_secs(30);
const MAX_CONSECUTIVE_FAILURES: u32 = 3;

/// Single exec-channel round trip: samples `/proc/stat` and `/proc/net/dev`
/// twice (1s apart, same window) to derive CPU and network deltas, then
/// loadavg/mem/swap/disk/uptime/process+connection counts/temperature —
/// tagged so the Rust side can parse by line prefix instead of fragile
/// column counting. No remote agent; assumes a GNU coreutils Linux target
/// (matches the AWS EC2 placeholder in the connection form) — busybox/Alpine
/// `df`/`free` flags are out of scope. Connection count prefers `ss` (if
/// installed) and falls back to counting ESTABLISHED rows in /proc/net/tcp[6]
/// otherwise. Temperature is best-effort — most cloud/virtualized instances
/// don't expose a thermal zone, in which case `TEMP:NA` is emitted and the
/// frontend renders an explicit "not available" state instead of a fake value.
const METRICS_CMD: &str = r#"
read -r _ u1 n1 s1 i1 io1 irq1 sirq1 st1 _ < /proc/stat
net1=$(awk -F: '/:/{ n=$1; gsub(/^[ \t]+/,"",n); if (n!="lo") { split($2,a," "); rx+=a[1]; tx+=a[9] } } END { print rx" "tx }' /proc/net/dev)
sleep 1
read -r _ u2 n2 s2 i2 io2 irq2 sirq2 st2 _ < /proc/stat
net2=$(awk -F: '/:/{ n=$1; gsub(/^[ \t]+/,"",n); if (n!="lo") { split($2,a," "); rx+=a[1]; tx+=a[9] } } END { print rx" "tx }' /proc/net/dev)
t1=$((u1+n1+s1+i1+io1+irq1+sirq1+st1))
t2=$((u2+n2+s2+i2+io2+irq2+sirq2+st2))
dt=$((t2-t1))
di=$((i2-i1))
awk -v dt="$dt" -v di="$di" 'BEGIN { if (dt > 0) printf "CPU:%.1f\n", (1 - di/dt) * 100; else print "CPU:0.0" }'
awk -v n1="$net1" -v n2="$net2" 'BEGIN {
  split(n1, a1, " "); split(n2, a2, " ");
  rx = a2[1] - a1[1]; tx = a2[2] - a1[2];
  if (rx < 0) rx = 0;
  if (tx < 0) tx = 0;
  printf "NET:%.3f:%.3f\n", rx/1048576, tx/1048576
}'
awk '{ print "LOAD:" $1 ":" $2 ":" $3 }' /proc/loadavg
free -m | awk '/^Mem:/{ print "MEM:" $2 ":" $3 } /^Swap:/{ print "SWAP:" $2 ":" $3 }'
df -BG / | awk 'NR==2{ t=$2; u=$3; gsub(/G/,"",t); gsub(/G/,"",u); print "DISK:" t ":" u }'
awk '{ printf "UPTIME:%.0f\n", $1 }' /proc/uptime
echo "PROC:$(ls /proc | grep -c '^[0-9][0-9]*$')"
if command -v ss >/dev/null 2>&1; then
  conn=$(ss -tan state established 2>/dev/null | tail -n +2 | wc -l)
else
  conn=$(awk 'NR>1 && $4=="01"' /proc/net/tcp /proc/net/tcp6 2>/dev/null | wc -l)
fi
echo "CONN:$conn"
temp=$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null)
if [ -n "$temp" ]; then
  awk -v t="$temp" 'BEGIN { printf "TEMP:%.1f\n", t/1000 }'
else
  echo "TEMP:NA"
fi
"#;

#[derive(Serialize, Clone)]
pub struct MetricSnapshot {
    pub cpu_pct: f32,
    pub mem_used_mb: f32,
    pub mem_total_mb: f32,
    pub disk_used_gb: f32,
    pub disk_total_gb: f32,
    pub load_avg_1: f32,
    pub load_avg_5: f32,
    pub load_avg_15: f32,
    pub swap_used_mb: f32,
    pub swap_total_mb: f32,
    pub net_rx_mbs: f32,
    pub net_tx_mbs: f32,
    pub uptime_secs: f64,
    pub process_count: u32,
    pub connection_count: u32,
    pub temp_c: Option<f32>,
    pub sampled_at: String,
}

#[derive(Serialize, Clone)]
struct MetricsErrorPayload {
    message: String,
}

fn parse_pair(v: &str) -> Option<(f32, f32)> {
    let mut parts = v.split(':');
    let total = parts.next()?.parse::<f32>().ok()?;
    let used = parts.next()?.parse::<f32>().ok()?;
    Some((total, used))
}

fn parse_triple(v: &str) -> Option<(f32, f32, f32)> {
    let mut parts = v.split(':');
    let a = parts.next()?.parse::<f32>().ok()?;
    let b = parts.next()?.parse::<f32>().ok()?;
    let c = parts.next()?.parse::<f32>().ok()?;
    Some((a, b, c))
}

fn parse_snapshot(stdout: &str) -> Result<MetricSnapshot, AppError> {
    let mut cpu_pct = None;
    let mut load = None;
    let mut mem = None;
    let mut swap = None;
    let mut disk = None;
    let mut net = None;
    let mut uptime_secs = None;
    let mut process_count = None;
    let mut connection_count = None;
    let mut temp_c = None;

    for line in stdout.lines() {
        let line = line.trim();
        if let Some(v) = line.strip_prefix("CPU:") {
            cpu_pct = v.parse::<f32>().ok();
        } else if let Some(v) = line.strip_prefix("LOAD:") {
            load = parse_triple(v);
        } else if let Some(v) = line.strip_prefix("MEM:") {
            mem = parse_pair(v);
        } else if let Some(v) = line.strip_prefix("SWAP:") {
            swap = parse_pair(v);
        } else if let Some(v) = line.strip_prefix("DISK:") {
            disk = parse_pair(v);
        } else if let Some(v) = line.strip_prefix("NET:") {
            net = parse_pair(v);
        } else if let Some(v) = line.strip_prefix("UPTIME:") {
            uptime_secs = v.parse::<f64>().ok();
        } else if let Some(v) = line.strip_prefix("PROC:") {
            process_count = v.parse::<u32>().ok();
        } else if let Some(v) = line.strip_prefix("CONN:") {
            connection_count = v.parse::<u32>().ok();
        } else if let Some(v) = line.strip_prefix("TEMP:") {
            temp_c = v.parse::<f32>().ok();
        }
    }

    let cpu_pct = cpu_pct.ok_or_else(|| AppError::MetricsParseFailed("CPU".into()))?;
    let (load_avg_1, load_avg_5, load_avg_15) =
        load.ok_or_else(|| AppError::MetricsParseFailed("LOAD".into()))?;
    let (mem_total_mb, mem_used_mb) =
        mem.ok_or_else(|| AppError::MetricsParseFailed("MEM".into()))?;
    let (swap_total_mb, swap_used_mb) =
        swap.ok_or_else(|| AppError::MetricsParseFailed("SWAP".into()))?;
    let (disk_total_gb, disk_used_gb) =
        disk.ok_or_else(|| AppError::MetricsParseFailed("DISK".into()))?;
    let (net_rx_mbs, net_tx_mbs) =
        net.ok_or_else(|| AppError::MetricsParseFailed("NET".into()))?;
    let uptime_secs = uptime_secs.ok_or_else(|| AppError::MetricsParseFailed("UPTIME".into()))?;
    let process_count =
        process_count.ok_or_else(|| AppError::MetricsParseFailed("PROC".into()))?;
    let connection_count =
        connection_count.ok_or_else(|| AppError::MetricsParseFailed("CONN".into()))?;

    Ok(MetricSnapshot {
        cpu_pct,
        mem_used_mb,
        mem_total_mb,
        disk_used_gb,
        disk_total_gb,
        load_avg_1,
        load_avg_5,
        load_avg_15,
        swap_used_mb,
        swap_total_mb,
        net_rx_mbs,
        net_tx_mbs,
        uptime_secs,
        process_count,
        connection_count,
        temp_c,
        sampled_at: Utc::now().to_rfc3339(),
    })
}

/// Opens a brand-new exec channel (never reused — see `spec-rust-patterns.md`),
/// runs the metrics script, and parses the result. One round trip per call.
async fn sample(handle: &client::Handle<SshHandler>) -> Result<MetricSnapshot, AppError> {
    let mut channel = handle
        .channel_open_session()
        .await
        .map_err(|e| AppError::SshConnectionFailed(e.to_string()))?;

    channel
        .exec(true, METRICS_CMD.to_string())
        .await
        .map_err(|e| AppError::SshConnectionFailed(e.to_string()))?;

    let mut output = Vec::new();
    while let Some(msg) = channel.wait().await {
        match msg {
            ChannelMsg::Data { data } => output.extend_from_slice(&data),
            ChannelMsg::Eof | ChannelMsg::Close => break,
            _ => {}
        }
    }

    parse_snapshot(&String::from_utf8_lossy(&output))
}

fn next_backoff(current: Duration) -> Duration {
    (current * 2).min(MAX_BACKOFF)
}

fn maybe_emit_error(app: &AppHandle, message: &str, failures: u32, already_emitted: &mut bool) {
    if failures >= MAX_CONSECUTIVE_FAILURES && !*already_emitted {
        let _ = app.emit(
            "monitor:metrics-error",
            MetricsErrorPayload {
                message: message.to_string(),
            },
        );
        *already_emitted = true;
    }
}

/// Starts the background polling loop. No-op if one is already running.
/// Keeps a single authenticated session alive across ticks (opening a new
/// exec channel per tick) instead of reconnecting every poll — avoids
/// repeated TCP/SSH handshakes and the connection-rate flags some hardened
/// instances apply to them. Reconnects with exponential backoff on drop.
pub fn start(
    state: &AppState,
    app: AppHandle,
    pem_path: String,
    user: String,
    host: String,
    port: u16,
) -> Result<(), AppError> {
    let mut guard = state
        .monitor
        .lock()
        .map_err(|_| AppError::Monitor("monitor state lock poisoned".into()))?;

    if guard.is_some() {
        return Ok(());
    }

    let task: JoinHandle<()> = tokio::spawn(async move {
        let mut handle: Option<client::Handle<SshHandler>> = None;
        let mut backoff = INITIAL_BACKOFF;
        let mut consecutive_failures: u32 = 0;
        let mut error_emitted = false;

        loop {
            if handle.is_none() {
                match connect_authenticated(&pem_path, &user, &host, port).await {
                    Ok(h) => {
                        handle = Some(h);
                        backoff = INITIAL_BACKOFF;
                        consecutive_failures = 0;
                        error_emitted = false;
                    }
                    Err(e) => {
                        consecutive_failures += 1;
                        maybe_emit_error(
                            &app,
                            &e.to_string(),
                            consecutive_failures,
                            &mut error_emitted,
                        );
                        sleep(backoff).await;
                        backoff = next_backoff(backoff);
                        continue;
                    }
                }
            }

            sleep(POLL_INTERVAL).await;

            let Some(active) = handle.as_ref() else {
                continue;
            };

            match sample(active).await {
                Ok(snapshot) => {
                    consecutive_failures = 0;
                    error_emitted = false;
                    let _ = app.emit("monitor:metrics-update", snapshot);
                }
                Err(e) => {
                    consecutive_failures += 1;
                    maybe_emit_error(
                        &app,
                        &e.to_string(),
                        consecutive_failures,
                        &mut error_emitted,
                    );
                    if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                        if let Some(dead) = handle.take() {
                            let _ = dead
                                .disconnect(Disconnect::ByApplication, "", "English")
                                .await;
                        }
                    }
                }
            }
        }
    });

    *guard = Some(task);
    Ok(())
}

/// Aborts the polling loop. Idempotent if nothing is running.
pub fn stop(state: &AppState) -> Result<(), AppError> {
    let mut guard = state
        .monitor
        .lock()
        .map_err(|_| AppError::Monitor("monitor state lock poisoned".into()))?;

    if let Some(task) = guard.take() {
        task.abort();
    }

    Ok(())
}
