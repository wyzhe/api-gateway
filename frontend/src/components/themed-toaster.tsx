import { Toaster } from "sonner";
import { useTheme } from "@/lib/theme";

/** sonner Toaster that follows the active Relay theme. */
export function ThemedToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster
      theme={resolved}
      richColors
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "bg-surface-2 border border-border text-foreground",
        },
      }}
    />
  );
}
