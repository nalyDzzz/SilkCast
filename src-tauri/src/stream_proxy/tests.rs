use super::*;
use reqwest::blocking::Client as TestClient;
use std::io::Write;
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Mutex;
use std::time::Instant;

const RANGE_FILE: &[u8] = b"0123456789abcdef";
const MEDIA_PLAYLIST: &str = "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4.0,\nseg1.ts\n";

#[derive(Debug, Clone)]
struct RecordedRequest {
    method: String,
    path: String,
    headers: Vec<(String, String)>,
}

impl RecordedRequest {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }
}

/// Minimal upstream HTTP/1.1 server; one thread per connection, `Connection: close`.
struct TestUpstream {
    origin: String,
    requests: Arc<Mutex<Vec<RecordedRequest>>>,
    events: Receiver<&'static str>,
}

impl TestUpstream {
    fn spawn() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("upstream should bind");
        let origin = format!("http://{}", listener.local_addr().unwrap());
        let requests = Arc::new(Mutex::new(Vec::new()));
        let (events_tx, events) = mpsc::channel();

        let recorded = Arc::clone(&requests);
        thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(stream) = stream else { break };
                let recorded = Arc::clone(&recorded);
                let events_tx = events_tx.clone();
                thread::spawn(move || serve_upstream_connection(stream, &recorded, &events_tx));
            }
        });

        Self {
            origin,
            requests,
            events,
        }
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.origin, path)
    }

    fn requests(&self) -> Vec<RecordedRequest> {
        self.requests.lock().unwrap().clone()
    }

    fn request_count(&self, path: &str) -> usize {
        self.requests()
            .iter()
            .filter(|request| request.path == path)
            .count()
    }
}

fn serve_upstream_connection(
    mut stream: TcpStream,
    recorded: &Mutex<Vec<RecordedRequest>>,
    events: &Sender<&'static str>,
) {
    let Some(request) = read_request_head(&mut stream) else {
        return;
    };
    recorded.lock().unwrap().push(request.clone());

    let is_head = request.method == "HEAD";
    let route = request.path.split('?').next().unwrap_or_default();
    match route {
        "/live/a.m3u8" => write_response(
            &mut stream,
            "302 Found",
            &[("Location", "/hls/x/index.m3u8")],
            b"",
            is_head,
        ),
        // Dispatcharr answers playlist URLs by redirecting to a raw MPEG-TS stream.
        "/dispatch/live.m3u8" => write_response(
            &mut stream,
            "302 Found",
            &[("Location", "/endless")],
            b"",
            is_head,
        ),
        "/hls/x/index.m3u8" => write_response(
            &mut stream,
            "200 OK",
            &[("Content-Type", "application/vnd.apple.mpegurl")],
            MEDIA_PLAYLIST.as_bytes(),
            is_head,
        ),
        "/hls/x/plain.m3u8" => write_response(
            &mut stream,
            "200 OK",
            &[("Content-Type", "text/plain")],
            MEDIA_PLAYLIST.as_bytes(),
            is_head,
        ),
        "/files/data.bin" => serve_range_file(&mut stream, &request, is_head),
        "/forbidden" => write_response(
            &mut stream,
            "403 Forbidden",
            &[("Content-Type", "text/plain")],
            b"nope",
            is_head,
        ),
        "/slow" => {
            // 12 KiB over ~2.4s: longer than the 1s idle timeout used by the test.
            let _ = write_stream_head(&mut stream);
            for _ in 0..12 {
                thread::sleep(Duration::from_millis(200));
                if stream.write_all(&[0x47; 1024]).is_err() {
                    return;
                }
            }
        }
        "/stall" => {
            let _ = write_stream_head(&mut stream);
            let _ = stream.write_all(&[0x47; 1024]);
            thread::sleep(Duration::from_secs(20));
        }
        "/endless" => {
            let _ = write_stream_head(&mut stream);
            let chunk = vec![0x47u8; 16 * 1024];
            let started = Instant::now();
            while started.elapsed() < Duration::from_secs(30) {
                if stream.write_all(&chunk).is_err() {
                    let _ = events.send("endless upstream closed");
                    return;
                }
                thread::sleep(Duration::from_millis(5));
            }
        }
        _ => write_response(&mut stream, "404 Not Found", &[], b"missing", is_head),
    }
}

