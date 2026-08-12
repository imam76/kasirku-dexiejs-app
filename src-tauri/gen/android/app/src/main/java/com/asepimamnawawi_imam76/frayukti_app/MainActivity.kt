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
  //
  // Listener yang sama juga dipakai buat dorong --safe-area-inset-top/bottom
  // secara live. Sebelumnya nilai itu cuma diambil sekali lewat plugin
  // safe-area-insets-css (request/response, dipanggil pas app baru buka +
  // saat event resize/orientationchange dari JS) — jadi kalau insets berubah
  // tanpa resize viewport (ganti mode navigasi gestur <-> 3 tombol, cutout
  // muncul/hilang), CSS var-nya basi sampai app di-restart. setOnApplyWindowInsetsListener
  // dipanggil ulang oleh Android setiap kali insets BENERAN berubah, jadi ini
  // sumber yang selalu akurat.
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)

    val density = resources.displayMetrics.density
    ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
      val imeHeightPx = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
      val imeHeightDp = imeHeightPx / density

      val topInsetDp = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top / density
      // Selaras dengan logic keyboard di src/platform/safeAreaInsets.ts: saat
      // keyboard terbuka, bottom safe-area di-nol-kan supaya tidak dobel
      // dengan --app-keyboard-inset-bottom yang sudah menampung tinggi keyboard.
      val bottomInsetDp = if (imeHeightPx > 0) {
        0f
      } else {
        insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom / density
      }

      webView.evaluateJavascript(
        "var s=document.documentElement.style;" +
          "s.setProperty('--app-keyboard-inset-bottom','${imeHeightDp}px');" +
          "s.setProperty('--safe-area-inset-top','${topInsetDp}px');" +
          "s.setProperty('--safe-area-inset-bottom','${bottomInsetDp}px');",
        null,
      )
      insets
    }
  }
}
