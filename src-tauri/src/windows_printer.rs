//! Dukungan printer khusus Windows.
//!
//! Ada dua celah yang ditutup modul ini:
//!
//! 1. Printer thermal USB (ESC/POS) di Windows umumnya di-bind ke `usbprint.sys`
//!    dan hanya muncul sebagai printer spooler pada port `USB001`. Device setup
//!    class-nya adalah "Printer", bukan "Ports (COM & LPT)", sehingga
//!    `serialport::available_ports()` — yang hanya meng-enumerate class "Ports"
//!    dan "Modem" — tidak akan pernah melihatnya. Di Linux hal ini tertutup oleh
//!    driver kernel `usblp` lewat `/dev/usb/lp*`; padanan Windows-nya adalah
//!    menulis data RAW ke spooler, yang diimplementasikan di sini.
//!
//! 2. COM port Bluetooth SPP hasil pairing tetap terdaftar walau printer sedang
//!    tidak terhubung, tapi statusnya membawa CM problem code (mis. 24
//!    `CM_PROB_DEVICE_NOT_THERE`). `serialport` membuang device semacam itu, jadi
//!    printer Bluetooth tidak pernah muncul di daftar. Di sini class "Ports"
//!    di-enumerate langsung tanpa `DIGCF_PRESENT` supaya port tersebut ikut
//!    terlihat, lengkap dengan status ketersediaannya.

use std::io::{Error, ErrorKind};

use windows_sys::core::{GUID, PWSTR};
use windows_sys::Win32::Devices::DeviceAndDriverInstallation::{
    CM_Get_DevNode_Status, SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInfo,
    SetupDiGetClassDevsW, SetupDiGetDeviceRegistryPropertyW, SetupDiOpenDevRegKey, CR_SUCCESS,
    DICS_FLAG_GLOBAL, DIREG_DEV, HDEVINFO, SPDRP_FRIENDLYNAME, SPDRP_HARDWAREID, SP_DEVINFO_DATA,
};
use windows_sys::Win32::Graphics::Printing::{
    ClosePrinter, EndDocPrinter, EndPagePrinter, EnumPrintersW, OpenPrinterW, StartDocPrinterW,
    StartPagePrinter, WritePrinter, DOC_INFO_1W, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL,
    PRINTER_HANDLE, PRINTER_INFO_5W,
};
use windows_sys::Win32::System::Registry::{RegCloseKey, RegQueryValueExW, HKEY, KEY_READ};

/// Prefix `port_name` untuk printer yang ditulis lewat Windows print spooler.
/// Dipakai `usb_serial_printer` untuk memilih jalur tulis yang benar, mirip
/// pengecekan `/dev/usb/lp` di Linux.
pub const SPOOLER_PORT_PREFIX: &str = "winspool:";

/// GUID_DEVCLASS_PORTS — {4D36E978-E325-11CE-BFC1-08002BE10318}
const GUID_DEVCLASS_PORTS: GUID = GUID::from_u128(0x4d36e978_e325_11ce_bfc1_08002be10318);

const ERROR_INSUFFICIENT_BUFFER: u32 = 122;
const INVALID_HANDLE: isize = -1;

// ─── Helper string ────────────────────────────────────────────────────────────

fn to_wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Baca string UTF-16 ber-NUL dari pointer yang diberikan Win32.
///
/// # Safety
/// `ptr` harus null atau menunjuk ke buffer UTF-16 yang diakhiri NUL dan masih
/// hidup selama pemanggilan.
unsafe fn string_from_wide_ptr(ptr: *const u16) -> String {
    if ptr.is_null() {
        return String::new();
    }

    let mut len = 0usize;
    while unsafe { *ptr.add(len) } != 0 {
        len += 1;
    }

    String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(ptr, len) })
}

/// Ambil string pertama dari buffer UTF-16 (REG_SZ maupun REG_MULTI_SZ).
fn string_from_wide_buffer(buffer: &[u16]) -> String {
    let end = buffer.iter().position(|c| *c == 0).unwrap_or(buffer.len());
    String::from_utf16_lossy(&buffer[..end])
}

// ─── Print spooler (printer USB kelas printer) ────────────────────────────────

#[derive(Clone, Debug)]
pub struct SpoolerPrinter {
    /// Nama printer sebagaimana terdaftar di Windows.
    pub name: String,
    /// Port spooler, mis. `USB001`, `COM3`, atau `\\host\printer`.
    pub port: String,
}

impl SpoolerPrinter {
    /// True untuk printer yang tersambung lewat port USB (`USB001`, `USB002`, …).
    pub fn is_usb_port(&self) -> bool {
        self.port.to_ascii_uppercase().starts_with("USB")
    }
}

/// Port virtual/driver yang tidak pernah bisa menerima ESC/POS.
fn is_virtual_port(port: &str) -> bool {
    let upper = port.to_ascii_uppercase();
    upper.starts_with("PORTPROMPT")
        || upper.starts_with("NUL")
        || upper.starts_with("SHRFAX")
        || upper.starts_with("XPSPORT")
        || upper.starts_with("FILE:")
        || upper.contains("ONENOTE")
        || upper.contains("PDF")
}