fn serve_range_file(stream: &mut TcpStream, request: &RecordedRequest, is_head: bool) {
    let total = RANGE_FILE.len();
    let range = request
        .header("Range")
        .and_then(|value| value.strip_prefix("bytes="))
        .and_then(|spec| spec.split_once('-'))
        .and_then(|(start, end)| {
            let start: usize = start.parse().ok()?;
            let end: usize = if end.is_empty() {
                total - 1
            } else {
                end.parse().ok()?
            };
            (start <= end && end < total).then_some((start, end))
        });

    match range {
        Some((start, end)) => write_response(
            stream,
            "206 Partial Content",
            &[
                ("Content-Type", "application/octet-stream"),
                ("Accept-Ranges", "bytes"),
                ("Content-Range", &format!("bytes {start}-{end}/{total}")),
            ],
            &RANGE_FILE[start..=end],
            is_head,
        ),
        None => write_response(
            stream,
            "200 OK",
            &[
                ("Content-Type", "application/octet-stream"),
                ("Accept-Ranges", "bytes"),
            ],
            RANGE_FILE,
            is_head,
        ),
    }
}

fn read_request_head(stream: &mut TcpStream) -> Option<RecordedRequest> {
    let mut buffer = Vec::new();
    let mut chunk = [0u8; 1024];
    while !buffer.windows(4).any(|window| window == b"\r\n\r\n") {
        let read = stream.read(&mut chunk).ok()?;
        if read == 0 || buffer.len() > 64 * 1024 {
            return None;
        }
        buffer.extend_from_slice(&chunk[..read]);
    }

    let head = String::from_utf8_lossy(&buffer).to_string();
    let mut lines = head.split("\r\n");
    let mut request_line = lines.next()?.split_whitespace();
    let method = request_line.next()?.to_string();
    let path = request_line.next()?.to_string();
    let headers = lines
        .filter_map(|line| line.split_once(':'))
        .map(|(key, value)| (key.trim().to_string(), value.trim().to_string()))
        .collect();
    Some(RecordedRequest {
        method,
        path,
        headers,
    })
}

fn write_response(
    stream: &mut TcpStream,
    status: &str,
    headers: &[(&str, &str)],
    body: &[u8],
    is_head: bool,
) {
    let mut head = format!("HTTP/1.1 {status}\r\n");
    for (name, value) in headers {
        head.push_str(&format!("{name}: {value}\r\n"));
    }
    head.push_str(&format!(
        "Content-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    ));
    let _ = stream.write_all(head.as_bytes());
    if !is_head {
        let _ = stream.write_all(body);
    }
}

/// Close-delimited body, like a live MPEG-TS stream.
fn write_stream_head(stream: &mut TcpStream) -> io::Result<()> {
    stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: video/mp2t\r\nConnection: close\r\n\r\n")
}

/// Mirrors JavaScript's `encodeURIComponent`.
fn encode_uri_component(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'!'
            | b'~'
            | b'*'
            | b'\''
            | b'('
            | b')' => (byte as char).to_string(),
            other => format!("%{other:02X}"),
        })
        .collect()
}

fn proxy_url(proxy: &StreamProxy, target: &str) -> String {
    format!(
        "{}/stream?url={}",
        proxy.base_url(),
        encode_uri_component(target)
    )
}

fn playlist_proxy_url(proxy: &StreamProxy, target: &str) -> String {
    format!("{}&expect=playlist", proxy_url(proxy, target))
}

fn stream_route(url: &str, expect_playlist: bool) -> Route {
    Route::Stream(StreamTarget {
        url: Url::parse(url).unwrap(),
        expect_playlist,
    })
}

fn test_client() -> TestClient {
    TestClient::builder()
        .no_proxy()
        .redirect(Policy::none())
        .timeout(Duration::from_secs(20))
        .build()
        .expect("test client should build")
}

fn response_header<'a>(response: &'a UpstreamResponse, name: &str) -> Option<&'a str> {
    response
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
}

fn decode_proxy_target(proxy: &StreamProxy, proxied: &str) -> String {
    let query = proxied
        .strip_prefix(&format!("{}/stream?", proxy.base_url()))
        .unwrap_or_else(|| panic!("not a proxy URL: {proxied}"));
    form_urlencoded::parse(query.as_bytes())
        .find(|(key, _)| key == "url")
        .map(|(_, value)| value.into_owned())
        .expect("proxy URL should carry a url parameter")
}

