//! Hands an open upstream stream from one web player engine to the next.
//!
//! The web player tries hls.js first for `.m3u8` URLs, but some servers
//! (Dispatcharr, for one) answer those URLs with a raw MPEG-TS stream. The proxy
//! then tells hls.js the URL is not a playlist and parks the open upstream
//! response here. The MPEG-TS engine's request for the same URL arrives a moment
//! later and claims it, so the provider sees a single connection. Many accounts
//! allow only one, and a provider that hasn't released a closed connection yet
//! would refuse a second.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::Duration;

use reqwest::blocking::Response as UpstreamResponse;
use url::Url;

/// An upstream response waiting for the next engine, with the bytes already
/// read from it while sniffing for a playlist.
pub struct ParkedStream {
    pub target: Url,
    pub upstream: UpstreamResponse,
    pub prefix: Vec<u8>,
    pub host: String,
}

type Slot = Option<(u64, ParkedStream)>;

/// Holds at most one parked stream (there is only one player). Dropping a
/// parked stream closes its upstream connection.
pub struct StreamParking {
    slot: Arc<Mutex<Slot>>,
    next_id: AtomicU64,
    ttl: Duration,
}

impl StreamParking {
    pub fn new(ttl: Duration) -> Self {
        Self {
            slot: Arc::new(Mutex::new(None)),
            next_id: AtomicU64::new(0),
            ttl,
        }
    }

    /// Parks `stream`, closing any stream parked before it. The stream is
    /// closed after the TTL unless a request claims it first.
    pub fn park(&self, stream: ParkedStream) {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let slot = Arc::clone(&self.slot);
        let ttl = self.ttl;
        let expiry = thread::Builder::new()
            .name("stream-proxy-parking".to_string())
            .spawn(move || {
                thread::sleep(ttl);
                let mut guard = lock(&slot);
                if guard
                    .as_ref()
                    .is_some_and(|(parked_id, _)| *parked_id == id)
                {
                    let expired = guard.take();
                    drop(guard);
                    drop(expired);
                }
            });
        // Without an expiry the stream could hold the provider connection
        // indefinitely; let it close now instead.
        if expiry.is_ok() {
            let previous = lock(&self.slot).replace((id, stream));
            drop(previous);
        }
    }

    /// Takes the parked stream when it is for `target`. A stream parked for any
    /// other URL is closed: the player has moved on, and keeping it would hold
    /// the provider's connection.
    pub fn claim(&self, target: &Url) -> Option<ParkedStream> {
        let (_, parked) = lock(&self.slot).take()?;
        (parked.target == *target).then_some(parked)
    }
}

fn lock(slot: &Mutex<Slot>) -> MutexGuard<'_, Slot> {
    slot.lock().unwrap_or_else(PoisonError::into_inner)
}
