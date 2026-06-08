use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct UsbSerialPrinterError {
    code: String,
    message: String,
}

impl UsbSerialPrinterError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }

    #[cfg(any(target_os = "android", target_os = "ios"))]
    fn unsupported_platform() -> Self {
        Self::new(
            "UNSUPPORTED_PLATFORM",
            "Printer USB serial native hanya tersedia di aplikasi desktop Tauri.",
        )
    }

    fn unknown(message: impl Into<String>) -> Self {
        Self::new("UNKNOWN", message)
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsbSerialPrinterDevice {
    name: String,
    port_name: String,
    usb_id: String,
    manufacturer: Option<String>,
    serial_number: Option<String>,
    is_usb: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectedUsbPrinter {
    name: String,
    usb_id: String,
    baud_rate: u32,
    port_name: Option<String>,
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn normalize_serial_error(error: serialport::Error) -> UsbSerialPrinterError {
    let message = error.to_string();
    let lower = message.to_lowercase();

    if lower.contains("permission") || lower.contains("access is denied") {
        return UsbSerialPrinterError::new(
            "PERMISSION_DENIED",
            format!(
                "{message}. Pastikan user punya akses ke port serial printer atau jalankan dari sesi yang punya permission."
            ),
        );
    }

    if lower.contains("no such file")
        || lower.contains("not found")
        || lower.contains("no device")
        || lower.contains("device not configured")
    {
        return UsbSerialPrinterError::new(
            "PRINTER_NOT_SELECTED",
            "Port printer USB tidak ditemukan. Cabut-pasang printer lalu muat ulang daftar port.",
        );
    }

    UsbSerialPrinterError::unknown(message)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn normalize_io_error(error: std::io::Error) -> UsbSerialPrinterError {
    match error.kind() {
        std::io::ErrorKind::PermissionDenied => UsbSerialPrinterError::new(
            "PERMISSION_DENIED",
            format!(
                "{}. Pastikan user punya akses ke port serial printer.",
                error
            ),
        ),
        std::io::ErrorKind::NotFound => UsbSerialPrinterError::new(
            "PRINTER_NOT_SELECTED",
            "Port printer USB tidak ditemukan. Cabut-pasang printer lalu muat ulang daftar port.",
        ),
        _ => UsbSerialPrinterError::new("WRITE_FAILED", error.to_string()),
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn device_from_port(info: serialport::SerialPortInfo) -> UsbSerialPrinterDevice {
    match info.port_type {
        serialport::SerialPortType::UsbPort(usb) => {
            let usb_id = format!("{:04x}:{:04x}", usb.vid, usb.pid);
            let name = usb
                .product
                .clone()
                .or_else(|| usb.manufacturer.clone())
                .unwrap_or_else(|| format!("USB Serial Printer ({usb_id})"));

            UsbSerialPrinterDevice {
                name,
                port_name: info.port_name,
                usb_id,
                manufacturer: usb.manufacturer,
                serial_number: usb.serial_number,
                is_usb: true,
            }
        }
        _ => UsbSerialPrinterDevice {
            name: format!("Serial Port ({})", info.port_name),
            usb_id: info.port_name.clone(),
            port_name: info.port_name,
            manufacturer: None,
            serial_number: None,
            is_usb: false,
        },
    }
}

#[cfg(target_os = "linux")]
fn list_linux_usb_printer_devices() -> Vec<UsbSerialPrinterDevice> {
    let Ok(entries) = std::fs::read_dir("/dev/usb") else {
        return Vec::new();
    };

    entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let file_name = entry.file_name().to_string_lossy().to_string();
            if !file_name.starts_with("lp") {
                return None;
            }

            let port_name = entry.path().to_string_lossy().to_string();
            Some(UsbSerialPrinterDevice {
                name: format!("USB Printer ({port_name})"),
                usb_id: port_name.clone(),
                port_name,
                manufacturer: None,
                serial_number: None,
                is_usb: true,
            })
        })
        .collect()
}

#[cfg(not(target_os = "linux"))]
fn list_linux_usb_printer_devices() -> Vec<UsbSerialPrinterDevice> {
    Vec::new()
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn find_selected_port(printer: &SelectedUsbPrinter) -> Result<String, UsbSerialPrinterError> {
    if let Some(port_name) = printer.port_name.as_ref().filter(|value| !value.is_empty()) {
        return Ok(port_name.clone());
    }

    let ports = serialport::available_ports().map_err(normalize_serial_error)?;
    let selected_usb_id = printer.usb_id.to_lowercase();

    ports
        .into_iter()
        .find_map(|info| match info.port_type {
            serialport::SerialPortType::UsbPort(usb) => {
                let usb_id = format!("{:04x}:{:04x}", usb.vid, usb.pid);
                if usb_id == selected_usb_id {
                    Some(info.port_name)
                } else {
                    None
                }
            }
            _ if info.port_name == printer.usb_id => Some(info.port_name),
            _ => None,
        })
        .ok_or_else(|| {
            UsbSerialPrinterError::new(
                "PRINTER_NOT_SELECTED",
                "Port printer USB tersimpan tidak ditemukan. Muat ulang daftar port lalu pilih printer lagi.",
            )
        })
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn write_blocking(printer: SelectedUsbPrinter, data: Vec<u8>) -> Result<(), UsbSerialPrinterError> {
    use std::io::Write;
    use std::time::Duration;

    if data.is_empty() {
        return Err(UsbSerialPrinterError::new(
            "WRITE_FAILED",
            "Data print kosong.",
        ));
    }

    let port_name = find_selected_port(&printer)?;
    if port_name.starts_with("/dev/usb/lp") {
        let mut device = std::fs::OpenOptions::new()
            .write(true)
            .open(port_name)
            .map_err(normalize_io_error)?;
        device.write_all(&data).map_err(normalize_io_error)?;
        device.flush().map_err(normalize_io_error)?;
        return Ok(());
    }

    let mut port = serialport::new(port_name, printer.baud_rate)
        .timeout(Duration::from_secs(5))
        .open()
        .map_err(normalize_serial_error)?;

    port.write_all(&data).map_err(normalize_io_error)?;
    port.flush().map_err(normalize_io_error)?;
    Ok(())
}

#[tauri::command]
pub fn list_usb_serial_printers() -> Result<Vec<UsbSerialPrinterDevice>, UsbSerialPrinterError> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let mut devices: Vec<UsbSerialPrinterDevice> = serialport::available_ports()
            .map_err(normalize_serial_error)?
            .into_iter()
            .map(device_from_port)
            .collect();
        let existing_ports: std::collections::HashSet<String> = devices
            .iter()
            .map(|device| device.port_name.clone())
            .collect();
        devices.extend(
            list_linux_usb_printer_devices()
                .into_iter()
                .filter(|device| !existing_ports.contains(&device.port_name)),
        );

        devices.sort_by(|left, right| {
            right
                .is_usb
                .cmp(&left.is_usb)
                .then_with(|| left.port_name.cmp(&right.port_name))
        });

        Ok(devices)
    }

    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        Err(UsbSerialPrinterError::unsupported_platform())
    }
}

#[tauri::command]
pub async fn write_usb_serial_printer(
    printer: SelectedUsbPrinter,
    data: Vec<u8>,
) -> Result<(), UsbSerialPrinterError> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return tauri::async_runtime::spawn_blocking(move || write_blocking(printer, data))
            .await
            .map_err(|error| UsbSerialPrinterError::unknown(error.to_string()))?;
    }

    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = printer;
        let _ = data;
        Err(UsbSerialPrinterError::unsupported_platform())
    }
}
