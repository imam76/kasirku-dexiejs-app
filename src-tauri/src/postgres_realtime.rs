use crate::db;
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgListener;
use std::{
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter};

const POSTGRES_REALTIME_CHANNEL: &str = "kasirku_data_changes";
const POSTGRES_REALTIME_EVENT: &str = "postgres-data-change";
const LISTENER_RECV_TIMEOUT: Duration = Duration::from_secs(30);
const LISTENER_INITIAL_RECONNECT_DELAY: Duration = Duration::from_secs(2);
const LISTENER_MAX_RECONNECT_DELAY: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Default)]
pub struct PostgresRealtimeState {
    generation: Arc<AtomicU64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct PostgresRealtimePayload {
    table: Option<String>,
    operation: Option<String>,
    id: Option<String>,
    updated_at: Option<String>,
    emitted_at: Option<String>,
}

impl PostgresRealtimeState {
    pub fn restart(&self, app_handle: AppHandle, enabled: bool) {
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;

        if !enabled {
            return;
        }

        let database_url = match db::configured_database_url() {
            Ok(database_url) => database_url,
            Err(error) => {
                eprintln!("[PostgreSQL realtime] listener skipped: {error}");
                return;
            }
        };

        let active_generation = Arc::clone(&self.generation);

        tauri::async_runtime::spawn(async move {
            run_postgres_realtime_listener(
                app_handle,
                active_generation,
                generation,
                database_url,
            )
            .await;
        });
    }
}

async fn run_postgres_realtime_listener(
    app_handle: AppHandle,
    active_generation: Arc<AtomicU64>,
    generation: u64,
    database_url: String,
) {
    let mut reconnect_delay = LISTENER_INITIAL_RECONNECT_DELAY;

    while is_current_generation(&active_generation, generation) {
        match PgListener::connect(&database_url).await {
            Ok(mut listener) => {
                if let Err(error) = listener.listen(POSTGRES_REALTIME_CHANNEL).await {
                    eprintln!("[PostgreSQL realtime] failed to listen: {error}");
                    sleep_if_current(&active_generation, generation, reconnect_delay).await;
                    reconnect_delay = next_reconnect_delay(reconnect_delay);
                    continue;
                }

                reconnect_delay = LISTENER_INITIAL_RECONNECT_DELAY;

                while is_current_generation(&active_generation, generation) {
                    match tokio::time::timeout(LISTENER_RECV_TIMEOUT, listener.recv()).await {
                        Ok(Ok(notification)) => {
                            if let Some(payload) = parse_realtime_payload(notification.payload()) {
                                if let Err(error) = app_handle.emit(POSTGRES_REALTIME_EVENT, payload) {
                                    eprintln!("[PostgreSQL realtime] failed to emit event: {error}");
                                }
                            }
                        }
                        Ok(Err(error)) => {
                            eprintln!("[PostgreSQL realtime] listener disconnected: {error}");
                            break;
                        }
                        Err(_) => {}
                    }
                }
            }
            Err(error) => {
                eprintln!("[PostgreSQL realtime] failed to connect listener: {error}");
            }
        }

        sleep_if_current(&active_generation, generation, reconnect_delay).await;
        reconnect_delay = next_reconnect_delay(reconnect_delay);
    }
}

fn parse_realtime_payload(raw_payload: &str) -> Option<PostgresRealtimePayload> {
    match serde_json::from_str::<PostgresRealtimePayload>(raw_payload) {
        Ok(payload) => Some(payload),
        Err(error) => {
            eprintln!("[PostgreSQL realtime] invalid payload: {error}");
            None
        }
    }
}

fn is_current_generation(active_generation: &AtomicU64, generation: u64) -> bool {
    active_generation.load(Ordering::SeqCst) == generation
}

async fn sleep_if_current(
    active_generation: &AtomicU64,
    generation: u64,
    duration: Duration,
) {
    if is_current_generation(active_generation, generation) {
        tokio::time::sleep(duration).await;
    }
}

fn next_reconnect_delay(current_delay: Duration) -> Duration {
    (current_delay * 2).min(LISTENER_MAX_RECONNECT_DELAY)
}
