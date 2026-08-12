package com.asepimamnawawi_imam76.frayukti_app

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
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
