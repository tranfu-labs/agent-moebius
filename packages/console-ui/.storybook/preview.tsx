import type { Decorator, Preview } from "@storybook/react";
import { useEffect, type ReactNode } from "react";
import "../src/styles/globals.css";

const withTheme: Decorator = (Story, context) => {
  const theme = context.globals.theme as "light" | "dark" | undefined;

  return (
    <ThemeFrame theme={theme ?? "light"}>
      <Story />
    </ThemeFrame>
  );
};

function ThemeFrame({ children, theme }: { children: ReactNode; theme: "light" | "dark" }): JSX.Element {
  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
    return () => {
      document.documentElement.classList.remove("light", "dark");
    };
  }, [theme]);

  return (
    <div className="min-h-screen bg-canvas p-6 text-ink">
      {children}
    </div>
  );
}

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: "Theme",
      toolbar: {
        icon: "circlehollow",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" }
        ],
        dynamicTitle: true
      }
    }
  },
  initialGlobals: {
    theme: "light"
  },
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i
      }
    }
  }
};

export default preview;
