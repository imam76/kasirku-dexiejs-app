package com.asepimamnawawi_imam76.frayukti_app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.nio.charset.Charset
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.roundToLong

@InvokeArg
class SelectedPrinterArg {
  var name: String = ""
  var address: String = ""
}

@InvokeArg
class ReceiptLineItemArg {
  var name: String = ""
  var quantity: Double = 0.0
  var unit: String = ""
  var price: Double = 0.0
  var priceBeforeDiscount: Double = 0.0
  var subtotalBeforeDiscount: Double = 0.0
  var discountAmount: Double = 0.0
  var subtotal: Double = 0.0
}

@InvokeArg
class ReceiptPaymentLineArg {
  var methodName: String = ""
  var methodCode: String = ""
  var reference: String = ""
  var tenderedAmount: Double = 0.0
  var appliedAmount: Double = 0.0
  var changeAmount: Double = 0.0
}

@InvokeArg
class ReceiptPayloadArg {
  var transactionId: String = ""
  var transactionNumber: String = ""
  var merchantName: String = ""
  var createdAt: String = ""
  var paymentMethod: String = ""
  var paymentMethodCode: String = ""
  var paymentReference: String = ""
  var payments: List<ReceiptPaymentLineArg> = emptyList()
  var memberName: String = ""
  var memberNumber: String = ""
  var items: List<ReceiptLineItemArg> = emptyList()
  var subtotalAmount: Double = 0.0
  var discountAmount: Double = 0.0
  var membershipPointsEarned: Double = 0.0
  var membershipPointsRedeemed: Double = 0.0
  var membershipPointDiscountAmount: Double = 0.0
  var membershipPointsBalanceAfter: Double = 0.0
  var totalAmount: Double = 0.0
  var paymentAmount: Double = 0.0
  var changeAmount: Double = 0.0
  var footer: String? = null
}

@InvokeArg
class TestPrintRequestArg {
  lateinit var printer: SelectedPrinterArg
}

@InvokeArg
class PrintReceiptRequestArg {
  lateinit var printer: SelectedPrinterArg
  lateinit var receipt: ReceiptPayloadArg
}

class PrinterCommandException(
  val errorCode: String,
  override val message: String,
  cause: Throwable? = null,
) : Exception(message, cause)

@TauriPlugin(
  permissions = [
    Permission(
      strings = [Manifest.permission.BLUETOOTH_CONNECT],
      alias = "bluetoothConnect",
    ),
  ],
)
class BluetoothPrinterPlugin(private val activity: Activity) : Plugin(activity) {
  private val pendingPermissionActions = ConcurrentHashMap<Long, () -> Unit>()

  @Command
  fun list_bluetooth_printers(invoke: Invoke) {
    runWithBluetoothPermission(invoke) {
      try {
        val adapter = requireEnabledBluetoothAdapter()
        val devices = getBondedDevices(adapter)
          .map {
            val address = it.address.orEmpty()
            val name = it.name?.takeIf { deviceName -> deviceName.isNotBlank() }
              ?: "Bluetooth Printer $address"

            mapOf(
              "name" to name,
              "address" to address,
              "isPaired" to true,
            )
          }
          .sortedBy { (it["name"] as String).lowercase(Locale.ROOT) }

        invoke.resolveObject(devices)
      } catch (error: PrinterCommandException) {
        rejectPrinterError(invoke, error)
      } catch (error: SecurityException) {
        rejectPrinterError(
          invoke,
          PrinterCommandException(
            "PERMISSION_DENIED",
            "Izin Bluetooth ditolak.",
            error,
          ),
        )
      }
    }
  }

  @Command
  fun test_print_bluetooth(invoke: Invoke) {
    val args = invoke.parseArgs(TestPrintRequestArg::class.java)

    runWithBluetoothPermission(invoke) {
      printAsync(invoke, args.printer, EscPosReceiptRenderer.renderTestPrint(args.printer))
    }
  }

  @Command
  fun print_receipt_bluetooth(invoke: Invoke) {
    val args = invoke.parseArgs(PrintReceiptRequestArg::class.java)

    runWithBluetoothPermission(invoke) {
      printAsync(invoke, args.printer, EscPosReceiptRenderer.renderReceipt(args.receipt))
    }
  }

