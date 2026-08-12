const FEEDBACK_API_URL: &str = "https://www.frayukti.site/api/feedback";
const MAX_FEEDBACK_LENGTH: usize = 20_000;
const FEEDBACK_TIMEOUT_SECONDS: u64 = 15;

fn feedback_http_client() -> Result<reqwest::Client, String> {
    // Android's rustls platform verifier needs explicit JNI initialization.
    // A bundled Mozilla root store keeps this command independent from the
    // WebView and Android lifecycle while retaining full certificate checks.
    let root_store = rustls::RootCertStore::from_iter(
        webpki_roots::TLS_SERVER_ROOTS.iter().cloned(),
    );
    let crypto_provider = std::sync::Arc::new(rustls::crypto::aws_lc_rs::default_provider());
    let mut tls_config = rustls::ClientConfig::builder_with_provider(crypto_provider)
        .with_safe_default_protocol_versions()
        .map_err(|error| format!("Failed to initialize TLS protocols: {error}"))?
        .with_root_certificates(root_store)
        .with_no_client_auth();
    tls_config.alpn_protocols = vec![b"http/1.1".to_vec()];

    reqwest::Client::builder()
        .tls_backend_preconfigured(tls_config)
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(FEEDBACK_TIMEOUT_SECONDS))
        .build()
        .map_err(|error| format!("Failed to initialize feedback client: {error}"))
}

#[tauri::command]
pub async fn submit_feedback(text: String) -> Result<(), String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("Feedback message is empty.".to_string());
    }
    if trimmed.len() > MAX_FEEDBACK_LENGTH {
        return Err("Feedback message is too long.".to_string());
    }

    let response = feedback_http_client()?
        .post(FEEDBACK_API_URL)
        .json(&serde_json::json!({ "text": trimmed }))
        .send()
        .await
        .map_err(|error| format!("Failed to reach feedback service: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Feedback service returned HTTP {}.",
            response.status()
        ));
    }

    Ok(())
}
