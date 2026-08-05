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
    /// Cara data dikirim ke printer: `serial`, `usb-printer` (character device
    /// `/dev/usb/lp*` di Linux), `spooler` (Windows print spooler RAW), atau
    /// `bluetooth` (COM port SPP hasil pairing).
    transport: String,
    /// `false` untuk port yang terdaftar tapi belum siap dipakai — misalnya COM
    /// port Bluetooth yang printernya sedang mati.
    is_available: bool,
}

const TRANSPORT_SERIAL: &str = "serial";
const TRANSPORT_USB_PRINTER: &str = "usb-printer";
const TRANSPORT_SPOOLER: &str = "spooler";
const TRANSPORT_BLUETOOTH: &str = "bluetooth";

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
                transport: TRANSPORT_SERIAL.to_string(),
                is_available: true,
            }
        }
        _ => UsbSerialPrinterDevice {
            name: format!("Serial Port ({})", info.port_name),
            usb_id: info.port_name.clone(),
            port_name: info.port_name,
            manufacturer: None,
            serial_number: None,
            is_usb: false,
            transport: TRANSPORT_SERIAL.to_string(),
            is_available: true,
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
                transport: TRANSPORT_USB_PRINTER.to_string(),
                is_available: true,
            })
        })
        .collect()
}

#[cfg(not(target_os = "linux"))]
fn list_linux_usb_printer_devices() -> Vec<UsbSerialPrinterDevice> {
    Vec::new()
}

/// Padanan Windows dari `/dev/usb/lp*`: printer thermal USB di Windows di-bind ke
/// `usbprint.sys` dan hanya terlihat sebagai printer spooler pada port `USB001`,
/// sehingga tidak pernah muncul di `serialport::available_ports()`.
#[cfg(target_os = "windows")]
fn list_windows_spooler_devices() -> Vec<UsbSerialPrinterDevice> {
    let Ok(printers) = crate::windows_printer::list_spooler_printers() else {
        return Vec::new();
    };

    printers
        .into_iter()
        .map(|printer| {
            let is_usb = printer.is_usb_port();
            UsbSerialPrinterDevice {
                name: printer.name.clone(),
                port_name: format!(
                    "{}{}",
                    crate::windows_printer::SPOOLER_PORT_PREFIX,
                    printer.name
                ),
                usb_id: printer.port.clone(),
                manufacturer: None,
                serial_number: None,
                is_usb,
                transport: TRANSPORT_SPOOLER.to_string(),
                is_available: true,
            }
        })
        .collect()
}

#[cfg(not(target_os = "windows"))]
fn list_windows_spooler_devices() -> Vec<UsbSerialPrinterDevice> {
    Vec::new()
}

/// COM port Bluetooth SPP hasil pairing tetap terdaftar walau printer sedang
/// mati, tapi membawa CM problem code sehingga dibuang `serialport`. Di sini port
/// tersebut diambil langsung dari SetupAPI supaya tetap bisa dipilih kasir.
#[cfg(target_os = "windows")]
fn list_windows_bluetooth_devices() -> Vec<UsbSerialPrinterDevice> {
    crate::windows_printer::list_serial_class_ports()
        .into_iter()
        .filter(|port| port.is_bluetooth())
        .map(|port| {
            let name = if port.friendly_name.is_empty() {
                format!("Bluetooth Printer ({})", port.port_name)
            } else {
                port.friendly_name.clone()
            };

            UsbSerialPrinterDevice {
                name,
                usb_id: port.port_name.clone(),
                port_name: port.port_name.clone(),
                manufacturer: None,
                serial_number: None,
                is_usb: false,
                transport: TRANSPORT_BLUETOOTH.to_string(),
                is_available: port.is_available(),
            }
        })
        .collect()
}

#[cfg(not(target_os = "windows"))]
fn list_windows_bluetooth_devices() -> Vec<UsbSerialPrinterDevice> {
    Vec::new()
}

/// Urutan tampil: printer yang siap cetak lebih dulu, lalu Bluetooth, lalu port
/// serial biasa.
fn transport_rank(device: &UsbSerialPrinterDevice) -> u8 {
    match device.transport.as_str() {
        TRANSPORT_USB_PRINTER => 0,
        TRANSPORT_SPOOLER if device.is_usb => 0,
        TRANSPORT_SPOOLER => 3,
        TRANSPORT_BLUETOOTH => 1,
        _ if device.is_usb => 2,
        _ => 3,
    }
}

