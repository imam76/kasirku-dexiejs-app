const FEEDBACK_API_URL: &str = "https://www.frayukti.site/api/feedback";
const MAX_FEEDBACK_LENGTH: usize = 20_000;

#[tauri::command]
pub async fn submit_feedback(text: String) -> Result<(), String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("Feedback message is empty.".to_string());
    }
    if trimmed.len() > MAX_FEEDBACK_LENGTH {
        return Err("Feedback message is too long.".to_string());
    }

    let response = reqwest::Client::new()
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