  @PermissionCallback
  fun bluetoothPermissionCallback(invoke: Invoke) {
    val action = pendingPermissionActions.remove(invoke.id)

    if (!hasBluetoothConnectPermission()) {
      invoke.reject("Izin Bluetooth ditolak.", "PERMISSION_DENIED")
      return
    }

    action?.invoke() ?: invoke.resolve()
  }

  private fun runWithBluetoothPermission(invoke: Invoke, action: () -> Unit) {
    if (hasBluetoothConnectPermission()) {
      action()
      return
    }

    pendingPermissionActions[invoke.id] = action
    requestPermissionForAlias(
      BLUETOOTH_CONNECT_ALIAS,
      invoke,
      "bluetoothPermissionCallback",
    )
  }

  private fun hasBluetoothConnectPermission(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      return true
    }

    return ActivityCompat.checkSelfPermission(
      activity,
      Manifest.permission.BLUETOOTH_CONNECT,
    ) == PackageManager.PERMISSION_GRANTED
  }

  private fun printAsync(
    invoke: Invoke,
    printer: SelectedPrinterArg,
    bytes: ByteArray,
  ) {
    Thread {
      try {
        sendBytes(printer, bytes)
        activity.runOnUiThread { invoke.resolve() }
      } catch (error: PrinterCommandException) {
        activity.runOnUiThread { rejectPrinterError(invoke, error) }
      } catch (error: SecurityException) {
        activity.runOnUiThread {
          rejectPrinterError(
            invoke,
            PrinterCommandException(
              "PERMISSION_DENIED",
              "Izin Bluetooth ditolak.",
              error,
            ),
          )
        }
      } catch (error: Exception) {
        activity.runOnUiThread {
          rejectPrinterError(
            invoke,
            PrinterCommandException(
              "UNKNOWN",
              "Terjadi kesalahan printer.",
              error,
            ),
          )
        }
      }
    }.start()
  }

  @SuppressLint("MissingPermission")
  private fun sendBytes(printer: SelectedPrinterArg, bytes: ByteArray) {
    if (printer.address.isBlank()) {
      throw PrinterCommandException("PRINTER_NOT_SELECTED", "Printer belum dipilih.")
    }

    val adapter = requireEnabledBluetoothAdapter()
    val device = getBondedDevices(adapter).firstOrNull {
      it.address.equals(printer.address, ignoreCase = true)
    } ?: throw PrinterCommandException(
      "PRINTER_NOT_PAIRED",
      "Printer tidak ditemukan di daftar paired device.",
    )

    try {
      adapter.cancelDiscovery()
    } catch (_: SecurityException) {
      // cancelDiscovery is optional here; paired SPP printing can continue without it.
    }

    var socket: BluetoothSocket? = null

    try {
      socket = connectSocket(device)
      val outputStream = socket.outputStream

      try {
        outputStream.write(bytes)
        outputStream.flush()
      } catch (error: IOException) {
        throw PrinterCommandException(
          "WRITE_FAILED",
          "Gagal mengirim data ke printer.",
          error,
        )
      }
    } finally {
      try {
        socket?.close()
      } catch (_: IOException) {
      }
    }
  }

  @SuppressLint("MissingPermission")
  private fun connectSocket(device: android.bluetooth.BluetoothDevice): BluetoothSocket {
    val secureSocket = device.createRfcommSocketToServiceRecord(SPP_UUID)

    try {
      secureSocket.connect()
      return secureSocket
    } catch (secureError: IOException) {
      try {
        secureSocket.close()
      } catch (_: IOException) {
      }

      val insecureSocket = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID)

      try {
        insecureSocket.connect()
        return insecureSocket
      } catch (insecureError: IOException) {
        try {
          insecureSocket.close()
        } catch (_: IOException) {
        }

        throw PrinterCommandException(
          "CONNECTION_FAILED",
          "Gagal terhubung ke printer Bluetooth.",
          insecureError,
        )
      }
    }
  }

  private fun requireBluetoothAdapter(): BluetoothAdapter {
    val bluetoothManager = activity.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    val adapter = bluetoothManager?.adapter

    return adapter ?: throw PrinterCommandException(
      "BLUETOOTH_OFF",
      "Bluetooth tidak tersedia di perangkat ini.",
    )
  }

  private fun requireEnabledBluetoothAdapter(): BluetoothAdapter {
    val adapter = requireBluetoothAdapter()

    if (!adapter.isEnabled) {
      throw PrinterCommandException("BLUETOOTH_OFF", "Bluetooth sedang nonaktif.")
    }

    return adapter
  }

  @SuppressLint("MissingPermission")
  private fun getBondedDevices(adapter: BluetoothAdapter) = adapter.bondedDevices ?: emptySet()

  private fun rejectPrinterError(invoke: Invoke, error: PrinterCommandException) {
    invoke.reject(error.message, error.errorCode, error)
  }

  companion object {
    const val BLUETOOTH_CONNECT_ALIAS = "bluetoothConnect"
    val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
  }
}

