//! Local HTTP proxy for the in-app web player.
//!
//! IPTV providers rarely send CORS headers, often redirect to load-balancer hosts
//! with relative segment paths, and sometimes reject browser user agents. The web
//! player therefore routes every stream request through this proxy:
//!
//! `GET|HEAD http://127.0.0.1:{port}/{token}/stream?url={encodeURIComponent(url)}`
//!
//! The random token keeps other local web pages from using it as an open proxy.

mod hls;
#[cfg(test)]
mod tests;

use std::error::Error;
use std::io::{self, Cursor, Read};
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use reqwest::blocking::{Client, Response as UpstreamResponse};
use reqwest::header::{
    HeaderName, ACCEPT_ENCODING, ACCEPT_RANGES, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, RANGE,
};
use reqwest::redirect::Policy;
use tiny_http::{Header, Method, Request, ResponseBox, Server, StatusCode};
use url::{form_urlencoded, Url};

use crate::foundation::append_log;

/// User agent sent upstream; widely accepted by IPTV providers.
pub const STREAM_PROXY_USER_AGENT: &str = "VLC/3.0.20 LibVLC/3.0.20";

const UPSTREAM_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
/// reqwest's *blocking* client applies its timeout to each blocking wait (waiting
/// for response headers, and each body `read`), not to the whole transfer. So it
/// acts as an idle timeout: infinite live streams keep flowing, while stalled
/// upstreams are cut off instead of pinning a thread and a provider connection.
const UPSTREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(30);
const UPSTREAM_MAX_REDIRECTS: usize = 10;
const MAX_PLAYLIST_BYTES: usize = 10 * 1024 * 1024;
/// Bytes to buffer before deciding whether an ambiguous response is a playlist.
const PLAYLIST_SNIFF_BYTES: usize = 64;
const TOKEN_BYTES: usize = 16;
const HLS_CONTENT_TYPE: &str = "application/vnd.apple.mpegurl";
const EXPOSED_HEADERS: &str = "Content-Length, Content-Range, Accept-Ranges, Content-Type";

/// A running proxy server. Dropping it stops accepting new requests.
pub struct StreamProxy {
    base_url: String,
    server: Arc<Server>,
}

impl StreamProxy {
    /// Binds `127.0.0.1:0` and serves requests on a background thread.
    pub fn start(log_path: Option<PathBuf>) -> Result<Self, String> {
        Self::start_with_idle_timeout(log_path, UPSTREAM_IDLE_TIMEOUT)
    }

    fn start_with_idle_timeout(
        log_path: Option<PathBuf>,
        upstream_idle_timeout: Duration,
    ) -> Result<Self, String> {
        let token = generate_token()?;
        let client = build_upstream_client(upstream_idle_timeout)?;
        let server = Server::http("127.0.0.1:0")
            .map_err(|err| format!("failed to bind stream proxy: {err}"))?;
        let port = server
            .server_addr()
            .to_ip()
            .map(|addr| addr.port())
            .ok_or_else(|| "stream proxy is not bound to an IP address".to_string())?;

        let base_url = format!("http://127.0.0.1:{port}/{token}");
        let server = Arc::new(server);
        let context = Arc::new(ProxyContext {
            token,
            base_url: base_url.clone(),
            client,
            log_path,
        });

        let accept_server = Arc::clone(&server);
        let accept_context = Arc::clone(&context);
        thread::Builder::new()
            .name("stream-proxy".to_string())
            .spawn(move || serve(&accept_server, accept_context))
            .map_err(|err| format!("failed to spawn stream proxy thread: {err}"))?;

        context.log(
            "INFO",
            &format!("stream proxy listening on 127.0.0.1:{port}"),
        );

        Ok(Self { base_url, server })
    }

    /// `http://127.0.0.1:{port}/{token}`; stream URLs are `{base_url}/stream?url=...`.
    pub fn base_url(&self) -> &str {
        &self.base_url
    }
}