#[test]
fn base_url_uses_loopback_port_and_random_token() {
    let first = StreamProxy::start(None).expect("proxy should start");
    let second = StreamProxy::start(None).expect("proxy should start");

    for proxy in [&first, &second] {
        let rest = proxy
            .base_url()
            .strip_prefix("http://127.0.0.1:")
            .expect("base URL should be loopback");
        let (port, token) = rest
            .split_once('/')
            .expect("base URL should contain a token");
        assert!(port.parse::<u16>().is_ok_and(|port| port > 0));
        assert_eq!(token.len(), 32);
        assert!(token.chars().all(|ch| ch.is_ascii_hexdigit()));
    }
    assert_ne!(first.base_url(), second.base_url());
}

#[test]
fn redirected_playlist_is_rewritten_against_final_url() {
    let upstream = TestUpstream::spawn();
    let proxy = StreamProxy::start(None).expect("proxy should start");
    let target = upstream.url("/live/a.m3u8?username=u&password=p+w%2F");

    let response = test_client()
        .get(proxy_url(&proxy, &target))
        .header("Origin", "http://tauri.localhost")
        .send()
        .expect("proxy request should succeed");

    assert_eq!(response.status().as_u16(), 200);
    assert_eq!(
        response_header(&response, "access-control-allow-origin"),
        Some("*")
    );
    assert_eq!(
        response_header(&response, "access-control-expose-headers"),
        Some(EXPOSED_HEADERS)
    );
    assert_eq!(
        response_header(&response, "content-type"),
        Some(HLS_CONTENT_TYPE)
    );
    assert_eq!(
        response_header(&response, "cache-control"),
        Some("no-cache")
    );
    let declared_length: usize = response_header(&response, "content-length")
        .expect("rewritten playlist should have a Content-Length")
        .parse()
        .unwrap();

    let body = response.text().expect("body should be text");
    assert_eq!(body.len(), declared_length);
    assert!(body.starts_with("#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4.0,\n"));
    let segment_line = body
        .lines()
        .find(|line| !line.starts_with('#') && !line.is_empty())
        .expect("playlist should contain a segment line");
    assert_eq!(
        decode_proxy_target(&proxy, segment_line),
        upstream.url("/hls/x/seg1.ts")
    );

    let requests = upstream.requests();
    assert_eq!(requests[0].path, "/live/a.m3u8?username=u&password=p+w%2F");
    assert_eq!(requests[1].path, "/hls/x/index.m3u8");
    for request in &requests {
        assert_eq!(request.header("User-Agent"), Some(STREAM_PROXY_USER_AGENT));
    }
}

#[test]
fn playlist_is_detected_by_signature_when_content_type_is_generic() {
    let upstream = TestUpstream::spawn();
    let proxy = StreamProxy::start(None).expect("proxy should start");

    let response = test_client()
        .get(proxy_url(&proxy, &upstream.url("/hls/x/plain.m3u8")))
        .send()
        .expect("proxy request should succeed");

    assert_eq!(
        response_header(&response, "content-type"),
        Some(HLS_CONTENT_TYPE)
    );
    let body = response.text().unwrap();
    let segment_line = body.lines().nth(3).expect("segment line");
    assert_eq!(
        decode_proxy_target(&proxy, segment_line),
        upstream.url("/hls/x/seg1.ts")
    );
}

#[test]
fn range_requests_pass_through_as_partial_content() {
    let upstream = TestUpstream::spawn();
    let proxy = StreamProxy::start(None).expect("proxy should start");

    let response = test_client()
        .get(proxy_url(&proxy, &upstream.url("/files/data.bin")))
        .header("Range", "bytes=0-3")
        .send()
        .expect("proxy request should succeed");

    assert_eq!(response.status().as_u16(), 206);
    assert_eq!(
        response_header(&response, "access-control-allow-origin"),
        Some("*")
    );
    assert_eq!(
        response_header(&response, "content-range"),
        Some("bytes 0-3/16")
    );
    assert_eq!(response_header(&response, "accept-ranges"), Some("bytes"));
    assert_eq!(response_header(&response, "content-length"), Some("4"));
    assert_eq!(response.bytes().unwrap().as_ref(), b"0123");

    let upstream_request = &upstream.requests()[0];
    assert_eq!(upstream_request.header("Range"), Some("bytes=0-3"));
    assert_eq!(upstream_request.header("Accept-Encoding"), Some("identity"));
}

#[test]
fn full_binary_response_keeps_content_length() {
    let upstream = TestUpstream::spawn();
    let proxy = StreamProxy::start(None).expect("proxy should start");

    let response = test_client()
        .get(proxy_url(&proxy, &upstream.url("/files/data.bin")))
        .send()
        .expect("proxy request should succeed");

    assert_eq!(response.status().as_u16(), 200);
    assert_eq!(response_header(&response, "content-length"), Some("16"));
    assert_eq!(response.bytes().unwrap().as_ref(), RANGE_FILE);
}