object EscPosReceiptRenderer {
  private const val PAPER_WIDTH = 32
  private val printerCharset: Charset = Charset.forName("CP437")
  private val indonesianLocale: Locale = Locale.forLanguageTag("id-ID")

  fun renderTestPrint(printer: SelectedPrinterArg): ByteArray {
    val output = ByteArrayOutputStream()
    output.writeCommand(0x1B, 0x40)
    output.writeCommand(0x1B, 0x74, 0x00)
    output.writeCommand(0x1B, 0x61, 0x01)
    output.writeCommand(0x1B, 0x45, 0x01)
    output.writeLine("KASIRKU")
    output.writeCommand(0x1B, 0x45, 0x00)
    output.writeLine("TEST PRINT")
    output.writeLine("")
    output.writeLine("Bluetooth SPP OK")
    output.writeLine(printer.name.ifBlank { "Thermal Printer" })
    output.writeLine(printer.address)
    output.writeLine("")
    output.writeLine(formatReceiptDate(Date()))
    output.writeLine("")
    output.writeLine("")
    output.writeLine("")
    return output.toByteArray()
  }

  fun renderReceipt(receipt: ReceiptPayloadArg): ByteArray {
    val output = ByteArrayOutputStream()
    output.writeCommand(0x1B, 0x40)
    output.writeCommand(0x1B, 0x74, 0x00)
    output.writeCommand(0x1B, 0x61, 0x01)
    output.writeCommand(0x1B, 0x45, 0x01)
    output.writeLine(receipt.merchantName.ifBlank { "Frayukti" }.fit(PAPER_WIDTH))
    output.writeCommand(0x1B, 0x45, 0x00)
    output.writeLine("STRUK PEMBAYARAN")
    output.writeCommand(0x1B, 0x61, 0x00)
    output.writeLine(separator())
    output.writeLine(twoColumns("No", receipt.transactionNumber))
    output.writeLine(twoColumns("Tanggal", formatIsoReceiptDate(receipt.createdAt)))
    val paymentMethodLabel = if (
      receipt.paymentMethodCode.isNotBlank() &&
      !receipt.paymentMethodCode.equals(receipt.paymentMethod, ignoreCase = true)
    ) {
      "${receipt.paymentMethod} [${receipt.paymentMethodCode}]"
    } else {
      receipt.paymentMethod
    }
    if (receipt.payments.isEmpty()) {
      output.writeLine(twoColumns("Metode", paymentMethodLabel))
      if (receipt.paymentReference.isNotBlank()) output.writeLine(twoColumns("Referensi", receipt.paymentReference))
    }
    if (receipt.memberName.isNotBlank()) {
      output.writeLine(twoColumns("Member", receipt.memberNumber.ifBlank { receipt.memberName }))
      if (receipt.memberNumber.isNotBlank()) {
        wrap(receipt.memberName, PAPER_WIDTH).forEach { output.writeLine(it) }
      }
    }
    output.writeLine(separator())

    receipt.items.forEach { item ->
      wrap(item.name.ifBlank { "Item" }, PAPER_WIDTH).forEach { output.writeLine(it) }
      val quantity = "${formatQuantity(item.quantity)} ${item.unit}".trim()
      output.writeLine(twoColumns("$quantity x ${formatCurrency(item.price)}", formatCurrency(item.subtotal)))
    }

    output.writeLine(separator())
    if (receipt.discountAmount > 0.0) {
      val subtotal = if (receipt.subtotalAmount > 0.0) receipt.subtotalAmount else receipt.totalAmount + receipt.discountAmount
      output.writeLine(twoColumns("SUBTOTAL", formatCurrency(subtotal)))
      output.writeLine(twoColumns("DISKON", "-${formatCurrency(receipt.discountAmount)}"))
    }
    output.writeCommand(0x1B, 0x45, 0x01)
    output.writeLine(twoColumns("TOTAL", formatCurrency(receipt.totalAmount)))
    output.writeCommand(0x1B, 0x45, 0x00)
    if (receipt.payments.isNotEmpty()) {
      output.writeLine("PEMBAYARAN")
      receipt.payments.forEach { payment ->
        output.writeLine(twoColumns(payment.methodName, formatCurrency(payment.tenderedAmount)))
        if (payment.reference.isNotBlank()) output.writeLine("  Ref: ${payment.reference}".fit(PAPER_WIDTH))
      }
    }
    output.writeLine(twoColumns("BAYAR", formatCurrency(receipt.paymentAmount)))
    output.writeLine(twoColumns("KEMBALI", formatCurrency(receipt.changeAmount)))
    if (receipt.membershipPointsEarned > 0.0 || receipt.membershipPointsRedeemed > 0.0) {
      output.writeLine(separator())
      if (receipt.membershipPointsRedeemed > 0.0) {
        output.writeLine(twoColumns("POIN DIPAKAI", formatQuantity(receipt.membershipPointsRedeemed)))
      }
      if (receipt.membershipPointsEarned > 0.0) {
        output.writeLine(twoColumns("POIN DIDAPAT", formatQuantity(receipt.membershipPointsEarned)))
      }
      output.writeLine(twoColumns("SALDO POIN", formatQuantity(receipt.membershipPointsBalanceAfter)))
    }
    output.writeLine(separator())
    output.writeCommand(0x1B, 0x61, 0x01)
    output.writeLine(receipt.footer?.ifBlank { "Terima kasih" } ?: "Terima kasih")
    output.writeLine("")
    output.writeLine("")
    output.writeLine("")
    output.writeLine("")
    return output.toByteArray()
  }