impl Drop for StreamProxy {
    fn drop(&mut self) {
        self.server.unblock();
    }
}

struct ProxyContext {
    token: String,
    base_url: String,
    client: Client,
    log_path: Option<PathBuf>,
}

impl ProxyContext {
    fn log(&self, level: &str, message: &str) {
        if let Some(log_path) = &self.log_path {
            let _ = append_log(log_path, level, message);
        }
    }
}

fn generate_token() -> Result<String, String> {
    let mut bytes = [0u8; TOKEN_BYTES];
    getrandom::fill(&mut bytes)
        .map_err(|err| format!("failed to generate stream proxy token: {err}"))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn build_upstream_client(idle_timeout: Duration) -> Result<Client, String> {
    Client::builder()
        .user_agent(STREAM_PROXY_USER_AGENT)
        .connect_timeout(UPSTREAM_CONNECT_TIMEOUT)
        .timeout(idle_timeout)
        .redirect(Policy::limited(UPSTREAM_MAX_REDIRECTS))
        .build()
        .map_err(|err| format!("failed to build stream proxy HTTP client: {err}"))
}

fn serve(server: &Server, context: Arc<ProxyContext>) {
    // `incoming_requests` ends when the proxy is dropped (unblock) or the
    // listener fails permanently.
    for request in server.incoming_requests() {
        let request_context = Arc::clone(&context);
        // If spawning fails the request is dropped, which answers it with a 500.
        let spawned = thread::Builder::new()
            .name("stream-proxy-request".to_string())
            .spawn(move || handle_request(request, &request_context));
        if let Err(err) = spawned {
            context.log(
                "WARN",
                &format!("stream proxy could not spawn request thread: {err}"),
            );
        }
    }
}

#[derive(Debug, PartialEq)]
enum Route {
    Stream(Url),
    Preflight,
    BadRequest(&'static str),
    NotFound,
}

fn route_request(method: &Method, raw_url: &str, token: &str) -> Route {
    let (path, query) = raw_url.split_once('?').unwrap_or((raw_url, ""));
    let path_token = path
        .strip_prefix('/')
        .and_then(|rest| rest.strip_suffix("/stream"));
    if !path_token.is_some_and(|candidate| tokens_match(candidate, token)) {
        return Route::NotFound;
    }

    match method {
        Method::Options => Route::Preflight,
        Method::Get | Method::Head => match parse_stream_target(query) {
            Ok(target) => Route::Stream(target),
            Err(reason) => Route::BadRequest(reason),
        },
        _ => Route::NotFound,
    }
}

fn tokens_match(candidate: &str, token: &str) -> bool {
    let (candidate, token) = (candidate.as_bytes(), token.as_bytes());
    candidate.len() == token.len()
        && candidate
            .iter()
            .zip(token)
            .fold(0u8, |diff, (a, b)| diff | (a ^ b))
            == 0
}

fn parse_stream_target(query: &str) -> Result<Url, &'static str> {
    let mut target: Option<String> = None;
    let mut delivery_directives: Vec<(String, String)> = Vec::new();
    for (key, value) in form_urlencoded::parse(query.as_bytes()) {
        if key == "url" {
            target.get_or_insert_with(|| value.into_owned());
        } else if key.starts_with("_HLS_") {
            // hls.js appends LL-HLS delivery directives to the playlist URL it
            // requests (our proxy URL); forward them to the real playlist.
            delivery_directives.push((key.into_owned(), value.into_owned()));
        }
    }

    let raw_target = target.ok_or("missing `url` query parameter")?;
    let mut target = Url::parse(&raw_target).map_err(|_| "invalid `url` query parameter")?;
    if !matches!(target.scheme(), "http" | "https") {
        return Err("only http and https URLs can be proxied");
    }
    if !delivery_directives.is_empty() {
        let mut pairs = target.query_pairs_mut();
        for (key, value) in &delivery_directives {
            pairs.append_pair(key, value);
        }
    }
    Ok(target)
}

fn handle_request(request: Request, context: &ProxyContext) {
    let response = match route_request(request.method(), request.url(), &context.token) {
        Route::Stream(target) => proxy_stream(&request, &target, context),
        Route::Preflight => preflight_response(&request),
        Route::BadRequest(reason) => text_response(400, reason),
        Route::NotFound => text_response(404, "not found"),
    };
    // Errors here are almost always the client going away mid-stream. Returning
    // drops the upstream response, which closes the upstream connection.
    let _ = request.respond(response);
}

fn proxy_stream(request: &Request, target: &Url, context: &ProxyContext) -> ResponseBox {
    let is_head = *request.method() == Method::Head;
    let host = target.host_str().unwrap_or("unknown host").to_string();

    let mut upstream_request = if is_head {
        context.client.head(target.clone())
    } else {
        context.client.get(target.clone())
    };
    // Ask for identity so bodies and lengths (including ranges) pass through exactly.
    upstream_request = upstream_request.header(ACCEPT_ENCODING, "identity");
    if let Some(range) = request_header(request, "Range") {
        upstream_request = upstream_request.header(RANGE, range);
    }

    let upstream = match upstream_request.send() {
        Ok(upstream) => upstream,
        Err(err) => {
            let reason = describe_upstream_error(&err);
            context.log(
                "WARN",
                &format!("stream proxy upstream request to {host} failed: {reason}"),
            );
            return text_response(502, &format!("upstream request failed: {reason}"));
        }
    };

    let status = upstream.status();
    if status.is_client_error() || status.is_server_error() {
        context.log(
            "WARN",
            &format!(
                "stream proxy upstream {host} responded with HTTP {}",
                status.as_u16()
            ),
        );
    }

    if is_head {
        return head_response(&upstream);
    }
    if status.as_u16() == 200 {
        return playlist_aware_response(upstream, host, context);
    }
    passthrough_response(upstream, Vec::new(), host, context)
}

/// Serves a 200 response, rewriting it if it is an HLS playlist.
fn playlist_aware_response(
    mut upstream: UpstreamResponse,
    host: String,
    context: &ProxyContext,
) -> ResponseBox {
    let content_type = upstream_header(&upstream, &CONTENT_TYPE).map(str::to_string);
    let declared_playlist = content_type
        .as_deref()
        .is_some_and(hls::is_playlist_content_type);
    let maybe_playlist = declared_playlist
        || hls::has_playlist_extension(upstream.url())
        || content_type.as_deref().is_none_or(is_generic_content_type);
    if !maybe_playlist {
        return passthrough_response(upstream, Vec::new(), host, context);
    }

    let prefix = match read_prefix(&mut upstream, PLAYLIST_SNIFF_BYTES) {
        Ok(prefix) => prefix,
        Err(err) => {
            context.log(
                "WARN",
                &format!(
                    "stream proxy failed reading from {host}: {}",
                    describe_io_error(&err)
                ),
            );
            return text_response(502, "upstream body read failed");
        }
    };
    if !declared_playlist && !hls::looks_like_playlist(&prefix) {
        return passthrough_response(upstream, prefix, host, context);
    }

    let playlist_url = upstream.url().clone();
    let body = match read_playlist(prefix, &mut upstream) {
        Ok(PlaylistBody::Complete(body)) => body,
        Ok(PlaylistBody::TooLarge(buffered)) => {
            // Not a realistic HLS playlist; hand it through untouched.
            return passthrough_response(upstream, buffered, host, context);
        }
        Err(err) => {
            context.log(
                "WARN",
                &format!(
                    "stream proxy failed reading playlist from {host}: {}",
                    describe_io_error(&err)
                ),
            );
            return text_response(502, "upstream playlist read failed");
        }
    };

    let rewritten = hls::rewrite_hls_playlist(
        &String::from_utf8_lossy(&body),
        &playlist_url,
        &context.base_url,
    )
    .into_bytes();
    let length = rewritten.len();
    let mut headers = cors_headers();
    headers.push(header("Content-Type", HLS_CONTENT_TYPE));
    headers.push(header("Cache-Control", "no-cache"));
    build_response(200, headers, Box::new(Cursor::new(rewritten)), Some(length))
}

fn is_generic_content_type(content_type: &str) -> bool {
    let essence = content_type
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    essence.is_empty()
        || essence.starts_with("text/")
        || essence == "application/octet-stream"
        || essence == "binary/octet-stream"
}

/// Streams the upstream body (after any already-consumed `prefix`) to the client.
fn passthrough_response(
    upstream: UpstreamResponse,
    prefix: Vec<u8>,
    host: String,
    context: &ProxyContext,
) -> ResponseBox {
    let status = upstream.status().as_u16();
    let headers = passthrough_headers(&upstream);
    let length = upstream_content_length(&upstream);
    let body = UpstreamBody {
        inner: Cursor::new(prefix).chain(upstream),
        host,
        log_path: context.log_path.clone(),
    };
    build_response(status, headers, Box::new(body), length)
}

fn head_response(upstream: &UpstreamResponse) -> ResponseBox {
    let status = upstream.status().as_u16();
    let mut headers = passthrough_headers(upstream);
    let is_playlist =
        upstream_header(upstream, &CONTENT_TYPE).is_some_and(hls::is_playlist_content_type);
    // A rewritten playlist has a different length, so only report it for other bodies.
    let length = if is_playlist {
        headers.push(header("Content-Type", HLS_CONTENT_TYPE));
        None
    } else {
        upstream_content_length(upstream)
    };
    build_response(status, headers, Box::new(io::empty()), length)
}

fn passthrough_headers(upstream: &UpstreamResponse) -> Vec<Header> {
    let mut headers = cors_headers();
    for name in [&CONTENT_TYPE, &CONTENT_RANGE, &ACCEPT_RANGES] {
        if let Some(value) = upstream_header(upstream, name) {
            if let Ok(header) = Header::from_bytes(name.as_str().as_bytes(), value.as_bytes()) {
                headers.push(header);
            }
        }
    }
    headers
}

fn upstream_header<'a>(upstream: &'a UpstreamResponse, name: &HeaderName) -> Option<&'a str> {
    upstream
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
}

