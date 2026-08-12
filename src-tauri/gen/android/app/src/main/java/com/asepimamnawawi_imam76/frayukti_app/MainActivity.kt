package com.asepimamnawawi_imam76.frayukti_app

import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // enableEdgeToEdge() default (SystemBarStyle.auto) membuat navigationBarColor
    // transparan TAPI tetap menyalakan isNavigationBarContrastEnforced di API 29+,
    // sehingga OS menggambar scrim abu-abu gelap sendiri di atas area navigasi
    // gestur agar tombol/pill tetap kontras — inilah "bar hitam" yang masih
    // muncul walau device sudah full gesture mode (bukan ulah OEM Samsung).
    // App ini sudah menyediakan padding sendiri via env(safe-area-inset-bottom)
    // di CSS, jadi scrim bawaan sistem ini tidak diperlukan dan dimatikan.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isNavigationBarContrastEnforced = false
    }
  }

  // Edge-to-edge (targetSdk 35+) membuat window tidak lagi resize otomatis saat
  // keyboard virtual muncul, jadi WebView tidak pernah tahu ada keyboard lewat
  // window.innerHeight/visualViewport. Insets IME didengarkan manual di sini
  // dan tinggi keyboard didorong ke CSS var supaya elemen footer yang docked di
  // bawah (mis. tombol Simpan pada ResponsiveCrudEditor) bisa naik di atas
  // keyboard alih-alih ketutupan.
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)

    val density = resources.displayMetrics.density
    ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
      val imeHeightPx = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
      val imeHeightDp = imeHeightPx / density
      webView.evaluateJavascript(
        "document.documentElement.style.setProperty('--app-keyboard-inset-bottom', '${imeHeightDp}px')",
        null,
      )
      insets
    }
  }
}