/// Daftar printer yang terpasang di Windows print spooler.
pub fn list_spooler_printers() -> Result<Vec<SpoolerPrinter>, Error> {
    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let level = 5u32;

    let mut needed = 0u32;
    let mut returned = 0u32;

    // Panggilan pertama hanya untuk mengetahui ukuran buffer yang dibutuhkan.
    let ok = unsafe {
        EnumPrintersW(
            flags,
            std::ptr::null(),
            level,
            std::ptr::null_mut(),
            0,
            &mut needed,
            &mut returned,
        )
    };

    if ok == 0 {
        let error = Error::last_os_error();
        if error.raw_os_error() != Some(ERROR_INSUFFICIENT_BUFFER as i32) {
            return Err(error);
        }
    }

    if needed == 0 {
        return Ok(Vec::new());
    }

    // Buffer berisi array PRINTER_INFO_5W diikuti blok string-nya, jadi (a) harus
    // tetap hidup selama pointer di dalamnya dibaca, dan (b) harus selaras untuk
    // PRINTER_INFO_5W — karena itu dialokasikan sebagai u64, bukan u8.
    let mut buffer = vec![0u64; needed.div_ceil(8) as usize];
    let ok = unsafe {
        EnumPrintersW(
            flags,
            std::ptr::null(),
            level,
            buffer.as_mut_ptr() as *mut u8,
            needed,
            &mut needed,
            &mut returned,
        )
    };

    if ok == 0 {
        return Err(Error::last_os_error());
    }

    let mut printers = Vec::with_capacity(returned as usize);
    let entries = buffer.as_ptr() as *const PRINTER_INFO_5W;

    for index in 0..returned as usize {
        let entry = unsafe { &*entries.add(index) };
        let name = unsafe { string_from_wide_ptr(entry.pPrinterName) };
        let port = unsafe { string_from_wide_ptr(entry.pPortName) };

        if name.is_empty() || is_virtual_port(&port) {
            continue;
        }

        printers.push(SpoolerPrinter { name, port });
    }

    Ok(printers)
}

/// Kirim byte ESC/POS apa adanya ke printer spooler memakai datatype `RAW`,
/// sehingga driver printer tidak ikut me-render ulang isinya.
pub fn print_raw(printer_name: &str, data: &[u8]) -> Result<(), Error> {
    if data.is_empty() {
        return Err(Error::new(ErrorKind::InvalidInput, "Data print kosong."));
    }

    let name = to_wide(printer_name);
    let mut handle = PRINTER_HANDLE {
        Value: std::ptr::null_mut(),
    };

    let ok = unsafe { OpenPrinterW(name.as_ptr(), &mut handle, std::ptr::null()) };
    if ok == 0 {
        return Err(Error::last_os_error());
    }

    let mut document_name = to_wide(&format!("Frayukti Receipt ({printer_name})"));
    let result = write_raw_document(handle, &mut document_name, data);

    unsafe { ClosePrinter(handle) };

    result
}

fn write_raw_document(
    handle: PRINTER_HANDLE,
    document_name: &mut [u16],
    data: &[u8],
) -> Result<(), Error> {
    let mut datatype = to_wide("RAW");
    let doc_info = DOC_INFO_1W {
        pDocName: document_name.as_mut_ptr() as PWSTR,
        pOutputFile: std::ptr::null_mut(),
        pDatatype: datatype.as_mut_ptr() as PWSTR,
    };

    let job_id = unsafe { StartDocPrinterW(handle, 1, &doc_info) };
    if job_id == 0 {
        return Err(Error::last_os_error());
    }

    let result = (|| -> Result<(), Error> {
        if unsafe { StartPagePrinter(handle) } == 0 {
            return Err(Error::last_os_error());
        }

        let mut offset = 0usize;
        while offset < data.len() {
            let chunk = &data[offset..];
            let mut written = 0u32;

            let ok = unsafe {
                WritePrinter(
                    handle,
                    chunk.as_ptr() as *const core::ffi::c_void,
                    chunk.len() as u32,
                    &mut written,
                )
            };

            if ok == 0 {
                unsafe { EndPagePrinter(handle) };
                return Err(Error::last_os_error());
            }

            if written == 0 {
                unsafe { EndPagePrinter(handle) };
                return Err(Error::new(
                    ErrorKind::WriteZero,
                    "Spooler berhenti menerima data print.",
                ));
            }

            offset += written as usize;
        }

        if unsafe { EndPagePrinter(handle) } == 0 {
            return Err(Error::last_os_error());
        }

        Ok(())
    })();

    unsafe { EndDocPrinter(handle) };

    result
}

// ─── COM port class "Ports" (termasuk Bluetooth SPP) ──────────────────────────

#[derive(Clone, Debug)]
pub struct ClassPort {
    /// Nama port, mis. `COM5`.
    pub port_name: String,
    /// Nama tampilan dari Device Manager.
    pub friendly_name: String,
    /// Hardware ID, mis. `BTHENUM\{00001101-0000-1000-8000-00805f9b34fb}_...`.
    pub hardware_id: String,
    /// CM problem code; 0 berarti device sehat dan siap dibuka.
    pub problem: u32,
}

