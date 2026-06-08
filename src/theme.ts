// theme.token.ts
// Ant Design 5.x — Dual Theme (Light Default + Dark Mode)
// App: Kasir / POS, Manajemen Stok, History
// Color Palette: Professional Blue + White

import { theme as antdTheme } from "antd";
import type { ThemeConfig } from "antd";

const { defaultAlgorithm, darkAlgorithm } = antdTheme;

// ─────────────────────────────────────────────────────────────
// SHARED TOKENS (sama di light & dark)
// ─────────────────────────────────────────────────────────────
const sharedToken: ThemeConfig["token"] = {
  colorPrimary: "#1E5BA8",
  colorSuccess: "#22A447",
  colorWarning: "#F5A623",
  colorError: "#E8453C",
  colorInfo: "#1E5BA8",

  fontFamily: "'IBM Plex Sans', 'Noto Sans', sans-serif",
  fontFamilyCode: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 14,
  fontSizeLG: 16,
  fontSizeHeading1: 36,
  fontSizeHeading2: 28,
  fontSizeHeading3: 22,
  fontSizeHeading4: 18,
  fontSizeHeading5: 15,

  borderRadius: 6,
  borderRadiusLG: 10,
  borderRadiusSM: 4,
  borderRadiusXS: 2,

  controlHeight: 38,
  controlHeightLG: 46,
  controlHeightSM: 30,

  motionDurationFast: "0.1s",
  motionDurationMid: "0.2s",
  motionDurationSlow: "0.3s",

  wireframe: false,
  lineWidth: 1,
};

// ─────────────────────────────────────────────────────────────
// LIGHT THEME
// ─────────────────────────────────────────────────────────────
export const lightTheme: ThemeConfig = {
  algorithm: defaultAlgorithm,
  token: {
    ...sharedToken,
    colorBgBase: "#FFFFFF",
    colorBgContainer: "#FFFFFF",
    colorBgElevated: "#FFFFFF",
    colorBgLayout: "#F5F7FA",

    colorText: "#1A1A1A",
    colorTextSecondary: "#4A4A4A",
    colorTextTertiary: "#7A7A7A",
    colorTextQuaternary: "#BDBDBD",

    colorBorder: "#D9DFE8",
    colorBorderSecondary: "#E8EEF5",

    boxShadow: "0 2px 8px rgba(30,91,168,0.08), 0 1px 3px rgba(0,0,0,0.05)",
    boxShadowSecondary: "0 6px 24px rgba(30,91,168,0.10), 0 2px 8px rgba(0,0,0,0.06)",
  },
  components: {
    Layout: {
      bodyBg: "#F5F7FA",
      headerBg: "#FFFFFF",
      headerColor: "#1A1A1A",
      headerHeight: 60,
      siderBg: "#FFFFFF",
      footerBg: "#F5F7FA",
      footerPadding: "12px 24px",
    },
    Menu: {
      itemBg: "#FFFFFF",
      subMenuItemBg: "#F9FAFB",
      itemColor: "#4A4A4A",
      itemHoverColor: "#1E5BA8",
      itemSelectedBg: "#EEF4FB",
      itemSelectedColor: "#1E5BA8",
      groupTitleColor: "#BDBDBD",
      itemBorderRadius: 6,
      iconSize: 18,
    },
    Button: {
      primaryColor: "#FFFFFF",
      defaultBg: "#FFFFFF",
      defaultBorderColor: "#D9DFE8",
      defaultColor: "#1A1A1A",
      defaultHoverBg: "#EEF4FB",
      defaultHoverBorderColor: "#1E5BA8",
      defaultHoverColor: "#1E5BA8",
      borderRadius: 6,
      fontWeight: 600,
    },
    Table: {
      colorBgContainer: "#FFFFFF",
      headerBg: "#F5F7FA",
      headerColor: "#4A4A4A",
      rowHoverBg: "#F9FAFB",
      rowSelectedBg: "#EEF4FB",
      rowSelectedHoverBg: "#E5EEFA",
      borderColor: "#E8EEF5",
      cellPaddingBlock: 12,
      cellPaddingInline: 16,
    },
    Card: {
      colorBgContainer: "#FFFFFF",
      colorBorderSecondary: "#E8EEF5",
      headerBg: "#F5F7FA",
      headerFontSize: 15,
      borderRadiusLG: 10,
      paddingLG: 20,
    },
    Input: {
      colorBgContainer: "#FFFFFF",
      colorBorder: "#D9DFE8",
      hoverBorderColor: "#1E5BA8",
      activeBorderColor: "#1E5BA8",
      activeShadow: "0 0 0 2px rgba(30,91,168,0.15)",
      errorActiveShadow: "0 0 0 2px rgba(232,69,60,0.15)",
    },
    Select: {
      colorBgContainer: "#FFFFFF",
      colorBorder: "#D9DFE8",
      optionSelectedBg: "#EEF4FB",
      optionSelectedColor: "#1E5BA8",
      optionActiveBg: "#F5F7FA",
      selectorBg: "#FFFFFF",
    },
    Modal: {
      colorBgElevated: "#FFFFFF",
      headerBg: "#FFFFFF",
      footerBg: "#FFFFFF",
      borderRadiusLG: 10,
    },
    Tabs: {
      inkBarColor: "#1E5BA8",
      itemActiveColor: "#1E5BA8",
      itemHoverColor: "#1A1A1A",
      itemSelectedColor: "#1E5BA8",
      itemColor: "#4A4A4A",
    },
    DatePicker: {
      colorBgContainer: "#FFFFFF",
      colorBorder: "#D9DFE8",
      activeBorderColor: "#1E5BA8",
      hoverBorderColor: "#1E5BA8",
      cellActiveWithRangeBg: "#EEF4FB",
    },
    Statistic: { titleFontSize: 13, contentFontSize: 28 },
    Steps: { colorPrimary: "#1E5BA8", iconSize: 32 },
    Progress: { remainingColor: "#E8EEF5", defaultColor: "#1E5BA8" },
    Skeleton: { color: "#E8EEF5", gradientFromColor: "#E8EEF5", gradientToColor: "#F5F7FA" },
    Tag: { defaultBg: "#F5F7FA", defaultColor: "#4A4A4A" },
    Switch: { colorPrimary: "#1E5BA8", colorPrimaryHover: "#2B6CB0" },
    Drawer: { colorBgElevated: "#FFFFFF" },
    Dropdown: { colorBgElevated: "#FFFFFF", controlItemBgHover: "#F5F7FA", controlItemBgActive: "#EEF4FB" },
    Tooltip: { colorBgSpotlight: "#1A1A1A", colorTextLightSolid: "#FFFFFF", borderRadius: 6 },
    Notification: { colorBgElevated: "#FFFFFF", borderRadiusLG: 10, width: 380 },
    Pagination: { colorPrimary: "#1E5BA8", colorPrimaryHover: "#2B6CB0", itemActiveBg: "#EEF4FB" },
    Divider: { colorSplit: "#E8EEF5" },
    Empty: { colorTextDescription: "#7A7A7A" },
    Form: { labelColor: "#4A4A4A", labelFontSize: 13, itemMarginBottom: 20 },
    InputNumber: {
      colorBgContainer: "#FFFFFF",
      colorBorder: "#D9DFE8",
      activeBorderColor: "#1E5BA8",
      hoverBorderColor: "#1E5BA8",
      activeShadow: "0 0 0 2px rgba(30,91,168,0.15)",
    },
  },
};