#[test]
fn head_requests_return_headers_without_body() {
    let upstream = TestUpstream::spawn();
    let proxy = StreamProxy::start(None).expect("proxy should start");

    let response = test_client()
        .head(proxy_url(&proxy, &upstream.url("/files/data.bin")))
        .send()
        .expect("proxy request should succeed");

    assert_eq!(response.status().as_u16(), 200);
    assert_eq!(response_header(&response, "content-length"), Some("16"));
    assert_eq!(
        response_header(&response, "access-control-allow-origin"),
        Some("*")
    );
    assert_eq!(upstream.requests()[0].method, "HEAD");
}

#[test]
fn upstream_error_statuses_are_not_masked() {
    let upstream = TestUpstream::spawn();
    let proxy = StreamProxy::start(None).expect("proxy should start");

    let response = test_client()
        .get(proxy_url(&proxy, &upstream.url("/forbidden")))
        .send()
        .expect("proxy request should succeed");

    assert_eq!(response.status().as_u16(), 403);
    assert_eq!(
        response_header(&response, "access-control-allow-origin"),
        Some("*")
    );
    assert_eq!(response.text().unwrap(), "nope");
}

#[test]
fn unreachable_upstream_returns_bad_gateway() {
    let closed_port = {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.local_addr().unwrap().port()
    };
    let proxy = StreamProxy::start(None).expect("proxy should start");

    let response = test_client()
        .get(proxy_url(
            &proxy,
            &format!("http://127.0.0.1:{closed_port}/live/user/pass/1.ts"),
        ))
        .send()
        .expect("proxy request should succeed");

    assert_eq!(response.status().as_u16(), 502);
    assert_eq!(
        response_header(&response, "access-control-allow-origin"),
        Some("*")
    );
    let body = response.text().unwrap();
    assert!(body.starts_with("upstream request failed"), "{body}");
    assert!(!body.contains("/live/user/pass"), "{body}");
}

#[test]
fn unknown_paths_and_bad_tokens_return_not_found() {
    let upstream = TestUpstream::spawn();
    let proxy = StreamProxy::start(None).expect("proxy should start");
    let client = test_client();
    let origin = proxy.base_url().rsplit_once('/').unwrap().0.to_string();
    let encoded_target = encode_uri_component(&upstream.url("/files/data.bin"));

    let bad_token = client
        .get(format!(
            "{origin}/00000000000000000000000000000000/stream?url={encoded_target}"
        ))
        .send()
        .unwrap();
    assert_eq!(bad_token.status().as_u16(), 404);
    assert_eq!(
        response_header(&bad_token, "access-control-allow-origin"),
        Some("*")
    );

    let wrong_path = client
        .get(format!("{}/other?url={encoded_target}", proxy.base_url()))
        .send()
        .unwrap();
    assert_eq!(wrong_path.status().as_u16(), 404);

    let wrong_method = client
        .post(proxy_url(&proxy, &upstream.url("/files/data.bin")))
        .send()
        .unwrap();
    assert_eq!(wrong_method.status().as_u16(), 404);

    assert!(
        upstream.requests().is_empty(),
        "rejected requests must not reach upstream"
    );
}

#[test]
fn invalid_targets_return_bad_request() {
    let proxy = StreamProxy::start(None).expect("proxy should start");
    let client = test_client();

    let non_http = client
        .get(proxy_url(&proxy, "file:///C:/Windows/win.ini"))
        .send()
        .unwrap();
    assert_eq!(non_http.status().as_u16(), 400);
    assert_eq!(
        response_header(&non_http, "access-control-allow-origin"),
        Some("*")
    );

    let missing = client
        .get(format!("{}/stream", proxy.base_url()))
        .send()
        .unwrap();
    assert_eq!(missing.status().as_u16(), 400);
}