/// Read from the header rather than `Response::content_length`, which reports 0
/// for HEAD responses. reqwest strips the header if it decompressed the body.
fn upstream_content_length(upstream: &UpstreamResponse) -> Option<usize> {
    upstream_header(upstream, &CONTENT_LENGTH).and_then(|value| value.trim().parse().ok())
}

fn read_prefix(reader: &mut impl Read, min_len: usize) -> io::Result<Vec<u8>> {
    let mut prefix = Vec::with_capacity(min_len);
    let mut chunk = [0u8; PLAYLIST_SNIFF_BYTES];
    while prefix.len() < min_len {
        match reader.read(&mut chunk) {
            Ok(0) => break,
            Ok(read) => prefix.extend_from_slice(&chunk[..read]),
            Err(err) if err.kind() == io::ErrorKind::Interrupted => continue,
            Err(err) => return Err(err),
        }
    }
    Ok(prefix)
}

enum PlaylistBody {
    Complete(Vec<u8>),
    /// Exceeded [`MAX_PLAYLIST_BYTES`]; holds everything read so far.
    TooLarge(Vec<u8>),
}

fn read_playlist(prefix: Vec<u8>, reader: &mut impl Read) -> io::Result<PlaylistBody> {
    let mut body = prefix;
    let remaining = (MAX_PLAYLIST_BYTES + 1).saturating_sub(body.len()) as u64;
    reader.take(remaining).read_to_end(&mut body)?;
    if body.len() > MAX_PLAYLIST_BYTES {
        Ok(PlaylistBody::TooLarge(body))
    } else {
        Ok(PlaylistBody::Complete(body))
    }
}

