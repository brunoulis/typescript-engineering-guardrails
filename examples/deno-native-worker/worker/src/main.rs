use serde::Deserialize;
use serde_json::{Value, json};
use std::io::{self, Read, Write};

const MAX_REQUEST_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    version: u8,
    input: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Input {
    session_id: String,
    samples: Vec<f64>,
    max_lag: usize,
}

fn validate(input: &Input) -> bool {
    let n = input.samples.len();
    // Match JavaScript string.length (UTF-16 code units), including astral characters.
    let id_len = input.session_id.encode_utf16().count();
    (1..=128).contains(&id_len)
        && (2..=100000).contains(&n)
        && (1..=64.min(n - 1)).contains(&input.max_lag)
        && input
            .samples
            .iter()
            .all(|sample| sample.is_finite() && sample.abs() <= 1e6)
}

fn correlations(input: &Input) -> Vec<f64> {
    (1..=input.max_lag)
        .map(|lag| {
            let count = input.samples.len() - lag;
            let mut sum = 0.0;
            for i in 0..count {
                sum += input.samples[i] * input.samples[i + lag];
            }
            sum / count as f64
        })
        .collect()
}

fn failure(code: &str) -> Value {
    json!({"version":1,"error":code})
}

fn respond(bytes: &[u8]) -> Value {
    let Ok(request) = serde_json::from_slice::<Request>(bytes) else {
        return failure("PROTOCOL");
    };
    if request.version != 1 {
        return failure("PROTOCOL");
    }
    let Ok(input) = serde_json::from_value::<Input>(request.input) else {
        return failure("INVALID_INPUT");
    };
    if !validate(&input) {
        return failure("INVALID_INPUT");
    }
    json!({"version":1,"result":{"sessionId":input.session_id,"correlations":correlations(&input)}})
}

fn main() -> io::Result<()> {
    let mut bytes = Vec::new();
    io::stdin()
        .lock()
        .take(MAX_REQUEST_BYTES + 1)
        .read_to_end(&mut bytes)?;
    let response = if bytes.len() as u64 > MAX_REQUEST_BYTES {
        failure("PROTOCOL")
    } else {
        respond(&bytes)
    };
    let mut output = io::stdout().lock();
    serde_json::to_writer(&mut output, &response)?;
    output.write_all(b"\n")?;
    output.flush()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(samples: Vec<f64>, max_lag: usize) -> Input {
        Input {
            session_id: "session".into(),
            samples,
            max_lag,
        }
    }

    #[test]
    fn golden_and_signed_calculation() {
        assert_eq!(correlations(&input(vec![1.0, 2.0, 3.0], 2)), [4.0, 3.0]);
        assert_eq!(
            correlations(&input(vec![-2.0, 0.0, 2.0, -4.0], 3)),
            [-8.0 / 3.0, -2.0, 8.0]
        );
    }

    #[test]
    fn wire_validates_version_shape_and_domain_separately() {
        use serde_json::json;
        let valid = json!({"version":1,"input":{"sessionId":"wire","samples":[1,2,3],"maxLag":2}});
        assert_eq!(
            respond(valid.to_string().as_bytes()),
            json!({"version":1,"result":{"sessionId":"wire","correlations":[4.0,3.0]}})
        );
        for invalid in [
            json!({"version":2,"input":{}}),
            json!({"version":1,"input":{},"extra":1}),
        ] {
            assert_eq!(
                respond(invalid.to_string().as_bytes()),
                json!({"version":1,"error":"PROTOCOL"})
            );
        }
        for input in [
            json!({}),
            json!({"sessionId":"a","samples":[1,2],"maxLag":1.5}),
            json!({"sessionId":"a","samples":[1,2],"maxLag":1,"executable":"bad"}),
        ] {
            assert_eq!(
                respond(json!({"version":1,"input":input}).to_string().as_bytes()),
                json!({"version":1,"error":"INVALID_INPUT"})
            );
        }
        assert_eq!(
            respond(b"not-json"),
            json!({"version":1,"error":"PROTOCOL"})
        );
    }

    #[test]
    fn rejects_invalid_input_and_accepts_inclusive_limits() {
        assert!(validate(&input(vec![1.0, 2.0], 1)));
        assert!(validate(&input(vec![1e6; 100000], 64)));
        for bad in [
            input(vec![1.0], 1),
            input(vec![1.0; 100001], 1),
            input(vec![f64::NAN, 2.0], 1),
            input(vec![f64::INFINITY, 2.0], 1),
            input(vec![-1000001.0, 2.0], 1),
            input(vec![1.0, 2.0], 0),
            input(vec![1.0, 2.0], 2),
            input(vec![1.0; 66], 65),
        ] {
            assert!(!validate(&bad));
        }
        let mut value = input(vec![1.0, 2.0], 1);
        value.session_id.clear();
        assert!(!validate(&value));
        value.session_id = "x".repeat(129);
        assert!(!validate(&value));
        value.session_id = "😀".repeat(64);
        assert!(validate(&value));
        value.session_id.push('x');
        assert!(!validate(&value));
    }
}