// ─────────────────────────────────────────────────────────────
// DARK THEME
// ─────────────────────────────────────────────────────────────
export const darkTheme: ThemeConfig = {
  algorithm: darkAlgorithm,
  token: {
    ...sharedToken,
    colorBgBase: "#0B0E15",
    colorBgContainer: "#141829",
    colorBgElevated: "#1D2139",
    colorBgLayout: "#070A10",

    colorText: "#E8EAEF",
    colorTextSecondary: "#9BA3B8",
    colorTextTertiary: "#6B7489",
    colorTextQuaternary: "#4A5167",

    colorBorder: "#2B3552",
    colorBorderSecondary: "#1D2139",

    boxShadow: "0 2px 8px rgba(30,91,168,0.25), 0 1px 3px rgba(0,0,0,0.3)",
    boxShadowSecondary: "0 6px 24px rgba(30,91,168,0.20), 0 2px 8px rgba(0,0,0,0.35)",
  },
  components: {
    Layout: {
      bodyBg: "#070A10",
      headerBg: "#0B0E15",
      headerColor: "#E8EAEF",
      headerHeight: 60,
      siderBg: "#0B0E15",
      footerBg: "#070A10",
      footerPadding: "12px 24px",
    },
    Menu: {
      darkItemBg: "#0B0E15",
      darkSubMenuItemBg: "#111620",
      darkItemColor: "#9BA3B8",
      darkItemHoverColor: "#E8EAEF",
      darkItemSelectedBg: "#1E5BA820",
      darkItemSelectedColor: "#5BA8FF",
      darkGroupTitleColor: "#6B7489",
      itemBorderRadius: 6,
      iconSize: 18,
    },
    Button: {
      primaryColor: "#0B0E15",
      defaultBg: "#141829",
      defaultBorderColor: "#2B3552",
      defaultColor: "#E8EAEF",
      defaultHoverBg: "#1D2139",
      defaultHoverBorderColor: "#1E5BA8",
      defaultHoverColor: "#5BA8FF",
      borderRadius: 6,
      fontWeight: 600,
    },
    Table: {
      colorBgContainer: "#141829",
      headerBg: "#111620",
      headerColor: "#9BA3B8",
      rowHoverBg: "#1D2139",
      rowSelectedBg: "#1E5BA815",
      rowSelectedHoverBg: "#1E5BA820",
      borderColor: "#2B3552",
      cellPaddingBlock: 12,
      cellPaddingInline: 16,
    },
    Card: {
      colorBgContainer: "#141829",
      colorBorderSecondary: "#2B3552",
      headerBg: "#111620",
      headerFontSize: 15,
      borderRadiusLG: 10,
      paddingLG: 20,
    },
    Input: {
      colorBgContainer: "#111620",
      colorBorder: "#2B3552",
      hoverBorderColor: "#1E5BA8",
      activeBorderColor: "#1E5BA8",
      activeShadow: "0 0 0 2px rgba(30,91,168,0.15)",
      errorActiveShadow: "0 0 0 2px rgba(232,69,60,0.15)",
    },
    Select: {
      colorBgContainer: "#111620",
      colorBorder: "#2B3552",
      optionSelectedBg: "#1E5BA820",
      optionSelectedColor: "#5BA8FF",
      optionActiveBg: "#1D2139",
      selectorBg: "#111620",
    },
    Modal: {
      colorBgElevated: "#141829",
      headerBg: "#111620",
      footerBg: "#111620",
      borderRadiusLG: 10,
    },
    Tabs: {
      inkBarColor: "#1E5BA8",
      itemActiveColor: "#5BA8FF",
      itemHoverColor: "#E8EAEF",
      itemSelectedColor: "#5BA8FF",
      itemColor: "#9BA3B8",
    },
    DatePicker: {
      colorBgContainer: "#111620",
      colorBorder: "#2B3552",
      activeBorderColor: "#1E5BA8",
      hoverBorderColor: "#1E5BA8",
      cellActiveWithRangeBg: "#1E5BA820",
    },
    Statistic: { titleFontSize: 13, contentFontSize: 28 },
    Steps: { colorPrimary: "#1E5BA8", iconSize: 32 },
    Progress: { remainingColor: "#1A1F2D", defaultColor: "#1E5BA8" },
    Skeleton: { color: "#1A1F2D", gradientFromColor: "#1A1F2D", gradientToColor: "#232D3E" },
    Tag: { defaultBg: "#1A1F2D", defaultColor: "#9BA3B8" },
    Switch: { colorPrimary: "#1E5BA8", colorPrimaryHover: "#2B6CB0", handleBg: "#0B0E15" },
    Drawer: { colorBgElevated: "#141829", colorText: "#E8EAEF", colorIcon: "#9BA3B8" },
    Dropdown: { colorBgElevated: "#1D2139", colorText: "#E8EAEF", controlItemBgHover: "#242C3E", controlItemBgActive: "#1E5BA820" },
    Tooltip: { colorBgSpotlight: "#232D3E", colorTextLightSolid: "#E8EAEF", borderRadius: 6 },
    Notification: { colorBgElevated: "#141829", colorText: "#E8EAEF", borderRadiusLG: 10, width: 380 },
    Pagination: { colorPrimary: "#1E5BA8", colorPrimaryHover: "#2B6CB0", itemActiveBg: "#1E5BA820" },
    Divider: { colorSplit: "#2B3552" },
    Empty: { colorTextDescription: "#6B7489" },
    Form: { labelColor: "#9BA3B8", labelFontSize: 13, itemMarginBottom: 20 },
    InputNumber: {
      colorBgContainer: "#111620",
      colorBorder: "#2B3552",
      activeBorderColor: "#1E5BA8",
      hoverBorderColor: "#1E5BA8",
      activeShadow: "0 0 0 2px rgba(30,91,168,0.15)",
    },
  },
};

// ─────────────────────────────────────────────────────────────
// STATUS PRESETS
// ─────────────────────────────────────────────────────────────
export const statusPresets = {
  tersedia: { color: "success", label: "Tersedia" },
  menipis: { color: "warning", label: "Stok Menipis" },
  habis: { color: "error", label: "Habis" },
  nonaktif: { color: "default", label: "Nonaktif" },
  selesai: { color: "success", label: "Selesai" },
  pending: { color: "warning", label: "Pending" },
  dibatalkan: { color: "error", label: "Dibatalkan" },
} as const;

export type ThemeMode = "light" | "dark";