/// Upstream body reader that ends the response cleanly when the upstream fails
/// mid-transfer (reset, idle timeout), so chunked clients see end-of-stream
/// instead of hanging on a half-finished response.
struct UpstreamBody<R> {
    inner: R,
    host: String,
    log_path: Option<PathBuf>,
}

impl<R: Read> Read for UpstreamBody<R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        loop {
            match self.inner.read(buf) {
                Err(err) if err.kind() == io::ErrorKind::Interrupted => continue,
                Err(err) => {
                    if let Some(log_path) = &self.log_path {
                        let _ = append_log(
                            log_path,
                            "WARN",
                            &format!(
                                "stream proxy upstream {} ended with error: {}",
                                self.host,
                                describe_io_error(&err)
                            ),
                        );
                    }
                    return Ok(0);
                }
                result => return result,
            }
        }
    }
}

/// Describes a reqwest error without its URL (Xtream URLs embed credentials).
fn describe_upstream_error(err: &reqwest::Error) -> String {
    let kind = if err.is_timeout() {
        "timed out"
    } else if err.is_connect() {
        "connection failed"
    } else if err.is_redirect() {
        "too many redirects"
    } else {
        "request error"
    };
    match innermost_source(err) {
        Some(detail) => format!("{kind} ({detail})"),
        None => kind.to_string(),
    }
}