impl ClassPort {
    pub fn is_bluetooth(&self) -> bool {
        let hardware_id = self.hardware_id.to_ascii_uppercase();
        hardware_id.starts_with("BTHENUM")
            || hardware_id.starts_with("BTHLE")
            || hardware_id.contains("BTHMODEM")
            || self.friendly_name.to_ascii_lowercase().contains("bluetooth")
    }

    /// Port sedang siap dipakai (tidak sekadar terdaftar dari hasil pairing).
    pub fn is_available(&self) -> bool {
        self.problem == 0
    }
}

/// Enumerasi seluruh device pada setup class "Ports (COM & LPT)".
///
/// Sengaja tanpa `DIGCF_PRESENT` agar COM port Bluetooth yang sudah di-pair tapi
/// printernya sedang mati tetap terlihat — inilah yang membuat printer Bluetooth
/// hilang dari daftar kalau hanya mengandalkan `serialport`.
pub fn list_serial_class_ports() -> Vec<ClassPort> {
    let device_info_set: HDEVINFO = unsafe {
        SetupDiGetClassDevsW(
            &GUID_DEVCLASS_PORTS,
            std::ptr::null(),
            std::ptr::null_mut(),
            0,
        )
    };

    if device_info_set == INVALID_HANDLE {
        return Vec::new();
    }

    let mut ports = Vec::new();
    let mut index = 0u32;

    loop {
        let mut device_info_data = SP_DEVINFO_DATA {
            cbSize: std::mem::size_of::<SP_DEVINFO_DATA>() as u32,
            ClassGuid: GUID::from_u128(0),
            DevInst: 0,
            Reserved: 0,
        };

        let ok =
            unsafe { SetupDiEnumDeviceInfo(device_info_set, index, &mut device_info_data) };
        if ok == 0 {
            break;
        }
        index += 1;

        let Some(port_name) = read_port_name(device_info_set, &device_info_data) else {
            continue;
        };

        // Port paralel juga ada di class ini; ESC/POS di sini tidak relevan.
        if port_name.to_ascii_uppercase().starts_with("LPT") {
            continue;
        }

        ports.push(ClassPort {
            port_name,
            friendly_name: read_device_property(
                device_info_set,
                &device_info_data,
                SPDRP_FRIENDLYNAME,
            )
            .unwrap_or_default(),
            hardware_id: read_device_property(
                device_info_set,
                &device_info_data,
                SPDRP_HARDWAREID,
            )
            .unwrap_or_default(),
            problem: read_device_problem(device_info_data.DevInst),
        });
    }

    unsafe { SetupDiDestroyDeviceInfoList(device_info_set) };

    ports
}

/// Nama COM port disimpan di device registry key (`PortName`), bukan di properti
/// SetupAPI biasa.
fn read_port_name(
    device_info_set: HDEVINFO,
    device_info_data: &SP_DEVINFO_DATA,
) -> Option<String> {
    let key: HKEY = unsafe {
        SetupDiOpenDevRegKey(
            device_info_set,
            device_info_data,
            DICS_FLAG_GLOBAL,
            0,
            DIREG_DEV,
            KEY_READ,
        )
    };

    if key.is_null() || key as isize == INVALID_HANDLE {
        return None;
    }

    let value_name = to_wide("PortName");
    let mut buffer = [0u16; 256];
    let mut size = std::mem::size_of_val(&buffer) as u32;

    let status = unsafe {
        RegQueryValueExW(
            key,
            value_name.as_ptr(),
            std::ptr::null(),
            std::ptr::null_mut(),
            buffer.as_mut_ptr() as *mut u8,
            &mut size,
        )
    };

    unsafe { RegCloseKey(key) };

    if status != 0 {
        return None;
    }

    let port_name = string_from_wide_buffer(&buffer);
    if port_name.is_empty() {
        None
    } else {
        Some(port_name)
    }
}

fn read_device_property(
    device_info_set: HDEVINFO,
    device_info_data: &SP_DEVINFO_DATA,
    property: u32,
) -> Option<String> {
    let mut buffer = [0u16; 512];
    let mut required = 0u32;

    let ok = unsafe {
        SetupDiGetDeviceRegistryPropertyW(
            device_info_set,
            device_info_data,
            property,
            std::ptr::null_mut(),
            buffer.as_mut_ptr() as *mut u8,
            std::mem::size_of_val(&buffer) as u32,
            &mut required,
        )
    };

    if ok == 0 {
        return None;
    }

    let value = string_from_wide_buffer(&buffer);
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

/// CM problem code device; 0 berarti sehat. Kalau statusnya tidak bisa dibaca,
/// device dianggap sehat supaya port tidak ikut hilang dari daftar.
fn read_device_problem(dev_inst: u32) -> u32 {
    let mut status = 0u32;
    let mut problem = 0u32;

    let result = unsafe { CM_Get_DevNode_Status(&mut status, &mut problem, dev_inst, 0) };
    if result != CR_SUCCESS {
        return 0;
    }

    problem
}
