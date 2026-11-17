// Test-only executable. No fixture switches exist in telemetry-worker.
use serde::Deserialize;
use std::io::{self, BufRead, Write};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    mode: String,
    pid_path: Option<String>,
    response: Option<String>,
}

fn main() -> io::Result<()> {
    let mut line = String::new();
    // Read just the header; hold-input deliberately leaves a large pipe write pending.
    io::stdin().lock().read_line(&mut line)?;
    let request: Request = serde_json::from_str(&line)?;
    if let Some(path) = request.pid_path {
        std::fs::write(path, std::process::id().to_string())?;
    }
    match request.mode.as_str() {
        "hold-input" => std::thread::sleep(std::time::Duration::from_secs(60)),
        "partial-output" => {
            io::stdout().write_all(b"{")?;
            io::stdout().flush()?;
            io::stderr().write_all(b"sensitive partial diagnostic")?;
            io::stderr().flush()?;
            std::thread::sleep(std::time::Duration::from_secs(60));
        }
        "response" => io::stdout().write_all(request.response.unwrap_or_default().as_bytes())?,
        "invalid-utf8" => io::stdout().write_all(&[0xff])?,
        "crash" => {
            eprintln!("sensitive diagnostic");
            std::process::exit(17);
        }
        "close-input" => return Ok(()),
        "oversize" => {
            io::stdout().write_all(&vec![b'x'; 65537])?;
        }
        "stderr" => {
            io::stderr().write_all(&vec![b'e'; 1024 * 1024])?;
            io::stdout().write_all(b"ok")?;
        }
        "echo" => io::stdout().write_all(b"ok")?,
        _ => std::process::exit(18),
    }
    Ok(())
}
