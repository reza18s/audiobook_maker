use keyring::Entry;

const SERVICE: &str = "audiobook-maker";
const ACCOUNT: &str = "api-token";

fn token_entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_api_token() -> Result<Option<String>, String> {
    match token_entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn save_api_token(token: String) -> Result<(), String> {
    token_entry()?.set_password(&token).map_err(|error| error.to_string())
}

#[tauri::command]
fn clear_api_token() -> Result<(), String> {
    match token_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![load_api_token, save_api_token, clear_api_token])
        .run(tauri::generate_context!())
        .expect("error while running Audiobook Maker");
}