/// Kumpulkan seluruh device printer dari semua transport yang tersedia di
/// platform ini, tanpa duplikat `port_name`.
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn collect_devices() -> Result<Vec<UsbSerialPrinterDevice>, UsbSerialPrinterError> {
    let mut devices: Vec<UsbSerialPrinterDevice> = serialport::available_ports()
        .map_err(normalize_serial_error)?
        .into_iter()
        .map(device_from_port)
        .collect();

    let mut seen_ports: std::collections::HashSet<String> = devices
        .iter()
        .map(|device| device.port_name.clone())
        .collect();

    for device in list_linux_usb_printer_devices()
        .into_iter()
        .chain(list_windows_spooler_devices())
    {
        if seen_ports.insert(device.port_name.clone()) {
            devices.push(device);
        }
    }

    // COM port Bluetooth yang sedang terhubung sudah ikut terbawa `serialport`,
    // tapi tanpa identitas Bluetooth-nya. Timpa entri itu supaya kasir tahu ini
    // printer Bluetooth, bukan sekadar "Serial Port (COM5)".
    for device in list_windows_bluetooth_devices() {
        match devices
            .iter_mut()
            .find(|existing| existing.port_name == device.port_name)
        {
            Some(existing) => *existing = device,
            None => devices.push(device),
        }
    }

    devices.sort_by(|left, right| {
        transport_rank(left)
            .cmp(&transport_rank(right))
            .then_with(|| right.is_available.cmp(&left.is_available))
            .then_with(|| left.port_name.cmp(&right.port_name))
    });

    Ok(devices)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn find_selected_port(printer: &SelectedUsbPrinter) -> Result<String, UsbSerialPrinterError> {
    if let Some(port_name) = printer.port_name.as_ref().filter(|value| !value.is_empty()) {
        return Ok(port_name.clone());
    }

    let devices = collect_devices()?;
    let selected_usb_id = printer.usb_id.to_lowercase();

    devices
        .iter()
        .find(|device| device.usb_id.to_lowercase() == selected_usb_id)
        .or_else(|| {
            devices
                .iter()
                .find(|device| device.port_name == printer.usb_id)
        })
        .map(|device| device.port_name.clone())
        .ok_or_else(|| {
            UsbSerialPrinterError::new(
                "PRINTER_NOT_SELECTED",
                "Port printer USB tersimpan tidak ditemukan. Muat ulang daftar port lalu pilih printer lagi.",
            )
        })
}

/// Error dari winspool tidak terpetakan ke `std::io::ErrorKind` yang berarti,
/// jadi kode Win32-nya diterjemahkan sendiri agar kasir dapat instruksi konkret.
#[cfg(target_os = "windows")]
fn normalize_spooler_error(printer_name: &str, error: std::io::Error) -> UsbSerialPrinterError {
    const ERROR_ACCESS_DENIED: i32 = 5;
    const ERROR_INVALID_PRINTER_NAME: i32 = 1801;
    const ERROR_PRINTER_DELETED: i32 = 1905;

    match error.raw_os_error() {
        Some(ERROR_INVALID_PRINTER_NAME) | Some(ERROR_PRINTER_DELETED) => {
            UsbSerialPrinterError::new(
                "PRINTER_NOT_SELECTED",
                format!(
                    "Printer \"{printer_name}\" tidak ada lagi di Windows. Cek Settings › Printers & scanners, lalu muat ulang daftar printer."
                ),
            )
        }
        Some(ERROR_ACCESS_DENIED) => UsbSerialPrinterError::new(
            "PERMISSION_DENIED",
            format!(
                "Tidak punya izin mencetak ke \"{printer_name}\". Pastikan user Windows ini boleh memakai printer tersebut."
            ),
        ),
        _ => UsbSerialPrinterError::new(
            "WRITE_FAILED",
            format!("Gagal mengirim data ke printer \"{printer_name}\": {error}"),
        ),
    }
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

    // Printer thermal USB di Windows tidak punya COM port; datanya harus dikirim
    // sebagai job RAW lewat print spooler.
    #[cfg(target_os = "windows")]
    if let Some(printer_name) =
        port_name.strip_prefix(crate::windows_printer::SPOOLER_PORT_PREFIX)
    {
        return crate::windows_printer::print_raw(printer_name, &data).map_err(|error| {
            normalize_spooler_error(printer_name, error)
        });
    }

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
        collect_devices()
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