fn describe_io_error(err: &io::Error) -> String {
    let Some(inner) = err.get_ref() else {
        return err.kind().to_string();
    };
    if let Some(reqwest_err) = inner.downcast_ref::<reqwest::Error>() {
        return describe_upstream_error(reqwest_err);
    }
    match innermost_source(inner) {
        Some(detail) => format!("{} ({detail})", err.kind()),
        None => err.kind().to_string(),
    }
}

/// Display of the deepest error in the chain (transport-level detail such as
/// "connection refused"); never the top-level reqwest error, which carries the URL.
fn innermost_source(err: &(dyn Error + 'static)) -> Option<String> {
    let mut source = err.source()?;
    while let Some(next) = source.source() {
        source = next;
    }
    Some(source.to_string())
}

fn preflight_response(request: &Request) -> ResponseBox {
    let allow_headers = request_header(request, "Access-Control-Request-Headers")
        .filter(|value| !value.trim().is_empty())
        .and_then(|value| Header::from_bytes("Access-Control-Allow-Headers", value).ok())
        .unwrap_or_else(|| header("Access-Control-Allow-Headers", "*"));
    let mut headers = cors_headers();
    headers.extend([
        header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS"),
        allow_headers,
        header("Access-Control-Allow-Private-Network", "true"),
        header("Access-Control-Max-Age", "600"),
    ]);
    build_response(204, headers, Box::new(io::empty()), Some(0))
}

fn text_response(status: u16, body: &str) -> ResponseBox {
    let mut headers = cors_headers();
    headers.push(header("Content-Type", "text/plain; charset=utf-8"));
    let bytes = body.as_bytes().to_vec();
    let length = bytes.len();
    build_response(status, headers, Box::new(Cursor::new(bytes)), Some(length))
}

fn build_response(
    status: u16,
    headers: Vec<Header>,
    body: Box<dyn Read + Send>,
    length: Option<usize>,
) -> ResponseBox {
    // tiny_http switches to chunked encoding above 32 KiB by default, which would
    // drop Content-Length for media files; keep it whenever the length is known.
    ResponseBox::new(StatusCode(status), headers, body, length, None)
        .with_chunked_threshold(usize::MAX)
}

fn cors_headers() -> Vec<Header> {
    vec![
        header("Access-Control-Allow-Origin", "*"),
        header("Access-Control-Expose-Headers", EXPOSED_HEADERS),
    ]
}

/// Builds a header from ASCII literals (only ever called with constants).
fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes())
        .unwrap_or_else(|_| panic!("invalid static header {name}"))
}

fn request_header<'a>(request: &'a Request, name: &'static str) -> Option<&'a str> {
    request
        .headers()
        .iter()
        .find(|candidate| candidate.field.equiv(name))
        .map(|candidate| candidate.value.as_str())
}
