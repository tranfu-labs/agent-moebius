import type { BrowserWindowConstructorOptions } from "electron";

export function integratedMainWindowOptions(
  platform: NodeJS.Platform,
): Pick<BrowserWindowConstructorOptions, "titleBarStyle" | "trafficLightPosition" | "backgroundColor"> {
  if (platform === "darwin") {
    return {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 16, y: 16 },
      backgroundColor: "#ffffff",
    };
  }

  return {
    backgroundColor: "#ffffff",
  };
}