#[test]
fn options_preflight_returns_cors_headers() {
    let proxy = StreamProxy::start(None).expect("proxy should start");

    let response = test_client()
        .request(
            reqwest::Method::OPTIONS,
            proxy_url(&proxy, "http://provider.example/live/1.ts"),
        )
        .header("Origin", "http://tauri.localhost")
        .header("Access-Control-Request-Method", "GET")
        .header("Access-Control-Request-Headers", "range")
        .header("Access-Control-Request-Private-Network", "true")
        .send()
        .expect("preflight should succeed");

    assert!(response.status().is_success());
    assert_eq!(
        response_header(&response, "access-control-allow-origin"),
        Some("*")
    );
    assert_eq!(
        response_header(&response, "access-control-allow-methods"),
        Some("GET, HEAD, OPTIONS")
    );
    assert_eq!(
        response_header(&response, "access-control-allow-headers"),
        Some("range")
    );
    assert_eq!(
        response_header(&response, "access-control-allow-private-network"),
        Some("true")
    );
    assert_eq!(
        response_header(&response, "access-control-max-age"),
        Some("600")
    );
    assert_eq!(
        response_header(&response, "access-control-expose-headers"),
        Some(EXPOSED_HEADERS)
    );
}

#[test]
fn slow_live_stream_outlasts_idle_timeout() {
    let upstream = TestUpstream::spawn();
    let proxy = StreamProxy::start_with_timeouts(None, Duration::from_secs(1), PARKED_STREAM_TTL)
        .expect("proxy should start");

    let started = Instant::now();
    let body = test_client()
        .get(proxy_url(&proxy, &upstream.url("/slow")))
        .send()
        .expect("proxy request should succeed")
        .bytes()
        .expect("body should stream to completion");

    assert_eq!(body.len(), 12 * 1024);
    assert!(started.elapsed() >= Duration::from_secs(2));
}

#[test]
fn stalled_upstream_ends_response_after_idle_timeout() {
    let upstream = TestUpstream::spawn();
    let proxy = StreamProxy::start_with_timeouts(None, Duration::from_secs(1), PARKED_STREAM_TTL)
        .expect("proxy should start");

    let started = Instant::now();
    let body = test_client()
        .get(proxy_url(&proxy, &upstream.url("/stall")))
        .send()
        .expect("proxy request should succeed")
        .bytes()
        .expect("body should end cleanly");

    assert_eq!(body.len(), 1024);
    assert!(started.elapsed() < Duration::from_secs(10));
}

#[test]
fn client_disconnect_closes_upstream_stream() {
    let upstream = TestUpstream::spawn();
    let proxy = StreamProxy::start(None).expect("proxy should start");

    let mut response = test_client()
        .get(proxy_url(&proxy, &upstream.url("/endless")))
        .send()
        .expect("proxy request should succeed");
    assert_eq!(response.status().as_u16(), 200);
    assert_eq!(
        response_header(&response, "content-type"),
        Some("video/mp2t")
    );
    let mut buffer = vec![0u8; 256 * 1024];
    response
        .read_exact(&mut buffer)
        .expect("live data should flow");
    drop(response);

    let event = upstream
        .events
        .recv_timeout(Duration::from_secs(15))
        .expect("upstream connection should close after the client disconnects");
    assert_eq!(event, "endless upstream closed");
}

#[test]
fn route_request_requires_token_and_http_target() {
    let token = "abc123";
    let target = encode_uri_component("http://provider.example/live/1.m3u8?a=1&b=2");

    assert_eq!(
        route_request(&Method::Get, &format!("/abc123/stream?url={target}"), token),
        stream_route("http://provider.example/live/1.m3u8?a=1&b=2", false)
    );
    assert_eq!(
        route_request(&Method::Options, "/abc123/stream", token),
        Route::Preflight
    );
    assert_eq!(
        route_request(&Method::Get, &format!("/abc124/stream?url={target}"), token),
        Route::NotFound
    );
    assert_eq!(
        route_request(
            &Method::Get,
            &format!("/abc123/streams?url={target}"),
            token
        ),
        Route::NotFound
    );
    assert_eq!(
        route_request(&Method::Put, &format!("/abc123/stream?url={target}"), token),
        Route::NotFound
    );
    assert!(matches!(
        route_request(&Method::Get, "/abc123/stream?url=ftp%3A%2F%2Fx%2Fy", token),
        Route::BadRequest(_)
    ));
    assert!(matches!(
        route_request(&Method::Get, "/abc123/stream?url=not%20a%20url", token),
        Route::BadRequest(_)
    ));
}

#[test]
fn route_request_forwards_ll_hls_delivery_directives() {
    let target = encode_uri_component("https://provider.example/hls/index.m3u8?token=t");
    let route = route_request(
        &Method::Get,
        &format!("/tok/stream?url={target}&_HLS_msn=12&_HLS_part=1&other=x"),
        "tok",
    );
    assert_eq!(
        route,
        stream_route(
            "https://provider.example/hls/index.m3u8?token=t&_HLS_msn=12&_HLS_part=1",
            false
        )
    );
}

