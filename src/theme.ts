// theme.token.ts
// Ant Design 5.x — Dual Theme (Light Default + Dark Mode)
// App: Kasir / POS, Manajemen Stok, History

import { theme as antdTheme } from "antd";
import type { ThemeConfig } from "antd";

const { defaultAlgorithm, darkAlgorithm } = antdTheme;

// ─────────────────────────────────────────────────────────────
// SHARED TOKENS (sama di light & dark)
// ─────────────────────────────────────────────────────────────
const sharedToken: ThemeConfig["token"] = {
  colorPrimary: "#E8A838",
  colorSuccess: "#2EAD6A",
  colorWarning: "#F5A623",
  colorError: "#E8453C",
  colorInfo: "#4A90D9",

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
    colorBgLayout: "#F4F5F7",

    colorText: "#1A1D27",
    colorTextSecondary: "#555A6E",
    colorTextTertiary: "#8B90A0",
    colorTextQuaternary: "#C0C4D0",

    colorBorder: "#DDE0EA",
    colorBorderSecondary: "#EDEEF2",

    boxShadow: "0 2px 8px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)",
    boxShadowSecondary: "0 6px 24px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)",
  },
  components: {
    Layout: {
      bodyBg: "#F4F5F7",
      headerBg: "#FFFFFF",
      headerColor: "#1A1D27",
      headerHeight: 60,
      siderBg: "#FFFFFF",
      footerBg: "#F4F5F7",
      footerPadding: "12px 24px",
    },
    Menu: {
      itemBg: "#FFFFFF",
      subMenuItemBg: "#F9FAFB",
      itemColor: "#555A6E",
      itemHoverColor: "#1A1D27",
      itemSelectedBg: "#FDF3E0",
      itemSelectedColor: "#E8A838",
      groupTitleColor: "#C0C4D0",
      itemBorderRadius: 6,
      iconSize: 18,
    },
    Button: {
      primaryColor: "#FFFFFF",
      defaultBg: "#FFFFFF",
      defaultBorderColor: "#DDE0EA",
      defaultColor: "#1A1D27",
      defaultHoverBg: "#FDF3E0",
      defaultHoverBorderColor: "#E8A838",
      defaultHoverColor: "#E8A838",
      borderRadius: 6,
      fontWeight: 600,
    },
    Table: {
      colorBgContainer: "#FFFFFF",
      headerBg: "#F4F5F7",
      headerColor: "#555A6E",
      rowHoverBg: "#FAFAFA",
      rowSelectedBg: "#FDF3E0",
      rowSelectedHoverBg: "#FAE9C0",
      borderColor: "#EDEEF2",
      cellPaddingBlock: 12,
      cellPaddingInline: 16,
    },
    Card: {
      colorBgContainer: "#FFFFFF",
      colorBorderSecondary: "#EDEEF2",
      headerBg: "#F4F5F7",
      headerFontSize: 15,
      borderRadiusLG: 10,
      paddingLG: 20,
    },
    Input: {
      colorBgContainer: "#FFFFFF",
      colorBorder: "#DDE0EA",
      hoverBorderColor: "#E8A838",
      activeBorderColor: "#E8A838",
      activeShadow: "0 0 0 2px rgba(232,168,56,0.15)",
      errorActiveShadow: "0 0 0 2px rgba(232,69,60,0.15)",
    },
    Select: {
      colorBgContainer: "#FFFFFF",
      colorBorder: "#DDE0EA",
      optionSelectedBg: "#FDF3E0",
      optionSelectedColor: "#E8A838",
      optionActiveBg: "#F4F5F7",
      selectorBg: "#FFFFFF",
    },
    Modal: {
      colorBgElevated: "#FFFFFF",
      headerBg: "#F4F5F7",
      footerBg: "#F4F5F7",
      borderRadiusLG: 10,
    },
    Tabs: {
      inkBarColor: "#E8A838",
      itemActiveColor: "#E8A838",
      itemHoverColor: "#1A1D27",
      itemSelectedColor: "#E8A838",
      itemColor: "#555A6E",
    },
    DatePicker: {
      colorBgContainer: "#FFFFFF",
      colorBorder: "#DDE0EA",
      activeBorderColor: "#E8A838",
      hoverBorderColor: "#E8A838",
      cellActiveWithRangeBg: "#FDF3E0",
    },
    Statistic: { titleFontSize: 13, contentFontSize: 28 },
    Steps: { colorPrimary: "#E8A838", iconSize: 32 },
    Progress: { remainingColor: "#EDEEF2", defaultColor: "#E8A838" },
    Skeleton: { color: "#EDEEF2", gradientFromColor: "#EDEEF2", gradientToColor: "#F4F5F7" },
    Tag: { defaultBg: "#F4F5F7", defaultColor: "#555A6E" },
    Switch: { colorPrimary: "#E8A838", colorPrimaryHover: "#F0B94A" },
    Drawer: { colorBgElevated: "#FFFFFF" },
    Dropdown: { colorBgElevated: "#FFFFFF", controlItemBgHover: "#F4F5F7", controlItemBgActive: "#FDF3E0" },
    Tooltip: { colorBgSpotlight: "#1A1D27", colorTextLightSolid: "#FFFFFF", borderRadius: 6 },
    Notification: { colorBgElevated: "#FFFFFF", borderRadiusLG: 10, width: 380 },
    Pagination: { colorPrimary: "#E8A838", colorPrimaryHover: "#F0B94A", itemActiveBg: "#FDF3E0" },
    Divider: { colorSplit: "#EDEEF2" },
    Empty: { colorTextDescription: "#8B90A0" },
    Form: { labelColor: "#555A6E", labelFontSize: 13, itemMarginBottom: 20 },
    InputNumber: {
      colorBgContainer: "#FFFFFF",
      colorBorder: "#DDE0EA",
      activeBorderColor: "#E8A838",
      hoverBorderColor: "#E8A838",
      activeShadow: "0 0 0 2px rgba(232,168,56,0.15)",
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
    colorBgBase: "#0F1117",
    colorBgContainer: "#1A1D27",
    colorBgElevated: "#222535",
    colorBgLayout: "#0B0D14",

    colorText: "#E8EAF0",
    colorTextSecondary: "#9499B0",
    colorTextTertiary: "#5C6078",
    colorTextQuaternary: "#3D4055",

    colorBorder: "#2E3148",
    colorBorderSecondary: "#222535",

    boxShadow: "0 2px 8px rgba(0,0,0,0.45), 0 1px 3px rgba(0,0,0,0.3)",
    boxShadowSecondary: "0 6px 24px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.35)",
  },
  components: {
    Layout: {
      bodyBg: "#0B0D14",
      headerBg: "#0F1117",
      headerColor: "#E8EAF0",
      headerHeight: 60,
      siderBg: "#0F1117",
      footerBg: "#0B0D14",
      footerPadding: "12px 24px",
    },
    Menu: {
      darkItemBg: "#0F1117",
      darkSubMenuItemBg: "#141720",
      darkItemColor: "#9499B0",
      darkItemHoverColor: "#E8EAF0",
      darkItemSelectedBg: "#E8A83820",
      darkItemSelectedColor: "#E8A838",
      darkGroupTitleColor: "#5C6078",
      itemBorderRadius: 6,
      iconSize: 18,
    },
    Button: {
      primaryColor: "#0F1117",
      defaultBg: "#1A1D27",
      defaultBorderColor: "#2E3148",
      defaultColor: "#E8EAF0",
      defaultHoverBg: "#222535",
      defaultHoverBorderColor: "#E8A838",
      defaultHoverColor: "#E8A838",
      borderRadius: 6,
      fontWeight: 600,
    },
    Table: {
      colorBgContainer: "#1A1D27",
      headerBg: "#141720",
      headerColor: "#9499B0",
      rowHoverBg: "#222535",
      rowSelectedBg: "#E8A83812",
      rowSelectedHoverBg: "#E8A83820",
      borderColor: "#2E3148",
      cellPaddingBlock: 12,
      cellPaddingInline: 16,
    },
    Card: {
      colorBgContainer: "#1A1D27",
      colorBorderSecondary: "#2E3148",
      headerBg: "#141720",
      headerFontSize: 15,
      borderRadiusLG: 10,
      paddingLG: 20,
    },
    Input: {
      colorBgContainer: "#141720",
      colorBorder: "#2E3148",
      hoverBorderColor: "#E8A838",
      activeBorderColor: "#E8A838",
      activeShadow: "0 0 0 2px rgba(232,168,56,0.15)",
      errorActiveShadow: "0 0 0 2px rgba(232,69,60,0.15)",
    },
    Select: {
      colorBgContainer: "#141720",
      colorBorder: "#2E3148",
      optionSelectedBg: "#E8A83820",
      optionSelectedColor: "#E8A838",
      optionActiveBg: "#222535",
      selectorBg: "#141720",
    },
    Modal: {
      colorBgElevated: "#1A1D27",
      headerBg: "#141720",
      footerBg: "#141720",
      borderRadiusLG: 10,
    },
    Tabs: {
      inkBarColor: "#E8A838",
      itemActiveColor: "#E8A838",
      itemHoverColor: "#E8EAF0",
      itemSelectedColor: "#E8A838",
      itemColor: "#9499B0",
    },
    DatePicker: {
      colorBgContainer: "#141720",
      colorBorder: "#2E3148",
      activeBorderColor: "#E8A838",
      hoverBorderColor: "#E8A838",
      cellActiveWithRangeBg: "#E8A83820",
    },
    Statistic: { titleFontSize: 13, contentFontSize: 28 },
    Steps: { colorPrimary: "#E8A838", iconSize: 32 },
    Progress: { remainingColor: "#1E2133", defaultColor: "#E8A838" },
    Skeleton: { color: "#1E2133", gradientFromColor: "#1E2133", gradientToColor: "#2A2D3E" },
    Tag: { defaultBg: "#1E2133", defaultColor: "#9499B0" },
    Switch: { colorPrimary: "#E8A838", colorPrimaryHover: "#F0B94A", handleBg: "#0F1117" },
    Drawer: { colorBgElevated: "#1A1D27", colorText: "#E8EAF0", colorIcon: "#9499B0" },
    Dropdown: { colorBgElevated: "#222535", colorText: "#E8EAF0", controlItemBgHover: "#2A2D3E", controlItemBgActive: "#E8A83820" },
    Tooltip: { colorBgSpotlight: "#2A2D3E", colorTextLightSolid: "#E8EAF0", borderRadius: 6 },
    Notification: { colorBgElevated: "#1A1D27", colorText: "#E8EAF0", borderRadiusLG: 10, width: 380 },
    Pagination: { colorPrimary: "#E8A838", colorPrimaryHover: "#F0B94A", itemActiveBg: "#E8A83820" },
    Divider: { colorSplit: "#2E3148" },
    Empty: { colorTextDescription: "#5C6078" },
    Form: { labelColor: "#9499B0", labelFontSize: 13, itemMarginBottom: 20 },
    InputNumber: {
      colorBgContainer: "#141720",
      colorBorder: "#2E3148",
      activeBorderColor: "#E8A838",
      hoverBorderColor: "#E8A838",
      activeShadow: "0 0 0 2px rgba(232,168,56,0.15)",
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