  private fun ByteArrayOutputStream.writeCommand(vararg bytes: Int) {
    write(bytes.map { it.toByte() }.toByteArray())
  }

  private fun ByteArrayOutputStream.writeLine(text: String = "") {
    write(text.toByteArray(printerCharset))
    write(0x0A)
  }

  private fun separator() = "-".repeat(PAPER_WIDTH)

  private fun twoColumns(left: String, right: String): String {
    val safeRight = right.fit(PAPER_WIDTH)
    val maxLeftWidth = (PAPER_WIDTH - safeRight.length - 1).coerceAtLeast(1)
    val safeLeft = left.fit(maxLeftWidth)
    val spaces = (PAPER_WIDTH - safeLeft.length - safeRight.length).coerceAtLeast(1)
    return safeLeft + " ".repeat(spaces) + safeRight
  }

  private fun wrap(value: String, width: Int): List<String> {
    val words = value.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
    if (words.isEmpty()) {
      return listOf("")
    }

    val lines = mutableListOf<String>()
    var currentLine = ""

    words.forEach { word ->
      if (word.length > width) {
        if (currentLine.isNotBlank()) {
          lines.add(currentLine)
          currentLine = ""
        }
        word.chunked(width).forEach { lines.add(it) }
        return@forEach
      }

      val candidate = if (currentLine.isBlank()) word else "$currentLine $word"
      if (candidate.length <= width) {
        currentLine = candidate
      } else {
        lines.add(currentLine)
        currentLine = word
      }
    }

    if (currentLine.isNotBlank()) {
      lines.add(currentLine)
    }

    return lines
  }

  private fun String.fit(width: Int): String {
    if (length <= width) {
      return this
    }

    return take(width)
  }

  private fun formatCurrency(value: Double): String {
    val numberFormat = NumberFormat.getNumberInstance(indonesianLocale)
    return "Rp${numberFormat.format(value.roundToLong())}"
  }

  private fun formatQuantity(value: Double): String {
    if (value % 1.0 == 0.0) {
      return value.roundToLong().toString()
    }

    return value.toString().trimEnd('0').trimEnd('.')
  }

  private fun formatIsoReceiptDate(value: String): String {
    val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    parser.timeZone = TimeZone.getTimeZone("UTC")

    return try {
      val date = parser.parse(value)
      if (date == null) {
        value.take(16).replace("T", " ")
      } else {
        formatReceiptDate(date)
      }
    } catch (_: Exception) {
      value.take(16).replace("T", " ")
    }
  }

  private fun formatReceiptDate(date: Date): String {
    val formatter = SimpleDateFormat("dd/MM/yy HH:mm", indonesianLocale)
    return formatter.format(date)
  }
}