#[test]
fn route_request_reads_the_playlist_expectation() {
    let target = encode_uri_component("https://provider.example/live/1.m3u8");
    assert_eq!(
        route_request(
            &Method::Get,
            &format!("/tok/stream?url={target}&expect=playlist"),
            "tok"
        ),
        stream_route("https://provider.example/live/1.m3u8", true)
    );
    assert_eq!(
        route_request(
            &Method::Get,
            &format!("/tok/stream?url={target}&expect=other"),
            "tok"
        ),
        stream_route("https://provider.example/live/1.m3u8", false)
    );
}

#[test]
fn expected_playlist_is_still_rewritten() {
    let upstream = TestUpstream::spawn();
    let proxy = StreamProxy::start(None).expect("proxy should start");

    let response = test_client()
        .get(playlist_proxy_url(&proxy, &upstream.url("/live/a.m3u8")))
        .send()
        .expect("proxy request should succeed");

    assert_eq!(response.status().as_u16(), 200);
    assert_eq!(
        response_header(&response, "content-type"),
        Some(HLS_CONTENT_TYPE)
    );
    assert!(response.text().unwrap().starts_with("#EXTM3U"));
}

#[test]
fn media_behind_a_playlist_url_is_refused_then_handed_over() {
    let upstream = TestUpstream::spawn();
    let proxy = StreamProxy::start(None).expect("proxy should start");
    let target = upstream.url("/dispatch/live.m3u8");

    let refused = test_client()
        .get(playlist_proxy_url(&proxy, &target))
        .send()
        .expect("proxy request should succeed");
    assert_eq!(refused.status().as_u16(), NOT_A_PLAYLIST_STATUS);
    assert_eq!(
        response_header(&refused, "access-control-allow-origin"),
        Some("*")
    );

    let mut response = test_client()
        .get(proxy_url(&proxy, &target))
        .send()
        .expect("proxy request should succeed");
    assert_eq!(response.status().as_u16(), 200);
    assert_eq!(
        response_header(&response, "content-type"),
        Some("video/mp2t")
    );
    let mut buffer = vec![0u8; 64 * 1024];
    response
        .read_exact(&mut buffer)
        .expect("the parked stream should flow, sniffed bytes included");
    assert!(buffer.iter().all(|byte| *byte == 0x47));

    // One upstream connection served both requests.
    assert_eq!(upstream.request_count("/dispatch/live.m3u8"), 1);
    assert_eq!(upstream.request_count("/endless"), 1);
}

#[test]
fn unclaimed_parked_stream_closes_after_its_ttl() {
    let upstream = TestUpstream::spawn();
    let proxy =
        StreamProxy::start_with_timeouts(None, UPSTREAM_IDLE_TIMEOUT, Duration::from_secs(1))
            .expect("proxy should start");

    let refused = test_client()
        .get(playlist_proxy_url(
            &proxy,
            &upstream.url("/dispatch/live.m3u8"),
        ))
        .send()
        .expect("proxy request should succeed");
    assert_eq!(refused.status().as_u16(), NOT_A_PLAYLIST_STATUS);

    assert!(
        upstream
            .events
            .recv_timeout(Duration::from_millis(400))
            .is_err(),
        "the stream should stay open while parked"
    );
    let event = upstream
        .events
        .recv_timeout(Duration::from_secs(15))
        .expect("the parked stream should close once its TTL passes");
    assert_eq!(event, "endless upstream closed");
}

#[test]
fn request_for_another_stream_closes_the_parked_one() {
    let upstream = TestUpstream::spawn();
    let proxy =
        StreamProxy::start_with_timeouts(None, UPSTREAM_IDLE_TIMEOUT, Duration::from_secs(60))
            .expect("proxy should start");

    let refused = test_client()
        .get(playlist_proxy_url(
            &proxy,
            &upstream.url("/dispatch/live.m3u8"),
        ))
        .send()
        .expect("proxy request should succeed");
    assert_eq!(refused.status().as_u16(), NOT_A_PLAYLIST_STATUS);

    let other = test_client()
        .get(proxy_url(&proxy, &upstream.url("/files/data.bin")))
        .send()
        .expect("proxy request should succeed");
    assert_eq!(other.bytes().unwrap().as_ref(), RANGE_FILE);

    let event = upstream
        .events
        .recv_timeout(Duration::from_secs(15))
        .expect("the parked stream should close when the player moves on");
    assert_eq!(event, "endless upstream closed");
}
