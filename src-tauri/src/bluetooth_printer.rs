use serde::{Deserialize, Serialize};
use tauri::{plugin::TauriPlugin, Manager, Runtime, State, Wry};

#[derive(Debug, Serialize)]
pub struct BluetoothPrinterError {
    code: String,
    message: String,
}

impl BluetoothPrinterError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }

    fn unsupported_platform() -> Self {
        Self::new(
            "UNSUPPORTED_PLATFORM",
            "Auto print Bluetooth hanya tersedia di aplikasi native Android.",
        )
    }
}

#[cfg(target_os = "android")]
impl From<tauri::plugin::mobile::PluginInvokeError> for BluetoothPrinterError {
    fn from(error: tauri::plugin::mobile::PluginInvokeError) -> Self {
        match error {
            tauri::plugin::mobile::PluginInvokeError::InvokeRejected(response) => Self {
                code: response.code.unwrap_or_else(|| "UNKNOWN".to_string()),
                message: response
                    .message
                    .unwrap_or_else(|| "Terjadi kesalahan printer.".to_string()),
            },
            _ => Self::new("UNKNOWN", error.to_string()),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BluetoothPrinterDevice {
    #[serde(default = "default_printer_name")]
    name: String,
    #[serde(default)]
    address: String,
    #[serde(default = "default_is_paired")]
    is_paired: bool,
}

fn default_printer_name() -> String {
    "Bluetooth Printer".to_string()
}

fn default_is_paired() -> bool {
    true
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SelectedBluetoothPrinter {
    name: String,
    address: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptLineItem {
    name: String,
    quantity: f64,
    unit: String,
    price: f64,
    price_before_discount: Option<f64>,
    subtotal_before_discount: Option<f64>,
    discount_amount: Option<f64>,
    subtotal: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptPayload {
    transaction_id: String,
    transaction_number: String,
    merchant_name: String,
    created_at: String,
    payment_method: String,
    items: Vec<ReceiptLineItem>,
    subtotal_amount: Option<f64>,
    discount_amount: Option<f64>,
    total_amount: f64,
    payment_amount: f64,
    change_amount: f64,
    footer: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[cfg(target_os = "android")]
struct TestPrintRequest {
    printer: SelectedBluetoothPrinter,
}

#[derive(Clone, Debug, Serialize)]
#[cfg(target_os = "android")]
struct PrintReceiptRequest {
    printer: SelectedBluetoothPrinter,
    receipt: ReceiptPayload,
}

#[cfg(target_os = "android")]
pub struct BluetoothPrinter<R: Runtime>(tauri::plugin::PluginHandle<R>);

#[cfg(not(target_os = "android"))]
pub struct BluetoothPrinter<R: Runtime>(std::marker::PhantomData<fn() -> R>);

impl<R: Runtime> BluetoothPrinter<R> {
    fn list(&self) -> Result<Vec<BluetoothPrinterDevice>, BluetoothPrinterError> {
        #[cfg(target_os = "android")]
        {
            return self
                .0
                .run_mobile_plugin("list_bluetooth_printers", ())
                .map_err(Into::into);
        }

        #[cfg(not(target_os = "android"))]
        {
            Err(BluetoothPrinterError::unsupported_platform())
        }
    }

    fn test_print(&self, printer: SelectedBluetoothPrinter) -> Result<(), BluetoothPrinterError> {
        #[cfg(target_os = "android")]
        {
            return self
                .0
                .run_mobile_plugin("test_print_bluetooth", TestPrintRequest { printer })
                .map_err(Into::into);
        }

        #[cfg(not(target_os = "android"))]
        {
            let _ = printer;
            Err(BluetoothPrinterError::unsupported_platform())
        }
    }

    fn print_receipt(
        &self,
        printer: SelectedBluetoothPrinter,
        receipt: ReceiptPayload,
    ) -> Result<(), BluetoothPrinterError> {
        #[cfg(target_os = "android")]
        {
            return self
                .0
                .run_mobile_plugin(
                    "print_receipt_bluetooth",
                    PrintReceiptRequest { printer, receipt },
                )
                .map_err(Into::into);
        }

        #[cfg(not(target_os = "android"))]
        {
            let _ = printer;
            let _ = receipt;
            Err(BluetoothPrinterError::unsupported_platform())
        }
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("bluetooth_printer")
        .setup(|app, _api| {
            #[cfg(target_os = "android")]
            let printer = BluetoothPrinter(_api.register_android_plugin(
                "com.asepimamnawawi_imam76.kasirku_erp_app",
                "BluetoothPrinterPlugin",
            )?);

            #[cfg(not(target_os = "android"))]
            let printer: BluetoothPrinter<R> = BluetoothPrinter(std::marker::PhantomData);

            app.manage(printer);
            Ok(())
        })
        .build()
}

#[tauri::command]
pub fn list_bluetooth_printers(
    bluetooth_printer: State<'_, BluetoothPrinter<Wry>>,
) -> Result<Vec<BluetoothPrinterDevice>, BluetoothPrinterError> {
    bluetooth_printer.list()
}

#[tauri::command]
pub fn test_print_bluetooth(
    printer: SelectedBluetoothPrinter,
    bluetooth_printer: State<'_, BluetoothPrinter<Wry>>,
) -> Result<(), BluetoothPrinterError> {
    bluetooth_printer.test_print(printer)
}

#[tauri::command]
pub fn print_receipt_bluetooth(
    printer: SelectedBluetoothPrinter,
    receipt: ReceiptPayload,
    bluetooth_printer: State<'_, BluetoothPrinter<Wry>>,
) -> Result<(), BluetoothPrinterError> {
    bluetooth_printer.print_receipt(printer, receipt)
}
