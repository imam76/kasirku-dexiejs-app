# Safe-area verification

Run these checks on physical devices in both portrait and landscape. Confirm that content remains visible, bars paint through the device edge, and no fixed spacing is duplicated after rotation.

- [ ] iPhone with Dynamic Island: top navbar clears the island/status bar and the bottom tabs clear the home indicator.
- [ ] Android 15+ with gesture navigation: top navbar clears the status bar/cutout and the bottom tabs paint behind, then pad above, the gesture area.
- [ ] Android with 3-button navigation: bottom tabs remain fully visible above the navigation buttons.
- [ ] Keyboard open: the native bottom inset becomes `0px`, there is no empty strip above the IME, and it restores after closing the keyboard.
- [ ] Landscape orientation: all four edges remain usable after rotating in either direction, including devices with a side cutout.
- [ ] Browser development mode: the app loads normally without starting the Tauri plugin polling loop.
